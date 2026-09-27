"""ONNX 化した含意モデルの精度・較正を測り、温度 T を meta.json に書く。

  python -m mbo.calibrate --model models/nli-ja-30m --n 800
出力: 正解率、混同行列、ECE（温度あり／なし）、T。結果は <model>/eval.json にも保存。
"""
import argparse, json, os, numpy as np
from datasets import load_dataset
from . import models


def ece(probs, labels, bins=10):
    conf = probs.max(1); pred = probs.argmax(1); acc = (pred == labels).astype(float); e = 0.0
    for i in range(bins):
        m = (conf > i / bins) & (conf <= (i + 1) / bins)
        if m.any():
            e += m.mean() * abs(acc[m].mean() - conf[m].mean())
    return float(e)


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--model", default="models/nli-ja-30m"); ap.add_argument("--n", type=int, default=800); a = ap.parse_args()
    os.environ["MBO_MODELS"] = os.path.dirname(os.path.abspath(a.model))
    m = models.NLI(os.path.basename(a.model)); m.T = 1.0
    ds = load_dataset("zenless-lab/jnli")["test"].shuffle(seed=1).select(range(a.n))
    encs = m.tok.encode_batch(list(zip(ds["premise"], ds["hypothesis"])))
    z = m._batched(encs, 16); y = np.array(ds["label"])
    def sm(z, T):
        q = z / T; q = q - q.max(1, keepdims=True); p = np.exp(q); return p / p.sum(1, keepdims=True)
    best = min(((-np.log(sm(z, T)[np.arange(len(y)), y] + 1e-9).mean(), T) for T in np.arange(0.5, 3.01, 0.05)))[1]
    p1, pT = sm(z, 1.0), sm(z, best); pred = p1.argmax(1)
    conf = [[int(((y == i) & (pred == j)).sum()) for j in range(3)] for i in range(3)]
    res = {"n": int(len(y)), "acc": float((pred == y).mean()), "confusion": conf, "ece_T1": ece(p1, y), "ece_T": ece(pT, y), "T": float(round(best, 2)), "labels": m.LABELS}
    print(json.dumps(res, ensure_ascii=False, indent=1))
    meta = json.load(open(os.path.join(a.model, "meta.json"))); meta["temperature"] = res["T"]; meta["eval"] = {k: res[k] for k in ("n", "acc", "ece_T1", "ece_T")}
    json.dump(meta, open(os.path.join(a.model, "meta.json"), "w"), ensure_ascii=False, indent=1)
    json.dump(res, open(os.path.join(a.model, "eval.json"), "w"), ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
