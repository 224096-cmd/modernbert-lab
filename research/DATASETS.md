# 使用データセット一覧（出どころ・ライセンス・使い方・漏れ防止）

`python research/prepare_data.py --out data` が下のすべてを自動取得して `data/*.jsonl` を作る。実際に作られた件数・ラベル分布・train/test の重複点検・実例は `python research/data_report.py` が `results/data_report.md` に書く（リポジトリの [results/data_report.md](../results/data_report.md) に最新版を置く）。

## 一覧

| # | データ | 出どころ（ダウンロード元） | ライセンス | 何に使うか | 作られるファイル |
| --- | --- | --- | --- | --- | --- |
| 1 | **JAD-AFC**（Japanese Dataset for Automated Fact-Checking） | https://github.com/FujitsuResearch/japanese-dataset-for-automated-fact-checking （`data/japanese-dataset-for-automated-fact-checking.csv`） | Apache-2.0（研究目的） | **主評価と微調整**。日本ファクトチェックセンターの検証記事 258 本から作られた 612 件の「主張（クレーム）・証拠説明文・正当性説明文・真偽（True/False/NEI）」。True 306・False 284・NEI 22。各記事に表クレームと逆クレーム（否定形）が対で入る | `afc_{train,dev,test}.jsonl`（前提＝証拠説明文）、`afc_{train,dev,test}_rationale.jsonl`（前提＝正当性説明文、**主評価**） |
| 2 | **JNLI**（JGLUE） | https://huggingface.co/datasets/zenless-lab/jnli （原典 https://github.com/yahoojapan/JGLUE） | CC BY-SA 4.0 | 汎用の含意データ。AFC と混ぜて分類型を学習。公式 train → `nli_train`、公式 test → `nli_dev` | `nli_train.jsonl`、`nli_dev.jsonl` |
| 3 | **JaNLI** | https://github.com/verypluming/JaNLI （`janli.tsv`） | CC BY-SA 4.0 | 同上（entailment / non-entailment の 2 値。non-entailment は中立として扱う） | 同上 |
| 4 | **JSICK** | https://github.com/verypluming/JSICK （`jsick/jsick.tsv`） | CC BY-SA 4.0 | 同上（3 値） | 同上 |
| 5 | **JSTS**（JGLUE） | https://huggingface.co/datasets/zenless-lab/jsts | CC BY-SA 4.0 | 埋め込み型の対照学習の正例（類似度 4.0 以上の文対、train 分割のみ）。汎用性能の確認は JMTEB の test 分割（`python -m mbo.bench`）で行い、学習に使った分割とは重ならない | `pairs_stage2.jsonl` の一部 |
| 6 | **livedoor ニュースコーパス** | https://www.rondhuit.com/download.html#ldcc （`ldcc-20140209.tar.gz`） | CC BY-ND 2.1 | 客観文の正例（記事本文の段落、各記事 3 段落まで）。対照学習の anchor/positive（隣接段落） | `livedoor.jsonl`、`obj_*.jsonl`、`pairs_stage2.jsonl` |
| 7 | **Wikipedia 日本語**（20231101.ja） | https://huggingface.co/datasets/wikimedia/wikipedia （ストリーミングで先頭 5,000 記事だけ） | CC BY-SA 4.0 | 客観文の正例（各記事 2 段落まで）。土台の事前学習に本文が含まれうるので、客観性の評価は Wikipedia を除いた数値（`--no_wiki`）も併記 | `wiki.jsonl`、`obj_*.jsonl` |
| 8 | **WRIME ver.2** | https://github.com/ids-cv/wrime （`wrime-ver2.tsv`） | 研究目的での利用可 | 主観文の負例（SNS 投稿、感情ラベル付き）。対照学習の negative | `obj_*.jsonl`、`pairs_stage2.jsonl` |

学習データ（`data/`）はリポジトリに置かない（`.gitignore`）。上の URL から誰でも同じものを再取得できる。

## どう使うか（モデルごと）

**分類型 FactCheck-BERT（含意：主張 × 前提 → 一致／矛盾／無関係）**

- 学習：`nli_train.jsonl`（JNLI＋JaNLI＋JSICK の公式 train、約 3.8 万対）＋ `afc_train_rationale.jsonl`（434 件を 3 倍に複製して重みづけ）
- エポック選び：`afc_dev_rationale.jsonl`（90 件）
- 報告：`afc_test_rationale.jsonl`（88 件）。副として `afc_test.jsonl`（証拠説明文版）も併記
- JAD-AFC の 2 つの前提文：
  - **正当性説明文**（主評価）：JFC の検証者が書いた判断理由の文（中央値 94 字）。表クレームと逆クレームで同じ文が前提になることが多く、主張の向きを読んで判定する必要がある。主張との文字列類似度は中央値 0.28
  - **証拠説明文**（副）：612 件中 243 件が主張と**同一文**（True の正例は中央値で類似度 1.0）。文字の一致だけで解ける部分が多いので、主評価には使わない
- ラベル：True → 含意(0)、NEI → 中立(1)、False → 矛盾(2)。NEI は 22 件しかないので True/False 2 値正解率を主指標の 1 つにする

**埋め込み型 FactCheck-BERT（客観性・関連度）**

- 学習：`pairs_stage2.jsonl`（anchor/positive ＝ train 側の livedoor 記事の隣接段落、または JSTS train の高類似文対。negative ＝ `obj_train` の WRIME 文）
- 報告：`obj_test.jsonl`（客観 1 ／ 主観 0、各クラス同数）で AUC。ゼロショット（ラベル文との類似）と重心（`obj_train` の各クラス 200 文の平均ベクトルとの類似）の 2 通り

## 漏れ（リーク）を防ぐ決まり

| 懸念 | 対策（`prepare_data.py` の実装） | 点検（`data_report.py`） |
| --- | --- | --- |
| JAD-AFC は同じ記事から表クレームと逆クレームが対で作られる。文単位で分割すると片方が train・片方が test に入り、答えが漏れる | **記事 URL 単位**で 70/15/15 に分割（`--seed` で分け方を変え、交差検証では 0〜4） | train と test で同じ記事・同じ主張文・同じ証拠文が 0 件であることを表示 |
| 汎用 NLI の train と評価の重複 | 各データの公式 train だけを学習に、公式 test/valid を `nli_dev` に | 同じ（前提, 仮説）対が 0 件。JAD-AFC test の主張文が汎用 NLI train に入っていないこと |
| 客観/主観の同じ記事の段落・同じ投稿者の文が train と test に分かれる | **記事 URL・投稿者 ID のハッシュ**で分割（乱数に依存しない） | 同じ記事/投稿者・同じ文が 0 件 |
| 対照学習のペアに obj_test の文が混ざる | ペアは **train 側の記事**からだけ作り、negative は `obj_train` からだけ取る。obj_test の文は明示的に除外 | ペア中に obj_test の文を含むものが 0 件 |
| JSTS を学習と評価の両方に使う | 学習は zenless-lab/jsts の train、評価は JMTEB の jsts test（JGLUE の valid 相当） | — |
| Wikipedia 本文が土台の事前学習に含まれる | 客観性の評価は `--no_wiki` の数値も併記 | — |
| test を学習やエポック選びに使う | 学習は `*_train`、エポック選びは `afc_dev`、報告は `afc_test`・`obj_test` だけ | — |
| 土台モデルの事前学習・仕上げ学習との重複 | ModernBERT-Ja は MLM のみの事前学習（JNLI 等は評価にだけ使用）。ruri-v3 の仕上げ学習に JaNLI が含まれるため、JaNLI は埋め込み型の評価には使わない | — |

## 量と質の目安

- JAD-AFC は 612 件と小さい。そのためテスト 88 件 1 回の数値ではなく、記事分割を 5 通り変えた**交差検証の平均±標準偏差**を報告する
- 分野は政治・国際・医療・健康・災害。分野別正解率も出す
- 汎用 NLI は 3.8 万対あり、AFC を 3 倍に複製しても AFC は全体の 3% 程度。「AFC だけ」「汎用 NLI だけ」「両方」のアブレーションでどちらが効いたかを示す
- 客観/主観は各クラス同数にそろえる（train 約 1 万、test 約 1,500）
