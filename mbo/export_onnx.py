"""ModernBERT 系モデルを ONNX（int8 動的量子化）に変換する。GitHub Actions（onnxruntime）とブラウザ（onnxruntime-web）で共用。

  python -m mbo.export_onnx --embed cl-nagoya/ruri-v3-30m --out models/ruri-v3-30m
  python -m mbo.export_onnx --nli models/nli-ja-30m --out models/nli-ja-30m-onnx

出力: model.onnx（fp32）, model_int8.onnx, tokenizer.json, config.json, meta.json
"""
import argparse, json, os, shutil
import torch
from transformers import AutoTokenizer, AutoModel, AutoModelForSequenceClassification


class EmbedWrap(torch.nn.Module):
    def __init__(self, m):
        super().__init__(); self.m = m

    def forward(self, input_ids, attention_mask):
        h = self.m(input_ids=input_ids, attention_mask=attention_mask).last_hidden_state
        mask = attention_mask.unsqueeze(-1).to(h.dtype)
        emb = (h * mask).sum(1) / mask.sum(1).clamp(min=1e-6)
        return torch.nn.functional.normalize(emb, dim=-1)


class ClsPoolWrap(torch.nn.Module):
    """CLS プーリングの埋め込み（e5 は mean、Ruri は mean。cls を使うモデル用）"""
    def __init__(self, m):
        super().__init__(); self.m = m

    def forward(self, input_ids, attention_mask):
        h = self.m(input_ids=input_ids, attention_mask=attention_mask).last_hidden_state[:, 0]
        return torch.nn.functional.normalize(h, dim=-1)


class ClsWrap(torch.nn.Module):
    def __init__(self, m):
        super().__init__(); self.m = m

    def forward(self, input_ids, attention_mask):
        return self.m(input_ids=input_ids, attention_mask=attention_mask).logits


def quantize_embeddings(path, min_rows=5000):
    """大きな行列（語彙埋め込みなど）を行ごとの int8 + DequantizeLinear に置き換える。30M モデルの 100MB → 30MB。"""
    import onnx, numpy as np
    from onnx import numpy_helper, helper, TensorProto
    m = onnx.load(path)
    g = m.graph
    new_inits, new_nodes, n_done = [], [], 0
    for init in list(g.initializer):
        arr = numpy_helper.to_array(init)
        if arr.dtype != np.float32 or arr.ndim != 2 or arr.shape[0] < min_rows:
            continue
        scale = np.abs(arr).max(axis=1, keepdims=True) / 127.0
        scale[scale == 0] = 1.0
        q = np.clip(np.round(arr / scale), -127, 127).astype(np.int8)
        name = init.name
        g.initializer.remove(init)
        new_inits.append(numpy_helper.from_array(q, name + "_q8"))
        new_inits.append(numpy_helper.from_array(scale.reshape(-1).astype(np.float32), name + "_scale"))
        new_inits.append(numpy_helper.from_array(np.zeros(arr.shape[0], dtype=np.int8), name + "_zp"))
        new_nodes.append(helper.make_node("DequantizeLinear", [name + "_q8", name + "_scale", name + "_zp"], [name], axis=0, name=name + "_dq"))
        n_done += 1
    g.initializer.extend(new_inits)
    for nd in reversed(new_nodes):
        g.node.insert(0, nd)
    onnx.save(m, path)
    print("int8 embeddings:", n_done)


def _gather_nodes(model, min_rows):
    from onnx import numpy_helper
    inits = {t.name: t for t in model.graph.initializer}
    for node in model.graph.node:
        if node.op_type == "Gather" and node.input[0] in inits:
            t = inits[node.input[0]]
            if len(t.dims) == 2 and t.dims[0] >= min_rows:
                yield node, t


def prune_vocab(path, keep_ids, unk_id, min_rows=20000):
    """語彙埋め込み W[V,d] を keep_ids の行だけにし、id → 行 の対応表 Gather を挟む（tokenizer はそのまま使える）。250k 語彙の多言語モデル向け"""
    import onnx, numpy as np
    from onnx import numpy_helper, helper
    model = onnx.load(path); keep = sorted(set(int(i) for i in keep_ids) | {int(unk_id)})
    for node, t in list(_gather_nodes(model, min_rows)):
        W = numpy_helper.to_array(t); V = W.shape[0]; rows = [i for i in keep if i < V]; pos = {i: r for r, i in enumerate(rows)}
        m = np.full(V, pos[int(unk_id)], dtype=np.int32); m[rows] = np.arange(len(rows), dtype=np.int32)
        model.graph.initializer.remove(t); model.graph.initializer.append(numpy_helper.from_array(np.ascontiguousarray(W[rows]), t.name)); model.graph.initializer.append(numpy_helper.from_array(m, t.name + "_map"))
        ids = node.input[1]; node.input[1] = t.name + "_rowid"
        idx = list(model.graph.node).index(node); model.graph.node.insert(idx, helper.make_node("Gather", [t.name + "_map", ids], [t.name + "_rowid"], axis=0))
        print(f"語彙を間引き: {t.name} {V} → {len(rows)} 行")
    onnx.save(model, path)


def keep_ids_from_corpus(tok, texts, always=range(0, 32)):
    keep = set(always)
    for i in range(0, len(texts), 256):
        for e in tok(texts[i:i + 256], add_special_tokens=True)["input_ids"]:
            keep.update(e)
    return keep


def corpus_texts(max_ja=20000, max_en=6000):
    """語彙の間引きに使う文：日本語（Wikipedia＋ニュース）と英語（公開データ）。無ければ JNLI/JSTS だけ"""
    texts = []
    local = os.environ.get("MBO_CORPUS", "")
    if local and os.path.exists(local):
        import json as _j
        for i, line in enumerate(open(local, encoding="utf-8")):
            if i >= max_ja: break
            texts.append(_j.loads(line).get("text", "")[:2000])
    else:
        try:  # Wikipedia 日本語をストリーミングで（CC BY-SA、語彙の集計にだけ使う）
            from datasets import load_dataset
            ds = load_dataset("wikimedia/wikipedia", "20231101.ja", split="train", streaming=True)
            for i, row in enumerate(ds):
                if i >= max_ja: break
                texts.append(row["text"][:2000])
        except Exception as e:
            print("wikipedia:", e)
    try:
        from datasets import load_dataset
        d = load_dataset("zenless-lab/jnli", split="train"); texts += d["premise"][:8000] + d["hypothesis"][:8000]
        d = load_dataset("sbintuitions/JMTEB", "jsts", split="test"); texts += d["sentence1"] + d["sentence2"]
        d = load_dataset("copenlu/fever_gold_evidence", split="train"); texts += [x for x in d["claim"][:max_en]] + [" ".join(str(e) for e in ev) for ev in d["evidence"][:max_en // 2]]
    except Exception as e:
        print("corpus:", e)
    return texts


def export(src, out, kind, seq=256, pooling="mean", prune=False, quant="all"):
    os.makedirs(out, exist_ok=True)
    tok = AutoTokenizer.from_pretrained(src)
    if kind == "embed":
        m = AutoModel.from_pretrained(src, attn_implementation="eager"); w = EmbedWrap(m) if pooling == "mean" else ClsPoolWrap(m); outname = "embedding"
    else:
        m = AutoModelForSequenceClassification.from_pretrained(src, attn_implementation="eager"); w = ClsWrap(m); outname = "logits"
    m.eval()
    enc = tok(["東京は日本の首都である。", "ModernBERT は長い文脈を速く読める双方向のエンコーダである。"], padding=True, return_tensors="pt")
    with torch.no_grad():
        ref = w(enc["input_ids"], enc["attention_mask"])
    torch.onnx.export(w, (enc["input_ids"], enc["attention_mask"]), os.path.join(out, "model.onnx"), input_names=["input_ids", "attention_mask"], output_names=[outname],
                      dynamic_axes={"input_ids": {0: "b", 1: "s"}, "attention_mask": {0: "b", 1: "s"}, outname: {0: "b"}}, opset_version=17, do_constant_folding=True, dynamo=False)
    from onnxruntime.quantization import quantize_dynamic, QuantType
    import onnx
    g = onnx.load(os.path.join(out, "model.onnx")).graph
    excl = [n.name for n in g.node if n.op_type == "MatMul" and ("head" in n.name or "classifier" in n.name or "pooler" in n.name)]  # 分類ヘッドは int8 にすると logits が崩れるので除外
    if quant == "mlp":  # 注意機構は fp32 のまま、MLP だけ int8（小さい多言語モデルは注意の量子化に弱い）
        excl += [n.name for n in g.node if n.op_type == "MatMul" and "/mlp/" not in n.name and "intermediate" not in n.name and "output/dense" not in n.name]
    if quant == "none":
        import shutil; shutil.copy(os.path.join(out, "model.onnx"), os.path.join(out, "model_int8.onnx"))
    else:
        quantize_dynamic(os.path.join(out, "model.onnx"), os.path.join(out, "model_int8.onnx"), weight_type=QuantType.QInt8, op_types_to_quantize=["MatMul"], per_channel=True, nodes_to_exclude=excl)
    if prune:
        keep = keep_ids_from_corpus(tok, corpus_texts()); print("残す語彙:", len(keep))
        prune_vocab(os.path.join(out, "model_int8.onnx"), keep, tok.unk_token_id if tok.unk_token_id is not None else 3)
    quantize_embeddings(os.path.join(out, "model_int8.onnx"))
    import onnxruntime as ort, numpy as np
    for f in ("model.onnx", "model_int8.onnx"):
        s = ort.InferenceSession(os.path.join(out, f), providers=["CPUExecutionProvider"])
        y = s.run(None, {"input_ids": enc["input_ids"].numpy(), "attention_mask": enc["attention_mask"].numpy()})[0]
        print(f, os.path.getsize(os.path.join(out, f)) // 1024, "KB  max|diff| vs torch:", float(np.abs(y - ref.numpy()).max()))
    tok.save_pretrained(out)
    for f in ("config.json",):
        try:
            m.config.to_json_file(os.path.join(out, f))
        except Exception:
            pass
    meta = {"kind": kind, "source": src, "output": outname, "pooling": (pooling + "+l2norm") if kind == "embed" else "cls", "pruned_vocab": bool(prune), "quant": quant,
            "pad_id": tok.pad_token_id, "n_labels": (getattr(m.config, "num_labels", None) if kind != "embed" else None),
            "labels": getattr(m.config, "id2label", None) if kind != "embed" else None, "max_seq": seq,
            "prefixes": {"query": "検索クエリ: ", "doc": "検索文書: ", "topic": "トピック: "} if kind == "embed" else None}
    json.dump(meta, open(os.path.join(out, "meta.json"), "w"), ensure_ascii=False, indent=1)
    os.remove(os.path.join(out, "model.onnx"))  # fp32 は大きい（100MB 超）ので int8 だけ残す
    print("done", out, os.listdir(out))


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--embed"); ap.add_argument("--nli"); ap.add_argument("--rerank"); ap.add_argument("--out", required=True)
    ap.add_argument("--pooling", default="mean"); ap.add_argument("--prune", action="store_true", help="語彙埋め込みを日本語＋英語で使う分だけに間引く（250k 語彙の多言語モデル向け）")
    ap.add_argument("--quant", default="all", choices=["all", "mlp", "none"], help="MatMul の int8 化：all=全部 / mlp=MLP だけ / none=しない（埋め込みは常に int8）")
    a = ap.parse_args()
    if a.embed:
        export(a.embed, a.out, "embed", pooling=a.pooling, prune=a.prune, quant=a.quant)
    if a.nli:
        export(a.nli, a.out, "nli", prune=a.prune, quant=a.quant)
    if a.rerank:
        export(a.rerank, a.out, "rerank", prune=a.prune, quant=a.quant)
