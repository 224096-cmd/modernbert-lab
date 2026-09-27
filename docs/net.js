/* ブラウザからの収集（無料・鍵なし）。CORS が無いサイトは r.jina.ai リーダー経由（Python 側と同じ経路）。
   すべて失敗しても例外を投げず空配列を返す。*/
const JINA = "https://r.jina.ai/";
const RSS2JSON = "https://api.rss2json.com/v1/api.json?rss_url=";
export const LOG = [];
let last = 0;
async function gap(ms = 900) { const d = last + ms - Date.now(); if (d > 0) await new Promise(r => setTimeout(r, d)); last = Date.now(); }
async function jget(url, { timeout = 30000, text = false, headers = {} } = {}) {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), timeout); const t0 = Date.now();
  try { const r = await fetch(url, { signal: c.signal, headers }); LOG.push({ url: url.slice(0, 120), status: r.status, ms: Date.now() - t0 }); if (!r.ok) return null; return text ? await r.text() : await r.json(); }
  catch (e) { LOG.push({ url: url.slice(0, 120), status: 0, err: String(e).slice(0, 80), ms: Date.now() - t0 }); return null; } finally { clearTimeout(t); }
}
export async function jina(url, timeout = 40000) { await gap(1200); return jget(JINA + url, { timeout, text: true, headers: { "Accept": "text/plain" } }); }
const clean = s => (s || "").replace(/<[^>]+>/g, "").replace(/\*\*/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, " ").trim();
const unwrapDdg = u => { const m = /[?&]uddg=([^&]+)/.exec(u); return m ? decodeURIComponent(m[1]) : u; };
const item = (url, title, snippet, engine, query, rank, published = null) => ({ url: normUrl(url), title: clean(title).slice(0, 200), snippet: clean(snippet).slice(0, 400), engine, query, rank, published });
export const normUrl = u => (u || "").replace(/#.*$/, "").replace(/[?&](utm_[a-z]+|fbclid|gclid|ref|si)=[^&]*/g, "").replace(/\?$/, "");

/* --- 検索エンジン --- */
export const ENGINES = {
  ddg: { label: "DuckDuckGo", note: "lite 版を r.jina.ai 経由で", async search(q, n = 10) {
    const md = await jina(`https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(q)}&kl=jp-jp`); if (!md) return [];
    const out = []; const re = /^\s*(\d+)\.\[(.*?)\]\((https?:\/\/[^)]+)\)\n(.*?)\n(\S+)\s*$/gm; let m;
    while ((m = re.exec(md)) && out.length < n) out.push(item(unwrapDdg(m[3]), m[2], m[4], "ddg", q, +m[1]));
    return out; } },
  bing: { label: "Bing", note: "r.jina.ai 経由", async search(q, n = 10) {
    const md = await jina(`https://www.bing.com/search?q=${encodeURIComponent(q)}&setlang=ja&cc=jp`); if (!md) return [];
    const out = []; const re = /^#+\s*\[(.*?)\]\((https?:\/\/[^)]+)\)\n+([\s\S]*?)(?=\n#+ |\n*$)/gm; let m;
    while ((m = re.exec(md)) && out.length < n) { let u = m[2]; const b = /[?&]u=a1([A-Za-z0-9_\-]+)/.exec(u); if (b) { try { u = atob(b[1].replace(/-/g, "+").replace(/_/g, "/")); } catch { } } if (/bing\.com|microsoft\.com/.test(u)) continue; out.push(item(u, m[1], m[3].slice(0, 300), "bing", q, out.length + 1)); }
    return out; } },
  gnews: { label: "Google ニュース", note: "RSS（rss2json 経由）", async search(q, n = 15) {
    const d = await jget(RSS2JSON + encodeURIComponent(`https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=ja&gl=JP&ceid=JP:ja`)); if (!d?.items) return [];
    return d.items.slice(0, n).map((it, i) => ({ ...item(it.link, it.title, "", "gnews", q, i + 1, (it.pubDate || "").slice(0, 10)), site: (it.title || "").split(" - ").pop() })); } },
  wiki: { label: "Wikipedia", note: "検索 API（CORS 可）", async search(q, n = 5) {
    const d = await jget(`https://ja.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&srlimit=${n}&format=json&utf8=1&origin=*`);
    return (d?.query?.search || []).map((r, i) => item(`https://ja.wikipedia.org/wiki/${encodeURIComponent(r.title)}`, r.title, r.snippet, "wiki", q, i + 1, (r.timestamp || "").slice(0, 10))); } },
  hatena: { label: "はてなブックマーク", note: "検索 RSS（rss2json 経由）", async search(q, n = 10) {
    const d = await jget(RSS2JSON + encodeURIComponent(`https://b.hatena.ne.jp/search/text?q=${encodeURIComponent(q)}&mode=rss&sort=recent`)); if (!d?.items) return [];
    return d.items.slice(0, n).map((it, i) => ({ ...item(it.link, it.title, it.description, "hatena", q, i + 1, (it.pubDate || "").slice(0, 10)) })); } },
  yahoo: { label: "Yahoo! JAPAN", note: "r.jina.ai 経由（ブラウザからは不安定）", async search(q, n = 10) {
    const md = await jina(`https://search.yahoo.co.jp/search?p=${encodeURIComponent(q)}`); if (!md) return [];
    const out = []; const re = /\[(.{5,120}?)\]\((https?:\/\/(?!(?:search|rd\.listing|www)\.yahoo)[^)]+)\)/g; let m; const seen = new Set();
    while ((m = re.exec(md)) && out.length < n) { const u = m[2]; if (seen.has(u) || /yahoo\.co\.jp/.test(u)) continue; seen.add(u); out.push(item(u, m[1], "", "yahoo", q, out.length + 1)); }
    return out; } },
};
export async function search(q, engines, n = 10) {
  const seen = new Map();
  for (const e of engines) { if (!ENGINES[e]) continue; let rs = []; try { rs = await ENGINES[e].search(q, n); } catch { } for (const r of rs) { if (!/^https?:/.test(r.url)) continue; const k = r.url; if (seen.has(k)) { const x = seen.get(k); x.engines.push(e); if (!x.snippet && r.snippet) x.snippet = r.snippet; if (!x.published && r.published) x.published = r.published; } else seen.set(k, { ...r, engines: [e] }); } }
  return [...seen.values()];
}

/* --- ページ本文 --- */
export async function readPage(url) {
  const md = await jina(url); if (!md) return null;
  const title = /^Title:\s*(.*)$/m.exec(md)?.[1]?.trim() || "";
  const finalUrl = /^URL Source:\s*(\S+)/m.exec(md)?.[1] || url;
  const body = md.split(/^Markdown Content:\s*$/m)[1] || md;
  return { url, finalUrl, title, text: mdToText(body).slice(0, 12000), via: "jina" };
}
export const mdToText = md => md.replace(/\[!\[[^\]]*\]\([^)]*\)\]\([^)]*\)/g, "").replace(/!\[[^\]]*\]\([^)]*\)/g, "").replace(/\[!\[[^\n]*/g, "").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/^\s*[-*|#>]+\s*/gm, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
export function splitPassages(text, max = 280) {
  const t = (text || "").replace(/\s+/g, " ").trim(); const out = []; let cur = "";
  for (const s of t.split(/(?<=[。．！？!?])\s*/)) { if (!s) continue; if (cur.length + s.length > max && cur) { out.push(cur); cur = s; } else cur += s; }
  if (cur) out.push(cur); return out.filter(p => p.length >= 20);
}

/* --- ドメイン調査（CORS のある API を直接、無いものは r.jina.ai 経由） --- */
export const hostOf = u => { try { return new URL(/^https?:/.test(u) ? u : "http://" + u).hostname.toLowerCase(); } catch { return (u || "").toLowerCase(); } };
export const registrable = h => { const p = h.split("."); if (p.length >= 3 && /^(co|or|ne|ac|ad|ed|go|gr|lg|com|net|org|gov|edu)$/.test(p[p.length - 2]) && p[p.length - 1].length === 2) return p.slice(-3).join("."); return p.slice(-2).join("."); };
export async function dns(host) { const out = {}; for (const t of ["A", "AAAA", "MX", "NS", "TXT"]) { const d = await jget(`https://dns.google/resolve?name=${host}&type=${t}`, { timeout: 10000 }); out[t] = (d?.Answer || []).filter(a => [1, 28, 15, 2, 16].includes(a.type)).map(a => a.data); } return out; }
export async function rdap(dom) {
  const d = await jget(`https://rdap.org/domain/${dom}`, { timeout: 15000 });
  if (d?.objectClassName === "domain") { const ev = Object.fromEntries((d.events || []).map(e => [e.eventAction, e.eventDate])); let reg = null; for (const en of d.entities || []) if ((en.roles || []).includes("registrar")) for (const v of (en.vcardArray?.[1] || [])) if (v[0] === "fn") reg = v[3]; return { source: "rdap", registered: ev.registration, expires: ev.expiration, updated: ev["last changed"], registrar: reg, status: d.status, nameservers: (d.nameservers || []).map(n => n.ldhName) }; }
  if (dom.endsWith(".jp")) { const md = await jina(`https://whois.jprs.jp/?key=${encodeURIComponent(dom)}&type=DOM`); if (md) { const g = k => (new RegExp(`\\[${k}\\][ \\t]*([^\\n]+)`).exec(md)?.[1] || "").trim() || null; return { source: "jprs", registered: g("登録年月日") || g("Registered Date") || g("接続年月日") || g("Connected Date"), updated: g("最終更新") || g("Last Update"), registrant: g("Registrant") || g("組織名") || g("Organization"), status: g("状態") || g("State"), nameservers: [...md.matchAll(/\[(?:Name Server|ネームサーバ)\][ \t]*(\S+)/g)].map(m => m[1].replace(/\[([^\]]+)\]\(.*?\)/, "$1")) }; } }
  return { source: null };
}
export async function wayback(host) {
  const out = {}; const a = await jget(`https://archive.org/wayback/available?url=${host}&timestamp=19960101`, { timeout: 15000 }); const c = a?.archived_snapshots?.closest; if (c?.timestamp) { out.first = c.timestamp.slice(0, 8); out.first_url = c.url; }
  const b = await jget(`https://archive.org/wayback/available?url=${host}`, { timeout: 15000 }); const c2 = b?.archived_snapshots?.closest; if (c2?.timestamp) { out.last = c2.timestamp.slice(0, 8); out.last_url = c2.url; }
  if (out.first) out.age_days = Math.floor((Date.now() - new Date(`${out.first.slice(0, 4)}-${out.first.slice(4, 6)}-${out.first.slice(6, 8)}`)) / 864e5);
  return out;
}
export async function wikiCites(dom) { let n = 0, ok = false; for (const p of ["https", "http"]) { const d = await jget(`https://ja.wikipedia.org/w/api.php?action=query&list=exturlusage&euquery=${dom}&euprotocol=${p}&eulimit=500&format=json&eunamespace=0&origin=*`, { timeout: 15000 }); if (d) { ok = true; n += (d.query?.exturlusage || []).length; } } return ok ? n : null; }
export async function crtsh(dom) { const t = await jina(`https://crt.sh/?q=%25.${dom}&output=json`); if (!t) return []; let arr = []; try { arr = JSON.parse(t.slice(t.indexOf("["))); } catch { const m = /\[[\s\S]*\]/.exec(t); try { arr = JSON.parse(m?.[0] || "[]"); } catch { } } const s = new Set(); for (const r of arr) for (const nm of String(r.name_value || "").split("\n")) { const x = nm.trim().toLowerCase(); if (x && !x.startsWith("*") && x.endsWith(dom)) s.add(x); } return [...s].sort().slice(0, 50); }
export async function hackertarget(dom) { const out = {}; let t = await jget(`https://api.hackertarget.com/hostsearch/?q=${dom}`, { text: true, timeout: 15000 }); if (t == null) t = await jina(`https://api.hackertarget.com/hostsearch/?q=${dom}`); out.hosts = (t || "").split("\n").filter(l => l.includes(",") && !/error/i.test(l)).map(l => l.split(",")[0]).slice(0, 50); let g = await jget(`https://api.hackertarget.com/geoip/?q=${dom}`, { text: true, timeout: 15000 }); if (g == null) g = await jina(`https://api.hackertarget.com/geoip/?q=${dom}`); if (g && !/error/i.test(g)) out.geoip = Object.fromEntries([...g.matchAll(/(\w+): ([^\n]+)/g)].map(m => [m[1], m[2].trim()])); return out; }
export async function urlscan(dom, n = 5) { const d = await jget(`https://urlscan.io/api/v1/search/?q=domain:${dom}&size=${n}`, { timeout: 15000 }); return (d?.results || []).map(r => ({ url: r.page?.url, time: r.task?.time, ip: r.page?.ip, server: r.page?.server, result: r.result })); }
export async function profile(target, onStep = () => { }) {
  const host = hostOf(target), bare = host.replace(/^www\./, ""), dom = registrable(bare); const out = { host, domain: dom, checked: new Date().toISOString() };
  const steps = { dns: () => dns(host), rdap: () => rdap(dom), wayback: () => wayback(bare), wiki_cites: () => wikiCites(dom), crtsh: () => crtsh(dom), hackertarget: () => hackertarget(dom), urlscan: () => urlscan(dom) };
  for (const [k, f] of Object.entries(steps)) { onStep(k); try { out[k] = await f(); } catch (e) { out[k] = { error: String(e).slice(0, 100) }; } }
  return out;
}
