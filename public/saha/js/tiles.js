/* ═══ Seramik / karo döşeme hesabı — birim: cm (derz mm) ═══
   Oda çokgeni üzerine gerçek yerleşim yapılır: her karo odayla kesiştirilir, tam / kesik karo sayılır. */
import { polyArea, polyCentroid } from './plan-geom.js';

/* boyut: [en, boy, kutu adedi, kalınlık mm] */
export const TILE_SIZES = [
  [30, 30, 11, 8], [33, 33, 9, 8], [45, 45, 5, 8.5], [30, 60, 8, 9], [60, 60, 4, 9], [80, 80, 3, 10],
  [60, 120, 2, 10], [120, 120, 1, 10], [75, 150, 1, 10], [20, 120, 6, 9], [15, 90, 10, 9], [10, 10, 100, 6],
];
export const TILE_PATTERNS = [
  { k: 'duz',    t: 'Düz (ızgara)' },
  { k: 'yarim',  t: 'Şaşırtmalı (1/2 kaydırma)' },
  { k: 'ucte',   t: '1/3 kaydırmalı' },
  { k: 'capraz', t: 'Çapraz (45°)' },
  { k: 'balik',  t: 'Balıksırtı', rect: true },
];
export const TILE_JOINTS = [1, 1.5, 2, 3, 4, 5, 8, 10];   // mm
export const TILE_FLOORS = ['seramik', 'mermer', 'traverten', 'dis'];
export const tileable = room => TILE_FLOORS.includes(room?.floor);

const sizeKey = (w, l) => `${w}x${l}`;
export function tileDefaults() { return { s: '60x60', w: 60, l: 60, pat: 'duz', g: 2, start: 'orta', rot: false, fire: 5, box: 4, th: 9, skirt: false, skH: 8 }; }
export function tileOf(room) { return { ...tileDefaults(), ...(room.tile || {}) }; }
/* boyut seçimi: hazır boyutta kutu adedi ve kalınlık da gelir */
export function applySize(t, s) {
  t.s = s; const z = TILE_SIZES.find(x => sizeKey(x[0], x[1]) === s);
  if (z) Object.assign(t, { w: z[0], l: z[1], box: z[2], th: z[3] });
  if (t.l === t.w && t.pat === 'balik') t.pat = 'duz';
}

/* Sutherland–Hodgman: çokgeni eksenlere paralel dikdörtgene kırp */
function clipRect(pts, x0, y0, x1, y1) {
  let out = pts;
  const edges = [[p => p.x >= x0, (a, b) => ({ x: x0, y: a.y + (b.y - a.y) * (x0 - a.x) / (b.x - a.x) })],
    [p => p.x <= x1, (a, b) => ({ x: x1, y: a.y + (b.y - a.y) * (x1 - a.x) / (b.x - a.x) })],
    [p => p.y >= y0, (a, b) => ({ x: a.x + (b.x - a.x) * (y0 - a.y) / (b.y - a.y), y: y0 })],
    [p => p.y <= y1, (a, b) => ({ x: a.x + (b.x - a.x) * (y1 - a.y) / (b.y - a.y), y: y1 })]];
  for (const [inside, cut] of edges) {
    const src = out; out = [];
    if (!src.length) break;
    for (let i = 0; i < src.length; i++) {
      const a = src[(i + src.length - 1) % src.length], b = src[i], ia = inside(a), ib = inside(b);
      if (ib) { if (!ia) out.push(cut(a, b)); out.push(b); } else if (ia) out.push(cut(a, b));
    }
  }
  return out;
}

const rotP = (p, c, a) => { const s = Math.sin(a), k = Math.cos(a), x = p.x - c.x, y = p.y - c.y; return { x: c.x + x * k - y * s, y: c.y + x * s + y * k }; };

/* yerleşim: karolar (dünya koordinatında 4 köşe) + sayım */
export function tileLayout(room, opt = {}) {
  const t = tileOf(room), pts = room.pts;
  const g = (t.g || 0) / 10;                                   // mm → cm
  let a = Math.max(1, +t.w || 60), b = Math.max(1, +t.l || 60);
  if (t.rot) [a, b] = [b, a];
  const pat = (t.pat === 'balik' && a === b) ? 'duz' : t.pat;
  const A = a + g, B = b + g;                                   // modül (karo + derz)
  const C = polyCentroid(pts), ang = pat === 'capraz' ? Math.PI / 4 : 0;
  const loc = ang ? pts.map(p => rotP(p, C, -ang)) : pts;      // çapraz: oda karo eksenine döndürülür
  const xs = loc.map(p => p.x), ys = loc.map(p => p.y);
  const bx0 = Math.min(...xs), by0 = Math.min(...ys), bx1 = Math.max(...xs), by1 = Math.max(...ys);
  const tileA = a * b, rects = [];
  // başlangıç noktası: ortadan (karo odanın ortasında) ya da köşeden (sol üst köşede tam karo)
  const ox = t.start === 'kose' ? bx0 : C.x - a / 2, oy = t.start === 'kose' ? by0 : C.y - b / 2;
  if (pat === 'balik') {
    // balıksırtı: yatay karo + yanında dikey karo; öteleme vektörleri (K,-K) ve (U,U) — U uzun, K kısa modül
    const u = Math.max(a, b), k = Math.min(a, b), U = u + g, K = k + g;
    const R = Math.hypot(bx1 - bx0, by1 - by0) + U + K, n2 = Math.ceil(R / U) + 2, n1 = Math.ceil(R / K) * 2 + 2;
    for (let i = -n1; i <= n1; i++) for (let j = -n2; j <= n2; j++) {
      const dx = i * K + j * U, dy = -i * K + j * U;
      const x = ox + (t.rot ? dy : dx), y = oy + (t.rot ? dx : dy);   // 90° çevrik: desen köşegene göre aynalanır
      if (x > bx1 + U || y > by1 + U || x + U + K < bx0 || y + U + K < by0) continue;
      if (t.rot) rects.push([x, y, k, u], [x, y + U, u, k]);
      else rects.push([x, y, u, k], [x + U, y, k, u]);
    }
  } else {
    const off = pat === 'yarim' ? 0.5 : pat === 'ucte' ? 1 / 3 : 0;
    const j0 = Math.floor((by0 - oy) / B) - 1, j1 = Math.ceil((by1 - oy) / B) + 1;
    for (let j = j0; j <= j1; j++) {
      const sh = ((j * off) % 1 + 1) % 1 * A, y = oy + j * B;
      const i0 = Math.floor((bx0 - ox - sh) / A) - 1, i1 = Math.ceil((bx1 - ox - sh) / A) + 1;
      for (let i = i0; i <= i1; i++) rects.push([ox + sh + i * A, y, a, b]);
    }
  }
  const tiles = []; let full = 0, cuts = [], cover = 0;
  for (const [x, y, w, h] of rects) {
    if (x > bx1 || y > by1 || x + w < bx0 || y + h < by0) continue;
    const c = clipRect(loc, x, y, x + w, y + h); if (c.length < 3) continue;
    const ar = Math.abs(polyArea(c)), f = ar / (w * h);
    if (f < 0.002) continue;
    cover += ar;
    const isFull = f > 0.995;
    if (isFull) full++; else cuts.push(f);
    if (opt.geom !== false) {
      const q = [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }];
      tiles.push({ pts: ang ? q.map(p => rotP(p, C, ang)) : q, cut: !isFull, f });
    }
    if (full + cuts.length > 40000) break;
  }
  // küçük parçalar (≤ yarım karo) ikişer ikişer aynı karodan kesilir
  const small = cuts.filter(f => f <= 0.5).length;
  const used = full + cuts.length - Math.floor(small / 2);
  const order = Math.ceil(used * (1 + (+t.fire || 0) / 100));
  const area = Math.abs(polyArea(pts)) / 1e4;
  // süpürgelik aynı karodan: karo boyundan şerit
  let skirt = null;
  if (t.skirt && opt.perimNet) {
    const L = Math.max(a, b), S = Math.min(a, b), per = Math.max(1, Math.floor((S + 0.0001) / ((+t.skH || 8) + 0.3)));
    const pieces = Math.ceil(opt.perimNet * 100 / (L + g)), n = Math.ceil(pieces / per);
    skirt = { pieces, perTile: per, tiles: Math.ceil(n * (1 + (+t.fire || 0) / 100)), len: opt.perimNet };
  }
  const total = order + (skirt ? skirt.tiles : 0);
  const m2 = total * tileA / 1e4;
  const boxes = t.box > 0 ? Math.ceil(total / t.box) : 0;
  // yapıştırıcı: kenar uzunluğuna göre kg/m², derz dolgu: (A+B)/(A·B)·kalınlık·derz·1,6 (mm → kg/m²)
  const big = Math.max(a, b), glue = big <= 30 ? 4 : big <= 60 ? 5 : 7;
  const glueKg = area * glue * 1.05, groutKg = g > 0 ? area * ((a + b) * 10) / (a * b * 100) * (+t.th || 9) * (t.g || 0) * 1.6 * 1.1 : 0;
  return {
    t: { ...t, pat }, a, b, tiles, full, cut: cuts.length, small, used, order, skirt, total, m2, boxes, area,
    coverM2: cover / 1e4, wasteP: area > 0 ? (order * tileA / 1e4 / area - 1) * 100 : 0,
    glueKg, glueBags: Math.ceil(glueKg / 25), groutKg, groutBags: Math.ceil(groutKg / 5),
  };
}

/* önizleme: oda çokgeni + karolar (kesikler vurgulu) */
export function tilePreviewSvg(room, L, { w = 280, h = 200 } = {}) {
  const pts = room.pts, xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  const x0 = Math.min(...xs), y0 = Math.min(...ys), W = Math.max(...xs) - x0, H = Math.max(...ys) - y0;
  const pad = Math.max(W, H) * 0.04, vb = `${x0 - pad} ${y0 - pad} ${W + pad * 2} ${H + pad * 2}`;
  const poly = pts.map(p => `${p.x},${p.y}`).join(' ');
  const id = 'tc' + Math.random().toString(36).slice(2, 8), sw = Math.max(W, H) / 400;
  const path = cut => L.tiles.filter(q => q.cut === cut).map(q => `M${q.pts.map(p => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join('L')}Z`).join('');
  return `<svg class="tile-prev" viewBox="${vb}" width="100%" height="${h}" preserveAspectRatio="xMidYMid meet">
    <defs><clipPath id="${id}"><polygon points="${poly}"/></clipPath></defs>
    <polygon points="${poly}" fill="#8E959E"/>
    <g clip-path="url(#${id})"><path d="${path(false)}" fill="#EFEBE4" stroke="#B9B3AA" stroke-width="${sw}"/><path d="${path(true)}" fill="#F6C9A8" stroke="#D99A6C" stroke-width="${sw}"/></g>
    <polygon points="${poly}" fill="none" stroke="#16171A" stroke-width="${sw * 2}"/></svg>`;
}

/* planda derz çizgileri */
export function tilePlanPath(L) {
  return L.tiles.map(q => `M${q.pts.map(p => `${+p.x.toFixed(1)} ${+p.y.toFixed(1)}`).join('L')}Z`).join('');
}
