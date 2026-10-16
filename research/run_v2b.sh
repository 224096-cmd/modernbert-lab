#!/usr/bin/env bash
# 第2版 b：2 段階学習。1 段目＝汎用 NLI（JNLI+JaNLI+JSICK+JSNLI）で学習済みの *-nlionly、2 段目＝AFC 拡張セットだけを低い学習率で追加学習
set -e
OUT=${OUT:-$HOME/fcb}
python research/finetune_nli.py --base "$OUT/fcb-nli-30m-nlionly" --train data/afc_train_aug.jsonl --dev data/afc_dev_rationale.jsonl --out "$OUT/v2b" --epochs 4 --lr 2e-5 --seq 384 --upweight 1
python research/eval_nli.py --model "$OUT/v2b" --name fcb-nli-30m --data data/afc_test_rationale.jsonl --note "v2b finetuned"
python research/eval_nli.py --model "$OUT/v2b" --name fcb-nli-30m-noisy --data data/afc_test_noisy.jsonl --note "v2b finetuned 雑音つき"
python research/eval_nli.py --model "$OUT/v2b" --name fcb-nli-30m-evidence --data data/afc_test.jsonl --note "v2b finetuned 証拠説明文版（副）"
for s in 1 2 3 4; do
  python research/finetune_nli.py --base "$OUT/cv${s}-nlionly" --train data_s$s/afc_train_aug.jsonl --dev data_s$s/afc_dev_rationale.jsonl --out "$OUT/v2b-cv$s" --epochs 4 --lr 2e-5 --seq 384 --upweight 1 --seed $s
  python research/eval_nli.py --model "$OUT/v2b-cv$s" --name fcb-nli-30m-cv$s --data data_s$s/afc_test_rationale.jsonl --note "v2b cv"
  python research/eval_nli.py --model "$OUT/v2b-cv$s" --name fcb-nli-30m-cv$s-noisy --data data_s$s/afc_test_noisy.jsonl --note "v2b cv 雑音つき"
done
sed -i 's/startswith("v2r")/startswith(__import__("sys").argv[1] if len(__import__("sys").argv) > 1 else "v2r")/' research/summarize_v2.py
echo "== 第2版（1 段階）"; python research/summarize_v2.py v2r
echo "== 第2版 b（2 段階）"; python research/summarize_v2.py v2b
