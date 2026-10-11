"""埋め込み型 FactCheck-BERT：対照学習（sentence-transformers, MultipleNegativesRankingLoss）。
pairs_stage2.jsonl の (anchor, positive, negative) で、客観文同士を近づけ、主観文を遠ざける。

  python research/finetune_embed.py --base cl-nagoya/ruri-v3-pt-30m --pairs data/pairs_stage2.jsonl --out /mnt/d/fcb/fcb-embed-30m

学習後：python research/eval_objectivity.py --model /mnt/d/fcb/fcb-embed-30m --name fcb-embed-30m
ONNX 化：python -m mbo.export_onnx --embed /mnt/d/fcb/fcb-embed-30m --out models/fcb-embed-30m
"""
import argparse, json, os, random
random.seed(0)


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--base", default="cl-nagoya/ruri-v3-pt-30m"); ap.add_argument("--pairs", default="data/pairs_stage2.jsonl"); ap.add_argument("--out", required=True)
    ap.add_argument("--epochs", type=int, default=1); ap.add_argument("--bs", type=int, default=64); ap.add_argument("--lr", type=float, default=2e-5); ap.add_argument("--seq", type=int, default=256); ap.add_argument("--max_pairs", type=int, default=40000); ap.add_argument("--prefix", default="auto")
    a = ap.parse_args()
    from sentence_transformers import SentenceTransformer, SentenceTransformerTrainer, SentenceTransformerTrainingArguments, losses
    from datasets import Dataset
    import torch
    pre = ("検索文書: " if "ruri" in a.base.lower() else "") if a.prefix == "auto" else a.prefix
    rows = [json.loads(l) for l in open(a.pairs, encoding="utf-8")]; random.shuffle(rows); rows = rows[:a.max_pairs]
    ds = Dataset.from_list([{"anchor": pre + r["anchor"], "positive": pre + r["positive"], "negative": pre + r["negative"]} for r in rows if r.get("negative")])
    m = SentenceTransformer(a.base); m.max_seq_length = a.seq
    args = SentenceTransformerTrainingArguments(output_dir=a.out, per_device_train_batch_size=a.bs, learning_rate=a.lr, num_train_epochs=a.epochs, warmup_ratio=0.1, bf16=torch.cuda.is_available() and torch.cuda.is_bf16_supported(), fp16=False, logging_steps=50, save_steps=500, save_total_limit=2, report_to=[], batch_sampler="no_duplicates")
    SentenceTransformerTrainer(model=m, args=args, train_dataset=ds, loss=losses.MultipleNegativesRankingLoss(m)).train()
    m.save(a.out); json.dump({"base": a.base, "pairs": a.pairs, "n": len(ds), "epochs": a.epochs, "bs": a.bs, "lr": a.lr, "seq": a.seq, "prefix": pre}, open(os.path.join(a.out, "summary.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("saved", a.out)


if __name__ == "__main__":
    main()
