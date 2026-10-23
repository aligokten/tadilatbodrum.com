/* ═══ Montaj şeması: kesim listesindeki bir parçanın mobilya üzerindeki yeri ═══
 * Parça kimliği etiketlerdekiyle aynı sırayla üretilir: D<dolap no>-<sıra> (sıra tüm kesim listesi satırları ve
 * adetleri üzerinden; tezgah etiketlenmese de numara tüketir). Bölge ön görünüş koordinatlarında (cm, yerden, dizinin
 * solundan) döner; elevation() çizimine vurgulu dikdörtgen olarak eklenir.
 */
import { partsList, layoutRow, frontsOf, MT, modY0, modInner, shelfPos, rowLen } from './cabinet.js';

/* tüm parça örnekleri: [{ key: 'D1-042', ci, r (satır), i (adet sırası), mod, part }] */
export function partInstances(cabs) {
  const out = [];
  cabs.forEach(({ cab }, ci) => {
    let seq = 0;
    for (const r of partsList(cab).rows) for (let i = 0; i < r.n; i++) { seq++; out.push({ key: `D${ci + 1}-${String(seq).padStart(3, '0')}`, ci, r, i }); }
  });
  return out;
}

/* modül adı (A3, Ü2, G1) → yerleşim ve dikey aralık */
export function modOf(cab, no) {
  const m = /^([AÜG])(\d+)$/.exec(no); if (!m) return null;
  const row = m[1] === 'A' ? 'base' : m[1] === 'Ü' ? 'upper' : 'ward', idx = +m[2] - 1, p = layoutRow(cab[row])[idx];
  if (!p) return null;
  const s = cab.s, t = MT[p.m.type] || {}, kind = cab.kind;
  let y0, y1;
  if (row === 'ward') { y0 = modY0(p.m, s); y1 = s.H; }
  else if (row === 'upper') { y0 = s.upZ; y1 = s.upZ + s.upH; }
  else { y0 = s.plinth; y1 = t.tall ? s.tallH : s.plinth + s.carcH; }
  return { p, row, t, kind, y0, y1, x0: p.x0, x1: p.x1, w: p.x1 - p.x0 };
}

const FRONT_PARTS = ['Kapak', 'Çekmece önü', 'Cihaz kapağı', 'Camlı kapak (çerçeve)'];

/* parça → { view: 'front' | 'inside', rects: [{x,y,w,h}], step } */
export function partRegion(cab, inst, all) {
  const s = cab.s, t0 = s.t, { r, i } = inst, kind = cab.kind;
  const R = (x, y, w, h) => ({ x, y, w: Math.max(w, 0.6), h: Math.max(h, 0.6) });
  // dizi geneli
  if (r.mod === 'Tezgah') {
    const base = layoutRow(cab.base), segs = []; let seg = null;
    for (const p of base) { const t = MT[p.m.type]; if (t.tall || t.empty) { if (seg) segs.push(seg); seg = null; continue; } seg = seg ? [seg[0], p.x1] : [p.x0, p.x1]; }
    if (seg) segs.push(seg);
    const k = (+(/(\d+)$/.exec(r.part) || [0, 1])[1]) - 1, sg = segs[k] || segs[0] || [0, 0];
    return { view: 'front', rects: [R(sg[0], s.plinth + s.carcH, sg[1] - sg[0], s.topT)], step: 'tezgah' };
  }
  if (r.mod === 'Genel') {
    const L = kind === 'wardrobe' ? rowLen(cab.ward) : rowLen(cab.base);
    if (/Baza/.test(r.part)) return { view: 'front', rects: [R(0, 0, L, s.plinth)], step: 'baza' };
    return { view: 'front', rects: [R(0, (kind === 'wardrobe' ? s.H : s.tallH) - 2, L, 2)], step: 'govde' };   // üst kapama
  }
  if (r.mod === 'Sürgü') {
    const L = rowLen(cab.ward), n = r.n, pw = L / n + 2, x = Math.min(L - pw, i * (L / n) - (i ? 1 : 0));
    return { view: 'front', rects: [R(x, s.plinth, pw, s.H - s.plinth)], step: 'kapak' };
  }
  const M = modOf(cab, r.mod); if (!M) return { view: 'front', rects: [], step: '' };
  const { p, t, x0, x1, w, y0, y1 } = M, mk = M.row === 'ward' ? 'wardrobe' : 'kitchen', inn = modInner(p.m, s, mk);
  const part = r.part;
  if (part === 'Yan dikme') return { view: 'inside', rects: [i % 2 ? R(x1 - t0, y0, t0, y1 - y0) : R(x0, y0, t0, y1 - y0)], step: 'govde' };
  if (part === 'Alt / üst tabla') return { view: 'inside', rects: [i % 2 ? R(x0 + t0, y1 - t0, w - 2 * t0, t0) : R(x0 + t0, y0, w - 2 * t0, t0)], step: 'govde' };
  if (part === 'Alt tabla') return { view: 'inside', rects: [R(x0 + t0, y0, w - 2 * t0, t0)], step: 'govde' };
  if (part === 'Üst tabla') return { view: 'inside', rects: [R(x0 + t0, y1 - t0, w - 2 * t0, t0)], step: 'govde' };
  if (part === 'Üst kuşak') return { view: 'inside', rects: [R(x0 + t0, y1 - t0 - (i ? 0 : 0), w - 2 * t0, t0)], step: 'govde' };
  if (part === 'Arkalık') return { view: 'inside', rects: [R(x0 + t0, inn.y, w - 2 * t0, inn.h)], step: 'arkalik' };
  if (part === 'Raf') {
    const sp = shelfPos(p.m, s, mk), extra = [...(t.shoe || []), ...(t.shoeOpen || [])].map(f => +(inn.h * f).toFixed(1));
    const all2 = [...sp, ...extra], v = all2[i] ?? all2[0] ?? inn.h / 2;
    return { view: 'inside', rects: [R(x0 + t0, inn.y + v - t0 / 2, w - 2 * t0, t0)], step: 'raf' };
  }
  if (part === 'Dolgu paneli') return { view: 'front', rects: [R(x0, y0, w, y1 - y0)], step: 'kapak' };
  if (part === 'Askılık panosu') return { view: 'inside', rects: [R(x0 + t0 + 2, inn.y + inn.h * 0.44, w - 2 * t0 - 4, inn.h * 0.4)], step: 'aksesuar' };
  if (part === 'Lamel çıta') { const x = x0 + t0 + 3 + i * 6; return { view: 'inside', rects: [R(x, inn.y + inn.h * 0.42, 3.4, inn.h * 0.44)], step: 'aksesuar' }; }
  if (part === 'Oturak tablası') return { view: 'inside', rects: [R(x0 + t0, (t.bench || 46) - 4, w - 2 * t0, 4)], step: 'aksesuar' };
  // kapak / çekmece ve çekmece kutusu: modüldeki ön yüz sırası kesim listesindekiyle aynı
  const slots = [];
  if (M.row === 'ward') (t.drawers || []).reduce((y, f) => { const dh = inn.h * f; slots.push({ x: x0 + t0 + 1, y, w: w - 2 * t0 - 2, h: dh - 1, view: 'inside' }); return y + dh; }, inn.y);
  if (!(M.row === 'ward' && s.doors === 'surgulu')) frontsOf(p.m, mk, s, x0).filter(f => f.k !== 'oven' && f.k !== 'micro').forEach(f => slots.push({ x: f.x, y: f.y, w: f.w, h: f.h, view: 'front' }));
  // bu satıra kadar aynı modülde kaç ön yüz satırı var / son çekmece ön yüzü hangisi
  let fi = -1;
  for (const q of all) {
    if (q.ci !== inst.ci || q.r.mod !== r.mod) continue;
    if (FRONT_PARTS.includes(q.r.part)) fi++;
    if (q === inst) break;
  }
  const sl = slots[Math.max(0, fi)];
  if (!sl) return { view: 'front', rects: [R(x0, y0, w, y1 - y0)], step: 'kapak' };
  if (FRONT_PARTS.includes(part)) return { view: sl.view, rects: [R(sl.x, sl.y, sl.w, sl.h)], step: part === 'Çekmece önü' ? 'cekmece' : 'kapak' };
  if (/^Çekmece/.test(part)) return { view: 'inside', rects: [R(sl.x + 1, sl.y + 1, sl.w - 2, sl.h - 2)], step: 'cekmece' };
  return { view: 'inside', rects: [R(x0, y0, w, y1 - y0)], step: 'govde' };
}

/* montaj adımları (ilgili adım vurgulanır) */
export const STEPS = [
  { k: 'govde', t: 'Gövde', d: 'Yan dikmeleri alt ve üst tabla (kuşak) ile birleştirin; kavela / minifix, köşeleri gönye ile kontrol edin.' },
  { k: 'arkalik', t: 'Arkalık', d: 'Arkalığı kanala geçirin ya da arkadan çivileyin; gövde köşegenlerini eşitleyerek gönyeye alın.' },
  { k: 'raf', t: 'Raflar', d: 'Raf pimlerini işaretli deliklere takın, rafları yerleştirin; askı borusu ve aksesuarları takın.' },
  { k: 'aksesuar', t: 'Askılık / oturak', d: 'Askılık panosu, lamel, kanca ve oturak tablasını vidalayın; minderi yerleştirin.' },
  { k: 'baza', t: 'Yerleştirme ve baza', d: 'Ayar ayaklarını takın, gövdeyi yerine koyup terazileyin, duvara sabitleyin; baza panelini klipslere takın.' },
  { k: 'cekmece', t: 'Çekmeceler', d: 'Çekmece kutusunu kurun, rayları gövdeye ve kutuya takın; ön yüzü takıp ayarlayın.' },
  { k: 'kapak', t: 'Kapaklar', d: 'Menteşe kaselerini yerleştirin, kapakları asın; aralıkları ve hizayı ayarlayın, kulpları takın.' },
  { k: 'tezgah', t: 'Tezgah', d: 'Tezgahı alt dolaplara alttan vidalayın; duvar ve birleşim yerlerini silikonlayın.' },
];
