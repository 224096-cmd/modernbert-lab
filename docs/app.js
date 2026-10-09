import * as NET from "./net.js";
import * as ML from "./ml.js";
import * as J from "./judge.js";
import * as A from "./analysis.js";
import * as FC from "./factcheck.js";

const VERSION = "v5.1";
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const el = (h) => { const t = document.createElement("template"); t.innerHTML = h.trim(); return t.content.firstChild; };
const DORKS = {
  exact: ["完全一致", '"{q}"'], official_jp: ["公的機関・大学", '{q} (site:go.jp OR site:lg.jp OR site:ac.jp)'], news_pr: ["報道・プレスリリース", '{q} (site:prtimes.jp OR site:nhk.or.jp OR site:nikkei.com OR site:asahi.com OR site:yomiuri.co.jp OR site:mainichi.jp)'],
  pdf: ["PDF 文書", '{q} filetype:pdf'], factcheck: ["ファクトチェック", '{q} (site:fij.info OR site:factcheckcenter.jp OR site:infact.press OR "ファクトチェック")'], deny: ["否定・訂正", '{q} (デマ OR 誤り OR 訂正 OR 事実無根 OR "根拠がない")'],
  primary: ["一次資料", '{q} (統計 OR 議事録 OR 報告書 OR 公示 OR 告示) (site:go.jp OR site:lg.jp OR filetype:pdf)'], sns: ["SNS・掲示板", '{q} (site:x.com OR site:bsky.app OR site:mstdn.jp OR site:reddit.com OR site:5ch.net)'], blog: ["ブログ・まとめ", '{q} (site:note.com OR site:hatenablog.com OR site:ameblo.jp OR site:togetter.com)'],
  video: ["動画", '{q} (site:youtube.com OR site:nicovideo.jp)'], academic: ["学術", '{q} (site:jstage.jst.go.jp OR site:cir.nii.ac.jp OR site:researchmap.jp)'], title: ["見出しに含む", 'intitle:"{q}"'],
};
const SOURCES_DOC = [
  ["ddg", "DuckDuckGo", "lite/html 版。bot 判定時は r.jina.ai 経由", "両方"], ["bing", "Bing", "HTML 直接（Actions）／r.jina.ai 経由（ブラウザ）", "両方"], ["yahoo", "Yahoo! JAPAN", "ページ内 JSON。日本語に強い", "Actions"], ["gnews", "Google ニュース RSS", "検索クエリ対応・媒体名・日時", "両方"], ["hatena", "はてなブックマーク", "検索 RSS。ブクマ数＝反応の量", "両方"], ["wiki", "Wikipedia / ウィキニュース", "検索 API", "両方"],
  ["mojeek", "Mojeek", "独立インデックス（不安定）", "Actions"], ["bluesky", "Bluesky", "公開検索 API", "Actions"], ["mastodon", "Mastodon", "ハッシュタグ公開タイムライン", "Actions"], ["reddit", "Reddit", "公開 JSON（IP により拒否あり）", "Actions"], ["gdelt", "GDELT", "世界のニュース DB（5 秒間隔）", "Actions"], ["qiita", "Qiita", "技術記事", "Actions"], ["github", "GitHub", "リポジトリ検索", "Actions"], ["nhk", "NHK RSS", "主要・社会ニュース", "Actions"], ["crossref / openalex", "学術論文", "DOI・被引用数", "Actions"], ["wayback", "Wayback Machine", "URL の履歴", "両方"],
];
let INDEX = [], TOPIC = null, REG = null;
const pct = x => `${Math.round((x || 0) * 100)}%`;

/* ---------- ナビ ---------- */
/* 画面モード：simple（一般・授業向け）／research（研究者向け。鍵つき） */
const MODE = { get v() { try { return localStorage.getItem("mbo.mode") === "research" ? "research" : "simple"; } catch { return "simple"; } }, set(v) { try { v === "research" ? localStorage.setItem("mbo.mode", "research") : localStorage.removeItem("mbo.mode"); } catch { } renderNav(); } };
const NAV = {
  simple: [["s-home", "ホーム"], ["fc", "検証"], ["tools", "ツール"], ["history", "履歴"], ["s-learn", "手順と考え方"], ["s-gate", "🔑"]],
  research: [["home", "概要"], ["fc", "ファクトチェック"], ["live", "集める"], ["check", "検証"], ["gap", "ギャップ・対立"], ["struct", "構造化"], ["exp", "長文 vs 分割"], ["history", "履歴"], ["tools", "ツール"], ["models", "モデル"], ["learn", "学ぶ"], ["how", "仕組み"], ["about", "解説"], ["settings", "設定"], ["s-home", "一般画面"]],
};
const SIMPLE_TABS = new Set(["s-home", "fc", "tools", "history", "s-learn", "s-gate"]);
function renderNav() { const m = MODE.v; $("#nav").innerHTML = NAV[m].map(([t, l]) => `<button data-t="${t}">${l}</button>`).join(""); $$("nav button").forEach(b => b.onclick = () => show(b.dataset.t)); document.body.classList.toggle("mode-simple", m === "simple"); $("#brand-name").textContent = m === "simple" ? "情報たしかめラボ" : "ModernBERT Lab"; $("#ver").style.display = m === "simple" ? "none" : ""; }
function show(t) {
  if (!SIMPLE_TABS.has(t) && MODE.v !== "research") t = "s-gate";
  $$("nav button").forEach(b => b.classList.toggle("on", b.dataset.t === t)); $$("main > section").forEach(s => s.classList.toggle("hidden", s.id !== "t-" + t)); location.hash = t; window.scrollTo(0, 0);
  if (t === "how") renderHow(); if (t === "settings") renderSettings(); if (t === "models") renderModels(); if (t === "about") renderAbout(); if (t === "history") renderTopicSelect(); if (t === "tools") renderTools(); if (t === "learn") renderLearn(); if (["check", "gap", "struct", "exp"].includes(t)) renderCorpusSelects();
  if (t === "s-learn") renderSimpleLearn();
}

/* ---------- 履歴（IndexedDB） ---------- */
/* プライベートモード：ON の間は結果を IndexedDB に書かず、メモリ（MEM）にだけ置く。タブを閉じると消える */
export const PRIV = { get on() { try { return localStorage.getItem("mbo.private") === "1"; } catch { return false; } }, set(v) { try { v ? localStorage.setItem("mbo.private", "1") : localStorage.removeItem("mbo.private"); } catch { } renderPrivBadge(); } };
const MEM = new Map();
const HDB = {
  db: null,
  async open() { if (this.db) return this.db; return this.db = await new Promise((ok, ng) => { const r = indexedDB.open("mbo-history", 1); r.onupgradeneeded = () => { const st = r.result.createObjectStore("runs", { keyPath: "id" }); st.createIndex("kind", "kind"); }; r.onsuccess = () => ok(r.result); r.onerror = () => ng(r.error); }); },
  async put(rec) { if (PRIV.on) { rec.ephemeral = true; MEM.set(rec.id, rec); return; } return this.putPersist(rec); },
  async putPersist(rec) { delete rec.ephemeral; const db = await this.open(); return new Promise((ok, ng) => { const r = db.transaction("runs", "readwrite").objectStore("runs").put(rec); r.onsuccess = () => ok(); r.onerror = () => ng(r.error); }); },
  async get(id) { if (MEM.has(id)) return MEM.get(id); const db = await this.open(); return new Promise((ok, ng) => { const r = db.transaction("runs").objectStore("runs").get(id); r.onsuccess = () => ok(r.result); r.onerror = () => ng(r.error); }); },
  async all() { const db = await this.open(); const saved = await new Promise((ok, ng) => { const r = db.transaction("runs").objectStore("runs").getAll(); r.onsuccess = () => ok(r.result || []); r.onerror = () => ng(r.error); }); return [...MEM.values(), ...saved].sort((a, b) => b.run_at.localeCompare(a.run_at)); },
  async del(id) { if (MEM.delete(id)) return; const db = await this.open(); return new Promise((ok, ng) => { const r = db.transaction("runs", "readwrite").objectStore("runs").delete(id); r.onsuccess = () => ok(); r.onerror = () => ng(r.error); }); },
  async clear() { MEM.clear(); const db = await this.open(); return new Promise((ok, ng) => { const r = db.transaction("runs", "readwrite").objectStore("runs").clear(); r.onsuccess = () => ok(); r.onerror = () => ng(r.error); }); },
  sessionCount() { return MEM.size; },
};
function renderPrivBadge() { const b = $("#priv"); if (!b) return; b.textContent = PRIV.on ? "🔒 プライベート（履歴を保存しない）" : "🔓 履歴を保存"; b.classList.toggle("on", PRIV.on); b.title = PRIV.on ? "この端末に結果を残さない。タブを閉じると消える。クリックで切替" : "結果をこの端末の履歴に保存する。クリックでプライベートに切替"; }
const nowJst = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 19);
async function saveRun(rec) { rec.id = rec.id || (rec.kind + ":" + rec.key + ":" + Date.now().toString(36)); rec.run_at = rec.run_at || nowJst(); await HDB.put(rec); INDEX = await HDB.all(); renderHome(); renderTopicSelect(); renderCorpusSelects();  return rec; }
async function getJSON(p) { try { const r = await fetch(new URL(p, import.meta.url), { cache: "no-cache" }); if (!r.ok) return null; return await r.json(); } catch { return null; } }
async function loadData() { INDEX = await HDB.all(); renderHome(); renderTopicSelect(); renderCorpusSelects(); }

/* ---------- 共通描画 ---------- */
const gradeBadge = it => `<span class="g g${it.grade}">${it.grade}</span> <b>${it.reliability}</b>`;
function itemCard(it, opts = {}) {
  const host = NET.hostOf(it.url); const cls = J.CLASS_LABEL[it.source_class] || it.source_class || "";
  const axes = it.s_source != null ? `<div class="axes">
    <span>出所 ${(it.s_source * 100) | 0}</span><div class="bar"><i style="width:${it.s_source * 100}%"></i></div><span class="muted tiny">×${J.P.weights.source}</span>
    <span>内容 ${(it.s_content * 100) | 0}</span><div class="bar"><i style="width:${it.s_content * 100}%"></i></div><span class="muted tiny">×${J.P.weights.content}</span>
    <span>裏取り ${(it.s_corr * 100) | 0}</span><div class="bar"><i style="width:${it.s_corr * 100}%"></i></div><span class="muted tiny">×${J.P.weights.corroboration}</span>
    <span>時間 ${(it.s_time * 100) | 0}</span><div class="bar"><i style="width:${it.s_time * 100}%"></i></div><span class="muted tiny">×${J.P.weights.time}</span></div>` : "";
  const why = (it.source_why || []).map(w => `<span class="tag">${esc(w)}</span>`).join(" ");
  const style = it.style ? Object.entries(it.style).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k, v]) => `<span class="tag">${k} ${(v * 100) | 0}%</span>`).join(" ") : "";
  const ev = (it.corr?.evidence || []).map(e => `<div class="ev ${e.kind === "support" ? "sup" : e.kind === "contra" ? "con" : ""}"><span class="tag ${e.kind === "support" ? "sup" : e.kind === "contra" ? "con" : ""}">${e.kind === "support" ? "含意" : e.kind === "contra" ? "矛盾" : "同趣旨"} ${(e.p * 100) | 0}%</span> <a href="${esc(e.url)}" target="_blank" rel="noopener">${esc(NET.hostOf(e.url))}</a><br>${esc(e.text)}</div>`).join("");
  return `<div class="item" data-id="${esc(it.id || "")}">
   <div class="row" style="gap:6px"><span>${gradeBadge(it)}</span><a class="t" href="${esc(it.url)}" target="_blank" rel="noopener">${esc(it.title || it.url)}</a></div>
   <div class="m"><span>${esc(host)}</span><span>${esc(cls)}</span>${it.published ? `<span>${esc(it.published)}</span>` : "<span class=\"warn\">日付なし</span>"}${it.site ? `<span>${esc(it.site)}</span>` : ""}${(it.engines || []).length ? `<span>${it.engines.join("・")}</span>` : ""}${(it.dorks || []).filter(d => d !== "topic").length ? `<span>Dorks: ${it.dorks.filter(d => d !== "topic").map(d => DORKS[d]?.[0] || d).join("・")}</span>` : ""}${it.text ? `<span class="ok">本文 ${it.text.length} 字</span>` : ""}${it.reactions ? `<span>反応 ${it.reactions}</span>` : ""}</div>
   ${it.snippet ? `<div class="sn">${esc(it.snippet.slice(0, 220))}</div>` : ""}
   ${axes}
   <details><summary>根拠を見る${it.corr ? `（裏取り：含意 ${it.corr.support}・矛盾 ${it.corr.contra}・${(it.corr.domains || []).length} ドメイン）` : ""}</summary>
    <div class="small">${why} ${style}</div>
    ${it.claim ? `<div class="small muted">要旨：${esc(it.claim)}</div>` : ""}
    ${ev || '<div class="small muted">他ドメインの段落で含意・矛盾したものはなし</div>'}
    ${opts.actions !== false ? `<div class="actbar"><button class="small act-read" data-url="${esc(it.url)}">本文を読む</button><button class="small act-verify" data-claim="${esc(it.claim || it.title || "")}">この要旨を検証</button><button class="small act-exp" data-id="${esc(it.id || "")}">長文 vs 分割</button></div>` : ""}
   </details></div>`;
}
function wireItemActions(root) {
  root.querySelectorAll(".act-read").forEach(b => b.onclick = () => openReader(b.dataset.url));
  root.querySelectorAll(".act-verify").forEach(b => b.onclick = () => { show("fc"); $("#fc-claim").value = b.dataset.claim; const it = b.closest(".item"); const a = it?.querySelector("a.t"); if (a) $("#fc-src").value = a.href; fcCheckable(); window.scrollTo(0, 0); });
  root.querySelectorAll(".act-exp").forEach(b => b.onclick = () => { show("exp"); if ($(`#ex-doc option[value="${b.dataset.id}"]`)) $("#ex-doc").value = b.dataset.id; });
}
async function openReader(url) {
  const box = el(`<div class="card"><div class="row"><b>本文</b><a href="${esc(url)}" target="_blank" rel="noopener" class="small">${esc(url)}</a><button class="small" style="margin-left:auto">閉じる</button></div><div class="small muted">読み込み中…</div></div>`);
  box.querySelector("button").onclick = () => box.remove(); document.querySelector("main > section:not(.hidden)").prepend(box); window.scrollTo(0, 0);
  const r = await NET.readPage(url); box.lastChild.innerHTML = r ? `<b>${esc(r.title)}</b><div class="mono" style="max-height:60vh;overflow:auto;white-space:pre-wrap;word-break:normal">${esc(r.text)}</div>` : "読めませんでした（r.jina.ai の制限か、サイトが拒否）";
}


/* ---------- 概要 ---------- */
function renderHome() {
  const topics = INDEX.filter(r => r.kind === "topic"), n = topics.reduce((s, x) => s + (x.n || 0), 0);
  $("#home-stats").innerHTML = [["コーパス", topics.length], ["採点したページ", n], ["検証・分析", INDEX.filter(r => r.kind === "analysis").length], ["最終", (INDEX[0]?.run_at || "—").slice(5, 16).replace("T", " ")]].map(([k, v]) => `<div class="stat">${k}<b>${esc(v)}</b></div>`).join("");
  $("#home-tiles").innerHTML = [["ファクトチェック", "主張 → 検証対象の確認 → 収集・照合 → 5 段階判定の下書きと検証記事", "fc"], ["集める", "トピックか URL → 記事を集めて信頼性を採点・情報の空白を警告", "live"], ["検証", "矛盾・偏り・一次情報・時間的ずれ・主張の真偽", "check"], ["ギャップ・対立", "足りない情報（データボイド）と反対意見を洗い出す", "gap"], ["構造化", "比較表・要約・Q&A・意味差分", "struct"], ["ツール", "高度な検索・逆画像検索・動画キーフレーム・公開データ・地図", "tools"], ["長文 vs 分割", "8,192 一括と 512 分割の比較実験", "exp"], ["モデル", "ブラウザ用モデルと FactCheck-BERT の土台候補", "models"], ["学ぶ", "講座の動画・検証の原則・判定ラベル", "learn"], ["履歴", "この端末に保存した結果", "history"]].map(([a, b, t]) => `<div class="tile" data-t="${t}"><b>${a}</b><span>${b}</span></div>`).join("");
  $$("#home-tiles .tile").forEach(x => x.onclick = () => show(x.dataset.t));
  const rows = INDEX.slice(0, 15);
  $("#home-latest").innerHTML = rows.length ? `<div class="tw"><table><thead><tr><th>種類</th><th>内容</th><th>結果</th><th>日時</th></tr></thead><tbody>${rows.map(r => `<tr><td>${r.ephemeral ? "🔒 " : ""}${r.kind === "topic" ? "コーパス" : esc(r.label || "分析")}</td><td><a href="#" data-id="${esc(r.id)}">${esc(r.key)}</a></td><td class="small">${r.kind === "topic" ? `${r.n} 件・平均 ${r.summary?.mean}` : esc(r.result_label || "")}</td><td class="small">${esc(r.run_at.slice(5, 16).replace("T", " "))}</td></tr>`).join("")}</tbody></table></div>` : `<p class="muted small">まだありません。「集める」にトピックを入れてください（初回はモデル 3 つ、合計約 110 MB をダウンロード）。</p>`;
  $$("#home-latest a[data-id]").forEach(a => a.onclick = e => { e.preventDefault(); openRun(a.dataset.id); });
}
function openRun(id) { const r = INDEX.find(x => x.id === id); if (!r) return; if (r.kind === "topic") { show("history"); $("#tp-sel").value = id; loadTopic(id); } else { show("history"); $("#tp-sel").value = id; loadTopic(id); } }

/* ---------- 履歴 ---------- */
function renderTopicSelect() {
  const sel = $("#tp-sel");
  sel.innerHTML = INDEX.map(t => `<option value="${esc(t.id)}">${t.ephemeral ? "🔒 " : ""}${t.kind === "topic" ? "コーパス" : esc(t.label || "分析")}：${esc(t.key)}（${(t.run_at || "").slice(5, 16).replace("T", " ")}）</option>`).join("") || "<option value=''>（まだありません）</option>";
  sel.onchange = () => loadTopic(sel.value); if (INDEX[0] && !TOPIC) loadTopic(INDEX[0].id);
}
async function loadTopic(id) {
  TOPIC = await HDB.get(id); if (!TOPIC) { $("#tp-body").innerHTML = ""; $("#tp-stats").innerHTML = ""; return; }
  if (TOPIC.kind !== "topic") { $("#tp-meta").textContent = TOPIC.run_at.slice(0, 16).replace("T", " "); $("#tp-stats").innerHTML = ""; $("#tp-hist").innerHTML = ""; $("#tp-body").innerHTML = TOPIC.html || "<p class='muted'>表示できません</p>"; return; }
  const s = TOPIC.summary; $("#tp-meta").textContent = `${TOPIC.run_at.slice(0, 16).replace("T", " ")}・${TOPIC.n} 件`;
  $("#tp-stats").innerHTML = [["平均信頼性", s.mean], ["A / B", `${s.grades.A || 0} / ${s.grades.B || 0}`], ["C / D", `${s.grades.C || 0} / ${s.grades.D || 0}`], ["ドメイン", s.domains], ["本文あり", TOPIC.items.filter(i => i.text).length], ["複数ページの話題", s.clusters]].map(([k, v]) => `<div class="stat">${k}<b>${v}</b></div>`).join("") + `<div class="chips" style="flex-basis:100%">${Object.entries(s.classes).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<span class="chip" style="cursor:default">${J.CLASS_LABEL[k] || k} ${v}</span>`).join("")}</div>`;
  const prev = INDEX.filter(r => r.kind === "topic" && r.key === TOPIC.key && r.run_at < TOPIC.run_at); const h = INDEX.filter(r => r.kind === "topic" && r.key === TOPIC.key).reverse();
  $("#tp-hist").innerHTML = h.length > 1 ? `<div class="small muted">平均信頼性の推移（${h.length} 回）</div><div class="hist">${h.map(x => `<i style="height:${x.summary.mean * 0.4}px" title="${x.run_at} ${x.summary.mean}"></i>`).join("")}</div>` : "";
  const prevUrls = new Set(); for (const p of prev) for (const u of (p.urls || [])) prevUrls.add(u);
  $("#tp-body").innerHTML = resultHtml(TOPIC, prev.length ? prevUrls : null); wireItemActions($("#tp-body"));
}
function dataVoid(items) {
  const n = items.length, rel = items.filter(i => ["gov", "news", "edu", "academic"].includes(i.source_class)).length, withText = items.filter(i => i.text).length;
  const ratio = n ? rel / n : 0; const level = n < 6 ? "high" : ratio < 0.2 ? "high" : ratio < 0.4 ? "mid" : "none";
  return { n, rel, ratio, withText, level };
}
function dataVoidHtml(items) {
  const v = dataVoid(items); if (v.level === "none") return "";
  return `<div class="card" style="border-color:var(--warn)"><h3 style="margin-top:0" class="warn">情報の空白（データボイド）の可能性 — ${v.level === "high" ? "高" : "中"}</h3><p class="small">集まった ${v.n} 件のうち、公的機関・報道・大学・学術の発信は ${v.rel} 件（${Math.round(v.ratio * 100)}%）。信頼できる情報が検索結果に少ない話題は、不確かな情報が信じられやすい。<b>プリバンキング</b>（先回りして正確な解説を用意する）の候補。「ギャップ・対立」タブで、答えられていない問いを確かめる。</p></div>`;
}
function resultHtml(res, prevUrls) {
  const items = res.items; const newer = prevUrls ? items.filter(i => !prevUrls.has(i.url)) : [];
  return `${dataVoidHtml(items)}${prevUrls ? `<div class="card"><h2 style="margin-top:0">前回から新しく出たページ <span class="muted small">${newer.length} 件</span></h2>${newer.slice(0, 20).map(it => itemCard(it)).join("") || "<p class='muted small'>なし</p>"}</div>` : ""}
   <div class="card"><h2 style="margin-top:0">話題のまとまり <span class="muted small">— 同じ話を何ドメインが伝えているか・最初に出たのはどこか</span></h2>${(res.clusters || []).filter(c => c.size > 1).slice(0, 12).map(c => `<div class="item"><div class="row"><span class="g g${J.grade(c.reliability)}">${c.reliability}</span><b>${esc(c.title)}</b></div><div class="m"><span>${c.size} 件</span><span>${c.domains.length} ドメイン：${c.domains.slice(0, 6).map(esc).join("・")}${c.domains.length > 6 ? "…" : ""}</span><span>初出 ${esc(c.first || "不明")} <a href="${esc(c.first_url)}" target="_blank" rel="noopener">${esc(NET.hostOf(c.first_url))}</a></span></div></div>`).join("") || "<p class='muted small'>複数ページにまたがる話題はなし</p>"}</div>
   <div class="card"><h2 style="margin-top:0">結果 <span class="muted small">${items.length} 件・信頼性順</span></h2>${items.map(it => itemCard(it)).join("")}</div>
   <div class="card"><h3 style="margin-top:0">使った検索式</h3><div class="tw"><table>${(res.queries || []).map(x => `<tr><td>${esc(x.label)}</td><td class="mono">${esc(x.query)}</td></tr>`).join("")}</table></div></div>`;
}
$("#tp-csv").onclick = () => { if (!TOPIC || TOPIC.kind !== "topic") return; const rows = [["grade", "reliability", "s_source", "s_content", "s_corr", "s_time", "source_class", "published", "title", "url", "engines", "dorks"]].concat(TOPIC.items.map(it => [it.grade, it.reliability, it.s_source, it.s_content, it.s_corr, it.s_time, it.source_class, it.published || "", it.title, it.url, (it.engines || []).join("|"), (it.dorks || []).join("|")])); dl(TOPIC.key + ".csv", "\ufeff" + rows.map(r => r.map(x => `"${String(x ?? "").replace(/"/g, '""')}"`).join(",")).join("\n"), "text/csv"); };
$("#tp-json").onclick = () => TOPIC && dl(TOPIC.key.slice(0, 40) + ".json", JSON.stringify(TOPIC, null, 1), "application/json");
$("#tp-del").onclick = async () => { if (!TOPIC) return; const id = TOPIC.id; await HDB.del(id); TOPIC = null; await loadData(); };
function dl(name, text, type = "text/plain") { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }
function summarize(items, clusters) { const g = {}, cls = {}; for (const it of items) { g[it.grade] = (g[it.grade] || 0) + 1; cls[it.source_class] = (cls[it.source_class] || 0) + 1; } return { mean: items.length ? Math.round(items.reduce((s, x) => s + x.reliability, 0) / items.length) : 0, grades: g, classes: cls, clusters: clusters.filter(c => c.size > 1).length, domains: new Set(items.map(i => NET.hostOf(i.url))).size, dated: items.filter(i => i.published).length }; }


/* ---------- モデル ---------- */
const state = {};
const ROLE_LABEL = { embed: "埋め込み", nli: "含意", rerank: "関連度" };
async function renderModelBars() {
  const reg = await registry(); const bars = $$(".modelbar"); if (!bars.length) return;
  const html = `<span class="tiny muted">使用モデル：</span>` + ["embed", "nli", "rerank"].map(r => `<label class="mb"><span>${ROLE_LABEL[r]}</span><select data-role="${r}">${reg.browser.filter(m => m.role === r).map(m => `<option value="${esc(m.name)}" ${ML.modelName(r) === m.name ? "selected" : ""}>${esc(m.name)}（${m.ctx >= 8192 ? "8192" : m.ctx}・${m.size_mb}MB）</option>`).join("")}</select></label>`).join("") + `<a href="#models" class="tiny" data-go="models">詳細</a>`;
  for (const b of bars) { b.innerHTML = html; b.querySelectorAll("select").forEach(sel => sel.onchange = () => { ML.setModelName(sel.dataset.role, sel.value); state[sel.dataset.role] = null; renderModelBars(); }); b.querySelector("[data-go]").onclick = e => { e.preventDefault(); show("models"); }; }
}
async function models(onStep, roles = ["embed", "nli"]) { for (const r of roles) if (!state[r] || state[r].name !== ML.modelName(r)) state[r] = await ML.get(r, m => onStep?.(m)); return state; }

/* ---------- 集める ---------- */
function chips(root, obj, on, sel) { root.innerHTML = Object.entries(obj).map(([k, [label]]) => `<span class="chip ${sel.has(k) ? "on" : ""}" data-k="${k}" title="${esc(obj[k][1] || "")}">${label}</span>`).join(""); root.querySelectorAll(".chip").forEach(c => c.onclick = () => { c.classList.toggle("on"); on(); }); }
const lvSel = { dorks: new Set(["exact", "official_jp", "news_pr", "factcheck"]), engines: new Set(["ddg", "gnews", "hatena", "wiki"]) };
chips($("#lv-dorks"), DORKS, () => { lvSel.dorks = new Set($$("#lv-dorks .chip.on").map(c => c.dataset.k)); }, lvSel.dorks);
chips($("#lv-engines"), Object.fromEntries(Object.entries(NET.ENGINES).map(([k, v]) => [k, [v.label, v.note]])), () => { lvSel.engines = new Set($$("#lv-engines .chip.on").map(c => c.dataset.k)); }, lvSel.engines);
$("#lv-read").oninput = () => $("#lv-read-v").textContent = $("#lv-read").value;
const EXAMPLES = ["生成AI 著作権 ガイドライン", "熱中症 対策 効果 エビデンス", "電気自動車 補助金 2026", "マイナ保険証 トラブル", "ふるさと納税 制度変更", "https://ja.wikipedia.org/wiki/オープンソースインテリジェンス"];
$("#lv-examples").innerHTML = `<span class="tiny muted" style="align-self:center">例：</span>` + EXAMPLES.map(x => `<span class="chip" data-x="${esc(x)}">${esc(x.length > 30 ? x.slice(0, 30) + "…" : x)}</span>`).join(""); $$("#lv-examples .chip").forEach(c => c.onclick = () => { $("#lv-q").value = c.dataset.x; runLive(); });
$("#lv-run").onclick = runLive; $("#lv-q").onkeydown = e => { if (e.key === "Enter") runLive(); };
/* 収集：検索は（検索式 × 情報源）を並列 3 本、本文取得は並列 3 本。途中経過は onItems（候補一覧が増えるたび）／onText（本文が 1 件読めるたび）で通知し、画面はそれに合わせて描き直す */
const PAR = { search: 3, read: 3 };
async function collectLive(topic, { dorks, engines, nread, status, onItems, onText }) {
  const queries = [{ name: "topic", label: "そのまま", query: topic }, ...[...dorks].map(k => ({ name: k, label: DORKS[k][0], query: DORKS[k][1].replace("{q}", topic) }))];
  const seen = new Map(); const jobs = [];
  for (const q of queries) for (const e of engines) { if (e === "wiki" && q.name !== "topic") continue; jobs.push({ q, e }); }
  let done = 0;
  const prio = it => it.engines.length * 2 + it.dorks.length + ({ gov: 3, news: 3, edu: 2, academic: 2, wiki: 1 }[J.domainClass(NET.hostOf(it.url))] || 0);
  const snapshot = () => [...seen.values()].sort((a, b) => prio(b) - prio(a)).slice(0, 60);
  await NET.pool(jobs, PAR.search, async ({ q, e }) => NET.search(e === "ddg" ? q.query.replace(/[()]/g, "") : q.query, [e], 10), (rs, { q, e }) => {
    for (const r of rs || []) { if (seen.has(r.url)) { const x = seen.get(r.url); x.engines = [...new Set([...x.engines, e])]; x.dorks = [...new Set([...x.dorks, q.name])]; if (!x.published && r.published) x.published = r.published; } else seen.set(r.url, { ...r, id: Math.random().toString(36).slice(2, 10), dorks: [q.name], text: "", topic }); }
    done++; status(`検索 ${done}/${jobs.length}（${NET.ENGINES[e].label}：${q.label}）— 候補 ${seen.size} 件`); onItems?.(snapshot());
  });
  const items = snapshot(); onItems?.(items);
  const toRead = items.slice(0, Math.min(nread, items.length)); let nr = 0;
  await NET.pool(toRead, PAR.read, it => NET.readPage(it.url), (r, it) => {
    if (r) { it.text = r.text.slice(0, 6000); it.title = it.title || r.title; if (r.finalUrl && /^https?:/.test(r.finalUrl) && NET.hostOf(r.finalUrl) !== "news.google.com" && NET.hostOf(r.finalUrl) !== NET.hostOf(it.url)) { it.orig_url = it.url; it.url = NET.normUrl(r.finalUrl); } }
    nr++; status(`本文を読む ${nr}/${toRead.length}：${NET.hostOf(it.url)}${r ? "" : "（読めず）"}`); onText?.(it, items);
  });
  return { items, queries };
}
/* 途中経過の描画：候補カードを id ごとに置き、本文が届いたらそのカードだけ差し替える */
function liveBoard(root) {
  root.innerHTML = `<div class="card" id="lb-prog"><div class="row"><b>集めています</b><span class="small muted" id="lb-msg"></span></div><div class="bar" style="margin-top:6px"><i id="lb-bar" style="width:0%"></i></div></div><div class="card"><h3 style="margin-top:0">候補 <span class="muted small" id="lb-n">0 件</span> <span class="tiny muted">— 検索結果が届いた順。本文が読めたものから「本文 ○ 字」が付き、最後に採点して並べ替える</span></h3><div id="lb-list"></div></div>`;
  const list = root.querySelector("#lb-list"), msg = root.querySelector("#lb-msg"), bar = root.querySelector("#lb-bar"), n = root.querySelector("#lb-n");
  const card = it => `<div class="item lb" data-id="${esc(it.id)}"><div class="row" style="gap:6px"><span class="g" style="background:var(--muted)">…</span><a class="t" href="${esc(it.url)}" target="_blank" rel="noopener">${esc(it.title || it.url)}</a></div><div class="m"><span>${esc(NET.hostOf(it.url))}</span><span>${esc(J.CLASS_LABEL[J.domainClass(NET.hostOf(it.url))] || "")}</span>${it.published ? `<span>${esc(it.published)}</span>` : ""}<span>${(it.engines || []).join("・")}</span>${it.text ? `<span class="ok">本文 ${it.text.length} 字</span>` : `<span class="muted">本文 未取得</span>`}</div>${it.snippet ? `<div class="sn">${esc(it.snippet.slice(0, 160))}</div>` : ""}</div>`;
  return {
    status(m) { msg.textContent = m; const x = /(\d+)\/(\d+)/.exec(m); const base = /^検索/.test(m) ? 0 : /^本文/.test(m) ? 0.4 : /^ドメイン/.test(m) ? 0.75 : /評価|埋め込み|含意/.test(m) ? 0.9 : null; if (x && base != null) bar.style.width = Math.round((base + (+x[1] / +x[2]) * (base === 0 ? 0.4 : base === 0.4 ? 0.35 : 0.15)) * 100) + "%"; else if (base != null) bar.style.width = Math.round(base * 100) + "%"; },
    items(items) { n.textContent = `${items.length} 件`; const have = new Set([...list.children].map(c => c.dataset.id)); for (const it of items) if (!have.has(it.id)) list.insertAdjacentHTML("beforeend", card(it)); },
    text(it) { const c = list.querySelector(`[data-id="${CSS.escape(it.id)}"]`); if (c) c.outerHTML = card(it); },
    done() { root.querySelector("#lb-prog")?.remove(); },
  };
}
async function domInfosFor(items, status, max = 8) {
  const hosts = [...new Set(items.map(it => NET.hostOf(it.url).replace(/^www\./, "")))].slice(0, max); const out = {}; let cache = {}; try { cache = JSON.parse(localStorage.getItem("mbo.domcache") || "{}"); } catch { }
  const todo = hosts.filter(h => { if (cache[h] && Date.now() - cache[h].t < 30 * 864e5) { out[h] = cache[h]; return false; } return true; });
  status(`ドメイン情報：${todo.length} 件`);
  let k = 0; await NET.pool(todo, 3, async h => { const [wb, wc] = await Promise.all([NET.wayback(h), NET.wikiCites(NET.registrable(h))]); out[h] = cache[h] = { wayback: wb, wiki_cites: wc, t: Date.now() }; }, (_, h) => status(`ドメイン情報：${h}（${++k}/${todo.length}）`));
  if (!PRIV.on) try { localStorage.setItem("mbo.domcache", JSON.stringify(cache)); } catch { }
  const full = {}; for (const it of items) { const h = NET.hostOf(it.url); full[h] = out[h.replace(/^www\./, "")]; } return full;
}
async function runLive() {
  const q = $("#lv-q").value.trim(); if (!q) return; const st = m => $("#lv-status").textContent = m; $("#lv-run").disabled = true; $("#lv-out").innerHTML = "";
  try {
    if (/^https?:\/\//.test(q)) { await liveUrl(q, st); return; }
    const board = liveBoard($("#lv-out")); const st2 = m => { st(m); board.status(m); };
    const nread = +$("#lv-read").value;
    const [, { items, queries }] = await Promise.all([models(st2), collectLive(q, { dorks: lvSel.dorks, engines: lvSel.engines, nread, status: st2, onItems: xs => board.items(xs), onText: it => board.text(it) })]);
    if (!items.length) { st("何も見つかりませんでした（検索経路の制限に当たった可能性。1 分ほど待って再試行）"); board.done(); return; }
    const dom = await domInfosFor(items, st2); await J.scoreItems(items, dom, state.embed, state.nli, st2); const clusters = await J.cluster(items, state.embed);
    items.sort((a, b) => b.reliability - a.reliability); st(`${items.length} 件・${new Set(items.map(i => NET.hostOf(i.url))).size} ドメイン${NET.proxyState.jina429 ? "（一部は代替経路で取得）" : ""}${PRIV.on ? "・🔒 保存していません" : ""}`);
    const rec = await saveRun({ kind: "topic", key: q, n: items.length, items, clusters, queries, urls: items.map(i => i.url), summary: summarize(items, clusters) });
    const prev = INDEX.filter(r => r.kind === "topic" && r.key === q && r.id !== rec.id); const prevUrls = new Set(); for (const p of prev) for (const u of (p.urls || [])) prevUrls.add(u);
    $("#lv-out").innerHTML = `<div class="card"><div class="stats"><div class="stat">平均信頼性<b>${rec.summary.mean}</b></div><div class="stat">A/B/C/D<b>${["A", "B", "C", "D"].map(g => rec.summary.grades[g] || 0).join("/")}</b></div><div class="stat">ドメイン<b>${rec.summary.domains}</b></div><div class="stat">本文あり<b>${items.filter(i => i.text).length}</b></div></div><p class="small muted">${PRIV.on ? "🔒 プライベートモード：このタブを閉じると消えます（必要なら「履歴」タブの JSON で端末に保存）" : `履歴に保存しました${prev.length ? `（${prev.length} 回目の再調査）` : ""}`}。次は <a href="#" data-go="check">検証</a>・<a href="#" data-go="gap">ギャップ・対立</a>・<a href="#" data-go="struct">構造化</a> でこのコーパスを分析できます。</p></div>` + resultHtml(rec, prev.length ? prevUrls : null);
    wireItemActions($("#lv-out")); $$("#lv-out a[data-go]").forEach(a => a.onclick = e => { e.preventDefault(); show(a.dataset.go); selectCorpus(rec.id); }); $("#lv-out").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (e) { st("エラー: " + (e.message || e) + (navigator.onLine ? "" : "（オフラインです）")); console.error(e); } finally { $("#lv-run").disabled = false; }
}
async function liveUrl(url, st) {
  await models(st); st("ページを読み込み中"); const r = await NET.readPage(url); if (!r) { st("読めませんでした"); return; }
  const me = { id: "u" + Math.random().toString(36).slice(2, 8), url, title: r.title, snippet: r.text.slice(0, 200), text: r.text.slice(0, 20000), engines: [], dorks: [], published: null };
  const claim = J.keyClaim(me); st("同じ話を探す：" + (claim || r.title).slice(0, 40));
  const { items, queries } = await collectLive(r.title || claim.slice(0, 60), { dorks: new Set(["exact"]), engines: new Set(["ddg", "gnews"]), nread: 6, status: st });
  const all = [me, ...items.filter(i => i.url !== url)]; const dom = await domInfosFor(all, st); await J.scoreItems(all, dom, state.embed, state.nli, st); st("履歴に保存しました");
  const rec = await saveRun({ kind: "topic", key: url, n: all.length, items: all, clusters: [], queries, urls: all.map(i => i.url), summary: summarize(all, []) });
  $("#lv-out").innerHTML = `<div class="card"><h3 style="margin-top:0">この URL の判定</h3>${itemCard(me)}<div class="mono" style="max-height:40vh;overflow:auto;white-space:pre-wrap;word-break:normal;margin-top:8px">${esc(r.text.slice(0, 4000))}</div></div><div class="card"><h3 style="margin-top:0">同じ話を伝えている他のページ</h3>${all.slice(1).sort((a, b) => b.reliability - a.reliability).map(it => itemCard(it)).join("") || "<p class='muted small'>見つからず</p>"}</div>`; wireItemActions($("#lv-out"));
}

/* ---------- コーパス選択（検証・ギャップ・構造化・実験で共通） ---------- */
let CORPUS = null;
function corpusOptions() { return INDEX.filter(r => r.kind === "topic" && r.items.some(i => i.text)).map(r => `<option value="${esc(r.id)}">${esc(r.key.slice(0, 50))}（本文 ${r.items.filter(i => i.text).length} 件・${r.run_at.slice(5, 10)}）</option>`).join("") + (CORPUS?.id === "paste" ? `<option value="paste">貼り付けたテキスト（${CORPUS.docs.length} 件）</option>` : ""); }
function renderCorpusSelects() { for (const id of ["ck-corpus", "gp-corpus", "st-corpus"]) { const sel = $("#" + id); const v = sel.value; sel.innerHTML = corpusOptions() || "<option value=''>（先に「集める」で記事を集めてください）</option>"; if ([...sel.options].some(o => o.value === v)) sel.value = v; else if (CORPUS && [...sel.options].some(o => o.value === CORPUS.id)) sel.value = CORPUS.id; sel.onchange = () => selectCorpus(sel.value); } fillDocSelects(); }
async function selectCorpus(id) { for (const s of ["ck-corpus", "gp-corpus", "st-corpus"]) if ([...$("#" + s).options].some(o => o.value === id)) $("#" + s).value = id; if (id === "paste") return; const r = await HDB.get(id); if (!r) return; CORPUS = { id, key: r.key, docs: r.items.filter(i => i.text).map(i => ({ id: i.id, url: i.url, title: i.title, text: i.text, published: i.published, source_class: i.source_class, s_source: i.s_source, reliability: i.reliability, grade: i.grade })) }; $("#ck-meta").textContent = `${CORPUS.docs.length} 記事（本文あり）`; $("#gp-topic").placeholder = r.key; fillDocSelects(); }
async function currentCorpus(selId) { const id = $("#" + selId).value; if (id === "paste" && CORPUS?.id === "paste") return CORPUS; if (!id) return null; if (!CORPUS || CORPUS.id !== id) await selectCorpus(id); return CORPUS; }
$("#ck-paste-use").onclick = () => { const parts = $("#ck-paste").value.split(/^\s*---\s*$/m).map(s => s.trim()).filter(Boolean); if (!parts.length) return; CORPUS = { id: "paste", key: "貼り付け", docs: parts.map((t, i) => ({ id: "p" + i, url: "text://" + (i + 1), title: `テキスト ${i + 1}：${t.slice(0, 30)}`, text: t, published: null, source_class: "other", s_source: 0.5 })) }; renderCorpusSelects(); $("#ck-corpus").value = "paste"; $("#ck-meta").textContent = `${parts.length} 件のテキスト`; };
function fillDocSelects() { const opts = (CORPUS?.docs || []).map((d, i) => `<option value="${i}">${esc((d.title || d.url).slice(0, 50))}</option>`).join(""); $("#ex-doc").innerHTML = opts || "<option value=''>（コーパスを選ぶ）</option>"; $("#st-diff-sel-a").innerHTML = opts; $("#st-diff-sel-b").innerHTML = opts; }
const docLink = d => `<a href="${esc(d.url)}" target="_blank" rel="noopener">${esc((d.title || d.url).slice(0, 60))}</a>`;
async function saveAnalysis(label, key, html, result_label) { await saveRun({ kind: "analysis", label, key, html, result_label }); }

/* ---------- 検証 ---------- */
let ckTab = "consistency";
function setCheckTab(k) { ckTab = k; $$("#ck-tabs .chip").forEach(c => c.classList.toggle("on", c.dataset.k === k)); $("#ck-claim-box").classList.toggle("hidden", k !== "claim"); }
$$("#ck-tabs .chip").forEach(c => c.onclick = () => setCheckTab(c.dataset.k)); $("#ck-run").onclick = runCheck; $("#ck-claim-run").onclick = runCheck; $("#ck-claim").onkeydown = e => { if (e.key === "Enter") runCheck(); };
async function runCheck() {
  const st = m => $("#ck-status").textContent = m; const out = $("#ck-out"); $("#ck-run").disabled = true; out.innerHTML = "";
  try {
    const C = await currentCorpus("ck-corpus"); if (!C && ckTab !== "claim") { st("先に「集める」で記事を集めるか、テキストを貼ってください"); return; }
    let html = "", label = "";
    if (ckTab === "consistency") { await models(st); const r = await A.consistencyMatrix(C.docs, state.embed, state.nli, st); html = consistencyHtml(C.docs, r); label = `一致 ${r.summary.reduce((s, x) => s + x.agree, 0)}・矛盾 ${r.summary.reduce((s, x) => s + x.contra, 0)}`; await saveAnalysis("矛盾・整合", C.key, html, label); }
    else if (ckTab === "bias") { await models(st); const r = await A.biasScore(C.docs, state.embed, state.nli, st); html = biasHtml(r); label = `客観 ${r.filter(x => x.label === "客観的").length}/${r.length}`; await saveAnalysis("偏り・客観性", C.key, html, label); }
    else if (ckTab === "primary") { await models(st, ["nli"]); const r = await A.primaryScore(C.docs, state.nli, st); html = primaryHtml(r); label = `一次 ${r.filter(x => x.label === "一次情報").length}/${r.length}`; await saveAnalysis("一次情報", C.key, html, label); }
    else if (ckTab === "temporal") { const r = A.temporalCheck(C.docs); html = temporalHtml(r); label = `警告 ${r.perDoc.reduce((s, d) => s + d.warns.length, 0)}・数値の食い違い ${r.conflicts.length}`; await saveAnalysis("時間的矛盾", C.key, html, label); }
    else { const claim = $("#ck-claim").value.trim(); if (!claim) { st("主張を入れてください"); return; } await models(st); let docs = C?.docs || []; if (docs.length < 3) { st("関連ページを集めています"); const { items } = await collectLive(claim, { dorks: new Set(["exact", "official_jp", "news_pr", "factcheck", "deny"]), engines: new Set(["ddg", "gnews", "wiki"]), nread: 10, status: st }); const dom = await domInfosFor(items, st); for (const it of items) { const { s, cls } = J.sourceScore(it, dom[NET.hostOf(it.url)]); it.s_source = s; it.source_class = cls; } docs = docs.concat(items); } const v = await J.verify(claim, docs, state.embed, state.nli, st); html = `<div class="card"><h3 style="margin-top:0">${esc(claim)}</h3>${verdictCard(v)}</div>`; label = J.VERDICT[v.verdict]?.[0] || v.verdict; await saveAnalysis("主張を検証", claim, html, label); }
    out.innerHTML = html; st(PRIV.on ? "完了（🔒 保存していません）" : "完了（履歴に保存）"); out.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (e) { st("エラー: " + (e.message || e)); console.error(e); } finally { $("#ck-run").disabled = false; }
}
function consistencyHtml(docs, r) {
  const n = docs.length; const cell = x => !x ? '<td class="muted tiny">—</td>' : `<td class="${x.kind === "agree" ? "ok" : x.kind === "contra" ? "bad" : "muted"}" title="${esc(x.text)}">${x.kind === "agree" ? "一致 " + pct(x.e) : x.kind === "contra" ? "矛盾 " + pct(x.c) : "無関係"}</td>`;
  return `<div class="card"><h3 style="margin-top:0">整合マトリクス <span class="muted small">行＝その記事の要旨、列＝他の記事の段落がそれを 一致／矛盾／無関係 と判定</span></h3><div class="tw"><table><thead><tr><th>要旨（記事）</th>${docs.map((d, j) => `<th title="${esc(d.title)}">${j + 1}</th>`).join("")}<th>一致/矛盾</th></tr></thead><tbody>${docs.map((d, i) => `<tr><td><b>${i + 1}</b> ${docLink(d)}<div class="tiny muted">${esc(r.claims[i] || "（命題が取れず）")}</div></td>${r.M[i].map((x, j) => i === j ? '<td class="muted">・</td>' : cell(x)).join("")}<td><span class="ok">${r.summary[i].agree}</span> / <span class="bad">${r.summary[i].contra}</span></td></tr>`).join("")}</tbody></table></div><p class="small muted">「矛盾」が多い行は、他の記事と食い違う主張を含む可能性。セルにマウスを乗せると根拠の段落。</p></div>`;
}
function biasHtml(r) { return `<div class="card"><h3 style="margin-top:0">偏り・客観性</h3><div class="tw"><table><thead><tr><th>客観性</th><th>記事</th><th>文体（埋め込み）</th><th>含意モデル</th><th>語彙の手がかり</th></tr></thead><tbody>${r.sort((a, b) => b.objectivity - a.objectivity).map(x => `<tr><td><span class="g g${x.objectivity >= 65 ? "A" : x.objectivity >= 45 ? "C" : "D"}">${x.objectivity}</span><div class="tiny">${esc(x.label)}</div></td><td><a href="${esc(x.url)}" target="_blank" rel="noopener">${esc((x.title || x.url).slice(0, 60))}</a></td><td class="small">${Object.entries(x.style).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k, v]) => `${k} ${pct(v)}`).join("・")}</td><td class="small">事実 ${pct(x.nli.fact)}・意見 ${pct(x.nli.opinion)}・煽り ${pct(x.nli.emotive)}</td><td class="small">${[...x.lex.emotive, ...x.lex.hedge, ...x.lex.ad].slice(0, 8).map(w => `<span class="tag">${esc(w)}</span>`).join(" ") || "—"}</td></tr>`).join("")}</tbody></table></div></div>`; }
function primaryHtml(r) { return `<div class="card"><h3 style="margin-top:0">一次情報の判定</h3><div class="tw"><table><thead><tr><th>一次らしさ</th><th>記事</th><th>判定</th><th>根拠</th></tr></thead><tbody>${r.sort((a, b) => b.primary - a.primary).map(x => `<tr><td><span class="g g${x.primary >= 65 ? "A" : x.primary >= 45 ? "C" : "D"}">${x.primary}</span></td><td><a href="${esc(x.url)}" target="_blank" rel="noopener">${esc((x.title || x.url).slice(0, 60))}</a></td><td>${esc(x.label)}</td><td class="small">${x.why.map(w => `<span class="tag">${esc(w)}</span>`).join(" ")}</td></tr>`).join("")}</tbody></table></div></div>`; }
function temporalHtml(r) { return `<div class="card"><h3 style="margin-top:0">時間的な矛盾・古さ</h3>${r.perDoc.filter(d => d.warns.length).map(d => `<div class="item"><div class="t"><a href="${esc(d.url)}" target="_blank" rel="noopener">${esc((d.title || d.url).slice(0, 70))}</a> <span class="tiny muted">${esc(d.published || "日付なし")}</span></div>${d.warns.map(w => `<div class="ev con">${esc(w)}</div>`).join("")}<div class="tiny muted">本文の年：${d.dates.map(x => x.y).filter((v, i, a) => a.indexOf(v) === i).join("・") || "なし"}</div></div>`).join("") || "<p class='small muted'>古さ・時間のずれの警告はなし</p>"}</div><div class="card"><h3 style="margin-top:0">記事間で食い違う数値</h3>${r.conflicts.length ? r.conflicts.map(c => `<div class="item"><b>${esc(c.key)}</b> <span class="tiny muted">（${esc(c.unit)}）</span><div class="tw"><table>${c.values.map(v => `<tr><td>${esc(String(v.value))} ${esc(c.unit)}</td><td class="small"><a href="${esc(v.url)}" target="_blank" rel="noopener">${esc(String(v.doc).slice(0, 40))}</a> ${esc(v.published || "")}</td><td class="tiny muted">${esc(v.text)}</td></tr>`).join("")}</table></div></div>`).join("") : "<p class='small muted'>同じ項目で異なる数値は見つからず（項目名の抽出は簡易なので見落としあり）</p>"}</div>`; }
function verdictCard(v) {
  const [label, cls] = J.VERDICT[v.verdict] || [v.verdict, ""];
  return `<div class="verdict ${cls}">${label}</div><div class="stats"><div class="stat">支持（重み付き）<b>${v.support}</b></div><div class="stat">反証<b>${v.refute}</b></div><div class="stat">支持ドメイン<b>${(v.support_domains || []).length}</b></div><div class="stat">反証ドメイン<b>${(v.refute_domains || []).length}</b></div><div class="stat">照合段落<b>${v.n_passages ?? "—"}</b></div></div>
   ${(v.evidence || []).map(e => `<div class="ev ${e.kind === "support" ? "sup" : e.kind === "refute" ? "con" : ""}"><span class="tag ${e.kind === "support" ? "sup" : e.kind === "refute" ? "con" : ""}">${e.kind === "support" ? "含意" : e.kind === "refute" ? "矛盾" : "中立"} ${((e.kind === "refute" ? e.contra : e.entail) * 100) | 0}%</span> <a href="${esc(e.url)}" target="_blank" rel="noopener">${esc(e.domain)}</a> <span class="muted tiny">類似 ${e.sim}${e.published ? "・" + esc(e.published) : ""}</span><br>${esc(e.text)}</div>`).join("") || "<p class='small muted'>照合できる段落がありませんでした</p>"}`;
}

/* ---------- ギャップ・対立 ---------- */
let gpTab = "gaps"; $$("#gp-tabs .chip").forEach(c => c.onclick = () => { gpTab = c.dataset.k; $$("#gp-tabs .chip").forEach(x => x.classList.toggle("on", x === c)); }); $("#gp-run").onclick = runGap;
async function runGap() {
  const st = m => $("#gp-status").textContent = m; const out = $("#gp-out"); $("#gp-run").disabled = true; out.innerHTML = "";
  try { const C = await currentCorpus("gp-corpus"); if (!C) { st("先に「集める」で記事を集めてください"); return; } const topic = $("#gp-topic").value.trim() || C.key; let html, label;
    if (gpTab === "gaps") { await models(st, ["embed", "rerank"]); const r = await A.knowledgeGaps(topic, C.docs, state.rerank, state.embed, st); html = gapsHtml(topic, r); label = `回答済み ${r.covered}/${r.questions.length}`; await saveAnalysis("ナレッジギャップ", topic, html, label); }
    else { await models(st); const r = await A.opposingViews(topic, C.docs, state.embed, state.nli, st); html = opposingHtml(topic, r); label = `反対 ${r.stance.counts.反対}・矛盾 ${r.contradictions.length}`; await saveAnalysis("対立視点", topic, html, label); }
    out.innerHTML = html; wireGapActions(out); st(PRIV.on ? "完了（🔒 保存していません）" : "完了（履歴に保存）"); out.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (e) { st("エラー: " + (e.message || e)); console.error(e); } finally { $("#gp-run").disabled = false; }
}
function gapsHtml(topic, r) { return `<div class="card"><h3 style="margin-top:0">「${esc(topic)}」で分かっていること・分かっていないこと <span class="muted small">${r.covered}/${r.questions.length} の問いに答えあり</span></h3><div class="tw"><table><thead><tr><th>問い</th><th>状態</th><th>最も近い記述（関連度）</th><th></th></tr></thead><tbody>${r.questions.map(q => `<tr><td><b>${esc(q.label)}</b><div class="tiny muted">${esc(q.question)}</div></td><td>${q.answered ? '<span class="ok">回答あり</span>' : '<span class="bad">未回答</span>'}<div class="tiny">関連 ${q.score}・類似 ${q.sim}</div></td><td class="small">${q.evidence ? `${esc(q.evidence.text.slice(0, 160))} <a href="${esc(q.evidence.url)}" target="_blank" rel="noopener">${esc(NET.hostOf(q.evidence.url))}</a>` : "—"}</td><td>${q.answered ? "" : `<button class="small act-search" data-q="${esc(q.dork)}">この式で集める</button>`}</td></tr>`).join("")}</tbody></table></div><p class="small muted">未回答＝リランカーの関連度 0.25 未満かつ埋め込み類似 0.91 未満。「この式で集める」を押すと、その問いに向いた検索式で「集める」を実行する。</p></div>`; }
function opposingHtml(topic, r) { const c = r.stance.counts; return `<div class="card"><h3 style="margin-top:0">「${esc(topic)}」への立場 <span class="muted small">段落の分類：賛成 ${c.賛成}・反対 ${c.反対}・中立 ${c.中立}</span></h3><h3>反対意見・課題・懸念</h3>${r.stance.against.map(p => `<div class="ev con"><span class="tag con">反対 ${pct(p.stance.反対)}</span> ${docLink(p.doc)}<br>${esc(p.text)}</div>`).join("") || "<p class='small muted'>反対・課題を述べる段落は見つからず → 情報収集が一方に偏っている可能性。「ギャップ」の『反対・課題』の検索式で集め直すとよい</p>"}<h3>賛成・肯定</h3>${r.stance.pro.slice(0, 5).map(p => `<div class="ev sup"><span class="tag sup">賛成 ${pct(p.stance.賛成)}</span> ${docLink(p.doc)}<br>${esc(p.text)}</div>`).join("") || "<p class='small muted'>なし</p>"}</div><div class="card"><h3 style="margin-top:0">記事間で矛盾する記述 <span class="muted small">${r.contradictions.length} 組</span></h3>${r.contradictions.map(x => `<div class="item"><span class="tag con">矛盾 ${pct(x.contra)}</span> <span class="tiny muted">類似 ${x.sim.toFixed(2)}</span><div class="small">A：${esc(x.a.text)} <span class="tiny">${docLink(x.a.doc)}</span></div><div class="small">B：${esc(x.b.text)} <span class="tiny">${docLink(x.b.doc)}</span></div></div>`).join("") || "<p class='small muted'>矛盾する組は見つからず</p>"}</div>`; }
function wireGapActions(root) { root.querySelectorAll(".act-search").forEach(b => b.onclick = () => { show("live"); $("#lv-q").value = b.dataset.q; lvSel.dorks = new Set(["exact"]); $$("#lv-dorks .chip").forEach(c => c.classList.toggle("on", c.dataset.k === "exact")); runLive(); }); }

/* ---------- 構造化 ---------- */
let stTab = "matrix"; $("#st-axes").value = A.DEFAULT_AXES.join(", ");
$$("#st-tabs .chip").forEach(c => c.onclick = () => { stTab = c.dataset.k; $$("#st-tabs .chip").forEach(x => x.classList.toggle("on", x === c)); $("#st-matrix-box").classList.toggle("hidden", stTab !== "matrix"); $("#st-qa-box").classList.toggle("hidden", stTab !== "qa"); $("#st-diff-box").classList.toggle("hidden", stTab !== "diff"); });
$("#st-run").onclick = runStruct; $("#st-question").onkeydown = e => { if (e.key === "Enter") runStruct(); };
$("#st-diff-sel-a").onchange = () => { const d = CORPUS?.docs[+$("#st-diff-sel-a").value]; if (d) $("#st-diff-a").value = d.text.slice(0, 6000); }; $("#st-diff-sel-b").onchange = () => { const d = CORPUS?.docs[+$("#st-diff-sel-b").value]; if (d) $("#st-diff-b").value = d.text.slice(0, 6000); };
async function runStruct() {
  const st = m => $("#st-status").textContent = m; const out = $("#st-out"); $("#st-run").disabled = true; out.innerHTML = "";
  try { let html, label, key; const C = stTab === "diff" ? null : await currentCorpus("st-corpus"); if (stTab !== "diff" && !C) { st("先に「集める」で記事を集めてください"); return; }
    if (stTab === "matrix") { const axes = $("#st-axes").value.split(/[,、，]/).map(s => s.trim()).filter(Boolean); await models(st, ["embed", "rerank"]); const r = await A.matrix(C.docs.slice(0, 12), axes, state.rerank, state.embed, C.key.startsWith("http") ? "" : C.key, st); html = matrixHtml(r); label = `${r.rows.length}×${axes.length}`; key = C.key; }
    else if (stTab === "summary") { await models(st, ["embed"]); const r = await A.summarize(C.docs, state.embed, 7, st); html = `<div class="card"><h3 style="margin-top:0">要約（抽出型・根拠つき）</h3>${r.map((s, i) => `<div class="ev"><b>${i + 1}.</b> ${esc(s.text)} <span class="tiny"><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(NET.hostOf(s.url))}</a>${s.published ? " " + esc(s.published) : ""}</span></div>`).join("")}<p class="small muted">埋め込みの重心に近く（出所の重みつき）、互いに重複しない段落を選んだもの。生成はしないので、書かれていないことは出ない。</p></div>`; label = `${r.length} 文`; key = C.key; }
    else if (stTab === "qa") { const q = $("#st-question").value.trim(); if (!q) { st("質問を入れてください"); return; } await models(st, ["embed", "rerank", "nli"]); const r = await A.answer(q, C.docs, state.rerank, state.embed, state.nli, st); html = `<div class="card"><h3 style="margin-top:0">Q：${esc(q)}</h3>${r.hits.map((h, i) => `<div class="ev ${h.nli ? (h.nli[0] >= 0.5 ? "sup" : h.nli[2] >= 0.5 ? "con" : "") : ""}"><span class="tag">関連度 ${pct(h.score)}</span>${h.nli ? ` <span class="tag ${h.nli[0] >= 0.5 ? "sup" : h.nli[2] >= 0.5 ? "con" : ""}">${h.nli[0] >= 0.5 ? "支持" : h.nli[2] >= 0.5 ? "矛盾" : "中立"}</span>` : ""} ${docLink(h.doc)}<br>${esc(h.text)}</div>`).join("") || "<p class='small muted'>関連する段落なし</p>"}<p class="small muted">答えは生成せず、根拠の段落をそのまま示す。</p></div>`; label = `根拠 ${r.hits.length}`; key = q; }
    else { const a = $("#st-diff-a").value.trim(), b = $("#st-diff-b").value.trim(); if (!a || !b) { st("旧・新のテキストを入れてください"); return; } await models(st); const r = await A.semanticDiff(a, b, state.embed, state.nli, st); html = diffHtml(r); label = `意味の変化 ${r.changed.length}・追加 ${r.added.length}・削除 ${r.removed.length}`; key = "差分：" + a.slice(0, 30); }
    out.innerHTML = html; wireMatrix(out); await saveAnalysis({ matrix: "比較表", summary: "要約", qa: "Q&A", diff: "意味差分" }[stTab], key, html, label); st(PRIV.on ? "完了（🔒 保存していません）" : "完了（履歴に保存）"); out.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (e) { st("エラー: " + (e.message || e)); console.error(e); } finally { $("#st-run").disabled = false; }
}
function matrixHtml(r) { return `<div class="card"><h3 style="margin-top:0">比較表 <button class="small" id="mx-csv" style="float:right">CSV</button></h3><div class="tw"><table id="mx-table"><thead><tr><th>記事</th>${r.axes.map(a => `<th>${esc(a)}</th>`).join("")}</tr></thead><tbody>${r.rows.map(row => `<tr><td>${docLink(row.doc)}<div class="tiny muted">${esc(row.doc.published || "")}</div></td>${row.cells.map(c => c ? `<td class="small">${esc(c.text.slice(0, 220))}<div class="tiny muted">関連度 ${c.score}</div></td>` : '<td class="muted tiny">—</td>').join("")}</tr>`).join("")}</tbody></table></div><p class="small muted">各セルは「トピックの＜軸＞は何ですか？」に最も近い文（埋め込み）。確信はリランカーの関連度（高 ≥0.2・中 ≥0.05・低）。</p></div>`; }
function wireMatrix(root) { const b = root.querySelector("#mx-csv"); if (!b) return; b.onclick = () => { const rows = [...root.querySelectorAll("#mx-table tr")].map(tr => [...tr.children].map(td => `"${td.textContent.replace(/\s+/g, " ").trim().replace(/"/g, '""')}"`).join(",")); dl("matrix.csv", "\ufeff" + rows.join("\n"), "text/csv"); }; }
function diffHtml(r) { const kindCls = k => /反転|矛盾/.test(k) ? "con" : /増えた/.test(k) ? "sup" : ""; return `<div class="card"><h3 style="margin-top:0">意味的な差分</h3><div class="stats"><div class="stat">意味が変わった<b>${r.changed.length}</b></div><div class="stat">言い換えだけ<b>${r.paraphrase.length}</b></div><div class="stat">追加<b>${r.added.length}</b></div><div class="stat">削除<b>${r.removed.length}</b></div><div class="stat">同一<b>${r.pairs}</b></div></div>${r.changed.map(p => `<div class="ev ${kindCls(p.kind)}"><span class="tag ${kindCls(p.kind)}">${esc(p.kind)}</span><div class="small">旧：${esc(p.a)}</div><div class="small">新：${esc(p.b)}</div></div>`).join("")}${r.added.map(s => `<div class="ev sup"><span class="tag sup">追加</span> ${esc(s)}</div>`).join("")}${r.removed.map(s => `<div class="ev con"><span class="tag con">削除</span> ${esc(s)}</div>`).join("")}<details><summary>言い換えだけ（意味は同じ）${r.paraphrase.length} 組</summary>${r.paraphrase.map(p => `<div class="ev"><div class="small">旧：${esc(p.a)}</div><div class="small">新：${esc(p.b)}</div></div>`).join("")}</details></div>`; }

/* ---------- 長文一括 vs 分割 ---------- */
$("#ex-run").onclick = runExp; $("#ex-batch").onclick = runExpBatch;
async function runExp() {
  const st = m => $("#ex-status").textContent = m; const out = $("#ex-out"); $("#ex-run").disabled = true;
  try { const C = CORPUS || await currentCorpus("st-corpus"); const d = C?.docs[+$("#ex-doc").value]; const q = $("#ex-q").value.trim(); if (!d || !q) { st("文書と問いを指定してください"); return; }
    await models(st, ["rerank", "nli"]); const r = await A.longVsChunk(q, d, state.rerank, state.nli, +$("#ex-chunk").value, st); out.innerHTML = expHtml(q, d, r) + out.innerHTML; st("完了"); }
  catch (e) { st("エラー: " + (e.message || e)); console.error(e); } finally { $("#ex-run").disabled = false; }
}
function expHtml(q, d, r) { const nl = p => p ? `含意 ${pct(p[0])} / 中立 ${pct(p[1])} / 矛盾 ${pct(p[2])}` : "—"; return `<div class="card"><h3 style="margin-top:0">${esc(q)} <span class="muted small">— ${docLink(d)}（約 ${r.whole.tokens} トークン）</span></h3><div class="tw"><table><thead><tr><th></th><th>一括（最大 8,192）</th><th>分割（${r.chunk.n} チャンク）</th></tr></thead><tbody><tr><td>関連度（リランカー）</td><td>${r.whole.score.toFixed(3)}</td><td>${r.chunk.score.toFixed(3)} <span class="tiny muted">各 ${r.chunk.scores.join(" ")}</span></td></tr>${r.whole.nli ? `<tr><td>含意（主張として）</td><td>${nl(r.whole.nli)}</td><td>${nl(r.chunk.nli)}（各チャンクの最大）</td></tr>` : ""}<tr><td>処理時間</td><td>${r.whole.ms}${r.whole.nli_ms ? " + " + r.whole.nli_ms : ""} ms</td><td>${r.chunk.ms}${r.chunk.nli_ms ? " + " + r.chunk.nli_ms : ""} ms</td></tr><tr><td>最も関連したチャンク</td><td class="muted">—</td><td class="small">${esc(r.chunk.best || "")}</td></tr></tbody></table></div><p class="small muted">「モデル」タブで多言語モデル（512 まで）に切り替えると、一括側も 512 で切れる＝従来 BERT の条件になる。</p></div>`; }
async function runExpBatch() {
  const st = m => $("#ex-status").textContent = m; const out = $("#ex-out"); const C = CORPUS || await currentCorpus("st-corpus"); const q = $("#ex-q").value.trim(); if (!C || !q) { st("コーパスと問いを指定してください"); return; } $("#ex-batch").disabled = true;
  try { await models(st, ["rerank", "nli"]); const rows = []; for (const [i, d] of C.docs.slice(0, 15).entries()) { st(`${i + 1}/${Math.min(15, C.docs.length)} ${(d.title || "").slice(0, 20)}`); const r = await A.longVsChunk(q, d, state.rerank, state.nli, +$("#ex-chunk").value, () => { }); rows.push({ d, r }); }
    const agree = rows.filter(x => (x.r.whole.score >= 0.35) === (x.r.chunk.score >= 0.35)).length; const html = `<div class="card"><h3 style="margin-top:0">コーパス全体：${esc(q)} <span class="muted small">${rows.length} 文書・判定一致 ${agree}/${rows.length}</span></h3><div class="tw"><table><thead><tr><th>文書</th><th>トークン</th><th>一括</th><th>分割（最大）</th><th>差</th><th>時間 一括/分割 ms</th></tr></thead><tbody>${rows.map(({ d, r }) => `<tr><td>${docLink(d)}</td><td>${r.whole.tokens}</td><td>${r.whole.score.toFixed(3)}</td><td>${r.chunk.score.toFixed(3)}</td><td class="${Math.abs(r.whole.score - r.chunk.score) > 0.2 ? "warn" : ""}">${(r.whole.score - r.chunk.score).toFixed(3)}</td><td>${r.whole.ms} / ${r.chunk.ms}</td></tr>`).join("")}</tbody></table></div><div class="actbar"><button class="small" id="ex-csv">CSV</button></div></div>`;
    out.innerHTML = html + out.innerHTML; out.querySelector("#ex-csv").onclick = () => dl("long_vs_chunk.csv", "\ufeff" + [["title", "url", "tokens", "whole", "chunk_max", "whole_ms", "chunk_ms", "n_chunks"]].concat(rows.map(({ d, r }) => [d.title, d.url, r.whole.tokens, r.whole.score, r.chunk.score, r.whole.ms, r.chunk.ms, r.chunk.n])).map(r => r.map(x => `"${String(x ?? "").replace(/"/g, '""')}"`).join(",")).join("\n"), "text/csv"); await saveAnalysis("長文 vs 分割", q, html, `一致 ${agree}/${rows.length}`); st(PRIV.on ? "完了（🔒 保存していません）" : "完了（履歴に保存）"); }
  catch (e) { st("エラー: " + (e.message || e)); } finally { $("#ex-batch").disabled = false; }
}

/* ---------- モデル ---------- */
async function registry() { if (!REG) REG = await getJSON("./registry.json") || { browser: [], base: [], compare: [] }; return REG; }
async function renderModels() {
  const reg = await registry(); const res = (await getJSON("./data/models.json"))?.results || []; const R = Object.fromEntries(res.map(r => [r.name, r]));
  const stored = {}; for (const m of reg.browser) stored[m.name] = await ML.isStored(m.name);
  const roles = { embed: "埋め込み", nli: "含意", rerank: "関連度" };
  $("#md-browser").innerHTML = `<div class="tw"><table><thead><tr><th>使う</th><th>モデル</th><th>役割</th><th>文脈長</th><th>サイズ</th><th>端末</th><th>備考</th></tr></thead><tbody>${reg.browser.map(m => `<tr><td><input type="radio" name="sel-${m.role}" value="${esc(m.name)}" ${ML.modelName(m.role) === m.name ? "checked" : ""}></td><td><b>${esc(m.name)}</b><div class="tiny muted">${esc(m.arch)}${m.hf ? ` · <a href="https://huggingface.co/${esc(m.hf)}" target="_blank" rel="noopener">HF</a>` : " · 本リポジトリ"}</div></td><td>${roles[m.role]}</td><td>${m.ctx >= 8192 ? '<span class="ok">8,192</span>' : m.ctx}</td><td>${m.size_mb} MB</td><td class="small">${stored[m.name] ? '<span class="ok">保存済み</span>' : `<button class="small md-dl" data-n="${esc(m.name)}">取得</button>`}${stored[m.name] ? ` <button class="small md-rm" data-n="${esc(m.name)}">削除</button>` : ""}</td><td class="small">${esc(m.note)}</td></tr>`).join("")}</tbody></table></div><div class="small muted" id="md-msg"></div>`;
  $$("#md-browser input[type=radio]").forEach(r => r.onchange = () => { ML.setModelName(r.name.replace("sel-", ""), r.value); state[r.name.replace("sel-", "")] = null; $("#md-msg").textContent = `${r.value} を ${roles[r.name.replace("sel-", "")]} に使います（次の処理から）`; renderModelBars(); });
  $$("#md-browser .md-dl").forEach(b => b.onclick = async () => { b.disabled = true; try { await ML.loadByName(b.dataset.n, m => $("#md-msg").textContent = m); $("#md-msg").textContent = "完了"; renderModels(); } catch (e) { $("#md-msg").textContent = "失敗: " + e.message; b.disabled = false; } });
  $$("#md-browser .md-rm").forEach(b => b.onclick = async () => { await ML.removeStored(b.dataset.n); renderModels(); });
  $("#md-table").innerHTML = `<div class="tw"><table><thead><tr><th>モデル</th><th>役割</th><th>指標</th><th>CPU 遅延</th><th>パラメータ / 配布</th></tr></thead><tbody>${reg.compare.filter(m => m.role !== "base").map(m => { const r = R[m.name] || {}; return `<tr><td><b>${esc(m.name)}</b><div class="tiny muted">${esc(m.arch || "")}</div></td><td>${roles[m.role] || m.role}</td><td class="small">${r.ok ? (m.role === "embed" ? `JSTS ${r.jsts_spearman}・cos差 ${r.nli_cos_gap}` : `JNLI ${(r.jnli_acc * 100).toFixed(1)}%・含意再現 ${(r.entail_recall * 100) | 0}%・ECE ${r.ece}`) : '<span class="muted">未測定</span>'}</td><td>${r.latency_ms != null ? r.latency_ms + " ms" : "—"}</td><td class="small">${m.params_m ?? r.params_m ?? "—"}M / ${m.size_mb ?? "—"} MB</td></tr>`; }).join("")}</tbody></table></div>`;
  $("#md-base").innerHTML = `<div class="tw"><table><thead><tr><th>判定</th><th>土台</th><th>構造</th><th>パラメータ</th><th>文脈長</th><th>ライセンス</th><th>ブラウザで試す</th><th>用途</th></tr></thead><tbody>${reg.base.map(m => `<tr><td><b>${esc(m.rank || "")}</b></td><td><b>${esc(m.name)}</b>${m.hf ? `<div class="tiny"><a href="https://huggingface.co/${esc(m.hf)}" target="_blank" rel="noopener">${esc(m.hf)}</a></div>` : ""}</td><td>${esc(m.arch)}</td><td>${m.params_m ? m.params_m + "M" : "—"}</td><td>${m.ctx}</td><td class="small">${esc(m.license)}</td><td class="small">${(m.browser || []).map(n => `<code>${esc(n)}</code>`).join(" ") || '<span class="muted">—（学習後に追加）</span>'}</td><td class="small">${esc(m.note)}</td></tr>`).join("")}</tbody></table></div><p class="small muted">◎＝第一候補、○＝比較して選ぶ、△＝資源があれば、比較＝従来型の対照。「ブラウザで試す」のモデルを上の表で選ぶと、学習前の土台のままの性能（ゼロショット基準）を同じ指標で測れる。学習後は <code>models/fcb-*</code> として同じ表に並ぶ。</p>`;
}

/* ---------- 仕組み・解説 ---------- */
function renderHow() {
  const P = J.P; const box = $("#how-params"); if (box.dataset.done) return; box.dataset.done = 1;
  const num = (path, v, step = 0.05, min = -1, max = 2) => `<span>${esc(path)}</span><input type="range" data-p="${esc(path)}" min="${min}" max="${max}" step="${step}" value="${v}"><input type="number" data-p="${esc(path)}" step="${step}" value="${v}">`;
  const sec = (title, obj, prefix, step, min, max) => `<h3>${title}</h3><div class="pfield">${Object.entries(obj).map(([k, v]) => num(prefix + k, v, step, min, max)).join("")}</div>`;
  box.innerHTML = sec("重み w（合計 1 が目安）", P.weights, "weights.", 0.05, 0, 1) + sec("出所：ドメイン種別の基礎点", P.source_class, "source_class.", 0.05, 0, 1) + sec("出所：加点・減点", P.source_bonus, "source_bonus.", 0.01, -0.5, 0.5) + sec("内容：文体の重み", P.content.zero_shot_weight, "content.zero_shot_weight.", 0.05, -0.5, 0.5) + sec("裏取り", { top_k: P.corroboration.top_k, min_sim: P.corroboration.min_sim, entail_min: P.corroboration.entail_min, contra_min: P.corroboration.contra_min, saturation: P.corroboration.saturation }, "corroboration.", 0.01, 0, 40) + sec("検証", { top_k: P.verify.top_k, min_sim: P.verify.min_sim, support_min: P.verify.support_min, refute_min: P.verify.refute_min, "verdict.supported": P.verify.verdict.supported, "verdict.refuted": P.verify.verdict.refuted, "verdict.mixed_ratio": P.verify.verdict.mixed_ratio }, "verify.", 0.01, 0, 40) + sec("時間", P.time, "time.", 1, 0, 365) + sec("クラスタ", P.cluster, "cluster.", 0.01, 0.5, 1);
  box.querySelectorAll("input").forEach(i => i.oninput = () => { box.querySelectorAll(`input[data-p="${i.dataset.p}"]`).forEach(o => o.value = i.value); setPath(J.P, i.dataset.p, +i.value); J.setParams(J.P, false); });
  $("#pr-save").onclick = () => { J.setParams(J.P, true); $("#pr-msg").textContent = "保存しました（この端末の判定に反映）"; };
  $("#pr-dl").onclick = () => dl("params.json", JSON.stringify(J.P, null, 1), "application/json");
  $("#pr-reset").onclick = async () => { J.resetParams(); await J.loadParams(); box.dataset.done = ""; renderHow(); $("#pr-msg").textContent = "初期値に戻しました"; };
  $("#how-sources").innerHTML = `<div class="tw"><table><thead><tr><th>名前</th><th>情報源</th><th>方法</th><th>どこで</th></tr></thead><tbody>${SOURCES_DOC.map(r => `<tr>${r.map(x => `<td>${esc(x)}</td>`).join("")}</tr>`).join("")}</tbody></table></div><p class="small muted">「Actions」は GitHub Actions（Python）だけ。ブラウザからは CORS の都合で r.jina.ai／rss2json 経由になる。すべて無料・API キーなし。人物検索・アカウント特定・ポートスキャンは行わない。</p>`;
  $("#how-dorks").innerHTML = `<div class="tw"><table><thead><tr><th>名前</th><th>式</th></tr></thead><tbody>${Object.entries(DORKS).map(([k, [l, t]]) => `<tr><td>${l}</td><td class="mono">${esc(t)}</td></tr>`).join("")}<tr><td>ドメイン向け</td><td class="mono">site:{domain} (filetype:pdf OR filetype:docx OR filetype:xlsx) ／ "{domain}" -site:{domain} ／ site:*.{domain}</td></tr></tbody></table></div><p class="small muted">DuckDuckGo は括弧と after:/before: を解釈しないので送る前に外す。Google 固有の演算子は使わない。</p>`;
}
function setPath(o, p, v) { const ks = p.split("."); let x = o; for (const k of ks.slice(0, -1)) x = x[k]; x[ks.at(-1)] = v; }

async function renderAbout() {
  if ($("#about-box").dataset.done) return; $("#about-box").dataset.done = 1;
  try { $("#about-box").innerHTML = await (await fetch(new URL("./about.html", import.meta.url))).text(); } catch { $("#about-box").innerHTML = "<p class='muted'>読めません</p>"; }
  const sm = await getJSON("./models/nli-ja-30m/meta.json"); const ev = await getJSON("./models/nli-ja-30m/eval.json"); const tr = await getJSON("./models/nli-ja-30m/summary.json");
  const box = $("#ab-train"); if (!box) return; let h = "";
  if (tr) h += `<div class="kv"><span>土台</span><span>${esc(tr.base)}</span><span>訓練データ</span><span>JNLI ${tr.n_train} 対（クラス重み付け）</span><span>エポック / lr / 系列長</span><span>${tr.epochs} / ${tr.lr} / ${tr.seq}</span><span>torch 正解率（テスト ${tr.eval_n} 対）</span><span>${(tr.eval_acc * 100).toFixed(1)}%</span><span>混同行列（行=正解 含意/中立/矛盾）</span><span class="mono">${esc(JSON.stringify(tr.confusion))}</span><span>学習時間</span><span>${Math.round(tr.sec / 60)} 分</span></div>`;
  if (ev) h += `<div class="kv"><span>ONNX int8 正解率</span><span>${(ev.acc * 100).toFixed(1)}%（n=${ev.n}）</span><span>ECE（T=1 → 較正後）</span><span>${ev.ece_T1.toFixed(3)} → ${ev.ece_T.toFixed(3)}（T=${ev.T}）</span></div>`;
  if (sm?.source) h += `<p class="small muted">meta: ${esc(sm.source)} / ${esc(sm.pooling)} / temperature ${sm.temperature ?? 1}</p>`;
  box.innerHTML = h || "<p class='small muted'>学習ログはまだありません</p>";
}

/* ---------- 設定 ---------- */
async function renderSettings() {
  $("#st-hf").value = ML.hfRepo(); $("#st-hf-save").onclick = () => { ML.setHfRepo($("#st-hf").value.trim()); $("#st-mmsg").textContent = "保存"; };
  const reg = await registry(); let rows = "";
  for (const m of reg.browser) { const s = await ML.isStored(m.name); rows += `<span>${esc(m.name)}</span><span>${s ? `保存済み（${((await ML.storedBytes(m.name)) / 1e6).toFixed(1)} MB）` : "未取得"}${["embed", "nli", "rerank"].some(r => ML.modelName(r) === m.name) ? " ・ 使用中" : ""}</span>`; }
  $("#st-models").innerHTML = `<div class="kv">${rows}<span>合計</span><span>${((await ML.storedBytes()) / 1e6).toFixed(1)} MB</span></div>` + (Object.values(state).filter(Boolean).length ? `<p class="small muted">この画面での推論：${Object.entries(state).filter(([, m]) => m).map(([k, m]) => `${k} ${m.stats.calls} 回・${m.stats.tokens} トークン・${(m.stats.ms / 1000).toFixed(1)} 秒`).join("／")}</p>` : "");
  $("#st-load-models").onclick = async () => { try { await models(m => $("#st-mmsg").textContent = m, ["embed", "nli", "rerank"]); $("#st-mmsg").textContent = "完了"; renderSettings(); } catch (e) { $("#st-mmsg").textContent = "失敗: " + e.message; } };
  $("#st-del").onclick = async () => { for (const m of reg.browser) await ML.removeStored(m.name); for (const k in state) state[k] = null; renderSettings(); };
  $("#st-hist").textContent = `保存件数 ${INDEX.length}（コーパス ${INDEX.filter(r => r.kind === "topic").length}・分析 ${INDEX.filter(r => r.kind === "analysis").length}）`;
  $("#st-lock").onclick = () => { MODE.set("simple"); show("s-home"); };
  $("#st-priv").checked = PRIV.on; $("#st-priv").onchange = () => { PRIV.set($("#st-priv").checked); renderSettings(); };
  $("#st-priv-note").textContent = PRIV.on ? `有効：結果はこのタブの中だけ（現在 ${HDB.sessionCount()} 件）。タブを閉じると消える` : "無効：結果はこの端末の履歴に保存される";
  $("#st-hist-import").onchange = async () => { const f = $("#st-hist-import").files[0]; if (!f) return; try { const arr = JSON.parse(await f.text()); const recs = Array.isArray(arr) ? arr : [arr]; let n = 0; for (const r of recs) if (r && r.id && r.kind && r.run_at) { await HDB.putPersist(r); n++; } await loadData(); renderSettings(); $("#st-hist-msg").textContent = `${n} 件を読み込んで保存しました`; } catch (e) { $("#st-hist-msg").textContent = "読み込めません: " + e.message; } $("#st-hist-import").value = ""; };
  $("#st-hist-export").onclick = async () => dl("history.json", JSON.stringify(await HDB.all(), null, 1), "application/json");
  $("#st-hist-clear").onclick = async () => { if (confirm("履歴をすべて削除しますか？")) { await HDB.clear(); CORPUS = null; loadData(); renderSettings(); } };
}

/* ---------- ファクトチェック（検証対象 → 検証過程 → 判定） ---------- */
const fcSel = new Set();
$("#fc-sel").innerHTML = `<span class="tiny muted" style="align-self:center">選定基準（該当をクリック）：</span>` + FC.SELECTION.map(([k, d]) => `<span class="chip" data-k="${k}" title="${esc(d)}">${k}</span>`).join("");
$$("#fc-sel .chip").forEach(c => c.onclick = () => { c.classList.toggle("on"); c.classList.contains("on") ? fcSel.add(c.dataset.k) : fcSel.delete(c.dataset.k); });
function fcCheckable() { const q = $("#fc-claim").value.trim(); if (!q) { $("#fc-checkable").innerHTML = ""; return null; } const ck = FC.checkable(q); $("#fc-checkable").innerHTML = `<span class="${ck.ok ? "ok" : "warn"}">${ck.ok ? "検証対象にできる" : "そのままでは検証しにくい"}</span>：${ck.why.map(esc).join("／")}`; return ck; }
const fcSelC = { dorks: new Set(["exact", "official_jp", "news_pr", "factcheck", "deny"]), engines: new Set(["ddg", "gnews", "wiki"]) };
chips($("#fc-dorks"), DORKS, () => { fcSelC.dorks = new Set($$("#fc-dorks .chip.on").map(c => c.dataset.k)); }, fcSelC.dorks);
chips($("#fc-engines"), Object.fromEntries(Object.entries(NET.ENGINES).map(([k, v]) => [k, [v.label, v.note]])), () => { fcSelC.engines = new Set($$("#fc-engines .chip.on").map(c => c.dataset.k)); }, fcSelC.engines);
$("#fc-claim").oninput = fcCheckable; $("#fc-read").oninput = () => $("#fc-read-v").textContent = $("#fc-read").value; $("#fc-claim").onkeydown = e => { if (e.key === "Enter") runFactCheck(); };
$("#fc-run").onclick = () => runFactCheck(false); $("#fc-plan").onclick = () => runFactCheck(true);
const fcQueries = claim => [...fcSelC.dorks].map(k => ({ name: k, label: DORKS[k][0], query: DORKS[k][1].replace("{q}", claim) }));
function toolLinks(q, url) {
  const L = [];
  for (const [k, [label, f]] of Object.entries(FC.ENGINES)) if (k !== "x") L.push([label, f(`"${q}"`)]);
  L.push(["Google Fact Check Explorer", FC.TOOLS.find(t => t.key === "open").items[0].u(q)], ["JFC 検証記事", FC.ENGINES.google[1](`site:factcheckcenter.jp ${q}`)], ["FIJ ナビ", FC.ENGINES.google[1](`site:navi.fij.info ${q}`)], ["e-Stat", `https://www.e-stat.go.jp/stat-search?query=${encodeURIComponent(q)}`], ["国会会議録", `https://kokkai.ndl.go.jp/#/result?any=${encodeURIComponent(q)}`]);
  if (url) L.push(["Wayback（この URL の過去）", `https://web.archive.org/web/*/${url}`], ["archive.today", `https://archive.ph/${url}`]);
  const yt = url && FC.youtubeId(url); if (yt) L.push(["動画のキーフレームを逆検索（ツール）", "#tools"]);
  return L;
}
async function runFactCheck(planOnly = false) {
  const claim = $("#fc-claim").value.trim(); if (!claim) { $("#fc-status").textContent = "主張を入れてください"; return; }
  const src = $("#fc-src").value.trim(), spread = $("#fc-spread").value.trim(); const ck = fcCheckable(); const st = m => $("#fc-status").textContent = m; const out = $("#fc-out");
  const queries = fcQueries(claim); const links = toolLinks(claim, src);
  const planHtml = `<div class="card"><h3 style="margin-top:0">② 検証過程 — 高度な検索の式 <span class="muted small">クリックで各検索エンジンに送れる（手動の裏取り用）</span></h3><div class="tw"><table>${queries.map(x => `<tr><td>${esc(x.label)}</td><td class="mono">${esc(x.query)}</td><td class="small">${["google", "bing", "ddg"].map(k => `<a href="${esc(FC.ENGINES[k][1](x.query))}" target="_blank" rel="noopener">${FC.ENGINES[k][0]}</a>`).join("・")}</td></tr>`).join("")}</table></div><h3>公開情報ツールで確かめる</h3><div class="chips">${links.map(([l, u]) => u === "#tools" ? `<a class="chip" href="#" data-go="tools" data-url="${esc(src)}">${esc(l)}</a>` : `<a class="chip" href="${esc(u)}" target="_blank" rel="noopener">${esc(l)}</a>`).join("")}</div></div>`;
  if (planOnly) { out.innerHTML = planHtml; wireFcLinks(out); st(""); return; }
  $("#fc-run").disabled = true; out.innerHTML = "";
  try {
    const board = liveBoard(out); const st2 = m => { st(m); board.status(m); };
    const [, { items }] = await Promise.all([models(st2), collectLive(claim, { dorks: fcSelC.dorks, engines: fcSelC.engines, nread: +$("#fc-read").value, status: st2, onItems: xs => board.items(xs), onText: it => board.text(it) })]);
    let docs = items; if (src && /^https?:/.test(src)) { st("出どころのページを読む"); const r = await NET.readPage(src); if (r) docs = [{ id: "src", url: src, title: r.title, text: r.text.slice(0, 20000), snippet: r.text.slice(0, 200), engines: [], dorks: [], published: null, is_source: true }, ...docs]; }
    const dom = await domInfosFor(docs, st); for (const it of docs) { const { s, cls } = J.sourceScore(it, dom[NET.hostOf(it.url)]); it.s_source = s; it.source_class = cls; }
    st("主張と各段落を照合（含意モデル）"); const v = await J.verify(claim, docs.filter(d => !d.is_source), state.embed, state.nli, st);
    const rating = FC.suggestRating(v, ck?.ok !== false); const R = FC.RATINGS[rating]; const dv = dataVoid(docs);
    const used = ["DuckDuckGo", "Google ニュース RSS", "Wikipedia", ...(dom ? ["Wayback Machine（ドメイン年齢）", "Wikipedia 出典回数"] : [])];
    const md = FC.reportMarkdown({ claim, source_url: src, spread, checkable: ck || FC.checkable(claim), selection: [...fcSel], queries: queries.map(q => q.query), tools: used, evidence: v.evidence, rating, note: dv.level !== "none" ? `公的・報道の情報源が少ない（${dv.rel}/${dv.n} 件）ため、情報の空白の可能性がある。` : "", models: ["embed", "nli"].map(r => ML.modelName(r)).join("・") });
    const html = `<div class="card"><h3 style="margin-top:0">① 検証対象</h3><div class="kv"><span>主張</span><span><b>${esc(claim)}</b></span>${src ? `<span>出どころ</span><span><a href="${esc(src)}" target="_blank" rel="noopener">${esc(src)}</a></span>` : ""}${spread ? `<span>拡散</span><span>${esc(spread)}</span>` : ""}<span>検証可能性</span><span class="${ck?.ok ? "ok" : "warn"}">${(ck || FC.checkable(claim)).why.map(esc).join("／")}</span>${fcSel.size ? `<span>選定基準</span><span>${[...fcSel].join("・")}</span>` : ""}</div></div>` + planHtml +
      `<div class="card"><h3 style="margin-top:0">② 検証過程 — 集めた ${docs.length} 件との照合</h3>${verdictCard(v)}${dataVoidHtml(docs)}</div>` +
      `<div class="card"><h3 style="margin-top:0">③ 判定（下書き）</h3><div class="verdict ${R[1]}">${R[0]}</div><p class="small">${esc(R[2])}。<b>機械の判定は下書き</b>。上の根拠リンクを開いて一次情報を確認し、必要なら判定を変えて記事にする。</p><div class="chips">${Object.entries(FC.RATINGS).map(([k, [l, c]]) => `<span class="chip ${k === rating ? "on" : ""}" data-r="${k}" title="${esc(FC.RATINGS[k][2])}">${l}</span>`).join("")}</div>
       <h3>自分の判定と理由</h3><div class="s-check">${["発信元は誰か（公的機関・報道機関・企業・個人）。名前・所属が確認できるか", "いつの情報か。古い情報が現在のことのように扱われていないか", "根拠（統計・資料・一次情報へのリンク）が示されているか", "他の独立した発信元も同じ内容を伝えているか", "画像・動画なら、元の画像の初出はどこか（「ツール」の逆画像検索）"].map(q => `<label><input type="checkbox"> ${q}</label>`).join("")}</div><textarea id="fc-mine" rows="3" placeholder="判定の理由（どの根拠を見て、なぜそう判断したか）"></textarea>
       <h3>検証記録（Markdown）</h3><textarea id="fc-md" style="min-height:260px" class="mono">${esc(md)}</textarea><div class="actbar"><button class="small" id="fc-copy">コピー</button><button class="small" id="fc-dl">.md をダウンロード</button><button class="small" id="fc-print">印刷・PDF 保存</button><span class="small muted">検証対象・過程・判定・出典の順。誰でも同じ手順で再現できるように、検索式と URL をすべて残す</span></div></div>`;
    out.innerHTML = html; wireFcLinks(out);
    out.querySelectorAll("[data-r]").forEach(c => c.onclick = () => { out.querySelectorAll("[data-r]").forEach(x => x.classList.toggle("on", x === c)); const R2 = FC.RATINGS[c.dataset.r]; out.querySelector(".verdict").textContent = R2[0]; out.querySelector(".verdict").className = "verdict " + R2[1]; $("#fc-md").value = $("#fc-md").value.replace(/判定：\*\*[^*]+\*\*/, `判定：**${R2[0]}**`).replace(/## 判定\n\*\*[^*]+\*\* — [^\n]*/, `## 判定\n**${R2[0]}** — ${R2[2]}`); });
    $("#fc-mine").oninput = () => { const v = $("#fc-mine").value.trim(); $("#fc-md").value = $("#fc-md").value.replace(/\n\n理由：[\s\S]*?(?=\n\n## 方法と限界)/, "") .replace(/(## 判定\n\*\*[^*]+\*\* — [^\n]*)/, `$1${v ? "\n\n理由：" + v : ""}`); };
    $("#fc-print").onclick = () => { const w = out.querySelector(".verdict")?.closest(".card"); if (w) { let n = w.querySelector(".print-mine"); if (!n) { n = document.createElement("div"); n.className = "print-mine"; w.appendChild(n); } n.innerHTML = `<p><b>判定の理由：</b>${esc($("#fc-mine").value)}</p><p class="tiny">検証対象：${esc(claim)}　日付：${new Date().toLocaleDateString("ja-JP")}</p>`; } window.print(); };
    $("#fc-copy").onclick = async () => { try { await navigator.clipboard.writeText($("#fc-md").value); $("#fc-status").textContent = "コピーしました"; } catch { $("#fc-md").select(); } };
    $("#fc-dl").onclick = () => dl("factcheck_" + claim.slice(0, 20).replace(/[\\/:*?"<>|\s]/g, "_") + ".md", $("#fc-md").value, "text/markdown");
    await saveRun({ kind: "analysis", label: "ファクトチェック", key: claim, html, result_label: R[0] });
    st(PRIV.on ? "完了（🔒 保存していません）" : "完了（履歴に保存）"); out.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (e) { st("エラー: " + (e.message || e)); console.error(e); } finally { $("#fc-run").disabled = false; }
}
function wireFcLinks(root) { root.querySelectorAll("a[data-go]").forEach(a => a.onclick = e => { e.preventDefault(); show(a.dataset.go); if (a.dataset.url) { $("#tl-url").value = a.dataset.url; renderTools(); } }); }

/* ---------- ツール ---------- */
let tlDone = false;
function renderTools() {
  const q = $("#tl-q").value.trim(), url = $("#tl-url").value.trim();
  if (!tlDone) {
    tlDone = true;
    $("#tl-ops").innerHTML = FC.OPERATORS.map(([l, d], i) => `<span class="chip" data-i="${i}" title="${esc(d)}">${esc(l)}</span>`).join("");
    $$("#tl-ops .chip").forEach(c => c.onclick = () => { const qq = $("#tl-q").value.trim() || "検索語"; const f = FC.OPERATORS[+c.dataset.i][2]; $("#tl-built").value = f(qq, { after: $("#tl-after").value, before: $("#tl-before").value }); renderTools(); });
    $("#tl-engines").innerHTML = Object.entries(FC.ENGINES).map(([k, [l]]) => `<a class="chip" data-e="${k}" href="#" target="_blank" rel="noopener">${esc(l)} で検索</a>`).join("");
    for (const id of ["tl-q", "tl-url", "tl-built"]) $("#" + id).oninput = renderTools;
    $("#tl-q").onchange = () => { if (!$("#tl-built").value) $("#tl-built").value = $("#tl-q").value; renderTools(); };
  }
  const built = $("#tl-built").value.trim() || q;
  $$("#tl-engines a").forEach(a => { a.href = built ? FC.ENGINES[a.dataset.e][1](built) : "#"; a.classList.toggle("muted", !built); });
  const yt = FC.youtubeId(url);
  $("#tl-yt").innerHTML = yt ? `<h3>動画のキーフレーム（YouTube ${esc(yt)}）— 各画像を逆検索して元の映像を探す</h3><div class="tiles">${FC.youtubeFrames(yt).map((f, i) => `<div class="tile" style="cursor:default"><img src="${esc(f)}" style="width:100%;border-radius:8px" alt="frame ${i}" onerror="this.style.display='none'"><div class="chips"><a class="chip" href="https://lens.google.com/uploadbyurl?url=${encodeURIComponent(f)}" target="_blank" rel="noopener">Google レンズ</a><a class="chip" href="https://tineye.com/search?url=${encodeURIComponent(f)}" target="_blank" rel="noopener">TinEye</a><a class="chip" href="https://yandex.com/images/search?rpt=imageview&url=${encodeURIComponent(f)}" target="_blank" rel="noopener">Yandex</a></div></div>`).join("")}</div><p class="hint">サムネイル（代表・25%・50%・75% 地点）。InVID-WeVerify のキーフレーム抽出と同じ考え方を、拡張機能なしで行う簡易版。</p>` : "";
  const isImg = /\.(jpe?g|png|gif|webp|avif)(\?|$)/i.test(url) || /pbs\.twimg\.com|i\.imgur\.com|images\./.test(url);
  $("#tl-out").innerHTML = FC.TOOLS.map(sec => `<div class="card"><h2 style="margin-top:0">${esc(sec.title)}</h2><p class="hint">${esc(sec.desc)}</p><div class="tw"><table>${sec.items.map(it => {
    let link = "";
    if (it.need === "q") link = q ? `<a href="${esc(it.u(q))}" target="_blank" rel="noopener">「${esc(q.slice(0, 30))}」で開く</a>` : `<span class="muted tiny">検索語を入力</span>`;
    else if (it.need === "img") link = url ? `<a href="${esc(it.u(url))}" target="_blank" rel="noopener">この URL で開く</a>${isImg ? "" : ' <span class="tiny muted">（画像そのものの URL が必要。ページの URL では動かない）</span>'}` : `<span class="muted tiny">画像の URL を入力</span>`;
    else if (it.need === "url") link = url ? `<a href="${esc(it.u(url))}" target="_blank" rel="noopener">この URL で開く</a>` : `<span class="muted tiny">URL を入力</span>`;
    else if (it.need === "yt") link = yt ? `<a href="#tl-yt" onclick="document.getElementById('tl-yt').scrollIntoView();return false">上に表示中</a>` : `<span class="muted tiny">YouTube の URL を入力</span>`;
    else if (it.need === "ai") link = `<details><summary>チェックリスト</summary>${FC.AI_CHECKS.map(c => `<label style="display:flex;gap:6px;align-items:flex-start;color:var(--fg)"><input type="checkbox" style="width:auto">${esc(c)}</label>`).join("")}</details>`;
    else if (it.need?.startsWith("tab:")) link = `<a href="#" data-go="${it.need.slice(4)}">タブを開く</a>`;
    else link = `<a href="${esc(it.u())}" target="_blank" rel="noopener">開く</a>`;
    return `<tr><td><b>${esc(it.n)}</b></td><td class="small">${esc(it.note)}</td><td class="small">${link}</td></tr>`; }).join("")}</table></div></div>`).join("") + `<p class="small muted">リンクは利用者のブラウザで開く（このアプリは中継しない）。人物の特定・非公開情報の取得・不正アクセスにつながる使い方はしない。</p>`;
  wireFcLinks($("#tl-out"));
}

/* ---------- 学ぶ ---------- */
const COURSE = [["LwYYnh5MbYU", "1 ファクトチェックの基礎：検証対象・過程・結果を明示する", "fc"], ["kYx-a9sPq1U", "2 最大の武器「高度な検索」", "tools"], ["0JCIVpqrgeY", "3 偽画像：Google レンズや TinEye", "tools"], ["VJRMmWyjC5M", "4 偽動画：InVID や YouTube 検索のコツ", "tools"], ["nsOw4MMH1sg", "5 生成 AI をファクトチェック", "tools"], ["_C0Xt8gIO2g", "6 OSINT：公開データで真偽を判別", "tools"], ["hMq__uUuLow", "7 使えるサイトやツール：公開情報を使いこなす", "tools"], ["JTLVnY5kmxg", "8 ファクトチェックと調査報道", "fc"], ["7tHToVpV5o8", "9 プリバンキング：情報の空白を埋める", "gap"], ["aTFupf85akU", "10 ファクトチェックと教育", "learn"]];
function renderLearn() {
  const b = $("#ln-box"); if (b.dataset.done) return; b.dataset.done = 1;
  b.innerHTML = `<h3>手順の原則（IFCN 綱領・JFC の運用）</h3><div class="kv"><span>検証対象</span><span>客観的に検証可能な事実だけ。意見・予測・価値判断は対象外。選定は「広さ・深さ・近さ」で判断</span><span>検証過程</span><span>検索式・ツール・出典 URL をすべて公開し、読者が同じ手順で再現できるようにする（情報源の透明性）</span><span>判定</span><span>正確／ほぼ正確／根拠不明／不正確／誤り の 5 段階（＋このアプリでは「判定留保」）</span><span>訂正</span><span>間違いは明確に、透明性をもって訂正する</span><span>非党派性</span><span>すべての主張を同じ基準で検証する</span></div>
  <h3>このアプリとの対応</h3><div class="tw"><table><thead><tr><th>講座（日本ファクトチェックセンター・実践編）</th><th>このアプリの機能</th></tr></thead><tbody>${COURSE.map(([id, t, tab]) => `<tr><td><a href="https://www.youtube.com/watch?v=${id}" target="_blank" rel="noopener">${esc(t)}</a></td><td><a href="#" data-go="${tab}">${{ fc: "ファクトチェック", tools: "ツール", gap: "ギャップ・対立（データボイド）", learn: "学ぶ" }[tab]}</a></td></tr>`).join("")}</tbody></table></div>
  <p class="small">講座の記事版：<a href="https://www.factcheckcenter.jp/courses/" target="_blank" rel="noopener">JFC 講座</a>／<a href="https://www.factcheckcenter.jp/explainer/fact-check/jfc-fact-checking-101/" target="_blank" rel="noopener">ファクトチェックとは（定義・ルール・手法）</a>／<a href="https://www.factcheckcenter.jp/info/others/jfc-factchecker-certification/" target="_blank" rel="noopener">ファクトチェッカー認定試験</a></p>
  <h3>なぜ道具が要るか（調査の数字）</h3><p class="small">JFC と国際大学 GLOCOM の 2 万人調査では、偽・誤情報を「正しい」と思った人が 51.5%、「誤り」と見抜いた人は 14.5%。画像検索を実際に行う人は 6.7% にとどまる一方、行った人は偽情報に気づきやすい。このアプリは「検索・逆検索・照合・記録」の手間を減らして、その 6.7% を増やすことを狙う。</p>
  <h3>研究計画・モデルの作り方</h3><p class="small">独自モデル FactCheck-BERT（土台候補・学習データ・Google Colab での手順・評価）は <a href="#" data-go="about">解説</a> と、リポジトリの <code>README.md</code>・<code>docs/plan.md</code> を参照。</p>`;
  wireFcLinks(b);
}


$$("#t-s-home [data-go]").forEach(b => b.onclick = () => show(b.dataset.go));
/* ---------- 一般画面：手順と考え方 ---------- */
function renderSimpleLearn() {
  const b = $("#sl-box"); if (b.dataset.done) return; b.dataset.done = 1;
  b.innerHTML = `<div class="card"><h2 style="margin-top:0">ファクトチェックの 4 段階</h2>
   <div class="steps"><div class="step"><b>1</b><span>検証対象の明示</span><small>対象は「客観的に検証可能な事実」のみ。意見・評価・予測は対象外。取り上げる基準は「広さ（影響する人の数）・深さ（影響の重さ）・近さ（身近さ）」</small></div><div class="step"><b>2</b><span>検証過程の公開</span><small>高度な検索・逆画像検索・公開データで一次情報まで辿り、使った検索式と出典 URL を残す</small></div><div class="step"><b>3</b><span>判定</span><small>正確／ほぼ正確／根拠不明／不正確／誤り の 5 段階</small></div><div class="step"><b>4</b><span>訂正</span><small>誤りが分かったら、明確かつ透明に訂正する</small></div></div>
   <p class="small">この構成は国内外のファクトチェック団体が共有する原則（非党派性、情報源の透明性、検証方法の透明性、訂正方針）に基づく。読者が同じ手順で再現できることが、判定の信頼性の根拠になる。</p></div>
  <div class="card"><h2 style="margin-top:0">検証対象の作り方</h2><p class="small">「検証できる文」に直すことが最初の作業。コンピュータも人も、曖昧な文は検証できない。</p>
   <div class="tw"><table><thead><tr><th>検証しにくい文</th><th>検証できる形に直した文</th><th>理由</th></tr></thead><tbody>
   <tr><td>〇〇市は住みにくい</td><td>〇〇市の人口は 2025 年に 10 万人を下回った</td><td>評価を、統計で確かめられる数値と年に置き換える</td></tr>
   <tr><td>この薬はすごく効く</td><td>この薬は 2024 年に国の承認を受けた</td><td>感想を、記録に残る事実（承認・発表）に置き換える</td></tr>
   <tr><td>来年は大地震が起きる</td><td>〇〇庁は 2026 年 3 月に震度 5 弱を観測したと発表した</td><td>未来の予測は検証不能。誰が何を公表したかなら検証できる</td></tr>
   <tr><td>政府は国民を騙している</td><td>〇〇省は △△ の統計を 2025 年に訂正した</td><td>意図は検証できない。行為（訂正・発表）は検証できる</td></tr></tbody></table></div></div>
  <div class="card"><h2 style="margin-top:0">判定ラベルの意味</h2><div class="tw"><table><thead><tr><th>判定</th><th>条件</th></tr></thead><tbody>${Object.entries(FC.RATINGS).map(([k, [l, c, d]]) => `<tr><td><b class="${c}">${l}</b></td><td>${esc(d)}</td></tr>`).join("")}</tbody></table></div><p class="small muted">このアプリが出す判定は、集めた記事と主張の照合結果から機械的に選んだ下書き。「根拠不明」は「誤り」ではなく、公開情報で確認できなかったという意味。</p></div>
  <div class="card"><h2 style="margin-top:0">検索の技術</h2><ul class="small"><li><b>言葉を組み合わせ、何度も試す</b>：「主語 述語 統計」「主語 発表 年」のように 2〜3 語。1 回で見つからなくても語を替える</li><li><b>発信元で絞る</b>：<code>site:go.jp</code>（国の機関）、<code>site:lg.jp</code>（自治体）、<code>site:ac.jp</code>（大学）。報道なら報道機関のドメイン</li><li><b>言い回しそのものを探す</b>：<code>"〇〇は△△だ"</code> と引用符で囲むと、同じ文がいつ・どこから広まったかが分かる</li><li><b>期間と形式</b>：<code>after:2025-01-01</code>、<code>filetype:pdf</code>（報告書・統計の原本）</li><li><b>否定の側も探す</b>：「〇〇 デマ」「〇〇 訂正」で、既に検証されていないかを確認する</li></ul></div>
  <div class="card"><h2 style="margin-top:0">画像・動画の検証</h2><ul class="small"><li>偽画像の多くは「過去の画像を現在のものとして使う」「一部を加工する」。<b>逆画像検索で初出（最も古い掲載）を探す</b>のが基本。TinEye は古い順に並べられる</li><li>動画は特徴的な場面を静止画にして逆検索する。画面内の文字（イベント名・放送局のロゴ・看板）を検索語にする</li><li>生成 AI の画像は、手指・背景の文字・反射・影の向きに不自然さが出ることがあるが、決め手にはならない。<b>大手の報道機関が同じ出来事を報じているか</b>、本人が普段そういう発言をするかを確認する</li></ul></div>
  <div class="card"><h2 style="margin-top:0">このアプリの中で何が起きているか</h2><p class="small">「検証」を実行すると、ブラウザが複数の検索式で検索エンジン・ニュース RSS・百科事典を巡回し、ページ本文を取得する。次に、端末内で動く小型の日本語言語モデル（BERT 系）が、主張と記事の各段落を読み比べ、「一致（含意）」「矛盾」「無関係」の確率を出す。一致する段落が信頼できる複数の発信元にあれば「正確」寄り、否定する段落があれば「誤り」寄りの下書きになる。モデルは文の意味を人のように理解しているわけではなく、大量の文のペアから学んだ言語のパターンで判断するため、<b>誤ることがある</b>。発信元の種類（公的機関・報道・企業・個人）、日付、他の発信元との一致数を根拠として示すのはそのためで、最終判定は利用者が根拠を読んで行う。処理はすべて端末内で完結し、入力した文が外部に送られることはない。</p></div>`;
}

/* ---------- 研究者用の鍵 ---------- */
async function sha256(t) { const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t)); return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, "0")).join(""); }
const GATE = "bc7bca63a14c7cc1bb2ecd7774fb2ef713ae25d046c9b63d90a169052a49b3ab";
$("#gate-go").onclick = async () => { if ((await sha256($("#gate-pw").value)) === GATE) { MODE.set("research"); $("#gate-pw").value = ""; $("#gate-msg").textContent = ""; show("home"); } else $("#gate-msg").textContent = "ちがいます"; };
$("#gate-pw").onkeydown = e => { if (e.key === "Enter") $("#gate-go").click(); };

/* ---------- 起動 ---------- */
(async () => {
  $("#ver").textContent = VERSION; await J.loadParams(); await loadData(); await renderModelBars(); renderPrivBadge(); $("#priv").onclick = () => { PRIV.set(!PRIV.on); if ($("#st-priv")) $("#st-priv").checked = PRIV.on; }; addEventListener("beforeunload", e => { if (HDB.sessionCount()) { e.preventDefault(); e.returnValue = ""; } });
  renderNav(); const t = location.hash.slice(1); show(t && $(`main > section#t-${t}`) ? t : (MODE.v === "research" ? "home" : "s-home"));
  const u = new URLSearchParams(location.search); if (u.get("q") || u.get("url") || u.get("text")) { const v = u.get("text") || u.get("q") || u.get("url"); if (MODE.v === "research") { $("#lv-q").value = v; show("live"); runLive(); } else { $("#fc-claim").value = /^https?:/.test(v) ? "" : v; if (/^https?:/.test(v)) $("#fc-src").value = v; show("fc"); fcCheckable(); } }
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => { });
  const net = () => $("#net").textContent = navigator.onLine ? "" : "オフライン（保存済みデータとモデルで動作）"; addEventListener("online", net); addEventListener("offline", net); net();
})();
