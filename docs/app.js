import * as NET from "./net.js";
import * as ML from "./ml.js";
import * as J from "./judge.js";

const VERSION = "v1.0";
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const el = (h) => { const t = document.createElement("template"); t.innerHTML = h.trim(); return t.content.firstChild; };
const REPO = "224096-cmd/modernbert-lab";
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
let INDEX = null, LATEST = null, TOPIC = null;
const state = { emb: null, nli: null };

/* ---------- ナビ ---------- */
async function renderModels() {
  const reg = await getJSON("./registry.json") || { models: [] }; const res = (await getJSON("./data/models.json"))?.results || [];
  const R = Object.fromEntries(res.map(r => [r.name, r])); const roles = { embed: "埋め込み", nli: "含意", base: "土台（微調整用）" }; const sel = new Set(["embed", "nli", "base"]);
  const draw = () => { const rows = reg.models.filter(m => sel.has(m.role)).map(m => { const r = R[m.name] || {}; return `<tr><td><b>${esc(m.name)}</b><br><span class="tiny muted">${esc(m.arch || "")}</span></td><td>${roles[m.role]}</td><td>${m.hf ? `<a href="https://huggingface.co/${esc(m.hf)}" target="_blank" rel="noopener">${esc(m.hf)}</a>` : "自作"}</td><td>${m.params_m ?? r.params_m ?? "—"}M / ${m.size_mb ?? "—"} MB${m.onnx ? '<br><span class="tag">ONNX・ブラウザ可</span>' : ""}</td><td>${r.ok ? (m.role === "embed" ? `JSTS ${r.jsts_spearman}<br>cos差 ${r.nli_cos_gap}` : m.role === "nli" ? `JNLI ${(r.jnli_acc * 100).toFixed(1)}%<br>含意再現 ${(r.entail_recall * 100) | 0}%・ECE ${r.ece}` : "—") : (r.error ? `<span class="bad tiny">${esc(r.error.slice(0, 60))}</span>` : '<span class="muted">未測定</span>')}</td><td>${r.latency_ms != null ? r.latency_ms + " ms" : "—"}</td><td class="small">${esc(m.note || "")}</td></tr>`; }).join("");
    $("#md-table").innerHTML = `<div class="tw"><table><thead><tr><th>モデル</th><th>役割</th><th>Hugging Face</th><th>パラメータ / サイズ</th><th>精度</th><th>CPU 遅延</th><th>備考</th></tr></thead><tbody>${rows}</tbody></table></div>`; };
  $("#md-roles").innerHTML = Object.entries(roles).map(([k, v]) => `<span class="chip on" data-k="${k}">${v}</span>`).join(""); $$("#md-roles .chip").forEach(c => c.onclick = () => { c.classList.toggle("on"); c.classList.contains("on") ? sel.add(c.dataset.k) : sel.delete(c.dataset.k); draw(); }); draw();
}
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
function show(t) { $$("nav button").forEach(b => b.classList.toggle("on", b.dataset.t === t)); $$("main > section").forEach(s => s.classList.toggle("hidden", s.id !== "t-" + t)); location.hash = t; window.scrollTo(0, 0); if (t === "how") renderHow(); if (t === "settings") renderSettings(); if (t === "models") renderModels(); if (t === "about") renderAbout(); }
$$("nav button").forEach(b => b.onclick = () => show(b.dataset.t));

/* ---------- データ ---------- */
async function getJSON(p) { try { const r = await fetch(new URL(p, import.meta.url), { cache: "no-cache" }); if (!r.ok) return null; return await r.json(); } catch { return null; } }
async function loadData() {
  INDEX = await getJSON("./data/index.json") || { topics: [], verify: [], domains: [] };
  LATEST = await getJSON("./data/latest.json") || { items: [] };
  renderHome(); renderTopicSelect(); renderVerifyList(); renderReconList();
}

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
    ${opts.actions !== false ? `<div class="actbar"><button class="small act-read" data-url="${esc(it.url)}">本文を読む</button><button class="small act-recon" data-url="${esc(it.url)}">ドメイン調査</button><button class="small act-verify" data-claim="${esc(it.claim || it.title || "")}">この要旨を検証</button></div>` : ""}
   </details></div>`;
}
function wireItemActions(root) {
  root.querySelectorAll(".act-read").forEach(b => b.onclick = () => openReader(b.dataset.url));
  root.querySelectorAll(".act-recon").forEach(b => b.onclick = () => { $("#rc-q").value = b.dataset.url; show("recon"); runRecon(); });
  root.querySelectorAll(".act-verify").forEach(b => b.onclick = () => { $("#vf-q").value = b.dataset.claim; show("verify"); runVerify(); });
}
async function openReader(url) {
  const box = el(`<div class="card"><div class="row"><b>本文</b><a href="${esc(url)}" target="_blank" rel="noopener" class="small">${esc(url)}</a><button class="small" style="margin-left:auto">閉じる</button></div><div class="small muted">読み込み中…</div></div>`);
  box.querySelector("button").onclick = () => box.remove(); document.querySelector("main > section:not(.hidden)").prepend(box); window.scrollTo(0, 0);
  const r = await NET.readPage(url); box.lastChild.innerHTML = r ? `<b>${esc(r.title)}</b><div class="mono" style="max-height:60vh;overflow:auto;white-space:pre-wrap;word-break:normal">${esc(r.text)}</div>` : "読めませんでした（r.jina.ai の制限か、サイトが拒否）";
}

/* ---------- 概要 ---------- */
function renderHome() {
  const t = INDEX.topics, n = t.reduce((s, x) => s + (x.n || 0), 0);
  $("#home-stats").innerHTML = [["トピック", t.length], ["収集ページ", n], ["検証した主張", INDEX.verify?.length || 0], ["調査ドメイン", INDEX.domains?.length || 0], ["最終更新", (INDEX.updated || "—").slice(5, 16).replace("T", " ")]].map(([k, v]) => `<div class="stat">${k}<b>${esc(v)}</b></div>`).join("");
  $("#home-tiles").innerHTML = [["自動収集", "GitHub Actions が 6 時間ごとに巡回した結果", "topics"], ["いま調べる", "ブラウザから検索エンジンを引いて端末内で採点", "live"], ["主張を検証", "文を入れると含意／矛盾で判定", "verify"], ["ドメイン調査", "whois・DNS・証明書・Wayback", "recon"], ["モデル比較", "既存 BERT 系モデルを同じ指標で比べ、土台を選んで微調整", "models"], ["解説", "何をどのデータで学習したか・仕組み・限界", "about"], ["仕組み", "式・パラメータ・情報源", "how"], ["設定", "watch.yaml・モデル・PWA", "settings"]].map(([a, b, t]) => `<div class="tile" data-t="${t}"><b>${a}</b><span>${b}</span></div>`).join("");
  $$("#home-tiles .tile").forEach(x => x.onclick = () => show(x.dataset.t));
  const items = (LATEST.items || []).slice(0, 30);
  $("#home-latest").innerHTML = items.length ? `<div class="tw"><table><thead><tr><th>評価</th><th>見出し</th><th>出所</th><th>日付</th><th>トピック</th></tr></thead><tbody>${items.map(it => `<tr><td>${gradeBadge(it)}</td><td><a href="${esc(it.url)}" target="_blank" rel="noopener">${esc(it.title || it.url)}</a></td><td class="small">${esc(NET.hostOf(it.url))}<br><span class="muted">${esc(J.CLASS_LABEL[it.source_class] || "")}</span></td><td class="small">${esc(it.published || "—")}</td><td class="small"><a href="#" data-topic="${esc(it.topic)}">${esc(it.topic)}</a></td></tr>`).join("")}</tbody></table></div>` : `<p class="muted small">まだ収集結果がありません。GitHub Actions の collect を実行するか、「いま調べる」で試してください。</p>`;
  $$("#home-latest a[data-topic]").forEach(a => a.onclick = e => { e.preventDefault(); show("topics"); const s = INDEX.topics.find(t => t.topic === a.dataset.topic); if (s) { $("#tp-sel").value = s.slug; loadTopic(s.slug); } });
}

/* ---------- 自動収集 ---------- */
function renderTopicSelect() {
  const sel = $("#tp-sel"); sel.innerHTML = INDEX.topics.map(t => `<option value="${esc(t.slug)}">${esc(t.topic)}（${t.n} 件・${(t.run_at || "").slice(5, 16).replace("T", " ")}）</option>`).join("") || "<option value=''>（結果なし）</option>";
  sel.onchange = () => loadTopic(sel.value); if (INDEX.topics[0]) loadTopic(INDEX.topics[0].slug);
}
async function loadTopic(slug) {
  TOPIC = await getJSON(`./data/topics/${slug}.json`); if (!TOPIC) { $("#tp-items").innerHTML = "<p class='muted'>読めません</p>"; return; }
  const s = TOPIC.summary; $("#tp-meta").textContent = `${TOPIC.run_at.slice(0, 16).replace("T", " ")} 実行・${TOPIC.n} 件`;
  $("#tp-stats").innerHTML = [["平均信頼性", s.mean], ["A / B", `${s.grades.A || 0} / ${s.grades.B || 0}`], ["C / D", `${s.grades.C || 0} / ${s.grades.D || 0}`], ["ドメイン", s.domains], ["日付あり", `${s.dated}/${TOPIC.n}`], ["話題", s.clusters]].map(([k, v]) => `<div class="stat">${k}<b>${v}</b></div>`).join("") + `<div class="chips" style="flex-basis:100%">${Object.entries(s.classes).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<span class="chip" style="cursor:default">${J.CLASS_LABEL[k] || k} ${v}</span>`).join("")}</div>`;
  const h = (INDEX.topics.find(t => t.slug === slug)?.history || []); $("#tp-hist").innerHTML = h.length > 1 ? `<div class="small muted">平均信頼性の推移（${h.length} 回）</div><div class="hist">${h.map(x => `<i style="height:${x.mean * 0.4}px" title="${x.run_at} ${x.mean}"></i>`).join("")}</div>` : "";
  $("#tp-clusters").innerHTML = TOPIC.clusters.filter(c => c.size > 1).slice(0, 12).map(c => `<div class="item"><div class="row"><span class="g g${J.grade(c.reliability)}">${c.reliability}</span><b>${esc(c.title)}</b></div><div class="m"><span>${c.size} 件</span><span>${c.domains.length} ドメイン：${c.domains.slice(0, 6).map(esc).join("・")}${c.domains.length > 6 ? "…" : ""}</span><span>初出 ${esc(c.first || "不明")} <a href="${esc(c.first_url)}" target="_blank" rel="noopener">${esc(NET.hostOf(c.first_url))}</a></span></div></div>`).join("") || "<p class='muted small'>複数ページにまたがる話題はなし</p>";
  const cs = $("#tp-class"); cs.innerHTML = "<option value=''>全種別</option>" + Object.keys(s.classes).map(k => `<option value="${k}">${J.CLASS_LABEL[k] || k}</option>`).join("");
  $("#tp-queries").innerHTML = `<div class="tw"><table><thead><tr><th>名前</th><th>検索式</th></tr></thead><tbody>${TOPIC.queries.map(q => `<tr><td>${esc(q.label)}</td><td class="mono">${esc(q.query)}</td></tr>`).join("")}</tbody></table></div><p class="small muted">エンジン：${(TOPIC.engines || []).join("・")}　HTTP ${TOPIC.http?.requests} 回（失敗 ${TOPIC.http?.errors}）</p>`;
  renderTopicItems();
}
function renderTopicItems() {
  if (!TOPIC) return; const q = $("#tp-q").value.trim(), g = $("#tp-grade").value, c = $("#tp-class").value, so = $("#tp-sort").value;
  let items = TOPIC.items.filter(it => (!g || it.grade === g) && (!c || it.source_class === c) && (!q || (it.title + it.snippet + it.url).includes(q)));
  items = items.sort((a, b) => so === "date" ? (b.published || "").localeCompare(a.published || "") : so === "corr" ? b.s_corr - a.s_corr : b.reliability - a.reliability);
  $("#tp-items").innerHTML = `<p class="small muted">${items.length} 件</p>` + items.slice(0, 80).map(it => itemCard(it)).join(""); wireItemActions($("#tp-items"));
}
["#tp-q", "#tp-grade", "#tp-class", "#tp-sort"].forEach(s => $(s).oninput = renderTopicItems);
$("#tp-csv").onclick = () => { if (!TOPIC) return; const rows = [["grade", "reliability", "s_source", "s_content", "s_corr", "s_time", "source_class", "published", "title", "url", "engines", "dorks"]].concat(TOPIC.items.map(it => [it.grade, it.reliability, it.s_source, it.s_content, it.s_corr, it.s_time, it.source_class, it.published || "", it.title, it.url, (it.engines || []).join("|"), (it.dorks || []).join("|")])); dl(TOPIC.slug + ".csv", "﻿" + rows.map(r => r.map(x => `"${String(x ?? "").replace(/"/g, '""')}"`).join(",")).join("\n"), "text/csv"); };
$("#tp-json").onclick = () => TOPIC && dl(TOPIC.slug + ".json", JSON.stringify(TOPIC, null, 1), "application/json");
function dl(name, text, type = "text/plain") { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }

/* ---------- モデル ---------- */
async function models(onStep) {
  if (!state.emb) state.emb = await ML.embedder(m => onStep?.("埋め込みモデル: " + m));
  if (!state.nli) state.nli = await ML.nli(m => onStep?.("含意モデル: " + m));
  return state;
}

/* ---------- いま調べる ---------- */
function chips(root, obj, on, sel) { root.innerHTML = Object.entries(obj).map(([k, [label]]) => `<span class="chip ${sel.has(k) ? "on" : ""}" data-k="${k}" title="${esc(obj[k][1] || "")}">${label}</span>`).join(""); root.querySelectorAll(".chip").forEach(c => c.onclick = () => { c.classList.toggle("on"); on(); }); }
const lvSel = { dorks: new Set(["exact", "official_jp", "news_pr", "factcheck"]), engines: new Set(["ddg", "gnews", "wiki"]) };
chips($("#lv-dorks"), DORKS, () => { lvSel.dorks = new Set($$("#lv-dorks .chip.on").map(c => c.dataset.k)); }, lvSel.dorks);
chips($("#lv-engines"), Object.fromEntries(Object.entries(NET.ENGINES).map(([k, v]) => [k, [v.label, v.note]])), () => { lvSel.engines = new Set($$("#lv-engines .chip.on").map(c => c.dataset.k)); }, lvSel.engines);
$("#lv-read").oninput = () => $("#lv-read-v").textContent = $("#lv-read").value;
$("#lv-run").onclick = runLive; $("#lv-q").onkeydown = e => e.key === "Enter" && runLive();
async function collectLive(topic, { dorks, engines, nread, status }) {
  const queries = [{ name: "topic", label: "そのまま", query: topic }, ...[...dorks].map(k => ({ name: k, label: DORKS[k][0], query: DORKS[k][1].replace("{q}", topic) }))];
  const seen = new Map();
  for (const q of queries) for (const e of engines) {
    if (e === "wiki" && q.name !== "topic") continue;
    status(`${NET.ENGINES[e].label}：${q.label}`);
    const rs = await NET.search(e === "ddg" ? q.query.replace(/[()]/g, "") : q.query, [e], 10);
    for (const r of rs) { if (seen.has(r.url)) { const x = seen.get(r.url); x.engines = [...new Set([...x.engines, e])]; x.dorks = [...new Set([...x.dorks, q.name])]; if (!x.published && r.published) x.published = r.published; } else seen.set(r.url, { ...r, id: Math.random().toString(36).slice(2, 10), dorks: [q.name], text: "", topic }); }
  }
  let items = [...seen.values()];
  const prio = it => it.engines.length * 2 + it.dorks.length + ({ gov: 3, news: 3, edu: 2, academic: 2, wiki: 1 }[J.domainClass(NET.hostOf(it.url))] || 0);
  items.sort((a, b) => prio(b) - prio(a)); items = items.slice(0, 60);
  for (let i = 0; i < Math.min(nread, items.length); i++) { status(`本文を読む ${i + 1}/${Math.min(nread, items.length)}：${NET.hostOf(items[i].url)}`); const r = await NET.readPage(items[i].url); if (r) { items[i].text = r.text.slice(0, 6000); items[i].title = items[i].title || r.title; if (r.finalUrl && /^https?:/.test(r.finalUrl) && NET.hostOf(r.finalUrl) !== "news.google.com" && NET.hostOf(r.finalUrl) !== NET.hostOf(items[i].url)) { items[i].orig_url = items[i].url; items[i].url = NET.normUrl(r.finalUrl); } } }
  return { items, queries };
}
async function domInfosFor(items, status, max = 12) {
  const hosts = [...new Set(items.map(it => NET.hostOf(it.url).replace(/^www\./, "")))].slice(0, max); const out = {}; let cache = {}; try { cache = JSON.parse(localStorage.getItem("mbo.domcache") || "{}"); } catch { }
  const todo = hosts.filter(h => { if (cache[h] && Date.now() - cache[h].t < 30 * 864e5) { out[h] = cache[h]; return false; } return true; });
  status(`ドメイン情報：${todo.length} 件`);
  for (let i = 0; i < todo.length; i += 3) await Promise.all(todo.slice(i, i + 3).map(async h => { const [wb, wc] = await Promise.all([NET.wayback(h), NET.wikiCites(NET.registrable(h))]); out[h] = cache[h] = { wayback: wb, wiki_cites: wc, t: Date.now() }; }));
  try { localStorage.setItem("mbo.domcache", JSON.stringify(cache)); } catch { }
  const full = {}; for (const it of items) { const h = NET.hostOf(it.url); full[h] = out[h.replace(/^www\./, "")]; } return full;
}
async function runLive() {
  const q = $("#lv-q").value.trim(); if (!q) return; const st = m => $("#lv-status").textContent = m; $("#lv-run").disabled = true; $("#lv-out").innerHTML = "";
  try {
    if (/^https?:\/\//.test(q)) { await liveUrl(q, st); return; }
    await models(st);
    const nread = +$("#lv-read").value; const { items, queries } = await collectLive(q, { dorks: lvSel.dorks, engines: lvSel.engines, nread, status: st });
    if (!items.length) { st("何も見つかりませんでした（r.jina.ai の制限に当たった可能性。1 分ほど待って再試行）"); return; }
    const dom = await domInfosFor(items, st); await J.scoreItems(items, dom, state.emb, state.nli, st); const clusters = await J.cluster(items, state.emb);
    items.sort((a, b) => b.reliability - a.reliability); st(`${items.length} 件・${new Set(items.map(i => NET.hostOf(i.url))).size} ドメイン`);
    const mean = Math.round(items.reduce((s, x) => s + x.reliability, 0) / items.length);
    $("#lv-out").innerHTML = `<div class="card"><div class="stats"><div class="stat">平均信頼性<b>${mean}</b></div><div class="stat">A/B/C/D<b>${["A", "B", "C", "D"].map(g => items.filter(i => i.grade === g).length).join("/")}</b></div><div class="stat">複数ページの話題<b>${clusters.filter(c => c.size > 1).length}</b></div></div>
      <div class="actbar"><button class="small" id="lv-add">watch.yaml に追加</button><button class="small" id="lv-dl">JSON</button></div>
      ${clusters.filter(c => c.size > 1).slice(0, 8).map(c => `<div class="item"><div class="row"><span class="g g${J.grade(c.reliability)}">${c.reliability}</span><b>${esc(c.title)}</b></div><div class="m"><span>${c.size} 件</span><span>${c.domains.slice(0, 6).map(esc).join("・")}</span><span>初出 ${esc(c.first || "不明")}</span></div></div>`).join("")}</div>
      <div class="card">${items.map(it => itemCard(it)).join("")}</div>
      <div class="card"><h3 style="margin-top:0">使った検索式</h3><div class="tw"><table>${queries.map(x => `<tr><td>${esc(x.label)}</td><td class="mono">${esc(x.query)}</td></tr>`).join("")}</table></div></div>`;
    wireItemActions($("#lv-out")); $("#lv-add").onclick = () => { addWatch("topics", q); show("settings"); }; $("#lv-dl").onclick = () => dl("live.json", JSON.stringify({ topic: q, items, clusters, queries }, null, 1), "application/json");
  } catch (e) { st("エラー: " + (e.message || e)); console.error(e); } finally { $("#lv-run").disabled = false; }
}
async function liveUrl(url, st) {
  await models(st); st("ページを読み込み中"); const r = await NET.readPage(url); if (!r) { st("読めませんでした"); return; }
  const me = { id: "target", url, title: r.title, snippet: r.text.slice(0, 200), text: r.text.slice(0, 8000), engines: [], dorks: [], published: null };
  const claim = J.keyClaim(me); st("同じ話を探す：" + claim.slice(0, 40));
  const { items } = await collectLive(r.title || claim.slice(0, 60), { dorks: new Set(["exact"]), engines: new Set(["ddg", "gnews"]), nread: 6, status: st });
  const all = [me, ...items.filter(i => i.url !== url)]; const dom = await domInfosFor(all, st); await J.scoreItems(all, dom, state.emb, state.nli, st); st("");
  $("#lv-out").innerHTML = `<div class="card"><h3 style="margin-top:0">この URL の判定</h3>${itemCard(me)}<div class="mono" style="max-height:40vh;overflow:auto;white-space:pre-wrap;word-break:normal;margin-top:8px">${esc(r.text.slice(0, 4000))}</div></div><div class="card"><h3 style="margin-top:0">同じ話を伝えている他のページ</h3>${all.slice(1).sort((a, b) => b.reliability - a.reliability).map(it => itemCard(it)).join("") || "<p class='muted small'>見つからず</p>"}</div>`; wireItemActions($("#lv-out"));
}

/* ---------- 主張の検証 ---------- */
$("#vf-run").onclick = runVerify; $("#vf-q").onkeydown = e => e.key === "Enter" && runVerify();
function verdictCard(v) {
  const [label, cls] = J.VERDICT[v.verdict] || [v.verdict, ""];
  return `<div class="verdict ${cls}">${label}</div><div class="stats"><div class="stat">支持（重み付き）<b>${v.support}</b></div><div class="stat">反証<b>${v.refute}</b></div><div class="stat">支持ドメイン<b>${(v.support_domains || []).length}</b></div><div class="stat">反証ドメイン<b>${(v.refute_domains || []).length}</b></div><div class="stat">照合段落<b>${v.n_passages ?? "—"}</b></div></div>
   ${(v.evidence || []).map(e => `<div class="ev ${e.kind === "support" ? "sup" : e.kind === "refute" ? "con" : ""}"><span class="tag ${e.kind === "support" ? "sup" : e.kind === "refute" ? "con" : ""}">${e.kind === "support" ? "含意" : e.kind === "refute" ? "矛盾" : "中立"} ${((e.kind === "refute" ? e.contra : e.entail) * 100) | 0}%</span> <a href="${esc(e.url)}" target="_blank" rel="noopener">${esc(e.domain)}</a> <span class="muted tiny">類似 ${e.sim}${e.published ? "・" + esc(e.published) : ""}</span><br>${esc(e.text)}</div>`).join("") || "<p class='small muted'>照合できる段落がありませんでした</p>"}`;
}
async function runVerify() {
  const c = $("#vf-q").value.trim(); if (!c) return; const st = m => $("#vf-status").textContent = m; $("#vf-run").disabled = true; $("#vf-out").innerHTML = "";
  try {
    await models(st); const { items } = await collectLive(c, { dorks: new Set(["exact", "official_jp", "news_pr", "factcheck", "deny"]), engines: new Set(["ddg", "gnews", "wiki"]), nread: 10, status: st });
    const dom = await domInfosFor(items, st); for (const it of items) { const { s, cls } = J.sourceScore(it, dom[NET.hostOf(it.url)]); it.s_source = s; it.source_class = cls; }
    const v = await J.verify(c, items, state.emb, state.nli, st); st(`${items.length} ページ・${v.n_passages} 段落を照合`);
    $("#vf-out").innerHTML = verdictCard(v) + `<div class="actbar"><button class="small" id="vf-add">watch.yaml に追加</button></div>`; $("#vf-add").onclick = () => { addWatch("claims", c); show("settings"); };
  } catch (e) { st("エラー: " + (e.message || e)); } finally { $("#vf-run").disabled = false; }
}
function renderVerifyList() { const l = INDEX.verify || []; $("#vf-list").innerHTML = l.length ? `<div class="tw"><table><thead><tr><th>判定</th><th>主張</th><th>支持/反証</th><th>日時</th></tr></thead><tbody>${l.map(v => `<tr><td><span class="${J.VERDICT[v.verdict]?.[1] || ""}"><b>${J.VERDICT[v.verdict]?.[0] || v.verdict}</b></span></td><td><a href="#" data-id="${esc(v.id)}">${esc(v.claim)}</a></td><td>${v.support} / ${v.refute}</td><td class="small">${esc((v.run_at || "").slice(0, 16).replace("T", " "))}</td></tr>`).join("")}</tbody></table></div><div id="vf-detail"></div>` : "<p class='muted small'>まだありません（watch.yaml の claims に書くと自動で検証）</p>"; $$("#vf-list a[data-id]").forEach(a => a.onclick = async e => { e.preventDefault(); const v = await getJSON(`./data/verify/${a.dataset.id}.json`); $("#vf-detail").innerHTML = v ? `<h3>${esc(v.claim)}</h3>` + verdictCard(v) : "読めません"; }); }

/* ---------- ドメイン調査 ---------- */
$("#rc-run").onclick = runRecon; $("#rc-q").onkeydown = e => e.key === "Enter" && runRecon();
function profileHtml(p) {
  const kv = (o) => Object.entries(o || {}).filter(([k, v]) => v != null && v !== "" && !(Array.isArray(v) && !v.length)).map(([k, v]) => `<span>${esc(k)}</span><span>${Array.isArray(v) ? v.map(esc).join(", ") : typeof v === "object" ? esc(JSON.stringify(v)) : esc(v)}</span>`).join("");
  const wb = p.wayback || {}; const age = wb.age_days != null ? `${Math.floor(wb.age_days / 365)} 年 ${Math.floor(wb.age_days % 365 / 30)} か月` : "不明";
  return `<div class="stats"><div class="stat">種別<b>${J.CLASS_LABEL[p.class || J.domainClass(p.host)] || "—"}</b></div><div class="stat">初出（Wayback）<b>${wb.first ? `${wb.first.slice(0, 4)}/${wb.first.slice(4, 6)}` : "—"}</b></div><div class="stat">ドメイン年齢<b>${age}</b></div><div class="stat">Wikipedia 出典<b>${p.wiki_cites ?? "—"}</b></div><div class="stat">サブドメイン<b>${(p.crtsh || []).length + ((p.hackertarget?.hosts) || []).length}</b></div></div>
   <h3>登録情報（RDAP / JPRS）</h3><div class="kv">${kv(p.rdap) || "<span class='muted'>取得できず</span>"}</div>
   <h3>DNS</h3><div class="kv">${kv(p.dns)}</div>
   <h3>Wayback Machine</h3><div class="kv">${wb.first_url ? `<span>最古</span><span><a href="${esc(wb.first_url)}" target="_blank" rel="noopener">${esc(wb.first)}</a></span>` : ""}${wb.last_url ? `<span>最新</span><span><a href="${esc(wb.last_url)}" target="_blank" rel="noopener">${esc(wb.last)}</a></span>` : ""}</div>
   <h3>サブドメイン・ホスト（証明書ログ crt.sh ＋ HackerTarget）</h3><div class="small mono">${[...new Set([...(p.crtsh || []), ...((p.hackertarget?.hosts) || [])])].slice(0, 60).map(esc).join("  ") || "なし／取得できず"}</div>
   ${p.hackertarget?.geoip ? `<h3>GeoIP</h3><div class="kv">${kv(p.hackertarget.geoip)}</div>` : ""}
   ${p.headers ? `<h3>セキュリティヘッダ</h3><div class="kv">${kv(p.headers)}</div>` : ""}
   ${(p.urlscan || []).length ? `<h3>urlscan.io の公開スキャン</h3><div class="tw"><table>${p.urlscan.map(u => `<tr><td class="small">${esc((u.time || "").slice(0, 10))}</td><td class="small"><a href="${esc(u.result || "#")}" target="_blank" rel="noopener">${esc(u.url)}</a></td><td class="small">${esc(u.ip || "")} ${esc(u.server || "")}</td></tr>`).join("")}</table></div>` : ""}
   <p class="small muted">この調査は公開 API の読み取りだけで、対象サーバへのスキャンは行わない。</p>`;
}
async function runRecon() {
  const q = $("#rc-q").value.trim(); if (!q) return; const st = m => $("#rc-status").textContent = m; $("#rc-run").disabled = true;
  try { const p = await NET.profile(q, k => st("取得中：" + k)); p.class = J.domainClass(p.host.replace(/^www\./, "")); st(""); $("#rc-out").innerHTML = profileHtml(p) + `<div class="actbar"><button class="small" id="rc-add">watch.yaml に追加</button><button class="small" id="rc-dl">JSON</button></div>`; $("#rc-add").onclick = () => { addWatch("domains", p.host); show("settings"); }; $("#rc-dl").onclick = () => dl(p.host + ".json", JSON.stringify(p, null, 1), "application/json"); }
  catch (e) { st("エラー: " + (e.message || e)); } finally { $("#rc-run").disabled = false; }
}
function renderReconList() { const l = INDEX.domains || []; $("#rc-list").innerHTML = l.length ? `<div class="tw"><table><thead><tr><th>ホスト</th><th>種別</th><th>初出</th><th>Wikipedia 出典</th><th>サブドメイン</th><th>日時</th></tr></thead><tbody>${l.map(d => `<tr><td><a href="#" data-host="${esc(d.host)}">${esc(d.host)}</a></td><td>${esc(J.CLASS_LABEL[d.class] || d.class)}</td><td>${esc(d.first || "—")}</td><td>${d.wiki_cites ?? "—"}</td><td>${d.subdomains ?? "—"}</td><td class="small">${esc((d.run_at || "").slice(0, 16).replace("T", " "))}</td></tr>`).join("")}</tbody></table></div><div id="rc-detail"></div>` : "<p class='muted small'>まだありません</p>"; $$("#rc-list a[data-host]").forEach(a => a.onclick = async e => { e.preventDefault(); const p = await getJSON(`./data/domains/${a.dataset.host}.json`); $("#rc-detail").innerHTML = p ? `<h3>${esc(p.host)}</h3>` + profileHtml(p) : "読めません"; }); }

/* ---------- 仕組み ---------- */
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
  ML.isStored("ruri-v3-30m").then(a => ML.isStored("nli-ja-30m").then(b => $("#how-models").textContent = `端末内：埋め込み ${a ? "保存済み" : "未取得"}・含意 ${b ? "保存済み" : "未取得"}`));
}
function setPath(o, p, v) { const ks = p.split("."); let x = o; for (const k of ks.slice(0, -1)) x = x[k]; x[ks.at(-1)] = v; }

/* ---------- 設定 ---------- */
function watch() { try { return JSON.parse(localStorage.getItem("mbo.watch") || '{"topics":[],"claims":[],"domains":[]}'); } catch { return { topics: [], claims: [], domains: [] }; } }
function addWatch(kind, v) { const w = watch(); if (v && !w[kind].includes(v)) w[kind].push(v); localStorage.setItem("mbo.watch", JSON.stringify(w)); renderSettings(); }
function yaml() { const w = watch(); const q = s => `"${String(s).replace(/"/g, '\\"')}"`; return `# 自動収集の対象（このサイトの「設定」で生成）\ntopics:\n${w.topics.map(t => `  - topic: ${q(t)}`).join("\n") || "  []"}\n\nclaims:\n${w.claims.map(c => `  - ${q(c)}`).join("\n") || "  []"}\n\ndomains:\n${w.domains.map(d => `  - ${q(d)}`).join("\n") || "  []"}\n`; }
async function renderSettings() {
  $("#st-yaml").textContent = yaml();
  [["topic", "topics"], ["claim", "claims"], ["domain", "domains"]].forEach(([id, k]) => $(`#st-${id}-add`).onclick = () => { addWatch(k, $(`#st-${id}`).value.trim()); $(`#st-${id}`).value = ""; });
  $("#st-copy").onclick = () => navigator.clipboard.writeText(yaml()); $("#st-dl").onclick = () => dl("watch.yaml", yaml()); $("#st-clear").onclick = () => { localStorage.removeItem("mbo.watch"); renderSettings(); };
  $("#st-emb").value = ML.modelName("embed"); $("#st-nli").value = ML.modelName("nli"); $("#st-model-save").onclick = () => { ML.setModelName("embed", $("#st-emb").value.trim()); ML.setModelName("nli", $("#st-nli").value.trim()); state.emb = state.nli = null; $("#st-mmsg").textContent = "保存（次の判定から使用）"; };
  $("#st-hf").value = ML.hfRepo(); $("#st-hf-save").onclick = () => { ML.setHfRepo($("#st-hf").value.trim()); $("#st-mmsg").textContent = "保存"; };
  const a = await ML.isStored("ruri-v3-30m"), b = await ML.isStored("nli-ja-30m"); const bytes = await ML.storedBytes();
  $("#st-models").innerHTML = `<div class="kv"><span>埋め込み ruri-v3-30m</span><span>${a ? "端末内に保存済み" : "未取得（初回の判定時に自動ダウンロード、37 MB）"}</span><span>含意 nli-ja-30m</span><span>${b ? "端末内に保存済み" : "未取得（37 MB）"}</span><span>使用容量</span><span>${(bytes / 1e6).toFixed(1)} MB</span></div>`;
  $("#st-load").onclick = async () => { try { await models(m => $("#st-mmsg").textContent = m); $("#st-mmsg").textContent = "完了"; renderSettings(); } catch (e) { $("#st-mmsg").textContent = "失敗: " + e.message; } };
  $("#st-del").onclick = async () => { await ML.removeStored("ruri-v3-30m"); await ML.removeStored("nli-ja-30m"); state.emb = state.nli = null; renderSettings(); };
  $("#st-links").innerHTML = `<a href="https://github.com/${REPO}/actions/workflows/collect.yml" target="_blank" rel="noopener">Actions → collect</a> ・ <a href="https://github.com/${REPO}/edit/main/watch.yaml" target="_blank" rel="noopener">watch.yaml を編集</a> ・ <a href="https://github.com/${REPO}" target="_blank" rel="noopener">リポジトリ</a>`;
}

/* ---------- 起動 ---------- */
(async () => {
  $("#ver").textContent = VERSION; await J.loadParams(); await loadData();
  const t = location.hash.slice(1); if (t && $(`nav button[data-t="${t}"]`)) show(t);
  const u = new URLSearchParams(location.search); if (u.get("q")) { $("#lv-q").value = u.get("q"); show("live"); runLive(); }
  if (u.get("url") || u.get("text")) { $("#lv-q").value = u.get("url") || u.get("text"); show("live"); runLive(); }
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => { });
  const net = () => $("#net").textContent = navigator.onLine ? "" : "オフライン（保存済みデータとモデルで動作）"; addEventListener("online", net); addEventListener("offline", net); net();
})();
