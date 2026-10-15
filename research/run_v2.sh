#!/usr/bin/env bash
# FactCheck-BERT 第2版の学習と検証（WSL2 Ubuntu、リポジトリ直下で実行。GPU で約 1 時間）
# 第1版との違い：
#  - 汎用 NLI に JSNLI（否定・言い換えが豊富）を 6 万対追加
#  - JAD-AFC は証拠説明文版と正当性説明文版の両方 ＋ 同じ記事の表/逆クレーム対（極性ペア）＋ 雑音つき前提（Web の段落を模す）= afc_train_aug.jsonl
#  - 入力長 384（雑音つき前提に合わせる）
#  - 評価に「雑音つきテスト」と「極性一貫性（表クレームと逆クレームで判定が逆になった割合）」を追加
set -e
OUT=${OUT:-$HOME/fcb}
mkdir -p "$OUT" results data
echo "== 0. 環境確認";   python research/env_check.py
echo "== 1. データ準備（JSNLI・拡張セットを含む）"
python research/prepare_data.py --out data
python research/data_report.py --data data --out results/data_report.md
echo "== 2. 既存モデルの基準（含意）"
for m in "MoritzLaurer/multilingual-MiniLMv2-L6-mnli-xnli minilm-l6-xnli" "sbintuitions/modernbert-ja-30m modernbert-ja-30m-untrained"; do
  set -- $m
  python research/eval_nli.py --model "$1" --name "$2" --data data/afc_test_rationale.jsonl --note "baseline v2" || true
  python research/eval_nli.py --model "$1" --name "$2-noisy" --data data/afc_test_noisy.jsonl --note "baseline v2 雑音つき" || true
done
echo "== 3. 既存モデルの基準（客観性）"
python research/eval_objectivity.py --model cl-nagoya/ruri-v3-pt-30m --note "baseline v2"
python research/eval_objectivity.py --model cl-nagoya/ruri-v3-pt-30m --note "baseline v2" --no_wiki
echo "== 4. 分類型 FactCheck-BERT 第2版（JNLI+JaNLI+JSICK+JSNLI と AFC 拡張セット）"
python research/finetune_nli.py --base sbintuitions/modernbert-ja-30m --train data/nli_train.jsonl data/afc_train_aug.jsonl --dev data/afc_dev_rationale.jsonl --out "$OUT/fcb-nli-30m" --epochs 3 --bs 32 --seq 384 --upweight 2
python research/finetune_nli.py --base sbintuitions/modernbert-ja-30m --train data/nli_train.jsonl --dev data/afc_dev_rationale.jsonl --out "$OUT/fcb-nli-30m-nlionly" --epochs 2 --seq 384   # 基準：汎用 NLI だけ
python research/finetune_nli.py --base sbintuitions/modernbert-ja-30m --train data/afc_train_aug.jsonl --dev data/afc_dev_rationale.jsonl --out "$OUT/fcb-nli-30m-afconly" --epochs 5 --seq 384 --upweight 1   # アブレーション：AFC 拡張だけ
echo "== 5. 学習後の評価（正当性版・雑音つき・証拠版）"
for d in fcb-nli-30m fcb-nli-30m-nlionly fcb-nli-30m-afconly; do
  python research/eval_nli.py --model "$OUT/$d" --name "$d" --data data/afc_test_rationale.jsonl --note "v2 finetuned"
  python research/eval_nli.py --model "$OUT/$d" --name "$d-noisy" --data data/afc_test_noisy.jsonl --note "v2 finetuned 雑音つき"
  python research/eval_nli.py --model "$OUT/$d" --name "$d-evidence" --data data/afc_test.jsonl --note "v2 finetuned 証拠説明文版（副）"
done
echo "== 6. 5 分割交差検証（主結果）"
for s in 1 2 3 4; do
  python research/prepare_data.py --out data_s$s --only afc,aug --seed $s
  python research/finetune_nli.py --base sbintuitions/modernbert-ja-30m --train data/nli_train.jsonl data_s$s/afc_train_aug.jsonl --dev data_s$s/afc_dev_rationale.jsonl --out "$OUT/cv$s" --epochs 3 --seq 384 --upweight 2 --seed $s
  python research/eval_nli.py --model "$OUT/cv$s" --name fcb-nli-30m-cv$s --data data_s$s/afc_test_rationale.jsonl --note "v2 cv"
  python research/eval_nli.py --model "$OUT/cv$s" --name fcb-nli-30m-cv$s-noisy --data data_s$s/afc_test_noisy.jsonl --note "v2 cv 雑音つき"
  python research/finetune_nli.py --base sbintuitions/modernbert-ja-30m --train data/nli_train.jsonl --dev data_s$s/afc_dev_rationale.jsonl --out "$OUT/cv${s}-nlionly" --epochs 2 --seq 384 --seed $s
  python research/eval_nli.py --model "$OUT/cv${s}-nlionly" --name fcb-nli-30m-nlionly-cv$s --data data_s$s/afc_test_rationale.jsonl --note "v2 cv"
done
echo "== 7. 埋め込み型 FactCheck-BERT（対照学習、第1版と同じ作り方）"
python research/finetune_embed.py --base cl-nagoya/ruri-v3-pt-30m --pairs data/pairs_stage2.jsonl --out "$OUT/fcb-embed-30m"
python research/eval_objectivity.py --model "$OUT/fcb-embed-30m" --name fcb-embed-30m --note "v2 finetuned"
python research/eval_objectivity.py --model "$OUT/fcb-embed-30m" --name fcb-embed-30m --note "v2 finetuned" --no_wiki
echo "== 8. ブラウザ用に変換"
rm -rf models/fcb-nli-30m models/fcb-embed-30m docs/models/fcb-nli-30m docs/models/fcb-embed-30m
python -m mbo.export_onnx --nli "$OUT/fcb-nli-30m" --out models/fcb-nli-30m && python -m mbo.calibrate --model models/fcb-nli-30m && cp "$OUT/fcb-nli-30m/summary.json" models/fcb-nli-30m/
python -m mbo.export_onnx --embed "$OUT/fcb-embed-30m" --out models/fcb-embed-30m
python scripts/fix_meta.py
echo "== 完了。results/nli_eval.jsonl / obj_eval.jsonl を表にして報告書へ（python research/data_report.py の実例も）"
