"""ModernBERT 系モデルの推論（onnxruntime + tokenizers、torch 不要）。

  Embedder  cl-nagoya/ruri-v3-30m（ModernBERT-Ja 30M ベースの文埋め込み、Apache-2.0）
            encode(texts, kind="query"|"doc"|"topic"|"") -> np.ndarray [n,256]（L2 正規化済み）
  NLI       JNLI で微調整した ModernBERT-Ja 30M（このリポジトリで学習）
            predict(premises, hypotheses) -> np.ndarray [n,3]（含意・中立・矛盾の確率）
モデルの置き場所（優先順）: 環境変数 MBO_MODELS → ./models → Hugging Face（mie-edu/modernbert-osint-models）
"""
import os, json, numpy as np
from tokenizers import Tokenizer

HF_REPO = os.environ.get("MBO_HF_REPO", "mie-edu/modernbert-osint-models")
ROOT = os.environ.get("MBO_MODELS", os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "models"))


def _dir(name):
    d = os.path.join(ROOT, name)
    if os.path.exists(os.path.join(d, "model_int8.onnx")):
        return d
    from huggingface_hub import snapshot_download
    return snapshot_download(HF_REPO, allow_patterns=[f"{name}/*"]) + "/" + name


class _Onnx:
    def __init__(self, name, max_seq=256):
        import onnxruntime as ort
        d = _dir(name)
        self.meta = json.load(open(os.path.join(d, "meta.json")))
        self.tok = Tokenizer.from_file(os.path.join(d, "tokenizer.json"))
        self.tok.enable_truncation(max_seq)
        self.tok.no_padding()  # tokenizer.json 側のパディング設定を無効化（自前でパディングし attention_mask を作る）
        self.pad_id = self.tok.token_to_id("<pad>") if self.tok.token_to_id("<pad>") is not None else 0
        so = ort.SessionOptions(); so.intra_op_num_threads = max(1, os.cpu_count() or 1)
        self.sess = ort.InferenceSession(os.path.join(d, "model_int8.onnx"), so, providers=["CPUExecutionProvider"])
        self.max_seq = max_seq

    def _run(self, encs):
        L = max(len(e.ids) for e in encs)
        ids = np.full((len(encs), L), self.pad_id, dtype=np.int64); am = np.zeros((len(encs), L), dtype=np.int64)
        for i, e in enumerate(encs):
            ids[i, :len(e.ids)] = e.ids; am[i, :len(e.ids)] = 1
        return self.sess.run(None, {"input_ids": ids, "attention_mask": am})[0]

    def _batched(self, encs, bs):
        # 長さ順に並べてパディングを減らす
        order = sorted(range(len(encs)), key=lambda i: len(encs[i].ids))
        out = [None] * len(encs)
        for i in range(0, len(order), bs):
            idx = order[i:i + bs]
            y = self._run([encs[j] for j in idx])
            for k, j in enumerate(idx):
                out[j] = y[k]
        return np.stack(out) if out else np.zeros((0,))


class Embedder(_Onnx):
    PREFIX = {"query": "検索クエリ: ", "doc": "検索文書: ", "topic": "トピック: ", "": ""}

    def __init__(self, name=None, max_seq=512):
        name = name or os.environ.get("MBO_EMBED", "ruri-v3-30m")
        super().__init__(name, max_seq)

    def encode(self, texts, kind="", bs=16):
        if not texts:
            return np.zeros((0, 256), dtype=np.float32)
        encs = self.tok.encode_batch([self.PREFIX.get(kind, "") + (t or "") for t in texts])
        return self._batched(encs, bs).astype(np.float32)


class NLI(_Onnx):
    LABELS = ["entailment", "neutral", "contradiction"]

    def __init__(self, name=None, max_seq=256):
        name = name or os.environ.get("MBO_NLI", "nli-ja-30m")
        super().__init__(name, max_seq)
        self.T = float(self.meta.get("temperature", 1.0))

    def predict(self, premises, hypotheses, bs=16):
        if not premises:
            return np.zeros((0, 3), dtype=np.float32)
        encs = self.tok.encode_batch(list(zip(premises, hypotheses)))
        z = self._batched(encs, bs) / self.T
        z = z - z.max(-1, keepdims=True)
        p = np.exp(z); return (p / p.sum(-1, keepdims=True)).astype(np.float32)


class HFNLI:
    """Hugging Face の学習済み NLI モデル（torch）。MBO_NLI=hf:MoritzLaurer/mDeBERTa-v3-base-xnli-multilingual-nli-2mil7 のように指定。
    多言語 NLI（XNLI 270 万対）で学習されたモデルは、JNLI だけで微調整した小型モデルより実際の Web 文に強い（解説タブ参照）。"""
    LABELS = ["entailment", "neutral", "contradiction"]

    def __init__(self, hf_id, max_seq=256):
        import torch
        from transformers import AutoTokenizer, AutoModelForSequenceClassification
        self.torch = torch; self.tok = AutoTokenizer.from_pretrained(hf_id); self.m = AutoModelForSequenceClassification.from_pretrained(hf_id).eval()
        id2 = {i: str(l).lower() for i, l in self.m.config.id2label.items()}
        self.order = [next(i for i, l in id2.items() if k in l) for k in ("entail", "neutral", "contra")]
        self.max_seq = max_seq; self.meta = {"kind": "nli", "source": hf_id}; self.T = 1.0

    def predict(self, premises, hypotheses, bs=8):
        if not premises:
            return np.zeros((0, 3), dtype=np.float32)
        out = []
        with self.torch.no_grad():
            for i in range(0, len(premises), bs):
                e = self.tok(list(premises[i:i + bs]), list(hypotheses[i:i + bs]), padding=True, truncation=True, max_length=self.max_seq, return_tensors="pt")
                out.append(self.torch.softmax(self.m(**e).logits / self.T, -1)[:, self.order].numpy())
        return np.concatenate(out).astype(np.float32)


_cache = {}


def embedder():
    if "e" not in _cache:
        _cache["e"] = Embedder()
    return _cache["e"]


def nli():
    if "n" not in _cache:
        spec = os.environ.get("MBO_NLI", "nli-ja-30m")
        _cache["n"] = HFNLI(spec[3:]) if spec.startswith("hf:") else NLI(spec)
    return _cache["n"]


def zero_shot(texts, labels, emb=None):
    """埋め込みの類似度によるゼロショット分類（ラベル文とテキストの cos、softmax）。labels = {名前: 説明文}"""
    emb = emb or embedder()
    T = emb.encode(texts, "topic"); Lb = emb.encode(list(labels.values()), "topic")
    s = T @ Lb.T * 20
    s = s - s.max(-1, keepdims=True); p = np.exp(s); p /= p.sum(-1, keepdims=True)
    return [{k: float(v) for k, v in zip(labels.keys(), row)} for row in p]
