"""自分のデータで独自 NLI モデルを作る（蒸留）。

自動収集した Web 本文（docs/data/topics/*.json）から「要旨 × 他ページの段落」の対を作り、教師モデル
（既定 mDeBERTa-v3-base-xnli、多言語 NLI 270 万対で学習）にラベルを付けさせ、JNLI と混ぜて小型 ModernBERT-Ja を微調整する。
JNLI（画像説明文）だけで学習したモデルはニュース・行政文に弱いので、実データで直すのがこの研究の中心。

  python -m mbo.distill --teacher MoritzLaurer/mDeBERTa-v3-base-xnli-multilingual-nli-2mil7 --pairs 3000 --out data/web_nli.jsonl
  python -m mbo.train_nli --extra data/web_nli.jsonl --n 6000 --epochs 2 --balance --out models/nli-ja-30m-web-torch
出力 jsonl: {premise, hypothesis, label, p:[e,n,c], src_url}
"""
import argparse, glob, json, os, random, numpy as np
from . import models, judge
from .fetch import split_passages
from .recon import host_of

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--teacher", default="MoritzLaurer/mDeBERTa-v3-base-xnli-multilingual-nli-2mil7"); ap.add_argument("--pairs", type=int, default=3000)
    ap.add_argument("--out", default="data/web_nli.jsonl"); ap.add_argument("--per_claim", type=int, default=8); ap.add_argument("--min_conf", type=float, default=0.7); a = ap.parse_args()
    random.seed(0)
    items = []
    for f in glob.glob(os.path.join(ROOT, "docs", "data", "topics", "*.json")):
        items += json.load(open(f, encoding="utf-8"))["items"]
    for f in glob.glob(os.path.join(ROOT, "docs", "data", "verify", "*.json")):
        v = json.load(open(f, encoding="utf-8")); items.append({"url": "claim://" + v["id"], "title": v["claim"], "text": v["claim"] + "。"})
    print("items", len(items))
    passages = []
    for it in items:
        for p in split_passages(it.get("text") or it.get("snippet") or "", max_chars=150)[:20]:
            if "|" in p or p.count("-") > 6:
                continue
            passages.append({"text": p, "domain": host_of(it["url"])})
    claims = [(judge.key_claim(it), host_of(it["url"])) for it in items]; claims = [c for c in claims if c[0]]
    print("claims", len(claims), "passages", len(passages))
    emb = models.embedder(); Q = emb.encode([c[0] for c in claims], "query"); D = emb.encode([p["text"] for p in passages], "doc"); S = Q @ D.T
    pairs = []
    for i, (c, dom) in enumerate(claims):
        idx = [int(j) for j in np.argsort(-S[i])[: a.per_claim * 2] if passages[j]["domain"] != dom][: a.per_claim]
        for j in idx:
            pairs.append((passages[j]["text"], c, float(S[i, j])))
    random.shuffle(pairs); pairs = pairs[: a.pairs]
    print("pairs", len(pairs))
    t = models.HFNLI(a.teacher)
    P = t.predict([p[0] for p in pairs], [p[1] for p in pairs])
    os.makedirs(os.path.dirname(os.path.join(ROOT, a.out)), exist_ok=True)
    n = [0, 0, 0]
    with open(os.path.join(ROOT, a.out), "w", encoding="utf-8") as f:
        for (pr, hy, sim), p in zip(pairs, P):
            lab = int(p.argmax())
            if p[lab] < a.min_conf:
                continue
            n[lab] += 1
            f.write(json.dumps({"premise": pr, "hypothesis": hy, "label": lab, "p": [round(float(x), 3) for x in p], "sim": round(sim, 3)}, ensure_ascii=False) + "\n")
    print("saved", a.out, "entail/neutral/contra =", n)


if __name__ == "__main__":
    main()
