# ModernBERT Lab — 公開情報のその場収集と信頼性判定

トピック・URL・主張・ドメインをサイトに入れると、**ブラウザが** DuckDuckGo・Bing・Google ニュース・はてな・Wikipedia などを **Dorks（検索演算子）で巡回**し、本文を読み、**端末内の日本語 ModernBERT**（Ruri-v3-30m 埋め込み＋JNLI 微調整の含意判定）で**他の情報源と突き合わせて信頼性を採点**する。サーバ・API キー・課金なし。結果はその端末の履歴に保存され、同じトピックを再調査すると差分が分かる。

- **調べる**：トピックか URL → 収集 → 採点 → 履歴
- **主張を検証**：文を入れると関連ページを集め、段落ごとに含意／矛盾を判定して「支持／否定／食い違い／根拠不足」と根拠を出す
- **ドメイン調査**：DNS・whois(RDAP/JPRS)・証明書ログ・Wayback・Wikipedia 出典回数・セキュリティヘッダ・公開スキャン履歴（動画で紹介される whois / theHarvester / Shodan / Wayback の無料代替）

サイト: `https://224096-cmd.github.io/modernbert-lab/`（Pages を有効にしたあと）。すべての処理はブラウザ内で行い、入力も結果もどこにも送られない。

## 信頼性スコア

R = 100 × (0.35·出所 + 0.25·内容 + 0.30·裏取り + 0.10·時間)

| 軸 | 何を見るか | どう出すか |
| --- | --- | --- |
| 出所 | ドメインの種類・年齢・評判 | 種別の基礎点（go.jp 1.0 … SNS 0.3）＋ HTTPS ＋ Wayback 最古スナップショットからの年数 ＋ Wikipedia で出典に使われた回数 ＋ 著者・日付の有無 |
| 内容 | 本文の量と具体性・文体 | 長さ、数値・日付・引用・固有名詞の密度、ゼロショット文体（煽り／報告／意見／宣伝 — Ruri 埋め込みとラベル文の類似） |
| 裏取り | 他ドメインが同じことを言っているか | 要旨（見出し＋冒頭）を、他ドメインの段落が含意する重み付き件数（JNLI モデル）。矛盾は減点 |
| 時間 | 新しさ | 半減期 30 日。日付なしは固定 0.4 |

式・重み・しきい値はすべて `docs/params.json` にあり、サイトの「仕組み」タブで変えられる（Python 側も同じファイルを読む）。

## 使い方（GitHub Pages に置く）

1. このリポジトリを GitHub に push
2. Settings → Pages → Source を **GitHub Actions** に（`pages.yml` が `docs/` とモデルを配信する）
3. `https://<owner>.github.io/modernbert-lab/` を開く。初回はモデル 74 MB を端末にダウンロードする（以後はオフラインでも判定できる）

## 使い方（手元の PC / PowerShell）

```powershell
git clone https://github.com/224096-cmd/modernbert-lab.git
cd modernbert-lab
python -m venv .venv; .\.venv\Scripts\Activate.ps1
pip install -r requirements.txt

python -m mbo sources                              # 使える情報源
python -m mbo search "生成AI 著作権 ガイドライン" --engines ddg,bing,yahoo,gnews
python -m mbo collect "生成AI 著作権 ガイドライン"     # 収集→本文→判定→docs/data/topics/
python -m mbo verify "東京スカイツリーの高さは634メートルである"
python -m mbo recon www.nhk.or.jp
```

PC 版は研究用の集計向け（多くの情報源・trafilatura・強い含意モデル `MBO_NLI=hf:MoritzLaurer/mDeBERTa-v3-base-xnli-multilingual-nli-2mil7` が使える）。結果は `docs/data/` の JSON。サイトの表示はこれとは独立で、端末内の履歴を使う。

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
3. **差し替え**：サイトの「設定」でブラウザ用モデル名を `nli-ja-70m` にすると、判定がそのモデルで動く（PC 版は `MBO_NLI=nli-ja-70m`）。

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
  pipeline.py   収集→判定→docs/data（PC 版）
  train_nli.py / export_onnx.py
docs/           GitHub Pages（PWA）
  app.js ui / net.js 収集 / ml.js 端末内モデル / judge.js 判定（Python と同じ式） / params.json
  data/models.json  モデル比較の結果
models/         ONNX（Pages 配信時に docs/models へコピー。PC 版もここを読む）
.github/workflows/pages.yml    Pages 配信（docs/ とモデル）
.github/workflows/bench.yml    モデル比較
.github/workflows/train.yml    微調整→ONNX
```

## ライセンス

コード MIT。取得したページ本文は判定に使うだけで、公開データには要旨・URL・スコア・根拠段落（200 字以内）のみ保存する。
