# 卒業論文 研究計画書（第 4 版）

2026 年 10 月 17 日改訂（第 4 版：学習環境を自前の GPU（WSL2 ＋ RTX 3060）に、評価の主軸を JAD-AFC に、データセットを最小構成に。第 3 版までのシステム変更（2 画面・グラフ・比較表・並び順）を反映。10 月 17 日：FactCheck-BERT 第 2 版の学習・評価（7 章・9 章）と、文単位照合・数値規則・既定モデルの切替え（サイト v6.4〜6.5）を追記）

## 1. 研究題目

**ModernBERT を用いた Web 情報の信頼性評価システムの構築**

副題：ファクトチェックの実務手順（検証対象の明示 → 検証過程の公開 → 判定）をスマートフォンで完結させる PWA と、独自モデル FactCheck-BERT の開発

固定するのは「テーマ」と「独自の ModernBERT（FactCheck-BERT）を開発する」の 2 点。第 3 版では、システムの骨格を日本ファクトチェックセンター（JFC）の講座「実践編 1〜10」で示される実務手順に合わせて組み直した。すなわち、本システムは「AI が真偽を言い当てる装置」ではなく、**人がファクトチェックの手順を正しく踏むのを、端末内の BERT が速く・漏れなく支援する道具**である。

FactCheck-BERT とは、日本語 ModernBERT を土台に、(a) 文の客観性・一次情報性を測る**埋め込み型**と、(b) 主張と証拠の含意（一致・矛盾・無関係）を判定する**分類型**の 2 つを、無料公開データのみで追加学習したモデルの総称である。学習は研究者自身が自前の GPU（Surface Pro 9 ＋ eGPU RTX 3060、WSL2 Ubuntu）でリポジトリの `research/` スクリプトを用いて実行し、できたモデルは ONNX（int8）に変換してブラウザで動かす。

## 2. 背景と目的

### 2.1 問題

検索結果の上位には SEO 目的の記事・広告・根拠の薄いまとめが並び、画像や動画は過去のものや生成 AI によるものが「今の出来事」として拡散する。JFC と国際大学 GLOCOM による 2 万人調査では、偽・誤情報を「正しい」と判断した人が 51.5%、「誤り」と見抜けた人は 14.5% にとどまり、逆画像検索を実際に行う人は 6.7% しかいない。一方で、検索・逆画像検索・公開データの照合といった手順は確立されており（JFC 講座 実践編）、問題は「手順を知らない」ことと「手順が面倒で続かない」ことにある。

### 2.2 既存のファクトチェック手順（本研究が準拠する枠組み）

1. **検証対象の明示**：客観的に検証可能な事実だけを対象にし、意見・予測は扱わない。選定は「広さ・深さ・近さ」で判断する
2. **検証過程の公開**：高度な検索（site: / filetype: / after: 等）、逆画像検索（Google レンズ・TinEye）、動画のキーフレーム抽出（InVID）、公開データ（e-Stat・e-Gov・国会会議録）、ジオロケーション（地図・ストリートビュー）を使い、検索式と出典 URL をすべて示して読者が再現できるようにする
3. **判定**：正確／ほぼ正確／根拠不明／不正確／誤り の 5 段階で示し、誤りは透明に訂正する
4. **プリバンキング**：信頼できる情報が検索結果にない「情報の空白（データボイド）」を先回りして埋める

### 2.3 目的

上の手順を 1 つの PWA（スマートフォンにインストールでき、照合・判定を端末内で行う Web アプリ。公開情報の収集にはインターネット接続が要る）に実装し、手順のうち「大量の記事を読んで主張と突き合わせる」「客観性・一次情報性を見積もる」「答えのない問いを見つける」という言語処理の部分を、**端末内で動く日本語 ModernBERT** に担わせる。さらに、公開データのみで追加学習した独自モデル **FactCheck-BERT** が、既存の公開モデルよりこの用途で優れるかを検証する。

ModernBERT を選ぶ理由は、(1) 8,192 トークンまで分割せずに読めるため記事全体と主張を一度に照合できる、(2) 日本語版（sbintuitions/modernbert-ja-30m/70m/130m/310m）があり、量子化すれば 30〜70 MB でスマートフォンのブラウザで動く、(3) ライセンスが MIT／Apache-2.0 で再配布できる、の 3 点である。

### 2.4 現状（2026 年 10 月）

システム（GitHub Pages で公開：modernbert-lab v5.3）は動作しており、既存の公開モデル 10 種（埋め込み 5・含意 3・関連度 2）を役割ごとに切り替えて使える。学習・評価のスクリプト（`research/`）とデータ準備は完成し、CPU での予備実験で「汎用 NLI だけで学習したモデルはファクトチェックデータ（JAD-AFC）で偶然水準（35%）、AFC 訓練 434 件で微調整すると 81%」という結果を得ている。独自モデルの本学習はこれからで、土台候補は「学習前の状態」で同じ画面から試せる（ゼロショット基準）。

### 2.5 作業の分担

学習・評価・判断は研究者が行う。AI（対話型支援）は手順の説明とコードの確認にのみ使い、実験の実行・記録・考察は研究者本人が行う。

## 3. 研究課題と仮説

| 課題 | 問い | 仮説 |
| --- | --- | --- |
| RQ1 独自モデルの効果 | ファクトチェック由来のデータで微調整した FactCheck-BERT は、汎用 NLI だけで学習したモデルや海外の多言語 NLI より、主張と証拠の照合（一致・矛盾・無関係）と客観性の判定に強いか | 強い。予備実験では汎用 NLI だけが偶然水準（35%）、ファクトチェックデータ 434 件の微調整で 81% |
| RQ2 検索の改善 | 信頼性スコアと関連度で並べ替えると、検索エンジンの元の順位より上位の質が上がるか | 上がる |
| RQ3 端末内実行 | 30M クラスのモデルを int8 でスマートフォンのブラウザで動かして、実用的な時間で検証できるか | できる（モデル合計 100 MB 以下、1 記事 5 秒以内） |

RQ1 が中心。RQ2・RQ3 はシステムとしての有効性。ModernBERT（8,192 トークン）を土台に選ぶのは記事全体と主張を一度に照合するためで、それ自体の検証（長文一括 vs 分割）は本研究の範囲外とする。

## 4. システム構成（PWA）とファクトチェック手順の対応

サーバは置かない。GitHub Pages から配られる静的な PWA（HTML＋JavaScript）が、モデル（ONNX int8）を端末の IndexedDB に保存し、検索・本文取得・推論・記録をすべてブラウザ内で行う。API キーも課金もない。スマートフォンでは「ホーム画面に追加」でアプリとして動き、共有メニューから URL を受け取れる。

**2 つの画面（v5）**：利用者を「授業・一般」と「研究者」に分ける。既定の**一般画面**は「ホーム／検証／ツール／履歴／基礎知識／検証の方法」で構成し、「検証」は JFC 講座に沿った 3 段階のファクトチェック手順（検証対象の明示→検索式による収集と照合→判定と記事化）をそのまま踏む。読む記事数・検索式・検索エンジンは利用者が調整でき、結果はグラフ・比較表・ワークシート（自分の判定と理由、印刷）で示す。中学技術・高校情報の授業でそのまま使える。**研究者画面**は鍵つきで、従来の全タブ（検証・ギャップ・構造化・モデル切替・パラメータ）を持つ。判定の式・モデル・しきい値は両画面で同一。これにより、学校教育（技術・情報の授業での情報の信頼性・メディアリテラシー教材）としての利用と、研究としての実験を同じコードで両立する。

### 4.1 画面と手順の対応

| ファクトチェックの手順（JFC 講座） | アプリの画面（タブ） | ここで BERT がすること |
| --- | --- | --- |
| ① 検証対象を明示（検証可能な事実か、広さ・深さ・近さ） | 「ファクトチェック」①：主張・出どころ URL・拡散状況を入力し、検証可能性を自動判定 | （現状は語彙規則。将来は分類型 FactCheck-BERT に「事実／意見／予測」を学習） |
| ② 高度な検索で一次情報まで辿る | 同②：6 種類の検索式（完全一致・site:go.jp・報道・ファクトチェック・否定・一次資料）を生成し、アプリ内で自動収集。「ツール」に演算子ビルダー | 収集記事の重複統合・クラスタ（埋め込み） |
| ② 主張と根拠の突き合わせ | 同②：集めた全文と主張を照合し、支持・反証の段落を出典付きで列挙 | 埋め込みで候補段落を絞り、含意モデルで 一致／矛盾／無関係（記事全体を分割せずに照合） |
| ② 画像・動画のオリジナルを探す | 「ツール」：Google レンズ・TinEye・Yandex・Bing を画像 URL で開く。YouTube は 4 枚のキーフレームを取り出して逆検索 | （画像は扱わない） |
| ② 生成 AI の見分け | 「ツール」：8 項目のチェックリスト、Content Credentials 検証 | 「大手報道が同じ出来事を報じているか」を裏取り数で数値化 |
| ② OSINT・ジオロケーション | 「ツール」：Google マップ・Earth・地理院地図・SunCalc・Wayback・archive.today | — |
| ② 公開データ・検証済みか確認 | 「ツール」：Fact Check Explorer・JFC・FIJ ナビ・e-Stat・e-Gov・国会会議録・法令検索を検索語で開く | — |
| ③ 判定と記事化（過程の公開） | 同③：5 段階の判定の下書きと、検証対象・検索式・ツール・根拠 URL・方法と限界を並べた Markdown 記事。判定は人が変更できる | 根拠段落の抽出と判定の下書き |
| プリバンキング（情報の空白） | 「集める」：公的・報道の割合が低いと警告。「ギャップ・対立」：答えのない問いと反対意見を列挙 | 問いの回答有無（リランカー）・立場分類（埋め込みゼロショット） |
| 教育 | 「学ぶ」：講座リンク・原則・調査の数字 | — |
| （研究用） | 「検証」矛盾・偏り・一次情報・時間的矛盾、「構造化」比較表・要約・Q＆A・意味差分、「モデル」切り替えと速度計測 | すべて埋め込み・含意・関連度の 3 役割の組み合わせ |

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
| IndexedDB／Service Worker／Web App Manifest | ブラウザ標準 | モデルと履歴の端末内保存（モデルは再取得しない）、インストール |

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
| Surface Pro 9 ＋ eGPU（RTX 3060 12GB、Thunderbolt 4） | 自前ハードウェア | すべての学習・評価 |
| WSL2（Ubuntu 24.04）＋ Windows 側 NVIDIA ドライバ | OS | Linux 環境。Ubuntu 側にドライバは入れない |
| Python 3.12 ＋ venv、PyTorch（cu126）、transformers・datasets・sentence-transformers・onnx・onnxruntime | Python ライブラリ | 学習・評価・変換（すべて pip） |
| VS Code ＋ WSL 拡張 | デスクトップ | 編集・実行 |
| Hugging Face Hub | Web サービス | 土台モデルの取得（登録不要） |
| リポジトリの `research/`（prepare\_data・eval\_nli・eval\_objectivity・finetune\_nli・finetune\_embed・run\_all）と `mbo/`（export\_onnx・calibrate・bench） | 自作スクリプト | 手順の自動化。引数を変えるだけで土台・データを入れ替えられる |
| 外付け SSD | 自前ハードウェア | 完成モデルと結果のバックアップ |
| Google Colab（無料 T4） | Web サービス | eGPU が使えないときの予備（同じスクリプトがそのまま動く） |

使わないもの：有料 API（Google Custom Search・Bing Search API 等）、LLM API、常時サーバ（Vercel／Render のバックエンド）、人物検索・アカウント特定・非公開情報の取得に関わるツール。

## 5. FactCheck-BERT の作り方（Ⅰ）土台モデルの候補

FactCheck-BERT は 2 つの部品からなる。**分類型**（主張と証拠の含意：一致・矛盾・無関係）と**埋め込み型**（客観性・一次情報性・類似度）。土台は次のように決める（いずれも ModernBERT-Ja 製、8,192 トークン対応）。

| 部品 | 主の土台 | 比較に使う既存モデル（学習はしない） | サイトで学習前のまま試せる名前 |
| --- | --- | --- | --- |
| 分類型 | `sbintuitions/modernbert-ja-30m`（37M、MIT。スマホで動く） | `MoritzLaurer/multilingual-MiniLMv2-L6-mnli-xnli`（海外の定番多言語 NLI）と、素の `modernbert-ja-30m`（学習なし＝偶然水準） | nli-ja-30m（30m を汎用 NLI だけで学習した例） |
| 埋め込み型 | `cl-nagoya/ruri-v3-pt-30m`（37M、Apache-2.0。弱教師の対照学習済み・仕上げ前） | `cl-nagoya/ruri-v3-pt-30m` の学習前（同じモデルを学習せずに測る） | ruri-v3-pt-30m、modernbert-ja-30m-embed |

### 土台の事前学習データとの重なり（確認済み）

「評価データを土台がすでに見ている」と結果が水増しされるので、使うデータごとに確認した。

| データ | modernbert-ja（マスク穴埋めのみ。Web コーパス 3.5 兆トークン） | ruri-v3-30m（公開版の仕上げ学習データ） | 扱い |
| --- | --- | --- | --- |
| JAD-AFC（主評価） | 含まない（2025 年公開の小規模ラベル付きデータ） | 含まない | **問題なし**。主結果はこれで示す |
| JNLI・JSICK・JaNLI（学習） | 含まない（ラベルなしの事前学習。公式の評価に使われているだけ） | JaNLI は ruri-v3 の仕上げ学習に含まれる | 分類型の土台は modernbert-ja なので問題なし。**JaNLI を評価には使わない**（ruri-v3 を比較するときに不公平） |
| JSTS（対照学習の正例・検索性能の確認） | 含まない | 含まない（仕上げデータの内訳になし） | 学習に使うのは train 分割だけ。検索性能の確認は test 分割 |
| livedoor・WRIME（客観性） | 含まない（公式の評価に使われているだけ） | 含まない | 問題なし |
| Wikipedia 本文（客観文の正例） | Web コーパスに含まれている可能性が高い（本文のみ、「客観」ラベルはない） | 同左 | ラベルの漏れはないが、客観性評価は **Wikipedia を除いた livedoor＋WRIME だけの数値も併記**する（`eval_objectivity.py --no_wiki`） |

結論：主評価（JAD-AFC）はどの土台の事前学習にも含まれず、比較は公平。汎用 NLI や livedoor・WRIME は土台の「公式ベンチマーク」であって学習データではないので、微調整に使ってよい。Wikipedia だけは本文が事前学習に含まれうるので、除外した数値を併記して影響がないことを示す。

## 6. FactCheck-BERT の作り方（Ⅱ）使用するデータセット

論文として成り立つ最小構成に絞る。すべて無料公開で、リポジトリの `research/prepare_data.py` が自動取得する。

| 用途 | データ | 内容・規模 | ライセンス | 学習／評価 |
| --- | --- | --- | --- | --- |
| ファクトチェック（主） | **JAD-AFC**（Fujitsu Research） | 日本ファクトチェックセンターの検証記事 258 本由来の 612 件（主張・証拠説明・真偽 True/False/NEI・カテゴリ） | Apache-2.0 | 記事単位で 70/15/15 に分割。分類型の学習と**主評価**。5 分割交差検証 |
| 含意（汎用） | JNLI・JaNLI・JSICK | 合計約 3.8 万対 | CC BY-SA 4.0 | 分類型の学習（AFC と混合） |
| 客観文（正例） | livedoor ニュースコーパス・Wikipedia 日本語 | 7,367 記事＋抽出 5,000 記事 | CC BY-ND 2.1・CC BY-SA 4.0 | 埋め込み型の対照学習と客観性評価 |
| 主観文（負例） | WRIME ver.2 | SNS 投稿 3.5 万件 | 研究利用可 | 同上 |
| 類似ペア | JSTS | 類似度 4.0 以上を正例に | CC BY-SA 4.0 | 対照学習・検索性能の確認 |

データの形：含意は `{premise: 証拠文, hypothesis: 主張, label: 0=含意 1=中立 2=矛盾}`、客観性は `{text, label: 1=客観 0=主観}`、対照学習は `{anchor, positive, negative}`。学習データはリポジトリに置かず、論文に出典とライセンスを明記する。

自作の評価セット（9.3）はこれとは別に、実際の Web 記事の段落（長文）での評価のために作る。

## 7. FactCheck-BERT の作り方（Ⅲ）自前 GPU での学習手順

学習はすべて研究者が WSL2（Ubuntu）＋ RTX 3060 で実行する。環境構築の詳細（ダウンロード元 URL を含む）は別文書「FactCheck-BERT 学習環境の構築と実験手順書」。すべてのスクリプトはリポジトリの `research/` にあり、結果は `results/*.jsonl` に 1 行ずつ追記される（そのまま論文の表になる）。

| 段階 | 目的 | スクリプト | RTX 3060 での目安 | 成果物 |
| --- | --- | --- | --- | --- |
| 0 準備 | 環境確認とデータ作成 | `env_check.py`、`prepare_data.py` | 15 分 | `data/*.jsonl` |
| 1 基準 | 既存モデルと「汎用 NLI だけ」モデルの精度 | `eval_nli.py`、`eval_objectivity.py`、`finetune_nli.py`（nli\_train のみ） | 15 分 | `results/` の基準行 |
| 2 分類型 | 汎用 NLI ＋ JAD-AFC で微調整 | `finetune_nli.py` | 1 本 12 分。アブレーション 2 本と 5 分割を含めて約 2 時間 | `~/fcb/fcb-nli-30m`, `fcb-nli-30m-afconly`, `fcb-nli-30m-nlionly`, `cv1`〜`cv4` |
| 3 埋め込み型 | 対照学習（客観↔主観） | `finetune_embed.py` | 15 分 | `~/fcb/fcb-embed-30m` |
| 4 評価 | 同じテスト・同じスクリプトで測り直し。5 分割交差検証 | `eval_nli.py`、`eval_objectivity.py`、`mbo.bench` | 1 時間 | `results/` |
| 5 書き出し | ONNX int8 に変換してサイトへ | `mbo.export_onnx`、`mbo.calibrate`、`scripts/fix_meta.py` | 10 分 | `models/fcb-*` |

### 第 2 版への改訂（2026-10-13〜17）

第 1 版（JAD-AFC テスト 0.834）は、実際の Web 段落で「危険だ」「危険ではない」の両方を「一致」と答え、主張の極性を読み分けられなかった。原因は、学習データに「同じ記事の表と裏の主張」がなく、評価にもそれを測る指標がなかったことにある。そこで配合を変えて学習し直し、評価指標を 2 つ足した（9.4 節）。

| 版 | 汎用 NLI | JAD-AFC 側 | 入力長 | 5 分割 正解率 | 極性一貫性 | 判断 |
| --- | --- | --- | --- | --- | --- | --- |
| 第 1 版 | JNLI＋JaNLI＋JSICK 3.8 万対 | 正当性説明文 434×3 | 256 | 0.834±0.029 | 未測定（実 Web で破綻） | 置き換え |
| 第 2 版 1 段階 | 上 ＋ JSNLI 6 万対 | 拡張セット 2,320×2 | 384 | 0.749±0.016 | 0.60 | 不採用 |
| 第 2 版 2 段階 | 汎用 NLI（JSNLI 込み）→ AFC 拡張 | 同上 | 384 | 0.740±0.032 | 0.57 | 不採用 |
| **第 3 案 a（採用＝第 2 版）** | JSNLI なし 3.8 万対 | 拡張セット 2,320×3 | 384 | **0.771±0.042**（雑音つき 0.773±0.013） | **0.57** | **採用** |
| 第 3 案 b | 同上 | 極性ペアまで、雑音なし | 256 | 0.773（seed 0） | 0.54 | 不採用 |

拡張セット（`prepare_data.py --only afc,aug`、`data/afc_train_aug.jsonl`）は、各正当性説明文に対して (a) 主張を規則で否定形にした極性ペア（一致↔矛盾を反転）と、(b) 前提に無関係な文を混ぜた雑音つき前提を加えたもの。分かったことは 2 つ。JSNLI（画像説明文の短い対 6 万件）は長文ファクトチェックに逆効果で、足すと正解率が 0.75 まで落ちる。極性ペアと雑音つき前提は、雑音を入れたテストでも正解率が落ちない（0.771→0.773）性質と、極性の読み分け（0.04→0.57）に効く。採用した第 2 版は第 1 版より正解率が 0.06 低いが、第 1 版の数字は極性を測っていない上での値なので、同じ土俵では比べられない。再現は `research/run_v3.sh`（seed 0）と `research/run_v3cv.sh`（5 分割 → ONNX → サイト）、集計は `python research/summarize_v2.py v3a`。JSNLI を抜いた汎用 NLI は `data_nojs/`、分割ごとの拡張セットは `data_s1`〜`data_s4` にある。

### 学習の設定値

- 分類型：系列長 256、バッチ 32、学習率 3e-5、エポック 3、ウォームアップ 6%、ラベルスムージング 0.1、bf16。訓練データは汎用 NLI（3.8 万対）＋ JAD-AFC 訓練（434 件を 3 倍に複製）。dev（AFC 90 件）の正解率が最良のエポックを保存
- 埋め込み型：MultipleNegativesRankingLoss、系列長 256、バッチ 64、学習率 2e-5、エポック 1、ペア 4 万（livedoor 隣接段落＋JSTS 高類似を正例、WRIME を負例）、プレフィックスは Ruri と同じ
- アブレーション：「汎用 NLI だけ」「AFC だけ」「両方」の 3 条件を同じ設定で。モデルの大きさは 30M クラスに統一し、より大きいモデルとの比較は行わない（スマホで動かすことが前提のため）

### そのまま打つコマンド（WSL の端末、`~/modernbert-lab` で `source .venv/bin/activate` 後）

```bash
# 段階 0
python research/env_check.py
python research/prepare_data.py --out data
python research/data_report.py --data data --out results/data_report.md   # 量・ラベル分布・漏れ点検・実例
# 段階 1：基準（主評価は afc_*_rationale＝正当性説明文版）
python research/eval_nli.py --model MoritzLaurer/multilingual-MiniLMv2-L6-mnli-xnli --name minilm-l6-xnli --data data/afc_test_rationale.jsonl --note baseline
python research/eval_nli.py --model sbintuitions/modernbert-ja-30m --name modernbert-ja-30m-untrained --data data/afc_test_rationale.jsonl --note "学習前"
python research/eval_objectivity.py --model cl-nagoya/ruri-v3-pt-30m --note baseline
python research/eval_objectivity.py --model cl-nagoya/ruri-v3-pt-30m --note baseline --no_wiki
# 段階 2：分類型（本体 1 本＋アブレーション 2 本）
python research/finetune_nli.py --base sbintuitions/modernbert-ja-30m --train data/nli_train.jsonl data/afc_train_rationale.jsonl --dev data/afc_dev_rationale.jsonl --out ~/fcb/fcb-nli-30m --epochs 3 --bs 32 --seq 256
python research/finetune_nli.py --base sbintuitions/modernbert-ja-30m --train data/afc_train_rationale.jsonl --dev data/afc_dev_rationale.jsonl --out ~/fcb/fcb-nli-30m-afconly --epochs 5 --upweight 1
python research/finetune_nli.py --base sbintuitions/modernbert-ja-30m --train data/nli_train.jsonl --dev data/afc_dev_rationale.jsonl --out ~/fcb/fcb-nli-30m-nlionly --epochs 2
# 段階 2b：5 分割交差検証（記事分割の乱数 1〜4 で繰り返す。0 は上の本体）
for s in 1 2 3 4; do
  python research/prepare_data.py --out data_s$s --only afc --seed $s
  python research/finetune_nli.py --base sbintuitions/modernbert-ja-30m --train data/nli_train.jsonl data_s$s/afc_train_rationale.jsonl --dev data_s$s/afc_dev_rationale.jsonl --out ~/fcb/cv$s --epochs 3 --seed $s
  python research/eval_nli.py --model ~/fcb/cv$s --name fcb-nli-30m-cv$s --data data_s$s/afc_test_rationale.jsonl --note cv
done
# 段階 3：埋め込み型
python research/finetune_embed.py --base cl-nagoya/ruri-v3-pt-30m --pairs data/pairs_stage2.jsonl --out ~/fcb/fcb-embed-30m
# 段階 4：評価（同じテスト。証拠説明文版も副として）
for d in fcb-nli-30m-nlionly fcb-nli-30m-afconly fcb-nli-30m; do
  python research/eval_nli.py --model ~/fcb/$d --name $d --data data/afc_test_rationale.jsonl
  python research/eval_nli.py --model ~/fcb/$d --name $d-evidence --data data/afc_test.jsonl
done
python research/eval_objectivity.py --model ~/fcb/fcb-embed-30m --name fcb-embed-30m
python research/eval_objectivity.py --model ~/fcb/fcb-embed-30m --name fcb-embed-30m --no_wiki
# 段階 5：サイトへ
python -m mbo.export_onnx --nli ~/fcb/fcb-nli-30m --out models/fcb-nli-30m && python -m mbo.calibrate --model models/fcb-nli-30m
python -m mbo.export_onnx --embed ~/fcb/fcb-embed-30m --out models/fcb-embed-30m && python scripts/fix_meta.py
```

一括実行は `OUT=~/fcb bash research/run_all.sh`。学習のログと設定値は各モデルの `summary.json`・`train_log.jsonl` に残る。

### 完成モデルの配布

ONNX 化したモデルは GitHub（`models/`）に置く。あわせて Hugging Face のアカウント `mie-edu` にも同じ内容を置き（`mie-edu/factcheck-bert`）、サイトの「設定 → Hugging Face 配布リポジトリ」にその名前を入れるとそちらから読める（GitHub の容量対策と、論文での公開先）。torch 形式のモデル（学習結果そのもの）も同じアカウントに置けば、他の研究者が再現できる。

## 8. 学習・実行環境

| 役割 | 環境 | 備考 |
| --- | --- | --- |
| 学習・評価（主） | Surface Pro 9 ＋ eGPU RTX 3060 12GB（Thunderbolt 4）、WSL2 Ubuntu 24.04、Python 3.12、PyTorch cu126 | 時間制限なし。bf16。30m はバッチ 32 で余裕（VRAM 3 GB 程度） |
| 学習（予備） | Google Colab 無料 T4 | eGPU が使えないとき。同じスクリプトがそのまま動く |
| システムの公開 | GitHub Pages（静的）＋ ブラウザ内推論（onnxruntime-web） | サーバなし。モデルは端末に保存 |
| モデルの配布 | GitHub `models/` と Hugging Face `mie-edu` | サイトの設定で読み先を切り替え可能 |
| コード・結果 | GitHub（`research/`、`results/`） | 学習データ（`data/`）は置かない |
| バックアップ | 外付け SSD（`/mnt/d`） | 完成モデルと結果を実験の区切りごとにコピー |

置き場の原則：リポジトリ・データ・学習中のチェックポイントは WSL 内（`~/modernbert-lab`、`~/fcb`）。Windows ドライブ（`/mnt/c`、`/mnt/d`）は遅いので完成物のコピー先にだけ使う。

### 公開サイトの更新手順（研究者が行う。Windows・PowerShell）

1. リポジトリを取得：`git clone https://github.com/224096-cmd/modernbert-lab.git` → `cd modernbert-lab`（既にあれば `git pull`）
2. VS Code で開き、`docs/` 配下を編集（画面：`index.html`、挙動：`app.js`、手順・ツール：`factcheck.js`、判定：`judge.js`、解析：`analysis.js`、設定値：`params.json`）
3. ローカル確認は不要（GitHub Pages に上げて確認する）。変更を送る：`git add -A` → `git commit -m "変更内容"` → `git push`
4. 1〜2 分後に https://224096-cmd.github.io/modernbert-lab/ を再読み込み（スマホの PWA は一度閉じて開くと更新）
5. モデルを追加するとき：Colab で作った `models/<名前>/`（model\_int8.onnx・tokenizer.json・tokenizer\_config.json・config.json・meta.json）をリポジトリに置き、`models/registry.json` の `browser` に 1 行追加して push。「モデル」タブに自動で並ぶ
6. GitHub Actions を使うとき：GitHub の「Actions」→ ワークフロー（models / train / bench）→「Run workflow」。入力欄に土台モデルの Hugging Face ID と出来上がりの名前を入れる。結果は自動で push される

## 9. 評価計画

### 9.1 比較するモデル

比較は必要最小限に絞る。

| 区分 | モデル | 役割 |
| --- | --- | --- |
| 提案 | **fcb-nli-30m**（汎用 NLI ＋ JAD-AFC）、**fcb-embed-30m**（対照学習） | 本研究の成果 |
| アブレーション | fcb-nli-30m-nlionly（汎用 NLI だけ＝サイトの既存 nli-ja-30m と同条件）、fcb-nli-30m-afconly（AFC だけ） | どのデータが効いたか |
| 既存（外部基準） | multilingual-MiniLMv2-L6 xnli（海外の定番 NLI）、ruri-v3-pt-30m（埋め込みの学習前） | 外部のモデルとの比較、学習前後の比較 |
| 学習なし | 素の modernbert-ja-30m（分類ヘッドが乱数＝偶然水準） | 下限 |

### 9.2 研究課題ごとの指標と判定基準

| 課題 | データ | 指標 | こうなれば支持される |
| --- | --- | --- | --- |
| RQ1 独自モデルの効果 | **JAD-AFC テスト**（記事単位分割、5 分割交差検証）＋ 自作評価セット（補） | 正解率・マクロ F1・True/False 2 値正解率・カテゴリ別；客観性は AUC | fcb-nli-30m が nlionly と MiniLM xnli を上回る（5 分割の平均±標準偏差で区間が重ならない）。fcb-embed-30m の AUC が ruri-v3-pt-30m を上回る |
| RQ2 検索の改善 | 30 クエリ × 上位 10 | Precision@3/5/10、MRR、nDCG@10 | 元の順位より高い |
| RQ3 端末内実行 | スマホ 2 機種・PC 1 台 | ダウンロード量・モデル読込時間・1 記事の判定時間（サイトの「端末レポート」で記録） | モデル合計 100 MB 以下、1 記事 5 秒以内 |

### 9.3 評価データ

1. **JAD-AFC**（主）：612 件を記事単位で 70/15/15 に分割。前提は**正当性説明文**（検証者の判断理由）を主とする。「証拠説明文」は 612 件中 243 件が主張と同一文で文字の一致だけで解けてしまうため、副として併記する。テストは 88 件と小さいので、分割の乱数を 5 通り変えて学習・評価を繰り返し、平均±標準偏差を報告
2. **自作評価セット**（補）：サイトの「検証」で集めた実際の Web 記事の段落に対し、評価者 2 名が「主張と一致／矛盾／無関係」を採点（κ ≥ 0.6）。実際の Web 文章への汎化をこれで見る。URL と採点だけ保存し、本文は再配布しない
3. 客観性：livedoor＋WRIME のテスト分割（記事・投稿者単位で分割。Wikipedia を除いた数値も併記）
4. 汎用性能が落ちていないか：JSTS（埋め込み。学習に使った train とは別の分割）、JNLI テスト（分類）
5. 漏れ防止の点検：`research/data_report.py` が train と test の同じ記事・同じ文を数えて 0 件を確認。データの出どころ・使い方・ライセンスは `research/DATASETS.md`

### 9.4 測り方の統一

- すべてのモデルを同じスクリプト（`research/eval_*.py`）・同じテストで測る。ブラウザ側は同じ ONNX int8・同じ設定（`docs/params.json`）
- 乱数の種を固定し、学習は 5 分割で繰り返す。結果は `results/*.jsonl` に自動追記
- スマホの時間はサイトの設定画面の統計を使い、機種・OS・ブラウザの版を添える
- 第 2 版から 2 指標を追加。**極性一貫性**＝同じ記事の表の主張と、それを規則で否定した裏の主張の対（37 対）で、両方を正しく判定できた割合（`eval_nli.py`、記事単位）。**雑音つきテスト**＝前提に無関係な文を混ぜた `afc_test_noisy.jsonl` での正解率。どちらも「実際の Web 段落で否定形を読み分けられるか」「余計な文に引きずられないか」を直接測る

### 予備実験（自前環境の CPU、2026-10-11、JAD-AFC テスト 88 件、前提＝証拠説明文版）

| モデル | 正解率 | マクロ F1 | True/False 2 値 | 矛盾側 F1 |
| --- | --- | --- | --- | --- |
| modernbert-ja-30m 学習なし（分類ヘッドが乱数＝偶然水準） | 0.489 | 0.219 | 0.494 | — |
| nli-ja-30m（汎用 NLI だけ） | 0.352 | 0.178 | 0.460 | — |
| multilingual-MiniLMv2-L6 xnli（海外の定番） | 0.671 | 0.479 | 0.828 | 0.594 |
| modernbert-ja-30m を JAD-AFC 訓練 434 件だけで 5 エポック（fcb-nli-30m-afconly） | **0.852** | 0.571 | 0.862 | **0.851** |

客観性（obj\_test 1,500 件、学習前の ruri-v3-pt-30m）：重心 AUC 0.970（Wikipedia を除くと 0.951）、ゼロショット AUC 0.54。ラベル文との類似では判別できず、少数の例文の重心を使えば学習前でも高い。埋め込み型の対照学習はこの 0.970 を超えるか、という評価になる。

汎用 NLI（画像説明文）だけではファクトチェック文に転移せず、ファクトチェック由来の少量データだけで 85% に達する。特に矛盾（誤情報）側の F1 が 0.59 → 0.85 と大きく改善する。GPU での本実験（汎用 NLI ＋ AFC、5 分割）でこれを確かめる。

注意：この表は前提に「証拠説明文」を使った値である。データの点検で、証拠説明文は 612 件中 243 件が主張と同一文であることが分かったため（文字の一致だけで解ける）、主評価は前提を「正当性説明文」（検証者の判断理由、主張との類似度の中央値 0.28）にした版（`afc_*_rationale`）で行う。証拠説明文版は副として併記する。

**主評価（正当性説明文版）の予備実験**（CPU、2026-10-11、テスト 88 件）

| モデル | 正解率 | True/False 2 値 | 矛盾側 F1 |
| --- | --- | --- | --- |
| 学習なし（偶然水準） | 0.489 | 0.494 | — |
| multilingual-MiniLMv2-L6 xnli | 0.216 | 0.552 | 0.189 |
| modernbert-ja-30m を AFC 訓練 434 件だけで 5 エポック | **0.716** | **0.724** | **0.713** |

証拠説明文版（85%）より低くなるが、こちらが本来の難しさである。海外の多言語 NLI は検証者の説明文と主張の関係を「無関係」と判定してしまい（88 件中 57 件）、偶然水準を下回る。CPU での 5 エポックは dev 正解率がまだ上がり途中（0.30 → 0.73）なので、GPU で汎用 NLI を混ぜた本体と 5 分割交差検証で確かめる。

**GPU 本実験（2026-10-12、RTX 3060、正当性説明文版）**

| 条件 | 正解率 | True/False 2 値 | 矛盾側 F1 |
| --- | --- | --- | --- |
| 学習なし | 0.489 | 0.494 | — |
| multilingual-MiniLMv2-L6 xnli | 0.216 | 0.552 | 0.189 |
| 汎用 NLI だけ（5 分割） | 0.315 ± 0.098 | 0.488 | — |
| AFC だけ | 0.716 | 0.747 | 0.721 |
| **fcb-nli-30m（汎用 NLI ＋ AFC、5 分割）** | **0.834 ± 0.029** | **0.852 ± 0.021** | **0.851 ± 0.026** |
| 埋め込み型：ruri-v3-pt-30m → fcb-embed-30m | 重心 AUC 0.965 → **0.989**（Wikipedia 除く 0.946 → 0.982） |  |  |

RQ1 の仮説は支持された（5 分割の平均±標準偏差で区間が重ならない）。次は通し検証（検索 → 照合 → 判定）で、この差がシステム全体にどれだけ残るかを測る（`research/e2e_make.py`・サイトの「一括検証（研究用）」・`research/e2e_eval.py`）。

**第 2 版（2026-10-17、RTX 3060、正当性説明文版、極性一貫性と雑音つきを追加）**

| 条件 | 正解率（5 分割） | True/False 2 値 | 矛盾側 F1 | 極性一貫性 | 雑音つき 正解率 |
| --- | --- | --- | --- | --- | --- |
| 汎用 NLI だけ（再評価） | 0.19±0.05 | — | — | 0.04 | — |
| AFC 拡張だけ | 0.705 | — | — | 0.41 | — |
| 第 1 版 fcb-nli-30m | 0.834±0.029 | 0.852±0.021 | 0.851±0.026 | 未測定 | 未測定 |
| **第 2 版 fcb-nli-30m（第 3 案 a）** | **0.771±0.042** | **0.785±0.040** | **0.774±0.051** | **0.574±0.070** | **0.773±0.013** |
| 同・seed 0 単発 | 0.818 | 0.816 | 0.826 | 0.595 | 0.773 |
| 同・証拠説明文版（副） | 0.920 | 0.943 | 0.927 | 0.838 | — |
| 埋め込み型 第 2 版 fcb-embed-30m | 重心 AUC 0.965 → 0.981（Wikipedia 除く 0.946 → 0.979） |  |  |  |  |

第 2 版でも RQ1 の順序（学習なし＜海外 NLI＜汎用 NLI だけ＜AFC だけ＜FactCheck-BERT）は変わらない。極性一貫性は汎用 NLI だけの 0.04 から 0.57 まで上がり、雑音を入れても正解率が落ちない。残る課題は極性一貫性 0.57 で、対の片方を誤る記事が 4 割ある。サイト側（v6.4）はこれを前提に、文単位で照合し、一致・矛盾は確率の差が 0.3 以上のときだけ数え、数値の主張は規則で比較する。

### 9.5 手順支援としての評価（利用者テスト、小規模）

モデルの精度とは別に、「手順を正しく踏むのを助けたか」を測る。同学年の協力者 6〜10 名に、同じ 5 つの主張（評価セットから選ぶ。正解は JFC 等の公開検証記事）を、(a) 検索エンジンだけ、(b) 本アプリ、の 2 条件で検証してもらう（順序は入れ替え）。記録するのは、判定の正誤、所要時間、開いた一次情報の数、検証記事に残した出典 URL の数。さらに「逆画像検索を行ったか」をチェックし、2 万人調査の 6.7% と比べる。人を対象にするので、実施前に指導教員に倫理面（同意・匿名化）を確認する。

## 10. スケジュールとリスク

&#91;embedded content: 研究者の実験計画より · 2026 年 10 月〜2027 年 1 月\]

モデル構築は自前の GPU なので時間制限がなく、1 回の学習は 10〜35 分。`run_all.sh` を 1 回通すと基準測定から ONNX 化まで約 3 時間で終わる。**11 月 10 日までに実験をすべて終え、結果を表にまとめる**。その後は執筆に充てる。

| 期間 | やること | 終わった判定 |
| --- | --- | --- |
| 10/12〜10/15 | 環境構築（WSL2・GPU・venv）、データ準備、既存モデルの基準測定 | `env_check.py` が cuda で OK、`results/` に基準 3 行（MiniLM xnli・学習なし・ruri-v3-pt-30m） |
| 10/16〜10/25 | 分類型 FactCheck-BERT の学習（本体＋アブレーション 2 本）、5 分割交差検証 | RQ1 の表（平均±標準偏差）が埋まる |
| 10/26〜11/1 | 埋め込み型の学習と評価、ONNX 化してサイトに搭載、Hugging Face（mie-edu）へ公開 | `models/fcb-*` がスマホで動く |
| 11/2〜11/8 | RQ2（検索 30 クエリ）・RQ3（端末 3 台）の測定、自作評価セットの採点（κ ≥ 0.6）、利用者テスト | 全指標が `results/` にある |
| 11/9〜11/10 | 結果の表・図を確定、コード凍結（11/10）、指導教員に中間報告 | 論文の実験章の表が全部ある |
| 11/11〜1/24 | 執筆・図表（追加実験は原則しない）。1/30 提出 | — |

### リスクと対策

| リスク | 起きやすさ | 対策 |
| --- | --- | --- |
| eGPU が認識されない・学習中に切れる（Thunderbolt の省電力） | 中 | 電源プランを最高パフォーマンス、ケーブルを抜かない。学習はエポックごとに保存。予備に Colab |
| JAD-AFC が小さく、結果が分割に依存する | 高 | 5 分割交差検証で平均±標準偏差。自作評価セットで補強 |
| FactCheck-BERT が多言語 NLI（MiniLM 67%）に勝てない | 低（予備実験で 81%） | アブレーションでどのデータが効いたかを示す |
| 評価者間の一致が低い | 中 | 採点基準を具体例付きで書き、30 件で練習してから本番 |
| 収集経路（検索・中継）の制限 | 中 | 複数経路に自動切替。評価セットは早めに URL を固定 |
| モデルが 100 MB を超える・スマホで遅い | 低 | 30M クラスだけを使い、int8 で 36 MB |
| 11/10 に間に合わない | 中 | 優先順位は RQ1 ＞ RQ3 ＞ RQ2 ＞ 自作評価セット ＞ 利用者テスト。後ろから削る |
| ライセンス・著作権 | 低 | 学習データは公開ライセンスのもののみ。Web 本文は再配布せず URL と採点だけ保存 |

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

1. 土台は 30M クラス（スマホで動く）だけとし、より大きいモデルとの比較は行わない方針でよいか
2. 主評価を JAD-AFC（612 件、5 分割交差検証）とし、自作評価セットは補助とする構成でよいか
3. 評価セットの採点と利用者テストに協力してもらえる学生がいるか（倫理面の手続きも）
4. RQ を 3 つ（独自モデルの効果・検索の改善・端末内実行）とし、11/10 で実験を締める計画でよいか
5. 教育学部の卒論として、一般画面（授業での利用）を考察にどこまで入れるか

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

### A.4 軽量化・端末内実行（RQ3）

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

1. 記事全体と主張を一度に照合できるのは RoPE と交互注意の組み合わせによる。「なぜ ModernBERT を土台にするか」の説明はここを使う
2. ローカル注意の窓は 128 トークンなので、離れた 2 段落の関係を捉えるのはグローバル注意層。自作評価セットには「冒頭の主張と末尾の訂正」のような遠距離の関係も含める
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
