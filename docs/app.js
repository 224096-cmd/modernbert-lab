import * as NET from "./net.js";
import * as ML from "./ml.js";
import * as J from "./judge.js";

const VERSION = "v1.0";
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const el = (h) => { const t = document.createElement("template"); t.innerHTML = h.trim(); return t.content.firstChild; };
const REPO = "224096-cmd/modernbert-lab";
const DORKS = {
  exact: ["螳悟・荳閾ｴ", '"{q}"'], official_jp: ["蜈ｬ逧・ｩ滄未繝ｻ螟ｧ蟄ｦ", '{q} (site:go.jp OR site:lg.jp OR site:ac.jp)'], news_pr: ["蝣ｱ驕薙・繝励Ξ繧ｹ繝ｪ繝ｪ繝ｼ繧ｹ", '{q} (site:prtimes.jp OR site:nhk.or.jp OR site:nikkei.com OR site:asahi.com OR site:yomiuri.co.jp OR site:mainichi.jp)'],
  pdf: ["PDF 譁・嶌", '{q} filetype:pdf'], factcheck: ["繝輔ぃ繧ｯ繝医メ繧ｧ繝・け", '{q} (site:fij.info OR site:factcheckcenter.jp OR site:infact.press OR "繝輔ぃ繧ｯ繝医メ繧ｧ繝・け")'], deny: ["蜷ｦ螳壹・險よｭ｣", '{q} (繝・・ OR 隱､繧・OR 險よｭ｣ OR 莠句ｮ溽┌譬ｹ OR "譬ｹ諡縺後↑縺・)'],
  primary: ["荳谺｡雉・侭", '{q} (邨ｱ險・OR 隴ｰ莠矩鹸 OR 蝣ｱ蜻頑嶌 OR 蜈ｬ遉ｺ OR 蜻顔､ｺ) (site:go.jp OR site:lg.jp OR filetype:pdf)'], sns: ["SNS繝ｻ謗ｲ遉ｺ譚ｿ", '{q} (site:x.com OR site:bsky.app OR site:mstdn.jp OR site:reddit.com OR site:5ch.net)'], blog: ["繝悶Ο繧ｰ繝ｻ縺ｾ縺ｨ繧・, '{q} (site:note.com OR site:hatenablog.com OR site:ameblo.jp OR site:togetter.com)'],
  video: ["蜍慕判", '{q} (site:youtube.com OR site:nicovideo.jp)'], academic: ["蟄ｦ陦・, '{q} (site:jstage.jst.go.jp OR site:cir.nii.ac.jp OR site:researchmap.jp)'], title: ["隕句・縺励↓蜷ｫ繧", 'intitle:"{q}"'],
};
const SOURCES_DOC = [
  ["ddg", "DuckDuckGo", "lite/html 迚医Ｃot 蛻､螳壽凾縺ｯ r.jina.ai 邨檎罰", "荳｡譁ｹ"], ["bing", "Bing", "HTML 逶ｴ謗･・・ctions・会ｼ俊.jina.ai 邨檎罰・医ヶ繝ｩ繧ｦ繧ｶ・・, "荳｡譁ｹ"], ["yahoo", "Yahoo! JAPAN", "繝壹・繧ｸ蜀・JSON縲よ律譛ｬ隱槭↓蠑ｷ縺・, "Actions"], ["gnews", "Google 繝九Η繝ｼ繧ｹ RSS", "讀懃ｴ｢繧ｯ繧ｨ繝ｪ蟇ｾ蠢懊・蟐剃ｽ灘錐繝ｻ譌･譎・, "荳｡譁ｹ"], ["hatena", "縺ｯ縺ｦ縺ｪ繝悶ャ繧ｯ繝槭・繧ｯ", "讀懃ｴ｢ RSS縲ゅヶ繧ｯ繝樊焚・晏渚蠢懊・驥・, "荳｡譁ｹ"], ["wiki", "Wikipedia / 繧ｦ繧｣繧ｭ繝九Η繝ｼ繧ｹ", "讀懃ｴ｢ API", "荳｡譁ｹ"],
  ["mojeek", "Mojeek", "迢ｬ遶九う繝ｳ繝・ャ繧ｯ繧ｹ・井ｸ榊ｮ牙ｮ夲ｼ・, "Actions"], ["bluesky", "Bluesky", "蜈ｬ髢区､懃ｴ｢ API", "Actions"], ["mastodon", "Mastodon", "繝上ャ繧ｷ繝･繧ｿ繧ｰ蜈ｬ髢九ち繧､繝繝ｩ繧､繝ｳ", "Actions"], ["reddit", "Reddit", "蜈ｬ髢・JSON・・P 縺ｫ繧医ｊ諡貞凄縺ゅｊ・・, "Actions"], ["gdelt", "GDELT", "荳也阜縺ｮ繝九Η繝ｼ繧ｹ DB・・ 遘帝俣髫費ｼ・, "Actions"], ["qiita", "Qiita", "謚陦楢ｨ倅ｺ・, "Actions"], ["github", "GitHub", "繝ｪ繝昴ず繝医Μ讀懃ｴ｢", "Actions"], ["nhk", "NHK RSS", "荳ｻ隕√・遉ｾ莨壹ル繝･繝ｼ繧ｹ", "Actions"], ["crossref / openalex", "蟄ｦ陦楢ｫ匁枚", "DOI繝ｻ陲ｫ蠑慕畑謨ｰ", "Actions"], ["wayback", "Wayback Machine", "URL 縺ｮ螻･豁ｴ", "荳｡譁ｹ"],
];
let INDEX = null, LATEST = null, TOPIC = null;
const state = { emb: null, nli: null };

/* ---------- 繝翫ン ---------- */
async function renderModels() {
  const reg = await getJSON("./registry.json") || { models: [] }; const res = (await getJSON("./data/models.json"))?.results || [];
  const R = Object.fromEntries(res.map(r => [r.name, r])); const roles = { embed: "蝓九ａ霎ｼ縺ｿ", nli: "蜷ｫ諢・, base: "蝨溷床・亥ｾｮ隱ｿ謨ｴ逕ｨ・・ }; const sel = new Set(["embed", "nli", "base"]);
  const draw = () => { const rows = reg.models.filter(m => sel.has(m.role)).map(m => { const r = R[m.name] || {}; return `<tr><td><b>${esc(m.name)}</b><br><span class="tiny muted">${esc(m.arch || "")}</span></td><td>${roles[m.role]}</td><td>${m.hf ? `<a href="https://huggingface.co/${esc(m.hf)}" target="_blank" rel="noopener">${esc(m.hf)}</a>` : "閾ｪ菴・}</td><td>${m.params_m ?? r.params_m ?? "窶・}M / ${m.size_mb ?? "窶・} MB${m.onnx ? '<br><span class="tag">ONNX繝ｻ繝悶Λ繧ｦ繧ｶ蜿ｯ</span>' : ""}</td><td>${r.ok ? (m.role === "embed" ? `JSTS ${r.jsts_spearman}<br>cos蟾ｮ ${r.nli_cos_gap}` : m.role === "nli" ? `JNLI ${(r.jnli_acc * 100).toFixed(1)}%<br>蜷ｫ諢丞・迴ｾ ${(r.entail_recall * 100) | 0}%繝ｻECE ${r.ece}` : "窶・) : (r.error ? `<span class="bad tiny">${esc(r.error.slice(0, 60))}</span>` : '<span class="muted">譛ｪ貂ｬ螳・/span>')}</td><td>${r.latency_ms != null ? r.latency_ms + " ms" : "窶・}</td><td class="small">${esc(m.note || "")}</td></tr>`; }).join("");
    $("#md-table").innerHTML = `<div class="tw"><table><thead><tr><th>繝｢繝・Ν</th><th>蠖ｹ蜑ｲ</th><th>Hugging Face</th><th>繝代Λ繝｡繝ｼ繧ｿ / 繧ｵ繧､繧ｺ</th><th>邊ｾ蠎ｦ</th><th>CPU 驕・ｻｶ</th><th>蛯呵・/th></tr></thead><tbody>${rows}</tbody></table></div>`; };
  $("#md-roles").innerHTML = Object.entries(roles).map(([k, v]) => `<span class="chip on" data-k="${k}">${v}</span>`).join(""); $$("#md-roles .chip").forEach(c => c.onclick = () => { c.classList.toggle("on"); c.classList.contains("on") ? sel.add(c.dataset.k) : sel.delete(c.dataset.k); draw(); }); draw();
}
async function renderAbout() {
  if ($("#about-box").dataset.done) return; $("#about-box").dataset.done = 1;
  try { $("#about-box").innerHTML = await (await fetch(new URL("./about.html", import.meta.url))).text(); } catch { $("#about-box").innerHTML = "<p class='muted'>隱ｭ繧√∪縺帙ｓ</p>"; }
  const sm = await getJSON("./models/nli-ja-30m/meta.json"); const ev = await getJSON("./models/nli-ja-30m/eval.json"); const tr = await getJSON("./models/nli-ja-30m/summary.json");
  const box = $("#ab-train"); if (!box) return; let h = "";
  if (tr) h += `<div class="kv"><span>蝨溷床</span><span>${esc(tr.base)}</span><span>險鍋ｷｴ繝・・繧ｿ</span><span>JNLI ${tr.n_train} 蟇ｾ・医け繝ｩ繧ｹ驥阪∩莉倥￠・・/span><span>繧ｨ繝昴ャ繧ｯ / lr / 邉ｻ蛻鈴聞</span><span>${tr.epochs} / ${tr.lr} / ${tr.seq}</span><span>torch 豁｣隗｣邇・ｼ医ユ繧ｹ繝・${tr.eval_n} 蟇ｾ・・/span><span>${(tr.eval_acc * 100).toFixed(1)}%</span><span>豺ｷ蜷瑚｡悟・・郁｡・豁｣隗｣ 蜷ｫ諢・荳ｭ遶・遏帷崟・・/span><span class="mono">${esc(JSON.stringify(tr.confusion))}</span><span>蟄ｦ鄙呈凾髢・/span><span>${Math.round(tr.sec / 60)} 蛻・/span></div>`;
  if (ev) h += `<div class="kv"><span>ONNX int8 豁｣隗｣邇・/span><span>${(ev.acc * 100).toFixed(1)}%・・=${ev.n}・・/span><span>ECE・・=1 竊・霈・ｭ｣蠕鯉ｼ・/span><span>${ev.ece_T1.toFixed(3)} 竊・${ev.ece_T.toFixed(3)}・・=${ev.T}・・/span></div>`;
  if (sm?.source) h += `<p class="small muted">meta: ${esc(sm.source)} / ${esc(sm.pooling)} / temperature ${sm.temperature ?? 1}</p>`;
  box.innerHTML = h || "<p class='small muted'>蟄ｦ鄙偵Ο繧ｰ縺ｯ縺ｾ縺縺ゅｊ縺ｾ縺帙ｓ</p>";
}
function show(t) { $$("nav button").forEach(b => b.classList.toggle("on", b.dataset.t === t)); $$("main > section").forEach(s => s.classList.toggle("hidden", s.id !== "t-" + t)); location.hash = t; window.scrollTo(0, 0); if (t === "how") renderHow(); if (t === "settings") renderSettings(); if (t === "models") renderModels(); if (t === "about") renderAbout(); }
$$("nav button").forEach(b => b.onclick = () => show(b.dataset.t));

/* ---------- 繝・・繧ｿ ---------- */
async function getJSON(p) { try { const r = await fetch(new URL(p, import.meta.url), { cache: "no-cache" }); if (!r.ok) return null; return await r.json(); } catch { return null; } }
async function loadData() {
  INDEX = await getJSON("./data/index.json") || { topics: [], verify: [], domains: [] };
  LATEST = await getJSON("./data/latest.json") || { items: [] };
  renderHome(); renderTopicSelect(); renderVerifyList(); renderReconList();
}

/* ---------- 蜈ｱ騾壽緒逕ｻ ---------- */
const gradeBadge = it => `<span class="g g${it.grade}">${it.grade}</span> <b>${it.reliability}</b>`;
function itemCard(it, opts = {}) {
  const host = NET.hostOf(it.url); const cls = J.CLASS_LABEL[it.source_class] || it.source_class || "";
  const axes = it.s_source != null ? `<div class="axes">
    <span>蜃ｺ謇 ${(it.s_source * 100) | 0}</span><div class="bar"><i style="width:${it.s_source * 100}%"></i></div><span class="muted tiny">ﾃ・{J.P.weights.source}</span>
    <span>蜀・ｮｹ ${(it.s_content * 100) | 0}</span><div class="bar"><i style="width:${it.s_content * 100}%"></i></div><span class="muted tiny">ﾃ・{J.P.weights.content}</span>
    <span>陬丞叙繧・${(it.s_corr * 100) | 0}</span><div class="bar"><i style="width:${it.s_corr * 100}%"></i></div><span class="muted tiny">ﾃ・{J.P.weights.corroboration}</span>
    <span>譎る俣 ${(it.s_time * 100) | 0}</span><div class="bar"><i style="width:${it.s_time * 100}%"></i></div><span class="muted tiny">ﾃ・{J.P.weights.time}</span></div>` : "";
  const why = (it.source_why || []).map(w => `<span class="tag">${esc(w)}</span>`).join(" ");
  const style = it.style ? Object.entries(it.style).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k, v]) => `<span class="tag">${k} ${(v * 100) | 0}%</span>`).join(" ") : "";
  const ev = (it.corr?.evidence || []).map(e => `<div class="ev ${e.kind === "support" ? "sup" : e.kind === "contra" ? "con" : ""}"><span class="tag ${e.kind === "support" ? "sup" : e.kind === "contra" ? "con" : ""}">${e.kind === "support" ? "蜷ｫ諢・ : e.kind === "contra" ? "遏帷崟" : "蜷瑚ｶ｣譌ｨ"} ${(e.p * 100) | 0}%</span> <a href="${esc(e.url)}" target="_blank" rel="noopener">${esc(NET.hostOf(e.url))}</a><br>${esc(e.text)}</div>`).join("");
  return `<div class="item" data-id="${esc(it.id || "")}">
   <div class="row" style="gap:6px"><span>${gradeBadge(it)}</span><a class="t" href="${esc(it.url)}" target="_blank" rel="noopener">${esc(it.title || it.url)}</a></div>
   <div class="m"><span>${esc(host)}</span><span>${esc(cls)}</span>${it.published ? `<span>${esc(it.published)}</span>` : "<span class=\"warn\">譌･莉倥↑縺・/span>"}${it.site ? `<span>${esc(it.site)}</span>` : ""}${(it.engines || []).length ? `<span>${it.engines.join("繝ｻ")}</span>` : ""}${(it.dorks || []).filter(d => d !== "topic").length ? `<span>Dorks: ${it.dorks.filter(d => d !== "topic").map(d => DORKS[d]?.[0] || d).join("繝ｻ")}</span>` : ""}${it.text ? `<span class="ok">譛ｬ譁・${it.text.length} 蟄・/span>` : ""}${it.reactions ? `<span>蜿榊ｿ・${it.reactions}</span>` : ""}</div>
   ${it.snippet ? `<div class="sn">${esc(it.snippet.slice(0, 220))}</div>` : ""}
   ${axes}
   <details><summary>譬ｹ諡繧定ｦ九ｋ${it.corr ? `・郁｣丞叙繧奇ｼ壼性諢・${it.corr.support}繝ｻ遏帷崟 ${it.corr.contra}繝ｻ${(it.corr.domains || []).length} 繝峨Γ繧､繝ｳ・荏 : ""}</summary>
    <div class="small">${why} ${style}</div>
    ${it.claim ? `<div class="small muted">隕∵葎・・{esc(it.claim)}</div>` : ""}
    ${ev || '<div class="small muted">莉悶ラ繝｡繧､繝ｳ縺ｮ谿ｵ關ｽ縺ｧ蜷ｫ諢上・遏帷崟縺励◆繧ゅ・縺ｯ縺ｪ縺・/div>'}
    ${opts.actions !== false ? `<div class="actbar"><button class="small act-read" data-url="${esc(it.url)}">譛ｬ譁・ｒ隱ｭ繧</button><button class="small act-recon" data-url="${esc(it.url)}">繝峨Γ繧､繝ｳ隱ｿ譟ｻ</button><button class="small act-verify" data-claim="${esc(it.claim || it.title || "")}">縺薙・隕∵葎繧呈､懆ｨｼ</button></div>` : ""}
   </details></div>`;
}
function wireItemActions(root) {
  root.querySelectorAll(".act-read").forEach(b => b.onclick = () => openReader(b.dataset.url));
  root.querySelectorAll(".act-recon").forEach(b => b.onclick = () => { $("#rc-q").value = b.dataset.url; show("recon"); runRecon(); });
  root.querySelectorAll(".act-verify").forEach(b => b.onclick = () => { $("#vf-q").value = b.dataset.claim; show("verify"); runVerify(); });
}
async function openReader(url) {
  const box = el(`<div class="card"><div class="row"><b>譛ｬ譁・/b><a href="${esc(url)}" target="_blank" rel="noopener" class="small">${esc(url)}</a><button class="small" style="margin-left:auto">髢峨§繧・/button></div><div class="small muted">隱ｭ縺ｿ霎ｼ縺ｿ荳ｭ窶ｦ</div></div>`);
  box.querySelector("button").onclick = () => box.remove(); document.querySelector("main > section:not(.hidden)").prepend(box); window.scrollTo(0, 0);
  const r = await NET.readPage(url); box.lastChild.innerHTML = r ? `<b>${esc(r.title)}</b><div class="mono" style="max-height:60vh;overflow:auto;white-space:pre-wrap;word-break:normal">${esc(r.text)}</div>` : "隱ｭ繧√∪縺帙ｓ縺ｧ縺励◆・・.jina.ai 縺ｮ蛻ｶ髯舌°縲√し繧､繝医′諡貞凄・・;
}

/* ---------- 讎りｦ・---------- */
function renderHome() {
  const t = INDEX.topics, n = t.reduce((s, x) => s + (x.n || 0), 0);
  $("#home-stats").innerHTML = [["繝医ヴ繝・け", t.length], ["蜿朱寔繝壹・繧ｸ", n], ["讀懆ｨｼ縺励◆荳ｻ蠑ｵ", INDEX.verify?.length || 0], ["隱ｿ譟ｻ繝峨Γ繧､繝ｳ", INDEX.domains?.length || 0], ["譛邨よ峩譁ｰ", (INDEX.updated || "窶・).slice(5, 16).replace("T", " ")]].map(([k, v]) => `<div class="stat">${k}<b>${esc(v)}</b></div>`).join("");
  $("#home-tiles").innerHTML = [["閾ｪ蜍募庶髮・, "GitHub Actions 縺・6 譎る俣縺斐→縺ｫ蟾｡蝗槭＠縺溽ｵ先棡", "topics"], ["縺・∪隱ｿ縺ｹ繧・, "繝悶Λ繧ｦ繧ｶ縺九ｉ讀懃ｴ｢繧ｨ繝ｳ繧ｸ繝ｳ繧貞ｼ輔＞縺ｦ遶ｯ譛ｫ蜀・〒謗｡轤ｹ", "live"], ["荳ｻ蠑ｵ繧呈､懆ｨｼ", "譁・ｒ蜈･繧後ｋ縺ｨ蜷ｫ諢擾ｼ冗泝逶ｾ縺ｧ蛻､螳・, "verify"], ["繝峨Γ繧､繝ｳ隱ｿ譟ｻ", "whois繝ｻDNS繝ｻ險ｼ譏取嶌繝ｻWayback", "recon"], ["繝｢繝・Ν豈碑ｼ・, "譌｢蟄・BERT 邉ｻ繝｢繝・Ν繧貞酔縺俶欠讓吶〒豈斐∋縲∝悄蜿ｰ繧帝∈繧薙〒蠕ｮ隱ｿ謨ｴ", "models"], ["隗｣隱ｬ", "菴輔ｒ縺ｩ縺ｮ繝・・繧ｿ縺ｧ蟄ｦ鄙偵＠縺溘°繝ｻ莉慕ｵ・∩繝ｻ髯千阜", "about"], ["莉慕ｵ・∩", "蠑上・繝代Λ繝｡繝ｼ繧ｿ繝ｻ諠・ｱ貅・, "how"], ["險ｭ螳・, "watch.yaml繝ｻ繝｢繝・Ν繝ｻPWA", "settings"]].map(([a, b, t]) => `<div class="tile" data-t="${t}"><b>${a}</b><span>${b}</span></div>`).join("");
  $$("#home-tiles .tile").forEach(x => x.onclick = () => show(x.dataset.t));
  const items = (LATEST.items || []).slice(0, 30);
  $("#home-latest").innerHTML = items.length ? `<div class="tw"><table><thead><tr><th>隧穂ｾ｡</th><th>隕句・縺・/th><th>蜃ｺ謇</th><th>譌･莉・/th><th>繝医ヴ繝・け</th></tr></thead><tbody>${items.map(it => `<tr><td>${gradeBadge(it)}</td><td><a href="${esc(it.url)}" target="_blank" rel="noopener">${esc(it.title || it.url)}</a></td><td class="small">${esc(NET.hostOf(it.url))}<br><span class="muted">${esc(J.CLASS_LABEL[it.source_class] || "")}</span></td><td class="small">${esc(it.published || "窶・)}</td><td class="small"><a href="#" data-topic="${esc(it.topic)}">${esc(it.topic)}</a></td></tr>`).join("")}</tbody></table></div>` : `<p class="muted small">縺ｾ縺蜿朱寔邨先棡縺後≠繧翫∪縺帙ｓ縲・itHub Actions 縺ｮ collect 繧貞ｮ溯｡後☆繧九°縲√後＞縺ｾ隱ｿ縺ｹ繧九阪〒隧ｦ縺励※縺上□縺輔＞縲・/p>`;
  $$("#home-latest a[data-topic]").forEach(a => a.onclick = e => { e.preventDefault(); show("topics"); const s = INDEX.topics.find(t => t.topic === a.dataset.topic); if (s) { $("#tp-sel").value = s.slug; loadTopic(s.slug); } });
}

/* ---------- 閾ｪ蜍募庶髮・---------- */
function renderTopicSelect() {
  const sel = $("#tp-sel"); sel.innerHTML = INDEX.topics.map(t => `<option value="${esc(t.slug)}">${esc(t.topic)}・・{t.n} 莉ｶ繝ｻ${(t.run_at || "").slice(5, 16).replace("T", " ")}・・/option>`).join("") || "<option value=''>・育ｵ先棡縺ｪ縺暦ｼ・/option>";
  sel.onchange = () => loadTopic(sel.value); if (INDEX.topics[0]) loadTopic(INDEX.topics[0].slug);
}
async function loadTopic(slug) {
  TOPIC = await getJSON(`./data/topics/${slug}.json`); if (!TOPIC) { $("#tp-items").innerHTML = "<p class='muted'>隱ｭ繧√∪縺帙ｓ</p>"; return; }
  const s = TOPIC.summary; $("#tp-meta").textContent = `${TOPIC.run_at.slice(0, 16).replace("T", " ")} 螳溯｡後・${TOPIC.n} 莉ｶ`;
  $("#tp-stats").innerHTML = [["蟷ｳ蝮・ｿ｡鬆ｼ諤ｧ", s.mean], ["A / B", `${s.grades.A || 0} / ${s.grades.B || 0}`], ["C / D", `${s.grades.C || 0} / ${s.grades.D || 0}`], ["繝峨Γ繧､繝ｳ", s.domains], ["譌･莉倥≠繧・, `${s.dated}/${TOPIC.n}`], ["隧ｱ鬘・, s.clusters]].map(([k, v]) => `<div class="stat">${k}<b>${v}</b></div>`).join("") + `<div class="chips" style="flex-basis:100%">${Object.entries(s.classes).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<span class="chip" style="cursor:default">${J.CLASS_LABEL[k] || k} ${v}</span>`).join("")}</div>`;
  const h = (INDEX.topics.find(t => t.slug === slug)?.history || []); $("#tp-hist").innerHTML = h.length > 1 ? `<div class="small muted">蟷ｳ蝮・ｿ｡鬆ｼ諤ｧ縺ｮ謗ｨ遘ｻ・・{h.length} 蝗橸ｼ・/div><div class="hist">${h.map(x => `<i style="height:${x.mean * 0.4}px" title="${x.run_at} ${x.mean}"></i>`).join("")}</div>` : "";
  $("#tp-clusters").innerHTML = TOPIC.clusters.filter(c => c.size > 1).slice(0, 12).map(c => `<div class="item"><div class="row"><span class="g g${J.grade(c.reliability)}">${c.reliability}</span><b>${esc(c.title)}</b></div><div class="m"><span>${c.size} 莉ｶ</span><span>${c.domains.length} 繝峨Γ繧､繝ｳ・・{c.domains.slice(0, 6).map(esc).join("繝ｻ")}${c.domains.length > 6 ? "窶ｦ" : ""}</span><span>蛻晏・ ${esc(c.first || "荳肴・")} <a href="${esc(c.first_url)}" target="_blank" rel="noopener">${esc(NET.hostOf(c.first_url))}</a></span></div></div>`).join("") || "<p class='muted small'>隍・焚繝壹・繧ｸ縺ｫ縺ｾ縺溘′繧玖ｩｱ鬘後・縺ｪ縺・/p>";
  const cs = $("#tp-class"); cs.innerHTML = "<option value=''>蜈ｨ遞ｮ蛻･</option>" + Object.keys(s.classes).map(k => `<option value="${k}">${J.CLASS_LABEL[k] || k}</option>`).join("");
  $("#tp-queries").innerHTML = `<div class="tw"><table><thead><tr><th>蜷榊燕</th><th>讀懃ｴ｢蠑・/th></tr></thead><tbody>${TOPIC.queries.map(q => `<tr><td>${esc(q.label)}</td><td class="mono">${esc(q.query)}</td></tr>`).join("")}</tbody></table></div><p class="small muted">繧ｨ繝ｳ繧ｸ繝ｳ・・{(TOPIC.engines || []).join("繝ｻ")}縲HTTP ${TOPIC.http?.requests} 蝗橸ｼ亥､ｱ謨・${TOPIC.http?.errors}・・/p>`;
  renderTopicItems();
}
function renderTopicItems() {
  if (!TOPIC) return; const q = $("#tp-q").value.trim(), g = $("#tp-grade").value, c = $("#tp-class").value, so = $("#tp-sort").value;
  let items = TOPIC.items.filter(it => (!g || it.grade === g) && (!c || it.source_class === c) && (!q || (it.title + it.snippet + it.url).includes(q)));
  items = items.sort((a, b) => so === "date" ? (b.published || "").localeCompare(a.published || "") : so === "corr" ? b.s_corr - a.s_corr : b.reliability - a.reliability);
  $("#tp-items").innerHTML = `<p class="small muted">${items.length} 莉ｶ</p>` + items.slice(0, 80).map(it => itemCard(it)).join(""); wireItemActions($("#tp-items"));
}
["#tp-q", "#tp-grade", "#tp-class", "#tp-sort"].forEach(s => $(s).oninput = renderTopicItems);
$("#tp-csv").onclick = () => { if (!TOPIC) return; const rows = [["grade", "reliability", "s_source", "s_content", "s_corr", "s_time", "source_class", "published", "title", "url", "engines", "dorks"]].concat(TOPIC.items.map(it => [it.grade, it.reliability, it.s_source, it.s_content, it.s_corr, it.s_time, it.source_class, it.published || "", it.title, it.url, (it.engines || []).join("|"), (it.dorks || []).join("|")])); dl(TOPIC.slug + ".csv", "・ｿ" + rows.map(r => r.map(x => `"${String(x ?? "").replace(/"/g, '""')}"`).join(",")).join("\n"), "text/csv"); };
$("#tp-json").onclick = () => TOPIC && dl(TOPIC.slug + ".json", JSON.stringify(TOPIC, null, 1), "application/json");
function dl(name, text, type = "text/plain") { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }

/* ---------- 繝｢繝・Ν ---------- */
async function models(onStep) {
  if (!state.emb) state.emb = await ML.embedder(m => onStep?.("蝓九ａ霎ｼ縺ｿ繝｢繝・Ν: " + m));
  if (!state.nli) state.nli = await ML.nli(m => onStep?.("蜷ｫ諢上Δ繝・Ν: " + m));
  return state;
}

/* ---------- 縺・∪隱ｿ縺ｹ繧・---------- */
function chips(root, obj, on, sel) { root.innerHTML = Object.entries(obj).map(([k, [label]]) => `<span class="chip ${sel.has(k) ? "on" : ""}" data-k="${k}" title="${esc(obj[k][1] || "")}">${label}</span>`).join(""); root.querySelectorAll(".chip").forEach(c => c.onclick = () => { c.classList.toggle("on"); on(); }); }
const lvSel = { dorks: new Set(["exact", "official_jp", "news_pr", "factcheck"]), engines: new Set(["ddg", "gnews", "wiki"]) };
chips($("#lv-dorks"), DORKS, () => { lvSel.dorks = new Set($$("#lv-dorks .chip.on").map(c => c.dataset.k)); }, lvSel.dorks);
chips($("#lv-engines"), Object.fromEntries(Object.entries(NET.ENGINES).map(([k, v]) => [k, [v.label, v.note]])), () => { lvSel.engines = new Set($$("#lv-engines .chip.on").map(c => c.dataset.k)); }, lvSel.engines);
$("#lv-read").oninput = () => $("#lv-read-v").textContent = $("#lv-read").value;
$("#lv-run").onclick = runLive; $("#lv-q").onkeydown = e => e.key === "Enter" && runLive();
async function collectLive(topic, { dorks, engines, nread, status }) {
  const queries = [{ name: "topic", label: "縺昴・縺ｾ縺ｾ", query: topic }, ...[...dorks].map(k => ({ name: k, label: DORKS[k][0], query: DORKS[k][1].replace("{q}", topic) }))];
  const seen = new Map();
  for (const q of queries) for (const e of engines) {
    if (e === "wiki" && q.name !== "topic") continue;
    status(`${NET.ENGINES[e].label}・・{q.label}`);
    const rs = await NET.search(e === "ddg" ? q.query.replace(/[()]/g, "") : q.query, [e], 10);
    for (const r of rs) { if (seen.has(r.url)) { const x = seen.get(r.url); x.engines = [...new Set([...x.engines, e])]; x.dorks = [...new Set([...x.dorks, q.name])]; if (!x.published && r.published) x.published = r.published; } else seen.set(r.url, { ...r, id: Math.random().toString(36).slice(2, 10), dorks: [q.name], text: "", topic }); }
  }
  let items = [...seen.values()];
  const prio = it => it.engines.length * 2 + it.dorks.length + ({ gov: 3, news: 3, edu: 2, academic: 2, wiki: 1 }[J.domainClass(NET.hostOf(it.url))] || 0);
  items.sort((a, b) => prio(b) - prio(a)); items = items.slice(0, 60);
  for (let i = 0; i < Math.min(nread, items.length); i++) { status(`譛ｬ譁・ｒ隱ｭ繧 ${i + 1}/${Math.min(nread, items.length)}・・{NET.hostOf(items[i].url)}`); const r = await NET.readPage(items[i].url); if (r) { items[i].text = r.text.slice(0, 6000); items[i].title = items[i].title || r.title; if (r.finalUrl && /^https?:/.test(r.finalUrl) && NET.hostOf(r.finalUrl) !== "news.google.com" && NET.hostOf(r.finalUrl) !== NET.hostOf(items[i].url)) { items[i].orig_url = items[i].url; items[i].url = NET.normUrl(r.finalUrl); } } }
  return { items, queries };
}
async function domInfosFor(items, status, max = 12) {
  const hosts = [...new Set(items.map(it => NET.hostOf(it.url).replace(/^www\./, "")))].slice(0, max); const out = {}; let cache = {}; try { cache = JSON.parse(localStorage.getItem("mbo.domcache") || "{}"); } catch { }
  const todo = hosts.filter(h => { if (cache[h] && Date.now() - cache[h].t < 30 * 864e5) { out[h] = cache[h]; return false; } return true; });
  status(`繝峨Γ繧､繝ｳ諠・ｱ・・{todo.length} 莉ｶ`);
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
    if (!items.length) { st("菴輔ｂ隕九▽縺九ｊ縺ｾ縺帙ｓ縺ｧ縺励◆・・.jina.ai 縺ｮ蛻ｶ髯舌↓蠖薙◆縺｣縺溷庄閭ｽ諤ｧ縲・ 蛻・⊇縺ｩ蠕・▲縺ｦ蜀崎ｩｦ陦鯉ｼ・); return; }
    const dom = await domInfosFor(items, st); await J.scoreItems(items, dom, state.emb, state.nli, st); const clusters = await J.cluster(items, state.emb);
    items.sort((a, b) => b.reliability - a.reliability); st(`${items.length} 莉ｶ繝ｻ${new Set(items.map(i => NET.hostOf(i.url))).size} 繝峨Γ繧､繝ｳ`);
    const mean = Math.round(items.reduce((s, x) => s + x.reliability, 0) / items.length);
    $("#lv-out").innerHTML = `<div class="card"><div class="stats"><div class="stat">蟷ｳ蝮・ｿ｡鬆ｼ諤ｧ<b>${mean}</b></div><div class="stat">A/B/C/D<b>${["A", "B", "C", "D"].map(g => items.filter(i => i.grade === g).length).join("/")}</b></div><div class="stat">隍・焚繝壹・繧ｸ縺ｮ隧ｱ鬘・b>${clusters.filter(c => c.size > 1).length}</b></div></div>
      <div class="actbar"><button class="small" id="lv-add">watch.yaml 縺ｫ霑ｽ蜉</button><button class="small" id="lv-dl">JSON</button></div>
      ${clusters.filter(c => c.size > 1).slice(0, 8).map(c => `<div class="item"><div class="row"><span class="g g${J.grade(c.reliability)}">${c.reliability}</span><b>${esc(c.title)}</b></div><div class="m"><span>${c.size} 莉ｶ</span><span>${c.domains.slice(0, 6).map(esc).join("繝ｻ")}</span><span>蛻晏・ ${esc(c.first || "荳肴・")}</span></div></div>`).join("")}</div>
      <div class="card">${items.map(it => itemCard(it)).join("")}</div>
      <div class="card"><h3 style="margin-top:0">菴ｿ縺｣縺滓､懃ｴ｢蠑・/h3><div class="tw"><table>${queries.map(x => `<tr><td>${esc(x.label)}</td><td class="mono">${esc(x.query)}</td></tr>`).join("")}</table></div></div>`;
    wireItemActions($("#lv-out")); $("#lv-add").onclick = () => { addWatch("topics", q); show("settings"); }; $("#lv-dl").onclick = () => dl("live.json", JSON.stringify({ topic: q, items, clusters, queries }, null, 1), "application/json");
  } catch (e) { st("繧ｨ繝ｩ繝ｼ: " + (e.message || e)); console.error(e); } finally { $("#lv-run").disabled = false; }
}
async function liveUrl(url, st) {
  await models(st); st("繝壹・繧ｸ繧定ｪｭ縺ｿ霎ｼ縺ｿ荳ｭ"); const r = await NET.readPage(url); if (!r) { st("隱ｭ繧√∪縺帙ｓ縺ｧ縺励◆"); return; }
  const me = { id: "target", url, title: r.title, snippet: r.text.slice(0, 200), text: r.text.slice(0, 8000), engines: [], dorks: [], published: null };
  const claim = J.keyClaim(me); st("蜷後§隧ｱ繧呈爾縺呻ｼ・ + claim.slice(0, 40));
  const { items } = await collectLive(r.title || claim.slice(0, 60), { dorks: new Set(["exact"]), engines: new Set(["ddg", "gnews"]), nread: 6, status: st });
  const all = [me, ...items.filter(i => i.url !== url)]; const dom = await domInfosFor(all, st); await J.scoreItems(all, dom, state.emb, state.nli, st); st("");
  $("#lv-out").innerHTML = `<div class="card"><h3 style="margin-top:0">縺薙・ URL 縺ｮ蛻､螳・/h3>${itemCard(me)}<div class="mono" style="max-height:40vh;overflow:auto;white-space:pre-wrap;word-break:normal;margin-top:8px">${esc(r.text.slice(0, 4000))}</div></div><div class="card"><h3 style="margin-top:0">蜷後§隧ｱ繧剃ｼ昴∴縺ｦ縺・ｋ莉悶・繝壹・繧ｸ</h3>${all.slice(1).sort((a, b) => b.reliability - a.reliability).map(it => itemCard(it)).join("") || "<p class='muted small'>隕九▽縺九ｉ縺・/p>"}</div>`; wireItemActions($("#lv-out"));
}

/* ---------- 荳ｻ蠑ｵ縺ｮ讀懆ｨｼ ---------- */
$("#vf-run").onclick = runVerify; $("#vf-q").onkeydown = e => e.key === "Enter" && runVerify();
function verdictCard(v) {
  const [label, cls] = J.VERDICT[v.verdict] || [v.verdict, ""];
  return `<div class="verdict ${cls}">${label}</div><div class="stats"><div class="stat">謾ｯ謖・ｼ磯㍾縺ｿ莉倥″・・b>${v.support}</b></div><div class="stat">蜿崎ｨｼ<b>${v.refute}</b></div><div class="stat">謾ｯ謖√ラ繝｡繧､繝ｳ<b>${(v.support_domains || []).length}</b></div><div class="stat">蜿崎ｨｼ繝峨Γ繧､繝ｳ<b>${(v.refute_domains || []).length}</b></div><div class="stat">辣ｧ蜷域ｮｵ關ｽ<b>${v.n_passages ?? "窶・}</b></div></div>
   ${(v.evidence || []).map(e => `<div class="ev ${e.kind === "support" ? "sup" : e.kind === "refute" ? "con" : ""}"><span class="tag ${e.kind === "support" ? "sup" : e.kind === "refute" ? "con" : ""}">${e.kind === "support" ? "蜷ｫ諢・ : e.kind === "refute" ? "遏帷崟" : "荳ｭ遶・} ${((e.kind === "refute" ? e.contra : e.entail) * 100) | 0}%</span> <a href="${esc(e.url)}" target="_blank" rel="noopener">${esc(e.domain)}</a> <span class="muted tiny">鬘樔ｼｼ ${e.sim}${e.published ? "繝ｻ" + esc(e.published) : ""}</span><br>${esc(e.text)}</div>`).join("") || "<p class='small muted'>辣ｧ蜷医〒縺阪ｋ谿ｵ關ｽ縺後≠繧翫∪縺帙ｓ縺ｧ縺励◆</p>"}`;
}
async function runVerify() {
  const c = $("#vf-q").value.trim(); if (!c) return; const st = m => $("#vf-status").textContent = m; $("#vf-run").disabled = true; $("#vf-out").innerHTML = "";
  try {
    await models(st); const { items } = await collectLive(c, { dorks: new Set(["exact", "official_jp", "news_pr", "factcheck", "deny"]), engines: new Set(["ddg", "gnews", "wiki"]), nread: 10, status: st });
    const dom = await domInfosFor(items, st); for (const it of items) { const { s, cls } = J.sourceScore(it, dom[NET.hostOf(it.url)]); it.s_source = s; it.source_class = cls; }
    const v = await J.verify(c, items, state.emb, state.nli, st); st(`${items.length} 繝壹・繧ｸ繝ｻ${v.n_passages} 谿ｵ關ｽ繧堤・蜷・);
    $("#vf-out").innerHTML = verdictCard(v) + `<div class="actbar"><button class="small" id="vf-add">watch.yaml 縺ｫ霑ｽ蜉</button></div>`; $("#vf-add").onclick = () => { addWatch("claims", c); show("settings"); };
  } catch (e) { st("繧ｨ繝ｩ繝ｼ: " + (e.message || e)); } finally { $("#vf-run").disabled = false; }
}
function renderVerifyList() { const l = INDEX.verify || []; $("#vf-list").innerHTML = l.length ? `<div class="tw"><table><thead><tr><th>蛻､螳・/th><th>荳ｻ蠑ｵ</th><th>謾ｯ謖・蜿崎ｨｼ</th><th>譌･譎・/th></tr></thead><tbody>${l.map(v => `<tr><td><span class="${J.VERDICT[v.verdict]?.[1] || ""}"><b>${J.VERDICT[v.verdict]?.[0] || v.verdict}</b></span></td><td><a href="#" data-id="${esc(v.id)}">${esc(v.claim)}</a></td><td>${v.support} / ${v.refute}</td><td class="small">${esc((v.run_at || "").slice(0, 16).replace("T", " "))}</td></tr>`).join("")}</tbody></table></div><div id="vf-detail"></div>` : "<p class='muted small'>縺ｾ縺縺ゅｊ縺ｾ縺帙ｓ・・atch.yaml 縺ｮ claims 縺ｫ譖ｸ縺上→閾ｪ蜍輔〒讀懆ｨｼ・・/p>"; $$("#vf-list a[data-id]").forEach(a => a.onclick = async e => { e.preventDefault(); const v = await getJSON(`./data/verify/${a.dataset.id}.json`); $("#vf-detail").innerHTML = v ? `<h3>${esc(v.claim)}</h3>` + verdictCard(v) : "隱ｭ繧√∪縺帙ｓ"; }); }

/* ---------- 繝峨Γ繧､繝ｳ隱ｿ譟ｻ ---------- */
$("#rc-run").onclick = runRecon; $("#rc-q").onkeydown = e => e.key === "Enter" && runRecon();
function profileHtml(p) {
  const kv = (o) => Object.entries(o || {}).filter(([k, v]) => v != null && v !== "" && !(Array.isArray(v) && !v.length)).map(([k, v]) => `<span>${esc(k)}</span><span>${Array.isArray(v) ? v.map(esc).join(", ") : typeof v === "object" ? esc(JSON.stringify(v)) : esc(v)}</span>`).join("");
  const wb = p.wayback || {}; const age = wb.age_days != null ? `${Math.floor(wb.age_days / 365)} 蟷ｴ ${Math.floor(wb.age_days % 365 / 30)} 縺区怦` : "荳肴・";
  return `<div class="stats"><div class="stat">遞ｮ蛻･<b>${J.CLASS_LABEL[p.class || J.domainClass(p.host)] || "窶・}</b></div><div class="stat">蛻晏・・・ayback・・b>${wb.first ? `${wb.first.slice(0, 4)}/${wb.first.slice(4, 6)}` : "窶・}</b></div><div class="stat">繝峨Γ繧､繝ｳ蟷ｴ鮨｢<b>${age}</b></div><div class="stat">Wikipedia 蜃ｺ蜈ｸ<b>${p.wiki_cites ?? "窶・}</b></div><div class="stat">繧ｵ繝悶ラ繝｡繧､繝ｳ<b>${(p.crtsh || []).length + ((p.hackertarget?.hosts) || []).length}</b></div></div>
   <h3>逋ｻ骭ｲ諠・ｱ・・DAP / JPRS・・/h3><div class="kv">${kv(p.rdap) || "<span class='muted'>蜿門ｾ励〒縺阪★</span>"}</div>
   <h3>DNS</h3><div class="kv">${kv(p.dns)}</div>
   <h3>Wayback Machine</h3><div class="kv">${wb.first_url ? `<span>譛蜿､</span><span><a href="${esc(wb.first_url)}" target="_blank" rel="noopener">${esc(wb.first)}</a></span>` : ""}${wb.last_url ? `<span>譛譁ｰ</span><span><a href="${esc(wb.last_url)}" target="_blank" rel="noopener">${esc(wb.last)}</a></span>` : ""}</div>
   <h3>繧ｵ繝悶ラ繝｡繧､繝ｳ繝ｻ繝帙せ繝茨ｼ郁ｨｼ譏取嶌繝ｭ繧ｰ crt.sh ・・HackerTarget・・/h3><div class="small mono">${[...new Set([...(p.crtsh || []), ...((p.hackertarget?.hosts) || [])])].slice(0, 60).map(esc).join("  ") || "縺ｪ縺暦ｼ丞叙蠕励〒縺阪★"}</div>
   ${p.hackertarget?.geoip ? `<h3>GeoIP</h3><div class="kv">${kv(p.hackertarget.geoip)}</div>` : ""}
   ${p.headers ? `<h3>繧ｻ繧ｭ繝･繝ｪ繝・ぅ繝倥ャ繝</h3><div class="kv">${kv(p.headers)}</div>` : ""}
   ${(p.urlscan || []).length ? `<h3>urlscan.io 縺ｮ蜈ｬ髢九せ繧ｭ繝｣繝ｳ</h3><div class="tw"><table>${p.urlscan.map(u => `<tr><td class="small">${esc((u.time || "").slice(0, 10))}</td><td class="small"><a href="${esc(u.result || "#")}" target="_blank" rel="noopener">${esc(u.url)}</a></td><td class="small">${esc(u.ip || "")} ${esc(u.server || "")}</td></tr>`).join("")}</table></div>` : ""}
   <p class="small muted">縺薙・隱ｿ譟ｻ縺ｯ蜈ｬ髢・API 縺ｮ隱ｭ縺ｿ蜿悶ｊ縺縺代〒縲∝ｯｾ雎｡繧ｵ繝ｼ繝舌∈縺ｮ繧ｹ繧ｭ繝｣繝ｳ縺ｯ陦後ｏ縺ｪ縺・・/p>`;
}
async function runRecon() {
  const q = $("#rc-q").value.trim(); if (!q) return; const st = m => $("#rc-status").textContent = m; $("#rc-run").disabled = true;
  try { const p = await NET.profile(q, k => st("蜿門ｾ嶺ｸｭ・・ + k)); p.class = J.domainClass(p.host.replace(/^www\./, "")); st(""); $("#rc-out").innerHTML = profileHtml(p) + `<div class="actbar"><button class="small" id="rc-add">watch.yaml 縺ｫ霑ｽ蜉</button><button class="small" id="rc-dl">JSON</button></div>`; $("#rc-add").onclick = () => { addWatch("domains", p.host); show("settings"); }; $("#rc-dl").onclick = () => dl(p.host + ".json", JSON.stringify(p, null, 1), "application/json"); }
  catch (e) { st("繧ｨ繝ｩ繝ｼ: " + (e.message || e)); } finally { $("#rc-run").disabled = false; }
}
function renderReconList() { const l = INDEX.domains || []; $("#rc-list").innerHTML = l.length ? `<div class="tw"><table><thead><tr><th>繝帙せ繝・/th><th>遞ｮ蛻･</th><th>蛻晏・</th><th>Wikipedia 蜃ｺ蜈ｸ</th><th>繧ｵ繝悶ラ繝｡繧､繝ｳ</th><th>譌･譎・/th></tr></thead><tbody>${l.map(d => `<tr><td><a href="#" data-host="${esc(d.host)}">${esc(d.host)}</a></td><td>${esc(J.CLASS_LABEL[d.class] || d.class)}</td><td>${esc(d.first || "窶・)}</td><td>${d.wiki_cites ?? "窶・}</td><td>${d.subdomains ?? "窶・}</td><td class="small">${esc((d.run_at || "").slice(0, 16).replace("T", " "))}</td></tr>`).join("")}</tbody></table></div><div id="rc-detail"></div>` : "<p class='muted small'>縺ｾ縺縺ゅｊ縺ｾ縺帙ｓ</p>"; $$("#rc-list a[data-host]").forEach(a => a.onclick = async e => { e.preventDefault(); const p = await getJSON(`./data/domains/${a.dataset.host}.json`); $("#rc-detail").innerHTML = p ? `<h3>${esc(p.host)}</h3>` + profileHtml(p) : "隱ｭ繧√∪縺帙ｓ"; }); }

/* ---------- 莉慕ｵ・∩ ---------- */
function renderHow() {
  const P = J.P; const box = $("#how-params"); if (box.dataset.done) return; box.dataset.done = 1;
  const num = (path, v, step = 0.05, min = -1, max = 2) => `<span>${esc(path)}</span><input type="range" data-p="${esc(path)}" min="${min}" max="${max}" step="${step}" value="${v}"><input type="number" data-p="${esc(path)}" step="${step}" value="${v}">`;
  const sec = (title, obj, prefix, step, min, max) => `<h3>${title}</h3><div class="pfield">${Object.entries(obj).map(([k, v]) => num(prefix + k, v, step, min, max)).join("")}</div>`;
  box.innerHTML = sec("驥阪∩ w・亥粋險・1 縺檎岼螳会ｼ・, P.weights, "weights.", 0.05, 0, 1) + sec("蜃ｺ謇・壹ラ繝｡繧､繝ｳ遞ｮ蛻･縺ｮ蝓ｺ遉守せ", P.source_class, "source_class.", 0.05, 0, 1) + sec("蜃ｺ謇・壼刈轤ｹ繝ｻ貂帷せ", P.source_bonus, "source_bonus.", 0.01, -0.5, 0.5) + sec("蜀・ｮｹ・壽枚菴薙・驥阪∩", P.content.zero_shot_weight, "content.zero_shot_weight.", 0.05, -0.5, 0.5) + sec("陬丞叙繧・, { top_k: P.corroboration.top_k, min_sim: P.corroboration.min_sim, entail_min: P.corroboration.entail_min, contra_min: P.corroboration.contra_min, saturation: P.corroboration.saturation }, "corroboration.", 0.01, 0, 40) + sec("讀懆ｨｼ", { top_k: P.verify.top_k, min_sim: P.verify.min_sim, support_min: P.verify.support_min, refute_min: P.verify.refute_min, "verdict.supported": P.verify.verdict.supported, "verdict.refuted": P.verify.verdict.refuted, "verdict.mixed_ratio": P.verify.verdict.mixed_ratio }, "verify.", 0.01, 0, 40) + sec("譎る俣", P.time, "time.", 1, 0, 365) + sec("繧ｯ繝ｩ繧ｹ繧ｿ", P.cluster, "cluster.", 0.01, 0.5, 1);
  box.querySelectorAll("input").forEach(i => i.oninput = () => { box.querySelectorAll(`input[data-p="${i.dataset.p}"]`).forEach(o => o.value = i.value); setPath(J.P, i.dataset.p, +i.value); J.setParams(J.P, false); });
  $("#pr-save").onclick = () => { J.setParams(J.P, true); $("#pr-msg").textContent = "菫晏ｭ倥＠縺ｾ縺励◆・医％縺ｮ遶ｯ譛ｫ縺ｮ蛻､螳壹↓蜿肴丐・・; };
  $("#pr-dl").onclick = () => dl("params.json", JSON.stringify(J.P, null, 1), "application/json");
  $("#pr-reset").onclick = async () => { J.resetParams(); await J.loadParams(); box.dataset.done = ""; renderHow(); $("#pr-msg").textContent = "蛻晄悄蛟､縺ｫ謌ｻ縺励∪縺励◆"; };
  $("#how-sources").innerHTML = `<div class="tw"><table><thead><tr><th>蜷榊燕</th><th>諠・ｱ貅・/th><th>譁ｹ豕・/th><th>縺ｩ縺薙〒</th></tr></thead><tbody>${SOURCES_DOC.map(r => `<tr>${r.map(x => `<td>${esc(x)}</td>`).join("")}</tr>`).join("")}</tbody></table></div><p class="small muted">縲窟ctions縲阪・ GitHub Actions・・ython・峨□縺代ゅヶ繝ｩ繧ｦ繧ｶ縺九ｉ縺ｯ CORS 縺ｮ驛ｽ蜷医〒 r.jina.ai・俊ss2json 邨檎罰縺ｫ縺ｪ繧九ゅ☆縺ｹ縺ｦ辟｡譁吶・API 繧ｭ繝ｼ縺ｪ縺励ゆｺｺ迚ｩ讀懃ｴ｢繝ｻ繧｢繧ｫ繧ｦ繝ｳ繝育音螳壹・繝昴・繝医せ繧ｭ繝｣繝ｳ縺ｯ陦後ｏ縺ｪ縺・・/p>`;
  $("#how-dorks").innerHTML = `<div class="tw"><table><thead><tr><th>蜷榊燕</th><th>蠑・/th></tr></thead><tbody>${Object.entries(DORKS).map(([k, [l, t]]) => `<tr><td>${l}</td><td class="mono">${esc(t)}</td></tr>`).join("")}<tr><td>繝峨Γ繧､繝ｳ蜷代￠</td><td class="mono">site:{domain} (filetype:pdf OR filetype:docx OR filetype:xlsx) ・・"{domain}" -site:{domain} ・・site:*.{domain}</td></tr></tbody></table></div><p class="small muted">DuckDuckGo 縺ｯ諡ｬ蠑ｧ縺ｨ after:/before: 繧定ｧ｣驥医＠縺ｪ縺・・縺ｧ騾√ｋ蜑阪↓螟悶☆縲・oogle 蝗ｺ譛峨・貍皮ｮ怜ｭ舌・菴ｿ繧上↑縺・・/p>`;
  ML.isStored("ruri-v3-30m").then(a => ML.isStored("nli-ja-30m").then(b => $("#how-models").textContent = `遶ｯ譛ｫ蜀・ｼ壼沂繧∬ｾｼ縺ｿ ${a ? "菫晏ｭ俶ｸ医∩" : "譛ｪ蜿門ｾ・}繝ｻ蜷ｫ諢・${b ? "菫晏ｭ俶ｸ医∩" : "譛ｪ蜿門ｾ・}`));
}
function setPath(o, p, v) { const ks = p.split("."); let x = o; for (const k of ks.slice(0, -1)) x = x[k]; x[ks.at(-1)] = v; }

/* ---------- 險ｭ螳・---------- */
function watch() { try { return JSON.parse(localStorage.getItem("mbo.watch") || '{"topics":[],"claims":[],"domains":[]}'); } catch { return { topics: [], claims: [], domains: [] }; } }
function addWatch(kind, v) { const w = watch(); if (v && !w[kind].includes(v)) w[kind].push(v); localStorage.setItem("mbo.watch", JSON.stringify(w)); renderSettings(); }
function yaml() { const w = watch(); const q = s => `"${String(s).replace(/"/g, '\\"')}"`; return `# 閾ｪ蜍募庶髮・・蟇ｾ雎｡・医％縺ｮ繧ｵ繧､繝医・縲瑚ｨｭ螳壹阪〒逕滓・・噂ntopics:\n${w.topics.map(t => `  - topic: ${q(t)}`).join("\n") || "  []"}\n\nclaims:\n${w.claims.map(c => `  - ${q(c)}`).join("\n") || "  []"}\n\ndomains:\n${w.domains.map(d => `  - ${q(d)}`).join("\n") || "  []"}\n`; }
async function renderSettings() {
  $("#st-yaml").textContent = yaml();
  [["topic", "topics"], ["claim", "claims"], ["domain", "domains"]].forEach(([id, k]) => $(`#st-${id}-add`).onclick = () => { addWatch(k, $(`#st-${id}`).value.trim()); $(`#st-${id}`).value = ""; });
  $("#st-copy").onclick = () => navigator.clipboard.writeText(yaml()); $("#st-dl").onclick = () => dl("watch.yaml", yaml()); $("#st-clear").onclick = () => { localStorage.removeItem("mbo.watch"); renderSettings(); };
  $("#st-emb").value = ML.modelName("embed"); $("#st-nli").value = ML.modelName("nli"); $("#st-model-save").onclick = () => { ML.setModelName("embed", $("#st-emb").value.trim()); ML.setModelName("nli", $("#st-nli").value.trim()); state.emb = state.nli = null; $("#st-mmsg").textContent = "菫晏ｭ假ｼ域ｬ｡縺ｮ蛻､螳壹°繧我ｽｿ逕ｨ・・; };
  $("#st-hf").value = ML.hfRepo(); $("#st-hf-save").onclick = () => { ML.setHfRepo($("#st-hf").value.trim()); $("#st-mmsg").textContent = "菫晏ｭ・; };
  const a = await ML.isStored("ruri-v3-30m"), b = await ML.isStored("nli-ja-30m"); const bytes = await ML.storedBytes();
  $("#st-models").innerHTML = `<div class="kv"><span>蝓九ａ霎ｼ縺ｿ ruri-v3-30m</span><span>${a ? "遶ｯ譛ｫ蜀・↓菫晏ｭ俶ｸ医∩" : "譛ｪ蜿門ｾ暦ｼ亥・蝗槭・蛻､螳壽凾縺ｫ閾ｪ蜍輔ム繧ｦ繝ｳ繝ｭ繝ｼ繝峨・7 MB・・}</span><span>蜷ｫ諢・nli-ja-30m</span><span>${b ? "遶ｯ譛ｫ蜀・↓菫晏ｭ俶ｸ医∩" : "譛ｪ蜿門ｾ暦ｼ・7 MB・・}</span><span>菴ｿ逕ｨ螳ｹ驥・/span><span>${(bytes / 1e6).toFixed(1)} MB</span></div>`;
  $("#st-load").onclick = async () => { try { await models(m => $("#st-mmsg").textContent = m); $("#st-mmsg").textContent = "螳御ｺ・; renderSettings(); } catch (e) { $("#st-mmsg").textContent = "螟ｱ謨・ " + e.message; } };
  $("#st-del").onclick = async () => { await ML.removeStored("ruri-v3-30m"); await ML.removeStored("nli-ja-30m"); state.emb = state.nli = null; renderSettings(); };
  $("#st-links").innerHTML = `<a href="https://github.com/${REPO}/actions/workflows/collect.yml" target="_blank" rel="noopener">Actions 竊・collect</a> 繝ｻ <a href="https://github.com/${REPO}/edit/main/watch.yaml" target="_blank" rel="noopener">watch.yaml 繧堤ｷｨ髮・/a> 繝ｻ <a href="https://github.com/${REPO}" target="_blank" rel="noopener">繝ｪ繝昴ず繝医Μ</a>`;
}

/* ---------- 襍ｷ蜍・---------- */
(async () => {
  $("#ver").textContent = VERSION; await J.loadParams(); await loadData();
  const t = location.hash.slice(1); if (t && $(`nav button[data-t="${t}"]`)) show(t);
  const u = new URLSearchParams(location.search); if (u.get("q")) { $("#lv-q").value = u.get("q"); show("live"); runLive(); }
  if (u.get("url") || u.get("text")) { $("#lv-q").value = u.get("url") || u.get("text"); show("live"); runLive(); }
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => { });
  const net = () => $("#net").textContent = navigator.onLine ? "" : "繧ｪ繝輔Λ繧､繝ｳ・井ｿ晏ｭ俶ｸ医∩繝・・繧ｿ縺ｨ繝｢繝・Ν縺ｧ蜍穂ｽ懶ｼ・; addEventListener("online", net); addEventListener("offline", net); net();
})();
