/* SAGG Drywall+ — teknik çizimler (SVG, mm biriminde viewBox).
 * Görünüşler: ön (x-z), sağ yan (y-z), üst / plan (x-y). Her çizim ayrıca DXF'e aktarılabilsin diye
 * çizgi / dikdörtgen / yazı ilkel listesi (prims) de üretir. */
import { BOARDS, ROLE_COLORS } from './catalog.js';

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const f1 = v => Math.round(v * 10) / 10;

export const VIEWS = {
  front: { label: 'Ön görünüş', p: b => [b[0], -b[5], b[3], -b[2]], depth: b => b[1] },
  side:  { label: 'Sağ yan görünüş', p: b => [b[1], -b[5], b[4], -b[2]], depth: b => -b[3] },
  top:   { label: 'Üst görünüş (plan)', p: b => [b[0], -b[4], b[3], -b[1]], depth: b => -b[5] },
};

/* ilkel listesi → SVG */
class Sheet {
  constructor() { this.prims = []; }
  rect(x0, y0, x1, y1, st) { this.prims.push({ t: 'rect', x0: Math.min(x0, x1), y0: Math.min(y0, y1), x1: Math.max(x0, x1), y1: Math.max(y0, y1), ...st }); }
  line(x0, y0, x1, y1, st) { this.prims.push({ t: 'line', x0, y0, x1, y1, ...st }); }
  path(d, st) { this.prims.push({ t: 'path', d, ...st }); }
  circle(x, y, r, st) { this.prims.push({ t: 'circle', x, y, r, ...st }); }
  text(x, y, s, st) { this.prims.push({ t: 'text', x, y, s, ...st }); }
  bbox() {
    const b = [Infinity, Infinity, -Infinity, -Infinity];
    for (const p of this.prims) {
      const tw = (p.fs || 0) * String(p.s).length * 0.56, ta = p.anchor === 'start' ? 0 : p.anchor === 'end' ? 1 : 0.5;
      const pts = p.t === 'text' ? (p.rot ? [[p.x - p.fs, p.y - tw * (1 - ta)], [p.x, p.y + tw * ta]] : [[p.x - tw * ta, p.y], [p.x + tw * (1 - ta), p.y - (p.fs || 0)]]) : p.t === 'path' ? (p.pts || []) : p.t === 'circle' ? [[p.x - p.r, p.y - p.r], [p.x + p.r, p.y + p.r]] : [[p.x0, p.y0], [p.x1, p.y1]];
      for (const [x, y] of pts) { b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], y); b[2] = Math.max(b[2], x); b[3] = Math.max(b[3], y); }
    }
    return b;
  }
  svg(opt = {}) {
    const b = this.bbox(), m = opt.margin ?? Math.max(b[2] - b[0], b[3] - b[1]) * 0.04;
    const vb = [b[0] - m, b[1] - m, b[2] - b[0] + 2 * m, b[3] - b[1] + 2 * m].map(f1);
    const out = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb.join(' ')}" class="drw" preserveAspectRatio="xMidYMid meet" font-family="Inter, Arial, sans-serif">`];
    out.push(`<defs><pattern id="hatch" patternUnits="userSpaceOnUse" width="40" height="40" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="40" stroke="#c9ced6" stroke-width="6"/></pattern></defs>`);
    for (const p of this.prims) {
      const sw = p.sw ?? 1, st = `stroke="${p.stroke || '#1b1f24'}" stroke-width="${f1(sw)}"${p.dash ? ` stroke-dasharray="${p.dash}"` : ''}`;
      if (p.t === 'rect') out.push(`<rect x="${f1(p.x0)}" y="${f1(p.y0)}" width="${f1(p.x1 - p.x0)}" height="${f1(p.y1 - p.y0)}" fill="${p.fill || 'none'}"${p.op ? ` fill-opacity="${p.op}"` : ''} ${st}${p.vec ? ' vector-effect="non-scaling-stroke"' : ''}/>`);
      else if (p.t === 'line') out.push(`<line x1="${f1(p.x0)}" y1="${f1(p.y0)}" x2="${f1(p.x1)}" y2="${f1(p.y1)}" ${st}/>`);
      else if (p.t === 'circle') out.push(`<circle cx="${f1(p.x)}" cy="${f1(p.y)}" r="${f1(p.r)}" fill="${p.fill || 'none'}" ${st}/>`);
      else if (p.t === 'path') out.push(`<path d="${p.d}" fill="${p.fill || 'none'}" fill-rule="evenodd"${p.op ? ` fill-opacity="${p.op}"` : ''} ${st}/>`);
      else {
        const tr = p.rot ? ` transform="rotate(${p.rot} ${f1(p.x)} ${f1(p.y)})"` : '';
        out.push(`<text x="${f1(p.x)}" y="${f1(p.y)}" font-size="${f1(p.fs)}" text-anchor="${p.anchor || 'middle'}" fill="${p.color || '#1b1f24'}"${p.bold ? ' font-weight="700"' : ''}${p.halo ? ` paint-order="stroke" stroke="#fff" stroke-width="${f1(p.fs / 4)}"` : ''}${tr}>${esc(p.s)}</text>`);
      }
    }
    out.push('</svg>');
    return out.join('');
  }
}

/* ölçü çizgisi (mimari eğik kesme işaretli) */
function dim(S, x0, y0, x1, y1, off, fs, txt, col = '#c2410c') {
  const hor = Math.abs(y1 - y0) < Math.abs(x1 - x0);
  const sw = fs / 12, tk = fs * 0.35;
  if (hor) {
    const y = y0 + off;
    S.line(x0, y0 + Math.sign(off) * fs * 0.2, x0, y + Math.sign(off) * fs * 0.3, { stroke: col, sw: sw * 0.7 });
    S.line(x1, y1 + Math.sign(off) * fs * 0.2, x1, y + Math.sign(off) * fs * 0.3, { stroke: col, sw: sw * 0.7 });
    S.line(x0, y, x1, y, { stroke: col, sw });
    for (const x of [x0, x1]) S.line(x - tk, y + tk, x + tk, y - tk, { stroke: col, sw: sw * 2 });
    if (Math.abs(x1 - x0) > 1) S.text((x0 + x1) / 2, y - fs * 0.25, txt ?? Math.round(Math.abs(x1 - x0)), { fs, color: col, halo: true });
  } else {
    const x = x0 + off;
    S.line(x0 + Math.sign(off) * fs * 0.2, y0, x + Math.sign(off) * fs * 0.3, y0, { stroke: col, sw: sw * 0.7 });
    S.line(x1 + Math.sign(off) * fs * 0.2, y1, x + Math.sign(off) * fs * 0.3, y1, { stroke: col, sw: sw * 0.7 });
    S.line(x, y0, x, y1, { stroke: col, sw });
    for (const y of [y0, y1]) S.line(x - tk, y + tk, x + tk, y - tk, { stroke: col, sw: sw * 2 });
    if (Math.abs(y1 - y0) > 1) S.text(x - fs * 0.25, (y0 + y1) / 2, txt ?? Math.round(Math.abs(y1 - y0)), { fs, color: col, rot: -90, halo: true });
  }
}

/* zincir ölçü: sıralı konumlar */
function chain(S, xs, y, off, fs, vertical = false) {
  const u = [...new Set(xs.map(v => Math.round(v)))].sort((a, b) => a - b);
  for (let i = 0; i < u.length - 1; i++) {
    const t = u[i + 1] - u[i];
    if (t < 1) continue;
    if (vertical) dim(S, y, u[i], y, u[i + 1], off, fs * (t < fs * 2.2 ? 0.7 : 1));
    else dim(S, u[i], y, u[i + 1], y, off, fs * (t < fs * 2.2 ? 0.7 : 1));
  }
}

function fsFor(w, h) { return Math.max(18, Math.min(120, Math.max(w, h) / 42)); }

/* ───────── İskelet görünüşü ───────── */
export function frameView(md, view, opt = {}) {
  const V = VIEWS[view], S = new Sheet();
  const bb = V.p(md.bounds);
  const W = bb[2] - bb[0], H = bb[3] - bb[1], fs = opt.fs || fsFor(W, H);
  // kaplama sınırı (kesikli)
  if (opt.boards !== false) {
    for (const b of md.boards) for (const bx of b.boxes) {
      const r = V.p(bx);
      S.rect(r[0], r[1], r[2], r[3], { stroke: '#9aa3ad', sw: fs / 30, fill: BOARDS[b.type].color, op: 0.35 });
    }
  }
  // askılar, döşeme vb. yardımcı geometri
  for (const a of md.aux || []) {
    const r = V.p(a.box);
    S.rect(r[0], r[1], r[2], r[3], a.slab ? { fill: 'url(#hatch)', stroke: '#94a3b8', sw: fs / 25 } : { fill: a.color, stroke: a.color, sw: fs / 40 });
  }
  const items = md.members.map(m => ({ m, r: V.p(m.box), d: V.depth(m.box) })).sort((a, b) => b.d - a.d);
  for (const { m, r } of items) {
    const col = m.extra ? ROLE_COLORS.X : m.strong ? ROLE_COLORS.K : ROLE_COLORS[m.kind];
    S.rect(r[0], r[1], r[2], r[3], { fill: col, op: m.kind === 'U' || m.kind === 'UD' ? 0.55 : 0.75, stroke: '#14181d', sw: fs / 22 });
  }
  if (md.countertop && view !== 'top') {
    const c = md.countertop;
    const box = [c.x, c.y, c.z, c.x + c.w, c.y + c.d, c.z + c.t];
    const r = V.p(box);
    S.rect(r[0], r[1], r[2], r[3], { fill: '#3b3f46', op: 0.25, stroke: '#3b3f46', sw: fs / 15, dash: `${fs / 2} ${fs / 4}` });
    S.text((r[0] + r[2]) / 2, r[1] - fs * 0.4, 'TEZGAH', { fs: fs * 0.8, color: '#3b3f46', bold: true });
  }
  // poz etiketleri (aynı izdüşümdeki tekrarlar atlanır)
  const seen = new Set();
  for (const { m, r } of [...items].reverse()) {
    const w = r[2] - r[0], h = r[3] - r[1];
    const long = Math.max(w, h);
    if (long < fs * 2.4) continue;
    const key = r.map(v => Math.round(v / 5)).join(',');
    if (seen.has(key)) continue;
    seen.add(key);
    const vert = h > w;
    const cx = (r[0] + r[2]) / 2, cy = (r[1] + r[3]) / 2;
    S.text(cx + (vert ? fs * 0.3 : 0), cy + (vert ? 0 : fs * 0.3), m.poz, { fs: fs * 0.7, rot: vert ? -90 : 0, color: '#0b3d48', bold: true, halo: true });
  }
  // ölçüler
  const D = [bb[0], bb[1], bb[2], bb[3]];
  dim(S, D[0], D[3], D[2], D[3], fs * 4.2, fs);
  dim(S, D[0], D[1], D[0], D[3], -fs * 3.2, fs);
  if (md.marks && view === 'top') for (const k of md.marks) {
    S.circle(k.x, -k.y, Math.max(k.r, fs * 0.35), { stroke: '#b45309', sw: fs / 12, fill: '#fde68a' });
    S.line(k.x - k.r * 1.6, -k.y, k.x + k.r * 1.6, -k.y, { stroke: '#b45309', sw: fs / 20 });
    S.line(k.x, -k.y - k.r * 1.6, k.x, -k.y + k.r * 1.6, { stroke: '#b45309', sw: fs / 20 });
  }
  if (md.el?.type === 'tavan') {
    if (view === 'top') {
      const sec = md.members.filter(m => m.kind === 'CD' && m.axis === 'y' && /Montaj/.test(m.role)).map(m => (m.box[0] + m.box[3]) / 2);
      chain(S, [0, md.dims.W, ...sec], D[3], fs * 2, fs * 0.75);
      const car = md.members.filter(m => /Taşıyıcı/.test(m.role)).map(m => -(m.box[1] + m.box[4]) / 2);
      chain(S, [0, -md.dims.D, ...car], D[2], fs * 2.2, fs * 0.75, true);
      if (md.marks?.length) {
        chain(S, [0, md.dims.W, ...md.marks.map(k => k.x)], D[1], -fs * 2, fs * 0.7);
        chain(S, [0, -md.dims.D, ...md.marks.map(k => -k.y)], D[0], -fs * 1.2, fs * 0.7, true);
      }
    } else {
      const hz = md.members.filter(m => m.axis !== 'z');
      chain(S, [D[1], D[3], ...hz.map(m => -m.box[2])], D[2], fs * 2.2, fs * 0.8, true);
    }
  } else if (view === 'front' || view === 'side') {
    const ax = view === 'front' ? 0 : 1;
    const verts = md.members.filter(m => m.axis === 'z' && (m.group === '' || !m.group));
    const ref = Math.min(...verts.map(m => view === 'front' ? m.box[1] : -m.box[3]));
    const near = verts.filter(m => (view === 'front' ? m.box[1] : -m.box[3]) <= ref + 60);
    const cs = near.map(m => (m.box[ax] + m.box[ax + 3]) / 2);
    const xs = [V.p(md.bounds)[0], ...cs, V.p(md.bounds)[2]];
    if (xs.length > 2 && xs.length < 80) chain(S, xs, D[3], fs * 2, fs * 0.8);
    // yatay elemanların kotları
    const hz = md.members.filter(m => m.axis !== 'z' && (m.box[2] > 60) && (view === 'front' ? m.axis === 'x' : m.axis === 'y'));
    const zs = [D[1], D[3], ...hz.map(m => -m.box[2]), ...hz.map(m => -m.box[5])];
    if (zs.length > 2 && zs.length < 60) chain(S, zs, D[2], fs * 2.2, fs * 0.8, true);
  }
  // boşluklar (duvar)
  if (view === 'front' && md.openings) {
    for (const o of md.openings) {
      const x0 = o.x, x1 = o.x + o.w, y0 = -(o.sill + o.h), y1 = -o.sill;
      S.line(x0, y0, x1, y1, { stroke: '#94a3b8', sw: fs / 25, dash: `${fs / 2} ${fs / 3}` });
      S.line(x0, y1, x1, y0, { stroke: '#94a3b8', sw: fs / 25, dash: `${fs / 2} ${fs / 3}` });
      S.text((x0 + x1) / 2, (y0 + y1) / 2 - fs * 0.6, ({ door: 'KAPI', window: 'PENCERE', pass: 'GEÇİT' })[o.type], { fs, bold: true, color: '#475569', halo: true });
      S.text((x0 + x1) / 2, (y0 + y1) / 2 + fs * 0.7, `${o.w} × ${o.h}`, { fs: fs * 0.8, color: '#475569', halo: true });
    }
  }
  S.text(D[0], D[1] - fs * (md.marks?.length && view === 'top' ? 4.6 : 1.4), `${opt.title || V.label}`, { fs: fs * 1.15, anchor: 'start', bold: true });
  return S;
}

/* ───────── Kaplama (levha yerleşim) görünüşü ───────── */
export function boardView(faceRec, md, opt = {}) {
  const S = new Sheet();
  const { region: R } = faceRec;
  const W = R.u1 - R.u0, H = R.v1 - R.v0;
  const fs = opt.fs || fsFor(W, H) * 0.9;
  const gapX = W + fs * 9;
  faceRec.layers.forEach((L, li) => {
    const ox = li * gapX;
    for (const h of faceRec.holes) S.rect(ox + h.u0, -h.v1, ox + h.u1, -h.v0, { fill: 'url(#hatch)', stroke: '#94a3b8', sw: fs / 25 });
    for (const p of L.pieces) {
      const x0 = ox + p.u, y0 = -(p.v + p.h);
      let d = `M${f1(x0)} ${f1(y0)}h${f1(p.w)}v${f1(p.h)}h${f1(-p.w)}z`;
      for (const n of p.notches) d += `M${f1(x0 + n.u)} ${f1(-(p.v + n.v + n.h))}h${f1(n.w)}v${f1(n.h)}h${f1(-n.w)}z`;
      const b = md.boards.find(b => b.face === faceRec.label && b.layer === L.k && Math.abs(b.pos.u - p.u) < 0.5 && Math.abs(b.pos.v - p.v) < 0.5);
      S.path(d, { fill: BOARDS[faceRec.board].color, stroke: '#1b1f24', sw: fs / 14, pts: [[x0, y0], [x0 + p.w, y0 + p.h]] });
      const cx = x0 + p.w / 2, cy = y0 + p.h / 2;
      const nb = p.notches.find(n => n.w > p.w * 0.6 && n.h > p.h * 0.5);
      const ty = nb ? (nb.v > p.h / 2 ? -(p.v + nb.v / 2) : -(p.v + nb.v + nb.h + (p.h - nb.v - nb.h) / 2)) : cy;
      const small = p.w < fs * 5 || p.h < fs * 2.5;
      const vert = p.w < fs * 5 && p.h > fs * 6;
      S.text(cx, ty - (small ? 0 : fs * 0.3), b?.poz || '', { fs: fs * (small ? 0.6 : 0.95), bold: true, color: '#0b3d48', halo: true, rot: vert ? -90 : 0 });
      if (!small) S.text(cx, ty + fs * 0.9, `${Math.round(p.w)}×${Math.round(p.h)}`, { fs: fs * 0.7, color: '#334155', halo: true });
    }
    if (faceRec.name === 'ceil') for (const k of md.marks || []) S.circle(ox + k.x, -k.y, Math.max(k.r, fs * 0.3), { stroke: '#b45309', sw: fs / 12, fill: '#fde68a' });
    S.rect(ox + R.u0, -R.v1, ox + R.u1, -R.v0, { stroke: '#0f172a', sw: fs / 8 });
    dim(S, ox + R.u0, -R.v0, ox + R.u1, -R.v0, fs * 2.6, fs * 0.8);
    if (li === 0) dim(S, ox + R.u0, -R.v1, ox + R.u0, -R.v0, -fs * 2.2, fs * 0.8);
    // derz aksları zinciri
    const xs = [R.u0, R.u1, ...L.pieces.map(p => p.u), ...L.pieces.map(p => p.u + p.w)].map(x => ox + x);
    chain(S, xs, -R.v0, fs * 1.2, fs * 0.65);
    S.text(ox + R.u0, -R.v1 - fs * 1.1, `${faceRec.label} — ${L.k}. kat${faceRec.layers.length > 1 && L.k === faceRec.layers.length ? ' (dış)' : ''}`, { fs: fs * 1.05, anchor: 'start', bold: true });
  });
  return S;
}

/* ───────── Levha kesim şeması ───────── */
export function sheetView(sheet, SW, SH, type, idx, total) {
  const S = new Sheet(), fs = 46;
  S.rect(0, 0, SW, SH, { fill: '#f8fafc', stroke: '#0f172a', sw: 6 });
  S.rect(0, 0, SW, SH, { fill: 'url(#hatch)', stroke: 'none', sw: 0 });
  for (const p of sheet.placed) {
    const w = p.rot ? p.h : p.w, h = p.rot ? p.w : p.h;
    S.rect(p.x, p.y, p.x + w, p.y + h, { fill: BOARDS[type].color, stroke: '#1b1f24', sw: 4 });
    const vert = w < 260 && h > w;
    const f = Math.min(fs, Math.max(18, Math.min(w, h) / 3.2));
    S.text(p.x + w / 2, p.y + h / 2 - (vert ? 0 : f * 0.15), p.tag, { fs: f, bold: true, rot: vert ? -90 : 0, color: '#0b3d48' });
    if (!vert && h > f * 2.6) S.text(p.x + w / 2, p.y + h / 2 + f, `${p.w}×${p.h}${p.rot ? ' ↻' : ''}${p.notched ? ' ✂' : ''}`, { fs: f * 0.75, color: '#334155' });
  }
  S.text(0, -30, `Levha ${idx}/${total} · ${BOARDS[type].short} ${SW}×${SH} · kullanım %${Math.round(sheet.used * 100)}`, { fs: 52, anchor: 'start', bold: true });
  return S;
}

/* ───────── Profil kesim şeması ───────── */
export function barsView(key, data) {
  const S = new Sheet(), L = data.barLen, rowH = 90, fs = 38;
  data.bars.forEach((b, i) => {
    const y = i * (rowH + 40);
    S.rect(0, y, L, y + rowH, { fill: 'url(#hatch)', stroke: '#0f172a', sw: 3 });
    let x = 0;
    for (const c of b.cuts) {
      S.rect(x, y, x + c.len, y + rowH, { fill: c.tag.includes('-U') ? '#cbd5e1' : c.tag.includes('-CD') ? '#b7e2c9' : '#a5d8e2', stroke: '#1b1f24', sw: 3 });
      if (c.len > 160) S.text(x + c.len / 2, y + rowH / 2 - 4, c.tag.replace(/^[A-Z]+\d+-/, ''), { fs: Math.min(fs, c.len / 5), bold: true });
      if (c.len > 160) S.text(x + c.len / 2, y + rowH / 2 + fs * 0.9, c.len, { fs: Math.min(fs * 0.8, c.len / 6), color: '#334155' });
      x += c.len + 2;
    }
    S.text(-20, y + rowH / 2 + 12, `${i + 1}`, { fs, anchor: 'end', bold: true });
    S.text(L + 20, y + rowH / 2 + 12, `fire ${Math.round(b.rem)}`, { fs: fs * 0.8, anchor: 'start', color: '#b45309' });
  });
  S.text(0, -40, `${key} — ${data.bars.length} boy × ${L} mm`, { fs: 52, anchor: 'start', bold: true });
  return S;
}

/* ───────── Detaylar ───────── */
// Duvar yatay kesiti (katman detayı) — ölçek büyütülmüş
export function wallSection(p, sys, t) {
  const S = new Sheet(), fs = 9;
  const W = sys.web, la = +p.A.layers, lb = +p.B.layers, len = 260;
  let y = 0;
  for (let i = la; i >= 1; i--) { S.rect(0, y, len, y + t, { fill: BOARDS[p.A.board].color, stroke: '#1b1f24', sw: 0.6 }); y += t; }
  const y0 = y;
  if (p.insul !== 'none') S.rect(0, y0, len, y0 + W, { fill: '#fde68a', op: 0.6, stroke: 'none', sw: 0 });
  // C dikme (kesit): gövde + kanatlar
  for (const x of [40, 40 + Math.min(p.s, 600) * 0.3]) {
    S.path(`M${x} ${y0}h50v1.2h-48.8v${W - 2.4}h48.8v1.2h-50z`, { fill: '#2d8fa3', stroke: '#14181d', sw: 0.4, pts: [[x, y0], [x + 50, y0 + W]] });
    S.text(x + 25, y0 + W / 2 + 3, 'C' + p.sys, { fs: fs * 0.8, color: '#fff', bold: true });
  }
  y = y0 + W;
  for (let i = 1; i <= lb; i++) { S.rect(0, y, len, y + t, { fill: BOARDS[p.B.board].color, stroke: '#1b1f24', sw: 0.6 }); y += t; }
  dim(S, len, 0, len, y, 16, fs);
  dim(S, 0, y0, 0, y0 + W, -10, fs * 0.8);
  S.text(len / 2, -6, 'A yüzü', { fs, bold: true });
  S.text(len / 2, y + 12, 'B yüzü', { fs, bold: true });
  if (p.insul !== 'none') S.text(len - 60, y0 + W / 2 + 3, p.insul === 'tasyunu' ? 'taşyünü' : 'camyünü', { fs: fs * 0.8, color: '#92400e' });
  S.text(0, -20, `Duvar kesiti — toplam ${W + t * (la + lb)} mm`, { fs: fs * 1.2, anchor: 'start', bold: true });
  return S;
}

// Taban bağlantı detayı (düşey kesit)
export function floorDetail(sys, t, layersA, layersB) {
  const S = new Sheet(), fs = 7, W = sys.web, uF = sys.uFl;
  const ox = 40;
  S.rect(0, 0, ox * 2 + W + 2 * t * 2 + 40, 30, { fill: '#d6d3d1', stroke: '#57534e', sw: 0.6 }); // döşeme
  S.text(10, 20, 'Döşeme', { fs, anchor: 'start', color: '#44403c' });
  const x0 = ox + layersA * t + 20;
  S.rect(x0, -3, x0 + W, 0, { fill: '#1f2937', stroke: 'none', sw: 0 });
  S.path(`M${x0} ${-3}v${-uF}h0.6v${uF - 0.6}h${W - 1.2}v${-(uF - 0.6)}h0.6v${uF}z`, { fill: '#7a8a99', stroke: '#14181d', sw: 0.3, pts: [[x0, -uF - 3], [x0 + W, -3]] });
  S.rect(x0 + 1, -uF - 3 - 70, x0 + W - 1, -3 - 0.6, { fill: '#2d8fa3', op: 0.35, stroke: '#14181d', sw: 0.3 });
  S.line(x0 + W / 2, -3 - 0.6, x0 + W / 2, 22, { stroke: '#b91c1c', sw: 1.2 });
  let xa = x0;
  for (let i = 0; i < layersA; i++) { xa -= t; S.rect(xa, -10 - 110, xa + t, -10, { fill: '#e9e6df', stroke: '#1b1f24', sw: 0.4 }); }
  let xb = x0 + W;
  for (let i = 0; i < layersB; i++) { S.rect(xb, -10 - 110, xb + t, -10, { fill: '#e9e6df', stroke: '#1b1f24', sw: 0.4 }); xb += t; }
  dim(S, xa, -10, xa, 0, -8, fs * 0.8, '10');
  const lx = xb + 30;
  const lab = (x, y, ly, s) => { S.line(x, y, lx - 2, ly, { stroke: '#334155', sw: 0.3 }); S.text(lx, ly + 2, s, { fs, anchor: 'start' }); };
  lab(x0 + W / 2, -uF - 40, -110, `C${sys.web} dikme`);
  lab(xb - t / 2, -80, -92, 'Alçıpan (zeminden 10 mm boşluk)');
  lab(x0 + W - 3, -uF + 5, -40, `U${sys.web} taban rayı`);
  lab(x0 + W * 0.8, -1.5, -24, 'Sızdırmazlık bandı');
  lab(x0 + W / 2, 12, 8, 'Çakma dübel 6×40, en çok 600 mm');
  S.text(0, -150, 'Detay — taban bağlantısı', { fs: fs * 1.4, anchor: 'start', bold: true });
  return S;
}

// Niş kesiti (yatay) — ön çerçeve, derinlik bağlantısı, arka çerçeve, iç kaplama
export function nicheDetail(sys, t, layers, d) {
  const S = new Sheet(), fs = 8, W = sys.web;
  const nw = 160; // gösterim genişliği
  const L = layers * t;
  // ön yüz levhaları
  S.rect(-80, -L, 0, 0, { fill: '#e9e6df', stroke: '#1b1f24', sw: 0.5 });
  S.rect(nw, -L, nw + 80, 0, { fill: '#e9e6df', stroke: '#1b1f24', sw: 0.5 });
  // kasa dikmeleri
  S.rect(-50, 0, 0, W, { fill: '#d4692a', op: 0.8, stroke: '#14181d', sw: 0.4 });
  S.rect(nw, 0, nw + 50, W, { fill: '#d4692a', op: 0.8, stroke: '#14181d', sw: 0.4 });
  // derinlik bağlantıları
  S.rect(0, W, 50, d - W, { fill: '#2d8fa3', op: 0.6, stroke: '#14181d', sw: 0.4 });
  S.rect(nw - 50, W, nw, d - W, { fill: '#2d8fa3', op: 0.6, stroke: '#14181d', sw: 0.4 });
  // arka çerçeve
  S.rect(0, d - W, 50, d, { fill: '#2d8fa3', op: 0.8, stroke: '#14181d', sw: 0.4 });
  S.rect(nw - 50, d - W, nw, d, { fill: '#2d8fa3', op: 0.8, stroke: '#14181d', sw: 0.4 });
  // iç kaplama
  S.rect(0, -L, t, d - t, { fill: '#e9e6df', stroke: '#1b1f24', sw: 0.5 });
  S.rect(nw - t, -L, nw, d - t, { fill: '#e9e6df', stroke: '#1b1f24', sw: 0.5 });
  S.rect(0, d - t, nw, d, { fill: '#e9e6df', stroke: '#1b1f24', sw: 0.5 });
  // köşe profilleri
  for (const x of [0, nw]) S.path(`M${x - (x ? 0 : 0)} ${-L}m-4 0h8`, { stroke: '#b91c1c', sw: 1.5, pts: [[x - 4, -L], [x + 4, -L]] });
  dim(S, -80, 0, -80, d, -12, fs, `kaba ${d}`);
  dim(S, nw + 80, -L, nw + 80, d - t, 12, fs, `net ${Math.round(d - t + L)}`);
  dim(S, 0, d + 10, nw, d + 10, 14, fs, 'kaba G');
  S.text(nw / 2, (d) / 2, 'NİŞ', { fs: fs * 1.4, bold: true, color: '#64748b' });
  S.text(-80, -L - 22, 'Detay — niş yatay kesiti', { fs: fs * 1.3, anchor: 'start', bold: true });
  S.text(-80, -L - 10, 'Turuncu: kasa dikmesi · Mavi: derinlik bağlantısı / arka çerçeve · Kırmızı: köşe profili', { fs: fs * 0.7, anchor: 'start', color: '#475569' });
  return S;
}

// Asma tavan düşey kesiti — döşeme, askı, taşıyıcı, montaj profili, levha (+ ışık bandı)
export function ceilingDetail(p, t) {
  const S = new Sheet(), fs = 9;
  const pl = Math.min(400, Math.max(120, +p.Hs - +p.Hc)), L = +p.layers;
  const cove = p.cove && +p.coveW > 100, cw = Math.min(+p.coveW, 450), cd = +p.coveDrop, slot = +p.coveSlot;
  const W0 = 0, W1 = cw + 520;
  // y: 0 = tavan alt kotu (ana), yukarı negatif
  S.rect(-60, -pl - 60, W1, -pl, { fill: 'url(#hatch)', stroke: '#57534e', sw: 0.8 });
  S.text(W1 - 10, -pl - 25, 'Döşeme', { fs, anchor: 'end', halo: true });
  S.rect(-60, -pl - 60, 0, cove ? cd + 60 : 60, { fill: '#e7e5e4', stroke: '#57534e', sw: 0.8 });
  S.text(-30, -pl / 2, 'Duvar', { fs, rot: -90 });
  // ana tavan
  const x0 = cove ? cw - 150 : 0;
  S.rect(0, -28, 27, 0, { fill: '#7a8a99', stroke: '#14181d', sw: 0.4 });
  for (let x = 120; x < W1 - 30; x += 160) S.rect(x, -27, x + 60, 0, { fill: '#3d9b6e', op: 0.85, stroke: '#14181d', sw: 0.4 });
  S.rect(10, -54, W1 - 10, -27, { fill: '#3d9b6e', op: 0.5, stroke: '#14181d', sw: 0.4 });
  for (const x of [200, W1 - 120]) S.rect(x - 3, -pl, x + 3, -54, { fill: '#334155', stroke: '#334155', sw: 0.3 });
  for (let k = 0; k < L; k++) S.rect(x0, k * t, W1 + 30, (k + 1) * t, { fill: '#e9e6df', stroke: '#1b1f24', sw: 0.5 });
  if (cove) {
    const fH = Math.max(60, cd - slot);
    // bant: alt yüz, alın
    S.rect(0, cd - 28, 27, cd, { fill: '#7a8a99', stroke: '#14181d', sw: 0.4 });
    S.rect(27, cd - 27, cw - 60, cd, { fill: '#3d9b6e', op: 0.6, stroke: '#14181d', sw: 0.4 });
    S.rect(cw - 60, cd - 27, cw, cd, { fill: '#3d9b6e', op: 0.9, stroke: '#14181d', sw: 0.4 });
    S.rect(cw - 27, cd - fH, cw, cd - 27, { fill: '#3d9b6e', op: 0.7, stroke: '#14181d', sw: 0.4 });
    S.rect(cw - 27, cd - fH, cw, cd - fH + 28, { fill: '#7a8a99', stroke: '#14181d', sw: 0.4 });
    S.rect(cw - 33, L * t, cw - 27, cd - fH, { fill: '#334155', stroke: '#334155', sw: 0.3 });
    S.rect(0, cd, cw, cd + L * t, { fill: '#e9e6df', stroke: '#1b1f24', sw: 0.5 });
    S.rect(cw, cd - fH, cw + L * t, cd + L * t, { fill: '#e9e6df', stroke: '#1b1f24', sw: 0.5 });
    S.rect(cw - 80, cd - 40, cw - 50, cd - 28, { fill: '#facc15', stroke: '#a16207', sw: 0.5 });
    S.text(cw - 65, cd - 46, 'LED', { fs: fs * 0.8, color: '#a16207', bold: true });
    for (let a = 0; a < 3; a++) S.line(cw - 60, cd - 40, cw + 40 + a * 30, L * t + 4, { stroke: '#facc15', sw: 1, dash: '4 3' });
    dim(S, cw + 60, L * t, cw + 60, cd - fH, 16, fs * 0.8, `yarık ${slot}`);
    dim(S, W1 + 30, 0, W1 + 30, cd, 16, fs * 0.8, `${cd}`);
    dim(S, 0, cd + 40, cw, cd + 40, 14, fs * 0.8, `${p.coveW}`);
  }
  dim(S, -60, -pl, -60, 0, -26, fs * 0.8, `plenum ${+p.Hs - +p.Hc}`);
  const lab = (x, y, ly, s) => { S.line(x, y, W1 + 70, ly, { stroke: '#334155', sw: 0.3 }); S.text(W1 + 74, ly + 3, s, { fs, anchor: 'start' }); };
  lab(200, -pl * 0.6, -pl * 0.75, 'Askı (tij + nonius / yaylı askı), çivili dübel');
  lab(W1 - 60, -40, -pl * 0.5, 'Taşıyıcı CD60 (üst kademe)');
  lab(W1 - 80, -12, -pl * 0.3, `Montaj CD60 @ ${p.sec} mm`);
  lab(13, -14, -pl * 0.12, 'Duvar UD28 + sızdırmazlık bandı');
  lab(W1 - 10, t / 2, 30, `Alçıpan ${L} × ${t} mm`);
  S.text(-60, -pl - 80, 'Detay — asma tavan düşey kesiti', { fs: fs * 1.4, anchor: 'start', bold: true });
  return S;
}

/* ───────── Birleşim (montaj) detayları ─────────
 * j: birleşim kaydı (importer.findJoints), c: { sysA, sysB, t, la, lb } — plan ya da kesit, mm. */
export function jointDetail(j, c) {
  const S = new Sheet(), fs = 14, t = c.t;
  const WA = c.sysA || 75, WB = c.sysB || WA, la = c.la || 1, lb = c.lb || 1;
  const board = (x0, y0, x1, y1) => S.rect(x0, y0, x1, y1, { fill: '#e9e6df', stroke: '#1b1f24', sw: 0.5 });
  const stud = (x0, y0, x1, y1, col = '#2d8fa3') => S.rect(x0, y0, x1, y1, { fill: col, op: 0.85, stroke: '#14181d', sw: 0.4 });
  const tape = (x0, y0, x1, y1) => S.rect(x0, y0, x1, y1, { fill: '#111827', stroke: 'none', sw: 0 });
  const labels = [];
  const lab = (x, y, s) => labels.push([x, y, s]);
  const title = s => S.text(-20, -WA - 90, s, { fs: fs * 1.3, anchor: 'start', bold: true });
  const TA = WA + t * 2 * la;
  if (j.type === 'T' || j.type === 'L' || j.type === 'I' || j.type === 'free') {
    // ana duvar (yatay bant): y = 0 … WA, levhalar iki yüzde
    const x1 = j.type === 'L' || j.type === 'free' ? 420 : 520;
    const x0 = j.type === 'L' || j.type === 'free' ? 0 : -120;
    for (let k = 0; k < la; k++) { board(x0, -t * (k + 1), x1, -t * k); board(x0, WA + t * k, x1, WA + t * (k + 1)); }
    if (j.type === 'free') {
      stud(0, 0, 50, WA, '#d4692a');
      S.rect(-2, -t * la, 0, WA + t * la, { fill: '#7a8a99', stroke: '#14181d', sw: 0.3 });
      board(-t * la, -t * la, 0, WA + t * la);
      for (const y of [-t * la, WA + t * la]) S.path(`M${-t * la - 4} ${y}h8`, { stroke: '#b91c1c', sw: 2, pts: [[-t * la - 4, y], [-t * la + 4, y]] });
      stud(400, 0, 450, WA);
      lab(25, WA / 2, 'Uç dikmesi (C, gerekirse C+U takviyeli)');
      lab(-t * la / 2, WA / 2 + 20, 'Uç kapama levhası');
      lab(-t * la, -t * la, 'Köşe profili (iki köşe)');
      title('Detay — serbest duvar ucu (plan)');
    } else {
      for (const x of [x0 + 20, x1 - 70]) stud(x, 0, x + 50, WA);
      if (j.type === 'I') {
        stud(195, 0, 245, WA, '#d4692a'); stud(245, 0, 295, WA, '#d4692a');
        S.line(245, -t * la - 6, 245, WA + t * la + 6, { stroke: '#b91c1c', sw: 0.6, dash: '4 3' });
        lab(220, WA / 2, 'Uç dikmeleri sırt sırta, 300 mm aralıkla LN vida');
        lab(245, -t * la, 'Levha derzi uç dikmesine gelmez — derzler kaydırılır');
        title('Detay — aynı doğrultuda duvar eki (plan)');
      } else {
        // dik gelen duvar: y = WA + t·la … aşağı
        const bx = j.type === 'L' ? 0 : 200, yb = WA + t * la;
        const TB = WB + t * 2 * lb;
        for (let k = 0; k < lb; k++) { board(bx - t * (k + 1), yb, bx - t * k, yb + 380); board(bx + WB + t * k, yb, bx + WB + t * (k + 1), yb + 380); }
        tape(bx, yb, bx + WB, yb + 1.5);
        stud(bx, yb + 1.5, bx + WB, yb + 51.5, '#2d8fa3');
        stud(bx, yb + 300, bx + WB, yb + 350);
        if (j.type === 'T') {
          stud(bx + WB / 2 - 25, 0, bx + WB / 2 + 25, WA, '#7c3aed');
          lab(bx + WB / 2, WA / 2, 'Bağlantı dikmesi (ilave C) — birleşim aksında');
          lab(bx + WB / 2, yb + 26, 'Bitiş dikmesi, levhadan geçen TN 3,5×35 vida ile bağlantı dikmesine');
          lab(bx + WB * 0.8, yb + 1, 'Sızdırmazlık bandı');
          title(`Detay — T birleşimi (plan)${j.pos != null ? ` · aks ${j.pos} mm` : ''}`);
        } else {
          stud(0, 0, 50, WA, '#d4692a');
          stud(bx + WB + t * lb + 10, 0, bx + WB + t * lb + 60, WA, '#7c3aed');
          S.path(`M${-t * lb - 4} ${-t * la}h8`, { stroke: '#b91c1c', sw: 2, pts: [[-t * lb - 4, -t * la], [-t * lb + 4, -t * la]] });
          board(-t * lb, -t * la, 0, WA + t * la);
          lab(25, WA / 2, 'Köşe dikmesi');
          lab(bx + WB + t * lb + 35, WA / 2, 'İlave dikme (iç köşe levha tespiti)');
          lab(-t * lb, -t * la, 'Köşe profili (dış köşe)');
          lab(bx + WB / 2, yb + 26, 'Bitiş dikmesi, köşe dikmesine LN / TN vida');
          title('Detay — L köşe birleşimi (plan)');
        }
        dim(S, bx - t * lb, yb + 400, bx + WB + t * lb, yb + 400, 14, fs * 0.8, `${Math.round(TB)}`);
      }
    }
    dim(S, x1 + 10, -t * la, x1 + 10, WA + t * la, 16, fs * 0.8, `${Math.round(TA)}`);
  } else if (j.type === 'ceiling') {
    // düşey kesit: duvar (düşey), asma tavan iki yanda
    const zc = 0, H = 420;
    for (let k = 0; k < la; k++) { board(-t * (k + 1), -H, -t * k, 160); board(WA + t * k, -H, WA + t * (k + 1), 160); }
    stud(0, -H, WA, 160);
    S.rect(-160, -H - 40, WA + 220, -H, { fill: 'url(#hatch)', stroke: '#57534e', sw: 0.8 });
    stud(5, zc - 40, WA - 5, zc, '#7c3aed');
    for (const sgn of [-1, 1]) {
      const xw = sgn < 0 ? -t * la : WA + t * la;
      S.rect(sgn < 0 ? xw - 28 : xw, zc - 28, sgn < 0 ? xw : xw + 28, zc, { fill: '#7a8a99', stroke: '#14181d', sw: 0.3 });
      S.rect(sgn < 0 ? xw - 170 : xw + 28, zc - 27, sgn < 0 ? xw - 28 : xw + 170, zc, { fill: '#3d9b6e', op: 0.7, stroke: '#14181d', sw: 0.3 });
      board(sgn < 0 ? xw - 170 : xw, zc, sgn < 0 ? xw : xw + 170, zc + t);
    }
    lab(WA / 2, zc - 20, 'İlave U kuşak (duvar içinde, tavan kotunda)');
    lab(WA + t * la + 14, zc - 14, 'UD28 + sızdırmazlık bandı, kuşağa vida 600 mm');
    lab(WA / 2, -H + 20, j.through === false ? 'Duvar tavanda biter: üst ray tavan karkasına' : 'Duvar döşemeye kadar devam eder');
    lab(WA + t * la + 100, zc + t, 'Tavan levhası — duvar levhasına akrilik derz');
    title('Detay — duvar / asma tavan birleşimi (kesit)');
  } else if (j.type === 'wallfix') {
    S.rect(-80, -60, 520, 0, { fill: 'url(#hatch)', stroke: '#57534e', sw: 0.8 });
    tape(0, 0, 420, 2);
    for (const x of [0, 180, 370]) stud(x, 2, x + 50, 2 + WB, x === 0 ? '#d4692a' : '#2d8fa3');
    for (let k = 0; k < lb; k++) board(-t, 2 + WB + t * k, 420 + t, 2 + WB + t * (k + 1));
    board(-t * lb, 2, 0, 2 + WB + t * lb);
    for (const x of [205, 395]) S.line(x, -50, x, 2 + WB, { stroke: '#b91c1c', sw: 1.2 });
    lab(205, -30, 'Arka çerçeve: dübel 600 mm (duvara / mevcut karkasa)');
    lab(300, 1, 'Sızdırmazlık bandı');
    lab(25, WB / 2, 'Köşe dikmesi');
    title('Detay — mobilya / duvar bağlantısı (plan)');
  }
  // açıklama satırları
  const bb = S.bbox(), lx = bb[2] + 40;
  labels.forEach(([x, y, s], i) => {
    const ly = bb[1] + 40 + i * fs * 1.9;
    S.line(x, y, lx - 4, ly - 3, { stroke: '#334155', sw: 0.3 });
    S.text(lx, ly, s, { fs, anchor: 'start' });
  });
  return S;
}
