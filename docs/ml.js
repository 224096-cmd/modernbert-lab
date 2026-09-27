/* ブラウザ内モデル（onnxruntime-web）。models/<name>/{meta.json, tokenizer.json, tokenizer_config.json, model_int8.onnx}
   役割：embed（文埋め込み）／nli（含意・中立・矛盾）／rerank（関連度 1 値）。どのモデルをどの役割に使うかは設定で切り替え。 */
import { PreTrainedTokenizer } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.5.2/dist/transformers.min.js";
import * as ort from "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist/ort.wasm.min.mjs";
ort.env.wasm.wasmPaths = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist/";
ort.env.wasm.numThreads = 1;

export const FILES = ["meta.json", "tokenizer.json", "tokenizer_config.json", "model_int8.onnx"];
const store = {
  db: null,
  async open() { if (this.db) return this.db; return this.db = await new Promise((ok, ng) => { const r = indexedDB.open("mbo-models", 1); r.onupgradeneeded = () => r.result.createObjectStore("files"); r.onsuccess = () => ok(r.result); r.onerror = () => ng(r.error); }); },
  async get(k) { const db = await this.open(); return new Promise((ok, ng) => { const r = db.transaction("files").objectStore("files").get(k); r.onsuccess = () => ok(r.result); r.onerror = () => ng(r.error); }); },
  async put(k, v) { const db = await this.open(); return new Promise((ok, ng) => { const r = db.transaction("files", "readwrite").objectStore("files").put(v, k); r.onsuccess = () => ok(); r.onerror = () => ng(r.error); }); },
  async del(k) { const db = await this.open(); return new Promise((ok, ng) => { const r = db.transaction("files", "readwrite").objectStore("files").delete(k); r.onsuccess = () => ok(); r.onerror = () => ng(r.error); }); },
  async keys() { const db = await this.open(); return new Promise((ok, ng) => { const r = db.transaction("files").objectStore("files").getAllKeys(); r.onsuccess = () => ok(r.result); r.onerror = () => ng(r.error); }); },
};
export function hfRepo() { try { return localStorage.getItem("mbo.hfrepo") || ""; } catch { return ""; } }
export function setHfRepo(r) { try { r ? localStorage.setItem("mbo.hfrepo", r) : localStorage.removeItem("mbo.hfrepo"); } catch { } }
function bases(name) { const b = [new URL(`./models/${name}/`, import.meta.url).href]; const r = hfRepo(); if (r) b.unshift(`https://huggingface.co/${r}/resolve/main/${name}/`); return b; }
async function fetchBuf(url, onProgress) {
  const r = await fetch(url); if (!r.ok) throw new Error(`HTTP ${r.status} ${url.split("/").slice(-2).join("/")}`);
  const reader = r.body.getReader(); const chunks = []; let got = 0;
  for (; ;) { const { done, value } = await reader.read(); if (done) break; chunks.push(value); got += value.length; onProgress?.(got); }
  if (!got) throw new Error("0 byte");
  const out = new Uint8Array(got); let o = 0; for (const c of chunks) { out.set(c, o); o += c.length; } return out.buffer;
}
async function getFile(name, f, onProgress) {
  const key = `${name}/${f}`; let b = null; try { b = await store.get(key); } catch { }
  if (b && b.byteLength) { onProgress(`${name}: ${f} を端末内から読込`); return b; }
  let err = null;
  for (const bs of bases(name)) { try { b = await fetchBuf(bs + f, got => onProgress(`${name}: ${f} をダウンロード中 ${(got / 1e6).toFixed(1)} MB`)); err = null; break; } catch (e) { err = e; } }
  if (err) throw err;
  if (/\.json$/.test(f)) JSON.parse(new TextDecoder().decode(b));
  try { await store.put(key, b); } catch { }
  return b;
}
export async function isStored(name) { const ks = new Set(await store.keys()); return FILES.every(f => ks.has(`${name}/${f}`)); }
export async function removeStored(name) { for (const f of FILES) await store.del(`${name}/${f}`); }
export async function storedBytes(name) { let n = 0; for (const k of await store.keys()) if (!name || k.startsWith(name + "/")) n += (await store.get(k))?.byteLength || 0; return n; }

/* 役割ごとの既定モデルと選択（localStorage） */
export const DEFAULT = { embed: "ruri-v3-30m", nli: "nli-ja-30m", rerank: "reranker-ja-xsmall-v2" };
export function modelName(kind) { try { return localStorage.getItem("mbo.model." + kind) || DEFAULT[kind]; } catch { return DEFAULT[kind]; } }
export function setModelName(kind, v) { try { v ? localStorage.setItem("mbo.model." + kind, v) : localStorage.removeItem("mbo.model." + kind); } catch { } cache[kind] = null; }

export class Model {
  constructor(name) { this.name = name; }
  async load(onProgress = () => { }) {
    const txt = b => new TextDecoder().decode(b);
    const [meta, tj, tc, model] = await Promise.all(FILES.map(f => getFile(this.name, f, onProgress)));
    this.meta = JSON.parse(txt(meta)); this.kind = this.meta.kind;
    this.tok = new PreTrainedTokenizer(JSON.parse(txt(tj)), JSON.parse(txt(tc)));
    this.maxSeq = this.meta.max_seq_browser || (this.meta.kind === "embed" ? 2048 : 1024);
    this.maxPos = this.meta.max_position || 512;
    onProgress(`${this.name}: セッション作成中`);
    this.sess = await ort.InferenceSession.create(model, { executionProviders: ["wasm"], graphOptimizationLevel: "all" });
    this.padId = this.meta.pad_id ?? (this.tok.model.tokens_to_ids.get("<pad>") ?? 0);
    this.T = this.meta.temperature || 1; this.prefix = this.meta.prefixes || {};
    onProgress(""); this.stats = { calls: 0, tokens: 0, ms: 0 }; return this;
  }
  ids(text, pair, maxLen) { const L = Math.min(maxLen || this.maxSeq, this.meta.max_position || 8192); const r = pair === undefined ? this.tok(text, { truncation: true, max_length: L }) : this.tok(text, { text_pair: pair, truncation: true, max_length: L }); return Array.from(r.input_ids.data, Number); }
  nTokens(text) { return this.tok(text, { truncation: false }).input_ids.data.length; }
  async run(idsList) {
    const n = idsList.length, L = Math.max(...idsList.map(a => a.length)); const t0 = performance.now();
    const ids = new BigInt64Array(n * L).fill(BigInt(this.padId)), am = new BigInt64Array(n * L);
    idsList.forEach((a, i) => a.forEach((x, j) => { ids[i * L + j] = BigInt(x); am[i * L + j] = 1n; }));
    const out = await this.sess.run({ input_ids: new ort.Tensor("int64", ids, [n, L]), attention_mask: new ort.Tensor("int64", am, [n, L]) });
    const t = out[Object.keys(out)[0]]; const d = t.dims[1] || 1; this.stats.calls++; this.stats.tokens += idsList.reduce((s, a) => s + a.length, 0); this.stats.ms += performance.now() - t0;
    return Array.from({ length: n }, (_, i) => Array.from(t.data.slice(i * d, (i + 1) * d)));
  }
  async batched(idsList, bs = 8) {
    const order = idsList.map((_, i) => i).sort((a, b) => idsList[a].length - idsList[b].length); const out = new Array(idsList.length);
    for (let i = 0; i < order.length; i += bs) { const idx = order.slice(i, i + bs); const y = await this.run(idx.map(j => idsList[j])); idx.forEach((j, k) => out[j] = y[k]); await new Promise(r => setTimeout(r)); }
    return out;
  }
  /* embed */
  async encode(texts, kind = "", bs = 8, maxLen) { if (!texts.length) return []; const pre = this.prefix[kind] || ""; return this.batched(texts.map(t => this.ids(pre + (t || ""), undefined, maxLen)), bs); }
  /* nli → [p_entail, p_neutral, p_contra] */
  async predict(premises, hyps, bs = 8, maxLen) {
    if (!premises.length) return []; const z = await this.batched(premises.map((p, i) => this.ids(p, hyps[i], maxLen)), bs); const T = this.T; const order = this.meta.label_order || [0, 1, 2];
    return z.map(l => { const m = Math.max(...l); const e = l.map(x => Math.exp((x - m) / T)); const s = e.reduce((a, b) => a + b, 0); const p = e.map(x => x / s); return order.map(i => p[i]); });
  }
  /* rerank → 0〜1 */
  async score(queries, docs, bs = 8, maxLen) { if (!queries.length) return []; const z = await this.batched(queries.map((q, i) => this.ids(q, docs[i], maxLen)), bs); return z.map(l => l.length === 1 ? 1 / (1 + Math.exp(-l[0])) : (() => { const m = Math.max(...l); const e = l.map(x => Math.exp(x - m)); return e[e.length - 1] / e.reduce((a, b) => a + b, 0); })()); }
}
const cache = {};
export async function get(kind, onProgress) { const name = modelName(kind); if (!cache[kind] || cache[kind].name !== name) cache[kind] = await new Model(name).load(onProgress); return cache[kind]; }
export const embedder = p => get("embed", p), nli = p => get("nli", p), reranker = p => get("rerank", p);
export async function loadByName(name, onProgress) { return new Model(name).load(onProgress); }
export const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
export async function zeroShot(texts, labels, emb) {
  const T = await emb.encode(texts, "topic"), L = await emb.encode(Object.values(labels), "topic"); const keys = Object.keys(labels);
  return T.map(t => { const s = L.map(l => dot(t, l) * 20); const m = Math.max(...s); const e = s.map(x => Math.exp(x - m)); const z = e.reduce((a, b) => a + b, 0); return Object.fromEntries(keys.map((k, i) => [k, e[i] / z])); });
}
