/* 信頼性スコア・主張検証・クラスタ（mbo/judge.py の JS 版。式もパラメータ params.json も同じ）。*/
import { hostOf, registrable, splitPassages } from "./net.js";
import { zeroShot, dot } from "./ml.js";

export let P = null;
export async function loadParams() { try { const s = localStorage.getItem("mbo.params"); if (s) { P = JSON.parse(s); return P; } } catch { } P = await (await fetch(new URL("./params.json", import.meta.url))).json(); return P; }
export function setParams(p, persist = true) { P = p; if (persist) try { localStorage.setItem("mbo.params", JSON.stringify(p)); } catch { } }
export function resetParams() { try { localStorage.removeItem("mbo.params"); } catch { } }

const NEWS = ["nhk.or.jp", "nikkei.com", "asahi.com", "yomiuri.co.jp", "mainichi.jp", "sankei.com", "jiji.com", "kyodo.co.jp", "47news.jp", "tokyo-np.jp", "chunichi.co.jp", "reuters.com", "bloomberg.co.jp", "bbc.com", "afpbb.com", "nikkansports.com", "itmedia.co.jp", "impress.co.jp", "cnn.co.jp", "newsweekjapan.jp", "toyokeizai.net", "diamond.jp", "prtimes.jp", "kyodonews.jp", "sponichi.co.jp", "hochi.news", "fnn.jp", "news.tv-asahi.co.jp", "tbs.co.jp", "ntv.co.jp", "japantimes.co.jp"];
const WIKI = ["wikipedia.org", "wikinews.org", "wikidata.org"], ACAD = ["jstage.jst.go.jp", "cir.nii.ac.jp", "doi.org", "arxiv.org", "pubmed.ncbi.nlm.nih.gov", "researchmap.jp", "nature.com", "science.org"];
const SNS = ["x.com", "twitter.com", "bsky.app", "mstdn.jp", "fedibird.com", "reddit.com", "5ch.net", "2ch.sc", "facebook.com", "instagram.com", "threads.net", "tiktok.com", "youtube.com", "nicovideo.jp", "girlschannel.net", "chiebukuro.yahoo.co.jp"];
const BLOG = ["note.com", "hatenablog.com", "hatenablog.jp", "ameblo.jp", "fc2.com", "livedoor.jp", "blog.jp", "seesaa.net", "exblog.jp", "medium.com", "wordpress.com", "blogspot.com", "goo.ne.jp", "togetter.com"];
const ends = (h, list) => list.some(n => h === n || h.endsWith("." + n));
export function domainClass(host) {
  const h = (host || "").replace(/^www\./, "");
  if (ends(h, NEWS)) return "news"; if (/\.(go\.jp|lg\.jp|gov|gov\.uk)$|\.europa\.eu$|\.un\.org$|\.who\.int$/.test(h) || /(^|\.)(pref|city|town|vill|metro)\.[\w-]+(\.[\w-]+)?\.jp$/.test(h)) return "gov"; if (/\.(ac\.jp|ed\.jp|edu)$/.test(h)) return "edu";
  if (ends(h, WIKI)) return "wiki"; if (ends(h, ACAD)) return "academic"; if (ends(h, SNS)) return "sns"; if (ends(h, BLOG)) return "blog"; if (/\.(or\.jp|org|gr\.jp)$/.test(h)) return "org"; if (/\.(co\.jp|jp|com|net)$/.test(h)) return "corp"; return "other";
}
export const CLASS_LABEL = { gov: "公的機関", edu: "教育・研究機関", news: "報道", academic: "学術", wiki: "百科事典", org: "団体", corp: "企業・一般", other: "その他", blog: "ブログ", sns: "SNS・掲示板" };
const clamp = (x, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));

export function sourceScore(it, dom = {}) {
  const host = hostOf(it.url), cls = host === "news.google.com" ? "news" : domainClass(host); let s = P.source_class[cls] ?? 0.45; const b = P.source_bonus; const why = [`種別 ${CLASS_LABEL[cls]} → ${s.toFixed(2)}`];
  if (/^https:/.test(it.url)) { s += b.https; why.push("HTTPS"); }
  const age = dom?.wayback?.age_days; if (age != null) { if (age > 365 * 5) { s += b.age_5y; why.push(`ドメイン ${Math.floor(age / 365)} 年`); } else if (age > 365) { s += b.age_1y; why.push(`ドメイン ${Math.floor(age / 365)} 年`); } else if (age < 90) { s += b.age_lt_90d; why.push(`ドメイン ${age} 日（新しい）`); } }
  const wc = dom?.wiki_cites; if (typeof wc === "number") { if (wc >= 50) { s += b.wiki_cites_50; why.push(`Wikipedia 出典 ${wc} 件`); } else if (wc >= 5) { s += b.wiki_cites_5; why.push(`Wikipedia 出典 ${wc} 件`); } }
  if (it.author) { s += b.author; why.push("著者あり"); } if (it.published) { s += b.date; why.push("日付あり"); }
  return { s: clamp(s), cls, why };
}
export function specificity(text) {
  const t = text || "", c = P.content.specificity_targets;
  const n = { numbers: (t.match(/\d+(?:[.,]\d+)?\s*(?:%|人|件|円|km|m|℃|kg|年|月|日|時|分|回|倍|万|億)/g) || []).length, dates: (t.match(/\d{4}年|\d{1,2}月\d{1,2}日|\d{4}-\d{2}-\d{2}/g) || []).length, quotes: (t.match(/「[^」]{4,}」|によると|と述べ|と発表/g) || []).length, proper: new Set(t.match(/[一-龥]{2,}(?:省|庁|大学|市|県|町|村|社|協会|研究所|委員会|病院|署|局)/g) || []).size };
  return { s: clamp(Object.keys(c).reduce((a, k) => a + Math.min(n[k] / c[k], 1), 0) / Object.keys(c).length), n };
}
export async function contentScores(items, emb) {
  const texts = items.map(it => (it.title || "") + "。" + ((it.text || it.snippet || "").slice(0, 600)));
  const zs = items.length ? await zeroShot(texts, P.content.zero_shot_labels, emb) : [];
  items.forEach((it, i) => { const body = it.text || it.snippet || ""; const len = clamp(body.length / P.content.min_chars_full); const sp = specificity(body); const style = Object.entries(zs[i]).reduce((a, [k, v]) => a + (P.content.zero_shot_weight[k] || 0) * v, 0); it.style = zs[i]; it.specificity = sp.n; it.s_content = +clamp(0.35 * len + 0.4 * sp.s + 0.25 + style).toFixed(3); });
}
const PROP = /(です|ます|でした|ました|した|する|される|された|れた|られた|である|だった|ている|ていた|ない|なった|なる|ある|いる|発表|発生|決定|開始|開催|予定|判明|確認|見込み|とみられ|という)[。．!！?？」]?$/;
export const isProp = s => { s = (s || "").trim(); return !!s && PROP.test(s) && !/^(グローバル|本文へ|メニュー|ナビ|ホーム|トップ|\||・|\d+\.)/.test(s); };
export const keyClaim = it => { const t = (it.title || "").trim().replace(/\s*[-|｜].{0,30}$/, ""); const lead = (it.text || it.snippet || "").trim().split(/(?<=[。．！？!?])|\n+/).map(s => s.trim()).find(s => s.length >= 15 && s.length <= 200 && isProp(s)) || ""; return lead || (isProp(t) ? t.slice(0, 120) : ""); };
export function buildPassages(items) { const out = []; for (const it of items) { const dom = hostOf(it.url); const txt = it.text || it.snippet || ""; const ps = splitPassages(txt).slice(0, 12); for (const p of (ps.length ? ps : (txt.length >= 20 ? [txt] : []))) out.push({ text: p, url: it.url, domain: dom, s_source: it.s_source ?? 0.5, published: it.published }); } return out; }
export async function corroborate(items, passages, emb, nli, onStep = () => { }) {
  const C = P.corroboration; if (!items.length || !passages.length) { for (const it of items) { it.s_corr = 0; it.corr = { support: 0, contra: 0, evidence: [] }; } return; }
  const claims = items.map(keyClaim); onStep("要旨を埋め込み中"); const Q = await emb.encode(claims.map(c => c || "。"), "query"); const D = await emb.encode(passages.map(p => p.text), "doc");
  const pairs = [];
  items.forEach((it, i) => { if (!claims[i]) return; const dom = hostOf(it.url); const sims = D.map((d, j) => [dot(Q[i], d), j]).sort((a, b) => b[0] - a[0]).slice(0, C.top_k); for (const [s, j] of sims) { if (s < C.min_sim || passages[j].domain === dom) continue; pairs.push({ i, j, sim: s }); } });
  if (pairs.length > (C.max_pairs || 600)) { pairs.sort((a, b) => b.sim - a.sim); pairs.length = C.max_pairs || 600; }
  onStep(`含意判定 ${pairs.length} 組`); const pr = pairs.length ? await nli.predict(pairs.map(p => passages[p.j].text), pairs.map(p => claims[p.i])) : [];
  const acc = items.map(() => ({ support: 0, contra: 0, evidence: [], doms: new Set() }));
  const alpha = C.topical_alpha ?? 0.5;
  pairs.forEach((p, k) => { const [e, n, c] = pr[k]; const w = passages[p.j].s_source ?? 0.5; const a = acc[p.i]; const rel = (p.sim - C.min_sim) / Math.max(1e-6, 1 - C.min_sim); if (e >= C.entail_min) { a.support += w * e; a.doms.add(passages[p.j].domain); a.evidence.push({ url: passages[p.j].url, text: passages[p.j].text.slice(0, 200), p: +e.toFixed(3), kind: "support", sim: +p.sim.toFixed(3) }); } else if (c < C.contra_min) { a.support += w * alpha * rel * n; a.doms.add(passages[p.j].domain); if (rel > 0.5) a.evidence.push({ url: passages[p.j].url, text: passages[p.j].text.slice(0, 200), p: +n.toFixed(3), kind: "related", sim: +p.sim.toFixed(3) }); } if (c >= C.contra_min) { a.contra += w * c; a.evidence.push({ url: passages[p.j].url, text: passages[p.j].text.slice(0, 200), p: +c.toFixed(3), kind: "contra", sim: +p.sim.toFixed(3) }); } });
  items.forEach((it, i) => { const a = acc[i]; const sup = 1 - Math.exp(-a.support / C.saturation), con = 1 - Math.exp(-a.contra / C.saturation); it.s_corr = +clamp(0.15 + 0.85 * sup - 0.6 * con).toFixed(3); a.evidence.sort((x, y) => y.p - x.p); it.corr = { support: +a.support.toFixed(2), contra: +a.contra.toFixed(2), domains: [...a.doms].sort(), evidence: a.evidence.slice(0, 6) }; it.claim = claims[i]; });
}
export function timeScore(it) { const d = it.published; if (!d) return P.time.undated; const dt = new Date(d.slice(0, 10)); if (isNaN(dt)) return P.time.undated; const days = Math.max(0, (Date.now() - dt) / 864e5); return clamp(Math.pow(0.5, days / P.time.half_life_days) * 0.8 + 0.2); }
export const grade = r => r >= 75 ? "A" : r >= 60 ? "B" : r >= 45 ? "C" : "D";
export async function scoreItems(items, domInfos, emb, nli, onStep = () => { }) {
  for (const it of items) { const { s, cls, why } = sourceScore(it, domInfos?.[hostOf(it.url)]); it.s_source = +s.toFixed(3); it.source_class = cls; it.source_why = why; }
  onStep("内容を評価中"); await contentScores(items, emb);
  const passages = buildPassages(items); await corroborate(items, passages, emb, nli, onStep);
  const W = P.weights;
  for (const it of items) { it.s_time = +timeScore(it).toFixed(3); it.reliability = Math.round(100 * clamp(W.source * it.s_source + W.content * it.s_content + W.corroboration * it.s_corr + W.time * it.s_time)); it.grade = grade(it.reliability); }
  return items;
}
export async function verify(claim, items, emb, nli, onStep = () => { }) {
  const V = P.verify; const passages = buildPassages(items); if (!passages.length) return { claim, verdict: "insufficient", support: 0, refute: 0, evidence: [], n_passages: 0 };
  onStep("段落を埋め込み中"); const q = (await emb.encode([claim], "query"))[0]; const D = await emb.encode(passages.map(p => p.text), "doc");
  const sims = D.map(d => dot(q, d)); const idx = sims.map((s, i) => i).sort((a, b) => sims[b] - sims[a]).slice(0, V.top_k).filter(i => sims[i] >= V.min_sim);
  if (!idx.length) return { claim, verdict: "insufficient", support: 0, refute: 0, evidence: [], n_passages: passages.length };
  onStep(`含意判定 ${idx.length} 段落`); const pr = await nli.predict(idx.map(i => passages[i].text), idx.map(() => claim));
  let sup = 0, ref = 0; const ds = new Set(), dr = new Set(); const ev = [];
  idx.forEach((i, k) => { const [e, n, c] = pr[k]; const w = passages[i].s_source ?? 0.5; const kind = e >= V.support_min ? "support" : c >= V.refute_min ? "refute" : "neutral"; if (kind === "support") { sup += w * e; ds.add(passages[i].domain); } if (kind === "refute") { ref += w * c; dr.add(passages[i].domain); } ev.push({ url: passages[i].url, domain: passages[i].domain, text: passages[i].text.slice(0, 240), sim: +sims[i].toFixed(3), entail: +e.toFixed(3), neutral: +n.toFixed(3), contra: +c.toFixed(3), kind, published: passages[i].published }); });
  const T = V.verdict; const verdict = (sup >= T.supported && ref < sup * T.mixed_ratio) ? "supported" : (ref >= T.refuted && sup < ref * T.mixed_ratio) ? "refuted" : (sup + ref >= 1.0) ? "mixed" : "insufficient";
  ev.sort((a, b) => (b.kind === "neutral" ? 0 : Math.max(b.entail, b.contra)) - (a.kind === "neutral" ? 0 : Math.max(a.entail, a.contra)));
  return { claim, verdict, support: +sup.toFixed(2), refute: +ref.toFixed(2), support_domains: [...ds].sort(), refute_domains: [...dr].sort(), evidence: ev.slice(0, 12), n_passages: passages.length };
}
export async function cluster(items, emb) {
  if (!items.length) return []; const X = await emb.encode(items.map(it => (it.title || "") + " " + (it.snippet || "").slice(0, 200)), "topic"); const th = P.cluster.threshold; const lab = new Array(items.length).fill(-1); let c = 0;
  for (let i = 0; i < items.length; i++) { if (lab[i] >= 0) continue; lab[i] = c; for (let j = i + 1; j < items.length; j++) if (lab[j] < 0 && dot(X[i], X[j]) >= th) lab[j] = c; c++; }
  const g = {}; items.forEach((it, i) => { it.cluster = lab[i]; (g[lab[i]] ||= []).push(it); });
  return Object.entries(g).map(([id, arr]) => { arr.sort((a, b) => (a.published || "9999").localeCompare(b.published || "9999")); return { id: +id, size: arr.length, domains: [...new Set(arr.map(x => hostOf(x.url)))].sort(), first: arr[0].published, first_url: arr[0].url, title: arr.reduce((b, x) => (x.reliability || 0) > (b.reliability || 0) ? x : b, arr[0]).title, reliability: Math.round(arr.reduce((s, x) => s + (x.reliability || 0), 0) / arr.length) }; }).sort((a, b) => b.size - a.size);
}
export const VERDICT = { supported: ["支持される", "ok"], refuted: ["否定される", "bad"], mixed: ["食い違いあり", "warn"], insufficient: ["根拠不足", "muted"] };
