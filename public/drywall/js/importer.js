/* SAGG Drywall+ — Shapr3D (STEP / IGES / OBJ / STL) modellerini içe aktarma ve profil karkası çözümleme.
 *
 * Akış: dosya → üçgen ağları (gövde başına) → birim / yukarı ekseni düzeltmesi → gövde ayrıştırma
 *   → gövde başına: düşey yüzlerden ana doğrultu, yerel çerçeve ve ölçüler, dört yandan derinlik haritası
 *   → boşluk (kapı / pencere) ve niş tespiti → sınıflandırma (bölme duvar / mobilya kutusu / asma tavan)
 *   → mevcut eleman parametrelerine dönüştürme → gövdeler arası birleşimler (T, L köşe, tavan–duvar, mobilya–duvar). */

/* ───────────── okuyucular ───────────── */
export async function readModelFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  const buf = new Uint8Array(await file.arrayBuffer());
  if (ext === 'obj') return { meshes: parseOBJ(new TextDecoder().decode(buf)), upGuess: 'y' };
  if (ext === 'stl') return { meshes: parseSTL(buf), upGuess: 'z' };
  if (['step', 'stp', 'iges', 'igs'].includes(ext)) return { meshes: await parseCAD(buf, ext), upGuess: 'z' };
  throw new Error('Desteklenmeyen dosya türü: .' + ext + ' (STEP, IGES, OBJ ya da STL kullanın)');
}

export function parseOBJ(txt) {
  const V = [], meshes = [];
  let cur = null;
  const start = name => { cur = { name, tri: [] }; meshes.push(cur); };
  for (const line of txt.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t[0] === '#') continue;
    const p = t.split(/\s+/);
    if (p[0] === 'v') V.push([+p[1], +p[2], +p[3]]);
    else if (p[0] === 'o' || p[0] === 'g') start(p.slice(1).join(' ') || `Gövde ${meshes.length + 1}`);
    else if (p[0] === 'f') {
      if (!cur) start('Gövde 1');
      const idx = p.slice(1).map(s => { const i = parseInt(s, 10); return i < 0 ? V.length + i : i - 1; });
      for (let k = 1; k < idx.length - 1; k++) cur.tri.push(...V[idx[0]], ...V[idx[k]], ...V[idx[k + 1]]);
    }
  }
  return meshes.filter(m => m.tri.length).map(m => ({ name: m.name, pos: new Float32Array(m.tri) }));
}

export function parseSTL(buf) {
  const head = new TextDecoder().decode(buf.slice(0, Math.min(buf.length, 512)));
  const n = buf.length >= 84 ? new DataView(buf.buffer, buf.byteOffset).getUint32(80, true) : 0;
  const isBin = buf.length === 84 + n * 50 || !/^\s*solid[\s\S]*facet/.test(head);
  if (isBin) {
    const dv = new DataView(buf.buffer, buf.byteOffset), pos = new Float32Array(n * 9);
    for (let i = 0; i < n; i++) for (let j = 0; j < 9; j++) pos[i * 9 + j] = dv.getFloat32(84 + i * 50 + 12 + j * 4, true);
    return [{ name: 'STL', pos }];
  }
  const meshes = [];
  let cur = null;
  for (const line of new TextDecoder().decode(buf).split(/\r?\n/)) {
    const t = line.trim();
    if (t.startsWith('solid')) { cur = { name: t.slice(5).trim() || `Gövde ${meshes.length + 1}`, v: [] }; meshes.push(cur); }
    else if (t.startsWith('vertex') && cur) { const p = t.split(/\s+/); cur.v.push(+p[1], +p[2], +p[3]); }
  }
  return meshes.filter(m => m.v.length).map(m => ({ name: m.name, pos: new Float32Array(m.v) }));
}

let occtP = null;
function loadOCCT() {
  if (occtP) return occtP;
  const base = new URL('../vendor/occt/', import.meta.url).href;
  occtP = new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = base + 'occt-import-js.js';
    s.onload = () => window.occtimportjs({ locateFile: f => base + f }).then(res, rej);
    s.onerror = () => rej(new Error('STEP okuyucu yüklenemedi'));
    document.head.appendChild(s);
  });
  return occtP;
}
async function parseCAD(buf, ext) {
  const occt = await loadOCCT();
  const r = ext.startsWith('ig') ? occt.ReadIgesFile(buf, null) : occt.ReadStepFile(buf, null);
  if (!r.success) throw new Error('Dosya okunamadı (STEP / IGES)');
  return r.meshes.map((m, i) => {
    const P = m.attributes.position.array, I = m.index.array, pos = new Float32Array(I.length * 3);
    for (let k = 0; k < I.length; k++) { pos[k * 3] = P[I[k] * 3]; pos[k * 3 + 1] = P[I[k] * 3 + 1]; pos[k * 3 + 2] = P[I[k] * 3 + 2]; }
    return { name: m.name || `Gövde ${i + 1}`, pos };
  });
}

/* ───────────── ön işlem: birim, yukarı ekseni, gövdelere ayırma ───────────── */
export function prepare(meshes, { unit = 'auto', up = 'z' } = {}) {
  let ext = 0;
  const all = meshes.map(m => {
    const p = new Float64Array(m.pos.length);
    for (let i = 0; i < m.pos.length; i += 3) {
      const [x, y, z] = [m.pos[i], m.pos[i + 1], m.pos[i + 2]];
      if (up === 'y') { p[i] = x; p[i + 1] = -z; p[i + 2] = y; } else { p[i] = x; p[i + 1] = y; p[i + 2] = z; }
    }
    return { name: m.name, p };
  });
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (const m of all) for (let i = 0; i < m.p.length; i++) { const a = i % 3; mn[a] = Math.min(mn[a], m.p[i]); mx[a] = Math.max(mx[a], m.p[i]); }
  ext = Math.max(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]);
  const k = unit === 'm' ? 1000 : unit === 'cm' ? 10 : unit === 'mm' ? 1 : ext < 30 ? 1000 : ext < 300 ? 10 : 1;
  for (const m of all) for (let i = 0; i < m.p.length; i++) m.p[i] = (m.p[i] - (i % 3 === 2 ? mn[2] : 0)) * k; // zemin z = 0
  const bodies = [];
  for (const m of all) {
    const parts = splitComponents(m.p);
    parts.forEach((p, i) => bodies.push({ name: parts.length > 1 ? `${m.name} (${i + 1})` : m.name, p }));
  }
  return { bodies, scale: k, unitUsed: k === 1000 ? 'm' : k === 10 ? 'cm' : 'mm' };
}

// birbirine bağlı olmayan üçgen kümelerini ayrı gövde yapar
function splitComponents(p) {
  const nt = p.length / 9, key = new Map(), parent = new Int32Array(nt).map((_, i) => i);
  const find = a => { while (parent[a] !== a) a = parent[a] = parent[parent[a]]; return a; };
  for (let t = 0; t < nt; t++) for (let v = 0; v < 3; v++) {
    const o = t * 9 + v * 3, k = `${Math.round(p[o] * 100)},${Math.round(p[o + 1] * 100)},${Math.round(p[o + 2] * 100)}`;
    if (key.has(k)) { const a = find(key.get(k)), b = find(t); if (a !== b) parent[a] = b; } else key.set(k, t);
  }
  const groups = new Map();
  for (let t = 0; t < nt; t++) { const r = find(t); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(t); }
  const out = [...groups.values()].filter(g => g.length >= 4).map(g => {
    const q = new Float64Array(g.length * 9);
    g.forEach((t, i) => q.set(p.subarray(t * 9, t * 9 + 9), i * 9));
    return q;
  });
  return out.length ? out : [p];
}

/* ───────────── gövde çözümleme ───────────── */
const deg = r => r * 180 / Math.PI;

export function analyzeBody(b) {
  const p = b.p, nt = p.length / 9;
  // ana doğrultu: düşey yüz normallerinin 4θ ortalaması (90° simetrisi)
  let C = 0, S = 0;
  for (let t = 0; t < nt; t++) {
    const o = t * 9;
    const ax = p[o + 3] - p[o], ay = p[o + 4] - p[o + 1], az = p[o + 5] - p[o + 2];
    const bx = p[o + 6] - p[o], by = p[o + 7] - p[o + 1], bz = p[o + 8] - p[o + 2];
    const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
    const A = Math.hypot(nx, ny, nz);
    if (A < 1e-9 || Math.abs(nz) / A > 0.2) continue;
    const f = Math.atan2(ny, nx) * 4;
    C += A * Math.cos(f); S += A * Math.sin(f);
  }
  let th = Math.atan2(S, C) / 4;
  const snap = Math.round(deg(th) * 2) / 2;
  th = (Math.abs(snap - Math.round(snap / 90) * 90) < 1 ? Math.round(snap / 90) * 90 : snap) * Math.PI / 180;
  const local = theta => {
    const c = Math.cos(theta), s = Math.sin(theta), q = new Float64Array(p.length);
    for (let i = 0; i < p.length; i += 3) { q[i] = c * p[i] + s * p[i + 1]; q[i + 1] = -s * p[i] + c * p[i + 1]; q[i + 2] = p[i + 2]; }
    const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < q.length; i++) { const a = i % 3; mn[a] = Math.min(mn[a], q[i]); mx[a] = Math.max(mx[a], q[i]); }
    return { q, mn, mx };
  };
  let L = local(th);
  if (L.mx[1] - L.mn[1] > L.mx[0] - L.mn[0] + 1) { th += Math.PI / 2; L = local(th); } // uzun kenar yerel x
  const { q, mn, mx } = L;
  for (let i = 0; i < q.length; i++) q[i] -= mn[i % 3];
  const dims = [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]].map(v => Math.round(v));
  // yerel köşe (0,0,0) → dünya
  const c = Math.cos(th), s = Math.sin(th);
  const place = { x: c * mn[0] - s * mn[1], y: s * mn[0] + c * mn[1], z: mn[2], rot: Math.round(deg(th) * 100) / 100 };
  const body = { name: b.name, tris: q, dims, place, nt };
  const cell = Math.max(10, Math.min(40, Math.max(...dims) / 320));
  body.cell = cell;
  body.maps = {};
  for (const side of ['front', 'back', 'left', 'right', 'bottom']) body.maps[side] = depthMap(q, dims, side, cell);
  body.feat = {};
  for (const side of ['front', 'back', 'left', 'right']) body.feat[side] = features(body.maps[side], side === 'front' || side === 'back' ? dims[1] : dims[0]);
  classify(body);
  return body;
}

/* Yandan bakışla derinlik haritası: her hücre için görünen ilk yüzeyin derinliği (yoksa ∞).
 * Yüz koordinatları (u, v) mobilya kutusu yüz tanımlarıyla aynıdır: ön u = x, arka u = Lx − x, sol u = Ly − y, sağ u = y. */
function depthMap(q, [Lx, Ly, Lz], side, cell) {
  const proj = {
    front: (x, y, z) => [x, z, y], back: (x, y, z) => [Lx - x, z, Ly - y],
    left: (x, y, z) => [Ly - y, z, x], right: (x, y, z) => [y, z, Lx - x], bottom: (x, y, z) => [x, y, z],
  }[side];
  const W = side === 'left' || side === 'right' ? Ly : Lx, H = side === 'bottom' ? Ly : Lz;
  const nu = Math.max(1, Math.ceil(W / cell)), nv = Math.max(1, Math.ceil(H / cell));
  const d = new Float32Array(nu * nv).fill(Infinity);
  for (let o = 0; o < q.length; o += 9) {
    const A = proj(q[o], q[o + 1], q[o + 2]), B = proj(q[o + 3], q[o + 4], q[o + 5]), Cc = proj(q[o + 6], q[o + 7], q[o + 8]);
    const den = (B[1] - Cc[1]) * (A[0] - Cc[0]) + (Cc[0] - B[0]) * (A[1] - Cc[1]);
    if (Math.abs(den) < 1e-9) continue;
    const i0 = Math.max(0, Math.floor(Math.min(A[0], B[0], Cc[0]) / cell)), i1 = Math.min(nu - 1, Math.ceil(Math.max(A[0], B[0], Cc[0]) / cell));
    const j0 = Math.max(0, Math.floor(Math.min(A[1], B[1], Cc[1]) / cell)), j1 = Math.min(nv - 1, Math.ceil(Math.max(A[1], B[1], Cc[1]) / cell));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const px = (i + 0.5) * cell, py = (j + 0.5) * cell;
      const w1 = ((B[1] - Cc[1]) * (px - Cc[0]) + (Cc[0] - B[0]) * (py - Cc[1])) / den;
      const w2 = ((Cc[1] - A[1]) * (px - Cc[0]) + (A[0] - Cc[0]) * (py - Cc[1])) / den;
      const w3 = 1 - w1 - w2;
      if (w1 < -1e-6 || w2 < -1e-6 || w3 < -1e-6) continue;
      const z = w1 * A[2] + w2 * B[2] + w3 * Cc[2];
      const k = j * nu + i;
      if (z < d[k]) d[k] = z;
    }
  }
  return { nu, nv, cell, d, W, H };
}

/* Derinlik haritasından boşluk (delik) ve girinti (niş) bölgeleri. */
function features(m, T) {
  const { nu, nv, cell, d } = m, tol = 15;
  const seen = new Uint8Array(nu * nv), holes = [], recess = [];
  const cls = k => (d[k] === Infinity ? 2 : d[k] > tol && d[k] < T - tol ? 1 : 0);
  for (let s = 0; s < nu * nv; s++) {
    const c0 = cls(s);
    if (seen[s] || c0 === 0) continue;
    const stack = [s], cells = [];
    seen[s] = 1;
    while (stack.length) {
      const k = stack.pop(); cells.push(k);
      const i = k % nu, j = (k / nu) | 0;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ii = i + di, jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= nu || jj >= nv) continue;
        const kk = jj * nu + ii;
        if (seen[kk] || cls(kk) !== c0) continue;
        if (c0 === 1 && Math.abs(d[kk] - d[k]) > 15) continue;
        seen[kk] = 1; stack.push(kk);
      }
    }
    let i0 = nu, i1 = 0, j0 = nv, j1 = 0;
    for (const k of cells) { const i = k % nu, j = (k / nu) | 0; i0 = Math.min(i0, i); i1 = Math.max(i1, i); j0 = Math.min(j0, j); j1 = Math.max(j1, j); }
    const fill = cells.length / ((i1 - i0 + 1) * (j1 - j0 + 1));
    const touchSide = i0 === 0 || i1 === nu - 1 || j1 === nv - 1;
    const w = (i1 - i0 + 1) * cell, h = (j1 - j0 + 1) * cell;
    if (touchSide || fill < 0.8 || w < 100 || h < 100) continue;
    const r = { u: Math.round(i0 * cell), v: j0 === 0 ? 0 : Math.round(j0 * cell), w: Math.round(w), h: Math.round(j0 === 0 ? (j1 + 1) * cell : h) };
    if (c0 === 2) holes.push(r);
    else { const ds = cells.map(k => d[k]).sort((a, b) => a - b); recess.push({ ...r, d: Math.round(ds[ds.length >> 1]) }); }
  }
  return { holes, recess };
}

/* ───────────── sınıflandırma ve eleman parametreleri ───────────── */
const r10 = v => Math.round(v / 5) * 5;

export function classify(b) {
  const [Lx, Ly, Lz] = b.dims, f = b.feat, notes = [];
  b.notes = notes;
  if (Math.max(Lx, Ly, Lz) < 200 || Lx * Ly * Lz < 2e5) { b.kind = 'yoksay'; notes.push('Çok küçük gövde — aksesuar / detay sayıldı'); return; }
  if (Lz <= 250 && Lx > 600 && Ly > 600) {
    if (b.place.z > 1600) { b.kind = 'tavan'; return; }
    b.kind = 'yoksay'; notes.push('Yatay plaka (tezgah / raf / basamak) — alçıpan karkas gerekmez'); return;
  }
  const front = f.front, back = f.back;
  const hasRecess = [front, back, f.left, f.right].some(x => x.recess.length);
  if (Ly <= 170 && Lz >= 900 && !hasRecess) b.kind = 'duvar';
  else b.kind = 'kutu';
}

// kalınlığa göre sistem / kat seçimi
function wallBuild(T) {
  let best = null;
  for (const sys of [50, 75, 100]) for (const a of [1, 2]) for (const c of [1, 2]) {
    const e = Math.abs(sys + 12.5 * (a + c) - T) + (a + c - 2) * 3; // eşitlikte az kat
    if (!best || e < best.e) best = { sys, a, c, e };
  }
  return best;
}

export function toElement(b, kind = b.kind) {
  const [Lx, Ly, Lz] = b.dims;
  const src = { file: b.file, body: b.name, place: b.place, dims: b.dims };
  if (kind === 'duvar') {
    const wb = wallBuild(Ly);
    const openings = b.feat.front.holes.map(h => ({ type: h.v < 30 ? 'door' : 'window', x: r10(h.u), w: r10(h.w), h: r10(h.v < 30 ? h.h : h.h), sill: h.v < 30 ? 0 : r10(h.v) }));
    const p = { L: r10(Lx), H: r10(Lz), sys: wb.sys, s: 600, A: { layers: wb.a, board: 'std' }, B: { layers: wb.c, board: 'std' }, insul: 'tasyunu', insulT: 50, endA: 'free', endB: 'free', openings };
    const info = [`Kalınlık ${Ly} mm → ${wb.sys} sistem + ${wb.a}/${wb.c} kat levha (${wb.sys + 12.5 * (wb.a + wb.c)} mm)`];
    if (wb.e > 12) info.push(`Kalınlık standart kombinasyondan ${Math.round(wb.e)} mm farklı — sistemi kontrol edin`);
    return { type: 'duvar', params: p, src, info };
  }
  if (kind === 'tavan') {
    const p = { L: r10(Lx), W: r10(Ly), Hc: r10(b.place.z), Hs: r10(b.place.z + Math.max(300, Lz + 150)), car: 1000, sec: 400, hang: 900, board: 'std', layers: 1, cove: false, coveW: 350, coveDrop: 150, coveSlot: 80, spotRows: 0, spotCols: 0, spotD: 75, hatch: false, hatchX: 600, hatchY: 600, hatchS: 600 };
    return { type: 'tavan', params: p, src, info: ['Döşeme kotu modelde yok: tavan kotu + 300 mm varsayıldı, düzeltin'] };
  }
  // mobilya kutusu: model dış ölçü; iskelet = dış − levha
  const t = 12.5;
  const niches = [];
  for (const face of ['front', 'back', 'left', 'right']) for (const r of b.feat[face].recess)
    niches.push({ face, u: r10(r.u - t - t), v: r10(Math.max(0, r.v - t)), w: r10(r.w + 2 * t), h: r10(r.h + 2 * t), d: r10(r.d) });
  const p = { W: r10(Lx - 2 * t), D: r10(Ly - 2 * t), H: r10(Lz - t), sys: 50, s: 400, board: 'std', layers: 1, cladF: true, cladB: true, cladL: true, cladR: true, cladT: true, wallBack: false, topLoad: false, niches };
  const info = [`Dış ölçü ${Lx} × ${Ly} × ${Lz} mm → iskelet ${p.W} × ${p.D} × ${p.H} mm`];
  const holes = ['front', 'back', 'left', 'right'].flatMap(s => b.feat[s].holes);
  if (holes.length) info.push(`${holes.length} geçiş boşluğu bulundu — mobilya kutusunda desteklenmez, gerekirse ilave profille çözün`);
  return { type: 'kutu', params: p, src, info };
}

/* ───────────── birleşimler (montaj detayları) ───────────── */
const rot = (pl, x, y) => { const a = pl.rot * Math.PI / 180, c = Math.cos(a), s = Math.sin(a); return [pl.x + c * x - s * y, pl.y + s * x + c * y]; };
const toLocal = (pl, X, Y) => { const a = pl.rot * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), dx = X - pl.x, dy = Y - pl.y; return [c * dx + s * dy, -s * dx + c * dy]; };
// noktanın gövde ayak izine (yerel dikdörtgen) uzaklığı
function distFoot(b, X, Y) { const [x, y] = toLocal(b.place, X, Y); const dx = Math.max(0, -x, x - b.dims[0]), dy = Math.max(0, -y, y - b.dims[1]); return Math.hypot(dx, dy); }

export function findJoints(items) {
  // items: [{ id, kind, dims, place }]
  const tol = 40, joints = [];
  const vert = items.filter(i => i.kind === 'duvar' || i.kind === 'kutu');
  const sidesOf = b => {
    const [L, T] = b.dims;
    return {
      endA: [[0, T * 0.25], [0, T * 0.5], [0, T * 0.75]], endB: [[L, T * 0.25], [L, T * 0.5], [L, T * 0.75]],
      front: [[L * 0.2, 0], [L * 0.5, 0], [L * 0.8, 0]], back: [[L * 0.2, T], [L * 0.5, T], [L * 0.8, T]],
    };
  };
  const touches = (a, pts, b) => pts.every(([x, y]) => { const [X, Y] = rot(a.place, x, y); return distFoot(b, X, Y) <= tol; });
  for (const a of vert) {
    a.contact = {};
    for (const [side, pts] of Object.entries(sidesOf(a))) for (const b of vert) if (b !== a && touches(a, pts, b)) a.contact[side] = b.id;
  }
  const done = new Set();
  for (const a of vert) for (const end of ['endA', 'endB']) {
    const bid = a.contact[end]; if (bid == null) continue;
    const b = vert.find(v => v.id === bid);
    const key = [a.id, b.id].sort().join('|');
    const bEnds = ['endA', 'endB'].filter(e => b.contact[e] === a.id);
    // temas noktası (b'nin yerel x'i)
    const [X, Y] = rot(a.place, end === 'endA' ? 0 : a.dims[0], a.dims[1] / 2);
    const [bx, by] = toLocal(b.place, X, Y);
    if (bEnds.length) {
      if (done.has(key)) continue; done.add(key);
      const ang = Math.abs(((a.place.rot - b.place.rot) % 180 + 180) % 180);
      joints.push({ type: Math.abs(ang - 90) < 10 ? 'L' : ang < 10 || ang > 170 ? 'I' : 'L', a: a.id, b: b.id, endA: end, endB: bEnds[0], angle: Math.round(ang) });
    } else {
      // ana duvarın ucuna yakın dayanma → L köşe (ana duvar köşeden geçer)
      const half = a.dims[1] / 2 + 60;
      const hostEnd = bx <= half ? 'endA' : bx >= b.dims[0] - half ? 'endB' : null;
      if (hostEnd) {
        if (done.has(key)) continue; done.add(key);
        b.contact[hostEnd] = a.id;
        joints.push({ type: 'L', a: a.id, b: b.id, endA: end, endB: hostEnd, pos: Math.round(bx), angle: 90 });
      } else joints.push({ type: 'T', a: a.id, b: b.id, endA: end, pos: Math.round(bx), face: by < b.dims[1] / 2 ? 'front' : 'back' });
    }
  }
  for (const a of vert) if (a.kind === 'duvar') for (const end of ['endA', 'endB']) if (a.contact[end] == null) joints.push({ type: 'free', a: a.id, endA: end });
  for (const a of vert) for (const side of ['front', 'back']) if (a.kind === 'kutu' && a.contact[side] != null) {
    const b = vert.find(v => v.id === a.contact[side]);
    if (b.kind === 'duvar' || b.kind === 'kutu') joints.push({ type: 'wallfix', a: a.id, b: b.id, side });
  }
  // tavan – duvar
  for (const c of items.filter(i => i.kind === 'tavan')) for (const a of vert) {
    const top = a.place.z + a.dims[2];
    const [X, Y] = rot(a.place, a.dims[0] / 2, a.dims[1] / 2);
    const [cx, cy] = toLocal(c.place, X, Y);
    const inside = cx > -tol && cy > -tol && cx < c.dims[0] + tol && cy < c.dims[1] + tol;
    if (!inside) continue;
    if (top >= c.place.z - tol) joints.push({ type: 'ceiling', a: a.id, b: c.id, z: Math.round(c.place.z - a.place.z), through: top > c.place.z + c.dims[2] + tol });
  }
  return joints;
}

export const JOINT_LABEL = {
  T: 'T birleşimi', L: 'L köşe birleşimi', I: 'Düz ek (aynı doğrultu)', free: 'Serbest uç',
  wallfix: 'Mobilya – duvar bağlantısı', ceiling: 'Duvar – asma tavan birleşimi',
};
