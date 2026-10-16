#!/usr/bin/env bash
# 第3案：JSNLI なしの汎用 NLI（第1版と同じ）＋ AFC 拡張セット（3 倍）。a＝雑音つき込み・入力長 384、b＝極性ペアまで・入力長 256
set -e
OUT=${OUT:-$HOME/fcb}
python research/finetune_nli.py --base sbintuitions/modernbert-ja-30m --train data_nojs/nli_train.jsonl data/afc_train_aug.jsonl --dev data/afc_dev_rationale.jsonl --out "$OUT/v3a" --epochs 3 --seq 384 --upweight 3
python research/eval_nli.py --model "$OUT/v3a" --name fcb-nli-30m --data data/afc_test_rationale.jsonl --note "v3a finetuned"
python research/eval_nli.py --model "$OUT/v3a" --name fcb-nli-30m-noisy --data data/afc_test_noisy.jsonl --note "v3a finetuned 雑音つき"
python research/finetune_nli.py --base sbintuitions/modernbert-ja-30m --train data_nojs/nli_train.jsonl data/afc_train_polonly.jsonl --dev data/afc_dev_rationale.jsonl --out "$OUT/v3b" --epochs 3 --seq 256 --upweight 3
python research/eval_nli.py --model "$OUT/v3b" --name fcb-nli-30m --data data/afc_test_rationale.jsonl --note "v3b finetuned"
python research/eval_nli.py --model "$OUT/v3b" --name fcb-nli-30m-noisy --data data/afc_test_noisy.jsonl --note "v3b finetuned 雑音つき"
echo "== 第3案 a（雑音つき込み・384）"; python research/summarize_v2.py v3a
echo "== 第3案 b（極性ペアまで・256）"; python research/summarize_v2.py v3b
