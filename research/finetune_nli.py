"""分類型 FactCheck-BERT：土台モデルを (premise, hypothesis, label) で微調整する（GPU 向け。CPU でも動く）。

  python research/finetune_nli.py --base sbintuitions/modernbert-ja-30m --train data/nli_train.jsonl data/afc_train.jsonl --dev data/afc_dev.jsonl --out /mnt/d/fcb/fcb-nli-30m
  python research/finetune_nli.py --base sbintuitions/modernbert-ja-30m --train data/afc_train.jsonl --dev data/afc_dev.jsonl --out /mnt/d/fcb/fcb-nli-30m-afconly --epochs 5 --upweight 1

--train は複数指定でき、後ろのファイルは --upweight 倍に複製して混ぜる（AFC は小さいので 3 倍など）。
保存先に最良（dev 正解率）のモデル・tokenizer・summary.json を書く。ONNX 化は `python -m mbo.export_onnx --nli <out> --out models/<name>`。
"""
import argparse, json, os, random, time
import torch
from torch.utils.data import DataLoader
from transformers import AutoTokenizer, AutoModelForSequenceClassification, get_linear_schedule_with_warmup

LABELS = ["entailment", "neutral", "contradiction"]


def load(paths, upweight):
    rows = []
    for i, p in enumerate(paths):
        xs = [json.loads(l) for l in open(p, encoding="utf-8")]
        xs = [{"premise": x["premise"], "hypothesis": x["hypothesis"], "label": int(x["label"])} for x in xs]
        rows += xs * (upweight if i > 0 else 1); print(p, len(xs), "x", upweight if i > 0 else 1)
    random.shuffle(rows); return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="sbintuitions/modernbert-ja-30m"); ap.add_argument("--train", nargs="+", required=True); ap.add_argument("--dev", required=True); ap.add_argument("--out", required=True)
    ap.add_argument("--epochs", type=int, default=3); ap.add_argument("--lr", type=float, default=3e-5); ap.add_argument("--bs", type=int, default=32); ap.add_argument("--seq", type=int, default=256); ap.add_argument("--upweight", type=int, default=3); ap.add_argument("--seed", type=int, default=0); ap.add_argument("--balance", action="store_true"); ap.add_argument("--max_train", type=int, default=0); ap.add_argument("--label_smoothing", type=float, default=0.1)
    a = ap.parse_args(); random.seed(a.seed); torch.manual_seed(a.seed)
    tr = load(a.train, a.upweight); dv = load([a.dev], 1)
    if a.max_train: tr = tr[:a.max_train]
    dev = "cuda" if torch.cuda.is_available() else "cpu"; bf16 = dev == "cuda" and torch.cuda.is_bf16_supported()
    tok = AutoTokenizer.from_pretrained(a.base)
    model = AutoModelForSequenceClassification.from_pretrained(a.base, num_labels=3, id2label=dict(enumerate(LABELS)), label2id={l: i for i, l in enumerate(LABELS)}).to(dev)
    cnt = [sum(1 for r in tr if r["label"] == i) for i in range(3)]; wt = torch.tensor([len(tr) / (3 * max(1, c)) for c in cnt], device=dev) if a.balance else None
    print("device", dev, "bf16", bf16, "train", len(tr), "dev", len(dv), "class counts", cnt)
    coll = lambda rows: {**tok([r["premise"] for r in rows], [r["hypothesis"] for r in rows], truncation=True, max_length=a.seq, padding=True, return_tensors="pt"), "labels": torch.tensor([r["label"] for r in rows])}
    dl = DataLoader(tr, batch_size=a.bs, shuffle=True, collate_fn=coll); el = DataLoader(dv, batch_size=64, collate_fn=coll)
    opt = torch.optim.AdamW(model.parameters(), lr=a.lr, weight_decay=0.01); total = len(dl) * a.epochs; sch = get_linear_schedule_with_warmup(opt, int(total * 0.06), total)
    lossf = torch.nn.CrossEntropyLoss(weight=wt, label_smoothing=a.label_smoothing)
    os.makedirs(a.out, exist_ok=True); log = open(os.path.join(a.out, "train_log.jsonl"), "a"); t0 = time.time(); best = -1; step = 0

    def evaluate():
        model.eval(); conf = [[0] * 3 for _ in range(3)]
        with torch.no_grad():
            for b in el:
                b = {k: v.to(dev) for k, v in b.items()}
                with torch.autocast("cuda", dtype=torch.bfloat16, enabled=bf16): p = model(**b).logits.argmax(-1)
                for y, yh in zip(b["labels"].tolist(), p.tolist()): conf[y][yh] += 1
        model.train(); n = sum(map(sum, conf)); return sum(conf[i][i] for i in range(3)) / n, conf

    model.train()
    for ep in range(a.epochs):
        for b in dl:
            b = {k: v.to(dev) for k, v in b.items()}; labels = b.pop("labels")
            with torch.autocast("cuda", dtype=torch.bfloat16, enabled=bf16): logits = model(**b).logits
            loss = lossf(logits.float(), labels); loss.backward(); torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0); opt.step(); sch.step(); opt.zero_grad(); step += 1
            if step % 50 == 0: rec = {"step": step, "epoch": ep, "loss": round(loss.item(), 4), "sec": int(time.time() - t0)}; print(rec); log.write(json.dumps(rec) + "\n"); log.flush()
        acc, conf = evaluate(); rec = {"epoch": ep, "dev_acc": round(acc, 4), "confusion": conf, "sec": int(time.time() - t0)}; print(rec); log.write(json.dumps(rec) + "\n"); log.flush()
        if acc > best:
            best = acc; model.save_pretrained(a.out); tok.save_pretrained(a.out)
            json.dump({"base": a.base, "train": a.train, "dev": a.dev, "n_train": len(tr), "epochs": a.epochs, "best_epoch": ep, "lr": a.lr, "seq": a.seq, "bs": a.bs, "upweight": a.upweight, "balance": a.balance, "dev_acc": round(acc, 4), "confusion": conf, "labels": LABELS, "sec": int(time.time() - t0), "device": dev}, open(os.path.join(a.out, "summary.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
            print("saved", a.out)
    print("best dev acc", best)


if __name__ == "__main__":
    main()
