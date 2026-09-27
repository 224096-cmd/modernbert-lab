"""JNLI（含意 / 中立 / 矛盾）で ModernBERT-Ja を微調整し、判定用 NLI モデルを作る。

  python -m mbo.train_nli --base sbintuitions/modernbert-ja-30m --n 8000 --epochs 2 --out models/nli-ja-30m

GPU（Colab T4）なら --n 20073（全件）--epochs 3 で 15 分程度。CPU でも --n 6000 なら 1〜2 時間。
出来上がった models/nli-ja-30m を `python -m mbo.export_onnx --nli models/nli-ja-30m` で ONNX(int8) にすると
GitHub Actions（onnxruntime）とブラウザ（onnxruntime-web）の両方で同じモデルが動く。
ラベル: 0=含意(entailment) 1=中立(neutral) 2=矛盾(contradiction)
"""
import argparse, json, os, random, time
import torch
from torch.utils.data import DataLoader
from transformers import AutoTokenizer, AutoModelForSequenceClassification, get_linear_schedule_with_warmup
from datasets import load_dataset

LABELS = ["entailment", "neutral", "contradiction"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="sbintuitions/modernbert-ja-30m")
    ap.add_argument("--n", type=int, default=8000)
    ap.add_argument("--epochs", type=int, default=2)
    ap.add_argument("--lr", type=float, default=5e-5)
    ap.add_argument("--bs", type=int, default=16)
    ap.add_argument("--seq", type=int, default=128)
    ap.add_argument("--eval_n", type=int, default=600)
    ap.add_argument("--out", default="models/nli-ja-30m")
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--balance", action="store_true", help="クラス頻度の逆数で損失を重み付け（含意が少ないので再現率を上げる）")
    ap.add_argument("--extra", help="追加の訓練データ jsonl（premise,hypothesis,label）。mbo.distill が作る Web 由来の対など")
    a = ap.parse_args()
    random.seed(a.seed); torch.manual_seed(a.seed)
    ds = load_dataset("zenless-lab/jnli")
    tr = ds["train"].shuffle(seed=a.seed).select(range(min(a.n, len(ds["train"]))))
    if a.extra:
        from datasets import Dataset, concatenate_datasets
        ex = [json.loads(l) for l in open(a.extra, encoding="utf-8")]
        ex = Dataset.from_list([{"premise": x["premise"], "hypothesis": x["hypothesis"], "label": int(x["label"])} for x in ex])
        tr = concatenate_datasets([tr.select_columns(["premise", "hypothesis", "label"]), ex]).shuffle(seed=a.seed); print("extra", len(ex), "total", len(tr))
    te = ds["test"].shuffle(seed=a.seed).select(range(min(a.eval_n, len(ds["test"]))))
    tok = AutoTokenizer.from_pretrained(a.base)
    model = AutoModelForSequenceClassification.from_pretrained(a.base, num_labels=3, id2label=dict(enumerate(LABELS)), label2id={l: i for i, l in enumerate(LABELS)})
    dev = "cuda" if torch.cuda.is_available() else "cpu"
    model.to(dev)

    def collate(rows):
        enc = tok([r["premise"] for r in rows], [r["hypothesis"] for r in rows], truncation=True, max_length=a.seq, padding=True, return_tensors="pt")
        enc["labels"] = torch.tensor([r["label"] for r in rows])
        return enc

    dl = DataLoader(tr, batch_size=a.bs, shuffle=True, collate_fn=collate)
    el = DataLoader(te, batch_size=32, collate_fn=collate)
    opt = torch.optim.AdamW(model.parameters(), lr=a.lr, weight_decay=0.01)
    total = len(dl) * a.epochs
    sch = get_linear_schedule_with_warmup(opt, int(total * 0.06), total)
    os.makedirs(a.out, exist_ok=True)
    log = open(os.path.join(a.out, "train_log.jsonl"), "w")
    t0 = time.time(); step = 0

    def evaluate():
        model.eval(); ok = n = 0; conf = [[0] * 3 for _ in range(3)]
        with torch.no_grad():
            for b in el:
                b = {k: v.to(dev) for k, v in b.items()}
                p = model(**b).logits.argmax(-1)
                for y, yh in zip(b["labels"].tolist(), p.tolist()):
                    conf[y][yh] += 1; ok += y == yh; n += 1
        model.train()
        return ok / n, conf

    cw = None
    if a.balance:
        cnt = torch.bincount(torch.tensor(tr["label"]), minlength=3).float()
        cw = (cnt.sum() / (3 * cnt)).to(dev); print("class weights", cw.tolist())
    model.train()
    for ep in range(a.epochs):
        for b in dl:
            b = {k: v.to(dev) for k, v in b.items()}
            out = model(**b)
            loss = torch.nn.functional.cross_entropy(out.logits, b["labels"], weight=cw) if cw is not None else out.loss
            loss.backward(); torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            opt.step(); sch.step(); opt.zero_grad(); step += 1
            if step % 20 == 0:
                rec = {"step": step, "epoch": ep, "loss": round(loss.item(), 4), "sec": round(time.time() - t0)}
                print(rec, flush=True); log.write(json.dumps(rec) + "\n"); log.flush()
        acc, conf = evaluate()
        rec = {"step": step, "epoch": ep, "eval_acc": round(acc, 4), "confusion": conf, "sec": round(time.time() - t0)}
        print(rec, flush=True); log.write(json.dumps(rec) + "\n"); log.flush()
        model.save_pretrained(a.out); tok.save_pretrained(a.out)
    json.dump({"base": a.base, "n_train": len(tr), "extra": a.extra, "epochs": a.epochs, "lr": a.lr, "seq": a.seq, "eval_n": len(te), "eval_acc": acc, "confusion": conf, "labels": LABELS, "sec": round(time.time() - t0)}, open(os.path.join(a.out, "summary.json"), "w"), ensure_ascii=False, indent=1)
    print("saved", a.out)


if __name__ == "__main__":
    main()
