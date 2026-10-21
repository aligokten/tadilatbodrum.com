/* ═══ Doğrama listesi: çizimdeki kapı / pencere / boşlukların poz numaralı, ölçülü listesi (PDF) ═══
 * Aynı özellikteki açıklıklar tek pozda toplanır (K01, P01, B01…). Her poz için ölçülü görünüş çizilir:
 * pencere iç taraftan, kapı açıldığı taraftan görünür. Açılım sembolü: kesik çizgili üçgenin tepesi kol (açılan) tarafını gösterir.
 */
import { V, wallDir, wallNormal, pointInPoly } from './plan-geom.js';
import { doorModel, doorUse, winModel, winUse, winRail, sashes, leaves, frameColor, leafColor, modelName, useName, FRAME_COLORS, LEAF_COLORS } from './openings.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (n, d = 2) => (Number(n) || 0).toLocaleString('tr-TR', { maximumFractionDigits: d });
const cm = n => num(Math.round(n * 10) / 10, 1);
const colorName = (c, L) => ([...L, ...FRAME_COLORS, ...LEAF_COLORS].find(x => x[0].toLowerCase() === String(c).toLowerCase()) || [, `Özel renk (${c})`])[1];
const PRE = { door: 'K', window: 'P', opening: 'B' };
const KIND = { door: 'Kapı', window: 'Pencere', opening: 'Boşluk' };

/* açılım özeti (görünüşe göre sol / sağ) */
function opening(o, mir) {
  const side = f => ((mir ? 1 - f : f) < 0.5 ? 'solda' : 'sağda');
  if (o.type === 'door') {
    const m = doorModel(o);
    if (m === 'surgu' || m === 'gomme') { const toRight = (o.flip ? -1 : 1) * (mir ? -1 : 1) > 0; return `${m === 'gomme' ? 'Duvar içine' : 'Duvar üstünde'} ${toRight ? 'sağa' : 'sola'} kayar`; }
    if (m === 'katlanir') return `Katlanarak ${side(o.flip ? 1 : 0)} toplanır`;
    const L = leaves(o);
    if (m === 'asimetrik') { const big = L.find(l => l[1] - l[0] > 0.5) || L[0]; return `Büyük kanat menteşesi ${side(big[2] === 'a' ? big[0] : big[1])}`; }
    if (L.length > 1) return 'Çift kanat, ortadan açılır';
    return `Menteşe ${side(L[0][2] === 'a' ? L[0][0] : L[0][1])}`;
  }
  if (o.type === 'window') {
    const m = winModel(o);
    if (m === 'tek') return `Menteşe ${side(o.flip ? 1 : 0)}`;
    return { cift: 'Ortadan açılır', acvas: 'Ortadan açılır + vasistas', vasistas: 'Üstten devrilir', uclu: 'Yan kanatlar açılır, orta sabit', surme: 'Sürme', sabit: 'Açılmaz' }[m] || '';
  }
  return '—';
}

/* çizimdeki açıklıklar: mahal, açılım, plan konumu */
export function joineryItems(plan) {
  const meta = plan.meta || {}, out = [];
  for (const o of plan.openings || []) {
    const w = plan.walls.find(x => x.id === o.wallId); if (!w) continue;
    const t = w.t || meta.wallT || 15, u = wallDir(w), n = wallNormal(w), sd = o.side || 1;
    const c = V.add(w.a, V.mul(u, o.pos));
    const roomAt = k => plan.rooms.find(r => pointInPoly(V.add(c, V.mul(n, k)), r.pts))?.name || '';
    const inner = roomAt(sd * (t / 2 + 12)), outer = roomAt(-sd * (t / 2 + 12));
    const where = o.type === 'window' ? (inner || outer || '—') : [inner || 'Dış', outer || 'Dış'].filter((x, i, a) => a.indexOf(x) === i).join(' ↔ ');
    out.push({ o, t, c, n, sd, mir: sd < 0, where, open: opening(o, sd < 0) });
  }
  return out;
}

/* seçilen açıklıklar (only: id kümesi; yoksa tümü) → pozlar */
export function joineryList(plan, only = null) {
  const out = joineryItems(plan).filter(x => !only || only.has(x.o.id));
  // aynı özellikteki açıklıklar tek poz
  const key = x => { const o = x.o; return [o.type, o.type === 'door' ? doorModel(o) : o.type === 'window' ? winModel(o) : '', o.use || '', Math.round(o.w), Math.round(o.h), Math.round(o.type === 'window' ? o.sill || 0 : 0), x.t, o.type === 'opening' ? '' : frameColor(o), o.type === 'door' ? leafColor(o) : '', winRail(o) ? 1 : 0].join('|'); };
  const types = new Map();
  for (const x of out) { const k = key(x); if (!types.has(k)) types.set(k, { o: x.o, t: x.t, items: [] }); types.get(k).items.push(x); }
  const order = { door: 0, window: 1, opening: 2 };
  const list = [...types.values()].sort((a, b) => order[a.o.type] - order[b.o.type] || (a.o.use || '').localeCompare(b.o.use || '') || b.o.w - a.o.w || b.o.h - a.o.h);
  const cnt = {};
  list.forEach(T => { cnt[T.o.type] = (cnt[T.o.type] || 0) + 1; T.code = PRE[T.o.type] + String(cnt[T.o.type]).padStart(2, '0'); T.items.forEach((x, i) => { x.code = T.code; x.no = `${T.code}-${i + 1}`; }); });
  return list;
}

/* ── ölçülü görünüş (bağımsız SVG; PDF için data URI) ── */
export function elevationSvg(o, { mir = false, gap = 0, code = '' } = {}) {
  const isW = o.type === 'window', sill = isW ? +o.sill || 0 : 0, W = +o.w, Hh = +o.h;
  const PW = 300, PH = 330, L = 46, R = 14, T = 30, B = 44;
  const s = Math.min((PW - L - R) / W, (PH - T - B) / (sill + Hh + (sill ? 0 : 10)));
  const ox = L + ((PW - L - R) - W * s) / 2, oy = PH - B;
  const X = cm => ox + cm * s, Y = cm => oy - cm * s, F = f => (mir ? 1 - f : f);
  const ink = '#24272B', mut = '#7A8594', teal = '#00989A', orange = '#EB591F';
  let g = '';
  const line = (x1, y1, x2, y2, st = ink, sw = 1, dash = '') => { g += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${st}" stroke-width="${sw}"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`; };
  const rect = (x, y, w, h, fill = 'none', st = ink, sw = 1, dash = '') => { g += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${Math.max(0, w).toFixed(1)}" height="${Math.max(0, h).toFixed(1)}" fill="${fill}" stroke="${st}" stroke-width="${sw}"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`; };
  const text = (x, y, t, { size = 10, c = ink, rot = 0, anchor = 'middle', weight = 600 } = {}) => { g += `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-family="Inter,Arial,sans-serif" font-size="${size}" font-weight="${weight}" fill="${c}" text-anchor="${anchor}"${rot ? ` transform="rotate(${rot} ${x.toFixed(1)} ${y.toFixed(1)})"` : ''}>${esc(t)}</text>`; };
  const tick = (x, y) => line(x - 3, y + 3, x + 3, y - 3, teal, 1.2);
  const dimH = (a, b, y, t, ext) => { line(X(a), y, X(b), y, teal, 0.8); tick(X(a), y); tick(X(b), y); if (ext != null) { line(X(a), ext, X(a), y + (y > ext ? 3 : -3), teal, 0.5); line(X(b), ext, X(b), y + (y > ext ? 3 : -3), teal, 0.5); } text((X(a) + X(b)) / 2, y - 4, t, { c: teal, size: 10 }); };
  const dimV = (a, b, x, t, ext) => { line(x, Y(a), x, Y(b), teal, 0.8); tick(x, Y(a)); tick(x, Y(b)); if (ext != null) { line(ext, Y(a), x - 3, Y(a), teal, 0.5); line(ext, Y(b), x - 3, Y(b), teal, 0.5); } text(x - 4, (Y(a) + Y(b)) / 2, t, { c: teal, size: 10, rot: -90 }); };
  // zemin ve duvar
  g += `<defs><pattern id="h" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" stroke="#C9CDD2" stroke-width="1"/></pattern></defs>`;
  rect(X(-12), Y(sill + Hh + 12), (W + 24) * s, (sill + Hh + 12) * s, 'url(#h)', 'none', 0);
  line(X(-18), oy, X(W + 18), oy, ink, 1.6);
  rect(X(0), Y(sill + Hh), W * s, Hh * s, '#fff', ink, 1.4);
  const glass = o.type === 'window' && winUse(o).frost ? '#E9EEF0' : '#DDEFF3';
  const tri = (x0, x1, y0, y1, hinge) => {   // hinge: 'l' | 'r' | 'b' — tepe kol tarafında
    const d = '4 3';
    if (hinge === 'l') { line(x0, y0, x1, (y0 + y1) / 2, mut, 0.9, d); line(x0, y1, x1, (y0 + y1) / 2, mut, 0.9, d); }
    if (hinge === 'r') { line(x1, y0, x0, (y0 + y1) / 2, mut, 0.9, d); line(x1, y1, x0, (y0 + y1) / 2, mut, 0.9, d); }
    if (hinge === 'b') { line(x0, y1, (x0 + x1) / 2, y0, mut, 0.9, d); line(x1, y1, (x0 + x1) / 2, y0, mut, 0.9, d); }
  };
  const arrow = (x1, x2, y) => { line(x1, y, x2, y, ink, 1); const k = x2 > x1 ? -1 : 1; line(x2, y, x2 + k * 6, y - 4, ink, 1); line(x2, y, x2 + k * 6, y + 4, ink, 1); };
  const kf = 6;
  if (o.type === 'window') {
    const m = winModel(o), y0 = Y(sill + Hh - kf), y1 = Y(sill + kf);
    rect(X(kf), y0, (W - 2 * kf) * s, y1 - y0, 'none', ink, 0.8);
    if (m === 'sabit') { rect(X(kf + 2), y0 + 2 * s, (W - 2 * kf - 4) * s, y1 - y0 - 4 * s, glass, ink, 0.6); text(X(W / 2), (y0 + y1) / 2 + 4, 'SABİT', { size: 10, c: mut }); }
    else if (m === 'surme') {
      const a = [[0, 0.54], [0.46, 1]];
      a.forEach(([f0, f1], i) => { const xa = X(kf + Math.min(F(f0), F(f1)) * (W - 2 * kf)), xb = X(kf + Math.max(F(f0), F(f1)) * (W - 2 * kf)); rect(xa + 2, y0 + 2 + i * 3, xb - xa - 4, y1 - y0 - 4 - i * 6, glass, ink, 0.8); });
      const ym = (y0 + y1) / 2; arrow(X(W * 0.3), X(W * 0.12), ym - 8); arrow(X(W * 0.7), X(W * 0.88), ym + 8);
    } else {
      for (const [f0, f1, op] of sashes(o)) {
        const xa = X(kf + Math.min(F(f0), F(f1)) * (W - 2 * kf)), xb = X(kf + Math.max(F(f0), F(f1)) * (W - 2 * kf));
        if (f0 > 0) line(X(kf + F(f0) * (W - 2 * kf)), y0, X(kf + F(f0) * (W - 2 * kf)), y1, ink, 0.8);
        const ia = xa + 3, ib = xb - 3, ja = y0 + 3, jb = y1 - 3;
        rect(ia, ja, ib - ia, jb - ja, glass, ink, 0.8);
        if (!op) { text((ia + ib) / 2, (ja + jb) / 2 + 4, 'SABİT', { size: 9, c: mut }); continue; }
        if (m === 'vasistas') { tri(ia, ib, ja, jb, 'b'); continue; }
        const atStart = f0 === 0 && !(m === 'tek' && o.flip), hf = atStart ? f0 : f1;
        tri(ia, ib, ja, jb, F(hf) < 0.5 ? 'l' : 'r');
        if (m === 'acvas') tri(ia, ib, ja, jb, 'b');
        const hx = F(hf) < 0.5 ? ib - 4 : ia + 4; rect(hx - 1.5, (ja + jb) / 2 - 8, 3, 16, ink, 'none', 0);   // kol
      }
    }
    if (winRail(o)) {   // fransız balkon korkuluğu (önde)
      const rh = Math.min(100, Hh);
      line(X(0), Y(sill + rh), X(W), Y(sill + rh), '#3A3F45', 2.2);
      for (let x = 10; x < W; x += 12) line(X(x), Y(sill), X(x), Y(sill + rh), '#3A3F45', 0.8);
    }
  } else if (o.type === 'door') {
    const m = doorModel(o), use = doorUse(o), kd = 5, top = Y(Hh - kd), bot = oy;
    rect(X(kd), top, (W - 2 * kd) * s, bot - top, 'none', ink, 0.8);
    const leafFill = leafColor(o) === '#1F2125' || use.glass === 'full' ? '#F7F8F9' : '#F2F0EC';
    const panel = (ia, ib) => {
      rect(ia, top + 2, ib - ia, bot - top - 4, leafFill, ink, 0.8);
      if (use.glass === 'full') rect(ia + 5, top + 8, ib - ia - 10, bot - top - 16, glass, ink, 0.6);
      if (use.glass === 'low') rect(ia + 0.2 * (ib - ia), top + 0.08 * (bot - top), 0.6 * (ib - ia), 0.55 * (bot - top), glass, ink, 0.6);
      if (use.k === 'banyo') for (let i = 0; i < 4; i++) line(ia + 0.25 * (ib - ia), bot - 10 - i * 3.5, ia + 0.75 * (ib - ia), bot - 10 - i * 3.5, mut, 0.8);
    };
    if (m === 'surgu' || m === 'gomme' || m === 'katlanir') {
      const ia = X(kd), ib = X(W - kd);
      if (m === 'katlanir') { const n = 4; for (let i = 0; i < n; i++) panel(ia + (ib - ia) * i / n, ia + (ib - ia) * (i + 1) / n); }
      else panel(ia, ib);
      const dir = (o.flip ? -1 : 1) * (mir ? -1 : 1);
      if (m === 'gomme') rect(dir > 0 ? X(W) : X(-W), top, W * s, bot - top, 'none', mut, 0.8, '4 3');
      else if (m === 'surgu') line(X(-W * 0.1), Y(Hh + 4), X(W * 1.1), Y(Hh + 4), ink, 2);
      if (m !== 'katlanir') arrow(X(W / 2 - dir * W * 0.2), X(W / 2 + dir * W * 0.2), Y(Hh * 0.5));
    } else {
      for (const [s0, s1, hk] of leaves(o)) {
        const ia = X(kd + Math.min(F(s0), F(s1)) * (W - 2 * kd)), ib = X(kd + Math.max(F(s0), F(s1)) * (W - 2 * kd));
        panel(ia + 1, ib - 1);
        const hf = hk === 'a' ? s0 : s1, hl = F(hf) < 0.5;
        tri(ia + 1, ib - 1, top + 2, bot - 2, hl ? 'l' : 'r');
        const hx = hl ? ib - 7 : ia + 7; rect(hx - (hl ? 9 : 0), Y(100) - 1.5, 9, 3, ink, 'none', 0);   // kol 100 cm
      }
    }
  } else {
    rect(X(0), Y(Hh), W * s, Hh * s, '#fff', mut, 0.8, '5 3');
    text(X(W / 2), Y(Hh / 2), 'KAPISIZ BOŞLUK', { size: 9, c: mut });
  }
  // ölçüler
  dimH(0, W, oy + 26, cm(W), oy + 4);
  dimV(sill, sill + Hh, X(0) - 26, cm(Hh), X(0) - 4);
  if (sill > 0) dimV(0, sill, X(0) - 26, cm(sill), X(0) - 4);
  if (o.type === 'window' && sashes(o).length > 1 && winModel(o) !== 'surme') {   // kanat aksları
    const fr = sashes(o).map(x => x[0]).concat(1).map(f => (F(f)));
    const xs = [...new Set(fr.map(f => Math.round(f * 1e6) / 1e6))].sort((a, b) => a - b);
    for (let i = 0; i < xs.length - 1; i++) dimH(xs[i] * W, xs[i + 1] * W, Y(sill + Hh) - 12, cm((xs[i + 1] - xs[i]) * W), Y(sill + Hh) - 2);
  } else if (o.type === 'door' && leaves(o).length > 1 && ['cift', 'asimetrik'].includes(doorModel(o))) {
    const xs = [...new Set(leaves(o).flatMap(l => [F(l[0]), F(l[1])]).map(f => Math.round(f * 1e6) / 1e6))].sort((a, b) => a - b);
    for (let i = 0; i < xs.length - 1; i++) dimH(xs[i] * W, xs[i + 1] * W, Y(Hh) - 12, cm((xs[i + 1] - xs[i]) * W), Y(Hh) - 2);
  }
  if (code) { g += `<rect x="0" y="0" width="58" height="26" rx="7" fill="${ink}"/>`; text(29, 18, code, { size: 15, c: '#fff', weight: 900 }); }   // poz rozeti
  const ms = makeSize(o, gap); if (ms) text(PW - 4, 14, `İmalat ${cm(ms[0])} × ${cm(ms[1])}`, { size: 9.5, c: orange, anchor: 'end', weight: 700 });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${PW}" height="${PH}" viewBox="0 0 ${PW} ${PH}"><rect width="100%" height="100%" fill="#fff"/>${g}</svg>`;
}
const svgUrl = svg => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);

/* imalat ölçüsü: her kenarda montaj boşluğu; kapıda alt kenarda boşluk yok */
function makeSize(o, gap) { return o.type === 'opening' || !gap ? null : [o.w - 2 * gap, o.h - (o.type === 'window' ? 2 : 1) * gap]; }

function specRows(T, gap) {
  const o = T.o, rows = [];
  rows.push(['Tür', `${KIND[o.type]}${o.type !== 'opening' ? ' · ' + esc(useName(o)) : ''}`]);
  if (o.type !== 'opening') rows.push(['Model', esc(modelName(o))]);
  rows.push(['Kaba açıklık (G × Y)', `<b>${cm(o.w)} × ${cm(o.h)} cm</b>`]);
  const ms = makeSize(o, gap); if (ms) rows.push([`İmalat ölçüsü <small>(${cm(gap)} cm boşluk)</small>`, `<b style="color:#EB591F">${cm(ms[0])} × ${cm(ms[1])} cm</b>`]);
  if (o.type === 'window') rows.push(['Parapet (denizlik) yüksekliği', `${cm(o.sill || 0)} cm`]);
  rows.push(['Duvar kalınlığı', `${cm(T.t)} cm`]);
  if (o.type !== 'opening') rows.push(['Kasa rengi', esc(colorName(frameColor(o), FRAME_COLORS))]);
  if (o.type === 'door') rows.push(['Kanat rengi', esc(colorName(leafColor(o), LEAF_COLORS))]);
  if (o.type === 'window') rows.push(['Cam', winUse(o).frost ? 'Isıcam, buzlu (mahremiyet)' : 'Isıcam (çift cam)']);
  if (o.type === 'door' && doorUse(o).glass) rows.push(['Cam', doorUse(o).glass === 'full' ? 'Tam boy cam' : 'Üst bölüm camlı']);
  if (o.type === 'door' && doorUse(o).k === 'banyo') rows.push(['Havalandırma', 'Alt menfez']);
  if (winRail(o)) rows.push(['Korkuluk', 'Dış korkuluk (fransız balkon)']);
  rows.push(['Adet', `<b>${T.items.length}</b>`]);
  rows.push(['Toplam alan', `${num(o.w * o.h / 1e4 * T.items.length)} m²`]);
  return rows;
}

/* anahtar plan: her açıklığın yanına poz numarası */
function keyPlanOverlay(list) {
  return s => {
    let o = '';
    for (const T of list) for (const x of T.items) {
      const p = V.add(x.c, V.mul(x.n, -x.sd * (x.t / 2 + 16 / s))), fs = 10 / s, w = (x.code.length * 6.4 + 8) / s, hh = 15 / s;
      const col = x.o.type === 'door' ? '#EB591F' : x.o.type === 'window' ? '#00989A' : '#7A8594';
      o += `<rect x="${p.x - w / 2}" y="${p.y - hh / 2}" width="${w}" height="${hh}" rx="${4 / s}" fill="${col}"/><text x="${p.x}" y="${p.y + fs * 0.36}" font-size="${fs}" font-family="Inter,Arial,sans-serif" font-weight="700" fill="#fff" text-anchor="middle">${x.code}</text>`;
    }
    return o;
  };
}

/* rapor gövdesi (docHeader / docFooter app tarafında eklenir) */
export function joineryHtml(plan, { gap = 1, keyPlan, only = null } = {}) {
  const list = joineryList(plan, only);
  if (!list.length) return '';
  const all = list.flatMap(T => T.items);
  const by = t => all.filter(x => x.o.type === t), area = xs => xs.reduce((a, x) => a + x.o.w * x.o.h / 1e4, 0);
  const D = by('door'), Wn = by('window'), B = by('opening');
  const rooms = T => [...new Set(T.items.map(x => x.where))].join(', ');
  return `
    <section class="p-cust">
      <div><small>Kapı</small><b>${D.length} adet</b>${num(area(D))} m² · ${list.filter(T => T.o.type === 'door').length} poz</div>
      <div><small>Pencere</small><b>${Wn.length} adet</b>${num(area(Wn))} m² · ${list.filter(T => T.o.type === 'window').length} poz</div>
      <div><small>Toplam</small><b>${all.length} adet</b>${num(area(all))} m²${B.length ? ` · ${B.length} kapısız boşluk dahil` : ''}</div>
    </section>
    ${keyPlan ? `<section><h3>Anahtar plan <small>— poz numaraları</small></h3><div class="p-plan"><img src="${keyPlan(keyPlanOverlay(list))}" alt="Anahtar plan"></div></section>` : ''}
    <section><h3>Doğrama çizelgesi</h3>
      <table class="p-table sm"><thead><tr><th>Poz</th><th>Tanım</th><th class="r">G × Y (cm)</th>${gap ? '<th class="r">İmalat (cm)</th>' : ''}<th class="r">Parapet</th><th class="r">Duvar</th><th class="r">Adet</th><th class="r">m²</th><th>Mahal</th></tr></thead><tbody>
      ${['door', 'window', 'opening'].filter(t => list.some(T => T.o.type === t)).map(t => `<tr class="grp"><td colspan="${gap ? 9 : 8}">${{ door: 'Kapılar', window: 'Pencereler', opening: 'Kapısız boşluklar' }[t]}</td></tr>
        ${list.filter(T => T.o.type === t).map(T => { const o = T.o, ms = makeSize(o, gap); return `<tr><td><b>${T.code}</b></td><td>${o.type === 'opening' ? 'Boşluk' : `${esc(useName(o))}<br><small>${esc(modelName(o))}</small>`}</td><td class="r"><b>${cm(o.w)} × ${cm(o.h)}</b></td>${gap ? `<td class="r">${ms ? `${cm(ms[0])} × ${cm(ms[1])}` : '—'}</td>` : ''}<td class="r">${o.type === 'window' ? cm(o.sill || 0) : '—'}</td><td class="r">${cm(T.t)}</td><td class="r"><b>${T.items.length}</b></td><td class="r">${num(o.w * o.h / 1e4 * T.items.length)}</td><td><small>${esc(rooms(T))}</small></td></tr>`; }).join('')}`).join('')}
      <tr class="grp"><td colspan="${gap ? 6 : 5}">Toplam</td><td class="r">${all.length}</td><td class="r">${num(area(all))}</td><td></td></tr></tbody></table>
      <p class="muted small" style="font-size:8.5pt">Ölçüler kaba (duvar) açıklık ölçüsüdür; genişlik × yükseklik, cm. ${gap ? `İmalat ölçüsü her kenarda ${cm(gap)} cm montaj boşluğu düşülerek hesaplanmıştır (kapılarda alt kenar hariç). ` : ''}Siparişten önce tüm ölçüler yerinde kontrol edilmelidir.</p>
    </section>
    <section class="p-break"><h3>Poz detayları <small>— ölçülü görünüşler</small></h3>
      <p class="muted small" style="font-size:8.5pt">Pencereler iç taraftan, kapılar açıldıkları taraftan görünüştür. Kesik çizgili üçgenin tepesi kol (açılan) tarafını, alttan çıkan üçgen vasistas (üstten devrilme) açılımını gösterir.</p>
      ${list.map(T => `<div class="jn-card">
        <div class="jn-fig"><img src="${svgUrl(elevationSvg(T.o, { mir: T.items[0].mir, gap, code: T.code }))}" alt="${T.code}"></div>
        <div class="jn-spec"><table class="ptable">${specRows(T, gap).map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join('')}</table>
          <table class="p-table sm jn-items"><thead><tr><th>No</th><th>Mahal</th><th>Açılım</th></tr></thead><tbody>
          ${T.items.map(x => `<tr><td>${x.no}</td><td>${esc(x.where)}</td><td>${esc(x.open)}${x.o.type !== 'opening' ? ` <small class="muted">(${x.o.type === 'window' ? 'içeriden' : 'açıldığı taraftan'})</small>` : ''}</td></tr>`).join('')}</tbody></table>
        </div></div>`).join('')}
    </section>`;
}
