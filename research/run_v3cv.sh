#!/usr/bin/env bash
# 第3案 a の 5 分割交差検証と、ブラウザ用への変換（第2版として採用）
set -e
OUT=${OUT:-$HOME/fcb}
for s in 1 2 3 4; do
  python research/finetune_nli.py --base sbintuitions/modernbert-ja-30m --train data_nojs/nli_train.jsonl data_s$s/afc_train_aug.jsonl --dev data_s$s/afc_dev_rationale.jsonl --out "$OUT/v3a-cv$s" --epochs 3 --seq 384 --upweight 3 --seed $s
  python research/eval_nli.py --model "$OUT/v3a-cv$s" --name fcb-nli-30m-cv$s --data data_s$s/afc_test_rationale.jsonl --note "v3a cv"
  python research/eval_nli.py --model "$OUT/v3a-cv$s" --name fcb-nli-30m-cv$s-noisy --data data_s$s/afc_test_noisy.jsonl --note "v3a cv 雑音つき"
done
python research/eval_nli.py --model "$OUT/v3a" --name fcb-nli-30m-evidence --data data/afc_test.jsonl --note "v3a finetuned 証拠説明文版（副）"
echo "== 第3案 a（採用候補）"; python research/summarize_v2.py v3a
rm -rf "$OUT/fcb-nli-30m" && cp -r "$OUT/v3a" "$OUT/fcb-nli-30m"
rm -rf models/fcb-nli-30m docs/models/fcb-nli-30m
python -m mbo.export_onnx --nli "$OUT/fcb-nli-30m" --out models/fcb-nli-30m && python -m mbo.calibrate --model models/fcb-nli-30m && cp "$OUT/fcb-nli-30m/summary.json" models/fcb-nli-30m/
python scripts/fix_meta.py | tail -3
echo "== 完了"
