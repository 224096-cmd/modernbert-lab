/* ブラウザ内 ModernBERT（onnxruntime-web）。Python 側 mbo/models.py と同じモデル・同じ前処理。
   Embedder: ruri-v3-30m（mean pooling + L2）  NLI: nli-ja-30m（含意/中立/矛盾） */
import { PreTrainedTokenizer } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.5.2/dist/transformers.min.js";
import * as ort from "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist/ort.wasm.min.mjs";
ort.env.wasm.wasmPaths = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist/";
ort.env.wasm.numThreads = 1; // GitHub Pages は crossOriginIsolated でないためマルチスレッド不可

const FILES = ["meta.json", "tokenizer.json", "tokenizer_config.json", "model_int8.onnx"];
const DB = "mbo-models";
const store = {
  db: null,
  async open() { if (this.db) return this.db; return this.db = await new Promise((ok, ng) => { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore("files"); r.onsuccess = () => ok(r.result); r.onerror = () => ng(r.error); }); },
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
  if (b && b.byteLength) { onProgress(`${f}: 端末内から読込`); return b; }
  let err = null;
  for (const bs of bases(name)) { try { b = await fetchBuf(bs + f, got => onProgress(`${f} をダウンロード中 ${(got / 1e6).toFixed(1)} MB`)); err = null; break; } catch (e) { err = e; } }
  if (err) throw err;
  if (/\.json$/.test(f)) JSON.parse(new TextDecoder().decode(b));
  try { await store.put(key, b); } catch { }
  return b;
}
export async function isStored(name) { const ks = new Set(await store.keys()); return FILES.every(f => ks.has(`${name}/${f}`)); }
export async function removeStored(name) { for (const f of FILES) await store.del(`${name}/${f}`); }
export async function storedBytes() { let n = 0; for (const k of await store.keys()) n += (await store.get(k))?.byteLength || 0; return n; }

class Onnx {
  constructor(name, maxSeq) { this.name = name; this.maxSeq = maxSeq; }
  async load(onProgress = () => { }) {
    const txt = b => new TextDecoder().decode(b);
    const [meta, tj, tc, model] = await Promise.all(FILES.map(f => getFile(this.name, f, onProgress)));
    this.meta = JSON.parse(txt(meta));
    this.tok = new PreTrainedTokenizer(JSON.parse(txt(tj)), JSON.parse(txt(tc)));
    onProgress("ONNX セッション作成中");
    this.sess = await ort.InferenceSession.create(model, { executionProviders: ["wasm"], graphOptimizationLevel: "all" });
    this.padId = this.tok.model.tokens_to_ids.get("<pad>") ?? 3;
    onProgress(""); return this;
  }
  encodeIds(text, pair) {
    const r = pair === undefined ? this.tok(text, { truncation: true, max_length: this.maxSeq }) : this.tok(text, { text_pair: pair, truncation: true, max_length: this.maxSeq });
    return Array.from(r.input_ids.data, Number);
  }
  async run(idsList) {
    const n = idsList.length, L = Math.max(...idsList.map(a => a.length));
    const ids = new BigInt64Array(n * L).fill(BigInt(this.padId)), am = new BigInt64Array(n * L);
    idsList.forEach((a, i) => a.forEach((x, j) => { ids[i * L + j] = BigInt(x); am[i * L + j] = 1n; }));
    const out = await this.sess.run({ input_ids: new ort.Tensor("int64", ids, [n, L]), attention_mask: new ort.Tensor("int64", am, [n, L]) });
    const t = out[Object.keys(out)[0]]; const d = t.dims[1]; return Array.from({ length: n }, (_, i) => Array.from(t.data.slice(i * d, (i + 1) * d)));
  }
  async batched(idsList, bs = 8) {
    const order = idsList.map((_, i) => i).sort((a, b) => idsList[a].length - idsList[b].length); const out = new Array(idsList.length);
    for (let i = 0; i < order.length; i += bs) { const idx = order.slice(i, i + bs); const y = await this.run(idx.map(j => idsList[j])); idx.forEach((j, k) => out[j] = y[k]); await new Promise(r => setTimeout(r)); }
    return out;
  }
}
export function modelName(kind) { try { return localStorage.getItem("mbo.model." + kind) || (kind === "embed" ? "ruri-v3-30m" : "nli-ja-30m"); } catch { return kind === "embed" ? "ruri-v3-30m" : "nli-ja-30m"; } }
export function setModelName(kind, v) { try { v ? localStorage.setItem("mbo.model." + kind, v) : localStorage.removeItem("mbo.model." + kind); } catch { } }
export class Embedder extends Onnx {
  constructor() { super(modelName("embed"), 512); this.PREFIX = { query: "検索クエリ: ", doc: "検索文書: ", topic: "トピック: ", "": "" }; }
  async encode(texts, kind = "", bs = 8) { if (!texts.length) return []; return this.batched(texts.map(t => this.encodeIds(this.PREFIX[kind] + (t || ""))), bs); }
}
export class NLI extends Onnx {
  constructor() { super(modelName("nli"), 256); }
  async predict(premises, hyps, bs = 8) {
    if (!premises.length) return [];
    const z = await this.batched(premises.map((p, i) => this.encodeIds(p, hyps[i])), bs); const T = this.meta.temperature || 1;
    return z.map(l => { const m = Math.max(...l); const e = l.map(x => Math.exp((x - m) / T)); const s = e.reduce((a, b) => a + b, 0); return e.map(x => x / s); });
  }
}
const cache = {};
export async function embedder(onProgress) { if (!cache.e) cache.e = await new Embedder().load(onProgress); return cache.e; }
export async function nli(onProgress) { if (!cache.n) cache.n = await new NLI().load(onProgress); return cache.n; }
export const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
export async function zeroShot(texts, labels, emb) {
  const T = await emb.encode(texts, "topic"), L = await emb.encode(Object.values(labels), "topic"); const keys = Object.keys(labels);
  return T.map(t => { const s = L.map(l => dot(t, l) * 20); const m = Math.max(...s); const e = s.map(x => Math.exp(x - m)); const z = e.reduce((a, b) => a + b, 0); return Object.fromEntries(keys.map((k, i) => [k, e[i] / z])); });
}
