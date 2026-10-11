"""埋め込みモデルの「客観性」判別力を測る。obj_test.jsonl（客観=1 / 主観=0）に対して、
  (a) ゼロショット：ラベル文（「この文章は客観的な事実を報告している」「個人の感想や感情を述べている」）との類似差
  (b) 少数ショット：obj_train から各クラス 200 文の重心との類似差
で AUC と最良しきい値の正解率を出す。学習前の土台・学習後の FactCheck-BERT を同じ指標で比べる。

  python research/eval_objectivity.py --model cl-nagoya/ruri-v3-pt-30m --name ruri-v3-pt-30m
  python research/eval_objectivity.py --model /mnt/d/fcb/fcb-embed --name fcb-embed
"""
import argparse, json, os, time, random
import torch
from transformers import AutoTokenizer, AutoModel
random.seed(0)
LABEL_OBJ = "この文章は客観的な事実を報告している"; LABEL_SUB = "この文章は個人の感想や感情を述べている"


def embed(tok, m, texts, prefix, dev, bs=32, seq=256):
    out = []
    with torch.no_grad():
        for i in range(0, len(texts), bs):
            e = tok([prefix + t for t in texts[i:i + bs]], padding=True, truncation=True, max_length=seq, return_tensors="pt").to(dev)
            h = m(**e).last_hidden_state; mask = e["attention_mask"].unsqueeze(-1).to(h.dtype)
            v = (h * mask).sum(1) / mask.sum(1).clamp(min=1e-6); out.append(torch.nn.functional.normalize(v, dim=-1).float().cpu())
    return torch.cat(out)


def auc(scores, labels):
    pos = [s for s, l in zip(scores, labels) if l == 1]; neg = [s for s, l in zip(scores, labels) if l == 0]
    if not pos or not neg: return 0.5
    wins = sum(1 for p in pos for n in neg if p > n) + 0.5 * sum(1 for p in pos for n in neg if p == n); return wins / (len(pos) * len(neg))


def best_acc(scores, labels):
    order = sorted(zip(scores, labels)); best = 0
    for i in range(len(order) + 1):
        th = order[i][0] if i < len(order) else float("inf")
        acc = sum(1 for s, l in order if (s >= th) == (l == 1)) / len(order); best = max(best, acc)
    return best


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--model", required=True); ap.add_argument("--name"); ap.add_argument("--data", default="data/obj_test.jsonl"); ap.add_argument("--train", default="data/obj_train.jsonl"); ap.add_argument("--n", type=int, default=1500); ap.add_argument("--out", default="results/objectivity_eval.jsonl"); ap.add_argument("--note", default=""); ap.add_argument("--no_wiki", action="store_true", help="Wikipedia 由来の文を評価から除く（土台の事前学習に本文が含まれうるため、併記用）")
    a = ap.parse_args(); name = a.name or os.path.basename(a.model.rstrip("/"))
    dev = "cuda" if torch.cuda.is_available() else "cpu"; tok = AutoTokenizer.from_pretrained(a.model); m = AutoModel.from_pretrained(a.model).to(dev).eval()
    pre_doc, pre_q = ("検索文書: ", "検索クエリ: ") if "ruri" in a.model.lower() or "fcb" in a.model.lower() else ("passage: ", "query: ") if "e5" in a.model.lower() else ("", "")
    te = [json.loads(l) for l in open(a.data, encoding="utf-8")]
    if a.no_wiki: te = [r for r in te if r.get("src") != "wikipedia"]; name += "-nowiki"
    random.shuffle(te); te = te[:a.n]
    tr = [json.loads(l) for l in open(a.train, encoding="utf-8")] if os.path.exists(a.train) else []
    t0 = time.time(); X = embed(tok, m, [r["text"] for r in te], pre_doc, dev); y = [r["label"] for r in te]
    L = embed(tok, m, [LABEL_OBJ, LABEL_SUB], pre_q, dev); zs = (X @ L[0] - X @ L[1]).tolist()
    res = {"name": name, "model": a.model, "n": len(te), "zeroshot_auc": round(auc(zs, y), 4), "zeroshot_best_acc": round(best_acc(zs, y), 4), "sec": int(time.time() - t0), "device": dev, "note": a.note, "run_at": time.strftime("%Y-%m-%dT%H:%M")}
    if tr:
        random.shuffle(tr); pos = [r["text"] for r in tr if r["label"] == 1][:200]; neg = [r["text"] for r in tr if r["label"] == 0][:200]
        cp = embed(tok, m, pos, pre_doc, dev).mean(0); cn = embed(tok, m, neg, pre_doc, dev).mean(0); fs = (X @ cp - X @ cn).tolist()
        res["centroid_auc"] = round(auc(fs, y), 4); res["centroid_best_acc"] = round(best_acc(fs, y), 4)
    os.makedirs(os.path.dirname(a.out), exist_ok=True)
    with open(a.out, "a", encoding="utf-8") as f: f.write(json.dumps(res, ensure_ascii=False) + "\n")
    print(json.dumps(res, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
