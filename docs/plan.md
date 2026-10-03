# 卒業論文 研究計画書（第 3 版）

2026 年 10 月 3 日改訂（第 3 版：ファクトチェックの実務手順に沿った PWA として再構成）

## 1. 研究題目

**ModernBERT を用いた Web 情報の信頼性評価システムの構築**

副題：ファクトチェックの実務手順（検証対象の明示 → 検証過程の公開 → 判定）をスマートフォンで完結させる PWA と、独自モデル FactCheck-BERT の開発

固定するのは「テーマ」と「独自の ModernBERT（FactCheck-BERT）を開発する」の 2 点。第 3 版では、システムの骨格を日本ファクトチェックセンター（JFC）の講座「実践編 1〜10」で示される実務手順に合わせて組み直した。すなわち、本システムは「AI が真偽を言い当てる装置」ではなく、**人がファクトチェックの手順を正しく踏むのを、端末内の BERT が速く・漏れなく支援する道具**である。

FactCheck-BERT とは、日本語 ModernBERT を土台に、(a) 文の客観性・一次情報性を測る**埋め込み型**と、(b) 主張と記事の含意（一致・矛盾・無関係）を判定する**分類型**の 2 つを、無料公開データのみで追加学習したモデルの総称である。学習はすべて研究者自身が Google Colab 等で手順書どおりに実行し、できたモデルは ONNX（int8）に変換してブラウザで動かす。

## 2. 背景と目的

### 2.1 問題

検索結果の上位には SEO 目的の記事・広告・根拠の薄いまとめが並び、画像や動画は過去のものや生成 AI によるものが「今の出来事」として拡散する。JFC と国際大学 GLOCOM による 2 万人調査では、偽・誤情報を「正しい」と判断した人が 51.5%、「誤り」と見抜けた人は 14.5% にとどまり、逆画像検索を実際に行う人は 6.7% しかいない。一方で、検索・逆画像検索・公開データの照合といった手順は確立されており（JFC 講座 実践編）、問題は「手順を知らない」ことと「手順が面倒で続かない」ことにある。

### 2.2 既存のファクトチェック手順（本研究が準拠する枠組み）

1. **検証対象の明示**：客観的に検証可能な事実だけを対象にし、意見・予測は扱わない。選定は「広さ・深さ・近さ」で判断する
2. **検証過程の公開**：高度な検索（site: / filetype: / after: 等）、逆画像検索（Google レンズ・TinEye）、動画のキーフレーム抽出（InVID）、公開データ（e-Stat・e-Gov・国会会議録）、ジオロケーション（地図・ストリートビュー）を使い、検索式と出典 URL をすべて示して読者が再現できるようにする
3. **判定**：正確／ほぼ正確／根拠不明／不正確／誤り の 5 段階で示し、誤りは透明に訂正する
4. **プリバンキング**：信頼できる情報が検索結果にない「情報の空白（データボイド）」を先回りして埋める

### 2.3 目的

上の手順を 1 つの PWA（スマートフォンにインストールでき、オフラインでも判定が動く Web アプリ）に実装し、手順のうち「大量の記事を読んで主張と突き合わせる」「客観性・一次情報性を見積もる」「答えのない問いを見つける」という言語処理の部分を、**端末内で動く日本語 ModernBERT** に担わせる。さらに、公開データのみで追加学習した独自モデル **FactCheck-BERT** が、既存の公開モデルよりこの用途で優れるかを検証する。

ModernBERT を選ぶ理由は、(1) 8,192 トークンまで分割せずに読めるため記事全体と主張を一度に照合できる、(2) 日本語版（sbintuitions/modernbert-ja-30m/70m/130m/310m）があり、量子化すれば 30〜70 MB でスマートフォンのブラウザで動く、(3) ライセンスが MIT／Apache-2.0 で再配布できる、の 3 点である。

### 2.4 現状（2026 年 10 月）

システム（GitHub Pages で公開：modernbert-lab）は動作しており、既存の公開モデル 10 種（埋め込み 5・含意 3・関連度 2）を役割ごとに切り替えて使える。独自モデルはまだ無く、土台候補は「学習前の状態」で同じ画面から試せる（ゼロショット基準）。

### 2.5 作業の分担

学習・評価・判断は研究者が行う。AI（対話型支援）は手順の説明とコードの確認にのみ使い、実験の実行・記録・考察は研究者本人が行う。

## 3. 研究課題と仮説

| RQ | 問い | 仮説 | 測り方 |
| --- | --- | --- | --- |
| RQ1 独自モデルの効果 | FactCheck-BERT は、既存モデルのゼロショットや語彙ルールより、客観性・一次情報・含意の判定精度が高いか | 公開データ＋自作ラベルで学習すると F1 が 10 ポイント以上上がる | 人手ラベル 300 記事での F1、既存 7 モデルと比較 |
| RQ2 長文一括 | 8,192 トークン一括は、512 トークン分割の従来手法より矛盾検知・関連度判定の精度が高いか | 記事後半の訂正・条件・出典が効く判定で一括が優位 | 同じ記事・問いを両方式で処理し一致率・F1・時間を比較 |
| RQ3 検索の改善 | 信頼性スコアで並べ替えると、検索エンジンの順位より上位に信頼できる記事が来るか | Precision@5 が +0.15、MRR が改善 | 30 トピック×上位 10 件で Precision@k、MRR |
| RQ4 端末内実行 | スマートフォンのブラウザだけで実用的な速度で動くか | 30M 系なら 10 記事の採点が 30 秒以内 | スマホ 2 機種・PC での処理時間 |

RQ1 が中心。RQ2 は ModernBERT を選んだ理由の検証、RQ3・RQ4 はシステムとしての有効性。

## 4. システム構成（PWA）とファクトチェック手順の対応

サーバは置かない。GitHub Pages から配られる静的な PWA（HTML＋JavaScript）が、モデル（ONNX int8）を端末の IndexedDB に保存し、検索・本文取得・推論・記録をすべてブラウザ内で行う。API キーも課金もない。スマートフォンでは「ホーム画面に追加」でアプリとして動き、共有メニューから URL を受け取れる。

### 4.1 画面と手順の対応

| ファクトチェックの手順（JFC 講座） | アプリの画面（タブ） | ここで BERT がすること |
| --- | --- | --- |
| ① 検証対象を明示（検証可能な事実か、広さ・深さ・近さ） | 「ファクトチェック」①：主張・出どころ URL・拡散状況を入力し、検証可能性を自動判定 | （現状は語彙規則。将来は分類型 FactCheck-BERT に「事実／意見／予測」を学習） |
| ② 高度な検索で一次情報まで辿る | 同②：6 種類の検索式（完全一致・site:go.jp・報道・ファクトチェック・否定・一次資料）を生成し、アプリ内で自動収集。「ツール」に演算子ビルダー | 収集記事の重複統合・クラスタ（埋め込み） |
| ② 主張と根拠の突き合わせ | 同②：集めた全文と主張を照合し、支持・反証の段落を出典付きで列挙 | 埋め込みで候補段落を絞り、含意モデルで 一致／矛盾／無関係（8,192 トークン一括） |
| ② 画像・動画のオリジナルを探す | 「ツール」：Google レンズ・TinEye・Yandex・Bing を画像 URL で開く。YouTube は 4 枚のキーフレームを取り出して逆検索 | （画像は扱わない） |
| ② 生成 AI の見分け | 「ツール」：8 項目のチェックリスト、Content Credentials 検証 | 「大手報道が同じ出来事を報じているか」を裏取り数で数値化 |
| ② OSINT・ジオロケーション | 「ツール」：Google マップ・Earth・地理院地図・SunCalc・Wayback・archive.today | — |
| ② 公開データ・検証済みか確認 | 「ツール」：Fact Check Explorer・JFC・FIJ ナビ・e-Stat・e-Gov・国会会議録・法令検索を検索語で開く | — |
| ③ 判定と記事化（過程の公開） | 同③：5 段階の判定の下書きと、検証対象・検索式・ツール・根拠 URL・方法と限界を並べた Markdown 記事。判定は人が変更できる | 根拠段落の抽出と判定の下書き |
| プリバンキング（情報の空白） | 「集める」：公的・報道の割合が低いと警告。「ギャップ・対立」：答えのない問いと反対意見を列挙 | 問いの回答有無（リランカー）・立場分類（埋め込みゼロショット） |
| 教育 | 「学ぶ」：講座リンク・原則・調査の数字 | — |
| （研究用） | 「検証」矛盾・偏り・一次情報・時間的矛盾、「構造化」比較表・要約・Q＆A・意味差分、「長文 vs 分割」実験、「モデル」切り替え | すべて埋め込み・含意・関連度の 3 役割の組み合わせ |

### 4.2 処理の流れ

&#91;embedded content: 処理フロー · 9 段階、すべてブラウザ内\]

1→2→3 で公開情報を集め（ブラウザから DuckDuckGo・Google ニュース RSS・はてな・Wikipedia を巡回し、本文を取得）、4→5 で出所・内容・裏取り・時間の 4 軸で採点し、6〜9 で主張との照合・ギャップ・構造化を行う。すべて利用者が入力したその場で動き、定期実行やサーバ側の自動巡回は行わない。結果は端末内の履歴に保存され、CSV／JSON／Markdown で書き出せる（論文の図表の元データ）。

信頼性スコア R（0–100）は 4 軸の重み付き和。重みとしきい値はサイトの「仕組み」タブで変えられる。

```latex
R = 100\,( w_{src}\, s_{src} + w_{con}\, s_{con} + w_{cor}\, s_{cor} + w_{time}\, s_{time} ),\quad w = (0.35, 0.25, 0.30, 0.10)
```

| 軸 | 何を見るか | FactCheck-BERT の役割 |
| --- | --- | --- |
| 出所 s\_src | ドメインの種別・年齢・Wikipedia での被引用回数・著者・日付 | なし（ルールと公開 API） |
| 内容 s\_con | 具体性（数値・日付・引用）、客観性、一次情報性 | 客観性・一次情報性を埋め込み型 FactCheck-BERT で採点 |
| 裏取り s\_cor | 要旨を他ドメインの段落が含意するか・矛盾するか | 含意判定を分類型 FactCheck-BERT で行う |
| 時間 s\_time | 公開日の新しさ（半減期 30 日） | なし |

### 4.3 使用するツール一覧（すべて無料・API キー不要）

**開発・公開**

| ツール | 種類 | 用途 |
| --- | --- | --- |
| GitHub（リポジトリ 224096-cmd/modernbert-lab） | Web サービス | コード・モデル・実験記録の置き場。バージョン管理 |
| GitHub Pages | Web サービス | PWA の公開（https://224096-cmd.github.io/modernbert-lab/） |
| GitHub Actions | Web サービス | モデルの ONNX 変換（models.yml）、CPU での JNLI 微調整（train.yml）、ベンチマーク（bench.yml）。無料枠 2,000 分／月 |
| VS Code ＋ PowerShell（Windows） | デスクトップ | 編集・git 操作。コマンドはすべて PowerShell で実行 |
| Git for Windows | デスクトップ | push／pull |
| Python 3.11（ローカル） | デスクトップ | データ整形・ベンチ（`python -m mbo.bench`）・スモークテスト |

**ブラウザ内推論**

| ツール | 種類 | 用途 |
| --- | --- | --- |
| onnxruntime-web 1.20（WASM） | JS ライブラリ | ONNX モデルをブラウザで実行 |
| Transformers.js 3.5（PreTrainedTokenizer） | JS ライブラリ | トークナイザ |
| IndexedDB／Service Worker／Web App Manifest | ブラウザ標準 | モデルと履歴の保存、オフライン動作、インストール |

**収集（ブラウザから。CORS 回避のため無料の公開中継を使う）**

| ツール | 種類 | 用途・制限 |
| --- | --- | --- |
| DuckDuckGo（lite）・Bing | 検索エンジン | 検索式での収集。r.jina.ai 経由（20 回／分）、超過時は allorigins に切替 |
| Google ニュース RSS・はてなブックマーク RSS | RSS | 報道と反応量。rss2json 経由 |
| Wikipedia API | 公開 API | 検索・出典回数（origin=\* で直接） |
| Wayback Machine availability API | 公開 API | ドメインの最古記録（出所スコア） |

**検証の外部ツール（アプリからリンクで開く。講座で紹介されたもの）**

| ツール | 種類 | 用途 |
| --- | --- | --- |
| Google 検索（演算子）・高度な検索フォーム・Google ニュース・Bing・DuckDuckGo・Yahoo! JAPAN | Web サービス | site: / filetype: / after: / before: / intitle: / inurl: / 完全一致 / 除外 |
| Google レンズ・TinEye・Yandex 画像検索・Bing ビジュアル検索 | Web サービス | 逆画像検索（TinEye は最古順でオリジナル探し） |
| InVID-WeVerify | ブラウザ拡張（Chrome） | 動画のキーフレーム抽出・複数逆検索。アプリ内の YouTube サムネイル抽出はその簡易版 |
| Content Credentials Verify（C2PA） | Web サービス | 生成・編集履歴の確認（対応ファイルのみ） |
| Google マップ・ストリートビュー・Google Earth・地理院地図・SunCalc | Web サービス | ジオロケーション・撮影時刻の推定 |
| Wayback Machine・archive.today | Web サービス | 削除・改変前のページ、証拠の保存 |
| Google Fact Check Explorer・JFC アーカイブ・FIJ ファクトチェック・ナビ | Web サービス | 検証済みかの確認 |
| e-Stat・e-Gov データポータル・国会会議録検索・e-Gov 法令検索・data.gov | 公的ポータル | 数値・発言・法令の一次資料 |
| Bellingcat Online Investigation Toolkit | 公開資料 | ツールの網羅リスト（英語） |

**学習（7 章・8 章）**

| ツール | 種類 | 用途 |
| --- | --- | --- |
| Google Colab（無料 T4）・Kaggle Notebooks | Web サービス | GPU 学習 |
| Google Drive | Web サービス | 学習データと中間モデルの保存 |
| Hugging Face Hub／Datasets | Web サービス | 土台モデルとデータセットの取得、完成モデルの配布ミラー |
| transformers・datasets・sentence-transformers・onnx・onnxruntime | Python ライブラリ | 学習・変換（すべて pip） |
| リポジトリの `mbo/`（train\_nli・distill・export\_onnx・calibrate・bench） | 自作スクリプト | 手順の自動化。引数を変えるだけで土台を入れ替えられる |

使わないもの：有料 API（Google Custom Search・Bing Search API 等）、LLM API、常時サーバ（Vercel／Render のバックエンド）、人物検索・アカウント特定・非公開情報の取得に関わるツール。

## 5. FactCheck-BERT の作り方（Ⅰ）土台モデルの候補

FactCheck-BERT は 2 つの部品からなる。**埋め込み型**（客観性・一次情報性をベクトルの距離で出す）と**分類型**（含意：一致・矛盾・無関係）。それぞれに土台の候補を 3〜4 つ挙げる。◎＝第一候補、○＝比較して選ぶ、△＝資源があれば。

**第 3 版での変更点**：土台候補のうちブラウザで動かせるものは、学習前の状態のまま ONNX に変換してサイトの「モデル」タブに並べた。これにより、独自モデルがまだ無い段階でもシステム全体が動き、「学習前（ゼロショット）→ 学習後」の伸びを同じ画面・同じ指標で測れる。

| サイトで選べる名前 | 役割 | 中身 | 対応する土台候補 |
| --- | --- | --- | --- |
| ruri-v3-pt-30m | 埋め込み | cl-nagoya/ruri-v3-pt-30m をそのまま変換（36 MB） | 埋め込み型 ◎ |
| modernbert-ja-30m-embed | 埋め込み | 素の sbintuitions/modernbert-ja-30m（平均プーリング）。精度が低いのが正常 | 埋め込み型 ○（ゼロから対照学習する条件） |
| ruri-v3-30m／ruri-v3-70m | 埋め込み | 学習済みの公開モデル（比較基準） | — |
| nli-ja-30m | 含意 | modernbert-ja-30m を JNLI で微調整（本リポジトリで学習） | 分類型 ◎ の学習例 |
| nli-ja-70m | 含意 | modernbert-ja-70m を JNLI で微調整（同上） | 分類型 ○ の学習例 |
| minilm-l6-xnli | 含意 | 多言語の公開 NLI（比較基準） | — |
| reranker-ja-xsmall-v2／reranker-xsmall-v1 | 関連度 | 公開リランカー | — |

### 埋め込み型（対照学習の土台）

| 候補 | パラメータ | 文脈長 | すでに学習済みのこと | 判定 | 選ぶ理由／見送る理由 |
| --- | --- | --- | --- | --- | --- |
| [cl-nagoya/ruri-v3-pt-30m](https://huggingface.co/cl-nagoya/ruri-v3-pt-30m) | 37M | 8,192 | modernbert-ja-30m に弱教師の対照学習済み（仕上げ前） | ◎ | 対照学習の出発点として最も近い。少ないデータでも安定 |
| [cl-nagoya/ruri-v3-30m](https://huggingface.co/cl-nagoya/ruri-v3-30m) | 37M | 8,192 | 上に教師あり対照学習まで済み（検索向け） | ○ | ゼロショットの基準。追加学習すると検索性能が崩れるおそれ |
| [sbintuitions/modernbert-ja-30m](https://huggingface.co/sbintuitions/modernbert-ja-30m) | 37M | 8,192 | マスク穴埋めのみ | ○ | 「ゼロから対照学習」の条件。ruri-v3-pt との差で事前学習の効果が分かる |
| [cl-nagoya/ruri-v3-pt-70m](https://huggingface.co/cl-nagoya/ruri-v3-pt-70m) / modernbert-ja-70m | 70M | 8,192 | 同上の 70M 版 | △ | 精度向け。スマホでは 68 MB で少し重い |

### 分類型（含意判定の土台）

| 候補 | パラメータ | 文脈長 | 判定 | 理由 |
| --- | --- | --- | --- | --- |
| [sbintuitions/modernbert-ja-30m](https://huggingface.co/sbintuitions/modernbert-ja-30m) | 37M | 8,192 | ◎ | 予備実験済み（JNLI 83%）。CPU でも 1〜2 時間で学習できる |
| [sbintuitions/modernbert-ja-70m](https://huggingface.co/sbintuitions/modernbert-ja-70m) | 70M | 8,192 | ○ | 精度とサイズの中間 |
| [sbintuitions/modernbert-ja-130m](https://huggingface.co/sbintuitions/modernbert-ja-130m) | 132M | 8,192 | △ | JGLUE で BERT-base を上回る。PC 向け（130 MB） |
| [tohoku-nlp/bert-base-japanese-v3](https://huggingface.co/tohoku-nlp/bert-base-japanese-v3) | 111M | 512 | ○（比較用） | 従来型の代表。RQ2 の対照。MeCab が必要でブラウザでは動かない |

### 選び方

1. すべての候補を、学習しないまま（ゼロショット）で正解データに当て、基準を取る（サイトの「モデル」タブと `python -m mbo.bench`）
2. ◎ の候補で 1 回目の学習を行い、伸び幅を見る
3. 伸びが小さければ ○ の候補で同じ手順を繰り返す。比較表にして指導教員と相談して決める

## 6. FactCheck-BERT の作り方（Ⅱ）学習データの候補と作り方

すべて無料で公開されており、Hugging Face Datasets か公式サイトから取得できるものに限る。◎＝必ず使う、○＝比較して選ぶ、△＝条件付き、×＝使わない。

### 6.1 段階 1：ドメイン継続事前学習（MLM）用コーパス

| 候補 | 規模 | 性質 | 判定 | 備考 |
| --- | --- | --- | --- | --- |
| [wikimedia/wikipedia](https://huggingface.co/datasets/wikimedia/wikipedia)（20231101.ja） | 約 140 万記事 | 客観・百科事典体 | ◎ | ストリーミングで 2〜5 万記事だけ使う。全量は不要 |
| [livedoor ニュースコーパス](https://www.rondhuit.com/download.html) | 7,367 記事 | 報道文 | ◎ | CC BY-ND。カテゴリ付きで後段の評価にも使える |
| 官公庁サイト本文（site:go.jp／lg.jp） | 自分で収集 | 公的文書 | ○ | 本システムの「集める」タブで収集したものを再利用。数千件で十分 |
| [hpprc/jawiki](https://huggingface.co/datasets/hpprc/jawiki)・[llm-jp-corpus](https://huggingface.co/llm-jp) | 大規模 | 混合 | △ | 大きすぎる。Colab の無料枠では絞って使う |
| CC-100・mC4（日本語） | 超大規模 | Web 全般（ノイズ多） | × | 無料 Colab では前処理だけで時間切れになる |

### 6.2 段階 2：対照学習（客観性・一次情報性）用の正例・負例

ラベルを人手で付けずに、**出典の種類をラベル代わりにする**（弱教師）。

| 役割 | 候補 | 判定 | 作り方 |
| --- | --- | --- | --- |
| 正例（客観・一次情報） | 官公庁本文、livedoor の報道記事、Wikipedia 本文 | ◎ | 300〜600 字に切って `{text, label: "objective"}` |
| 負例（主観・二次情報） | [MARC-ja](https://huggingface.co/datasets/shunk031/JGLUE)（商品レビュー）、[WRIME](https://huggingface.co/datasets/shunk031/wrime)（感情付き投稿）、まとめ・個人ブログ本文（自分で収集） | ◎ | 同じ長さに切って `label: "subjective"` |
| 類似文ペア（意味の近さの土台） | [JSTS](https://huggingface.co/datasets/shunk031/JGLUE)、[JaNLI](https://huggingface.co/datasets/hpprc/janli)、[hpprc/jsick](https://huggingface.co/datasets/hpprc/jsick) | ○ | 類似度 ≥ 3.5 を正ペア、≤ 1.5 を負ペア |
| 大規模ペア | [hpprc/emb](https://huggingface.co/datasets/hpprc/emb)（Ruri の学習データ集） | △ | 巨大。1〜2 サブセットだけ使う |
| Yahoo!知恵袋コーパス | — | △ | NII への利用申請が必要（無料だが数週間）。間に合えば負例に追加 |

### 6.3 段階 3：含意（一致・矛盾・無関係）分類用

| 候補 | 規模 | 判定 | 備考 |
| --- | --- | --- | --- |
| [JNLI](https://huggingface.co/datasets/shunk031/JGLUE) | 2.0 万 | ◎ | 標準。既存の nli-ja-30m もこれで学習 |
| [JaNLI](https://huggingface.co/datasets/hpprc/janli) | 1.3 万 | ○ | 語順の入れ替えなど「ひっかけ」に強くなる |
| [JSICK](https://huggingface.co/datasets/hpprc/jsick) | 1.0 万 | ○ | 含意・矛盾のバランスが良い |
| [xnli](https://huggingface.co/datasets/facebook/xnli) 英語→機械翻訳版 | 39 万 | △ | 翻訳品質に注意。多言語の比較実験用 |
| Web 記事ペア（蒸留） | 数千 | ○ | 本システムの「検証」で集めた記事ペアに、大きめの NLI（`mbo.distill`）で仮ラベルを付ける。Web の文体に慣らす |

### 6.4 評価専用（学習には使わない）

- **信頼性評価セット（自作・300 件）**：本システムで集めた記事を、2 名の評価者が「一次情報か」「客観的か」「主張と一致か」を 3 段階で採点。κ 係数を出す。7 章の RQ1・RQ3 に使う
- **長文セット（自作・100 件）**：4,000 字超の記事で、要点が後半にあるもの。RQ2 に使う
- livedoor のカテゴリ分類、JSTS、JNLI の検証用分割：汎用性能が落ちていないかの確認

### 6.5 前処理の共通ルール

1. 文字コードは UTF-8 に統一し、全角英数字は半角に、改行の連続は 1 つに
2. 300〜600 字の段落に切る（ModernBERT は 8,192 トークンまで扱えるが、学習は短い段落を大量に見せる方が安定する。長文は評価側で使う）
3. 学習・検証・評価を 8:1:1 に分け、同じ記事が 2 つの分割にまたがらないようにする（URL ごとに分ける）
4. すべて `data/<段階>/train.jsonl` の形で保存し、GitHub には**置かない**（ライセンスと容量のため。Google Drive に置く）

## 7. FactCheck-BERT の作り方（Ⅲ）Google Colab での 4 段階学習手順

学習はすべて自分で実行する。AI（対話型支援）は手順の説明とコードのレビューにのみ使い、実行・記録・判断は研究者本人が行う。無料 Colab（T4 GPU、1 回最大約 4 時間、セッション切れあり）を前提に、**1 段階を 3 時間以内**に収めて設計する。各段階の成果物は Google Drive に保存し、次の段階はそこから読み直す。

| 段階 | 目的 | 入力 | 主なツール | T4 での目安 | 成果物 |
| --- | --- | --- | --- | --- | --- |
| 0 準備 | ゼロショット基準とデータ整形 | 6 章のデータ | datasets, `mbo.bench` | 1 時間 | `data/*.jsonl`, 基準表 |
| 1 DAPT | Web・公的文書の文体に慣らす | Wikipedia 抽出 + livedoor + 官公庁 | transformers `Trainer`（MLM） | 2〜3 時間 | `fcb-stage1/` |
| 2 対照学習 | 客観↔主観、一次↔二次をベクトルで分ける | 6.2 の正例・負例・ペア | sentence-transformers | 1〜2 時間 | `fcb-embed/`（埋め込み型） |
| 3 含意分類 | 一致・矛盾・無関係 | JNLI + JaNLI + Web 蒸留ペア | `mbo.train_nli` | 1〜2 時間 | `fcb-nli/`（分類型） |
| 4 書き出し | スマホで動く形に変換 | 段階 2・3 の成果物 | `mbo.export_onnx`, `mbo.calibrate` | 30 分（CPU で可） | `models/fcb-*/model_int8.onnx` |

### 段階 0：準備

1. Colab で新規ノートブックを作り、「ランタイム → ランタイムのタイプを変更 → T4 GPU」を選ぶ
2. Google Drive をマウントし、`MyDrive/factcheck-bert/` を作成。データ・モデル・ログはすべてこの下に置く
3. `pip install transformers datasets sentence-transformers accelerate onnx onnxruntime` と、GitHub の modernbert-lab を `git clone`（学習スクリプト `mbo/` を使うため）
4. 6 章のデータを jsonl に整形し、件数・文字数の分布を記録（論文のデータ表になる）
5. 土台候補を学習せずに評価し、**ゼロショット基準**を表にする（JSTS のスピアマン相関、JNLI 正解率、信頼性評価セットでの客観性の AUC）

### 段階 1：ドメイン継続事前学習（DAPT）

- 手法：マスク穴埋め（MLM）。`AutoModelForMaskedLM` と `DataCollatorForLanguageModeling(mlm_probability=0.30)`。ModernBERT は 30% マスクで事前学習されているのでそれに合わせる
- データ量：約 5 万段落（約 2,000 万トークン）。これで 1 エポックが T4 で約 1.5 時間
- 設定値：系列長 1,024、バッチ 16（勾配累積 4 で実質 64）、学習率 5e-5、ウォームアップ 6%、エポック 1〜2、bf16、`save_steps=500` で Drive に途中保存（セッション切れ対策）
- 合格基準：検証用データの MLM 損失が下がり、かつ JSTS・JNLI のゼロショットが大きく落ちない（落ちたら学習率を 2e-5 に下げてやり直す）
- 省略してもよい：時間が無ければこの段階を飛ばし、「DAPT あり／なし」を比較実験の 1 つにする

### 段階 2：対照学習（埋め込み型 FactCheck-BERT）

- 手法：sentence-transformers の `MultipleNegativesRankingLoss`（バッチ内の他の文を負例にする）を主にし、`CoSENTLoss`（JSTS の連続値）を混ぜる。学習ペアは 3 種類：同じ記事の隣接段落同士（正）、客観文と主観文（負）、JSTS ペア
- プレフィックス：Ruri と同じ「検索クエリ: 」「検索文書: 」「トピック: 」を維持する。既存システムがそのまま使える
- 設定値：系列長 512（学習時）、バッチ 64（負例の数に直結するので大きめ）、学習率 2e-5、エポック 1〜3、ウォームアップ 10%、平均プーリング
- 客観性スコアの出し方：学習後、「客観的な文」「主観的な文」のベクトル（それぞれの正例・負例の平均）を `meta.json` に埋め、入力とのコサイン類似度の差をスコアにする。分類ヘッドを足さないので、埋め込み 1 つで検索と客観性評価の両方に使える
- 合格基準：信頼性評価セットでの客観性 AUC が ruri-v3-30m のゼロショットを上回り、JSTS が 2 ポイント以上落ちない

### 段階 3：含意分類（分類型 FactCheck-BERT）

- 手法：`AutoModelForSequenceClassification`（3 クラス）。リポジトリの `python -m mbo.train_nli --model <段階 1 の成果物> --balance --extra data/stage3/web_pairs.jsonl` をそのまま使う
- Web 蒸留ペアの作り方：「検証」で集めた記事から主張・記事文のペアを作り、`python -m mbo.distill --teacher MoritzLaurer/mDeBERTa-v3-base-xnli-multilingual-nli-2mil7` で仮ラベルを付ける（教師モデルは Colab でのみ使い、スマホには入れない）。信頼度 0.8 未満の仮ラベルは捨てる
- 設定値：系列長 512、バッチ 32、学習率 3e-5、エポック 3、ラベルスムージング 0.1、学習後に `mbo.calibrate` で温度パラメータを求めて `meta.json` に書く（確率の過信を防ぐ）
- 合格基準：JNLI 検証セットで 83%（既存 nli-ja-30m）を超え、かつ信頼性評価セットの「主張と一致か」の F1 が改善する

### 段階 4：スマホ向けの書き出し

1. `python -m mbo.export_onnx --model fcb-embed --kind embed --quant all --prune` で ONNX 化、int8 量子化、語彙削減を一括実行（分類型は `--kind nli`）
2. `python -m mbo.bench` で量子化前後の精度差を記録。差が 1 ポイントを超えたら `--quant mlp`（注意機構は量子化しない）に切り替える
3. `models/fcb-embed/`、`models/fcb-nli/` として GitHub に push すると、サイトの「モデル」タブに並び、既存 7 モデルと同じ操作で切り替えて比較できる

### 記録のしかた

各実行で、日付・土台モデル・データの組み合わせ・設定値・所要時間・合格基準の数値を 1 行にして `runs.csv` に追記する。この表がそのまま論文の実験表になる。Colab のノートブックは段階ごとに 1 ファイルに分け、GitHub の `notebooks/` に置く（既存の `train_nli.ipynb` が雛形）。

### Colab でそのまま実行するセル（段階ごと。「◎」の土台での例。土台を変えるときは ID を替えるだけ）

セル 1（共通：準備）

```bash
from google.colab import drive; drive.mount('/content/drive')
!mkdir -p /content/drive/MyDrive/factcheck-bert && cd /content && git clone https://github.com/224096-cmd/modernbert-lab.git
%cd /content/modernbert-lab
!pip install -q -r requirements.txt -r requirements-train.txt sentence-transformers
```

セル 2（段階 0：ゼロショット基準。土台候補を学習せずに JSTS・JNLI で測る）

```bash
!python -m mbo.bench --local cl-nagoya/ruri-v3-pt-30m --names ruri-v3-pt-30m --role embed --note "学習前"
!python -m mbo.bench --local sbintuitions/modernbert-ja-30m --names modernbert-ja-30m-embed --role embed --note "素の土台"
!cat docs/data/models.json
```

セル 3（段階 1：DAPT。時間がなければ飛ばす）

```python
from datasets import load_dataset
from transformers import AutoTokenizer, AutoModelForMaskedLM, DataCollatorForLanguageModeling, Trainer, TrainingArguments
base = "sbintuitions/modernbert-ja-30m"
tok = AutoTokenizer.from_pretrained(base); model = AutoModelForMaskedLM.from_pretrained(base)
ds = load_dataset("wikimedia/wikipedia", "20231101.ja", split="train", streaming=True).take(50000)
ds = ds.map(lambda x: tok(x["text"], truncation=True, max_length=1024), remove_columns=["id","url","title","text"])
args = TrainingArguments("/content/drive/MyDrive/factcheck-bert/fcb-stage1", per_device_train_batch_size=16, gradient_accumulation_steps=4, learning_rate=5e-5, warmup_ratio=0.06, num_train_epochs=1, bf16=True, save_steps=500, logging_steps=50, max_steps=1500, report_to=[])
Trainer(model=model, args=args, train_dataset=ds, data_collator=DataCollatorForLanguageModeling(tok, mlm_probability=0.30)).train()
model.save_pretrained(args.output_dir); tok.save_pretrained(args.output_dir)
```

セル 4（段階 2：対照学習。`data/stage2/pairs.jsonl` は 6.2 の手順で作った `{"anchor":..., "positive":..., "negative":...}`）

```python
from sentence_transformers import SentenceTransformer, SentenceTransformerTrainer, SentenceTransformerTrainingArguments, losses
from datasets import load_dataset
m = SentenceTransformer("cl-nagoya/ruri-v3-pt-30m")   # 段階 1 をやった場合はそのパス
 train = load_dataset("json", data_files="/content/drive/MyDrive/factcheck-bert/data/stage2/pairs.jsonl", split="train")
args = SentenceTransformerTrainingArguments("/content/drive/MyDrive/factcheck-bert/fcb-embed", per_device_train_batch_size=64, learning_rate=2e-5, warmup_ratio=0.1, num_train_epochs=1, bf16=True, save_steps=500, report_to=[])
SentenceTransformerTrainer(model=m, args=args, train_dataset=train, loss=losses.MultipleNegativesRankingLoss(m)).train()
m.save(args.output_dir)
```

セル 5（段階 3：含意分類。リポジトリのスクリプトをそのまま使う）

```bash
!python -m mbo.train_nli --base sbintuitions/modernbert-ja-30m --n 20000 --epochs 3 --bs 32 --seq 256 --balance --out /content/drive/MyDrive/factcheck-bert/fcb-nli-torch
```

セル 6（段階 4：スマホ向けに変換して Drive に保存 → PC でリポジトリの `models/` に置いて push）

```bash
!python -m mbo.export_onnx --embed /content/drive/MyDrive/factcheck-bert/fcb-embed --out models/fcb-embed
!python -m mbo.export_onnx --nli /content/drive/MyDrive/factcheck-bert/fcb-nli-torch --out models/fcb-nli
!python -m mbo.calibrate --model models/fcb-nli
!python -m mbo.bench --local /content/drive/MyDrive/factcheck-bert/fcb-nli-torch --names fcb-nli --role nli --note "FactCheck-BERT"
!cp -r models/fcb-embed models/fcb-nli /content/drive/MyDrive/factcheck-bert/
```

各セルの前後で `!nvidia-smi` と所要時間をメモし、`runs.csv` に追記する。セッションが切れたらセル 1 をやり直し、`resume_from_checkpoint=True` で続きから学習する。

## 8. 学習・実行環境の候補

すべて無料で、API キーやクレジットカードの登録を必要としないものに限る。

### 学習（GPU が必要な作業）

| 候補 | GPU | 連続利用 | 判定 | 向いている作業 |
| --- | --- | --- | --- | --- |
| Google Colab（無料） | T4 16 GB | 最大約 4 時間／日、変動あり | ◎ | 7 章の段階 1〜3。Drive 連携が楽 |
| Kaggle Notebooks | T4×2 または P100 | 週 30 時間、1 回 12 時間 | ○ | 段階 1（DAPT）のように長いもの。Colab で切れるときの代替 |
| GitHub Actions（既存 `train.yml`） | なし（CPU 4 コア） | 6 時間／ジョブ | ○ | 段階 3（30M モデルの分類は CPU で 1〜2 時間）と段階 4。再現性の証拠になる |
| 大学の PC（GPU ありの場合） | 環境次第 | 制限なし | △ | 指導教員に確認。あれば 130m クラスの実験も可能 |
| 自分の PC（CPU） | なし | 制限なし | △ | データ整形、段階 4、評価。学習は非現実的 |

### 実行（システムを動かす場所）

| 候補 | 判定 | 理由 |
| --- | --- | --- |
| GitHub Pages + ブラウザ内推論（onnxruntime-web） | ◎ | 現行システム。サーバー不要、モデルを端末に保存してオフラインでも判定できる |
| Hugging Face Hub（モデル配布のミラー） | ○ | GitHub の容量を超えたら。サイトの設定にリポジトリ名を入れるだけで切り替えられる |
| Hugging Face Spaces（サーバー側推論） | △ | 無料 CPU ではなくてもよい。「端末内で完結」という利点を失うので比較実験の対照にのみ使う |
| Vercel・Cloudflare Pages + FastAPI | × | 常時サーバーが必要になり、無料枠を超えるおそれ |

### データと成果物の置き場

- 学習データ・中間モデル：Google Drive（15 GB。GitHub には置かない）
- 完成モデル（ONNX、1 つ 30〜70 MB）：GitHub の `models/`。合計 1 GB を超えたら Hugging Face Hub へ
- 実験記録（`runs.csv`、評価セットの採点表）：GitHub の `docs/data/`。サイトの「モデル」タブが読んで表にする
- 論文本体・図：この計画書と同じ場所。図はサイトの履歴タブから JSON で保存したものを元に作る

### 公開サイトの更新手順（研究者が行う。Windows・PowerShell）

1. リポジトリを取得：`git clone https://github.com/224096-cmd/modernbert-lab.git` → `cd modernbert-lab`（既にあれば `git pull`）
2. VS Code で開き、`docs/` 配下を編集（画面：`index.html`、挙動：`app.js`、手順・ツール：`factcheck.js`、判定：`judge.js`、解析：`analysis.js`、設定値：`params.json`）
3. ローカル確認は不要（GitHub Pages に上げて確認する）。変更を送る：`git add -A` → `git commit -m "変更内容"` → `git push`
4. 1〜2 分後に https://224096-cmd.github.io/modernbert-lab/ を再読み込み（スマホの PWA は一度閉じて開くと更新）
5. モデルを追加するとき：Colab で作った `models/<名前>/`（model\_int8.onnx・tokenizer.json・tokenizer\_config.json・config.json・meta.json）をリポジトリに置き、`models/registry.json` の `browser` に 1 行追加して push。「モデル」タブに自動で並ぶ
6. GitHub Actions を使うとき：GitHub の「Actions」→ ワークフロー（models / train / bench）→「Run workflow」。入力欄に土台モデルの Hugging Face ID と出来上がりの名前を入れる。結果は自動で push される

## 9. 評価計画

### 9.1 比較するモデル

| 区分 | モデル | 役割 |
| --- | --- | --- |
| 提案 | FactCheck-BERT（埋め込み型・分類型） | 本研究の成果 |
| 提案の内訳確認 | DAPT なし版、対照学習なし版 | どの段階が効いたか（アブレーション） |
| 既存・同規模 | ruri-v3-30m、nli-ja-30m、reranker-ja-xsmall-v2 | 同じサイズでの公平な比較 |
| 既存・大きめ | ruri-v3-70m、multilingual-e5-small、minilm-l6-xnli、reranker-xsmall-v1 | サイズを増やす価値があるか |
| 従来型 | tohoku bert-base-japanese-v3（512 トークン） | RQ2 の対照。PC 上で実行 |
| 学習なしの基準 | BM25、検索エンジンの元の順位 | 「何もしない」との差 |

### 9.2 研究課題ごとの指標と判定基準

| 課題 | データ | 指標 | こうなれば支持される |
| --- | --- | --- | --- |
| RQ1 独自モデルの効果 | 信頼性評価セット 300 件 | 客観性・一次情報性の AUC、含意の F1、人手評価とのスピアマン相関 | 同規模の既存モデルを 3 指標とも上回る（ブートストラップ 95% 区間が重ならない） |
| RQ2 長文一括の効果 | 長文セット 100 件 | 矛盾検出の再現率、時間的矛盾の検出数、一括と分割の判定一致率 | 後半に根拠がある記事で、一括の再現率が 512 分割を上回る |
| RQ3 検索の改善 | 30 クエリ × 上位 10 件 | Precision@3/5/10、MRR、nDCG@10 | 元の順位・BM25・RRF より高い |
| RQ4 端末内実行 | スマホ 2 機種・PC 1 台 | 初回ダウンロード量、モデル読込時間、1 記事の判定時間、オフラインでの動作 | モデル合計 100 MB 以下、スマホで 1 記事 5 秒以内、機内モードで検証タブが動く |

### 9.3 評価セットの作り方

1. サイトの「集める」で、分野の異なる 30 トピック（健康・家電・子育て・科学・行政手続きなど）を集め、各 10 件を無作為に選ぶ
2. 評価者 2 名（研究者と同学年の協力者 1 名）が、モデルの出力を見ずに採点する。採点基準は事前に 1 枚にまとめる
3. 一致度（κ 係数）を出し、0.6 未満の項目は基準を見直して採点し直す
4. 採点表は `docs/data/eval_set.csv` として保存（URL・採点・日付のみ。本文は著作権のため保存しない）

### 9.4 測り方の統一

- すべてのモデルを同じ ONNX int8 形式、同じブラウザ、同じ設定（`docs/params.json`）で測る。`python -m mbo.bench` が同じ表を PC でも出す
- 乱数の種を固定し、学習は 3 回繰り返して平均と標準偏差を報告する（Colab の時間が足りなければ提案モデルのみ 3 回）
- スマホの時間はサイトの履歴タブが自動記録するものを使い、機種名・OS・ブラウザの版を添える

### 9.5 手順支援としての評価（利用者テスト、小規模）

モデルの精度とは別に、「手順を正しく踏むのを助けたか」を測る。同学年の協力者 6〜10 名に、同じ 5 つの主張（評価セットから選ぶ。正解は JFC 等の公開検証記事）を、(a) 検索エンジンだけ、(b) 本アプリ、の 2 条件で検証してもらう（順序は入れ替え）。記録するのは、判定の正誤、所要時間、開いた一次情報の数、検証記事に残した出典 URL の数。さらに「逆画像検索を行ったか」をチェックし、2 万人調査の 6.7% と比べる。人を対象にするので、実施前に指導教員に倫理面（同意・匿名化）を確認する。

## 10. スケジュールとリスク

&#91;embedded content: 研究者の実験計画より · 2026 年 10 月〜2027 年 1 月\]

モデル構築の 4 週は、7 章の段階 0〜4 を週 1 段階のペースで進める。Colab の無料枠は 1 日 3〜4 時間なので、学習は平日夜に仕掛けて翌日確認する形が現実的。

| 週 | やること | 終わった判定 |
| --- | --- | --- |
| 10/5〜10/25 | 評価セット 300 件・長文 100 件の収集と採点 | κ ≥ 0.6、`eval_set.csv` が push されている |
| 10/19〜11/8 | 既存 7 モデルと土台候補のゼロショット基準（段階 0） | 基準表がサイトの「モデル」タブに出る |
| 11/2〜11/29 | 段階 1〜4。◎ 土台で 1 周してから ○ 土台を試す | `models/fcb-embed`, `models/fcb-nli` がスマホで動く |
| 11/23〜12/13 | 長文一括 vs 分割（RQ2）、アブレーション | 9.2 の表が埋まる |
| 12/7〜12/20 | ランキング評価（RQ3）、端末計測（RQ4）、12/20 にコード凍結 | 全指標の数値と信頼区間が `runs.csv` にある |
| 12/14〜1/24 | 執筆・図表。1/30 提出 | — |

### リスクと対策

| リスク | 起きやすさ | 対策 |
| --- | --- | --- |
| Colab の GPU が割り当てられない・途中で切れる | 高 | `save_steps` で Drive に途中保存して再開。Kaggle を予備に。段階 1 は省略可能な設計 |
| FactCheck-BERT が既存モデルに勝てない | 中 | 「どの段階が効かなかったか」をアブレーションで示せば論文として成立する。学習データの組み合わせを 6.2 の候補内で入れ替えて再試行 |
| 評価者間の一致が低い | 中 | 採点基準を具体例付きで書き直し、30 件で練習してから本番 |
| 収集先（検索・中継）の制限で記事が集まらない | 中 | システムは複数経路に切り替わる。評価セットは早めに集めて URL を固定 |
| モデルが 100 MB を超える・スマホで遅い | 低 | 30M クラスに限定し、語彙削減と int8 で 25〜35 MB に収める。入力の上限トークン数を設定で下げられる |
| ライセンス・著作権 | 低 | 学習データは公開ライセンスのもののみ。Web 収集本文は再配布せず URL と採点だけ保存。モデルは MIT / Apache-2.0 の土台のみ |

## 11. 用語解説と、指導教員に確認したい点

### 用語解説

| 用語 | 意味 |
| --- | --- |
| ModernBERT | 2024 年発表の BERT の改良版。最大 8,192 トークンを一度に読め、同じサイズの BERT より速い。日本語版（ModernBERT-Ja）を土台に使う |
| FactCheck-BERT | 本研究で作るモデルの名前。埋め込み型（客観性・一次情報性・類似度）と分類型（含意）の 2 つを指す |
| DAPT（ドメイン継続事前学習） | 学習済みモデルに、対象分野の文章でマスク穴埋めを追加で行い、その分野の言い回しに慣らすこと |
| 対照学習 | 意味が近い文のベクトルを近づけ、遠い文を離す学習。本研究では「客観的な文」と「主観的な文」を離すのに使う |
| 含意（NLI） | 2 つの文の関係を「一致・矛盾・無関係」に分類する課題。デマや矛盾の検出の土台 |
| 弱教師 | 人がラベルを付ける代わりに、出典の種類などから機械的にラベルを付けること |
| 蒸留（知識蒸留） | 大きいモデルの判定を小さいモデルに真似させる学習 |
| ONNX / int8 量子化 | モデルをブラウザで動く共通形式に変換し、重みを 8 ビット整数にして約 4 分の 1 に小さくすること |
| ゼロショット | 追加学習せずに、あるのままのモデルで課題を解かせること。比較の基準になる |
| Precision@k / MRR / nDCG | 検索結果の上位 k 件に正解がどれだけ含まれるか、最初の正解が何位か、順位を考慮した良さ。いずれも高いほど良い |
| κ 係数 | 2 人の採点が偶然を超えてどれだけ一致しているか。0.6 以上で「おおむね一致」 |
| アブレーション | 段階を 1 つずつ外して学習し直し、どの段階が効いたかを確かめる実験 |

### 指導教員に確認したい点

1. 土台は 30M クラス（スマホで動く）を主にし、130M は比較のみとする方針でよいか
2. 評価セットの採点を協力してもらえる学生がいるか。いない場合、研究者 1 名で 2 回（2 週間あけて）採点する代替案でよいか
3. 学部の PC に GPU があれば使えるか（あれば Colab の時間制限のリスクが消える）
4. Yahoo!知恵袋コーパスの NII への利用申請は指導教員名義が必要。申請する価値があるか（なくても計画は成立する）
5. 教育学部の卒論として、実験結果に加えて「情報モラル教材としての利用」を考察に入れるべきか
6. RQ を 4 つにするか、RQ1・RQ2 に絞るか

## 付録 A. 関連研究（読むべき論文）

### A.1 まず読む 5 本（研究の骨格）

| # | 論文 | なぜ読むか |
| --- | --- | --- |
| 1 | Devlin ら「BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding」(2018) [arXiv:1810.04805](https://arxiv.org/abs/1810.04805) | すべての出発点。マスク穴埋め（MLM）と「事前学習→ファインチューニング」の考え方 |
| 2 | Warner ら「Smarter, Better, Faster, Longer: A Modern Bidirectional Encoder」(2024) [arXiv:2412.13663](https://arxiv.org/abs/2412.13663) | ModernBERT 本体。8,192 トークン・RoPE・交互注意・Unpadding の設計理由。「なぜ ModernBERT か」の根拠 |
| 3 | Gururangan ら「Don't Stop Pretraining: Adapt Language Models to Domains and Tasks」(2020) [arXiv:2004.10964](https://arxiv.org/abs/2004.10964) | 段階 1 の DAPT（ドメイン継続事前学習）の原典 |
| 4 | Reimers & Gurevych「Sentence-BERT」(2019) [arXiv:1908.10084](https://arxiv.org/abs/1908.10084) | 段階 2 の土台。BERT を「文ベクトルを出す道具」にする方法と sentence-transformers の設計 |
| 5 | Gao ら「SimCSE: Simple Contrastive Learning of Sentence Embeddings」(2021) [arXiv:2104.08821](https://arxiv.org/abs/2104.08821) | 対照学習の最も簡潔な形。「バッチ内の他の文を負例にする」考え方 |

### A.2 日本語モデルとデータ

- Kurihara ら「JGLUE: Japanese General Language Understanding Evaluation」(LREC 2022) — JNLI・JSTS・MARC-ja の作られ方。評価に使うので必読
- Tsukagoshi ら「Ruri: Japanese General Text Embeddings」(2024) [arXiv:2409.07737](https://arxiv.org/abs/2409.07737) — 第一候補 ruri-v3 の学習手順（弱教師事前学習→蒸留→教師ありファインチューニング）。段階 2 はこれの縮小版
- Sugiura ら「llm-jp-modernbert」(2025) [arXiv:2504.15544](https://arxiv.org/abs/2504.15544) — 日本語 ModernBERT の大規模学習報告。文脈長の効果と学習設定値の参考
- SB Intuitions「ModernBERT-Ja」— 論文はなく[モデルカード](https://huggingface.co/sbintuitions/modernbert-ja-30m)と技術ブログのみ。学習トークン数・語彙・JGLUE スコアはそこで確認
- Wang ら「Text Embeddings by Weakly-Supervised Contrastive Pre-training (E5)」(2022) [arXiv:2212.03533](https://arxiv.org/abs/2212.03533) — 「query: / passage:」プレフィックスの由来

### A.3 ファクトチェック・信頼性（研究の位置づけ）

- Thorne ら「FEVER: a Large-scale Dataset for Fact Extraction and VERification」(2018) [arXiv:1803.05355](https://arxiv.org/abs/1803.05355) — 「主張＋根拠→支持／反証／情報不足」の枠組みの原典
- Guo ら「A Survey on Automated Fact-Checking」(TACL 2022) [arXiv:2108.11896](https://arxiv.org/abs/2108.11896) — 分野全体の地図。関連研究の章の軸
- Williams ら「MultiNLI」(2018) [arXiv:1704.05426](https://arxiv.org/abs/1704.05426) — 含意判定の標準。JNLI の元
- 「ModernBERT is More Efficient than Conventional BERT for Chest CT Findings Classification」(2025) [arXiv:2503.05060](https://arxiv.org/abs/2503.05060) — ModernBERT を長文分類に使った先行例

### A.4 軽量化・端末内実行（RQ4）

- Sanh ら「DistilBERT」(2019) [arXiv:1910.01108](https://arxiv.org/abs/1910.01108) — 蒸留の基本
- Zafrir ら「Q8BERT: Quantized 8Bit BERT」(2019) [arXiv:1910.06188](https://arxiv.org/abs/1910.06188) — int8 量子化で精度がほぼ落ちない根拠
- Hinton ら「Distilling the Knowledge in a Neural Network」(2015) [arXiv:1503.02531](https://arxiv.org/abs/1503.02531) — 段階 3 の仮ラベル付与の理論的裏付け

### A.5 仕組みを深く理解するために

- Vaswani ら「Attention Is All You Need」(2017) [arXiv:1706.03762](https://arxiv.org/abs/1706.03762) — Transformer の原典
- Liu ら「RoBERTa」(2019) [arXiv:1907.11692](https://arxiv.org/abs/1907.11692) — 「次文予測は不要」「動的マスク」など ModernBERT が採った改良の出どころ
- Su ら「RoFormer: Enhanced Transformer with Rotary Position Embedding」(2021) [arXiv:2104.09864](https://arxiv.org/abs/2104.09864) — 8,192 トークンを可能にした位置表現
- Dao ら「FlashAttention」(2022) [arXiv:2205.14135](https://arxiv.org/abs/2205.14135) — 長文でメモリが爆発しない理由

読む順の目安：A.1 の 1→2 を精読、3〜5 は手法の章だけ、A.2 は実験を組む前、A.3 は関連研究を書く前、A.4 は段階 4 の前。

## 付録 B. 基礎技術：BERT と ModernBERT の仕組み

### B.1 BERT は何をするモデルか

BERT は「文章を読んで、各トークン（単語の断片）に文脈を反映したベクトルを割り当てる」エンコーダである。GPT のような文章生成はしない。同じ単語でも前後の文脈によってベクトルが変わり、左右両方の文脈を見るので「双方向（Bidirectional）」と呼ばれる。

### B.2 処理の流れ

1. **トークン化**：文章をサブワードに分割して ID の列にする。先頭に `[CLS]`、文の区切りに `[SEP]`（ModernBERT-Ja では `<s>` `</s>`）。語彙辞書にない単語は細かく分割される
2. **埋め込み**：各 ID をベクトル（base で 768 次元）に変換し、位置埋め込み（何番目か）を足す。BERT は位置埋め込みを 512 個しか学習していないので 512 トークンを超えられない。これが「分割が必要」の直接の原因
3. **Transformer 層 × 12（base）**：各層で「自己注意」と「フィードフォワード」を繰り返す。自己注意は各トークンが他のどのトークンをどれだけ参照するかを Query・Key・Value の 3 つの線形変換と内積・softmax で計算する（12 ヘッド並列）。計算量はトークン数の 2 乗に比例する。フィードフォワードは各トークンを独立に変換する 2 層のネットワークで、パラメータの大半がここにある。それぞれに残差接続と LayerNorm が付く
4. **出力**：最終層の各トークンのベクトル。文全体の表現には `[CLS]` の位置か、全トークンの平均（mean pooling）を使う

### B.3 事前学習：マスク穴埋め（MLM）

ラベルなしの大量テキストで、入力の 15% のトークンを `[MASK]` に置き換えて元の単語を当てる訓練をする。これだけで文法・語彙・常識的な共起を学ぶ。BERT は次文予測（NSP）も行ったが、RoBERTa が不要と示し、以後のモデルは MLM だけである。

### B.4 ファインチューニングの 2 形式

- **分類（クロスエンコーダ）**：「前提 `[SEP]` 仮説」を 1 本の入力にして `[CLS]` からクラスを出す。精度は高いがペアごとに計算が必要。本研究の分類型 FactCheck-BERT とリランカーがこれ
- **文埋め込み（バイエンコーダ、Sentence-BERT）**：文を別々に入れてベクトルを取り、コサイン類似度が「似た文は高く、違う文は低く」なるよう対照学習する。ベクトルを事前計算できるので検索向き。埋め込み型 FactCheck-BERT がこれ

### B.5 BERT の限界

512 トークンの壁（位置埋め込みが固定）、注意の計算量とメモリがトークン数の 2 乗、2018 年の設計（活性化関数・正規化・学習データ）、パディングの無駄。

### B.6 ModernBERT の改良点（BERT との差分）

| 要素 | BERT | ModernBERT | 効果 |
| --- | --- | --- | --- |
| 位置の表し方 | 学習した位置埋め込み（512 個） | RoPE（回転位置埋め込み）：Query と Key を位置に応じて回転させ、内積が相対距離だけに依存 | 上限がなく 8,192 トークンまで扱える |
| 注意の範囲 | 全層で全トークン同士 | 交互注意：3 層に 1 層だけグローバル、残りは前後 128 トークンのローカル | 長文での計算量が大幅に減る |
| 注意の実装 | 素朴な行列計算 | FlashAttention | 8,192 トークンでもメモリが足りる |
| パディング | 最長に合わせて埋める | Unpadding：バッチ内の文をつなげて 1 本に | 実データで 10〜20% 以上高速 |
| 活性化関数 | GELU | GeGLU | 同じパラメータ数で精度向上 |
| 正規化 | Post-LN | Pre-LN＋バイアス項削除 | 学習が安定 |
| 学習データ | Wikipedia＋書籍（33 億トークン） | Web・コード・論文（2 兆トークン） | 現代の文体に強い |
| マスク率 | 15% | 30% | 大規模データでは高い方が効率的 |
| 次文予測 | あり | なし | RoBERTa の知見 |
| 学習時の文脈長 | 512 固定 | 1,024 で大半を学習し、最後に 8,192 に延長 | 長文能力を安く獲得 |
| トークナイザ | WordPiece（30,522） | BPE（50,368、日本語版は 102,400） | コードや記号に強い |

日本語版 ModernBERT-Ja は SB Intuitions がこの設計をそのまま使い、日本語・英語 4.4 兆トークンで 30M〜310M の 4 サイズを学習したものである。

### B.7 本研究にとって重要な点

1. 「分割しない」が意味を持つのは RoPE と交互注意の組み合わせによる。RQ2 の考察はここを説明する
2. ローカル注意の窓は 128 トークンなので、離れた 2 段落の矛盾を捉えるのはグローバル注意層。長文評価セットは「冒頭の主張と末尾の訂正」のような遠距離の関係を狙って集める
3. ローカル層の計算量は線形なので、スマホでも 2,048 トークン程度は現実的（サイトの `max_seq_browser` の根拠）
4. 段階 1（DAPT）のマスク率は 30% に合わせる（BERT の 15% では事前学習と条件がずれる）

## 付録 C. 準拠した講座（日本ファクトチェックセンター「JFC 講座 実践編」）と取り入れた点

| 回 | 題 | 要点 | システムへの取り入れ |
| --- | --- | --- | --- |
| 1 | ファクトチェックの基礎：検証対象・過程・結果を明示する | 客観的に検証可能な事実だけを対象にし、過程と証拠を公開して読者が再現できるようにする | 「ファクトチェック」タブの 3 段構成、検証可能性の自動判定、検証記事の下書き |
| 2 | 最大の武器「高度な検索」 | site:go.jp / site:lg.jp / after: / before: / filetype: / inurl: を組み合わせ、何度も試す | 検索式の自動生成、演算子ビルダー、各エンジンへのリンク |
| 3 | 偽画像：Google レンズや TinEye | オリジナル探しが要。TinEye の最古順。InVID 拡張で複数検索 | 画像 URL からの逆検索リンク 4 種 |
| 4 | 偽動画：InVID や YouTube 検索のコツ | 特徴的な場面を静止画にして逆検索、画面内の文字で検索 | YouTube サムネイル 4 枚の取り出しと逆検索 |
| 5 | 生成 AI をファクトチェック | 細部の不自然さ、大手報道の有無、本人の普段の発言 | 8 項目チェックリスト、裏取り数の数値化 |
| 6 | OSINT：公開データで真偽を判別 | ジオロケーション（地図・ストリートビュー・ナンバープレート） | 地図・Earth・地理院地図・SunCalc へのリンク |
| 7 | 使えるサイトやツール | e-Gov・e-Stat・Fact Check Explorer・FIJ ナビ・JFC・Bellingcat ツールキット | 「ツール」タブの公開データ欄 |
| 8 | ファクトチェックと調査報道 | 共通は OSINT。違いは「証拠を公開して判定を下す」こと | 検証記事に検索式・URL・方法と限界を必ず残す |
| 9 | プリバンキング：情報の空白を埋める | 信頼できる情報がない話題で誤情報が信じられる。先回りして解説を置く | データボイド警告、ナレッジギャップ検出 |
| 10 | ファクトチェックと教育 | 認知バイアスとアルゴリズムを含むリテラシー教育、多主体の連携 | 「学ぶ」タブ。教育学部の卒論としての考察（授業での利用） |

講座は YouTube（日本ファクトチェックセンターチャンネル）と、同センターのサイトの記事版（jfc-factcheck-course-practice1〜10）で公開されている。判定ラベル・原則は「ファクトチェックとは 定義・ルール・手法を解説」による。

---

この計画書のコードとモデルは GitHub の modernbert-lab リポジトリにあり、システムは https://224096-cmd.github.io/modernbert-lab/ で動作する。
