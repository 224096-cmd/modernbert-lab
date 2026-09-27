# ModernBERT Lab — 公開情報の自動収集と信頼性判定

無料の検索エンジン（DuckDuckGo・Bing・Yahoo! JAPAN・Google ニュース RSS・はてな・Wikipedia など）を **Dorks（検索演算子）で自動巡回**し、本文を読み、**日本語 ModernBERT**（Ruri-v3-30m 埋め込み＋JNLI 微調整の含意判定）で**他の情報源と突き合わせて信頼性を採点**する。API キー不要・すべて無料枠・GitHub だけで動く。

- **自動収集**：GitHub Actions が 6 時間ごとに `watch.yaml` のトピック／主張／ドメインを巡回し、結果 JSON を `docs/data/` に push → GitHub Pages の PWA に表示
- **いま調べる**：ブラウザから同じ検索エンジンを引き、**端末内の同じ ONNX モデル**で即時に採点（オフラインでも判定可）
- **主張を検証**：文を入れると関連ページを集め、段落ごとに含意／矛盾を判定して「支持／否定／食い違い／根拠不足」と根拠を出す
- **ドメイン調査**：DNS・whois(RDAP/JPRS)・証明書ログ・Wayback・Wikipedia 出典回数・セキュリティヘッダ・公開スキャン履歴（動画で紹介される whois / theHarvester / Shodan / Wayback の無料代替）

サイト: `https://224096-cmd.github.io/modernbert-lab/`（Pages を有効にしたあと）

## 信頼性スコア

R = 100 × (0.35·出所 + 0.25·内容 + 0.30·裏取り + 0.10·時間)

| 軸 | 何を見るか | どう出すか |
| --- | --- | --- |
| 出所 | ドメインの種類・年齢・評判 | 種別の基礎点（go.jp 1.0 … SNS 0.3）＋ HTTPS ＋ Wayback 最古スナップショットからの年数 ＋ Wikipedia で出典に使われた回数 ＋ 著者・日付の有無 |
| 内容 | 本文の量と具体性・文体 | 長さ、数値・日付・引用・固有名詞の密度、ゼロショット文体（煽り／報告／意見／宣伝 — Ruri 埋め込みとラベル文の類似） |
| 裏取り | 他ドメインが同じことを言っているか | 要旨（見出し＋冒頭）を、他ドメインの段落が含意する重み付き件数（JNLI モデル）。矛盾は減点 |
| 時間 | 新しさ | 半減期 30 日。日付なしは固定 0.4 |

式・重み・しきい値はすべて `docs/params.json` にあり、サイトの「仕組み」タブで変えられる（Python 側も同じファイルを読む）。

## 使い方（GitHub だけで動かす）

1. このリポジトリを `224096-cmd/modernbert-lab` として作成して push
2. Settings → Pages → Source を **GitHub Actions** に
3. Settings → Actions → General → Workflow permissions を **Read and write** に
4. Actions → collect → Run workflow（トピックを 1 つ入れて実行、または空で `watch.yaml` 全部）
5. 数分後、サイトの「自動収集」に結果が出る。以後は 6 時間ごとに自動

`watch.yaml` を編集して push すれば対象が変わる（サイトの「設定」タブで YAML を生成できる）。

## 使い方（手元の PC / PowerShell）

```powershell
git clone https://github.com/224096-cmd/modernbert-lab.git
cd modernbert-lab
python -m venv .venv; .\.venv\Scripts\Activate.ps1
pip install -r requirements.txt

python -m mbo sources                              # 使える情報源
python -m mbo search "南海トラフ地震 臨時情報" --engines ddg,bing,yahoo,gnews
python -m mbo collect "南海トラフ地震 臨時情報"       # 収集→本文→判定→docs/data/topics/
python -m mbo verify "三重大学は津市にある国立大学である"
python -m mbo recon www.mie-u.ac.jp
python -m mbo watch                                # watch.yaml を全部
```

結果は `docs/data/` の JSON。`docs/` をそのまま開けばサイトで見られる（ブラウザ内モデルは `docs/models/` から読む）。

## 研究の流れ：既存モデルの比較 → 微調整 → 独自モデル

1. **比較**（`models/registry.json` の候補、サイトの「モデル比較」タブ）
   ```powershell
   pip install -r requirements-train.txt fugashi unidic-lite
   python -m mbo.bench --roles embed,nli --max-mb 600      # 600 MB 以下を全部（有名モデルは --max-mb 2000）
   python -m mbo.bench --names ruri-v3-130m,mdeberta-xnli  # 名前指定
   ```
   埋め込み：JSTS Spearman・JNLI cos 差・遅延、含意：JNLI 正解率・含意再現率・ECE・遅延。結果は `docs/data/models.json`。
2. **微調整**（土台を選んで JNLI で学習 → 独自 NLI モデル）
   ```powershell
   python -m mbo.train_nli --base sbintuitions/modernbert-ja-70m --n 20073 --epochs 3 --balance --out models/nli-ja-70m-torch
   python -m mbo.export_onnx --nli models/nli-ja-70m-torch --out models/nli-ja-70m
   python -m mbo.calibrate --model models/nli-ja-70m
   python -m mbo.bench --local models/nli-ja-70m-torch --names nli-ja-70m --role nli
   ```
   GitHub の Actions → train でも同じことができる（CPU）。Colab は `notebooks/train_nli.ipynb`。
3. **差し替え**：サイトの「設定」でブラウザ用モデル名を `nli-ja-70m` に、Actions は `MBO_NLI=nli-ja-70m`（collect.yml の env）にすると、判定がそのモデルで動く。

## モデル

| 役割 | モデル | 備考 |
| --- | --- | --- |
| 埋め込み（候補検索・クラスタ・文体） | [cl-nagoya/ruri-v3-30m](https://huggingface.co/cl-nagoya/ruri-v3-30m) | sbintuitions/modernbert-ja-30m ベース、Apache-2.0。ONNX int8 37 MB |
| 含意（裏取り・検証） | `models/nli-ja-30m` | modernbert-ja-30m を JNLI 8,000 対（クラス重み付け）で 2 エポック微調整。テスト正解率 82.5%（torch）／83.0%（ONNX int8、含意再現率 57%、ECE 0.028）。比較用の mDeBERTa-XNLI（多言語 NLI、1.1 GB）は JNLI で 69% |

再学習・ONNX 化：

```powershell
pip install -r requirements-train.txt
python -m mbo.train_nli --n 20073 --epochs 3 --balance --out models/nli-ja-30m-torch     # GPU 15 分 / CPU 数時間
python -m mbo.export_onnx --nli models/nli-ja-30m-torch --out models/nli-ja-30m
```

Colab（無料 GPU）は `notebooks/train_nli.ipynb`。モデルは `models/` に置く。Pages 配信時にワークフローが `docs/models/` へコピーするので git には 1 部だけ。Hugging Face `mie-edu/modernbert-lab-models` に置けば、設定タブでそちらから取れる。

## 情報源（すべて無料・鍵なし）

検索：DuckDuckGo（lite/html、bot 判定時は r.jina.ai 経由）・Bing・Yahoo! JAPAN・Google ニュース RSS・Mojeek・Wikipedia・ウィキニュース
API：はてなブックマーク・Bluesky・Mastodon・Reddit・GDELT・Qiita・GitHub・NHK RSS・Wayback CDX・Crossref・OpenAlex
ドメイン：Google DNS over HTTPS・RDAP / JPRS whois・crt.sh・HackerTarget（50 回/日）・archive.org・urlscan.io・Wikipedia exturlusage

やらないこと：人物検索・アカウント特定・ポートスキャン・ログインが必要な取得・robots.txt で禁止されたページの取得。

## 構成

```
mbo/            Python（収集・判定）
  http.py       UA・間隔・r.jina.ai 代替
  engines.py    検索エンジン
  sources.py    API 情報源
  dorks.py      検索式テンプレート
  fetch.py      本文抽出（trafilatura）・robots
  recon.py      ドメイン調査
  models.py     ONNX 推論（埋め込み・NLI）
  judge.py      信頼性スコア・検証・クラスタ
  pipeline.py   収集→判定→docs/data
  train_nli.py / export_onnx.py
docs/           GitHub Pages（PWA）
  app.js ui / net.js 収集 / ml.js 端末内モデル / judge.js 判定（Python と同じ式） / params.json
  data/         結果 JSON（Actions が更新）
models/         ONNX（Actions 用。Pages 配信時に docs/models へコピー）
watch.yaml      自動収集の対象
.github/workflows/collect.yml  6 時間ごと＋手動
.github/workflows/pages.yml    Pages 配信
```

## ライセンス

コード MIT。取得したページ本文は判定に使うだけで、公開データには要旨・URL・スコア・根拠段落（200 字以内）のみ保存する。
