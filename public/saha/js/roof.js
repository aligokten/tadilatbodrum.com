/* ═══ Çatı oluşturucu — birim: cm ═══
   Çatı oturma hattı (dış duvar hattı) → çatı tipine göre eğim düzlemleri → yüzey z(p) = max_grup(min_düzlem).
   Dik açılı (ortogonal) hatlar en büyük dikdörtgenlere ayrılır; her dikdörtgen kendi kırma / beşik / piramit
   çatısını taşır, kesişimleri dereleri oluşturur. Düzlem bölgeleri ince bir ızgarada etiketlenir; mahya, kırma,
   dere çizgileri iki düzlemin kesişim doğrusu olarak tam hesaplanır. Karkas (mertek, aşık, dikme), örtü ve
   katman metrajı, plan / karkas / kesit / katman çizimleri ve 3D yüzeyler buradan üretilir. */
import { V, polyArea, polyCentroid, pointInPoly, offsetPoly } from './plan-geom.js';

export const ROOF_TYPES = [
  { k: 'kirma', t: 'Kırma çatı' },
  { k: 'besik', t: 'Beşik çatı (kalkanlı)' },
  { k: 'tek', t: 'Tek eğimli (sundurma)' },
  { k: 'piramit', t: 'Piramit (tepe noktalı)' },
  { k: 'duz', t: 'Düz çatı / teras' },
];
export const COVERS = {
  marsilya: { t: 'Marsilya kiremit', c: '#B4553A', kind: 'tile', perM2: 13, batten: 34, minSlope: 30 },
  alaturka: { t: 'Alaturka (oluklu) kiremit', c: '#A9492F', kind: 'tile', perM2: 32, batten: 0, minSlope: 35 },
  shingle:  { t: 'Shingle (bitümlü)', c: '#3D3F45', kind: 'shingle', pack: 3.1, minSlope: 20 },
  sandvic:  { t: 'Sandviç panel (40 mm)', c: '#8E969E', kind: 'panel', minSlope: 10 },
  trapez:   { t: 'Trapez sac', c: '#9AA4AC', kind: 'panel', minSlope: 10 },
  membran:  { t: 'Bitümlü membran (teras)', c: '#5E6267', kind: 'flat', minSlope: 0 },
};
/* katman kütüphanesi (alttan üste): th mm, q: metraj türü */
export const LAYERS = {
  tavan:   { t: 'Alçıpan / lambri tavan kaplaması', th: 12.5, q: 'area', c: '#EDE8E0' },
  buhar:   { t: 'Buhar dengeleyici örtü', th: 0.3, q: 'roll', roll: 75, c: '#8FB7C9' },
  yalitim: { t: 'Isı yalıtımı (taşyünü, mertek arası)', th: 100, q: 'area', c: '#E7C86A' },
  mertek:  { t: 'Mertek (ahşap karkas)', th: 150, q: 'frame', c: '#C8A06A' },
  osb:     { t: 'OSB-3 levha 18 mm', th: 18, q: 'sheet', sheet: 2.9768, c: '#D2B07C' },
  membran: { t: 'Su yalıtım örtüsü (nefes alan membran)', th: 0.6, q: 'roll', roll: 75, c: '#4F7A96' },
  kontra:  { t: 'Kontra çıta 2,5 × 5 cm', th: 25, q: 'contra', c: '#B88D58' },
  cita:    { t: 'Kiremit çıtası 3 × 5 cm', th: 30, q: 'batten', c: '#A97E4B' },
  orti:    { t: 'Çatı örtüsü', th: 20, q: 'cover', c: '#B4553A' },
  beton:   { t: 'Betonarme çatı döşemesi', th: 150, q: 'area', c: '#B9BCBF' },
  egim:    { t: 'Eğim betonu (%2)', th: 50, q: 'area', c: '#CFCFC9' },
  bitum:   { t: 'Bitümlü su yalıtım membranı (2 kat)', th: 8, q: 'roll2', roll: 10, c: '#3E4247' },
  xps:     { t: 'XPS ısı yalıtım levhası', th: 50, q: 'area', c: '#9CC7E8' },
  keceli:  { t: 'Geotekstil keçe', th: 2, q: 'area', c: '#D9D4CB' },
  koruma:  { t: 'Koruma şapı / çakıl', th: 50, q: 'area', c: '#A8A39A' },
};
const STACKS = {
  tile:    ['tavan', 'yalitim', 'buhar', 'mertek', 'osb', 'membran', 'kontra', 'cita', 'orti'],
  shingle: ['tavan', 'yalitim', 'buhar', 'mertek', 'osb', 'membran', 'orti'],
  panel:   ['mertek', 'orti'],
  flat:    ['beton', 'egim', 'bitum', 'xps', 'keceli', 'koruma'],
};
export const FRAME_DEF = { rafterSp: 60, rafterB: 5, rafterH: 15, purlinSp: 250, purlinB: 10, purlinH: 15, ridgeB: 10, ridgeH: 20, postSp: 300, postB: 10 };

export function newRoof(id, pts, o = {}) {
  return { id, pts: pts.map(p => ({ x: +p.x.toFixed(1), y: +p.y.toFixed(1) })), type: 'kirma', slope: 33, overhang: 50, ridge: 'auto', low: 'down',
    cover: 'marsilya', parapet: 80, base: 0, lay: {}, frame: { ...FRAME_DEF }, show: { frame: false }, ...o };
}
export const coverOf = r => COVERS[r.type === 'duz' ? 'membran' : r.cover] || COVERS.marsilya;
/* etkin katmanlar (alttan üste) */
export function roofLayers(r) {
  const cv = coverOf(r), st = STACKS[r.type === 'duz' ? 'flat' : cv.kind] || STACKS.tile;
  return st.map(k => {
    const L = LAYERS[k], o = r.lay?.[k] || {};
    return { k, ...L, t: k === 'orti' ? cv.t : L.t, c: k === 'orti' ? cv.c : L.c, th: o.th ?? (k === 'mertek' ? (r.frame?.rafterH ?? 15) * 10 : L.th), on: o.on !== false };
  });
}

const rot = (p, a) => ({ x: p.x * Math.cos(a) - p.y * Math.sin(a), y: p.x * Math.sin(a) + p.y * Math.cos(a) });
const TAU = Math.PI * 2;

/* yerel eksen: en uzun kenar yönü (±45° içine indirgenmiş), merkez = ağırlık merkezi */
function frameOf(pts) {
  let best = 0, ang = 0;
  pts.forEach((a, i) => { const b = pts[(i + 1) % pts.length], L = V.dist(a, b); if (L > best) { best = L; ang = Math.atan2(b.y - a.y, b.x - a.x); } });
  ang = ((ang % (Math.PI / 2)) + Math.PI / 2) % (Math.PI / 2); if (ang > Math.PI / 4) ang -= Math.PI / 2;
  const C = polyCentroid(pts);
  return { ang, C, toL: p => rot(V.sub(p, C), -ang), toW: q => V.add(rot(q, ang), C) };
}

/* dik açılı mı: tüm kenarlar ±2,5° içinde yatay / dikeyse kenar doğrularını hizalayıp köşeleri yeniden kurar */
function orthoize(L) {
  const n = L.length, tol = Math.tan(2.5 * Math.PI / 180), edges = [];
  for (let i = 0; i < n; i++) {
    const a = L[i], b = L[(i + 1) % n], dx = b.x - a.x, dy = b.y - a.y;
    if (Math.abs(dx) < 0.05 && Math.abs(dy) < 0.05) continue;
    if (Math.abs(dy) <= Math.abs(dx) * tol) edges.push({ o: 'h', v: (a.y + b.y) / 2 });
    else if (Math.abs(dx) <= Math.abs(dy) * tol) edges.push({ o: 'v', v: (a.x + b.x) / 2 });
    else return null;
  }
  const E = [];   // eş doğrultulu ardışık kenarları birleştir
  for (const e of edges) { const l = E.at(-1); if (l && l.o === e.o && Math.abs(l.v - e.v) < 2) { l.v = (l.v + e.v) / 2; continue; } E.push({ ...e }); }
  while (E.length > 1 && E[0].o === E.at(-1).o) { E[0].v = (E[0].v + E.at(-1).v) / 2; E.pop(); }
  if (E.length < 4) return null;
  const out = [];
  for (let i = 0; i < E.length; i++) {
    const p = E[(i - 1 + E.length) % E.length], c = E[i];
    if (p.o === c.o) return null;
    out.push(p.o === 'h' ? { x: c.v, y: p.v } : { x: p.v, y: c.v });
  }
  return out;
}

/* dik açılı çokgeni kapsayan en büyük dikdörtgenler */
function rectCover(L) {
  const r1 = v => Math.round(v * 10) / 10;
  const xs = [...new Set(L.map(p => r1(p.x)))].sort((a, b) => a - b), ys = [...new Set(L.map(p => r1(p.y)))].sort((a, b) => a - b);
  const nx = xs.length - 1, ny = ys.length - 1; if (nx < 1 || ny < 1) return null;
  const S = Array.from({ length: nx + 1 }, () => new Int32Array(ny + 1));
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
    const inside = pointInPoly({ x: (xs[i] + xs[i + 1]) / 2, y: (ys[j] + ys[j + 1]) / 2 }, L) ? 1 : 0;
    S[i + 1][j + 1] = inside + S[i][j + 1] + S[i + 1][j] - S[i][j];
  }
  const full = (i0, i1, j0, j1) => i0 >= 0 && j0 >= 0 && i1 <= nx && j1 <= ny && S[i1][j1] - S[i0][j1] - S[i1][j0] + S[i0][j0] === (i1 - i0) * (j1 - j0);
  const out = [];
  for (let i0 = 0; i0 < nx; i0++) for (let i1 = i0 + 1; i1 <= nx; i1++) for (let j0 = 0; j0 < ny; j0++) for (let j1 = j0 + 1; j1 <= ny; j1++) {
    if (!full(i0, i1, j0, j1)) continue;
    if (full(i0 - 1, i1, j0, j1) || full(i0, i1 + 1, j0, j1) || full(i0, i1, j0 - 1, j1) || full(i0, i1, j0, j1 + 1)) continue;
    out.push({ x0: xs[i0], x1: xs[i1], y0: ys[j0], y1: ys[j1] });
    if (out.length > 40) return null;
  }
  return out;
}
const isConvex = L => { let s = 0; for (let i = 0; i < L.length; i++) { const a = L[i], b = L[(i + 1) % L.length], c = L[(i + 2) % L.length]; const cr = V.cross(V.sub(b, a), V.sub(c, b)); if (Math.abs(cr) < 1e-6) continue; if (!s) s = Math.sign(cr); else if (Math.sign(cr) !== s) return false; } return true; };

/* eğim düzlemi: z = ax·x + ay·y + c (yerel), e: saçak doğrusu üzerinde nokta, n: içe birim normal */
const edgePlane = (e, n, s) => ({ ax: s * n.x, ay: s * n.y, c: -s * (n.x * e.x + n.y * e.y) });
const pv = (P, p) => P.ax * p.x + P.ay * p.y + P.c;

/* çatı modeli (önbellekli) */
const cache = new Map();
export function roofModel(r) {
  const key = JSON.stringify([r.pts, r.type, r.slope, r.overhang, r.ridge, r.low]);
  if (cache.has(key)) return cache.get(key);
  const m = build(r);
  cache.set(key, m); if (cache.size > 30) cache.delete(cache.keys().next().value);
  return m;
}

function build(r) {
  if (!r.pts || r.pts.length < 3 || Math.abs(polyArea(r.pts)) < 1e4) return null;
  const F = frameOf(r.pts);
  let L = r.pts.map(F.toL);
  if (polyArea(L) < 0) L = L.slice().reverse();
  const O = orthoize(L), ortho = !!O; if (O) L = O;
  const s = r.type === 'duz' ? 0 : Math.max(0.01, (+r.slope || 33) / 100), ov = Math.max(0, +r.overhang || 0);
  const xs = L.map(p => p.x), ys = L.map(p => p.y), bb = { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
  const warn = [];
  // grupları kur
  const groups = [];
  const rectGroup = R => {
    const w = R.x1 - R.x0, h = R.y1 - R.y0, E = { b: [{ x: R.x0, y: R.y0 }, { x: 0, y: 1 }], t: [{ x: R.x0, y: R.y1 }, { x: 0, y: -1 }], l: [{ x: R.x0, y: R.y0 }, { x: 1, y: 0 }], rr: [{ x: R.x1, y: R.y0 }, { x: -1, y: 0 }] };
    const pl = (k, ss = s) => ({ ...edgePlane(E[k][0], E[k][1], ss), edge: k });
    if (r.type === 'besik') {
      const alongX = r.ridge === 'x' || (r.ridge !== 'y' && w >= h);
      return alongX ? { R, planes: [pl('b'), pl('t')], clip: { ax: 'x', lo: R.x0 - ov, hi: R.x1 + ov }, gable: 'x' } : { R, planes: [pl('l'), pl('rr')], clip: { ax: 'y', lo: R.y0 - ov, hi: R.y1 + ov }, gable: 'y' };
    }
    if (r.type === 'piramit') {
      const H = s * Math.min(w, h) / 2, sx = H / (w / 2), sy = H / (h / 2);
      return { R, planes: [pl('b', sy), pl('t', sy), pl('l', sx), pl('rr', sx)] };
    }
    return { R, planes: [pl('b'), pl('t'), pl('l'), pl('rr')] };
  };
  if (r.type === 'tek' || r.type === 'duz') {
    const d = { down: { x: 0, y: 1 }, up: { x: 0, y: -1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } }[r.low] || { x: 0, y: 1 };
    const dmax = Math.max(...L.map(p => p.x * d.x + p.y * d.y));
    groups.push({ planes: [{ ax: -s * d.x, ay: -s * d.y, c: s * dmax }], shed: d });
  } else if (ortho) {
    const rects = rectCover(L);
    if (rects) rects.forEach(R => groups.push(rectGroup(R)));
    else { warn.push('Çatı hattı çok parçalı; dış çerçeve dikdörtgeni kullanıldı.'); groups.push(rectGroup(bb)); }
  } else if (r.type === 'kirma' && isConvex(L)) {
    const n = L.length;
    groups.push({ planes: L.map((a, i) => { const b = L[(i + 1) % n], u = V.norm(V.sub(b, a)); return edgePlane(a, { x: -u.y, y: u.x }, s); }) });
  } else {
    warn.push('Çatı hattı dik açılı değil; çatı dış çerçeve dikdörtgenine göre oluşturuldu.');
    groups.push(rectGroup(bb));
  }
  // beşik: dik kesişen kanatlarda küçük kanat, büyük kanadın mahyasında biter (2 dere; dış köşeye kalkan çıkmaz)
  if (r.type === 'besik' && groups.length > 1) {
    const span = g => g.gable === 'x' ? g.R.x1 - g.R.x0 : g.R.y1 - g.R.y0, area = g => (g.R.x1 - g.R.x0) * (g.R.y1 - g.R.y0);
    const gs = groups.filter(g => g.R && g.clip).sort((a, b) => span(b) - span(a) || area(b) - area(a));
    for (let i = 1; i < gs.length; i++) for (let j = 0; j < i; j++) {
      const A = gs[j], B = gs[i]; if (A.gable === B.gable) continue;
      const ar = A.gable === 'x' ? (A.R.y0 + A.R.y1) / 2 : (A.R.x0 + A.R.x1) / 2;
      const [lo, hi] = B.gable === 'x' ? [B.R.x0, B.R.x1] : [B.R.y0, B.R.y1], [alo, ahi] = B.gable === 'x' ? [A.R.x0, A.R.x1] : [A.R.y0, A.R.y1];
      const [olo, ohi] = B.gable === 'x' ? [B.R.y0, B.R.y1] : [B.R.x0, B.R.x1], [oalo, oahi] = B.gable === 'x' ? [A.R.y0, A.R.y1] : [A.R.x0, A.R.x1];
      if (ohi <= oalo || olo >= oahi) continue;   // diğer eksende örtüşmüyor
      if (lo >= alo - 1 && lo <= ahi + 1) B.clip.lo = Math.max(B.clip.lo, ar);
      if (hi >= alo - 1 && hi <= ahi + 1) B.clip.hi = Math.min(B.clip.hi, ar);
    }
  }
  // aynı düzlemleri birleştir (komşu dikdörtgenlerin ortak saçağı tek yüzey olsun)
  const planes = [], pkey = P => `${Math.round(P.ax * 1e4)}|${Math.round(P.ay * 1e4)}|${Math.round(P.c * 10)}`, pmap = new Map();
  groups.forEach(g => { g.ids = g.planes.map(P => { const k = pkey(P); if (!pmap.has(k)) { pmap.set(k, planes.length); planes.push({ ax: P.ax, ay: P.ay, c: P.c }); } return pmap.get(k); }); });
  // yüzey
  const field = p => {
    let best = -Infinity, id = -1;
    for (const g of groups) {
      if (g.clip) { const v = g.clip.ax === 'x' ? p.x : p.y; if (v < g.clip.lo - 0.5 || v > g.clip.hi + 0.5) continue; }
      let mn = Infinity, mi = -1;
      for (let k = 0; k < g.planes.length; k++) { const z = pv(g.planes[k], p); if (z < mn) { mn = z; mi = g.ids[k]; } }
      if (mn > best) { best = mn; id = mi; }
    }
    return { z: best, id };
  };
  const eave = offsetPoly(L, -ov);
  // ızgara etiketleme
  const ex = eave.map(p => p.x), ey = eave.map(p => p.y), X0 = Math.min(...ex), Y0 = Math.min(...ey), X1 = Math.max(...ex), Y1 = Math.max(...ey);
  const cs = Math.max(2, Math.min(10, Math.max(X1 - X0, Y1 - Y0) / 360));
  const NX = Math.ceil((X1 - X0) / cs), NY = Math.ceil((Y1 - Y0) / cs);
  const lab = new Int16Array(NX * NY).fill(-1), Z = new Float32Array(NX * NY);
  const stat = planes.map(() => ({ n: 0, sx: 0, sy: 0, zmax: -Infinity }));
  // satır bazında çokgen içi aralıkları (hızlı içerik testi)
  for (let j = 0; j < NY; j++) {
    const y = Y0 + (j + 0.5) * cs, xsI = [];
    for (let i = 0; i < eave.length; i++) { const a = eave[i], b = eave[(i + 1) % eave.length]; if ((a.y > y) !== (b.y > y)) xsI.push(a.x + (y - a.y) * (b.x - a.x) / (b.y - a.y)); }
    xsI.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xsI.length; k += 2) {
      const i0 = Math.max(0, Math.ceil((xsI[k] - X0) / cs - 0.5)), i1 = Math.min(NX - 1, Math.floor((xsI[k + 1] - X0) / cs - 0.5));
      for (let i = i0; i <= i1; i++) {
        const p = { x: X0 + (i + 0.5) * cs, y }, f = field(p); if (f.id < 0) continue;
        lab[j * NX + i] = f.id; Z[j * NX + i] = f.z;
        const st = stat[f.id]; st.n++; st.sx += p.x; st.sy += p.y; if (f.z > st.zmax) st.zmax = f.z;
      }
    }
  }
  const at = p => { const i = Math.floor((p.x - X0) / cs), j = Math.floor((p.y - Y0) / cs); return i < 0 || j < 0 || i >= NX || j >= NY ? -1 : lab[j * NX + i]; };
  // bölgeler
  const faces = planes.map((P, id) => {
    const st = stat[id], g = Math.hypot(P.ax, P.ay);
    return { id, P, n: st.n, area: st.n * cs * cs, slopeArea: st.n * cs * cs * Math.sqrt(1 + g * g), c: st.n ? { x: st.sx / st.n, y: st.sy / st.n } : null, grad: g, up: g > 1e-6 ? { x: P.ax / g, y: P.ay / g } : null, zmax: st.zmax };
  }).filter(f => f.n > 3);
  // kesişim çizgileri
  const pairs = new Map();
  const addPair = (a, b, p) => {
    const k = a < b ? `${a}_${b}` : `${b}_${a}`;
    let e = pairs.get(k);
    if (!e) {
      const A = planes[Math.min(a, b)], B = planes[Math.max(a, b)], g = { x: A.ax - B.ax, y: A.ay - B.ay }, gl = Math.hypot(g.x, g.y);
      if (gl < 1e-6) return;
      const dc = A.c - B.c, p0 = { x: -g.x * dc / (gl * gl), y: -g.y * dc / (gl * gl) }, d = { x: -g.y / gl, y: g.x / gl };
      e = { a: Math.min(a, b), b: Math.max(a, b), p0, d, n: { x: g.x / gl, y: g.y / gl }, t0: Infinity, t1: -Infinity, cnt: 0 };
      pairs.set(k, e);
    }
    const t = V.dot(V.sub(p, e.p0), e.d); if (t < e.t0) e.t0 = t; if (t > e.t1) e.t1 = t; e.cnt++;
  };
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
    const a = lab[j * NX + i]; if (a < 0) continue;
    if (i + 1 < NX) { const b = lab[j * NX + i + 1]; if (b >= 0 && b !== a) addPair(a, b, { x: X0 + (i + 1) * cs, y: Y0 + (j + 0.5) * cs }); }
    if (j + 1 < NY) { const b = lab[(j + 1) * NX + i]; if (b >= 0 && b !== a) addPair(a, b, { x: X0 + (i + 0.5) * cs, y: Y0 + (j + 1) * cs }); }
  }
  let lines = [];
  for (const e of pairs.values()) {
    if (e.cnt < 3) continue;
    const A = planes[e.a], B = planes[e.b], p1 = V.add(e.p0, V.mul(e.d, e.t0 - cs / 2)), p2 = V.add(e.p0, V.mul(e.d, e.t1 + cs / 2));
    const m = V.lerp(p1, p2, 0.5), side = V.add(m, V.mul(e.n, cs * 1.5)), f = field(side);
    // A > B tarafında etkin düzlem büyük olansa yüzey max → dere; küçük olansa min → mahya / kırma
    const valley = f.id === e.a;
    const horiz = Math.abs(A.ax * e.d.x + A.ay * e.d.y) < 1e-3;
    lines.push({ a: p1, b: p2, kind: valley ? 'dere' : horiz ? 'mahya' : 'kirma', pa: e.a, pb: e.b });
  }
  // uç noktaları kesişimlere ve saçak köşelerine oturt
  const snapR = cs * 2.6;
  const lineX = (l1, l2) => { const d1 = V.sub(l1.b, l1.a), d2 = V.sub(l2.b, l2.a), den = V.cross(d1, d2); if (Math.abs(den) < 1e-9) return null; const t = V.cross(V.sub(l2.a, l1.a), d2) / den; return V.add(l1.a, V.mul(d1, t)); };
  lines.forEach(l => ['a', 'b'].forEach(k => {
    const p = l[k]; let best = null, bd = snapR;
    lines.forEach(o => { if (o === l) return; for (const q of [o.a, o.b]) if (V.dist(p, q) < bd) { const x = lineX(l, o); if (x && V.dist(x, p) < snapR) { best = x; bd = V.dist(p, q); } } });
    eave.forEach(q => { const d = V.dist(p, q); if (d < bd) { best = q; bd = d; } });
    if (best) l[k] = { ...best };
  }));
  lines = lines.filter(l => V.dist(l.a, l.b) > cs);
  const z = p => Math.max(0, field(p).z);
  lines.forEach(l => { l.za = field(l.a).z; l.zb = field(l.b).z; l.len = V.dist(l.a, l.b); l.true = Math.hypot(l.len, l.za - l.zb); });
  // saçak / kalkan (bordür) kenarları
  const zLow = Math.min(...eave.map(p => field(p).z));   // saçak kotu (en alçak kenar); oluk yalnızca bu kottaki yatay kenarlarda
  const edges = eave.map((a, i) => { const b = eave[(i + 1) % eave.length], za = field(a).z, zb = field(b).z, mz = field(V.lerp(a, b, 0.5)).z; return { a, b, len: V.dist(a, b), eave: Math.abs(za - zb) < 1 && Math.abs(mz - za) < 1 && Math.abs(za - zLow) < 2 }; });
  const zTop = Math.max(...faces.map(f => f.zmax), 0);
  return { r, F, L, eave, ortho, s, ov, groups, planes, faces, lines, edges, field, at, cs, X0, Y0, NX, NY, lab, Z, zTop, warn, flat: r.type === 'duz' };
}

/* bir düzlem bölgesini paralel çizgilerle tara (mertek, aşık, kiremit sırası): along yönünde çizgiler, across yönünde sp aralıkla */
function runs(m, id, along, across, sp, start = 'mid', maxN = 400) {
  const out = [], f = m.faces.find(x => x.id === id); if (!f) return out;
  let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
  for (let j = 0; j < m.NY; j++) for (let i = 0; i < m.NX; i++) if (m.lab[j * m.NX + i] === id) {
    const p = { x: m.X0 + (i + 0.5) * m.cs, y: m.Y0 + (j + 0.5) * m.cs }, a = V.dot(p, along), b = V.dot(p, across);
    if (a < a0) a0 = a; if (a > a1) a1 = a; if (b < b0) b0 = b; if (b > b1) b1 = b;
  }
  if (!isFinite(a0)) return out;
  const step = m.cs / 2;
  let o = start === 'mid' ? b0 + ((b1 - b0) % sp) / 2 : b0 + sp;
  for (let n = 0; o <= b1 + 1e-6 && n < maxN; o += sp, n++) {
    let run = null;
    for (let t = a0 - m.cs; t <= a1 + m.cs; t += step) {
      const p = V.add(V.mul(along, t), V.mul(across, o)), inside = m.at(p) === id;
      if (inside && !run) run = { a: p, b: p }; else if (inside) run.b = p;
      else if (run) { if (V.dist(run.a, run.b) > m.cs) out.push(run); run = null; }
    }
    if (run && V.dist(run.a, run.b) > m.cs) out.push(run);
  }
  return out;
}

/* karkas: mertek, aşık, mahya kirişi, köşe / dere mertekleri, dikmeler, duvar üstü yastık */
export function roofFrame(r, m = roofModel(r)) {
  if (!m || m.flat) return null;
  const fr = { ...FRAME_DEF, ...(r.frame || {}) }, k = Math.sqrt(1 + m.s * m.s);
  const rafters = [], purlins = [], posts = [];
  for (const f of m.faces) {
    if (!f.up) continue;
    const u = f.up, v = { x: -u.y, y: u.x };
    runs(m, f.id, u, v, fr.rafterSp).forEach(s => rafters.push({ ...s, face: f.id }));
    runs(m, f.id, v, u, fr.purlinSp, 'start').forEach(s => { if (V.dist(s.a, s.b) > fr.purlinSp * 0.4) purlins.push({ ...s, face: f.id }); });
  }
  const ridge = m.lines.filter(l => l.kind === 'mahya'), hips = m.lines.filter(l => l.kind === 'kirma'), valleys = m.lines.filter(l => l.kind === 'dere');
  // dikmeler: mahya kirişi ve aşıklar boyunca
  for (const l of [...ridge, ...purlins]) {
    const L = V.dist(l.a, l.b), n = Math.max(1, Math.round(L / fr.postSp));
    for (let i = 0; i <= n; i++) { const p = V.lerp(l.a, l.b, i / n); if (!posts.some(q => V.dist(q, p) < fr.postSp * 0.3)) posts.push(p); }
  }
  const sum = (a, f) => a.reduce((s, x) => s + f(x), 0);
  const raftLen = sum(rafters, s => V.dist(s.a, s.b)) * k, purlLen = sum(purlins, s => V.dist(s.a, s.b));
  const ridgeLen = sum(ridge, l => l.len), hipLen = sum(hips, l => l.true), valLen = sum(valleys, l => l.true);
  const postLen = sum(posts, p => Math.max(0, m.field(p).z - fr.ridgeH));
  const plate = sum(m.L.map((a, i) => V.dist(a, m.L[(i + 1) % m.L.length])), x => x);
  const vol = (len, b, h) => len / 100 * b / 100 * h / 100;
  return {
    rafters, purlins, posts, ridge, hips, valleys, fr,
    q: [
      { t: `Mertek ${fr.rafterB}×${fr.rafterH} cm (${fr.rafterSp} cm aralıkla)`, n: rafters.length, len: raftLen, vol: vol(raftLen, fr.rafterB, fr.rafterH) },
      { t: `Aşık ${fr.purlinB}×${fr.purlinH} cm`, n: purlins.length, len: purlLen, vol: vol(purlLen, fr.purlinB, fr.purlinH) },
      { t: `Mahya kirişi ${fr.ridgeB}×${fr.ridgeH} cm`, n: ridge.length, len: ridgeLen, vol: vol(ridgeLen, fr.ridgeB, fr.ridgeH) },
      { t: `Köşe (kırma) mertekleri ${fr.ridgeB}×${fr.ridgeH} cm`, n: hips.length, len: hipLen, vol: vol(hipLen, fr.ridgeB, fr.ridgeH) },
      { t: `Dere mertekleri ${fr.ridgeB}×${fr.ridgeH} cm`, n: valleys.length, len: valLen, vol: vol(valLen, fr.ridgeB, fr.ridgeH) },
      { t: `Dikme ${fr.postB}×${fr.postB} cm (${fr.postSp} cm aralıkla)`, n: posts.length, len: postLen, vol: vol(postLen, fr.postB, fr.postB) },
      { t: 'Duvar üstü yastık (taban) kirişi 10×10 cm', n: m.L.length, len: plate, vol: vol(plate, 10, 10) },
    ].filter(x => x.len > 0),
  };
}

/* ölçüler ve metraj */
export function roofTakeoff(r, m = roofModel(r)) {
  if (!m) return null;
  const sum = (a, f) => a.reduce((s, x) => s + f(x), 0);
  const plan = Math.abs(polyArea(m.eave)) / 1e4, foot = Math.abs(polyArea(m.L)) / 1e4;
  const area = m.flat ? plan : sum(m.faces, f => f.slopeArea) / 1e4;
  const len = k => sum(m.lines.filter(l => l.kind === k), l => (k === 'mahya' ? l.len : l.true)) / 100;
  const ridge = len('mahya'), hip = len('kirma'), valley = len('dere');
  const eaveLen = sum(m.edges.filter(e => e.eave), e => e.len) / 100, rakeLen = sum(m.edges.filter(e => !e.eave), e => e.len) / 100;
  const per = sum(m.L.map((a, i) => V.dist(a, m.L[(i + 1) % m.L.length])), x => x) / 100;
  const cv = coverOf(r), fr = roofFrame(r, m), lay = roofLayers(r).filter(l => l.on), rows = [];
  const add = (g, t, q, unit, note = '') => { if (q > 0) rows.push({ g, t, q, unit, note }); };
  // örtü
  if (m.flat) {
    add('Örtü', cv.t, Math.ceil(area * 1.15 * 2 / 10), 'rulo', `${fmt(area * 1.15 * 2)} m² (2 kat, bindirme %15)`);
    add('Örtü', 'Parapet su yalıtımı (dönüş)', per * (r.parapet || 80) / 100 * 1.1, 'm²', `parapet ${r.parapet || 80} cm`);
    add('Aksesuar', 'Yağmur suyu süzgeci', Math.max(2, Math.ceil(plan / 50)), 'adet', 'her ~50 m² için bir');
  } else if (cv.kind === 'tile') {
    add('Örtü', cv.t, Math.ceil(area * cv.perM2 * 1.05), 'adet', `${cv.perM2} adet/m² + %5 fire`);
    add('Örtü', 'Mahya kiremidi', Math.ceil((ridge + hip) * 3), 'adet', `${fmt(ridge + hip)} m mahya + kırma`);
    add('Örtü', 'Mahya havalandırma bandı', ridge + hip, 'm');
  } else if (cv.kind === 'shingle') {
    add('Örtü', cv.t, Math.ceil(area * 1.1 / cv.pack), 'paket', `${cv.pack} m²/paket, %10 fire`);
    add('Örtü', 'Shingle mahya / kırma kapama', Math.ceil((ridge + hip) / 6), 'paket', '≈ 6 m/paket');
    add('Örtü', 'Shingle çivisi', Math.ceil(area / 30), 'kg', '≈ 1 kg / 30 m²');
  } else {
    add('Örtü', cv.t, area * 1.05, 'm²', '%5 bindirme');
    add('Örtü', 'Mahya / kırma kapama sacı', ridge + hip, 'm');
  }
  // katmanlar
  for (const l of lay) {
    if (l.k === 'orti' || l.k === 'mertek') continue;
    const A = l.k === 'tavan' ? foot : area;
    if (l.q === 'area') add('Katmanlar', l.t, A * 1.05, 'm²', `${fmt(l.th)} mm`);
    else if (l.q === 'roll') add('Katmanlar', l.t, Math.ceil(A * 1.12 / l.roll), 'rulo', `${fmt(A * 1.12)} m², ${l.roll} m²/rulo`);
    else if (l.q === 'roll2') add('Katmanlar', l.t, Math.ceil(A * 1.15 * 2 / l.roll), 'rulo', `2 kat, ${l.roll} m²/rulo`);
    else if (l.q === 'sheet') add('Katmanlar', l.t, Math.ceil(A * 1.08 / l.sheet), 'levha', '122 × 244 cm, %8 fire');
    else if (l.q === 'contra' && fr) add('Katmanlar', l.t, (fr.q.find(x => x.t.startsWith('Mertek'))?.len || 0) / 100 * 1.05, 'm', 'mertek boyunca');
    else if (l.q === 'batten') add('Katmanlar', l.t, area / ((cv.batten || 34) / 100) * 1.05, 'm', `${cv.batten || 34} cm aralıkla`);
  }
  // karkas
  if (fr) fr.q.forEach(x => add('Karkas', x.t, x.len / 100, 'm', `${x.n} parça · ${fmt(x.vol, 3)} m³`));
  if (fr) add('Karkas', 'Toplam ahşap hacmi', fr.q.reduce((s, x) => s + x.vol, 0), 'm³', 'çam / emprenyeli kereste');
  // su toplama ve kenarlar
  if (!m.flat) {
    add('Aksesuar', 'Yağmur oluğu', eaveLen, 'm', 'saçak boyunca');
    add('Aksesuar', 'Yağmur iniş borusu', Math.max(2, Math.ceil(eaveLen / 10)), 'adet', '≈ her 10 m oluk için bir');
    add('Aksesuar', 'Saçak / alın tahtası', eaveLen + rakeLen, 'm');
    add('Aksesuar', 'Saçak havalandırma ızgarası', eaveLen, 'm');
    if (valley) add('Aksesuar', 'Dere sacı (galvaniz / bakır)', valley * 1.05, 'm');
  }
  return { plan, foot, area, ridge, hip, valley, eaveLen, rakeLen, per, zTop: m.zTop, rows, frame: fr, deg: Math.atan(m.s) * 180 / Math.PI };
}
const fmt = (n, d = 2) => (Number(n) || 0).toLocaleString('tr-TR', { maximumFractionDigits: d });

/* ── 2D çizim (dünya koordinatı, cm) ── */
const W = (m, p) => m.F.toW(p);
const ptsStr = (m, a) => a.map(p => { const q = W(m, p); return `${+q.x.toFixed(1)},${+q.y.toFixed(1)}`; }).join(' ');
const ln = (m, a, b) => { const p = W(m, a), q = W(m, b); return `M${+p.x.toFixed(1)} ${+p.y.toFixed(1)}L${+q.x.toFixed(1)} ${+q.y.toFixed(1)}`; };

/* çatı planı katmanı: px = ekran pikseli → cm dönüştürücü; o.frame: karkas, o.courses: kiremit sıraları */
export function roofSvg(r, px, o = {}) {
  const m = roofModel(r); if (!m) return '';
  const cv = coverOf(r);
  let s = `<g class="roof" data-roof="${r.id}">`;
  s += `<polygon points="${ptsStr(m, m.eave)}" fill="${cv.c}" fill-opacity="${o.fill ?? 0.16}" stroke="#24272B" stroke-width="${px(1.6)}"/>`;
  s += `<polygon points="${ptsStr(m, m.L)}" fill="none" stroke="#24272B" stroke-width="${px(1)}" stroke-dasharray="${px(7)} ${px(4)}" opacity=".7"/>`;
  if (o.courses && !m.flat) {
    let d = '';
    for (const f of m.faces) if (f.up) { const u = f.up, v = { x: -u.y, y: u.x }; runs(m, f.id, v, u, o.courseSp || 35, 'start', 200).forEach(q => { d += ln(m, q.a, q.b); }); }
    s += `<path d="${d}" stroke="${cv.c}" stroke-opacity=".55" stroke-width="${px(0.8)}" fill="none"/>`;
  }
  if (o.frame) {
    const fr = roofFrame(r, m);
    if (fr) {
      s += `<path d="${fr.rafters.map(q => ln(m, q.a, q.b)).join('')}" stroke="#A0703C" stroke-width="${px(1.1)}" fill="none"/>`;
      s += `<path d="${fr.purlins.map(q => ln(m, q.a, q.b)).join('')}" stroke="#6B4A22" stroke-width="${px(2.4)}" fill="none"/>`;
      s += fr.posts.map(p => { const q = W(m, p); return `<rect x="${q.x - px(4)}" y="${q.y - px(4)}" width="${px(8)}" height="${px(8)}" fill="#6B4A22"/>`; }).join('');
    }
  }
  const style = { mahya: ['#16171A', 3, ''], kirma: ['#16171A', 2, ''], dere: ['#1E78B4', 2, `${px(8)} ${px(4)}`] };
  for (const l of m.lines) { const [c, w, da] = style[l.kind]; s += `<path d="${ln(m, l.a, l.b)}" stroke="${c}" stroke-width="${px(w)}" ${da ? `stroke-dasharray="${da}"` : ''} fill="none"/>`; }
  // eğim okları (aşağı yönde) ve yüzde
  if (!m.flat && o.arrows !== false) for (const f of m.faces) {
    if (!f.up || !f.c || f.area < 4e4) continue;
    const dn = V.mul(f.up, -1), a = V.sub(f.c, V.mul(dn, 40)), b = V.add(f.c, V.mul(dn, 40)), A = W(m, a), B = W(m, b), dd = V.norm(V.sub(B, A)), nn = { x: -dd.y, y: dd.x };
    const h1 = V.sub(V.sub(B, V.mul(dd, px(9))), V.mul(nn, px(5))), h2 = V.add(V.sub(B, V.mul(dd, px(9))), V.mul(nn, px(5)));
    const T = W(m, V.add(f.c, V.mul(V.norm({ x: -dn.y, y: dn.x }), 0)));
    s += `<path d="M${A.x} ${A.y}L${B.x} ${B.y}M${h1.x} ${h1.y}L${B.x} ${B.y}L${h2.x} ${h2.y}" stroke="#EB591F" stroke-width="${px(1.6)}" fill="none"/>`;
    s += `<text x="${T.x + nn.x * px(14)}" y="${T.y + nn.y * px(14)}" font-size="${px(11)}" fill="#EB591F" font-weight="700" text-anchor="middle" font-family="Inter,Arial">%${fmt(f.grad * 100, 0)}</text>`;
  }
  if (m.flat && o.arrows !== false) { const c = W(m, polyCentroid(m.L)); s += `<text x="${c.x}" y="${c.y}" font-size="${px(12)}" fill="#24272B" text-anchor="middle" font-family="Inter,Arial">Düz çatı · parapet ${r.parapet || 80} cm</text>`; }
  return s + '</g>';
}

/* bağımsız SVG (PDF için): plan ya da karkas, ölçülerle */
export function roofSheetSvg(r, { frame = false, W: VW = 700, H: VH = 520, north = true } = {}) {
  const m = roofModel(r); if (!m) return '';
  const wp = m.eave.map(p => W(m, p)), xs = wp.map(p => p.x), ys = wp.map(p => p.y);
  const pad = 90, x0 = Math.min(...xs) - pad, y0 = Math.min(...ys) - pad, w = Math.max(...xs) - x0 + pad, h = Math.max(...ys) - y0 + pad;
  const k = Math.min(VW / w, VH / h), px = n => n / k;
  let s = roofSvg(r, px, { frame, courses: !frame, fill: frame ? 0.06 : 0.18 });
  // dış ölçüler: yerel eksende çerçeve ölçüsü
  const lx = m.eave.map(p => p.x), ly = m.eave.map(p => p.y), bx0 = Math.min(...lx), bx1 = Math.max(...lx), by0 = Math.min(...ly), by1 = Math.max(...ly);
  const dim = (a, b, off, txt) => {
    const A = W(m, a), B = W(m, b), u = V.norm(V.sub(B, A)), n = { x: -u.y, y: u.x }, a2 = V.add(A, V.mul(n, off)), b2 = V.add(B, V.mul(n, off)), mm = V.lerp(a2, b2, 0.5);
    let ang = Math.atan2(u.y, u.x) * 180 / Math.PI; if (ang > 90 || ang < -90) ang += 180;
    return `<path d="M${A.x} ${A.y}L${a2.x} ${a2.y}M${B.x} ${B.y}L${b2.x} ${b2.y}M${a2.x} ${a2.y}L${b2.x} ${b2.y}" stroke="#00989A" stroke-width="${px(1)}" fill="none"/><text x="${mm.x + n.x * px(10)}" y="${mm.y + n.y * px(10)}" font-size="${px(11)}" fill="#00989A" text-anchor="middle" dominant-baseline="middle" transform="rotate(${ang} ${mm.x + n.x * px(10)} ${mm.y + n.y * px(10)})" font-family="Inter,Arial">${txt}</text>`;
  };
  s += dim({ x: bx0, y: by1 }, { x: bx1, y: by1 }, px(28), `${fmt((bx1 - bx0) / 100, 2)} m`);
  s += dim({ x: bx1, y: by1 }, { x: bx1, y: by0 }, px(28), `${fmt((by1 - by0) / 100, 2)} m`);
  if (north) s += `<g transform="translate(${x0 + px(30)} ${y0 + px(34)})"><circle r="${px(16)}" fill="none" stroke="#24272B" stroke-width="${px(1)}"/><path d="M0 ${-px(13)}L${px(6)} ${px(10)}L0 ${px(5)}L${-px(6)} ${px(10)}Z" fill="#24272B"/><text y="${-px(19)}" font-size="${px(10)}" text-anchor="middle" font-family="Inter,Arial" font-weight="700">K</text></g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x0} ${y0} ${w} ${h}" width="${VW}" height="${Math.round(h * k)}" style="max-width:100%;height:auto">${s}</svg>`;
}

/* kesit: yerel y yönünde (ana mahyaya dik), ağırlık merkezinden; katlar ve döşemelerle */
export function roofSectionSvg(r, { levels = [], VW = 700, VH = 360 } = {}) {
  const m = roofModel(r); if (!m) return '';
  const lay = roofLayers(r).filter(l => l.on), T = lay.reduce((s, l) => s + l.th, 0) / 10;   // toplam yapı kalınlığı (cm)
  // kesit hattı: en uzun mahyanın ortasından ona dik; mahya yoksa (tek eğimli, piramit, düz) eğim yönünde / merkezden
  const rg = m.lines.filter(l => l.kind === 'mahya').sort((a, b) => b.len - a.len)[0];
  let O = { x: 0, y: 0 }, dir = { x: 0, y: 1 };
  if (rg) { O = V.lerp(rg.a, rg.b, 0.5); const u = V.norm(V.sub(rg.b, rg.a)); dir = { x: -u.y, y: u.x }; }
  else if (m.groups[0]?.shed) dir = m.groups[0].shed;
  const ts = m.eave.map(p => V.dot(V.sub(p, O), dir)), pts = [];
  for (let t = Math.min(...ts) - 5; t <= Math.max(...ts) + 5; t += m.cs) { const p = V.add(O, V.mul(dir, t)); if (m.at(p) >= 0) pts.push([t, m.field(p).z]); }
  if (pts.length < 2) return '';
  // duvar kesişimleri (hat boyunca konum)
  const walls = [];
  m.L.forEach((a, i) => { const b = m.L[(i + 1) % m.L.length], e = V.sub(b, a), den = V.cross(dir, e); if (Math.abs(den) < 1e-9) return; const w = V.cross(V.sub(a, O), e) / den, k = V.cross(V.sub(a, O), dir) / den; if (k >= 0 && k <= 1) walls.push(w); });
  walls.sort((a, b) => a - b);
  const lv = levels.length ? levels : [{ name: 'Kat', z: 0, h: 280, slab: 0 }];
  const base = (r.base || 0) + (lv.at(-1).z + (lv.at(-1).kind === 'roof' ? 0 : lv.at(-1).h));
  const zMax = base + m.zTop + T + 40, ymin = pts[0][0] - 60, ymax = pts.at(-1)[0] + 60;
  const k = Math.min(VW / (ymax - ymin), VH / (zMax + 60)), X = y => (y - ymin) * k, Y = z => VH - (z + 40) * k;
  let s = '';
  // zemin
  s += `<line x1="0" y1="${Y(0)}" x2="${VW}" y2="${Y(0)}" stroke="#24272B" stroke-width="1.5"/>`;
  const wl = walls.length >= 2 ? [walls[0], walls.at(-1)] : walls;
  lv.filter(l => l.kind !== 'roof').forEach(l => {
    if (l.slab && l.z > 0) s += `<rect x="${X(wl[0] ?? ymin)}" y="${Y(l.z)}" width="${X(wl.at(-1) ?? ymax) - X(wl[0] ?? ymin)}" height="${l.slab * k}" fill="#B9BCBF" stroke="#24272B" stroke-width=".8"/>`;
    wl.forEach((y, i) => { const tw = 20, xx = i === 0 ? y : y - tw; s += `<rect x="${X(xx)}" y="${Y(l.z + l.h)}" width="${tw * k}" height="${l.h * k}" fill="#E7E2DA" stroke="#24272B" stroke-width=".8"/>`; });
    s += `<text x="${X(ymax) - 4}" y="${Y(l.z) - 4}" font-size="10" text-anchor="end" fill="#6A7380" font-family="Inter,Arial">${l.name} ±${fmt(l.z / 100, 2)}</text>`;
  });
  const top = lv.at(-1);
  if (top.kind === 'roof' && top.slab) s += `<rect x="${X(wl[0] ?? ymin)}" y="${Y(top.z)}" width="${X(wl.at(-1) ?? ymax) - X(wl[0] ?? ymin)}" height="${top.slab * k}" fill="#B9BCBF" stroke="#24272B" stroke-width=".8"/>`;
  // çatı: taşıyıcı alt çizgi + katman bandı
  const bot = pts.map(([y, z]) => `${X(y)},${Y(base + z)}`).join(' '), topL = pts.map(([y, z]) => `${X(y)},${Y(base + z + T)}`).reverse().join(' ');
  s += `<polygon points="${bot} ${topL}" fill="${coverOf(r).c}" fill-opacity=".35" stroke="#24272B" stroke-width="1"/>`;
  s += `<polyline points="${pts.map(([y, z]) => `${X(y)},${Y(base + z + T)}`).join(' ')}" fill="none" stroke="${coverOf(r).c}" stroke-width="3"/>`;
  // kotlar
  const zr = base + m.zTop + T;
  s += `<line x1="${X(ymin) + 6}" y1="${Y(zr)}" x2="${X(ymax) - 6}" y2="${Y(zr)}" stroke="#EB591F" stroke-width=".8" stroke-dasharray="5 4"/><text x="${X(ymin) + 8}" y="${Y(zr) - 5}" font-size="11" fill="#EB591F" font-weight="700" font-family="Inter,Arial">Mahya +${fmt(zr / 100, 2)} m</text>`;
  s += `<text x="${X(ymin) + 8}" y="${Y(base) + 14}" font-size="10" fill="#6A7380" font-family="Inter,Arial">Saçak / duvar üstü +${fmt(base / 100, 2)} m</text>`;
  if (!m.flat) s += `<text x="${VW / 2}" y="18" font-size="12" text-anchor="middle" font-weight="700" font-family="Inter,Arial">Eğim %${fmt(m.s * 100, 0)} (${fmt(Math.atan(m.s) * 180 / Math.PI, 1)}°) · saçak ${fmt(m.ov, 0)} cm · çatı yapı kalınlığı ${fmt(T, 1)} cm</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VW} ${VH}" width="${VW}" height="${VH}" style="max-width:100%;height:auto">${s}</svg>`;
}

/* katman detayı (alttan üste bantlar) */
export function roofLayersSvg(r, { VW = 700 } = {}) {
  const lay = roofLayers(r).filter(l => l.on), sc = l => Math.max(9, Math.min(46, l.th / 3.2)), Hh = lay.reduce((s, l) => s + sc(l) + 2, 0) + 20;
  let y = Hh - 10, s = '';
  for (const l of lay) {
    const h = sc(l); y -= h;
    const x0 = 20, w = 300;
    if (l.k === 'mertek') { for (let x = x0 + 10; x < x0 + w - 20; x += 60) s += `<rect x="${x}" y="${y}" width="16" height="${h}" fill="${l.c}" stroke="#24272B" stroke-width=".8"/>`; s += `<line x1="${x0}" y1="${y + h}" x2="${x0 + w}" y2="${y + h}" stroke="#24272B" stroke-width=".6" stroke-dasharray="3 3"/>`; }
    else if (l.k === 'orti' && coverOf(r).kind === 'tile') { let d = `M${x0} ${y + h}`; for (let x = x0; x < x0 + w; x += 24) d += `Q${x + 6} ${y} ${x + 12} ${y + h * 0.4}T${x + 24} ${y + h}`; s += `<path d="${d}" fill="${l.c}" stroke="#24272B" stroke-width=".8"/>`; }
    else if (l.k === 'kontra' || l.k === 'cita') { for (let x = x0 + (l.k === 'cita' ? 6 : 30); x < x0 + w; x += l.k === 'cita' ? 34 : 60) s += `<rect x="${x}" y="${y}" width="${l.k === 'cita' ? 10 : 8}" height="${h}" fill="${l.c}" stroke="#24272B" stroke-width=".6"/>`; }
    else s += `<rect x="${x0}" y="${y}" width="${w}" height="${h}" fill="${l.c}" stroke="#24272B" stroke-width=".6"/>`;
    s += `<line x1="${x0 + w + 6}" y1="${y + h / 2}" x2="${x0 + w + 40}" y2="${y + h / 2}" stroke="#8E959E" stroke-width=".6"/><text x="${x0 + w + 46}" y="${y + h / 2 + 4}" font-size="11.5" font-family="Inter,Arial" fill="#16171A">${l.t} <tspan fill="#6A7380">· ${fmt(l.th, 1)} mm</tspan></text>`;
    y -= 2;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VW} ${Hh}" width="${VW}" height="${Hh}" style="max-width:100%;height:auto">${s}</svg>`;
}

/* 3D yüzeyler: [{ pts: [{x, y, z}] (dünya, cm), kind: 'roof'|'gable'|'parapet' }] — base: çatı oturma kotu (cm) */
export function roofFaces(r, base = 0) {
  const m = roofModel(r); if (!m) return [];
  const out = [], Wz = (p, z) => { const q = W(m, p); return { x: q.x, y: q.y, z: base + z }; };
  const clipHalf = (poly, P, Q) => {   // P(p) <= Q(p) olan kısım (dışbükey kırpma)
    const f = p => pv(P, p) - pv(Q, p), res = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length], fa = f(a), fb = f(b);
      if (fa <= 0) res.push(a);
      if ((fa < 0 && fb > 0) || (fa > 0 && fb < 0)) res.push(V.lerp(a, b, fa / (fa - fb)));
    }
    return res;
  };
  if (m.groups.length === 1 && m.groups[0].planes.length === 1) {   // tek eğimli / düz: saçak çokgeni
    const P = m.groups[0].planes[0];
    out.push({ kind: 'roof', pts: m.eave.map(p => Wz(p, pv(P, p))) });
  } else for (const g of m.groups) {
    const R = g.R, ov = m.ov;
    let base0 = R ? [{ x: R.x0 - ov, y: R.y0 - ov }, { x: R.x1 + ov, y: R.y0 - ov }, { x: R.x1 + ov, y: R.y1 + ov }, { x: R.x0 - ov, y: R.y1 + ov }] : m.eave.slice();
    if (g.clip) {   // beşik kanadı mahyada kesilmişse yüzey de oradan kesilir
      const c = g.clip, ax = c.ax;
      base0 = base0.map(p => ({ ...p, [ax]: Math.max(c.lo, Math.min(c.hi, p[ax])) }));
    }
    g.planes.forEach((P, k) => {
      let poly = base0;
      g.planes.forEach((Q, j) => { if (j !== k && poly.length) poly = clipHalf(poly, P, Q); });
      if (poly.length >= 3) out.push({ kind: 'roof', pts: poly.map(p => Wz(p, pv(P, p))) });
    });
  }
  // duvar üstünden çatıya kadar kalkan / yan duvar dolguları (beşik, tek eğimli)
  if (!m.flat) m.L.forEach((a, i) => {
    const b = m.L[(i + 1) % m.L.length], n = Math.max(2, Math.ceil(V.dist(a, b) / m.cs));
    const top = []; let any = false;
    for (let k = 0; k <= n; k++) { const p = V.lerp(a, b, k / n), z = Math.max(0, m.field(p).z); if (z > 2) any = true; top.push([p, z]); }
    if (!any) return;
    out.push({ kind: 'gable', pts: [Wz(a, 0), ...top.map(([p, z]) => Wz(p, z)), Wz(b, 0)].filter((q, i, arr) => !i || V.dist(q, arr[i - 1]) > 0.01 || q.z !== arr[i - 1].z) });
  });
  if (m.flat) m.L.forEach((a, i) => { const b = m.L[(i + 1) % m.L.length]; out.push({ kind: 'parapet', a: W(m, a), b: W(m, b), z0: base, h: r.parapet || 80 }); });
  return out;
}

/* dış hat: duvarlar ve odalardan, ızgara üzerinde birleşim → dış kontur → sadeleştirme */
export function outlineOf(plan, cs = 2.5) {
  const T = plan.meta?.wallT || 15, segs = [];
  for (const w of plan.walls || []) segs.push({ a: w.a, b: w.b, r: (w.t || T) / 2 });
  const polys = (plan.rooms || []).filter(r => r.pts?.length >= 3).map(r => r.pts);
  const pts = [...segs.flatMap(s => [s.a, s.b]), ...polys.flat()]; if (pts.length < 3) return null;
  const x0 = Math.min(...pts.map(p => p.x)) - 40, y0 = Math.min(...pts.map(p => p.y)) - 40, x1 = Math.max(...pts.map(p => p.x)) + 40, y1 = Math.max(...pts.map(p => p.y)) + 40;
  const NX = Math.ceil((x1 - x0) / cs), NY = Math.ceil((y1 - y0) / cs); if (NX * NY > 4e6) return null;
  const g = new Uint8Array(NX * NY);
  for (const s of segs) {   // duvar şeritleri (uçlarda yarım kalınlık uzatılmış)
    const u = V.norm(V.sub(s.b, s.a)), a = V.sub(s.a, V.mul(u, s.r)), b = V.add(s.b, V.mul(u, s.r)), n = { x: -u.y, y: u.x };
    const q = [V.add(a, V.mul(n, s.r)), V.add(b, V.mul(n, s.r)), V.sub(b, V.mul(n, s.r)), V.sub(a, V.mul(n, s.r))];
    fillPoly(g, q, x0, y0, cs, NX, NY);
  }
  polys.forEach(p => fillPoly(g, p, x0, y0, cs, NX, NY));
  // dışarıdan taşma ile dış bölgeyi bul; geri kalan (avlu dahil) = bina
  const out = new Uint8Array(NX * NY), st = [0];
  out[0] = 1;
  while (st.length) { const c = st.pop(), i = c % NX, j = (c - i) / NX; for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= NX || jj >= NY) continue; const k = jj * NX + ii; if (!out[k] && !g[k]) { out[k] = 1; st.push(k); } } }
  const ins = (i, j) => i >= 0 && j >= 0 && i < NX && j < NY && !out[j * NX + i];
  // sınır kenarları (içerisi solda) → zincir
  const next = new Map(), key = (i, j) => j * (NX + 1) + i;
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
    if (!ins(i, j)) continue;
    if (!ins(i, j - 1)) next.set(key(i + 1, j), [...(next.get(key(i + 1, j)) || []), key(i, j)]);   // üst kenar (sağdan sola)
    if (!ins(i, j + 1)) next.set(key(i, j + 1), [...(next.get(key(i, j + 1)) || []), key(i + 1, j + 1)]);
    if (!ins(i - 1, j)) next.set(key(i, j), [...(next.get(key(i, j)) || []), key(i, j + 1)]);
    if (!ins(i + 1, j)) next.set(key(i + 1, j + 1), [...(next.get(key(i + 1, j + 1)) || []), key(i + 1, j)]);
  }
  let bestLoop = null;
  const used = new Set();
  for (const [k0] of next) {
    if (used.has(k0)) continue;
    const loop = []; let k = k0, guard = 0;
    while (guard++ < 2e6) {
      loop.push(k); used.add(k);
      const nx = next.get(k); if (!nx?.length) break;
      const n1 = nx.shift(); if (n1 === k0) break; k = n1;
    }
    if (!bestLoop || loop.length > bestLoop.length) bestLoop = loop;
  }
  if (!bestLoop || bestLoop.length < 4) return null;
  let poly = bestLoop.map(k => ({ x: x0 + (k % (NX + 1)) * cs, y: y0 + Math.floor(k / (NX + 1)) * cs }));
  const s0 = poly.reduce((bi, p, i) => p.x + p.y < poly[bi].x + poly[bi].y ? i : bi, 0);   // sadeleştirme kesin bir köşeden başlasın
  poly = [...poly.slice(s0), ...poly.slice(0, s0)];
  poly = dp(poly, cs * 1.2);
  // dik açılıysa yerel eksende hizala
  const F = frameOf(poly), O = orthoize(poly.map(F.toL));
  if (O) poly = O.map(F.toW);
  return poly.map(p => ({ x: +p.x.toFixed(1), y: +p.y.toFixed(1) }));
}
function fillPoly(g, q, x0, y0, cs, NX, NY) {
  const ys = q.map(p => p.y), jy0 = Math.max(0, Math.floor((Math.min(...ys) - y0) / cs)), jy1 = Math.min(NY - 1, Math.ceil((Math.max(...ys) - y0) / cs));
  for (let j = jy0; j <= jy1; j++) {
    const y = y0 + (j + 0.5) * cs, xs = [];
    for (let i = 0; i < q.length; i++) { const a = q[i], b = q[(i + 1) % q.length]; if ((a.y > y) !== (b.y > y)) xs.push(a.x + (y - a.y) * (b.x - a.x) / (b.y - a.y)); }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) { const i0 = Math.max(0, Math.round((xs[k] - x0) / cs)), i1 = Math.min(NX - 1, Math.round((xs[k + 1] - x0) / cs) - 1); for (let i = i0; i <= i1; i++) g[j * NX + i] = 1; }
  }
}
/* Douglas–Peucker (kapalı çokgen) */
function dp(P, tol) {
  if (P.length < 4) return P;
  // en uzak iki noktadan böl
  let a = 0, b = 0, bd = 0;
  for (let i = 0; i < P.length; i++) { const d = V.dist(P[0], P[i]); if (d > bd) { bd = d; b = i; } }
  const simp = pts => {
    if (pts.length < 3) return pts;
    const A = pts[0], B = pts.at(-1), u = V.norm(V.sub(B, A)); let mi = -1, md = tol;
    for (let i = 1; i < pts.length - 1; i++) { const d = Math.abs(V.cross(u, V.sub(pts[i], A))); if (d > md) { md = d; mi = i; } }
    if (mi < 0) return [A, B];
    return [...simp(pts.slice(0, mi + 1)).slice(0, -1), ...simp(pts.slice(mi))];
  };
  const r1 = simp(P.slice(a, b + 1)), r2 = simp([...P.slice(b), P[0]]);
  return [...r1.slice(0, -1), ...r2.slice(0, -1)];
}
