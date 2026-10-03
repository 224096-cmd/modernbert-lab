# ModernBERT Lab — ファクトチェックの手順を、端末内の ModernBERT で支援する PWA

**検証対象を明示 → 検証過程を公開 → 判定** というファクトチェックの基本手順（日本ファクトチェックセンターの講座「実践編 1〜10」に準拠）に沿って、主張を入れるとブラウザが **高度な検索**で公開情報を集め、**端末内の日本語 ModernBERT**（8,192 トークンを分割せずに読む）で主張と各記事の **含意・矛盾** を照合し、**5 段階の判定（正確／ほぼ正確／根拠不明／不正確／誤り）の下書き** と **根拠リンクつきの検証記事（Markdown）** を作る。生成 LLM は使わない。サーバ・API キー・課金なし。結果はその端末の履歴（IndexedDB）に保存される。

サイト（スマホは「ホーム画面に追加」でアプリ化）: `https://224096-cmd.github.io/modernbert-lab/`

## 画面と手順の対応（v4）

| 講座の内容 | タブ | 何をするか |
| --- | --- | --- |
| 1 検証対象・過程・結果を明示 | **ファクトチェック** | 主張・出どころ URL・拡散状況を入力 → 検証可能性を自動判定 → 6 種類の検索式で収集 → 含意モデルで照合 → 判定の下書き → 検証記事（Markdown）を出力 |
| 2 高度な検索 | **ツール** | site:go.jp / lg.jp / 報道 / filetype:pdf / after: / intitle: / 除外 の演算子ビルダー。Google・Bing・DuckDuckGo・Yahoo・YouTube へ |
| 3 偽画像 | **ツール** | 画像 URL を Google レンズ・TinEye・Yandex・Bing で逆検索 |
| 4 偽動画 | **ツール** | YouTube URL から 4 枚のキーフレームを取り出して逆検索（InVID の簡易版） |
| 5 生成 AI | **ツール** | 8 項目チェックリスト、Content Credentials（C2PA）検証 |
| 6 OSINT・ジオロケーション | **ツール** | Google マップ・Earth・地理院地図・SunCalc・Wayback・archive.today・Bellingcat ツールキット |
| 7 公開情報 | **ツール** | Fact Check Explorer・JFC・FIJ ナビ・e-Stat・e-Gov・国会会議録・法令検索を検索語で開く |
| 9 プリバンキング（情報の空白） | **集める／ギャップ・対立** | 公的・報道の割合が低いトピックに「データボイド」警告。答えのない問いを列挙 |
| 10 教育 | **学ぶ** | 講座リンク・原則・調査の数字 |
| （研究用） | 検証／構造化／長文 vs 分割／モデル | 矛盾行列・偏り・一次情報・時間的矛盾、比較表・要約・Q&A・意味差分、8,192 一括 vs 512 分割、モデル切替 |

人物検索・アカウント特定・非公開情報の取得・ポートスキャンは実装しない。外部ツールはすべて利用者のブラウザで開くリンクであり、このアプリは中継しない。

## ブラウザで動く 10 モデル（役割ごとに切り替え。土台候補は学習前のまま試せる）

| 役割 | 日本語・ModernBERT（8,192） | 海外・多言語（512） |
| --- | --- | --- |
| 埋め込み | ruri-v3-30m（36 MB・既定）、ruri-v3-70m（68 MB）、**ruri-v3-pt-30m**（土台候補 ◎・学習前）、**modernbert-ja-30m-embed**（素の土台 ○） | multilingual-e5-small（32 MB、語彙間引き） |
| 含意 | nli-ja-30m（36 MB・既定、modernbert-ja-30m を JNLI で学習。84%）、**nli-ja-70m**（68 MB、modernbert-ja-70m を JNLI で学習。85%） | multilingual-MiniLMv2-L6-mnli-xnli（53 MB） |
| 関連度 | japanese-reranker-xsmall-v2（36 MB・既定） | japanese-reranker-cross-encoder-xsmall-v1（22 MB） |

ONNX 化・量子化・語彙間引きは `mbo/export_onnx.py`。土台候補の一覧と判定（◎○△）は `models/registry.json` の `base`。**独自モデル FactCheck-BERT の作り方（データ・Colab の手順・評価）は研究計画書（`docs/plan.md`）の 5〜9 章**。学習は研究者が Colab で行い、できた `models/fcb-*` をリポジトリに置くと「モデル」タブに並ぶ。

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

## 研究の流れ：既存モデルの比較 → （次の段階で）微調整 → 独自モデル

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
