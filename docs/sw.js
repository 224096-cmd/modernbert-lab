/* PWA・壹い繝励Μ譛ｬ菴薙→ data/*.json 繧偵く繝｣繝・す繝･・医ロ繝・ヨ蜆ｪ蜈医∝､ｱ謨玲凾繧ｭ繝｣繝・す繝･・峨ゅΔ繝・Ν縺ｯ IndexedDB・・l.js・峨・/
const C = "mbl-v1";
const APP = ["./", "./index.html", "./app.css", "./app.js", "./net.js", "./ml.js", "./judge.js", "./params.json", "./manifest.json", "./icon.svg",
  "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.5.2/dist/transformers.min.js", "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist/ort.wasm.min.mjs",
  "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist/ort-wasm-simd-threaded.mjs", "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist/ort-wasm-simd-threaded.wasm"];
self.addEventListener("install", e => { e.waitUntil(caches.open(C).then(c => Promise.allSettled(APP.map(u => c.add(u)))).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== C).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url); if (e.request.method !== "GET") return;
  const own = u.origin === location.origin, cdn = /cdn\.jsdelivr\.net/.test(u.host);
  if (!(own || cdn)) return;
  if (/\/models\//.test(u.pathname)) return;
  e.respondWith((async () => { const c = await caches.open(C); try { const r = await fetch(e.request); if (r.ok) c.put(e.request, r.clone()); return r; } catch { return (await c.match(e.request)) || Response.error(); } })());
});
