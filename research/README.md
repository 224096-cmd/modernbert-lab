# research/ — FactCheck-BERT の学習・評価（WSL2 + GPU）

研究の流れ：**既存モデルの精度を測る → 公開データで微調整 → 同じ指標で測り直して向上を示す**。すべて無料公開データ・API キー不要。

| スクリプト | 役割 |
| --- | --- |
| `env_check.py` | GPU・ライブラリ・1 ステップ学習の確認 |
| `prepare_data.py` | 学習・評価データを `data/` に作る（下表。出どころ・使い方・漏れ防止の詳細は [DATASETS.md](DATASETS.md)） |
| `data_report.py` | データの量・ラベル分布・train/test の重複点検・実例を `results/data_report.md` に書く |
| `eval_nli.py` | 含意（ファクトチェック）モデルの評価：正解率・マクロ F1・True/False 2 値正解率・カテゴリ別・遅延 → `results/nli_eval.jsonl` |
| `eval_objectivity.py` | 埋め込みモデルの客観性判別：ゼロショット AUC・重心 AUC → `results/objectivity_eval.jsonl`。`--no_wiki` で Wikipedia 文を除いた数値（土台の事前学習に本文が含まれうるため併記） |
| `finetune_nli.py` | 分類型 FactCheck-BERT の微調整（複数データの混合、クラス重み、bf16） |
| `finetune_embed.py` | 埋め込み型 FactCheck-BERT の対照学習（sentence-transformers） |
| `run_all.sh` | 上を順に実行（基準 → 学習 → 評価 → ONNX 化） |

## データ（`prepare_data.py` が作る）

| ファイル | 元データ | ライセンス | 用途 |
| --- | --- | --- | --- |
| `afc_*_rationale.jsonl` | **JAD-AFC**（Fujitsu Research）— 日本ファクトチェックセンターの検証記事 258 本から作られた 612 の主張・証拠・真偽（True 306 / False 284 / NEI 22、逆クレームで均衡） | Apache-2.0（研究目的） | **主評価**：premise=正当性説明文（検証者の判断理由）、hypothesis=主張、label=含意/中立/矛盾。記事単位で 70/15/15 分割 |
| `afc_{train,dev,test}.jsonl` | 同上（前提を証拠説明文に） | 同上 | 副：証拠説明文は主張と同一文のことが多く（612 件中 243 件）易しいので併記のみ |
| `nli_{train,dev}.jsonl` | JNLI（JGLUE）＋ JaNLI ＋ JSICK | CC BY-SA 4.0 | 汎用の含意データ。AFC と混ぜて学習 |
| `obj_{train,test}.jsonl` | 客観：livedoor ニュース（CC BY-ND 2.1）・Wikipedia（CC BY-SA）／主観：WRIME ver.2（研究利用可） | 各ライセンス | 客観性の評価・対照学習の正例/負例。記事・投稿者単位で分割 |
| `pairs_stage2.jsonl` | livedoor の隣接段落（正例）＋ JSTS 高類似ペア（正例）＋ WRIME（負例） | 同上 | 対照学習 |
| `livedoor.jsonl` / `wiki.jsonl` | 本文 | 同上 | DAPT（任意） |

使うのは上の表のものだけ（論文として成り立つ最小構成）。

## 評価指標の読み方

- `acc`：3 値（含意／中立／矛盾）の正解率。AFC は NEI が 4% しかないので `binary_acc_true_false`（NEI を除いた True/False の正解率）も見る
- `macro_f1`：クラス不均衡の影響を抑えた指標
- `per_category_acc`：政治／国際／医療・健康／災害ごと
- 学習前の基準として「素の土台（分類ヘッドが乱数）」も測る＝偶然水準

## 予備実験の参考値（CPU、afc_test 88 件＝証拠説明文版。主評価の正当性説明文版は GPU 本実験で測る）

| モデル | acc | macro F1 | True/False 2 値 |
| --- | --- | --- | --- |
| nli-ja-30m（JNLI のみで学習） | 0.352 | 0.178 | 0.460 |
| multilingual-MiniLMv2-L6 xnli（海外の定番） | 0.671 | 0.479 | 0.828 |
| modernbert-ja-30m を **AFC 訓練 434 件だけ**で 2 エポック（CPU 1 分） | **0.807** | 0.540 | 0.816 |

（サイト同梱の nli-ja-30m/70m の torch 重みはリポジトリに含めていないので、`run_all.sh` では同条件の「汎用 NLI だけ」モデル `fcb-nli-30m-nlionly` を学習して基準にする。）JNLI（画像説明文）だけの学習ではファクトチェック文に転移せず、ファクトチェック由来のデータを少量混ぜるだけで大きく改善する——これが研究の中心的な主張になる。テスト 88 件は小さいので、論文では 5 分割交差検証（`--seed` を変えて記事分割を 5 通り）で平均±標準偏差を出す。
