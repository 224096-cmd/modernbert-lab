#!/usr/bin/env bash
# 研究の一連の流れ（WSL2 Ubuntu、リポジトリ直下で実行）。OUT は保存先（外付け SSD なら /mnt/d/fcb など）
set -e
OUT=${OUT:-$HOME/fcb}
mkdir -p "$OUT" results data
echo "== 0. 環境確認";            python research/env_check.py
echo "== 1. データ準備";          python research/prepare_data.py --out data
echo "== 2. 既存モデルの基準（含意：JAD-AFC テスト）"
for m in "MoritzLaurer/multilingual-MiniLMv2-L6-mnli-xnli minilm-l6-xnli" "sbintuitions/modernbert-ja-30m modernbert-ja-30m-untrained"; do
  set -- $m; python research/eval_nli.py --model "$1" --name "$2" --data data/afc_test.jsonl --note "baseline" || true
done
echo "== 3. 既存モデルの基準（客観性）"
python research/eval_objectivity.py --model cl-nagoya/ruri-v3-pt-30m --note baseline
python research/eval_objectivity.py --model cl-nagoya/ruri-v3-pt-30m --note baseline --no_wiki
echo "== 4. 分類型 FactCheck-BERT の学習（JNLI+JaNLI+JSICK と AFC 訓練を混合、AFC は 3 倍）"
python research/finetune_nli.py --base sbintuitions/modernbert-ja-30m  --train data/nli_train.jsonl data/afc_train.jsonl --dev data/afc_dev.jsonl --out "$OUT/fcb-nli-30m"  --epochs 3 --bs 32 --seq 256
python research/finetune_nli.py --base sbintuitions/modernbert-ja-30m  --train data/afc_train.jsonl --dev data/afc_dev.jsonl --out "$OUT/fcb-nli-30m-afconly" --epochs 5 --upweight 1   # アブレーション：AFC だけ
python research/finetune_nli.py --base sbintuitions/modernbert-ja-30m  --train data/nli_train.jsonl --dev data/afc_dev.jsonl --out "$OUT/fcb-nli-30m-nlionly" --epochs 2             # 基準：汎用 NLI だけ（サイトの nli-ja-30m と同条件）
echo "== 4b. 5 分割交差検証（主結果）"
for s in 1 2 3 4; do
  python research/prepare_data.py --out data_s$s --only afc --seed $s
  python research/finetune_nli.py --base sbintuitions/modernbert-ja-30m --train data/nli_train.jsonl data_s$s/afc_train.jsonl --dev data_s$s/afc_dev.jsonl --out "$OUT/cv$s" --epochs 3 --seed $s
  python research/eval_nli.py --model "$OUT/cv$s" --name fcb-nli-30m-cv$s --data data_s$s/afc_test.jsonl --note cv
  python research/finetune_nli.py --base sbintuitions/modernbert-ja-30m --train data/nli_train.jsonl --dev data_s$s/afc_dev.jsonl --out "$OUT/cv${s}-nlionly" --epochs 2 --seed $s
  python research/eval_nli.py --model "$OUT/cv${s}-nlionly" --name fcb-nli-30m-nlionly-cv$s --data data_s$s/afc_test.jsonl --note cv
done
echo "== 5. 学習後の評価（同じテスト）"
for d in fcb-nli-30m-nlionly fcb-nli-30m-afconly fcb-nli-30m; do python research/eval_nli.py --model "$OUT/$d" --name "$d" --data data/afc_test.jsonl --note "finetuned"; done
echo "== 6. 埋め込み型 FactCheck-BERT（対照学習）と評価"
python research/finetune_embed.py --base cl-nagoya/ruri-v3-pt-30m --pairs data/pairs_stage2.jsonl --out "$OUT/fcb-embed-30m"
python research/eval_objectivity.py --model "$OUT/fcb-embed-30m" --name fcb-embed-30m --note "finetuned"
python research/eval_objectivity.py --model "$OUT/fcb-embed-30m" --name fcb-embed-30m --note "finetuned" --no_wiki
echo "== 7. ブラウザ用に変換（models/ に置くとサイトの『モデル』タブに並ぶ）"
python -m mbo.export_onnx --nli "$OUT/fcb-nli-30m" --out models/fcb-nli-30m && python -m mbo.calibrate --model models/fcb-nli-30m && cp "$OUT/fcb-nli-30m/summary.json" models/fcb-nli-30m/
python -m mbo.export_onnx --embed "$OUT/fcb-embed-30m" --out models/fcb-embed-30m
python scripts/fix_meta.py
echo "== 完了。results/*.jsonl を表にして論文へ"
