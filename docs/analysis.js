/* 検証・ギャップ・構造化の分析（ブラウザ内）。入力は「コーパス」= docs [{id,url,title,text,published,source_class,s_source}] */
import { hostOf, splitPassages } from "./net.js";
import { dot, zeroShot } from "./ml.js";
import { domainClass, isProp, P } from "./judge.js";

const clamp = (x, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));
export const sentences = t => (t || "").replace(/\s+/g, " ").split(/(?<=[。．！？!?])\s*/).map(s => s.trim()).filter(s => s.length >= 8);
/* ナビ・広告・定型のノイズ段落を除く（本文抽出の取りこぼし対策） */
export const isNoise = t => /こちら|おすすめ|関連キーワード|関連記事|Copyright|©|TEL|FAX|受付時間|メニュー|ログイン|会員登録|\[PR\]|広告|シェア|ツイート|速報ニュース|読み込み中|Cookie/.test(t) || (t.match(/[#|｜»›→]/g) || []).length >= 3 || (t.match(/[ぁ-んァ-ヶ一-龥]/g) || []).length < t.length * 0.3;
export function passagesOf(docs, max = 12, maxChars = 280) { const out = []; for (const d of docs) { const ps = splitPassages(d.text || d.snippet || "", maxChars).filter(p => !isNoise(p)).slice(0, max); for (const p of ps) out.push({ text: p, doc: d }); } return out; }
export async function topK(query, passages, emb, k = 12, kind = "query") { if (!passages.length) return []; const q = (await emb.encode([query], kind))[0]; const D = await emb.encode(passages.map(p => p.text), "doc"); return passages.map((p, i) => ({ ...p, sim: dot(q, D[i]) })).sort((a, b) => b.sim - a.sim).slice(0, k); }

/* ---------- ① 矛盾・整合：ページ同士の整合マトリクス ---------- */
export async function consistencyMatrix(docs, emb, nli, onStep = () => { }) {
  const claims = docs.map(d => { const s = sentences(d.text || d.snippet).find(isProp); return s ? s.slice(0, 200) : ""; });
  const n = docs.length; const M = Array.from({ length: n }, () => Array(n).fill(null)); const pairs = [];
  const allP = passagesOf(docs, 10, 200); const D = allP.length ? await emb.encode(allP.map(p => p.text), "doc") : []; const Q = await emb.encode(claims.map(c => c || "。"), "query");
  for (let i = 0; i < n; i++) { if (!claims[i]) continue; for (let j = 0; j < n; j++) { if (i === j) continue; let best = -1, bi = -1; allP.forEach((p, k) => { if (p.doc !== docs[j]) return; const s = dot(Q[i], D[k]); if (s > best) { best = s; bi = k; } }); if (bi >= 0 && best >= P.corroboration.min_sim) pairs.push({ i, j, k: bi, sim: best }); } }
  onStep(`含意判定 ${pairs.length} 組`); const pr = await nli.predict(pairs.map(p => allP[p.k].text), pairs.map(p => claims[p.i]));
  pairs.forEach((p, x) => { const [e, ne, c] = pr[x]; M[p.i][p.j] = { e, n: ne, c, sim: p.sim, text: allP[p.k].text, kind: e >= 0.5 ? "agree" : c >= P.corroboration.contra_min ? "contra" : "unrelated" }; });
  const summary = docs.map((d, i) => { const row = M[i].filter(Boolean); return { agree: row.filter(x => x.kind === "agree").length, contra: row.filter(x => x.kind === "contra").length, unrelated: row.filter(x => x.kind === "unrelated").length, claim: claims[i] }; });
  return { claims, M, summary };
}

/* ---------- ② 偏り・客観性 ---------- */
const LEX = { emotive: /(衝撃|驚愕|絶対|必ず|最悪|最高|ヤバい|やばい|激怒|炎上|信じられない|許せない|断言|恐怖|危険すぎ|終わり|嘘|デマ|！{2,}|!!|拡散希望|閲覧注意|緊急)/g, hedge: /(と思う|と思われる|かもしれない|だろう|のではないか|気がする|個人的に|私は|筆者は|べきだ|べきである)/g, factual: /(によると|発表した|公表した|調査|統計|データ|報告書|資料|議事録|\d+(?:\.\d+)?(?:%|人|件|円|億|万))/g, ad: /(今すぐ|お申し込み|購入|限定|無料|キャンペーン|クリック|登録|お得|セール)/g };
export async function biasScore(docs, emb, nli, onStep = () => { }) {
  const texts = docs.map(d => ((d.title || "") + "。" + (d.text || d.snippet || "")).slice(0, 1500));
  onStep("文体（埋め込みゼロショット）"); const zs = await zeroShot(texts, { 客観: "客観的な事実やデータ、発表内容を淡々と報告する文章", 主観: "個人の意見・感想・推測を述べる文章", 感情: "怒りや不安をあおる感情的で断定的な文章", 宣伝: "商品やサービスの購入や登録を促す宣伝文" }, emb);
  onStep("含意モデルで客観性を判定"); const hyps = ["この文章は客観的な事実を報告している。", "この文章は書き手の意見や感想である。", "この文章は感情的に読者をあおっている。"];
  const pr = await nli.predict(texts.flatMap(t => hyps.map(() => t.slice(0, 1200))), texts.flatMap(() => hyps));
  return docs.map((d, i) => {
    const t = texts[i]; const len = Math.max(200, t.length); const cnt = k => (t.match(LEX[k]) || []).length / len * 1000;
    const nliP = hyps.map((_, j) => pr[i * 3 + j][0]); const z = zs[i];
    const nliW = /minilm|xnli|mdeberta/i.test(nli.name || "") ? 0.25 : 0.1; const obj = clamp((0.55 - nliW / 2) * z.客観 + nliW * (0.5 + (nliP[0] - nliP[2]) / 2) + (0.45 - nliW / 2) * clamp(1 - cnt("emotive") * 0.15 - cnt("hedge") * 0.05 - cnt("ad") * 0.1 + cnt("factual") * 0.05));
    return { id: d.id, url: d.url, title: d.title, objectivity: Math.round(obj * 100), style: z, nli: { fact: nliP[0], opinion: nliP[1], emotive: nliP[2] }, lex: { emotive: (t.match(LEX.emotive) || []).slice(0, 8), hedge: (t.match(LEX.hedge) || []).slice(0, 8), ad: (t.match(LEX.ad) || []).slice(0, 6) }, label: obj >= 0.65 ? "客観的" : obj >= 0.45 ? "混在" : "主観・感情が強い" };
  });
}

/* ---------- ③ 一次情報の判定 ---------- */
export async function primaryScore(docs, nli, onStep = () => { }) {
  onStep("一次／二次を判定"); const hyps = ["この文章は発表元・当事者による一次情報である。", "この文章は他の情報源を引用してまとめた二次情報である。"];
  const texts = docs.map(d => ((d.title || "") + "。" + (d.text || d.snippet || "")).slice(0, 1200));
  const pr = await nli.predict(texts.flatMap(t => hyps.map(() => t)), texts.flatMap(() => hyps));
  return docs.map((d, i) => {
    const t = texts[i]; const cls = d.source_class || domainClass(hostOf(d.url)); const why = [];
    let s = { gov: 0.85, edu: 0.75, academic: 0.8, news: 0.5, wiki: 0.3, org: 0.55, corp: 0.5, other: 0.4, blog: 0.25, sns: 0.2 }[cls] ?? 0.4; why.push(`出所 ${cls} → ${s.toFixed(2)}`);
    const sec = (t.match(/(によると|によれば|報じた|報道|まとめ|話題に|とのこと|引用|ソース：|出典：|ニュースサイト|SNS上で)/g) || []).length; const pri = (t.match(/(発表しました|公表しました|お知らせ|プレスリリース|当社|弊社|本学|当庁|当省|当市|当県|報道発表資料|announce)/g) || []).length;
    if (sec) { s -= Math.min(0.3, sec * 0.06); why.push(`引用・伝聞表現 ${sec}`); } if (pri) { s += Math.min(0.25, pri * 0.08); why.push(`発表元表現 ${pri}`); }
    const p1 = pr[i * 2][0], p2 = pr[i * 2 + 1][0]; const nliW = /minilm|xnli|mdeberta/i.test(nli.name || "") ? 0.35 : 0.15; s = clamp((1 - nliW) * s + nliW * clamp(0.5 + (p1 - p2) / 2)); why.push(`含意 一次 ${(p1 * 100) | 0}% / 二次 ${(p2 * 100) | 0}%`);
    return { id: d.id, url: d.url, title: d.title, primary: Math.round(s * 100), label: s >= 0.65 ? "一次情報" : s >= 0.45 ? "判断つかず" : "二次情報（引用・まとめ）", why };
  });
}

/* ---------- ④ 時間的矛盾 ---------- */
const ERA = { 令和: 2018, 平成: 1988, 昭和: 1925 };
export function extractDates(t) { const out = []; let m; const re = /(\d{4})年(?:(\d{1,2})月)?(?:(\d{1,2})日)?|(令和|平成|昭和)(\d{1,2}|元)年/g; while ((m = re.exec(t || ""))) { const y = m[1] ? +m[1] : ERA[m[4]] + (m[5] === "元" ? 1 : +m[5]); if (y > 1900 && y < 2100) out.push({ y, m: m[2] ? +m[2] : null, text: m[0], pos: m.index }); } return out; }
export function extractFigures(t) { const out = []; let m; const re = /([一-龥ぁ-んァ-ヶーA-Za-z]{2,12})(?:は|が|の|：|:)?\s*(約|およそ|最大|上限)?(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*(%|％|人|件|円|万円|億円|兆円|万人|億人|km|メートル|℃|倍|回|世帯|社|校|か所|箇所|トン)/g; while ((m = re.exec(t || ""))) { if (/^\d/.test(m[1]) || /^(令和|平成|昭和|西暦)/.test(m[1])) continue; out.push({ key: m[1], value: +m[3].replace(/,/g, ""), unit: m[4], text: m[0].trim(), pos: m.index }); } return out; }
export function temporalCheck(docs, now = new Date()) {
  const Y = now.getFullYear(); const perDoc = docs.map(d => { const t = d.text || d.snippet || ""; const dates = extractDates(t); const figs = extractFigures(t); const pub = d.published ? +d.published.slice(0, 4) : null; const warns = [];
    const latest = dates.length ? Math.max(...dates.map(x => x.y)) : null; const stale = /(現在|時点|最新|今年|今月|先月|昨年|来年)/.test(t);
    if (latest && Y - latest >= 3) warns.push(`本文中の最新の年が ${latest} 年（${Y - latest} 年前）${stale ? "。「現在」「時点」などの表現があり、古い情報を現在のことのように読める" : ""}`);
    if (pub && latest && latest > pub + 1) warns.push(`公開日（${pub} 年）より新しい年（${latest} 年）が本文にある（予定・推計か、更新された記事）`);
    if (!pub && !dates.length) warns.push("日付情報がなく、いつの情報か判断できない");
    return { id: d.id, url: d.url, title: d.title, published: d.published, dates: dates.slice(0, 12), figures: figs.slice(0, 20), warns }; });
  const conflicts = []; const keyed = {};
  perDoc.forEach((d, i) => d.figures.forEach(f => { const k = f.key.replace(/[のはが：:]/g, "") + "|" + f.unit; (keyed[k] ||= []).push({ i, ...f }); }));
  for (const [k, arr] of Object.entries(keyed)) { const vals = [...new Set(arr.map(a => a.value))]; const docsN = new Set(arr.map(a => a.i)).size; if (vals.length >= 2 && docsN >= 2) { const mx = Math.max(...vals), mn = Math.min(...vals); if (mn > 0 && mx / mn >= 1.05) conflicts.push({ key: k.split("|")[0], unit: k.split("|")[1], values: arr.map(a => ({ doc: docs[a.i].title || docs[a.i].url, url: docs[a.i].url, value: a.value, text: a.text, published: docs[a.i].published })) }); } }
  return { perDoc, conflicts: conflicts.slice(0, 30) };
}

/* ---------- ⑤ ナレッジギャップ ---------- */
export const QUESTION_TEMPLATES = [["誰が", "{t}に関わっている組織や人物は誰ですか？"], ["いつ", "{t}はいつからいつまでですか？"], ["どこで", "{t}はどこの地域・場所の話ですか？"], ["何が", "{t}で具体的に何が決まりましたか？"], ["なぜ", "{t}の理由や背景は何ですか？"], ["どのように", "{t}の手続きや仕組みはどのようなものですか？"], ["規模", "{t}の金額・人数・件数はどれくらいですか？"], ["根拠", "{t}の根拠となる調査やデータは何ですか？"], ["影響", "{t}は誰にどんな影響がありますか？"], ["反対・課題", "{t}の課題や問題点、反対意見は何ですか？"], ["今後", "{t}は今後どうなる予定ですか？"], ["公式見解", "{t}について公的機関や当事者は何と発表していますか？"]];
export async function knowledgeGaps(topic, docs, rr, emb, onStep = () => { }, threshold = 0.25, simThreshold = 0.91) {
  const ps = passagesOf(docs, 12, 240); if (!ps.length) return { questions: [], covered: 0 };
  onStep("段落を埋め込み中"); const D = await emb.encode(ps.map(p => p.text), "doc"); const out = [];
  for (const [label, tpl] of QUESTION_TEMPLATES) {
    const q = tpl.replace("{t}", topic); const qv = (await emb.encode([q], "query"))[0]; const cand = ps.map((p, i) => [dot(qv, D[i]), i]).sort((a, b) => b[0] - a[0]).slice(0, 6);
    onStep(`問い「${label}」を照合`); const sc = await rr.score(cand.map(() => q), cand.map(c => ps[c[1]].text));
    const scored = sc.map((s, k) => ({ s, sim: cand[k][0], p: ps[cand[k][1]] })); const best = scored.sort((a, b) => (b.s + 0.5 * b.sim) - (a.s + 0.5 * a.sim))[0];
    const answered = best.s >= threshold || best.sim >= simThreshold;
    out.push({ label, question: q, answered, score: +best.s.toFixed(3), sim: +best.sim.toFixed(3), evidence: (best.s >= threshold * 0.4 || best.sim >= simThreshold - 0.03) ? { text: best.p.text, url: best.p.doc.url, title: best.p.doc.title } : null, dork: gapDork(label, topic) });
  }
  return { questions: out, covered: out.filter(q => q.answered).length };
}
function gapDork(label, t) { return ({ "反対・課題": `${t} (反対 OR 批判 OR 課題 OR デメリット OR 懸念)`, 根拠: `${t} (調査 OR 統計 OR 報告書 OR filetype:pdf) (site:go.jp OR site:ac.jp)`, 公式見解: `${t} (発表 OR 見解 OR 声明) (site:go.jp OR site:lg.jp OR site:or.jp)`, 規模: `${t} (人 OR 件 OR 円 OR 割合)`, 今後: `${t} (今後 OR 予定 OR 見通し)`, なぜ: `${t} (原因 OR 理由 OR 背景)` })[label] || `${t} ${label}`; }

/* ---------- ⑥ 対立視点・反論 ---------- */
export async function opposingViews(topic, docs, emb, nli, onStep = () => { }) {
  const ps = passagesOf(docs, 12, 240); if (!ps.length) return { stance: [], contradictions: [] };
  onStep("立場を分類"); const zs = await zeroShot(ps.map(p => p.text), { 賛成: `${topic}に賛成・肯定的・支持する内容`, 反対: `${topic}に反対・批判的・懸念や課題を指摘する内容`, 中立: `${topic}について事実だけを述べる中立的な内容` }, emb);
  const stance = ps.map((p, i) => ({ ...p, stance: zs[i] })).filter(p => !/TEL|FAX|受付時間|Copyright/.test(p.text) && (p.stance.反対 > 0.5 || p.stance.賛成 > 0.6)).sort((a, b) => b.stance.反対 - a.stance.反対);
  onStep("矛盾する記述を探す"); const claims = ps.filter(p => isProp(p.text)).slice(0, 40); const D = await emb.encode(claims.map(c => c.text), "doc"); const pairs = [];
  for (let i = 0; i < claims.length; i++) for (let j = i + 1; j < claims.length; j++) { if (claims[i].doc === claims[j].doc) continue; const s = dot(D[i], D[j]); if (s >= P.corroboration.min_sim) pairs.push({ i, j, s }); }
  pairs.sort((a, b) => b.s - a.s); const top = pairs.slice(0, P.corroboration.max_pairs || 600).slice(0, 120);
  const pr = await nli.predict(top.map(p => claims[p.i].text), top.map(p => claims[p.j].text));
  const contradictions = top.map((p, k) => ({ a: claims[p.i], b: claims[p.j], sim: p.s, contra: pr[k][2], entail: pr[k][0] })).filter(x => x.contra >= P.corroboration.contra_min).sort((a, b) => b.contra - a.contra).slice(0, 20);
  return { stance: { against: stance.filter(p => p.stance.反対 > 0.5).slice(0, 12), pro: stance.filter(p => p.stance.賛成 > 0.6).slice(0, 8), counts: { 賛成: zs.filter(z => z.賛成 >= Math.max(z.反対, z.中立)).length, 反対: zs.filter(z => z.反対 >= Math.max(z.賛成, z.中立)).length, 中立: zs.filter(z => z.中立 >= Math.max(z.賛成, z.反対)).length } }, contradictions };
}

/* ---------- ⑦ 意味的な差分 ---------- */
export async function semanticDiff(a, b, emb, nli, onStep = () => { }) {
  const A = sentences(a), B = sentences(b); if (!A.length || !B.length) return { pairs: [], added: B, removed: A };
  onStep("文を埋め込み中"); const EA = await emb.encode(A, ""), EB = await emb.encode(B, "");
  const used = new Set(); const pairs = [];
  A.forEach((s, i) => { let best = -1, bj = -1; EB.forEach((v, j) => { if (used.has(j)) return; const d = dot(EA[i], v); if (d > best) { best = d; bj = j; } }); if (bj >= 0 && best >= 0.80) { used.add(bj); pairs.push({ i, j: bj, a: s, b: B[bj], sim: best }); } });
  const changed = pairs.filter(p => p.sim < 0.995 && p.a !== p.b);
  onStep(`意味の変化を判定 ${changed.length} 組`); const pr1 = await nli.predict(changed.map(p => p.a), changed.map(p => p.b)); const pr2 = await nli.predict(changed.map(p => p.b), changed.map(p => p.a));
  changed.forEach((p, k) => { const e1 = pr1[k][0], e2 = pr2[k][0], c = Math.max(pr1[k][2], pr2[k][2]); p.kind = (e1 >= 0.5 && e2 >= 0.5) ? "言い換え（意味は同じ）" : c >= 0.5 ? "意味が反転・矛盾" : e1 >= 0.5 ? "情報が減った" : e2 >= 0.5 ? "情報が増えた" : "意味が変わった"; p.e1 = e1; p.e2 = e2; p.c = c; });
  const matchedA = new Set(pairs.map(p => p.i));
  return { pairs: pairs.filter(p => p.a === p.b || p.sim >= 0.995).length, changed: changed.filter(p => p.kind !== "言い換え（意味は同じ）"), paraphrase: changed.filter(p => p.kind === "言い換え（意味は同じ）"), added: B.filter((_, j) => !used.has(j)), removed: A.filter((_, i) => !matchedA.has(i)) };
}

/* ---------- ⑧ マトリクス化 ---------- */
export const DEFAULT_AXES = ["概要・何か", "メリット・利点", "デメリット・課題", "費用・価格・規模", "対象・条件", "時期・スケジュール", "根拠・出典"];
export async function matrix(docs, axes, rr, emb, topic = "", onStep = () => { }, minSim = 0.84) {
  const rows = []; const qs = axes.map(ax => `${topic ? topic + "の" : ""}${ax}は何ですか？`); const QV = await emb.encode(qs, "query");
  for (const d of docs) {
    const ps = splitPassages(d.text || d.snippet || "", 200).filter(p => !isNoise(p)).slice(0, 40); const row = { doc: d, cells: [] };
    if (ps.length) { onStep(`${(d.title || d.url).slice(0, 20)}…`); const D = await emb.encode(ps, "doc");
      const best = QV.map(qv => { let bi = 0, bs = -1; D.forEach((v, i) => { const x = dot(qv, v); if (x > bs) { bs = x; bi = i; } }); return { i: bi, sim: bs }; });
      const sc = await rr.score(qs, best.map(b => ps[b.i]));
      row.cells = best.map((b, k) => b.sim >= minSim ? { text: ps[b.i], sim: +b.sim.toFixed(3), score: +sc[k].toFixed(2), conf: sc[k] >= 0.2 ? "高" : sc[k] >= 0.05 ? "中" : "低" } : null); }
    else row.cells = axes.map(() => null);
    rows.push(row);
  }
  return { axes, rows };
}

/* ---------- ⑨ 要約・Q&A（根拠つき） ---------- */
export async function summarize(docs, emb, k = 7, onStep = () => { }) {
  const ps = passagesOf(docs, 15, 200).filter(p => isProp(p.text) || p.text.length > 60); if (!ps.length) return [];
  onStep("段落を埋め込み中"); const D = await emb.encode(ps.map(p => p.text), "doc"); const c = D[0].map((_, j) => D.reduce((s, v) => s + v[j], 0) / D.length);
  const rel = D.map((v, i) => dot(v, c) * (0.8 + 0.2 * (ps[i].doc.s_source ?? 0.5)));
  const chosen = []; const lam = 0.7;
  while (chosen.length < Math.min(k, ps.length)) { let best = -Infinity, bi = -1; D.forEach((v, i) => { if (chosen.includes(i)) return; const red = chosen.length ? Math.max(...chosen.map(j => dot(v, D[j]))) : 0; const s = lam * rel[i] - (1 - lam) * red; if (s > best) { best = s; bi = i; } }); if (bi < 0) break; chosen.push(bi); }
  return chosen.map(i => ({ text: ps[i].text, url: ps[i].doc.url, title: ps[i].doc.title, published: ps[i].doc.published, rel: +rel[i].toFixed(3) }));
}
export async function answer(question, docs, rr, emb, nli, onStep = () => { }) {
  const ps = passagesOf(docs, 15, 240); if (!ps.length) return { hits: [] };
  onStep("候補を検索"); const qv = (await emb.encode([question], "query"))[0]; const D = await emb.encode(ps.map(p => p.text), "doc"); const cand = ps.map((p, i) => [dot(qv, D[i]), i]).sort((a, b) => b[0] - a[0]).slice(0, 10);
  onStep("関連度を判定"); const sc = await rr.score(cand.map(() => question), cand.map(c => ps[c[1]].text));
  const hits = cand.map((c, k) => ({ ...ps[c[1]], score: sc[k], sim: c[0] })).sort((a, b) => b.score - a.score).slice(0, 5);
  const isClaim = isProp(question); if (isClaim && hits.length) { onStep("含意を判定"); const pr = await nli.predict(hits.map(h => h.text), hits.map(() => question)); hits.forEach((h, i) => { h.nli = pr[i]; }); }
  return { hits, isClaim };
}

/* ---------- ⑩ 長文一括 vs 分割（実験） ---------- */
export async function longVsChunk(question, doc, rr, nli, chunkTokens = 512, onStep = () => { }) {
  const text = doc.text || ""; const isClaim = isProp(question); const res = {};
  const tok = t => rr.nTokens(t);
  onStep("一括（最大 8192 トークン）"); let t0 = performance.now(); const whole = await rr.score([question], [text], 1, 8192); res.whole = { score: whole[0], ms: Math.round(performance.now() - t0), tokens: Math.min(tok(text), 8192) };
  if (isClaim) { t0 = performance.now(); const p = await nli.predict([text], [question], 1, 8192); res.whole.nli = p[0]; res.whole.nli_ms = Math.round(performance.now() - t0); }
  const sents = sentences(text); const chunks = []; let cur = ""; for (const s of sents) { if (tok(cur + s) > chunkTokens && cur) { chunks.push(cur); cur = s; } else cur += s; } if (cur) chunks.push(cur);
  onStep(`分割（${chunks.length} チャンク × ${chunkTokens} トークン）`); t0 = performance.now(); const sc = await rr.score(chunks.map(() => question), chunks, 8, chunkTokens); res.chunk = { score: Math.max(...sc), best: chunks[sc.indexOf(Math.max(...sc))]?.slice(0, 200), ms: Math.round(performance.now() - t0), n: chunks.length, scores: sc.map(x => +x.toFixed(3)) };
  if (isClaim) { t0 = performance.now(); const pr = await nli.predict(chunks, chunks.map(() => question), 8, chunkTokens); const agg = [0, 1, 2].map(k => Math.max(...pr.map(p => p[k]))); res.chunk.nli = agg; res.chunk.nli_ms = Math.round(performance.now() - t0); }
  return res;
}
