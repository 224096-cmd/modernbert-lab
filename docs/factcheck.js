/* ファクトチェック手順（検証対象 → 検証過程 → 判定）と、公開情報ツールの起動 URL。
   手順は日本ファクトチェックセンター（JFC）の講座「実践編」の構成に合わせた：
   検証対象・過程・結果を明示 ／ 高度な検索 ／ 画像・動画の逆検索 ／ 生成 AI の見分け ／ OSINT（ジオロケーション）／ 公開データ ／ プリバンキング ／ 教育。
   ここにあるのは「URL を組み立ててユーザーのブラウザで開く」だけ。人物検索・アカウント特定・非公開情報の取得は行わない。 */

const enc = encodeURIComponent;

/* ---------- JFC 式の判定ラベル（5 段階）＋ 判定留保 ---------- */
export const RATINGS = {
  accurate: ["正確", "ok", "主張の内容が、信頼できる複数の一次情報・報道と一致する"],
  mostly: ["ほぼ正確", "ok", "大筋は正しいが、数値や表現の一部に不正確さがある"],
  unfounded: ["根拠不明", "muted", "主張を裏づける公開情報が見つからない（否定もされていない）"],
  inaccurate: ["不正確", "warn", "一部は事実だが、重要な点で事実と異なる・文脈が欠けている（ミスリード）"],
  false_: ["誤り", "bad", "信頼できる情報源が主張を否定している"],
  hold: ["判定留保", "muted", "意見・予測・未確定の事柄など、客観的に検証できない主張"],
};
/* システムの verify 結果（supported / refuted / mixed / insufficient）と出所の質から、JFC 式ラベルの「下書き」を作る */
export function suggestRating(v, checkable) {
  if (!checkable) return "hold";
  const strong = (v.support_domains || []).length >= 2 && v.support >= 1.5;
  if (v.verdict === "supported") return strong ? "accurate" : "mostly";
  if (v.verdict === "refuted") return "false_";
  if (v.verdict === "mixed") return "inaccurate";
  return "unfounded";
}

/* ---------- 検証対象として適切か（JFC：客観的に検証可能な事実だけを対象にする） ---------- */
const OPINION = /(べきだ|べきで|と思う|だろう|かもしれない|のではないか|最高|最悪|素晴らしい|ひどい|許せない|絶対に|必ず|間違いなく|〜と感じ|感じる|無駄|意味がない|は正しい|は間違っている)/;
const FUTURE = /(予定|見込み|見通し|予測|になるだろう|するはず|起こる|起きる(?!た)|来年|今後|将来)/;
const FACTUAL = /(\d|年|月|日|円|人|件|％|%|倍|億|万|増|減|発表|決定|施行|可決|開始|廃止|導入|公表|調査|統計|によると|と述べ|と発言|法律|条例|制度)/;
export function checkable(claim) {
  const why = []; let ok = true;
  if (OPINION.test(claim)) { why.push("評価・意見の表現を含む（「〜べき」「最悪」など）→ 意見は検証対象外"); ok = false; }
  if (FUTURE.test(claim) && !/(と発表|と予測した|見通しを示した)/.test(claim)) { why.push("未来の予測を含む → 「誰がその予測を公表したか」なら検証できる"); ok = false; }
  if (!FACTUAL.test(claim)) why.push("数値・日付・固有の出来事が含まれない → 検証しにくい。具体的な言い回しに直すとよい");
  if (claim.length < 8) { why.push("短すぎる"); ok = false; }
  if (claim.length > 200) why.push("長い → 一つの事実ごとに分けて検証する（JFC も 1 記事 1 主張が基本）");
  if (ok && !why.length) why.push("客観的に検証できる事実の形になっている");
  return { ok, why };
}
/* 選定基準（広さ・深さ・近さ）の自己チェック項目 */
export const SELECTION = [["広さ", "どれだけ多くの人に関わるか（拡散数・対象人口）"], ["深さ", "信じた場合の影響の重さ（健康・金銭・安全・選挙）"], ["近さ", "読者の生活にどれだけ身近か"]];

/* ---------- 高度な検索：演算子ビルダー ---------- */
export const OPERATORS = [
  ["\"…\"", "完全一致。言い回しそのものを探す", q => `"${q}"`],
  ["site:go.jp", "国の機関だけ", q => `${q} site:go.jp`],
  ["site:lg.jp", "地方自治体だけ", q => `${q} site:lg.jp`],
  ["site:ac.jp", "大学・研究機関", q => `${q} site:ac.jp`],
  ["site:〈報道〉", "主要報道機関", q => `${q} (site:nhk.or.jp OR site:nikkei.com OR site:asahi.com OR site:yomiuri.co.jp OR site:mainichi.jp OR site:jiji.com OR site:kyodo.co.jp)`],
  ["ファクトチェック", "検証済みか探す", q => `${q} (site:factcheckcenter.jp OR site:navi.fij.info OR site:infact.press OR site:litera.jp OR "ファクトチェック")`],
  ["filetype:pdf", "報告書・統計の原本", q => `${q} filetype:pdf`],
  ["after:/before:", "期間を絞る（Google）", (q, o) => `${q} after:${o.after || "2024-01-01"}${o.before ? " before:" + o.before : ""}`],
  ["intitle:", "見出しに含む", q => `intitle:"${q}"`],
  ["inurl:", "URL に含む", q => `${q} inurl:${(q.match(/[a-z0-9]+/i) || ["pdf"])[0]}`],
  ["-site:", "SNS・まとめを除外", q => `${q} -site:x.com -site:twitter.com -site:togetter.com -site:5ch.net`],
  ["否定・訂正", "デマ・誤り・訂正の報道", q => `${q} (デマ OR 誤り OR 訂正 OR 事実無根 OR "根拠がない")`],
];
export const ENGINES = {
  google: ["Google", q => `https://www.google.com/search?q=${enc(q)}&hl=ja`],
  google_news: ["Google ニュース", q => `https://news.google.com/search?q=${enc(q)}&hl=ja&gl=JP&ceid=JP:ja`],
  bing: ["Bing", q => `https://www.bing.com/search?q=${enc(q)}&setlang=ja`],
  ddg: ["DuckDuckGo", q => `https://duckduckgo.com/?q=${enc(q)}&kl=jp-jp`],
  yahoo: ["Yahoo! JAPAN", q => `https://search.yahoo.co.jp/search?p=${enc(q)}`],
  youtube: ["YouTube", q => `https://www.youtube.com/results?search_query=${enc(q)}`],
  x: ["X（公開投稿）", q => `https://x.com/search?q=${enc(q)}&f=live`],
};

/* ---------- ツールカタログ（講座の章ごと） ---------- */
export const TOOLS = [
  { key: "search", title: "高度な検索（実践編 2）", desc: "検索演算子で「誰が・いつ・どこで言ったか」の一次情報まで辿る。Google の仕組みの解説も読んでおく", items: [
    { n: "Google 検索（演算子つき）", u: q => ENGINES.google[1](q), need: "q", note: "site: / filetype: / after: / before: / intitle: / inurl: / \"完全一致\" / -除外" },
    { n: "Google 高度な検索フォーム", u: q => `https://www.google.com/advanced_search?q=${enc(q)}&hl=ja`, need: "q", note: "演算子を覚えなくてもフォームで同じ絞り込みができる" },
    { n: "Google ニュース", u: q => ENGINES.google_news[1](q), need: "q", note: "報道だけに絞って時系列で見る" },
    { n: "Bing", u: q => ENGINES.bing[1](q), need: "q", note: "Google と索引が違う。見つからないとき" },
    { n: "DuckDuckGo", u: q => ENGINES.ddg[1](q), need: "q", note: "追跡なし。括弧と after: は使えない" },
    { n: "Google 検索の仕組み（公式）", u: () => "https://www.google.com/intl/ja/search/howsearchworks/", note: "なぜその順位になるか" },
  ] },
  { key: "image", title: "画像の検証（実践編 3）", desc: "偽画像の多くは「過去の画像を今のものとして使う」「加工する」。逆画像検索で最初に出た場所（オリジナル）を探す", items: [
    { n: "Google レンズ（URL から）", u: u => `https://lens.google.com/uploadbyurl?url=${enc(u)}`, need: "img", note: "似た画像とその出所。Chrome なら画像を右クリック →「Google で画像を検索」" },
    { n: "TinEye", u: u => `https://tineye.com/search?url=${enc(u)}`, need: "img", note: "「Sort by oldest」で最も古い掲載＝オリジナル候補を見る" },
    { n: "Yandex 画像検索", u: u => `https://yandex.com/images/search?rpt=imageview&url=${enc(u)}`, need: "img", note: "顔・風景の一致に強い。海外発の画像に" },
    { n: "Bing ビジュアル検索", u: u => `https://www.bing.com/images/search?view=detailv2&iss=sbi&form=SBIVSP&sbisrc=UrlPaste&q=imgurl:${enc(u)}`, need: "img", note: "Google で出ないとき" },
    { n: "InVID-WeVerify 拡張（Chrome）", u: () => "https://weverify.eu/verification-plugin/", note: "右クリックから複数の逆画像検索を一度に。動画のキーフレーム抽出も" },
  ] },
  { key: "video", title: "動画の検証（実践編 4）", desc: "動画は「特徴的な場面を静止画にして逆画像検索」が基本。画面内の文字（イベント名・放送局ロゴ）を検索語にする", items: [
    { n: "YouTube サムネイル → 逆画像検索", u: null, need: "yt", note: "YouTube の URL を入れると 4 枚のキーフレーム（InVID と同じ考え方）を取り出し、それぞれ Google レンズ／TinEye に送れる" },
    { n: "YouTube 検索", u: q => ENGINES.youtube[1](q), need: "q", note: "画面に映る文字・団体名・日付で元動画を探す" },
    { n: "InVID-WeVerify（Video analysis）", u: () => "https://weverify.eu/verification-plugin/", note: "YouTube／Facebook の動画からキーフレームとメタデータ" },
  ] },
  { key: "ai", title: "生成 AI の見分け（実践編 5）", desc: "細部の不自然さ（手・指、背景の文字、水面の反射、瓦礫、口だけ動く表情）を見る。決定打は「大手報道が報じているか」「本人が普段そう発言するか」", items: [
    { n: "チェックリスト", u: null, need: "ai", note: "下の 8 項目を確認して記録に残す" },
    { n: "Content Credentials 検証（C2PA）", u: () => "https://contentcredentials.org/verify", note: "対応カメラ・生成サービスの画像なら来歴（生成/編集履歴）を表示。無ければ判定不能" },
    { n: "Google レンズで出所確認", u: u => `https://lens.google.com/uploadbyurl?url=${enc(u)}`, need: "img", note: "実在する写真・報道写真と一致するか" },
  ] },
  { key: "osint", title: "OSINT・ジオロケーション（実践編 6）", desc: "写真の高架・電柱・看板・ナンバープレートの形から場所を特定し、地図・ストリートビューと突き合わせる。公開情報のみ", items: [
    { n: "Google マップ", u: q => `https://www.google.com/maps/search/${enc(q)}`, need: "q", note: "地名→候補地を絞る。ペグマンでストリートビュー" },
    { n: "Google Earth（Web）", u: q => `https://earth.google.com/web/search/${enc(q)}`, need: "q", note: "俯瞰で高速道路・河川・建物配置を照合" },
    { n: "国土地理院 地理院地図", u: () => "https://maps.gsi.go.jp/", note: "過去の空中写真・標高・災害時の写真" },
    { n: "SunCalc（太陽の位置）", u: () => "https://www.suncalc.org/", note: "影の向きから撮影時刻・季節を推定" },
    { n: "Wayback Machine（ページの過去）", u: u => `https://web.archive.org/web/*/${u}`, need: "url", note: "削除・改変前の内容。「保存」も可能" },
    { n: "archive.today", u: u => `https://archive.ph/${u}`, need: "url", note: "Wayback にない場合の保存・閲覧" },
    { n: "Bellingcat Online Investigation Toolkit", u: () => "https://bellingcat.gitbook.io/toolkit", note: "公開情報調査ツールの網羅的な一覧（英語）" },
  ] },
  { key: "open", title: "公開データ・ファクトチェック DB（実践編 7）", desc: "まず「すでに誰かが検証していないか」。次に政府統計・会議録などの一次資料", items: [
    { n: "Google Fact Check Explorer", u: q => `https://toolbox.google.com/factcheck/explorer/search/${enc(q)};hl=ja`, need: "q", note: "世界のファクトチェック記事（ClaimReview）を横断検索。日本語は少なめ" },
    { n: "JFC 日本ファクトチェックセンター", u: q => ENGINES.google[1](`site:factcheckcenter.jp ${q}`), need: "q", note: "国内の検証記事。LINE で問い合わせも可" },
    { n: "FIJ ファクトチェック・ナビ", u: q => ENGINES.google[1](`site:navi.fij.info ${q}`), need: "q", note: "国内メディアの検証記事と疑義言説を時系列で" },
    { n: "e-Stat 政府統計の総合窓口", u: q => `https://www.e-stat.go.jp/stat-search?query=${enc(q)}`, need: "q", note: "各省庁の統計を横断。数値の主張はここで原データ" },
    { n: "e-Gov データポータル", u: q => `https://data.e-gov.go.jp/data/ja/dataset?q=${enc(q)}`, need: "q", note: "行政オープンデータ" },
    { n: "国会会議録検索システム", u: q => `https://kokkai.ndl.go.jp/#/result?any=${enc(q)}`, need: "q", note: "「国会で〜と答弁した」の原文" },
    { n: "e-Gov 法令検索", u: q => `https://laws.e-gov.go.jp/search/elawsSearch/elaws_search/lsg0100/?searchKeyword=${enc(q)}`, need: "q", note: "法律・政令の条文" },
    { n: "Wikipedia（出典欄を見る）", u: q => `https://ja.wikipedia.org/w/index.php?search=${enc(q)}`, need: "q", note: "本文ではなく脚注の出典へ辿る" },
    { n: "data.gov（米）／ data.gov.uk（英）", u: q => `https://catalog.data.gov/dataset?q=${enc(q)}`, need: "q", note: "海外の公的データ" },
  ] },
  { key: "prebunk", title: "プリバンキング・情報の空白（実践編 9）", desc: "信頼できる情報が検索結果にないと（データボイド）、人は不確かな情報を信じやすい。繰り返し出るデマ（人工地震・選挙不正など）は事前に解説を用意する", items: [
    { n: "「ギャップ・対立」タブ", u: null, need: "tab:gap", note: "集めた記事で答えられていない問いを列挙＝空白の候補" },
    { n: "「集める」の空白判定", u: null, need: "tab:live", note: "公的・報道の情報源が少ないトピックに警告を出す" },
  ] },
];

/* ---------- 生成 AI チェックリスト ---------- */
export const AI_CHECKS = ["手・指の本数や形、歯並び、耳・眼鏡の左右", "背景の文字・看板・ロゴが読めるか（崩れていないか）", "水面・ガラス・鏡の反射が実物と合っているか", "影の向き・長さが光源と一致するか", "瓦礫・群衆・樹木など繰り返し模様が不自然でないか", "動画：表情が固まり口だけ動いていないか、まばたき・声と口の同期", "その人物が普段そういう発言・行動をするか（公式サイト・過去の発言）", "NHK・CNN・BBC など大手報道が同じ出来事を報じているか"];

/* ---------- YouTube キーフレーム ---------- */
export function youtubeId(u) { const m = String(u).match(/(?:v=|youtu\.be\/|shorts\/|embed\/)([A-Za-z0-9_-]{11})/); return m ? m[1] : null; }
export function youtubeFrames(id) { return ["maxresdefault", "1", "2", "3"].map(k => `https://img.youtube.com/vi/${id}/${k}.jpg`); }

/* ---------- 検証記事の下書き（JFC の構成：検証対象 → 検証過程 → 判定） ---------- */
export function reportMarkdown({ claim, source_url, spread, checkable: ck, selection, queries, tools, evidence, rating, note, models }) {
  const R = RATINGS[rating] || RATINGS.hold; const d = new Date().toISOString().slice(0, 10);
  const L = [];
  L.push(`# 検証：「${claim}」`, "", `判定：**${R[0]}**（${d}・下書き）`, "", "## 検証対象", `- 主張：${claim}`);
  if (source_url) L.push(`- 出どころ：${source_url}`);
  if (spread) L.push(`- 拡散の状況：${spread}`);
  L.push(`- 検証可能性：${ck.ok ? "客観的に検証可能" : "要注意"}（${ck.why.join("／")}）`);
  if (selection?.length) L.push(`- 選定理由：${selection.join("・")}`);
  L.push("", "## 検証過程");
  if (queries?.length) { L.push("使った検索式："); for (const q of queries) L.push(`- \`${q}\``); }
  if (tools?.length) { L.push("", "使ったツール："); for (const t of tools) L.push(`- ${t}`); }
  L.push("", "見つかった根拠：");
  for (const e of evidence || []) L.push(`- ${e.kind === "support" ? "【支持】" : e.kind === "refute" ? "【反証】" : "【関連】"} ${e.text.replace(/\s+/g, " ").slice(0, 200)} — ${e.domain}${e.published ? "（" + e.published + "）" : ""} ${e.url}`);
  if (!(evidence || []).length) L.push("- （照合できる段落なし）");
  L.push("", "## 判定", `**${R[0]}** — ${R[2]}`, note ? `\n${note}` : "", "", "## 方法と限界", `- 収集：ブラウザから検索エンジン（DuckDuckGo・Google ニュース RSS・はてな・Wikipedia）を巡回し本文を取得`, `- 判定：端末内の日本語 ModernBERT（${models || "埋め込み・含意・関連度"}）で主張と各段落の含意／矛盾を推定。機械の判定は下書きであり、最終判定は人が一次情報を確認して行う`, `- 出典はすべて上のリンクから誰でも確認できる（検証過程の公開）`);
  return L.filter(x => x !== null).join("\n");
}
