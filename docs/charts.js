/* 依存なしの小さな SVG グラフ。色はテーマ変数（ダークモードでも読める） */
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const INK = "var(--fg)", MUTED = "var(--muted)", GRID = "var(--line)";
/* 横棒：rows = [{label, value, color?, note?}] */
export function barH(rows, { max, width = 520, unit = "", title } = {}) {
  const m = max || Math.max(1, ...rows.map(r => r.value)); const lw = 118, bw = width - lw - 70, rh = 22; const H = rows.length * rh + (title ? 22 : 6) + 4;
  return `<svg viewBox="0 0 ${width} ${H}" width="100%" style="max-width:${width}px;display:block" role="img" aria-label="${esc(title || "")}" font-size="12">${title ? `<text x="0" y="14" font-weight="600" fill="${INK}">${esc(title)}</text>` : ""}${rows.map((r, i) => { const y = (title ? 22 : 6) + i * rh; const w = Math.max(0, r.value / m * bw); return `<text x="${lw - 6}" y="${y + 15}" text-anchor="end" fill="${INK}">${esc(r.label)}</text><rect x="${lw}" y="${y + 4}" width="${bw}" height="14" fill="${GRID}" opacity=".35" rx="3"/><rect x="${lw}" y="${y + 4}" width="${w}" height="14" fill="${r.color || "var(--acc)"}" rx="3"><title>${esc(r.label)}: ${esc(r.value)}${esc(unit)}</title></rect><text x="${lw + w + 5}" y="${y + 15}" fill="${MUTED}">${esc(r.value)}${esc(unit)}${r.note ? " " + esc(r.note) : ""}</text>`; }).join("")}</svg>`;
}
/* 積み上げ 1 本：segs = [{label, value, color}] */
export function stacked(segs, { width = 520, title } = {}) {
  const total = segs.reduce((s, x) => s + x.value, 0) || 1; let x = 0; const H = title ? 58 : 40;
  return `<svg viewBox="0 0 ${width} ${H}" width="100%" style="max-width:${width}px;display:block" role="img" aria-label="${esc(title || "")}" font-size="12">${title ? `<text x="0" y="14" font-weight="600" fill="${INK}">${esc(title)}</text>` : ""}${segs.map(s => { const w = s.value / total * width; const r = `<rect x="${x}" y="${title ? 22 : 4}" width="${w}" height="18" fill="${s.color}"><title>${esc(s.label)}: ${s.value}</title></rect>${w > 36 ? `<text x="${x + w / 2}" y="${(title ? 22 : 4) + 13}" text-anchor="middle" fill="#fff" font-weight="600">${s.value}</text>` : ""}`; x += w; return r; }).join("")}<g>${(() => { let lx = 0; return segs.map(s => { const t = `<rect x="${lx}" y="${H - 12}" width="10" height="10" fill="${s.color}" rx="2"/><text x="${lx + 14}" y="${H - 3}" fill="${MUTED}">${esc(s.label)} ${s.value}</text>`; lx += 14 + (s.label.length * 12 + 30); return t; }).join(""); })()}</g></svg>`;
}
/* 月別ヒストグラム：dates = ["YYYY-MM-DD", ...] */
export function timeline(dates, { width = 520, title = "記事の公開月", months = 18 } = {}) {
  const ds = dates.filter(d => /^\d{4}-\d{2}/.test(d || "")); if (!ds.length) return `<p class="small muted">日付のある記事がありません</p>`;
  const key = d => d.slice(0, 7); const cnt = {}; for (const d of ds) cnt[key(d)] = (cnt[key(d)] || 0) + 1;
  const ks = Object.keys(cnt).sort(); const last = ks[ks.length - 1]; const [ly, lm] = last.split("-").map(Number); const cols = [];
  for (let i = months - 1; i >= 0; i--) { let y = ly, m = lm - i; while (m <= 0) { m += 12; y--; } cols.push(`${y}-${String(m).padStart(2, "0")}`); }
  const older = ks.filter(k => k < cols[0]).reduce((s, k) => s + cnt[k], 0);
  const m = Math.max(1, ...cols.map(c => cnt[c] || 0), older); const bw = (width - 40) / (cols.length + 1); const H = 110;
  const bar = (i, v, label, tip) => { const h = v / m * 60; return `<rect x="${20 + i * bw + 2}" y="${80 - h}" width="${bw - 4}" height="${h}" fill="var(--acc)" rx="2"><title>${esc(tip)}: ${v} 件</title></rect>${v ? `<text x="${20 + i * bw + bw / 2}" y="${76 - h}" text-anchor="middle" fill="${MUTED}" font-size="10">${v}</text>` : ""}<text x="${20 + i * bw + bw / 2}" y="94" text-anchor="middle" fill="${MUTED}" font-size="9.5">${esc(label)}</text>`; };
  return `<svg viewBox="0 0 ${width} ${H}" width="100%" style="max-width:${width}px;display:block" role="img" aria-label="${esc(title)}" font-size="12"><text x="0" y="14" font-weight="600" fill="${INK}">${esc(title)}</text><line x1="20" x2="${width - 10}" y1="80" y2="80" stroke="${GRID}"/>${bar(0, older, "以前", cols[0] + " より前")}${cols.map((c, i) => bar(i + 1, cnt[c] || 0, (i % 3 === 0) ? (c.endsWith("-01") || i === 0 ? c.slice(2).replace("-", "/") : c.slice(5) + "月") : "", c)).join("")}</svg>`;
}
/* ドーナツ：segs = [{label, value, color}] */
export function donut(segs, { size = 120, title } = {}) {
  const total = segs.reduce((s, x) => s + x.value, 0) || 1; const r = 44, cx = 60, cy = 60, C = 2 * Math.PI * r; let off = 0;
  return `<svg viewBox="0 0 ${size + 200} ${size}" width="100%" style="max-width:${size + 200}px;display:block" role="img" aria-label="${esc(title || "")}" font-size="12">${segs.map(s => { const len = s.value / total * C; const el = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${s.color}" stroke-width="16" stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-off}" transform="rotate(-90 ${cx} ${cy})"><title>${esc(s.label)}: ${s.value}</title></circle>`; off += len; return el; }).join("")}<text x="${cx}" y="${cy + 4}" text-anchor="middle" font-weight="700" fill="${INK}">${total}</text>${title ? `<text x="${size + 10}" y="18" font-weight="600" fill="${INK}">${esc(title)}</text>` : ""}${segs.map((s, i) => `<rect x="${size + 10}" y="${30 + i * 16}" width="10" height="10" fill="${s.color}" rx="2"/><text x="${size + 25}" y="${39 + i * 16}" fill="${MUTED}">${esc(s.label)} ${s.value}（${Math.round(s.value / total * 100)}%）</text>`).join("")}</svg>`;
}
export const COLORS = { gov: "#15803d", news: "#0e7490", edu: "#2563eb", academic: "#7c3aed", wiki: "#6b7280", org: "#0891b2", corp: "#b45309", blog: "#d97706", sns: "#be123c", other: "#9ca3af", support: "#15803d", refute: "#be123c", neutral: "#9ca3af" };
