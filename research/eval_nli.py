"""含意（ファクトチェック）モデルの評価。JAD-AFC などの (premise, hypothesis, label) jsonl で、正解率・マクロ F1・混同行列・遅延を出し results/ に追記する。

  python research/eval_nli.py --model models/nli-ja-30m-torch --data data/afc_test.jsonl --name nli-ja-30m
  python research/eval_nli.py --model sbintuitions/modernbert-ja-30m --data data/afc_test.jsonl --name modernbert-ja-30m-untrained
  python research/eval_nli.py --model sbintuitions/modernbert-ja-30m --data data/afc_test.jsonl --name modernbert-ja-30m-zeroshot   # 学習前（分類ヘッドが乱数＝偶然水準の基準）

ラベル順はモデルの id2label から entail/neutral/contra を探して揃える。
"""
import argparse, json, os, time
import torch
from transformers import AutoTokenizer, AutoModelForSequenceClassification


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--model", required=True); ap.add_argument("--data", required=True); ap.add_argument("--name"); ap.add_argument("--bs", type=int, default=32); ap.add_argument("--seq", type=int, default=512); ap.add_argument("--out", default="results/nli_eval.jsonl"); ap.add_argument("--note", default="")
    a = ap.parse_args(); name = a.name or os.path.basename(a.model.rstrip("/"))
    rows = [json.loads(l) for l in open(a.data, encoding="utf-8")]
    dev = "cuda" if torch.cuda.is_available() else "cpu"
    tok = AutoTokenizer.from_pretrained(a.model)
    from transformers import AutoConfig
    cfg = AutoConfig.from_pretrained(a.model)
    if getattr(cfg, "num_labels", 2) != 3 or len(getattr(cfg, "id2label", {}) or {}) != 3:
        # 学習前の土台（分類ヘッドなし）：3 クラスのヘッドを乱数で付ける＝偶然水準の基準。乱数は固定
        torch.manual_seed(0); m = AutoModelForSequenceClassification.from_pretrained(a.model, num_labels=3, id2label={0: "entailment", 1: "neutral", 2: "contradiction"}, label2id={"entailment": 0, "neutral": 1, "contradiction": 2})
    else:
        m = AutoModelForSequenceClassification.from_pretrained(a.model)
    m.to(dev).eval()
    id2 = {i: str(l).lower() for i, l in m.config.id2label.items()}
    try: order = [next(i for i, l in id2.items() if k in l) for k in ("entail", "neutral", "contra")]
    except StopIteration: order = [0, 1, 2]
    P = []; t0 = time.time()
    with torch.no_grad():
        for i in range(0, len(rows), a.bs):
            b = rows[i:i + a.bs]
            e = tok([r["premise"] for r in b], [r["hypothesis"] for r in b], padding=True, truncation=True, max_length=a.seq, return_tensors="pt").to(dev)
            P += torch.softmax(m(**e).logits.float(), -1)[:, order].cpu().tolist()
    ms = (time.time() - t0) / len(rows) * 1000
    y = [r["label"] for r in rows]; yh = [max(range(3), key=lambda k: p[k]) for p in P]
    conf = [[sum(1 for a_, b_ in zip(y, yh) if a_ == i and b_ == j) for j in range(3)] for i in range(3)]
    def f1(i):
        tp = conf[i][i]; fp = sum(conf[j][i] for j in range(3)) - tp; fn = sum(conf[i]) - tp
        p = tp / (tp + fp) if tp + fp else 0; r = tp / (tp + fn) if tp + fn else 0; return 2 * p * r / (p + r) if p + r else 0
    f1s = [round(f1(i), 4) for i in range(3)]; acc = sum(1 for a_, b_ in zip(y, yh) if a_ == b_) / len(y)
    # 2 値（True vs False、NEI を除く）も出す：ファクトチェックでは「正しい／誤り」の判別が主
    bi = [(a_, b_) for a_, b_ in zip(y, yh) if a_ != 1]; bacc = sum(1 for a_, b_ in bi if (a_ == 0) == (b_ == 0)) / max(1, len(bi))
    per_cat = {}
    for r, a_, b_ in zip(rows, y, yh):
        c = r.get("category", "-"); per_cat.setdefault(c, [0, 0]); per_cat[c][1] += 1; per_cat[c][0] += a_ == b_
    # 極性一貫性：同じ記事の表クレーム（True）と逆クレーム（False）の対で、両方とも正しく（＝逆向きに）判定できた割合（主張の向きを読めているか）
    by = {}
    for r, p in zip(rows, yh):
        if r.get("article") and r["label"] != 1: by.setdefault(r["article"], []).append((r["label"], p))
    pairs = [v for v in by.values() if len({l for l, _ in v}) == 2]
    pol = sum(1 for v in pairs if all(l == p for l, p in v)) / len(pairs) if pairs else None
    res = {"name": name, "model": a.model, "data": a.data, "n": len(rows), "acc": round(acc, 4), "polarity_pairs": len(pairs), "polarity_consistency": round(pol, 4) if pol is not None else None, "macro_f1": round(sum(f1s) / 3, 4), "f1_entail_neutral_contra": f1s, "binary_acc_true_false": round(bacc, 4), "confusion": conf, "per_category_acc": {k: round(v[0] / v[1], 3) for k, v in per_cat.items()}, "latency_ms": round(ms, 1), "device": dev, "note": a.note, "run_at": time.strftime("%Y-%m-%dT%H:%M")}
    os.makedirs(os.path.dirname(a.out), exist_ok=True)
    with open(a.out, "a", encoding="utf-8") as f: f.write(json.dumps(res, ensure_ascii=False) + "\n")
    print(json.dumps(res, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
