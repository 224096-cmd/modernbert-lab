"""既存モデルの比較ベンチ（models/registry.json の候補をダウンロードして同じ指標で測る）。

  python -m mbo.bench --roles embed,nli --max-mb 600          # 600 MB 以下の候補を全部
  python -m mbo.bench --names ruri-v3-30m,mdeberta-xnli        # 名前指定
  python -m mbo.bench --names my-nli --local models/my-nli-torch --role nli   # 自分で微調整したモデル

指標
  embed : JSTS（文の類似度）Spearman、JNLI 含意 vs 矛盾の cos 差、1 文あたりの CPU 遅延、パラメータ数
  nli   : JNLI 正解率（テスト n 件）、含意再現率、ECE、1 組あたりの CPU 遅延
  base  : パラメータ数・サイズだけ（微調整は train_nli で行い、結果は --local で登録）
結果は docs/data/models.json に追記（サイトの「モデル比較」タブ）。torch + transformers が必要（requirements-train.txt）。
"""
import argparse, json, os, time, datetime, numpy as np, torch
from transformers import AutoTokenizer, AutoModel, AutoModelForSequenceClassification
from datasets import load_dataset

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_reg = json.load(open(os.path.join(ROOT, "models", "registry.json"), encoding="utf-8"))
REG = _reg.get("models") or (_reg.get("compare", []) + [m for m in _reg.get("browser", []) if m.get("hf")])
OUT = os.path.join(ROOT, "docs", "data", "models.json")


def spearman(a, b):
    ra, rb = np.argsort(np.argsort(a)), np.argsort(np.argsort(b))
    return float(np.corrcoef(ra, rb)[0, 1])


def mean_pool(h, m):
    m = m.unsqueeze(-1).to(h.dtype); return (h * m).sum(1) / m.sum(1).clamp(min=1e-6)


def bench_embed(src, n=600, prefix_q="", prefix_d=""):
    tok = AutoTokenizer.from_pretrained(src); m = AutoModel.from_pretrained(src).eval()
    cfg = m.config; pooling = "mean"
    try:
        pc = json.load(open(os.path.join(src if os.path.isdir(src) else __import__("huggingface_hub").snapshot_download(src, allow_patterns=["1_Pooling/*"]), "1_Pooling", "config.json")))
        pooling = "cls" if pc.get("pooling_mode_cls_token") else "mean"
    except Exception:
        pass

    def enc(texts, prefix=""):
        out = []
        with torch.no_grad():
            for i in range(0, len(texts), 16):
                e = tok([prefix + t for t in texts[i:i + 16]], padding=True, truncation=True, max_length=256, return_tensors="pt")
                h = m(**e).last_hidden_state
                v = h[:, 0] if pooling == "cls" else mean_pool(h, e["attention_mask"])
                out.append(torch.nn.functional.normalize(v, dim=-1))
        return torch.cat(out).numpy()
    sts = load_dataset("sbintuitions/JMTEB", "jsts", split="test").shuffle(seed=0).select(range(n))
    a, b = enc(sts["sentence1"]), enc(sts["sentence2"]); sp = spearman((a * b).sum(1), np.array(sts["label"]))
    nli = load_dataset("zenless-lab/jnli", split="test").shuffle(seed=0)
    ent = nli.filter(lambda x: x["label"] == 0).select(range(150)); con = nli.filter(lambda x: x["label"] == 2).select(range(150))
    ce = (enc(ent["premise"], prefix_q) * enc(ent["hypothesis"], prefix_d)).sum(1).mean(); cc = (enc(con["premise"], prefix_q) * enc(con["hypothesis"], prefix_d)).sum(1).mean()
    t = time.time(); enc(sts["sentence1"][:64]); lat = (time.time() - t) / 64 * 1000
    return {"jsts_spearman": round(sp, 4), "nli_cos_gap": round(float(ce - cc), 4), "latency_ms": round(lat, 1), "pooling": pooling, "hidden": getattr(cfg, "hidden_size", None), "max_len": getattr(cfg, "max_position_embeddings", None)}


def bench_nli(src, n=600):
    tok = AutoTokenizer.from_pretrained(src); m = AutoModelForSequenceClassification.from_pretrained(src).eval()
    id2 = {i: str(l).lower() for i, l in m.config.id2label.items()}
    order = [next(i for i, l in id2.items() if k in l) for k in ("entail", "neutral", "contra")]
    ds = load_dataset("zenless-lab/jnli", split="test").shuffle(seed=1).select(range(n)); y = np.array(ds["label"])
    P = []
    with torch.no_grad():
        for i in range(0, n, 16):
            e = tok(ds["premise"][i:i + 16], ds["hypothesis"][i:i + 16], padding=True, truncation=True, max_length=256, return_tensors="pt")
            P.append(torch.softmax(m(**e).logits, -1)[:, order].numpy())
    P = np.concatenate(P); pred = P.argmax(1)
    conf = [[int(((y == i) & (pred == j)).sum()) for j in range(3)] for i in range(3)]
    ece = 0.0; c = P.max(1); acc = (pred == y).astype(float)
    for k in range(10):
        msk = (c > k / 10) & (c <= (k + 1) / 10)
        if msk.any(): ece += msk.mean() * abs(acc[msk].mean() - c[msk].mean())
    t = time.time()
    with torch.no_grad():
        e = tok(ds["premise"][:32], ds["hypothesis"][:32], padding=True, truncation=True, max_length=256, return_tensors="pt"); m(**e)
    lat = (time.time() - t) / 32 * 1000
    return {"jnli_acc": round(float(acc.mean()), 4), "entail_recall": round(conf[0][0] / max(1, sum(conf[0])), 3), "contra_recall": round(conf[2][2] / max(1, sum(conf[2])), 3), "ece": round(float(ece), 4), "confusion": conf, "latency_ms": round(lat, 1)}


def params_of(src):
    try:
        m = AutoModel.from_pretrained(src); return round(sum(p.numel() for p in m.parameters()) / 1e6, 1)
    except Exception:
        return None


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--names"); ap.add_argument("--roles", default="embed,nli"); ap.add_argument("--max-mb", type=int, default=2000); ap.add_argument("--n", type=int, default=600)
    ap.add_argument("--local", help="ローカルの微調整済みモデル（--names と --role を併用）"); ap.add_argument("--role"); ap.add_argument("--note", default="")
    a = ap.parse_args()
    res = json.load(open(OUT, encoding="utf-8")) if os.path.exists(OUT) else {"results": []}
    todo = []
    if a.local:
        todo = [{"name": a.names, "hf": a.local, "role": a.role, "arch": "微調整（自作）", "note": a.note, "local": True}]
    else:
        names = set(a.names.split(",")) if a.names else None
        for r in REG:
            if names and r["name"] not in names: continue
            if not names and (r["role"] not in a.roles.split(",") or r.get("skip_default") or r["size_mb"] > a.max_mb): continue
            todo.append(r)
    for r in todo:
        src = r["hf"] or os.path.join(ROOT, "models", r["name"] + "-torch")
        print("==", r["name"], src, flush=True); t0 = time.time()
        try:
            if r["role"] == "embed":
                pre = ("検索クエリ: ", "検索文書: ") if "ruri-v3" in r["name"] else ("query: ", "passage: ") if "e5" in r["name"] else ("", "")
                m = bench_embed(src, a.n, *pre)
            elif r["role"] == "nli":
                m = bench_nli(src, a.n)
            else:
                m = {}
            m["params_m"] = params_of(src) or r.get("params_m"); m["ok"] = True
        except Exception as e:
            m = {"ok": False, "error": str(e)[:200]}
        m.update({"name": r["name"], "hf": r["hf"], "role": r["role"], "arch": r.get("arch"), "size_mb": r.get("size_mb"), "note": r.get("note", ""), "sec": round(time.time() - t0), "run_at": datetime.datetime.now().isoformat(timespec="minutes"), "device": "cuda" if torch.cuda.is_available() else "cpu"})
        res["results"] = [x for x in res["results"] if x["name"] != r["name"]] + [m]
        os.makedirs(os.path.dirname(OUT), exist_ok=True); json.dump(res, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        print(json.dumps(m, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
