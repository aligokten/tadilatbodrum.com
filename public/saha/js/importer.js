/* ═══ CAD / PDF içe aktarma — DXF ve PDF çizimlerini otomatik olarak plana dönüştürür ═══
 * 1) Okuma : DXF (dxf-parser) · vektör PDF (pdf.js) → çizgi, eğri ve yazı listesi
 * 2) Tanıma: paralel çift çizgi → duvar (kalınlığıyla), aynı hizadaki duvarlar arası boşluk →
 *            kapı (açılım yayı) / pencere (cam çizgileri) / boşluk, köşe birleştirme,
 *            duvarlarla çevrili alanlar → oda (yazılardan oda adı)
 * Birim: cm, y aşağı (editörle aynı).
 */
import { uid } from './store.js';
import { emptyPlan } from './plan-geom.js';

const D2R = Math.PI / 180;

/* ───────────────────────── OKUMA ───────────────────────── */

export function detectFormat(name, bytes) {
  const head = new TextDecoder('latin1').decode(bytes.slice(0, 6));
  if (head.startsWith('AC10')) return 'dwg';
  if (head.startsWith('%PDF')) return 'pdf';
  if (/\.dxf$/i.test(name) || /^\s*0\s*$/m.test(new TextDecoder('latin1').decode(bytes.slice(0, 200)))) return 'dxf';
  if (/\.dwg$/i.test(name)) return 'dwg';
  if (/\.pdf$/i.test(name)) return 'pdf';
  return 'unknown';
}

let dxfLib;
async function loadDxfParser() {
  if (window.DxfParser) return window.DxfParser;
  dxfLib ??= new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'vendor/dxf-parser.js'; s.onload = () => res(window.DxfParser); s.onerror = () => rej(new Error('DXF okuyucu yüklenemedi')); document.head.append(s); });
  return dxfLib;
}

const cleanMText = s => String(s || '').replace(/\\P/g, ' ').replace(/\\[A-Za-z][^;]*;/g, '').replace(/[{}]/g, '').replace(/\\~/g, ' ').replace(/%%[cdp]/gi, '').trim();

/* DXF → ham geometri (çizim birimi) */
export async function readDXF(text) {
  const Parser = await loadDxfParser();
  const dxf = new Parser().parseSync(text);
  const segs = [], curves = [], texts = [];
  const layers = new Map();
  const addLayer = l => layers.set(l, (layers.get(l) || 0) + 1);
  const xf = (m, p) => ({ x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] });
  const mul = (A, B) => [A[0] * B[0] + A[2] * B[1], A[1] * B[0] + A[3] * B[1], A[0] * B[2] + A[2] * B[3], A[1] * B[2] + A[3] * B[3], A[0] * B[4] + A[2] * B[5] + A[4], A[1] * B[4] + A[3] * B[5] + A[5]];
  const arcPts = (c, r, a0, a1, n = 12) => { if (a1 < a0) a1 += Math.PI * 2; const out = []; for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; out.push({ x: c.x + r * Math.cos(a), y: c.y + r * Math.sin(a) }); } return out; };
  const walk = (ents, m, inhLayer, depth) => {
    if (depth > 6) return;
    for (const e of ents || []) {
      const layer = (e.layer === '0' && inhLayer) ? inhLayer : (e.layer || '0');
      switch (e.type) {
        case 'LINE': {
          const [a, b] = e.vertices; segs.push({ a: xf(m, a), b: xf(m, b), layer }); addLayer(layer); break;
        }
        case 'LWPOLYLINE': case 'POLYLINE': {
          const v = (e.vertices || []).filter(p => !p.faces);
          for (let i = 0; i < v.length - 1; i++) segs.push({ a: xf(m, v[i]), b: xf(m, v[i + 1]), layer });
          if ((e.shape || e.closed) && v.length > 2) segs.push({ a: xf(m, v.at(-1)), b: xf(m, v[0]), layer });
          addLayer(layer); break;
        }
        case 'ARC': {
          // dxf-parser açıları radyana çevirir
          curves.push({ pts: arcPts(e.center, e.radius, e.startAngle, e.endAngle).map(p => xf(m, p)), layer }); addLayer(layer); break;
        }
        case 'CIRCLE': curves.push({ pts: arcPts(e.center, e.radius, 0, Math.PI * 2, 24).map(p => xf(m, p)), layer, closed: true }); addLayer(layer); break;
        case 'TEXT': case 'MTEXT': case 'ATTRIB': {
          const p = e.position || e.startPoint || e.insertionPoint; if (!p) break;
          const t = cleanMText(e.text); if (t) texts.push({ ...xf(m, p), text: t, layer }); break;
        }
        case 'INSERT': {
          const blk = dxf.blocks?.[e.name]; if (!blk || /^\*[DU]/i.test(e.name)) break;   // ölçülendirme blokları hariç
          const sx = e.xScale ?? 1, sy = e.yScale ?? 1, r = (e.rotation || 0) * D2R, bp = blk.position || { x: 0, y: 0 };
          const local = [sx * Math.cos(r), sx * Math.sin(r), -sy * Math.sin(r), sy * Math.cos(r), e.position.x, e.position.y];
          const toBase = [1, 0, 0, 1, -bp.x, -bp.y];
          walk(blk.entities, mul(m, mul(local, toBase)), layer, depth + 1);
          break;
        }
      }
    }
  };
  walk(dxf.entities, [1, 0, 0, 1, 0, 0], null, 0);
  const ins = dxf.header?.$INSUNITS;
  const unit = { 1: 2.54, 2: 30.48, 4: 0.1, 5: 1, 6: 100 }[ins] || null;   // çizim birimi → cm
  // DXF'te y yukarı; editörde y aşağı
  const flip = p => ({ x: p.x, y: -p.y });
  return {
    format: 'dxf', unitCm: unit, unitSource: unit ? 'header' : 'guess',
    segs: segs.map(s => ({ ...s, a: flip(s.a), b: flip(s.b) })),
    curves: curves.map(c => ({ ...c, pts: c.pts.map(flip) })),
    texts: texts.map(t => ({ ...t, ...flip(t) })),
    layers: [...layers.entries()].map(([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n),
  };
}

/* PDF → ham geometri (punto) ; vektör yoksa raster görüntü döner */
export async function readPDF(bytes, pageNo = 1) {
  const pdfjs = await import('../vendor/pdfjs/pdf.min.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;
  const doc = await pdfjs.getDocument({ data: bytes.slice(0), isEvalSupported: false }).promise;
  const page = await doc.getPage(Math.min(pageNo, doc.numPages));
  const vp = page.getViewport({ scale: 1 });
  const ol = await page.getOperatorList();
  const O = pdfjs.OPS;
  const segs = [], curves = [];
  let ctm = [1, 0, 0, 1, 0, 0]; const stack = [];
  const mul = (A, B) => [A[0] * B[0] + A[2] * B[1], A[1] * B[0] + A[3] * B[1], A[0] * B[2] + A[2] * B[3], A[1] * B[2] + A[3] * B[3], A[0] * B[4] + A[2] * B[5] + A[4], A[1] * B[4] + A[3] * B[5] + A[5]];
  const T = (x, y) => { const px = ctm[0] * x + ctm[2] * y + ctm[4], py = ctm[1] * x + ctm[3] * y + ctm[5]; const [vx, vy] = vp.convertToViewportPoint(px, py); return { x: vx, y: vy }; };
  const bez = (p0, p1, p2, p3, n = 10) => { const o = []; for (let i = 0; i <= n; i++) { const t = i / n, u = 1 - t; o.push({ x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x, y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y }); } return o; };
  for (let i = 0; i < ol.fnArray.length; i++) {
    const fn = ol.fnArray[i], args = ol.argsArray[i];
    if (fn === O.save) stack.push(ctm.slice());
    else if (fn === O.restore) ctm = stack.pop() || [1, 0, 0, 1, 0, 0];
    else if (fn === O.transform) ctm = mul(ctm, args);
    else if (fn === O.constructPath) {
      const [ops, c] = args; let k = 0, cur = null, start = null, cx = 0, cy = 0;
      for (const op of ops) {
        if (op === O.moveTo) { cx = c[k++]; cy = c[k++]; cur = start = T(cx, cy); }
        else if (op === O.lineTo) { cx = c[k++]; cy = c[k++]; const p = T(cx, cy); if (cur) segs.push({ a: cur, b: p, layer: 'PDF' }); cur = p; }
        else if (op === O.curveTo) { const p1 = T(c[k], c[k + 1]), p2 = T(c[k + 2], c[k + 3]); cx = c[k + 4]; cy = c[k + 5]; k += 6; const p3 = T(cx, cy); if (cur) curves.push({ pts: bez(cur, p1, p2, p3), layer: 'PDF' }); cur = p3; }
        else if (op === O.curveTo2) { const p2 = T(c[k], c[k + 1]); cx = c[k + 2]; cy = c[k + 3]; k += 4; const p3 = T(cx, cy); if (cur) curves.push({ pts: bez(cur, cur, p2, p3), layer: 'PDF' }); cur = p3; }
        else if (op === O.curveTo3) { const p1 = T(c[k], c[k + 1]); cx = c[k + 2]; cy = c[k + 3]; k += 4; const p3 = T(cx, cy); if (cur) curves.push({ pts: bez(cur, p1, p3, p3), layer: 'PDF' }); cur = p3; }
        else if (op === O.closePath) { if (cur && start) segs.push({ a: cur, b: start, layer: 'PDF' }); cur = start; }
        else if (op === O.rectangle) {
          const x = c[k++], y = c[k++], w = c[k++], h = c[k++];
          const q = [T(x, y), T(x + w, y), T(x + w, y + h), T(x, y + h)];
          for (let j = 0; j < 4; j++) segs.push({ a: q[j], b: q[(j + 1) % 4], layer: 'PDF' });
          cur = start = q[0];
        }
      }
    }
  }
  const tc = await page.getTextContent();
  const texts = tc.items.filter(it => it.str?.trim()).map(it => { const [x, y] = vp.convertToViewportPoint(it.transform[4], it.transform[5]); return { x, y, text: it.str.trim(), layer: 'PDF' }; });
  // sayfa çerçevesi / kenar boşluk çizgilerini at
  const onEdge = p => p.x < 2 || p.y < 2 || p.x > vp.width - 2 || p.y > vp.height - 2;
  const segsIn = segs.filter(s => !(onEdge(s.a) && onEdge(s.b) && (Math.abs(s.a.x - s.b.x) < 2 || Math.abs(s.a.y - s.b.y) < 2)));
  segs.length = 0; segs.push(...segsIn);
  const out = { format: 'pdf', pages: doc.numPages, page: pageNo, unitCm: null, unitSource: 'scale', segs, curves, texts, layers: [{ name: 'PDF', n: segs.length }], ptToMm: 25.4 / 72 };
  if (segs.length < 30) {     // taranmış / resim PDF
    const v2 = page.getViewport({ scale: 3 });
    const cv = document.createElement('canvas'); cv.width = v2.width; cv.height = v2.height;
    await page.render({ canvasContext: cv.getContext('2d'), viewport: v2 }).promise;
    out.raster = await new Promise(r => cv.toBlob(r, 'image/png'));
    out.rasterSize = { w: vp.width, h: vp.height };
  }
  return out;
}

/* ───────────────────────── GEOMETRİ YARDIMCILARI ───────────────────────── */
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });
const mulv = (a, k) => ({ x: a.x * k, y: a.y * k });
const dot = (a, b) => a.x * b.x + a.y * b.y;
const cross = (a, b) => a.x * b.y - a.y * b.x;
const len = a => Math.hypot(a.x, a.y);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const norm = a => { const l = len(a) || 1; return { x: a.x / l, y: a.y / l }; };

/* yön açısı [0,180) */
const angOf = s => { let a = Math.atan2(s.b.y - s.a.y, s.b.x - s.a.x) / D2R; a = ((a % 180) + 180) % 180; return a; };
const angDiff = (a, b) => { const d = Math.abs(a - b) % 180; return Math.min(d, 180 - d); };

/* aynı doğru üzerindeki örtüşen/bitişik çizgileri birleştir */
function mergeCollinear(segs, tolOff = 1, tolGap = 1) {
  const groups = new Map();
  for (const s of segs) {
    let a = angOf(s); const key = Math.round(a * 2) % 360;
    (groups.get(key) || groups.set(key, []).get(key)).push(s);
  }
  const out = [];
  for (const g of groups.values()) {
    const u = norm(sub(g[0].b, g[0].a)); const dir = u.x < -1e-9 || (Math.abs(u.x) < 1e-9 && u.y < 0) ? mulv(u, -1) : u;
    const n = { x: -dir.y, y: dir.x };
    const items = g.map(s => { const o = dot(s.a, n); let t0 = dot(s.a, dir), t1 = dot(s.b, dir); if (t0 > t1) [t0, t1] = [t1, t0]; return { o, t0, t1, layer: s.layer }; }).sort((p, q) => p.o - q.o || p.t0 - q.t0);
    // ofsete göre kümele
    const lines = [];
    for (const it of items) { const L = lines.at(-1); if (L && Math.abs(it.o - L.o) <= tolOff) L.items.push(it); else lines.push({ o: it.o, items: [it] }); }
    for (const L of lines) {
      const iv = L.items.sort((p, q) => p.t0 - q.t0);
      let cur = { ...iv[0] };
      const o = iv.reduce((s, x) => s + x.o, 0) / iv.length;
      const emit = c => { if (c.t1 - c.t0 > 0.5) out.push({ a: add(mulv(dir, c.t0), mulv(n, o)), b: add(mulv(dir, c.t1), mulv(n, o)), layer: c.layer }); };
      for (const x of iv.slice(1)) { if (x.t0 <= cur.t1 + tolGap) cur.t1 = Math.max(cur.t1, x.t1); else { emit(cur); cur = { ...x }; } }
      emit(cur);
    }
  }
  return out;
}

/* ───────────────────────── TANIMA ───────────────────────── */

const WALL_RX = /wall|duvar|wand|mur|muro|a-wall|beton|tugla|tuğla|perde|kolon|column/i;
const SKIP_RX = /dim|ölç|olcu|ölçü|text|yazi|yazı|anno|furn|mob|esya|eşya|hatch|tarama|grid|aks|axis|title|antet|defpoints|symb|sembol|elec|elek|tesisat|plumb|hvac|vp|viewport/i;
export function guessLayers(layers) {
  const wall = layers.filter(l => WALL_RX.test(l.name)).map(l => l.name);
  if (wall.length) return wall;
  return layers.filter(l => !SKIP_RX.test(l.name)).map(l => l.name);
}

/* PDF ölçeği / birimsiz DXF birimi tahmini: en sık görülen paralel çizgi aralığını tipik duvar kalınlığına (≈20 cm) eşle */
export function guessScale(raw, toCm) {
  const S = mergeCollinear(raw.segs.map(s => ({ ...s })), 0.05, 0.05).filter(s => dist(s.a, s.b) > 0);
  const lens = S.map(s => dist(s.a, s.b)).sort((a, b) => b - a);
  if (!lens.length) return null;
  const long = lens[Math.min(lens.length - 1, Math.floor(lens.length * 0.1))];
  const xs = S.flatMap(s => [s.a.x, s.b.x]), ys = S.flatMap(s => [s.a.y, s.b.y]);
  const extent = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  const maxD = Math.max(long * 0.08, extent * 0.03);
  const cand = S.filter(s => dist(s.a, s.b) >= Math.min(long * 0.2, extent * 0.02));
  const hist = new Map();
  for (let i = 0; i < cand.length && i < 1500; i++) for (let j = i + 1; j < cand.length && j < 1500; j++) {
    const s = cand[i], q = cand[j]; if (angDiff(angOf(s), angOf(q)) > 1) continue;
    const u = norm(sub(s.b, s.a)), n = { x: -u.y, y: u.x };
    const d = Math.abs(dot(sub(q.a, s.a), n)); if (d <= 0 || d > maxD) continue;
    const t = [dot(sub(q.a, s.a), u), dot(sub(q.b, s.a), u)].sort((a, b) => a - b), L = dist(s.a, s.b);
    if (Math.min(L, t[1]) - Math.max(0, t[0]) < long * 0.05) continue;
    const key = +(d.toPrecision(2)); hist.set(key, (hist.get(key) || 0) + (Math.min(L, t[1]) - Math.max(0, t[0])));   // örtüşme uzunluğuyla ağırlıklı
  }
  if (!hist.size) return null;
  const mode = [...hist.entries()].sort((a, b) => b[1] - a[1])[0][0];
  return toCm ? 20 / mode : 20 / mode;   // 1 çizim birimi kaç cm
}

/* ana dönüştürücü: ham geometri + seçenekler → plan */
export function recognize(raw, opt) {
  const k = opt.unitCm;                                    // çizim birimi → cm
  const sc = p => ({ x: p.x * k, y: p.y * k });
  const sel = new Set(opt.layers);
  const allSegs = raw.segs.map(s => ({ a: sc(s.a), b: sc(s.b), layer: s.layer })).filter(s => dist(s.a, s.b) >= 1);
  const curves = raw.curves.map(c => ({ pts: c.pts.map(sc), layer: c.layer, closed: c.closed })).filter(c => !c.closed);
  const texts = raw.texts.map(t => ({ ...t, ...sc(t) }));
  let segs = mergeCollinear(allSegs.filter(s => sel.has(s.layer)), 0.8, 1.5).filter(s => dist(s.a, s.b) >= opt.minLen);
  const tMin = opt.minT, tMax = opt.maxT;

  /* 1) duvarlar: paralel çift çizgiler */
  let walls = [];
  const useDouble = opt.mode !== 'single';
  if (useDouble) {
    const buckets = new Map();
    segs.forEach((s, i) => { s.i = i; s.ang = angOf(s); s.L = dist(s.a, s.b); s.cov = []; const b = Math.round(s.ang) % 180; (buckets.get(b) || buckets.set(b, []).get(b)).push(s); });
    const cands = [];
    for (const s of segs) {
      const u = norm(sub(s.b, s.a)), n = { x: -u.y, y: u.x };
      const b0 = Math.round(s.ang);
      for (const bb of [b0 - 1, b0, b0 + 1]) for (const q of buckets.get(((bb % 180) + 180) % 180) || []) {
        if (q.i <= s.i || angDiff(s.ang, q.ang) > 1.5) continue;
        const d1 = dot(sub(q.a, s.a), n), d2 = dot(sub(q.b, s.a), n);
        if (Math.abs(d1 - d2) > 1.5) continue;
        const d = (d1 + d2) / 2, ad = Math.abs(d);
        if (ad < tMin || ad > tMax) continue;
        let t0 = dot(sub(q.a, s.a), u), t1 = dot(sub(q.b, s.a), u); if (t0 > t1) [t0, t1] = [t1, t0];
        const o0 = Math.max(0, t0), o1 = Math.min(s.L, t1);
        if (o1 - o0 < Math.max(15, ad * 0.9)) continue;
        cands.push({ s, q, d, ad, u, n, o0, o1 });
      }
    }
    cands.sort((x, y) => x.ad - y.ad || (y.o1 - y.o0) - (x.o1 - x.o0));
    const covered = (seg, a, b) => { let c = 0; for (const [x, y] of seg.cov) c += Math.max(0, Math.min(b, y) - Math.max(a, x)); return c / Math.max(1e-6, b - a); };
    for (const c of cands) {
      const { s, q, u } = c;
      const qa = dot(sub(add(s.a, mulv(u, c.o0)), q.a), norm(sub(q.b, q.a))), qb = dot(sub(add(s.a, mulv(u, c.o1)), q.a), norm(sub(q.b, q.a)));
      const [q0, q1] = qa < qb ? [qa, qb] : [qb, qa];
      if (covered(s, c.o0, c.o1) > 0.4 || covered(q, q0, q1) > 0.4) continue;
      s.cov.push([c.o0, c.o1]); q.cov.push([q0, q1]);
      const off = mulv(c.n, c.d / 2);
      walls.push({ a: add(add(s.a, mulv(u, c.o0)), off), b: add(add(s.a, mulv(u, c.o1)), off), t: Math.round(c.ad) });
    }
  }
  if (!walls.length || opt.mode === 'single') {
    walls = segs.filter(s => dist(s.a, s.b) >= Math.max(opt.minLen, 40)).map(s => ({ a: s.a, b: s.b, t: opt.defT }));
  } else {
    // daha kalın bir duvarın bandı içinde kalan ince "duvarları" at (pencere camı, sıva çizgisi vb.)
    walls = walls.filter(w => !walls.some(v => v !== w && v.t > w.t * 1.5 && angDiff(angOf(v), angOf(w)) < 2 && (() => {
      const u = norm(sub(v.b, v.a)), n = { x: -u.y, y: u.x }, L = dist(v.a, v.b);
      return [w.a, w.b].every(p => Math.abs(dot(sub(p, v.a), n)) <= v.t / 2 + 1 && dot(sub(p, v.a), u) >= -v.t && dot(sub(p, v.a), u) <= L + v.t);
    })()));
  }

  // yazı/sembol çizgilerinden oluşan kısa parçaları ele (kalınlığına göre çok kısa duvar olmaz)
  walls = walls.filter(w => dist(w.a, w.b) >= Math.max(opt.minLen, w.t * 1.6, 20));

  /* 2) aynı hizadaki duvarları birleştir, aralarındaki boşlukları açıklık yap */
  const lines = [];
  for (const w of walls) {
    let u = norm(sub(w.b, w.a)); if (u.x < -1e-9 || (Math.abs(u.x) < 1e-9 && u.y < 0)) u = mulv(u, -1);
    const n = { x: -u.y, y: u.x }, o = dot(w.a, n);
    let t0 = dot(w.a, u), t1 = dot(w.b, u); if (t0 > t1) [t0, t1] = [t1, t0];
    let L = lines.find(l => angDiff(l.ang, angOf(w)) < 1.5 && Math.abs(l.o - o) <= Math.max(3, Math.min(l.t, w.t) * 0.3) && Math.abs(l.t - w.t) <= Math.max(3, w.t * 0.35));
    if (!L) { L = { ang: angOf(w), u, n, o, t: w.t, iv: [] }; lines.push(L); }
    L.iv.push([t0, t1, w.t]);
  }
  const outWalls = [], openings = [];
  const glass = mergeCollinear(allSegs, 0.5, 1);
  for (const L of lines) {
    L.iv.sort((a, b) => a[0] - b[0]);
    const T = Math.round(L.iv.reduce((s, x) => s + x[2] * (x[1] - x[0]), 0) / L.iv.reduce((s, x) => s + (x[1] - x[0]), 0));
    // aralıkları birleştir, boşlukları kaydet
    const runs = []; let cur = [...L.iv[0]];
    const gaps = [];
    for (const x of L.iv.slice(1)) {
      const g = x[0] - cur[1];
      if (g <= 2) { cur[1] = Math.max(cur[1], x[1]); continue; }
      if (opt.openings && g >= opt.minGap && g <= opt.maxGap) { gaps.push([cur[1], x[0]]); cur[1] = Math.max(cur[1], x[1]); continue; }
      runs.push({ iv: cur, gaps: gaps.splice(0) }); cur = [...x];
    }
    runs.push({ iv: cur, gaps: gaps.splice(0) });
    for (const r of runs) {
      const P = t => add(mulv(L.u, t), mulv(L.n, L.o));
      if (r.iv[1] - r.iv[0] < opt.minLen) continue;
      const w = { id: uid('w'), a: P(r.iv[0]), b: P(r.iv[1]), t: T, h: 0 };
      outWalls.push(w);
      for (const [g0, g1] of r.gaps) {
        const gw = g1 - g0, mid = P((g0 + g1) / 2);
        // pencere: boşluk içinde duvar doğrultusunda cam çizgisi
        const isWin = glass.some(s => angDiff(angOf(s), L.ang) < 2 && Math.abs(dot(s.a, L.n) - L.o) <= T / 2 + 1 &&
          (() => { let a = dot(s.a, L.u), b = dot(s.b, L.u); if (a > b) [a, b] = [b, a]; return Math.min(b, g1) - Math.max(a, g0) > gw * 0.6; })());
        // kapı: menteşesi boşluk ucunda, yarıçapı boşluğa yakın yay
        let door = null;
        for (const c of curves) {
          const p0 = c.pts[0], pm = c.pts[Math.floor(c.pts.length / 2)], p1 = c.pts.at(-1);
          const cc = circum(p0, pm, p1); if (!cc) continue;
          if (Math.abs(cc.r - gw) > Math.max(12, gw * 0.3)) continue;
          for (const [end, flip] of [[g0, false], [g1, true]]) {
            const E = P(end);
            if (dist(E, cc) <= Math.max(T * 0.75, 15)) { door = { flip, side: dot(sub(pm, mid), L.n) >= 0 ? 1 : -1 }; break; }
          }
          if (door) break;
        }
        const pos = (g0 + g1) / 2 - r.iv[0];
        const along = dot(sub(w.b, w.a), L.u) >= 0 ? pos : (r.iv[1] - r.iv[0]) - pos;
        if (door) openings.push({ id: uid('o'), wallId: w.id, type: 'door', pos: along, w: Math.round(gw), h: 210, sill: 0, flip: door.flip, side: door.side });
        else if (isWin) openings.push({ id: uid('o'), wallId: w.id, type: 'window', pos: along, w: Math.round(gw), h: 140, sill: 90, flip: false, side: 1 });
        else openings.push({ id: uid('o'), wallId: w.id, type: gw <= 130 ? 'door' : 'gap', pos: along, w: Math.round(gw), h: gw <= 130 ? 210 : 220, sill: 0, flip: false, side: 1 });
      }
    }
  }

  /* 3) köşe birleştirme: uçları komşu duvar ekseniyle kesişime taşı */
  for (let pass = 0; pass < 2; pass++) for (const w of outWalls) for (const end of ['a', 'b']) {
    const E = w[end], uw = norm(sub(w.b, w.a));
    let best = null, bd = Infinity;
    for (const v of outWalls) {
      if (v === w) continue;
      const uv = norm(sub(v.b, v.a)); if (Math.abs(cross(uw, uv)) < 0.5) continue;
      const P = lineX(w.a, uw, v.a, uv); if (!P) continue;
      const d = dist(E, P), lim = Math.max(w.t, v.t) * 0.8 + 6;
      if (d > lim || d >= bd) continue;
      const tv = dot(sub(P, v.a), uv), Lv = dist(v.a, v.b);
      if (tv < -v.t / 2 - lim || tv > Lv + v.t / 2 + lim) continue;
      bd = d; best = P;
    }
    if (best) {
      const old = { ...w[end] }; w[end] = best;
      if (end === 'a') { const sh = dot(sub(old, best), uw); openings.filter(o => o.wallId === w.id).forEach(o => { o.pos += sh; }); }
    }
  }

  /* 4) odalar: duvarlarla kapalı alanlar (ızgara taraması) */
  const plan = emptyPlan();
  plan.meta.wallT = Math.round(median(outWalls.map(w => w.t)) || 15);
  plan.walls = outWalls; plan.openings = openings.filter(o => outWalls.some(w => w.id === o.wallId));
  if (opt.rooms && outWalls.length >= 3) plan.rooms = findRooms(outWalls, texts);

  /* 5) orijine taşı */
  const pts = [...plan.walls.flatMap(w => [w.a, w.b]), ...plan.rooms.flatMap(r => r.pts)];
  if (pts.length) {
    const x0 = Math.min(...pts.map(p => p.x)), y0 = Math.min(...pts.map(p => p.y));
    const mv = p => ({ x: +(p.x - x0).toFixed(1), y: +(p.y - y0).toFixed(1) });
    plan.walls.forEach(w => { w.a = mv(w.a); w.b = mv(w.b); });
    plan.rooms.forEach(r => { r.pts = r.pts.map(mv); });
    plan.origin = { x: x0, y: y0 };
  }
  plan.openings.forEach(o => { o.pos = +o.pos.toFixed(1); });
  return { plan, stats: { segs: segs.length, walls: plan.walls.length, doors: plan.openings.filter(o => o.type === 'door').length, windows: plan.openings.filter(o => o.type === 'window').length, gaps: plan.openings.filter(o => o.type === 'gap').length, rooms: plan.rooms.length } };
}

const median = a => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
function lineX(p, u, q, v) { const den = cross(u, v); if (Math.abs(den) < 1e-9) return null; const t = cross(sub(q, p), v) / den; return add(p, mulv(u, t)); }
function circum(a, b, c) {
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y)); if (Math.abs(d) < 1e-9) return null;
  const a2 = a.x * a.x + a.y * a.y, b2 = b.x * b.x + b.y * b.y, c2 = c.x * c.x + c.y * c.y;
  const x = (a2 * (b.y - c.y) + b2 * (c.y - a.y) + c2 * (a.y - b.y)) / d, y = (a2 * (c.x - b.x) + b2 * (a.x - c.x) + c2 * (b.x - a.x)) / d;
  return { x, y, r: Math.hypot(a.x - x, a.y - y) };
}

const NUMERIC_RX = /^[\s\d.,:×x*\-+/()=%°²³]*(m²|m2|cm|mm|m)?[\s\d.,]*$/i;
const FLOOR_BY_NAME = [[/banyo|wc|tuvalet|duş|dus|lavabo|ıslak|islak/i, 'seramik'], [/mutfak|kitchen/i, 'seramik'], [/balkon|teras|bahçe|bahce|veranda/i, 'dis'], [/hol|antre|koridor|giriş|giris/i, 'seramik']];

function findRooms(walls, texts) {
  const xs = walls.flatMap(w => [w.a.x, w.b.x]), ys = walls.flatMap(w => [w.a.y, w.b.y]);
  const X0 = Math.min(...xs) - 60, Y0 = Math.min(...ys) - 60, X1 = Math.max(...xs) + 60, Y1 = Math.max(...ys) + 60;
  const cell = Math.max(4, Math.max(X1 - X0, Y1 - Y0) / 900);
  const W = Math.ceil((X1 - X0) / cell), H = Math.ceil((Y1 - Y0) / cell);
  const g = new Uint8Array(W * H);                     // 1 = duvar
  for (const w of walls) {
    const u = norm(sub(w.b, w.a)), L = dist(w.a, w.b), half = w.t / 2 + cell * 0.6;
    const ext = w.t / 2;
    const bx0 = Math.max(0, Math.floor((Math.min(w.a.x, w.b.x) - X0 - half - ext) / cell)), bx1 = Math.min(W - 1, Math.ceil((Math.max(w.a.x, w.b.x) - X0 + half + ext) / cell));
    const by0 = Math.max(0, Math.floor((Math.min(w.a.y, w.b.y) - Y0 - half - ext) / cell)), by1 = Math.min(H - 1, Math.ceil((Math.max(w.a.y, w.b.y) - Y0 + half + ext) / cell));
    for (let j = by0; j <= by1; j++) for (let i = bx0; i <= bx1; i++) {
      const p = { x: X0 + (i + 0.5) * cell, y: Y0 + (j + 0.5) * cell }, r = sub(p, w.a);
      const t = dot(r, u); if (t < -ext - cell * 0.5 || t > L + ext + cell * 0.5) continue;
      if (Math.abs(cross(u, r)) <= half) g[j * W + i] = 1;
    }
  }
  // dışarıyı işaretle (2), sonra kalan boş bileşenler oda
  const lab = new Int32Array(W * H);
  const fill = (s, id) => { const st = [s]; lab[s] = id; let n = 0; while (st.length) { const c = st.pop(); n++; const x = c % W, y = (c / W) | 0; for (const d of [c - 1, c + 1, c - W, c + W]) { if (d < 0 || d >= W * H) continue; const dx = d % W; if (Math.abs(dx - x) > 1) continue; if (!g[d] && !lab[d]) { lab[d] = id; st.push(d); } } } return n; };
  fill(0, -1);
  const comps = [];
  let id = 0;
  for (let c = 0; c < W * H; c++) if (!g[c] && !lab[c]) { id++; const n = fill(c, id); comps.push({ id, n }); }
  const minCells = 12000 / (cell * cell);            // ≥ 1.2 m²
  const rooms = [];
  let k = 0;
  for (const cp of comps) {
    if (cp.n < minCells) continue;
    const poly = traceComponent(lab, W, H, cp.id);
    if (!poly || poly.length < 3) continue;
    const pts = simplify(poly.map(([i, j]) => ({ x: X0 + i * cell, y: Y0 + j * cell })), cell * 1.2);
    const names = texts.filter(t => { const i = Math.floor((t.x - X0) / cell), j = Math.floor((t.y - Y0) / cell); return i >= 0 && j >= 0 && i < W && j < H && lab[j * W + i] === cp.id; })
      .map(t => t.text).filter(t => t.length > 1 && !NUMERIC_RX.test(t));
    const name = names.length ? [...new Set(names)].slice(0, 2).map(titleCase).join(' / ') : `Oda ${++k}`;
    const floor = (FLOOR_BY_NAME.find(([rx]) => rx.test(name)) || [, 'parke'])[1];
    rooms.push({ id: uid('r'), name, pts, floor, wallColor: '', h: 0, walls: [] });
  }
  return rooms;
}
const titleCase = s => s.length > 3 && s === s.toLocaleUpperCase('tr') ? s.toLocaleLowerCase('tr').replace(/(^|\s)\S/g, c => c.toLocaleUpperCase('tr')) : s;

/* bileşen sınırını izle (hücre köşeleri) → en uzun halka */
function traceComponent(lab, W, H, id) {
  const inside = (i, j) => i >= 0 && j >= 0 && i < W && j < H && lab[j * W + i] === id;
  const edges = new Map();     // başlangıç köşesi → [bitiş köşesi]
  const addE = (a, b) => { const k = a[0] + ',' + a[1]; (edges.get(k) || edges.set(k, []).get(k)).push(b); };
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    if (!inside(i, j)) continue;
    if (!inside(i, j - 1)) addE([i, j], [i + 1, j]);
    if (!inside(i + 1, j)) addE([i + 1, j], [i + 1, j + 1]);
    if (!inside(i, j + 1)) addE([i + 1, j + 1], [i, j + 1]);
    if (!inside(i - 1, j)) addE([i, j + 1], [i, j]);
  }
  let best = null;
  while (edges.size) {
    const [k0, list] = edges.entries().next().value;
    let cur = list.pop(); if (!list.length) edges.delete(k0);
    const start = k0.split(',').map(Number); const loop = [start];
    let guard = 0;
    while (guard++ < 1e6) {
      const k = cur[0] + ',' + cur[1];
      if (k === k0) break;
      loop.push(cur);
      const l = edges.get(k); if (!l) break;
      cur = l.pop(); if (!l.length) edges.delete(k);
    }
    if (!best || loop.length > best.length) best = loop;
  }
  return best;
}
/* doğrusal noktaları at + Douglas-Peucker */
function simplify(pts, tol) {
  const keep = pts.filter((p, i) => { const a = pts[(i - 1 + pts.length) % pts.length], b = pts[(i + 1) % pts.length]; return Math.abs(cross(sub(p, a), sub(b, p))) > 1e-6; });
  const dp = (arr) => {
    if (arr.length < 3) return arr;
    const a = arr[0], b = arr.at(-1); let md = 0, mi = 0;
    for (let i = 1; i < arr.length - 1; i++) { const d = segDist(arr[i], a, b); if (d > md) { md = d; mi = i; } }
    return md > tol ? [...dp(arr.slice(0, mi + 1)).slice(0, -1), ...dp(arr.slice(mi))] : [a, b];
  };
  const closed = dp([...keep, keep[0]]); closed.pop();
  return closed.map(p => ({ x: +p.x.toFixed(1), y: +p.y.toFixed(1) }));
}
function segDist(p, a, b) { const ab = sub(b, a), l2 = dot(ab, ab) || 1; const t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / l2)); return dist(p, add(a, mulv(ab, t))); }

/* ham çizimi önizleme / altlık için SVG'ye çevir (cm) */
export function rawToSvg(raw, opt, { W = 900, H = 600, sel = null, highlight = true } = {}) {
  const k = opt.unitCm, all = raw.segs, xs = [], ys = [];
  all.forEach(s => { xs.push(s.a.x, s.b.x); ys.push(s.a.y, s.b.y); });
  if (!xs.length) return '';
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const bw = Math.max(1e-6, x1 - x0), bh = Math.max(1e-6, y1 - y0), s = Math.min(W / bw, H / bh) * 0.95;
  const ox = (W - bw * s) / 2 - x0 * s, oy = (H - bh * s) / 2 - y0 * s;
  const set = sel || new Set(opt.layers);
  let on = '', off = '';
  for (const g of all) { const d = `M${(g.a.x * s + ox).toFixed(1)} ${(g.a.y * s + oy).toFixed(1)}L${(g.b.x * s + ox).toFixed(1)} ${(g.b.y * s + oy).toFixed(1)}`; if (set.has(g.layer)) on += d; else off += d; }
  let cv = ''; for (const c of raw.curves) cv += 'M' + c.pts.map(p => `${(p.x * s + ox).toFixed(1)} ${(p.y * s + oy).toFixed(1)}`).join('L');
  return { svg: `<svg viewBox="0 0 ${W} ${H}" class="imp-raw"><path d="${off}" stroke="#C9CDD2" stroke-width="0.8" fill="none"/><path d="${cv}" stroke="#F2A33A" stroke-width="0.9" fill="none"/><path d="${on}" stroke="${highlight ? '#16171A' : '#888'}" stroke-width="1.1" fill="none"/></svg>`, bbox: { x0: x0 * k, y0: y0 * k, x1: x1 * k, y1: y1 * k } };
}

/* ham çizimi PNG'ye çiz (altlık olarak eklemek için) — plan koordinatlarına hizalı */
export async function rawToPng(raw, opt, origin) {
  const k = opt.unitCm, xs = [], ys = [];
  raw.segs.forEach(s => { xs.push(s.a.x * k, s.b.x * k); ys.push(s.a.y * k, s.b.y * k); });
  const x0 = Math.min(...xs), y0 = Math.min(...ys), w = Math.max(...xs) - x0, h = Math.max(...ys) - y0;
  const px = Math.min(3000, Math.max(800, w * 1.5)) / w;
  const cv = document.createElement('canvas'); cv.width = Math.ceil(w * px) + 2; cv.height = Math.ceil(h * px) + 2;
  const c = cv.getContext('2d'); c.fillStyle = '#fff'; c.fillRect(0, 0, cv.width, cv.height);
  c.strokeStyle = '#334'; c.lineWidth = 1.2; c.beginPath();
  for (const s of raw.segs) { c.moveTo((s.a.x * k - x0) * px, (s.a.y * k - y0) * px); c.lineTo((s.b.x * k - x0) * px, (s.b.y * k - y0) * px); }
  for (const cu of raw.curves) cu.pts.forEach((p, i) => (i ? c.lineTo : c.moveTo).call(c, (p.x * k - x0) * px, (p.y * k - y0) * px));
  c.stroke();
  const blob = await new Promise(r => cv.toBlob(r, 'image/png'));
  return { blob, x: x0 - (origin?.x || 0), y: y0 - (origin?.y || 0), w, ar: h / w };
}
