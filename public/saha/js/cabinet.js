/* ═══ Mutfak ve giysi dolabı — veri modeli, otomatik dizme, çizimler, 3D, kesim listesi ═══
 * Bir dolap dizisi rölövede tek bir mobilya nesnesidir: { type: 'cabinet', x, y, rot, w, d, h, cab }.
 * Yerel eksen: x dizinin boyunca (soldan sağa, 0..L), arka yüz duvarda, ön yüz odaya bakar.
 * Birim: cm. 3D'de metre.
 */
import { uid } from './store.js';

/* ── varsayılan ölçüler ── */
export const KITCHEN_DEF = {
  plinth: 10, carcH: 76, topT: 4, baseD: 56, frontT: 2, topD: 62,
  upZ: 145, upH: 72, upD: 32, tallH: 217,
  t: 1.8, back: 0.8, gap: 0.3,
};
export const WARDROBE_DEF = { H: 240, plinth: 8, D: 58, frontT: 2, t: 1.8, back: 0.8, gap: 0.3, doors: 'menteseli' };
/* vestiyer: sığ gövde, daha alçak; askılık ve oturak modülleri kapaksız */
export const VESTIYER_DEF = { H: 220, plinth: 8, D: 40, frontT: 2, t: 1.8, back: 0.8, gap: 0.3, doors: 'menteseli' };
/* giysi dolabı / vestiyer kapak tipleri */
export const WARD_DOORS = [{ k: 'menteseli', t: 'Menteşeli kapak' }, { k: 'surgulu', t: 'Sürgülü kapak' }, { k: 'acik', t: 'Kapaksız (açık)' }];
/* modül kapaksız mı: kapaksız tip ya da dizinin kapak tipi açık */
export const isOpenMod = (m, s) => !!MT[m.type]?.open || s.doors === 'acik';
/* bir kanca sırasındaki kanca sayısı (yaklaşık 15 cm arayla) */
export const hookCount = w => Math.max(2, Math.floor((w - 6) / 15));
/* modül derinliği (cihaz dolapları dizi derinliğinden derin olabilir) ve zemin kotu (makine dolabında baza yok) */
export const modD = (m, s) => Math.max(s.D || 0, MT[m.type]?.minD || 0, m.D || 0);
export const modY0 = (m, s) => MT[m.type]?.floor ? 0 : s.plinth;
export const APPL = { washer: { w: 60, h: 85, t: 'Çamaşır makinesi', ab: 'ÇM' }, dryer: { w: 60, h: 85, t: 'Kurutma makinesi', ab: 'KM' } };
export const BOILER = { w: 45, h: 80 };   // termosifon (dikey, Ø45 · 80 L)
/* cihaz yerleşimi (modül içinde, yerden): makineler altta üst üste, termosifon üstte */
export function applLayout(m, s) {
  const t = MT[m.type] || {}, out = []; let y = modY0(m, s);
  (t.appl || []).forEach((k, i) => { const a = APPL[k]; out.push({ k, ...a, y: y + (i ? 2 : 0) }); y += a.h + (i ? 2 : 0); });
  if (t.boiler) out.push({ k: 'boiler', t: 'Termosifon', ab: 'T', w: BOILER.w, h: BOILER.h, y: s.H - s.t - 6 - BOILER.h });
  return out;
}
/* modülün iç tabanı (yerden) ve iç yüksekliği, cm */
export function modInner(m, s, kind) {
  const t = MT[m.type] || {};
  if (kind === 'wardrobe') { const y0 = modY0(m, s); return { y: y0 + s.t, h: s.H - y0 - 2 * s.t }; }
  if (t.row === 'upper') return { y: s.upZ + s.t, h: s.upH - 2 * s.t };
  if (t.fridge) { const G = fridgeGeo(m, s); return { y: G.topY, h: Math.max(0, G.topH) }; }   // buzdolabının üstündeki bölüm
  if (t.tall) return { y: s.plinth + s.t, h: s.tallH - s.plinth - 2 * s.t };
  return { y: s.plinth + s.t, h: s.carcH - 2 * s.t };
}
/* elle raf eklenebilen modül mü */
export const shelfable = (m, kind, s) => { const t = MT[m.type] || {}; if (t.fridge && s) { const G = fridgeGeo(m, s); if (G.top === 'dolgu' || G.topH < 20) return false; } return !(t.empty || t.filler || t.hood || t.mirror || t.appliance || (t.drawers && kind !== 'wardrobe') || (t.oven && !t.tall)); };
/* raf konumları (iç tabandan cm, sıralı): elle girildiyse m.shelves, yoksa modül tipinin varsayılanı */
export function shelfPos(m, s, kind) {
  const t = MT[m.type] || {}, { h } = modInner(m, s, kind);
  if (Array.isArray(m.shelves)) return m.shelves.filter(v => v > 0 && v < h).sort((a, b) => a - b);
  if (Array.isArray(t.shelves)) return t.shelves.map(f => +(h * f).toFixed(1));
  const n = kind === 'wardrobe' ? 0 : t.tall ? (t.fridge ? (h > 45 ? 1 : 0) : t.oven ? 2 : (t.shelves || 4)) : (t.shelves || 0);
  return Array.from({ length: n }, (_, i) => +(h * (i + 1) / (n + 1)).toFixed(1));
}
/* modül uyarıları: genişlik / yükseklik cihaza yetmiyor */
export function modWarn(m, s) {
  const t = MT[m.type] || {}, w = [];
  if (t.minW && m.w < t.minW) w.push(`Genişlik en az ${t.minW} cm olmalı (cihaz 60 cm + gövde + montaj payı)`);
  if (t.minH && s.H < t.minH) w.push(`Dolap yüksekliği en az ${t.minH} cm olmalı (cihazlar üst üste sığmıyor)`);
  if (t.appl && s.doors === 'surgulu') w.push('Sürgülü kapak makine kapağının açılmasını engelleyebilir; menteşeli ya da açık önerilir');
  if (t.fridge) {
    const G = fridgeGeo(m, s), minW = G.frW + 2 * s.t;
    if (m.w < minW - 0.01) w.push(`Modül genişliği en az ${fmt(minW)} cm olmalı (cihaz ${fmt(G.frW)} cm + iki yan gövde)`);
    if (G.topH < 0) w.push(`Boy dolap yüksekliği buzdolabına yetmiyor: en az ${fmt(G.minTall)} cm olmalı`);
    else if (G.topH < 12) w.push('Buzdolabının üstünde dolap için yer yok; üst kısım sabit dolgu kapakla kapatılır');
  }
  return w;
}

/* ── malzemeler ── */
export const FRONTS = [
  { k: 'beyaz', t: 'Beyaz lake', c: '#F4F3EF' }, { k: 'krem', t: 'Krem lake', c: '#EDE5D6' },
  { k: 'gri', t: 'Açık gri', c: '#C9CCCF' }, { k: 'antrasit', t: 'Antrasit', c: '#3A3D42' },
  { k: 'lacivert', t: 'Lacivert', c: '#24344D' }, { k: 'yesil', t: 'Adaçayı yeşili', c: '#9DAE97' },
  { k: 'turkuaz', t: 'Turkuaz', c: '#1FA3AE' }, { k: 'mese', t: 'Meşe', c: '#C49A6C' },
  { k: 'ceviz', t: 'Ceviz', c: '#7A5537' }, { k: 'siyah', t: 'Mat siyah', c: '#1E1F22' },
];
export const BODIES = [{ k: 'beyaz', t: 'Beyaz suntalam', c: '#F2F1ED' }, { k: 'gri', t: 'Gri suntalam', c: '#B9BCBF' }, { k: 'antrasit', t: 'Antrasit suntalam', c: '#45484D' }, { k: 'mese', t: 'Meşe suntalam', c: '#C49A6C' }];
export const TOPS = [
  { k: 'kuvars', t: 'Beyaz kuvars', c: '#F1F0EC' }, { k: 'mermer', t: 'Mermer görünüm', c: '#E9E6E1' },
  { k: 'granit', t: 'Siyah granit', c: '#2A2B2E' }, { k: 'beton', t: 'Beton gri', c: '#9C9D9A' },
  { k: 'mese', t: 'Masif meşe', c: '#B88A5A' }, { k: 'laminat', t: 'Laminat (açık)', c: '#DCD5C8' },
];
export const HANDLES = [
  { k: 'cubuk', t: 'Çubuk kulp' }, { k: 'dugme', t: 'Düğme kulp' }, { k: 'kenar', t: 'Kenar (tırnak) kulp' },
  { k: 'j', t: 'J profil kulp' }, { k: 'gizli', t: 'Gizli kulp (frezeli kanal)' },
  { k: 'gola', t: 'Gola (kulpsuz profil)' }, { k: 'takac', t: 'Tak-aç (itmeli, kulpsuz)' },
];
/* menteşe markaları: kesim listesinde menteşe ve kapak kaldırma ürün adı */
export const HINGE_BRANDS = [
  { k: 'standart', t: 'Standart (marka belirtilmedi)', h: 'Menteşe (frenli, 110°)', lift: 'Kapak kaldırma mekanizması', fold: 'Katlanır (iki parçalı) kapak kaldırma mekanizması' },
  { k: 'blum', t: 'Blum', h: 'Blum CLIP top BLUMOTION menteşe (frenli, 110°)', lift: 'Blum AVENTOS HK-S kapak kaldırma', fold: 'Blum AVENTOS HF katlanır kapak mekanizması' },
  { k: 'hafele', t: 'Häfele', h: 'Häfele Metalla 510 menteşe (frenli, 110°)', lift: 'Häfele Free Flap kapak kaldırma', fold: 'Häfele Free Fold katlanır kapak mekanizması' },
  { k: 'samet', t: 'Samet', h: 'Samet frenli menteşe (110°)', lift: 'Samet kapak kaldırma mekanizması', fold: 'Samet katlanır kapak mekanizması' },
  { k: 'grass', t: 'Grass', h: 'Grass Tiomos menteşe (frenli, 110°)', lift: 'Grass Kinvaro kapak kaldırma', fold: 'Grass Kinvaro F-20 katlanır kapak mekanizması' },
];
/* davlumbaz tipleri; ankastre ve gizli tipler gövdeli (dolap) modüldür */
export const HOODS = [
  { k: 'bacali', t: 'Duvar tipi bacalı davlumbaz' }, { k: 'egik', t: 'Eğik cam davlumbaz (bacalı)' },
  { k: 'ankastre', t: 'Ankastre (sürgülü) davlumbaz + üst dolap' }, { k: 'gizli', t: 'Dolap içine gizli davlumbaz (kapaklı)' },
  { k: 'aspirator', t: 'Aspiratör (duvar fanı)' },
];
export const hoodOf = m => m.hood || 'bacali';
export const hoodCab = m => !!MT[m.type]?.hood && (hoodOf(m) === 'ankastre' || hoodOf(m) === 'gizli');
/* üst dolap altı LED renk sıcaklığı */
export const LED_TEMPS = [{ k: '3000', t: 'Sıcak beyaz (3000 K)', c: '#FFD27A' }, { k: '4000', t: 'Gün ışığı (4000 K)', c: '#FFF0C2' }, { k: '6500', t: 'Soğuk beyaz (6500 K)', c: '#E3F0FF' }];
/* ankastre buzdolabı: üstteki bölüm */
export const FRIDGE_TOP = [{ k: 'kapak', t: 'Kapaklı dolap' }, { k: 'kalkar', t: 'Yukarı açılır kapak' }, { k: 'acik', t: 'Açık raf' }, { k: 'dolgu', t: 'Kapalı (sabit dolgu kapak)' }];
/* buzdolabı boy dolabı geometrisi (yerden, cm): cihaz nişi, bölme tablası, üstteki bölüm */
export function fridgeGeo(m, s) {
  const t = s.t, frW = m.frW || 56, frH = m.frH || 178, y0 = s.plinth;
  const nicheTop = y0 + t + frH + 1;              // alt tabla + cihaz + 1 cm montaj payı
  const coverH = Math.min(nicheTop + t, s.tallH) - y0;   // buzdolabı kapakları bölme tablasını da örter (boy dolabı aşmaz)
  const topY = nicheTop + t, topH = s.tallH - t - topY;
  return { frW, frH, nicheTop, coverH, topY, topH, doors: m.frDoors === 1 ? 1 : 2, top: topH < 12 ? 'dolgu' : (m.frTop || 'kapak'), minTall: y0 + 3 * t + frH + 1 };
}
/* kapak başına menteşe sayısı (yüksekliğe göre) ve tutma kenarı: alt kısımda üst kenar, üstte alt kenar */
export const hingeN = h => h <= 100 ? 2 : h <= 160 ? 3 : h <= 210 ? 4 : 5;
const gripTop = f => f.k === 'drawer' || (f.k !== 'lift' && f.y + f.h / 2 < 110);
export const HANDLE_COLORS = [{ k: 'inox', t: 'Inox', c: '#A9AEB3' }, { k: 'siyah', t: 'Siyah', c: '#1E1F22' }, { k: 'altin', t: 'Altın', c: '#C2A15A' }];
const pick = (list, k) => list.find(x => x.k === k) || list[0];

/* ── modül tipleri ──
 * row: base (alt, boy dahil) | upper (üst) | ward (giysi dolabı)
 */
export const MT = {
  // mutfak alt
  kapak:    { row: 'base', t: 'Kapaklı alt dolap', doors: 'auto', shelves: 1 },
  cekmece:  { row: 'base', t: 'Çekmeceli (3)', drawers: [0.2, 0.4, 0.4] },
  cekmece2: { row: 'base', t: 'Çekmeceli (2 derin)', drawers: [0.5, 0.5] },
  evye:     { row: 'base', t: 'Evye altı', doors: 'auto', sink: true },
  ocak:     { row: 'base', t: 'Ocak altı (çekmeceli)', drawers: [0.2, 0.4, 0.4], hob: true },
  firinalti: { row: 'base', t: 'Ocak + ankastre fırın', oven: true, hob: true },
  bulasik:  { row: 'base', t: 'Bulaşık makinesi (ankastre)', appliance: 'BM' },
  dondurucu: { row: 'base', t: 'Tezgah altı ankastre derin dondurucu', appliance: 'DF' },
  camasir:  { row: 'base', t: 'Çamaşır makinesi yeri', appliance: 'ÇM', washer: true },
  kose:     { row: 'base', t: 'Köşe (kör) dolap', doors: 1, corner: true, shelves: 1 },
  dolgu:    { row: 'base', t: 'Dolgu paneli', filler: true },
  bos:      { row: 'base', t: 'Boşluk', empty: true },
  // mutfak boy
  boy:      { row: 'base', t: 'Boy dolabı (kiler)', tall: true, doors: 'auto', shelves: 4 },
  firinkolon: { row: 'base', t: 'Fırın + mikrodalga kolonu', tall: true, oven: true, micro: true },
  buzdolabi: { row: 'base', t: 'Ankastre buzdolabı', tall: true, fridge: true },
  buzbosluk: { row: 'base', t: 'Buzdolabı yeri (solo)', tall: true, empty: true, fridgeSolo: true },
  // mutfak üst
  ust:      { row: 'upper', t: 'Üst dolap', doors: 'auto', shelves: 1 },
  ustcam:   { row: 'upper', t: 'Üst dolap (camlı)', doors: 'auto', glass: true, shelves: 1 },
  ustkalk:  { row: 'upper', t: 'Üst dolap (yukarı açılır)', lift: true, shelves: 1 },
  ustkatlan: { row: 'upper', t: 'Üst dolap (katlanır kalkar kapak, iki parçalı)', lift: 'fold', shelves: 1 },
  ustikikalk: { row: 'upper', t: 'Üst dolap (iki kalkar kapak, üst üste — her rafa ayrı)', lift: 'two', shelves: 1 },
  acik:     { row: 'upper', t: 'Açık raf', open: true, shelves: 1 },
  davlumbaz: { row: 'upper', t: 'Davlumbaz', hood: true },
  udolgu:   { row: 'upper', t: 'Dolgu paneli', filler: true },
  ubos:     { row: 'upper', t: 'Boşluk', empty: true },
  // giysi dolabı
  aski:     { row: 'ward', t: 'Askılık + raf', rails: [0.78], shelves: [0.86] },
  ikiaski:  { row: 'ward', t: 'Çift askı', rails: [0.86, 0.44], shelves: [0.9, 0.47] },
  uzunaski: { row: 'ward', t: 'Uzun askı (elbise/palto)', rails: [0.84], shelves: [0.9] },
  raf:      { row: 'ward', t: 'Raflı', shelves: [0.15, 0.3, 0.45, 0.6, 0.75, 0.88] },
  cekaski:  { row: 'ward', t: 'Çekmece + askı', drawers: [0.1, 0.1, 0.1], rails: [0.8], shelves: [0.88] },
  ayakkabi: { row: 'ward', t: 'Ayakkabılık', shoe: [0.08, 0.2, 0.32, 0.44, 0.56], shelves: [0.7, 0.85] },
  acikraf:  { row: 'ward', t: 'Açık raflı (kapaksız)', open: true, shelves: [0.2, 0.4, 0.6, 0.8] },
  // vestiyer askılık alternatifleri (kapaksız)
  vkanca:   { row: 'ward', t: 'Vestiyer · kancalı askılık panosu', open: true, hooks: [0.68], shelves: [0.9], panel: 'duz' },
  vlamel:   { row: 'ward', t: 'Vestiyer · lamel (çıta) pano + kanca', open: true, hooks: [0.68], shelves: [0.9], panel: 'lamel' },
  vcift:    { row: 'ward', t: 'Vestiyer · çift sıra kanca (yetişkin + çocuk)', open: true, hooks: [0.74, 0.44], shelves: [0.92] },
  vboru:    { row: 'ward', t: 'Vestiyer · açık askı borusu + şapkalık', open: true, rails: [0.8], shelves: [0.9] },
  voturak:  { row: 'ward', t: 'Vestiyer · oturak + ayakkabı rafı + kanca', open: true, bench: 46, shoeOpen: [0.1], hooks: [0.7], shelves: [0.9] },
  vayna:    { row: 'ward', t: 'Vestiyer · boy aynası paneli', open: true, mirror: true },
  // cihaz dolapları: makine zemine oturur (baza yok), derinlik cihaza göre artar, kapakta havalandırma menfezi
  vcamasir: { row: 'ward', t: 'Çamaşır makinesi dolabı (üstte raf)', appl: ['washer'], shelves: [0.62, 0.82], minD: 62, minW: 64, floor: true, vent: true },
  vcamkur:  { row: 'ward', t: 'Çamaşır + kurutma makinesi (üst üste kolon)', appl: ['washer', 'dryer'], shelves: [0.92], minD: 62, minW: 64, minH: 190, floor: true, vent: true },
  vtermo:   { row: 'ward', t: 'Termosifon dolabı (altta raflar)', boiler: true, shelves: [0.16, 0.34], minD: 55, minW: 55, vent: true },
  vcamtermo: { row: 'ward', t: 'Çamaşır makinesi + üstte termosifon', appl: ['washer'], boiler: true, shelves: [0.46], minD: 62, minW: 64, minH: 205, floor: true, vent: true },
  wbos:     { row: 'ward', t: 'Boşluk / niş', empty: true },
};
export const typesFor = (kind, row) => Object.entries(MT).filter(([, v]) => kind === 'wardrobe' ? v.row === 'ward' : v.row === row).map(([k, v]) => ({ k, t: v.t }));

export const mod = (type, w, extra = {}) => ({ id: uid('m'), type, w: round05(w), ...extra });
const round05 = v => Math.round(v * 2) / 2;
export const doorCount = (m, kind, s) => {
  const t = MT[m.type];
  if (m.doors) return m.doors;
  if (kind === 'wardrobe') return s.doors === 'surgulu' || isOpenMod(m, s) ? 0 : (m.w <= 55 ? 1 : 2);
  if (t.doors === 1) return 1;
  return m.w <= 60 ? 1 : 2;
};

/* yeni dizi */
export function newCabinet(kind, L, style = '') {
  const s = { ...(kind === 'wardrobe' ? (style === 'vestiyer' ? VESTIYER_DEF : WARDROBE_DEF) : KITCHEN_DEF) };
  const mat = { front: kind === 'wardrobe' ? 'beyaz' : 'beyaz', body: 'beyaz', top: 'kuvars', handle: kind === 'wardrobe' ? 'cubuk' : 'gola', hcolor: 'inox', hinge: 'standart' };
  const cab = { kind, s, mat, base: [], upper: [], ward: [], opts: { fridge: true, oven: 'kolon', dish: true, hood: true }, ...(style ? { style } : {}) };
  autoFill(cab, L, []);
  return cab;
}

/* ── aralık yardımcıları ── */
function subtract(segs, cuts) {
  let out = segs.map(s => [...s]);
  for (const [c0, c1] of cuts) {
    const nx = [];
    for (const [a, b] of out) {
      if (c1 <= a || c0 >= b) { nx.push([a, b]); continue; }
      if (c0 > a) nx.push([a, c0]);
      if (c1 < b) nx.push([c1, b]);
    }
    out = nx;
  }
  return out.filter(([a, b]) => b - a > 0.4);
}
/* bir boşluğu standart genişliklerle doldur */
function fillGap(len, kind, row, first = null) {
  const out = []; if (len < 0.5) return out;
  const fill = row === 'upper' ? 'ust' : row === 'ward' ? 'aski' : 'kapak';
  const filler = row === 'upper' ? 'udolgu' : row === 'ward' ? 'wbos' : 'dolgu';
  if (len < 25) return [mod(filler, len)];
  let n = Math.floor(len / 60), rem = len - n * 60;
  const widths = Array(n).fill(60);
  if (rem >= 30) widths.push(Math.floor(rem / 5) * 5);
  else if (n) widths[widths.length - 1] += Math.floor(rem / 5) * 5;
  else widths.push(Math.floor(len / 5) * 5);
  let used = widths.reduce((a, b) => a + b, 0), left = round05(len - used);
  // 10 cm'den küçük artığı son modüle kat (ayrı dolgu çıkmasın)
  if (left > 0 && left < 10 && widths.length) { widths[widths.length - 1] = round05(widths[widths.length - 1] + left); left = 0; }
  widths.forEach((w, i) => out.push(mod(i === 0 && first ? first : fill, w)));
  if (left >= 0.5) out.push(mod(filler, left));
  return out;
}
/* sıralı dizi: [x0,x1,type,...] parçalarından baştan sona kesintisiz modül listesi */
function sequence(L, fixed, free, row, kind) {
  fixed = fixed.slice().sort((a, b) => a.x0 - b.x0);
  const out = []; let x = 0;
  const empty = row === 'upper' ? 'ubos' : row === 'ward' ? 'wbos' : 'bos';
  const gapFill = (a, b) => {
    // [a,b] aralığında: serbest bölgeler doldurulur, kapalı bölgeler boşluk
    let cur = a;
    for (const [f0, f1] of free) {
      const s0 = Math.max(a, f0), s1 = Math.min(b, f1); if (s1 - s0 < 0.5) continue;
      if (s0 - cur >= 0.5) out.push(mod(empty, s0 - cur));
      out.push(...fillGap(s1 - s0, kind, row, row === 'base' && s0 === a && out.at(-1)?.type?.match(/ocak|firinalti/) ? 'cekmece' : null));
      cur = s1;
    }
    if (b - cur >= 0.5) out.push(mod(empty, b - cur));
  };
  for (const f of fixed) { gapFill(x, f.x0); out.push(mod(f.type, f.x1 - f.x0)); x = f.x1; }
  gapFill(x, L);
  return out;
}

/* ── otomatik dizme ──
 * obstacles: [{ x0, x1, type: 'door'|'window'|'gap', sill, h }] dizi koordinatında
 */
export function autoFill(cab, L, obstacles = []) {
  const s = cab.s, o = cab.opts || {};
  if (cab.kind === 'wardrobe') {
    const blocked = obstacles.map(ob => [ob.x0, ob.x1]);
    const free = subtract([[0, L]], blocked);
    const vest = cab.style === 'vestiyer';
    const pattern = vest ? ['vkanca', 'voturak', 'ayakkabi', 'vayna', 'vboru', 'acikraf'] : ['aski', 'cekaski', 'raf', 'ikiaski', 'uzunaski', 'ayakkabi'];
    // cihaz modülleri (çamaşır / kurutma makinesi, termosifon) son serbest aralığın sonuna yerleşir
    const sp = [];
    if (o.washer && o.dryer) sp.push(['vcamkur', 66]); else if (o.washer && o.boiler) sp.push(['vcamtermo', 66]); else if (o.washer) sp.push(['vcamasir', 66]);
    if (o.boiler && !(o.washer && !o.dryer)) sp.push(['vtermo', 60]);
    const spW = sp.reduce((a, [, w]) => a + w, 0);
    const out = []; let x = 0, pi = 0;
    free.forEach(([a, b], fi) => {
      if (a - x >= 0.5) out.push(mod('wbos', a - x));
      const last = fi === free.length - 1 && spW && b - a >= spW + 30, len = b - a - (last ? spW : 0);
      const k = Math.max(1, Math.round(len / (vest ? 70 : 100))), w = Math.floor(len / k * 2) / 2;
      for (let i = 0; i < k; i++) out.push(mod(k === 1 ? pattern[0] : pattern[pi++ % pattern.length], i === k - 1 ? len - w * (k - 1) : w));
      if (last) sp.forEach(([ty, w2]) => out.push(mod(ty, w2)));
      x = b;
    });
    if (L - x >= 0.5) out.push(mod('wbos', L - x));
    cab.ward = out; cab.base = []; cab.upper = [];
    return cab;
  }
  const counter = s.plinth + s.carcH + s.topT, upTop = s.upZ + s.upH;
  const baseBlocked = obstacles.filter(ob => ob.type === 'door' || ob.type === 'gap' || (ob.type === 'window' && (ob.sill || 0) < counter - 2)).map(ob => [ob.x0 - 1, ob.x1 + 1]);
  const upBlocked = obstacles.filter(ob => ob.type === 'door' || ob.type === 'gap' || ((ob.sill || 0) < upTop && (ob.sill || 0) + (ob.h || 0) > s.upZ)).map(ob => [ob.x0 - 1, ob.x1 + 1]);
  const freeBase = subtract([[0, L]], baseBlocked);
  const fixed = [];
  const hits = (x0, x1, clear = 0, avoid = []) => avoid.some(([a, b]) => x0 < b && x1 > a) || x0 < -0.1 || x1 > L + 0.1 || fixed.some(f => { const c = clear && MT[f.type].tall ? clear : 0; return x0 < f.x1 + c - 0.1 && x1 > f.x0 - c + 0.1; }) || !freeBase.some(([a, b]) => x0 >= a - 0.1 && x1 <= b + 0.1);
  const place = (type, w, pref, clear = 0, avoid = []) => {   // pref: tercih edilen merkez; en yakın uygun yere koy
    const cands = [];
    for (const [a, b] of freeBase) for (let x0 = a; x0 + w <= b + 0.1; x0 += 5) cands.push(x0);
    for (const [a, b] of freeBase) cands.push(b - w);
    cands.sort((p, q) => Math.abs(p + w / 2 - pref) - Math.abs(q + w / 2 - pref));
    for (const x0 of cands) if (!hits(x0, x0 + w, clear, avoid)) { const f = { type, x0: round05(x0), x1: round05(x0 + w) }; fixed.push(f); return f; }
    return null;
  };
  const biggest = freeBase.reduce((m, sg) => (sg[1] - sg[0] > (m ? m[1] - m[0] : 0) ? sg : m), null);
  if (biggest) {
    const len = biggest[1] - biggest[0];
    // küçük mutfakta önce evye ve ocak; buzdolabı / fırın kolonu yer varsa
    if (o.fridge && len >= 300) place('buzdolabi', 60, biggest[1] - 30);
    const kolon = o.oven === 'kolon' && len >= 420 ? place('firinkolon', 60, biggest[1] - 90) : null;
    const win = obstacles.find(ob => ob.type === 'window' && freeBase.some(([a, b]) => (ob.x0 + ob.x1) / 2 > a && (ob.x0 + ob.x1) / 2 < b));
    const sink = place('evye', len >= 240 ? 80 : 60, win ? (win.x0 + win.x1) / 2 : biggest[0] + len * 0.35);
    const hobPref = sink ? (sink.x0 > L / 2 ? sink.x0 - 120 : sink.x1 + 150) : biggest[0] + len * 0.6;
    // ocak boy dolaba bitişik olmasın (en az 30 cm tezgah)
    const hobT = kolon || o.oven === 'yok' ? 'ocak' : 'firinalti';
    // ocak: evyeden en az 40 cm uzak, pencere önüne düşmesin (davlumbaz için), boy dolaba bitişik olmasın
    const away = [...(sink ? [[sink.x0 - 40, sink.x1 + 40]] : []), ...obstacles.filter(ob => ob.type === 'window').map(ob => [ob.x0 - 5, ob.x1 + 5])];
    place(hobT, 60, hobPref, 30, away) || place(hobT, 60, hobPref, 30, away.slice(0, 1)) || place(hobT, 60, hobPref, 30) || place(hobT, 60, hobPref);
    if (sink && o.dish) place('bulasik', 60, sink.x1 + 30) || place('bulasik', 60, sink.x0 - 30);
  }
  cab.base = sequence(L, fixed, freeBase, 'base', 'kitchen');
  // üst sıra: boy modüllerin ve açıklıkların üstü boş, ocağın üstüne davlumbaz
  const lay = layoutRow(cab.base);
  const tallCuts = lay.filter(p => MT[p.m.type].tall).map(p => [p.x0, p.x1]);
  const freeUp = subtract([[0, L]], [...upBlocked, ...tallCuts]);
  const ufixed = [];
  const hob = lay.find(p => MT[p.m.type].hob);
  if (hob && o.hood) {
    const w = hob.x1 - hob.x0 >= 90 ? 90 : 60, c = (hob.x0 + hob.x1) / 2;
    if (freeUp.some(([a, b]) => c - w / 2 >= a - 0.1 && c + w / 2 <= b + 0.1)) ufixed.push({ type: 'davlumbaz', x0: c - w / 2, x1: c + w / 2 });
  }
  cab.upper = sequence(L, ufixed, freeUp, 'upper', 'kitchen');
  if (o.hoodType) cab.upper.forEach(m => { if (MT[m.type].hood) m.hood = o.hoodType; });
  cab.ward = [];
  return cab;
}

/* ── yerleşim ── */
export function layoutRow(list) { let x = 0; return (list || []).map(m => { const p = { m, x0: x, x1: x + m.w }; x += m.w; return p; }); }
export const rowLen = list => (list || []).reduce((a, m) => a + m.w, 0);
export function runLength(cab) { return cab.kind === 'wardrobe' ? rowLen(cab.ward) : Math.max(rowLen(cab.base), rowLen(cab.upper)); }
export function itemDims(cab) {
  const s = cab.s, L = Math.max(10, runLength(cab));
  if (cab.kind === 'wardrobe') return { w: L, d: Math.max(s.D, ...(cab.ward || []).map(m => modD(m, s))) + s.frontT, h: s.H };
  return { w: L, d: s.topD, h: Math.max(s.tallH, s.upZ + s.upH) };
}
/* ön yüzler: bir modülün kapak / çekmece / cihaz yüzeylerinin listesi (x0,y0,w,h — yerden, sola göre) */
export function frontsOf(m, kind, s, x0) {
  const t = MT[m.type], g = s.gap, F = [];
  if (!t || t.empty || t.filler) return F;
  const W = m.w;
  const doors = (y0, h, n, extra = {}) => { const dw = (W - g * (n + 1)) / n; for (let i = 0; i < n; i++) F.push({ k: 'door', x: x0 + g + i * (dw + g), y: y0 + g / 2, w: dw, h: h - g, hinge: n === 1 ? (m.hinge || 'L') : (i === 0 ? 'L' : 'R'), ...extra }); };
  const drawers = (y0, h, parts) => { let y = y0 + h; for (const p of parts) { const dh = h * p; y -= dh; F.push({ k: 'drawer', x: x0 + g, y: y + g / 2, w: W - 2 * g, h: dh - g }); } };
  if (kind === 'wardrobe') {
    const y0 = modY0(m, s), h = s.H - y0;
    if (s.doors === 'surgulu' || isOpenMod(m, s)) return F;   // sürgülü kapaklar dizinin tamamına çizilir; kapaksız modülde kapak yok
    doors(y0, h, doorCount(m, kind, s));
    return F;
  }
  if (t.row === 'upper') {
    const y0 = s.upZ, h = s.upH;
    if (t.hood) {   // ankastre: altta sürgülü davlumbaz paneli, üstü dolap; gizli: kapak arkasında cihaz
      if (hoodOf(m) === 'ankastre') { const vh = 6; F.push({ k: 'visor', x: x0 + g, y: y0 + g / 2, w: W - 2 * g, h: vh - g }); doors(y0 + vh, h - vh, doorCount(m, kind, s)); }
      else if (hoodOf(m) === 'gizli') doors(y0, h, doorCount(m, kind, s), { hood: true });
      return F;
    }
    if (t.open) return F;
    if (t.lift === 'fold' || t.lift === 'two') {   // iki parçalı: katlanır (üst parça kulpsuz, alttaki ile birlikte katlanır) ya da iki ayrı kalkar kapak
      const hb = Math.round(h / 2 * 2) / 2;
      F.push({ k: 'lift', x: x0 + g, y: y0 + g / 2, w: W - 2 * g, h: hb - g, ...(t.lift === 'fold' ? { fold: 'bot' } : {}) });
      F.push({ k: 'lift', x: x0 + g, y: y0 + hb + g / 2, w: W - 2 * g, h: h - hb - g, ...(t.lift === 'fold' ? { fold: 'top', noHandle: true } : {}) });
      return F;
    }
    if (t.lift) { F.push({ k: 'lift', x: x0 + g, y: y0 + g / 2, w: W - 2 * g, h: h - g }); return F; }
    doors(y0, h, doorCount(m, kind, s), { glass: !!t.glass });
    return F;
  }
  const y0 = s.plinth, h = s.carcH;
  if (t.tall) {
    const H = s.tallH - s.plinth;
    if (t.fridge) {   // cihaz kapak(lar)ı + üstteki bölüm (kapaklı / yukarı açılır / açık / sabit dolgu)
      const G = fridgeGeo(m, s), hinge = m.hinge || 'L';
      const one = (y, hh, extra = {}) => F.push({ k: 'door', x: x0 + g, y: y + g / 2, w: W - 2 * g, h: hh - g, hinge, app: 'fridge', ...extra });
      if (G.doors === 2) { const fz = Math.round(G.coverH * (m.frSplit || 0.38)); one(y0, fz, { frz: true }); one(y0 + fz, G.coverH - fz); }
      else one(y0, G.coverH);
      const ty = y0 + G.coverH, th = s.tallH - ty;
      if (th > 1) {
        if (G.top === 'kalkar') F.push({ k: 'lift', x: x0 + g, y: ty + g / 2, w: W - 2 * g, h: th - g });
        else if (G.top === 'dolgu') F.push({ k: 'fixed', x: x0 + g, y: ty + g / 2, w: W - 2 * g, h: th - g });
        else if (G.top === 'kapak') doors(ty, th, doorCount(m, kind, s));
      }
      return F;
    }
    if (t.oven) {
      drawers(y0, 60, [0.5, 0.5]);
      F.push({ k: 'oven', x: x0 + g, y: y0 + 60 + g / 2, w: W - 2 * g, h: 60 - g });
      if (t.micro) F.push({ k: 'micro', x: x0 + g, y: y0 + 120 + g / 2, w: W - 2 * g, h: 40 - g });
      const yy = y0 + (t.micro ? 160 : 120); doors(yy, H - (yy - y0), 1);
      return F;
    }
    const n = doorCount(m, kind, s), hb = 130; doors(y0, hb, n); doors(y0 + hb, H - hb, n); return F;
  }
  if (t.oven) { F.push({ k: 'oven', x: x0 + g, y: y0 + h - 60 + g / 2, w: W - 2 * g, h: 60 - g }); drawers(y0, h - 60, [1]); return F; }
  if (t.drawers) { drawers(y0, h, t.drawers); return F; }
  if (t.appliance) { F.push({ k: 'panel', x: x0 + g, y: y0 + g / 2, w: W - 2 * g, h: h - g, label: t.appliance, washer: !!t.washer }); return F; }
  doors(y0, h, doorCount(m, kind, s));
  return F;
}

/* ── ön görünüş (kotlu) — SVG ve DXF ortak çizim ilkelleri ── */
export function elevation(cab, { obstacles = [], interior = false, wallH = 280, sel = null } = {}) {
  const s = cab.s, P = [], hits = [], kind = cab.kind, L = runLength(cab);
  const front = pick(FRONTS, cab.mat.front).c, top = pick(TOPS, cab.mat.top).c, body = pick(BODIES, cab.mat.body).c;
  const R = (x, y, w, h, o = {}) => P.push({ t: 'rect', x, y, w, h, ...o });
  const Ln = (x1, y1, x2, y2, o = {}) => P.push({ t: 'line', x1, y1, x2, y2, ...o });
  const T = (x, y, txt, o = {}) => P.push({ t: 'text', x, y, txt, ...o });
  // duvar ve açıklıklar
  R(-10, 0, L + 20, wallH, { s: '#D7D3CC', f: '#FAF9F6', sw: 0.6, layer: 'DUVAR' });
  Ln(-30, 0, L + 30, 0, { s: '#24272B', sw: 1.2, layer: 'DUVAR' });
  for (const ob of obstacles) {
    const y0 = ob.type === 'window' ? ob.sill || 90 : 0, h = ob.h || (ob.type === 'window' ? 120 : 210);
    R(ob.x0, y0, ob.x1 - ob.x0, h, { s: '#5B9BD5', f: ob.type === 'window' ? '#E3F1FB' : '#F1F3F5', sw: 0.8, dash: true, layer: 'ACIKLIK' });
    T((ob.x0 + ob.x1) / 2, y0 + h / 2, ob.type === 'window' ? 'Pencere' : ob.type === 'door' ? 'Kapı' : 'Boşluk', { size: 7, c: '#5B9BD5' });
  }
  const bgEnd = P.length;   // duvar / açıklık katmanının sonu (LED ışığı bunun üstüne, dolapların altına)
  const handle = cab.mat.handle, hcol = pick(HANDLE_COLORS, cab.mat.hcolor).c;
  const drawFront = (f, m) => {
    if (f.k === 'visor') {   // ankastre davlumbazın sürgülü paneli
      R(f.x, f.y, f.w, f.h, { s: '#24272B', f: '#C9CDD2', sw: 0.6, layer: 'CIHAZ' }); Ln(f.x + 3, f.y + f.h * 0.35, f.x + f.w - 3, f.y + f.h * 0.35, { s: '#8A9096', sw: 0.5, layer: 'CIHAZ' });
      T(f.x + f.w / 2, f.y + f.h * 0.68, 'Sürgülü davlumbaz', { size: 3.6, c: '#4B5159' }); return;
    }
    const fill = f.k === 'oven' || f.k === 'micro' ? '#2B2D31' : f.glass ? '#DCEFF2' : front;
    R(f.x, f.y, f.w, f.h, { s: '#24272B', f: fill, sw: 0.7, layer: 'KAPAK' });
    if (f.k === 'fixed') { T(f.x + f.w / 2, f.y + f.h / 2, 'sabit', { size: 4, c: '#9AA1A9' }); return; }
    if (f.glass) R(f.x + 6, f.y + 6, f.w - 12, f.h - 12, { s: '#24272B', f: '#EAF6F8', sw: 0.4, layer: 'KAPAK' });
    if (f.k === 'oven' || f.k === 'micro') { R(f.x + 5, f.y + 6, f.w - 10, f.h - 18, { s: '#8A9096', f: '#16171A', sw: 0.4, layer: 'CIHAZ' }); T(f.x + f.w / 2, f.y + f.h - 6, f.k === 'oven' ? 'Fırın' : 'Mikrodalga', { size: 5, c: '#C9CDD2' }); return; }
    if (f.k === 'panel') { T(f.x + f.w / 2, f.y + f.h / 2, f.label, { size: 8, c: '#7A8594' }); if (f.washer) P.push({ t: 'circle', x: f.x + f.w / 2, y: f.y + f.h / 2, r: Math.min(f.w, f.h) * 0.3, s: '#7A8594', sw: 0.6, layer: 'CIHAZ' }); }
    if (f.app === 'fridge') { const G = fridgeGeo(m, s); T(f.x + f.w / 2, f.y + f.h / 2, f.frz ? 'Dondurucu' : `Buzdolabı ${fmt(G.frW)}×${fmt(G.frH)}`, { size: 4.2, c: '#7A8594' }); }
    if (f.hood) { R(f.x + 6, f.y + 4, f.w - 12, 14, { s: '#8A9096', sw: 0.4, dash: true, layer: 'CIHAZ' }); T(f.x + f.w / 2, f.y + 11, 'gizli davlumbaz', { size: 3.6, c: '#7A8594' }); }
    // açılım işareti (kesik V: tepesi menteşe tarafında) ve menteşe kaseleri (Ø35)
    if (f.k === 'door') {
      const hx = f.hinge === 'L' ? f.x : f.x + f.w, ox = f.hinge === 'L' ? f.x + f.w : f.x;
      Ln(ox, f.y, hx, f.y + f.h / 2, { s: '#9AA1A9', sw: 0.4, dash: true, layer: 'ACILIM' }); Ln(hx, f.y + f.h / 2, ox, f.y + f.h, { s: '#9AA1A9', sw: 0.4, dash: true, layer: 'ACILIM' });
      if (!f.app) { const n = hingeN(f.h), cx = f.hinge === 'L' ? f.x + 2.25 : f.x + f.w - 2.25; for (let i = 0; i < n; i++) P.push({ t: 'circle', x: cx, y: n === 1 ? f.y + f.h / 2 : f.y + 10 + i * (f.h - 20) / (n - 1), r: 1.75, s: '#B4BAC0', sw: 0.3, layer: 'MENTESE' }); }
    }
    if (f.k === 'lift') {
      Ln(f.x, f.y, f.x + f.w / 2, f.y + f.h, { s: '#9AA1A9', sw: 0.4, dash: true, layer: 'ACILIM' }); Ln(f.x + f.w / 2, f.y + f.h, f.x + f.w, f.y, { s: '#9AA1A9', sw: 0.4, dash: true, layer: 'ACILIM' });
      if (f.fold === 'top') T(f.x + f.w / 2, f.y + 4, 'katlanır', { size: 3.4, c: '#7A8594' });
      if (f.fold === 'bot') for (const dx of [-3, 3]) Ln(f.x + f.w / 2, f.y + f.h - 2, f.x + f.w / 2 + dx, f.y + f.h - 5, { s: '#7A8594', sw: 0.4, layer: 'ACILIM' });   // menteşe birleşimi
    }
    if (f.k === 'door' && MT[m?.type]?.vent) for (const yb of [f.y + 6, f.y + f.h - 16]) for (let k = 0; k < 5; k++) Ln(f.x + f.w * 0.2, yb + k * 2.2, f.x + f.w * 0.8, yb + k * 2.2, { s: '#6E747B', sw: 0.6, layer: 'MENFEZ' });   // havalandırma menfezi
    // kulp
    if (handle === 'takac' || f.k === 'panel' || f.noHandle) return;
    const upper = f.y > s.plinth + (s.carcH || 0) + 10 && kind !== 'wardrobe';
    if (handle === 'gola') { if (!upper && f.k !== 'lift' && f.y + f.h < 110) Ln(f.x, f.y + f.h - 1.5, f.x + f.w, f.y + f.h - 1.5, { s: hcol, sw: 1.4, layer: 'KULP' }); return; }
    const top = gripTop(f), ey = top ? f.y + f.h : f.y, sd = top ? -1 : 1;   // tutma kenarı ve kapağın içine doğru yön
    const vEdge = kind === 'wardrobe' && f.k === 'door';                    // giysi dolabında profil kulp açılan dikey kenarda
    const oxE = f.hinge === 'L' ? f.x + f.w : f.x;
    if (handle === 'j') {
      if (vEdge) { R(f.hinge === 'L' ? oxE - 1.2 : oxE, f.y, 1.2, f.h, { s: hcol, f: hcol, sw: 0.3, layer: 'KULP' }); return; }
      R(f.x, top ? ey - 1.2 : ey, f.w, 1.2, { s: hcol, f: hcol, sw: 0.3, layer: 'KULP' }); Ln(f.x, ey + sd * 2, f.x + f.w, ey + sd * 2, { s: hcol, sw: 0.4, layer: 'KULP' }); return;
    }
    if (handle === 'gizli') {
      if (vEdge) { R(f.hinge === 'L' ? oxE - 2 : oxE, f.y, 2, f.h, { s: '#24272B', f: shade(front, -40), sw: 0.3, layer: 'KULP' }); return; }
      R(f.x, top ? ey - 2 : ey, f.w, 2, { s: '#24272B', f: shade(front, -40), sw: 0.3, layer: 'KULP' }); Ln(f.x, ey + sd * 3.2, f.x + f.w, ey + sd * 3.2, { s: '#6E747B', sw: 0.3, dash: true, layer: 'KULP' }); return;
    }
    if (handle === 'kenar') {
      const kw = Math.min(10, f.w / 3), kx = f.k === 'door' ? (f.hinge === 'L' ? f.x + f.w - kw - 3 : f.x + 3) : f.x + f.w / 2 - kw / 2;
      if (vEdge) { R(f.hinge === 'L' ? oxE - 1 : oxE, f.y + f.h * 0.48 - 5, 1, 10, { s: hcol, f: hcol, sw: 0.3, layer: 'KULP' }); return; }
      R(kx, top ? ey - 1 : ey, kw, 1, { s: hcol, f: hcol, sw: 0.3, layer: 'KULP' }); return;
    }
    let hx, hy, vertical = true;
    if (f.k === 'drawer' || f.k === 'lift') { hx = f.x + f.w / 2; hy = f.k === 'lift' ? f.y + 4 : f.y + f.h - Math.min(6, f.h / 3); vertical = false; }
    else { hx = f.hinge === 'L' ? f.x + f.w - 4 : f.x + 4; hy = top ? f.y + f.h - 12 : f.y + 10; if (kind === 'wardrobe') hy = f.y + f.h * 0.48; }
    if (handle === 'dugme') P.push({ t: 'circle', x: hx, y: hy, r: 1.3, s: hcol, f: hcol, sw: 0.4, layer: 'KULP' });
    else if (vertical) Ln(hx, hy - (kind === 'wardrobe' ? 15 : 6), hx, hy + (kind === 'wardrobe' ? 15 : 6), { s: hcol, sw: 1.4, layer: 'KULP' });
    else Ln(hx - Math.min(10, f.w / 4), hy, hx + Math.min(10, f.w / 4), hy, { s: hcol, sw: 1.4, layer: 'KULP' });
  };
  if (kind === 'wardrobe') {
    const lay = layoutRow(cab.ward), y0 = s.plinth, h = s.H - s.plinth;
    R(0, 0, L, s.plinth, { s: '#24272B', f: '#55595F', sw: 0.6, layer: 'BAZA' });
    lay.forEach((p, i) => {
      const t = MT[p.m.type], w = p.x1 - p.x0, y0 = modY0(p.m, s), h = s.H - y0;   // makine dolabı zeminden başlar
      hits.push({ id: p.m.id, row: 'ward', x: p.x0, y: y0, w, h });
      if (t.empty) { R(p.x0, y0, w, h, { s: '#9AA1A9', sw: 0.5, dash: true, layer: 'GOVDE' }); return; }
      const open = isOpenMod(p.m, s);
      R(p.x0, y0, w, h, { s: '#24272B', f: interior || open ? body : front, sw: 0.8, layer: 'GOVDE' });
      if (interior || open) {
        const ih = h - 2 * s.t, iy = y0 + s.t;
        if (open) R(p.x0 + s.t, iy, w - 2 * s.t, ih, { s: '#24272B', f: shade(body, -10), sw: 0.4, layer: 'GOVDE' });   // açık modülde arkalık görünür
        if (t.panel === 'lamel') for (let x = p.x0 + s.t + 3; x < p.x1 - s.t - 2; x += 6) R(x, iy + ih * 0.42, 3.4, ih * 0.44, { s: '#8A6A4F', f: '#B08463', sw: 0.3, layer: 'PANO' });
        if (t.panel === 'duz') R(p.x0 + s.t + 2, iy + ih * 0.44, w - 2 * s.t - 4, ih * 0.4, { s: '#24272B', f: front, sw: 0.5, layer: 'PANO' });
        if (t.mirror) { R(p.x0 + s.t + 3, iy + 8, w - 2 * s.t - 6, ih - 16, { s: '#8A9096', f: '#DCEFF2', sw: 0.6, layer: 'AYNA' }); Ln(p.x0 + s.t + 10, iy + ih - 30, p.x0 + s.t + 22, iy + ih - 18, { s: '#FFFFFF', sw: 1.2, layer: 'AYNA' }); }
        if (t.bench) { R(p.x0 + s.t, y0 + t.bench - s.plinth - 4, w - 2 * s.t, 4, { s: '#24272B', f: body, sw: 0.6, layer: 'OTURAK' }); R(p.x0 + s.t + 1, y0 + t.bench - s.plinth, w - 2 * s.t - 2, 5, { s: '#7A6A5C', f: '#C7B39E', sw: 0.4, layer: 'OTURAK' }); }
        (t.shoeOpen || []).forEach(f => Ln(p.x0 + s.t, iy + ih * f, p.x1 - s.t, iy + ih * f + 6, { s: '#6E747B', sw: 0.8, layer: 'RAF' }));
        (t.hooks || []).forEach(f => { const hy = iy + ih * f, n = hookCount(w - 2 * s.t); for (let k = 0; k < n; k++) { const hx = p.x0 + s.t + (w - 2 * s.t) * (k + 0.5) / n; Ln(hx, hy, hx, hy - 6, { s: '#3A3F45', sw: 1.1, layer: 'KANCA' }); Ln(hx, hy - 6, hx + 2.5, hy - 4, { s: '#3A3F45', sw: 1.1, layer: 'KANCA' }); } });
        shelfPos(p.m, s, kind).forEach(v => Ln(p.x0 + s.t, iy + v, p.x1 - s.t, iy + v, { s: '#6E747B', sw: 0.8, layer: 'RAF' }));
        (t.rails || []).forEach(f => { const ry = iy + ih * f - 5; Ln(p.x0 + 4, ry, p.x1 - 4, ry, { s: '#8A9096', sw: 1.6, layer: 'ASKI' }); for (let x = p.x0 + 10; x < p.x1 - 8; x += 7) Ln(x, ry, x + 2, ry - (f > 0.6 ? ih * 0.35 : ih * 0.3), { s: '#C9CDD2', sw: 0.4, layer: 'ASKI' }); });
        (t.drawers || []).reduce((y, f) => { const dh = ih * f; R(p.x0 + s.t + 1, y, w - 2 * s.t - 2, dh - 1, { s: '#24272B', f: front, sw: 0.5, layer: 'CEKMECE' }); return y + dh; }, iy);
        (t.shoe || []).forEach(f => Ln(p.x0 + s.t, iy + ih * f, p.x1 - s.t, iy + ih * f + 8, { s: '#6E747B', sw: 0.8, layer: 'RAF' }));
        for (const a of applLayout(p.m, s)) {   // çamaşır / kurutma makinesi, termosifon
          const ax = p.x0 + (w - a.w) / 2;
          R(ax, a.y, a.w, a.h, { s: '#5B6168', f: '#F4F5F6', sw: 0.7, layer: 'CIHAZ' });
          if (a.k === 'boiler') { R(ax + 4, a.y + a.h - 10, a.w - 8, 6, { s: '#9AA1A9', f: '#E3E6E9', sw: 0.4, layer: 'CIHAZ' }); Ln(ax + a.w / 2 - 6, a.y, ax + a.w / 2 - 6, a.y - 5, { s: '#1E7FD8', sw: 1.2, layer: 'TESISAT' }); Ln(ax + a.w / 2 + 6, a.y, ax + a.w / 2 + 6, a.y - 5, { s: '#E5484D', sw: 1.2, layer: 'TESISAT' }); }
          else { R(ax + 3, a.y + a.h - 12, a.w - 6, 8, { s: '#9AA1A9', f: '#E3E6E9', sw: 0.4, layer: 'CIHAZ' }); P.push({ t: 'circle', x: ax + a.w / 2, y: a.y + a.h * 0.42, r: Math.min(a.w, a.h) * 0.3, s: '#5B6168', f: '#DCE6EA', sw: 0.8, layer: 'CIHAZ' }); }
          T(ax + a.w / 2, a.k === 'boiler' ? a.y + a.h / 2 : a.y + a.h * 0.42, a.k === 'boiler' ? 'Termosifon' : a.ab, { size: a.k === 'boiler' ? 5.5 : 7, c: '#5B6168', bold: true });
        }
      } else frontsOf(p.m, kind, s, p.x0).forEach(f => drawFront(f, p.m));
      T(p.x0 + w / 2, y0 + h + 6, String(i + 1), { size: 6, c: '#00AFB0', bold: true });
    });
    if (!interior && s.doors === 'surgulu') {
      const n = Math.max(2, Math.ceil(L / 120)), pw = L / n + 2;
      for (let i = 0; i < n; i++) { const x = Math.min(L - pw, i * (L / n) - (i ? 1 : 0)); R(x, y0, pw, h, { s: '#24272B', f: i % 2 ? front : shade(front, -6), sw: 0.8, layer: 'KAPAK' }); Ln(x + pw / 2 - 12, y0 + h / 2, x + pw / 2 + 12, y0 + h / 2, { s: '#9AA1A9', sw: 0.6, layer: 'ACILIM' }); }
    }
    R(0, s.H - 0.1, L, 0.1, { s: '#24272B', sw: 0.8 });
    dimChain(P, lay, -14, s);
    Ln(-22, 0, -22, s.H, { s: '#7A8594', sw: 0.4, layer: 'OLCU' }); T(-26, s.H / 2, String(s.H), { size: 6, rot: -90, c: '#7A8594' });
  } else {
    const base = layoutRow(cab.base), up = layoutRow(cab.upper);
    const cY = s.plinth + s.carcH, tallTop = s.tallH;
    base.forEach((p, i) => {
      const t = MT[p.m.type], w = p.x1 - p.x0, H = t.tall ? tallTop : cY;
      hits.push({ id: p.m.id, row: 'base', x: p.x0, y: 0, w, h: H });
      if (t.empty) {
        R(p.x0, 0, w, H, { s: '#9AA1A9', sw: 0.5, dash: true, layer: 'GOVDE' });
        if (t.fridgeSolo) T(p.x0 + w / 2, H / 2, 'Buzdolabı', { size: 6, c: '#7A8594' });
        return;
      }
      R(p.x0, 0, w, s.plinth, { s: '#24272B', f: '#55595F', sw: 0.5, layer: 'BAZA' });
      R(p.x0, s.plinth, w, H - s.plinth, { s: '#24272B', f: t.filler ? front : body, sw: 0.8, layer: 'GOVDE' });
      if (t.fridge) {   // baza havalandırma ızgarası; iç düzende cihaz silueti + bölme tablası
        for (let k = 0; k < 4; k++) Ln(p.x0 + w * 0.25, 2.5 + k * 1.6, p.x1 - w * 0.25, 2.5 + k * 1.6, { s: '#C9CDD2', sw: 0.5, layer: 'MENFEZ' });
        const G = fridgeGeo(p.m, s);
        if (interior) {
          R(p.x0 + s.t, s.plinth + s.t, w - 2 * s.t, G.nicheTop - s.plinth - s.t, { s: '#24272B', f: shade(body, -10), sw: 0.4, layer: 'GOVDE' });
          R(p.x0 + (w - G.frW) / 2, s.plinth + s.t, G.frW, G.frH, { s: '#5B6168', f: '#F4F5F6', sw: 0.7, layer: 'CIHAZ' });
          if (G.doors === 2) Ln(p.x0 + (w - G.frW) / 2, s.plinth + s.t + G.frH * 0.36, p.x0 + (w + G.frW) / 2, s.plinth + s.t + G.frH * 0.36, { s: '#5B6168', sw: 0.5, layer: 'CIHAZ' });
          T(p.x0 + w / 2, s.plinth + s.t + G.frH * 0.62, 'Buzdolabı', { size: 5, c: '#5B6168', bold: true });
          T(p.x0 + w / 2, s.plinth + s.t + G.frH * 0.62 - 7, `${fmt(G.frW)} × ${fmt(G.frH)} cm`, { size: 4.2, c: '#5B6168' });
          if (G.topH > 0) R(p.x0 + s.t, G.nicheTop, w - 2 * s.t, s.t, { s: '#24272B', f: body, sw: 0.5, layer: 'GOVDE' });
          if (G.top === 'dolgu' || G.topH < 20) frontsOf(p.m, 'kitchen', s, p.x0).filter(f => f.k === 'fixed').forEach(f => drawFront(f, p.m));
        }
      }
      if (interior && shelfable(p.m, 'kitchen', s)) { const inn = modInner(p.m, s, 'kitchen'); R(p.x0 + s.t, inn.y, w - 2 * s.t, inn.h, { s: '#24272B', f: shade(body, -10), sw: 0.4, layer: 'GOVDE' }); shelfPos(p.m, s, 'kitchen').forEach(v => Ln(p.x0 + s.t, inn.y + v, p.x1 - s.t, inn.y + v, { s: '#6E747B', sw: 0.8, layer: 'RAF' })); }
      else if (!(interior && t.fridge)) frontsOf(p.m, 'kitchen', s, p.x0).forEach(f => drawFront(f, p.m));
      if (t.fridge && !interior && fridgeGeo(p.m, s).top === 'acik') { const inn = modInner(p.m, s, 'kitchen'); R(p.x0 + s.t, inn.y, w - 2 * s.t, inn.h, { s: '#24272B', f: shade(body, -10), sw: 0.4, layer: 'GOVDE' }); shelfPos(p.m, s, 'kitchen').forEach(v => Ln(p.x0 + s.t, inn.y + v, p.x1 - s.t, inn.y + v, { s: '#6E747B', sw: 0.8, layer: 'RAF' })); }
      if (t.sink) { R(p.x0 + w / 2 - 22, cY + s.topT, 44, 1.5, { s: '#8A9096', f: '#C9CDD2', sw: 0.4, layer: 'CIHAZ' }); Ln(p.x0 + w / 2 + 14, cY + s.topT, p.x0 + w / 2 + 14, cY + s.topT + 30, { s: '#8A9096', sw: 1.2, layer: 'CIHAZ' }); Ln(p.x0 + w / 2 + 14, cY + s.topT + 30, p.x0 + w / 2 + 4, cY + s.topT + 26, { s: '#8A9096', sw: 1.2, layer: 'CIHAZ' }); }
      if (t.hob) R(p.x0 + 4, cY + s.topT, w - 8, 1.2, { s: '#16171A', f: '#16171A', sw: 0.4, layer: 'CIHAZ' });
      T(p.x0 + w / 2, (t.tall ? H : cY) + (t.tall ? 6 : s.topT + 6), String(i + 1), { size: 6, c: '#00AFB0', bold: true });
    });
    // tezgah: boy ve boşluk olmayan ardışık modüller boyunca
    let seg = null;
    const flush = () => { if (seg) R(seg[0] - (seg[0] < 0.1 ? 0 : 0), cY, seg[1] - seg[0], s.topT, { s: '#24272B', f: top, sw: 0.8, layer: 'TEZGAH' }); seg = null; };
    for (const p of base) { const t = MT[p.m.type]; if (t.tall || t.empty) { flush(); continue; } seg = seg ? [seg[0], p.x1] : [p.x0, p.x1]; }
    flush();
    up.forEach((p, i) => {
      const t = MT[p.m.type], w = p.x1 - p.x0;
      hits.push({ id: p.m.id, row: 'upper', x: p.x0, y: s.upZ, w, h: s.upH });
      if (t.empty) return;
      if (t.hood && !hoodCab(p.m)) {
        const ht = hoodOf(p.m), cx = p.x0 + w / 2;
        if (ht === 'aspirator') {   // duvar fanı: dairesel ızgara
          const r = Math.min(13, w / 3), cy = s.upZ + s.upH / 2;
          P.push({ t: 'circle', x: cx, y: cy, r: r + 2, s: '#24272B', f: '#E3E6E9', sw: 0.7, layer: 'CIHAZ' });
          for (let k = -2; k <= 2; k++) Ln(cx - Math.sqrt(r * r - (k * r / 3) ** 2), cy + k * r / 3, cx + Math.sqrt(r * r - (k * r / 3) ** 2), cy + k * r / 3, { s: '#8A9096', sw: 0.5, layer: 'CIHAZ' });
          T(cx, cy - r - 6, 'Aspiratör', { size: 4.5, c: '#5B6168' });
        } else if (ht === 'egik') {   // eğik cam panel + baca
          R(p.x0 + 2, s.upZ, w - 4, 3, { s: '#24272B', f: '#C9CDD2', sw: 0.6, layer: 'CIHAZ' });
          P.push({ t: 'poly', pts: [[p.x0 + 2, s.upZ + 3], [p.x1 - 2, s.upZ + 3], [p.x1 - 2, s.upZ + 34], [p.x0 + 2, s.upZ + 34]], s: '#24272B', f: '#2B2D31', sw: 0.7, layer: 'CIHAZ' });
          Ln(p.x0 + 6, s.upZ + 30, p.x0 + 16, s.upZ + 8, { s: '#6E747B', sw: 0.6, layer: 'CIHAZ' });
          R(cx - 13, s.upZ + 34, 26, s.upZ + s.upH - s.upZ - 34, { s: '#24272B', f: '#D9DCDF', sw: 0.7, layer: 'CIHAZ' });
        } else {   // duvar tipi bacalı (T)
          const hy = s.upZ + 5;
          P.push({ t: 'poly', pts: [[p.x0, hy], [p.x1, hy], [p.x1 - w * 0.2, hy + 14], [p.x0 + w * 0.2, hy + 14]], s: '#24272B', f: '#C9CDD2', sw: 0.7, layer: 'CIHAZ' });
          R(cx - 15, hy + 14, 30, s.upZ + s.upH - hy - 14, { s: '#24272B', f: '#D9DCDF', sw: 0.7, layer: 'CIHAZ' });
        }
        T(cx, s.upZ + s.upH + 6, 'Ü' + (i + 1), { size: 6, c: '#EB591F', bold: true });
        return;
      }
      R(p.x0, s.upZ, w, s.upH, { s: '#24272B', f: t.filler ? front : body, sw: 0.8, layer: 'GOVDE' });
      const inn = modInner(p.m, s, 'kitchen');
      const showIn = interior && shelfable(p.m, 'kitchen', s);
      if ((t.open || showIn) && !t.filler) { if (showIn) R(p.x0 + s.t, inn.y, w - 2 * s.t, inn.h, { s: '#24272B', f: shade(body, -10), sw: 0.4, layer: 'GOVDE' }); shelfPos(p.m, s, 'kitchen').forEach(v => Ln(p.x0 + s.t, inn.y + v, p.x1 - s.t, inn.y + v, { s: '#6E747B', sw: 0.8, layer: 'RAF' })); }
      if (!showIn) frontsOf(p.m, 'kitchen', s, p.x0).forEach(f => drawFront(f, p.m));
      T(p.x0 + w / 2, s.upZ + s.upH + 6, 'Ü' + (i + 1), { size: 6, c: '#EB591F', bold: true });
    });
    if (cab.led?.on) {   // üst dolap altı LED: şerit + tezgaha düşen ışık
      const lc = pick(LED_TEMPS, cab.led.temp || '3000').c;
      const runs = []; let run = null;   // ardışık LED'li üst dolaplar tek ışık alanı
      for (const p of up) {
        const t = MT[p.m.type]; if (t.empty || t.hood) { run = null; continue; }
        if (run && Math.abs(run[1] - p.x0) < 0.1) run[1] = p.x1; else runs.push(run = [p.x0, p.x1]);
        R(p.x0 + 2, s.upZ - 0.9, p.x1 - p.x0 - 4, 0.9, { s: '#E0A41C', f: '#FFC83D', sw: 0.3, layer: 'LED' });
      }
      for (const [a, b] of runs) P.splice(bgEnd, 0, { t: 'poly', pts: [[a + 1, s.upZ], [b - 1, s.upZ], [b + 3, cY + s.topT], [a - 3, cY + s.topT]], f: lc, op: 0.4, noDxf: true, layer: 'LED' });
      const fu = up.find(p => !MT[p.m.type].empty && !MT[p.m.type].hood);
      if (fu) T(fu.x0 + 10, s.upZ - 4, 'LED', { size: 4, c: '#B07A00', bold: true });
    }
    dimChain(P, base, -14, s);
    dimChain(P, up.filter(p => !MT[p.m.type].empty || true), s.upZ + s.upH + 16, s, true);
    // yükseklik ölçüleri
    const hz = [[0, s.plinth], [s.plinth, cY + s.topT], [cY + s.topT, s.upZ], [s.upZ, s.upZ + s.upH]];
    for (const [a, b] of hz) { Ln(-22, a, -22, b, { s: '#7A8594', sw: 0.4, layer: 'OLCU' }); Ln(-25, b, -19, b, { s: '#7A8594', sw: 0.4, layer: 'OLCU' }); T(-26, (a + b) / 2, fmt(b - a), { size: 5.5, rot: -90, c: '#7A8594' }); }
    Ln(-25, 0, -19, 0, { s: '#7A8594', sw: 0.4, layer: 'OLCU' });
  }
  // kulp / açma detayı (büyütülmüş kesit), çizimin sağında
  const dY = kind === 'wardrobe' ? Math.min(s.H - 40, 170) : s.plinth + s.carcH;
  handleDetail(P, L + 48, dY, handle, hcol, front, kind);
  // toplam
  Ln(0, -32, L, -32, { s: '#24272B', sw: 0.5, layer: 'OLCU' }); Ln(0, -35, 0, -29, { s: '#24272B', sw: 0.5, layer: 'OLCU' }); Ln(L, -35, L, -29, { s: '#24272B', sw: 0.5, layer: 'OLCU' });
  T(L / 2, -38, `Toplam ${fmt(L)} cm`, { size: 7, bold: true });
  return { P, hits, L, xr: L + 92, H: Math.max(wallH, kind === 'wardrobe' ? s.H : s.tallH) };
}
/* kulp detayı: kapağın tutma kenarından düşey kesit, 4 kat büyütülmüş (ox, oy: kapak üst kenarının ön yüzü) */
function handleDetail(P, ox, oy, handle, hcol, front, kind) {
  const k = 4, d = 1.8 * k, R = (x, y, w, h, o = {}) => P.push({ t: 'rect', x, y, w, h, ...o }), Ln = (x1, y1, x2, y2, o = {}) => P.push({ t: 'line', x1, y1, x2, y2, ...o }), T = (x, y, txt, o = {}) => P.push({ t: 'text', x, y, txt, ...o });
  const name = (HANDLES.find(h => h.k === handle) || HANDLES[0]).t, L0 = 'DETAY', al = { s: '#4B5159', f: hcol, sw: 0.4, layer: L0 };
  const bx = ox - 26, by = oy - 72;
  R(bx, by, 70, 114, { s: '#C9CDD2', sw: 0.4, dash: true, layer: L0 });
  T(bx + 35, by + 108, 'KULP DETAYI', { size: 5, bold: true });
  T(bx + 35, by + 102, name, { size: 3.8, c: '#4B5159' });
  T(bx + 35, by + 4, 'Düşey kesit · 4 kat büyütülmüş', { size: 3, c: '#7A8594' });
  // kapak kesiti (arka yüz solda, ön yüz sağda); gizli kulpta üst-arka köşe frezeli
  const dx = ox - d;
  if (handle === 'gizli') P.push({ t: 'poly', pts: [[dx, oy - 44], [ox, oy - 44], [ox, oy], [dx + d * 0.45, oy], [dx + d * 0.45, oy - 8], [dx, oy - 13]], s: '#24272B', f: front, sw: 0.6, layer: L0 });
  else R(dx, oy - 44, d, 44, { s: '#24272B', f: front, sw: 0.6, layer: L0 });
  T(dx - 7, oy - 30, '18', { size: 3.2, c: '#7A8594', rot: -90 });
  const note = (t1, t2) => { T(bx + 35, by + 17, t1, { size: 3.3, c: '#24272B' }); if (t2) T(bx + 35, by + 11, t2, { size: 3, c: '#7A8594' }); };
  const ctr = kind !== 'wardrobe';
  if (ctr && (handle === 'gola' || handle === 'j' || handle === 'gizli' || handle === 'kenar')) { R(dx - 14, oy + 13, 34, 7, { s: '#24272B', f: '#E9E6E1', sw: 0.5, layer: L0 }); T(dx + 3, oy + 16.5, 'tezgah', { size: 2.6, c: '#7A8594' }); }   // tezgah (ölçeksiz)
  if (handle === 'cubuk') { R(ox, oy - 12, 12, 2.4, al); R(ox, oy - 36, 12, 2.4, al); R(ox + 10, oy - 38, 3.2, 28.4, al); note('Çubuk kulp · 128 mm aks', 'kapaktan 30 mm çıkıntı, vidalı'); }
  else if (handle === 'dugme') { R(ox, oy - 14, 7, 3, al); R(ox + 6, oy - 19, 4, 13, al); note('Düğme kulp · Ø25 mm', 'tek vida, kapaktan 28 mm'); }
  else if (handle === 'kenar') { R(dx, oy, d + 3.2, 1.6, al); R(ox + 1.6, oy - 6, 1.6, 7.6, al); note('Kenar (tırnak) kulp · 40–100 mm', 'kapak üst kenarına vidalı alüminyum'); }
  else if (handle === 'j') { P.push({ t: 'poly', pts: [[dx, oy], [ox + 1.2, oy], [ox + 1.2, oy + 10], [dx + 2.4, oy + 10], [dx + 2.4, oy + 8.8], [ox, oy + 8.8], [ox, oy + 1.2], [dx, oy + 1.2]], ...al }); note('J profil · 25 mm, kapak boyunca', 'parmak profilin arkasından kavrar'); }
  else if (handle === 'gizli') { Ln(dx + d * 0.45, oy - 8, dx + d * 0.45 + 10, oy + 2, { s: '#EB591F', sw: 0.5, layer: L0 }); note('Gizli kulp · kanal freze', 'kapak üst-arka kenarı, 8 mm derinlik'); }
  else if (handle === 'gola') { P.push({ t: 'poly', pts: [[dx - 4, oy + 1], [dx - 4, oy + 12], [ox + 1, oy + 12], [ox + 1, oy + 10.8], [dx - 2.8, oy + 10.8], [dx - 2.8, oy + 2.2], [ox - 2, oy + 2.2], [ox - 2, oy + 1]], ...al }); note('Gola C profil (gövdeye)', 'kapak üstünde ~30 mm parmak boşluğu'); }
  else { R(dx - 8, oy - 24, 8, 5, { s: '#4B5159', f: '#C9CDD2', sw: 0.4, layer: L0 }); Ln(ox + 3, oy - 21.5, ox + 12, oy - 21.5, { s: '#EB591F', sw: 0.5, layer: L0 }); note('Tak-aç (itmeli) mekanizma', 'kapağa basınca açılır, kulpsuz'); }
}
const fmt = v => (Math.round(v * 10) / 10).toString().replace('.', ',');
function dimChain(P, lay, y, s, above = false) {
  for (const p of lay) {
    P.push({ t: 'line', x1: p.x0, y1: y, x2: p.x1, y2: y, s: '#7A8594', sw: 0.4, layer: 'OLCU' });
    P.push({ t: 'line', x1: p.x0, y1: y - 3, x2: p.x0, y2: y + 3, s: '#7A8594', sw: 0.4, layer: 'OLCU' });
    P.push({ t: 'line', x1: p.x1, y1: y - 3, x2: p.x1, y2: y + 3, s: '#7A8594', sw: 0.4, layer: 'OLCU' });
    if (p.x1 - p.x0 >= 8) P.push({ t: 'text', x: (p.x0 + p.x1) / 2, y: y + (above ? 3 : -6), txt: fmt(p.x1 - p.x0), size: 5.5, c: '#4B5159' });
  }
}
function shade(hex, d) {
  const n = parseInt(hex.slice(1), 16), c = v => Math.max(0, Math.min(255, v + d));
  return '#' + [c(n >> 16), c((n >> 8) & 255), c(n & 255)].map(v => v.toString(16).padStart(2, '0')).join('');
}

/* ilkellerden SVG (y yukarı → SVG'de çevrilir) */
export function elevationSvg(E, { sel = null, pad = 50, standalone = false, maxW = 0 } = {}) {
  const x0 = -45, x1 = (E.xr || E.L) + 25, y0 = -50, y1 = E.H + 30;
  const W = x1 - x0, H = y1 - y0, Y = y => y1 - y + y0;   // y'yi çevir
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let o = '';
  for (const p of E.P) {
    const st = `stroke="${p.s || 'none'}" stroke-width="${p.sw || 0.5}" fill="${p.f || 'none'}"${p.op ? ` fill-opacity="${p.op}"` : ''}${p.dash ? ' stroke-dasharray="3 2"' : ''}`;
    if (p.t === 'rect') o += `<rect x="${p.x}" y="${Y(p.y + p.h)}" width="${Math.max(0, p.w)}" height="${Math.max(0, p.h)}" ${st}/>`;
    else if (p.t === 'line') o += `<line x1="${p.x1}" y1="${Y(p.y1)}" x2="${p.x2}" y2="${Y(p.y2)}" ${st} stroke-linecap="round"/>`;
    else if (p.t === 'circle') o += `<circle cx="${p.x}" cy="${Y(p.y)}" r="${p.r}" ${st}/>`;
    else if (p.t === 'poly') o += `<polygon points="${p.pts.map(([x, y]) => `${x},${Y(y)}`).join(' ')}" ${st}/>`;
    else if (p.t === 'text') o += `<text x="${p.x}" y="${Y(p.y)}" font-size="${p.size || 6}" fill="${p.c || '#24272B'}" text-anchor="middle" dominant-baseline="middle" font-family="Inter,Arial,sans-serif"${p.bold ? ' font-weight="700"' : ''}${p.rot ? ` transform="rotate(${p.rot} ${p.x} ${Y(p.y)})"` : ''}>${esc(p.txt)}</text>`;
  }
  if (sel) for (const h of E.hits) if (h.id === sel) o += `<rect x="${h.x}" y="${Y(h.y + h.h)}" width="${h.w}" height="${h.h}" fill="rgba(235,89,31,.12)" stroke="#EB591F" stroke-width="1.6"/>`;
  const hit = standalone ? '' : E.hits.map(h => `<rect class="cd-hit" data-mid="${h.id}" x="${h.x}" y="${Y(h.y + h.h)}" width="${h.w}" height="${h.h}" fill="transparent"/>`).join('');
  const size = maxW ? `width="${maxW}" height="${Math.round(maxW * H / W)}"` : '';
  // bağımsız (PDF / görsel) çıktıda görünüm kutusu 0,0'dan başlar: bazı çiziciler (html2canvas) negatif başlangıçlı viewBox'ı kırpıyor
  if (standalone) return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" ${size} preserveAspectRatio="xMidYMid meet"><rect width="${W}" height="${H}" fill="#fff"/><g transform="translate(${-x0} ${-y0})">${o}</g></svg>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x0} ${y0} ${W} ${H}" ${size} preserveAspectRatio="xMidYMid meet"><rect x="${x0}" y="${y0}" width="${W}" height="${H}" fill="#fff"/>${o}${hit}</svg>`;
}

/* DXF (R12) — ön görünüş; birim mm, AutoCAD'de doğrudan açılır */
export function elevationDxf(E) {
  const tr = s => String(s).replace(/[ğĞ]/g, c => c === 'ğ' ? 'g' : 'G').replace(/[şŞ]/g, c => c === 'ş' ? 's' : 'S').replace(/[ıİ]/g, c => c === 'ı' ? 'i' : 'I').replace(/[çÇ]/g, c => c === 'ç' ? 'c' : 'C').replace(/[öÖ]/g, c => c === 'ö' ? 'o' : 'O').replace(/[üÜ]/g, c => c === 'ü' ? 'u' : 'U');
  const k = 10, out = ['0', 'SECTION', '2', 'ENTITIES'];
  const line = (L, x1, y1, x2, y2) => out.push('0', 'LINE', '8', L, '10', (x1 * k).toFixed(1), '20', (y1 * k).toFixed(1), '30', '0', '11', (x2 * k).toFixed(1), '21', (y2 * k).toFixed(1), '31', '0');
  for (const p of E.P) {
    if (p.noDxf) continue;
    const L = p.layer || '0';
    if (p.t === 'rect') { line(L, p.x, p.y, p.x + p.w, p.y); line(L, p.x + p.w, p.y, p.x + p.w, p.y + p.h); line(L, p.x + p.w, p.y + p.h, p.x, p.y + p.h); line(L, p.x, p.y + p.h, p.x, p.y); }
    else if (p.t === 'line') line(L, p.x1, p.y1, p.x2, p.y2);
    else if (p.t === 'poly') p.pts.forEach((q, i) => { const r = p.pts[(i + 1) % p.pts.length]; line(L, q[0], q[1], r[0], r[1]); });
    else if (p.t === 'circle') out.push('0', 'CIRCLE', '8', L, '10', (p.x * k).toFixed(1), '20', (p.y * k).toFixed(1), '30', '0', '40', (p.r * k).toFixed(1));
    else if (p.t === 'text') out.push('0', 'TEXT', '8', 'YAZI', '10', (p.x * k).toFixed(1), '20', (p.y * k).toFixed(1), '30', '0', '40', ((p.size || 6) * k * 0.8).toFixed(1), '1', tr(p.txt), '50', String(p.rot || 0), '72', '1', '11', (p.x * k).toFixed(1), '21', (p.y * k).toFixed(1), '31', '0');
  }
  out.push('0', 'ENDSEC', '0', 'EOF');
  return out.join('\r\n');
}

/* ── rölöve planında 2D sembol (nesnenin yerel koordinatlarında) ── */
export function planSymbol(it, px) {
  const cab = it.cab; if (!cab) return '';
  const s = cab.s, W = it.w, D = it.d, x0 = -W / 2, yb = -D / 2;
  const sw = px(1), thin = px(0.7);
  let o = '';
  if (cab.kind === 'wardrobe') {
    // modül başına derinlik: cihaz dolapları (çamaşır / termosifon) daha derin olabilir
    for (const p of layoutRow(cab.ward)) {
      const t = MT[p.m.type], X = x0 + p.x0, w = p.x1 - p.x0, dm = modD(p.m, s);
      o += `<rect x="${X}" y="${yb}" width="${w}" height="${dm + s.frontT}" fill="#F2F0EC" fill-opacity=".85" stroke="#24272B" stroke-width="${sw}"/>`;
      o += `<line x1="${X}" y1="${yb + dm}" x2="${X + w}" y2="${yb + dm}" stroke="#24272B" stroke-width="${thin}"/>`;
      if (t.rails) o += `<line x1="${X + 4}" y1="${yb + dm / 2}" x2="${X + w - 4}" y2="${yb + dm / 2}" stroke="#7A8594" stroke-width="${thin}" stroke-dasharray="${px(4)} ${px(3)}"/>`;
      if (t.empty) o += `<line x1="${X}" y1="${yb}" x2="${X + w}" y2="${yb + dm}" stroke="#9AA1A9" stroke-width="${thin}"/>`;
      for (const ap of applLayout(p.m, s)) {
        const cx = X + w / 2;
        o += ap.k === 'boiler' ? `<circle cx="${cx}" cy="${yb + 1 + ap.w / 2}" r="${ap.w / 2}" fill="none" stroke="#5B6168" stroke-width="${thin}" stroke-dasharray="${px(3)} ${px(2)}"/>`
          : `<rect x="${cx - ap.w / 2}" y="${yb + 2}" width="${ap.w}" height="${Math.min(58, dm - 3)}" fill="none" stroke="#5B6168" stroke-width="${thin}"/><text x="${cx}" y="${yb + dm / 2 + 3}" font-size="${Math.min(9, w / 6)}" text-anchor="middle" fill="#5B6168" font-family="Inter,Arial">${ap.ab}</text>`;
      }
    }
    const dmax = Math.max(...layoutRow(cab.ward).map(p => modD(p.m, s)), s.D);
    if (s.doors === 'surgulu') o += `<line x1="${x0}" y1="${yb + dmax + 1}" x2="${x0 + W * 0.55}" y2="${yb + dmax + 1}" stroke="#24272B" stroke-width="${thin}"/><line x1="${x0 + W * 0.45}" y1="${yb + dmax - 0.5}" x2="${x0 + W}" y2="${yb + dmax - 0.5}" stroke="#24272B" stroke-width="${thin}"/>`;
    return o;
  }
  const front = pick(FRONTS, cab.mat.front).c, top = pick(TOPS, cab.mat.top).c;
  const base = layoutRow(cab.base);
  // tezgah
  let seg = null; const segs = [];
  for (const p of base) { const t = MT[p.m.type]; if (t.tall || t.empty) { if (seg) segs.push(seg); seg = null; continue; } seg = seg ? [seg[0], p.x1] : [p.x0, p.x1]; }
  if (seg) segs.push(seg);
  for (const [a, b] of segs) o += `<rect x="${x0 + a}" y="${yb}" width="${b - a}" height="${s.topD}" fill="${top}" fill-opacity=".8" stroke="#24272B" stroke-width="${sw}"/>`;
  for (const p of base) {
    const t = MT[p.m.type], X = x0 + p.x0, w = p.x1 - p.x0, dd = s.baseD + s.frontT;
    if (t.tall) { o += `<rect x="${X}" y="${yb}" width="${w}" height="${dd}" fill="${t.empty ? '#fff' : front}" fill-opacity=".85" stroke="#24272B" stroke-width="${sw}"/><path d="M${X} ${yb}L${X + w} ${yb + dd}M${X + w} ${yb}L${X} ${yb + dd}" stroke="#24272B" stroke-width="${thin}"/>`; if (t.fridge || t.fridgeSolo) o += `<text x="${X + w / 2}" y="${yb + dd / 2}" font-size="${Math.min(10, w / 4)}" text-anchor="middle" dominant-baseline="middle" fill="#24272B" transform="rotate(${it.rot > 90 && it.rot <= 270 ? 180 : 0} ${X + w / 2} ${yb + dd / 2})">BZ</text>`; continue; }
    if (t.empty) continue;
    o += `<line x1="${X}" y1="${yb + s.topD - 1}" x2="${X}" y2="${yb + s.topD + 0}" stroke="#24272B" stroke-width="${thin}"/>`;
    o += `<line x1="${X}" y1="${yb + s.baseD}" x2="${X + w}" y2="${yb + s.baseD}" stroke="#24272B" stroke-width="${thin}" stroke-dasharray="${px(3)} ${px(2)}"/>`;
    if (p.x0 > 0) o += `<line x1="${X}" y1="${yb + s.baseD}" x2="${X}" y2="${yb + s.topD}" stroke="#24272B" stroke-width="${thin}"/>`;
    if (t.sink) o += `<rect x="${X + w / 2 - Math.min(22, w / 2 - 6)}" y="${yb + 10}" width="${Math.min(44, w - 12)}" height="38" rx="5" fill="#E9EBED" stroke="#24272B" stroke-width="${thin}"/><circle cx="${X + w / 2}" cy="${yb + 29}" r="2.5" fill="none" stroke="#24272B" stroke-width="${thin}"/>`;
    if (t.hob) for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) o += `<circle cx="${X + w / 2 + a * w / 4.5}" cy="${yb + s.topD / 2 + b * 11}" r="${Math.min(9, w / 7)}" fill="none" stroke="#24272B" stroke-width="${thin}"/>`;
    if (t.appliance) o += `<text x="${X + w / 2}" y="${yb + s.topD / 2}" font-size="${Math.min(10, w / 4)}" text-anchor="middle" dominant-baseline="middle" fill="#7A8594">${t.appliance}</text>`;
  }
  // üst dolaplar: kesik çizgi
  for (const p of layoutRow(cab.upper)) {
    const t = MT[p.m.type]; if (t.empty) continue;
    o += `<rect x="${x0 + p.x0}" y="${yb}" width="${p.x1 - p.x0}" height="${s.upD + s.frontT}" fill="none" stroke="#EB591F" stroke-width="${thin}" stroke-dasharray="${px(5)} ${px(3)}"/>`;
  }
  return o;
}

/* ── 3D model (three.js); g: nesne grubu (merkez, arka -z), mat(renk, pürüzlülük, metal) ── */
export function build3D(THREE, g, it, mat) {
  const cab = it.cab; if (!cab) return;
  const s = cab.s, M = v => v / 100, W = it.w, D = it.d;
  const front = mat(pick(FRONTS, cab.mat.front).c, cab.mat.front === 'beyaz' || cab.mat.front === 'krem' ? 0.35 : 0.55);
  const body = mat(pick(BODIES, cab.mat.body).c, 0.7), topM = mat(pick(TOPS, cab.mat.top).c, cab.mat.top === 'mese' ? 0.6 : 0.25);
  const plinthM = mat('#3A3D42', 0.8), steel = mat('#C9CDD2', 0.25, 0.85), black = mat('#141518', 0.15, 0.3), glass = mat('#DCEFF2', 0.05), hcol = mat(pick(HANDLE_COLORS, cab.mat.hcolor).c, 0.3, 0.9);
  const box = (x0, y0, z0, w, h, d, m) => {   // cm, sol-alt-arka köşe; yerel x 0..W
    if (w <= 0 || h <= 0 || d <= 0) return;
    const b = new THREE.Mesh(new THREE.BoxGeometry(M(w), M(h), M(d)), m);
    b.position.set(M(x0 - W / 2 + w / 2), M(y0 + h / 2), M(z0 - D / 2 + d / 2)); b.castShadow = b.receiveShadow = true; g.add(b); return b;
  };
  const handle = cab.mat.handle, groove = mat(shade(pick(FRONTS, cab.mat.front).c, -55), 0.8);
  const drawFront = (f, zFront, kind) => {
    if (f.k === 'visor') { box(f.x, f.y, zFront, f.w, f.h, s.frontT + 1, steel); return; }
    const isApp = f.k === 'oven' || f.k === 'micro';
    box(f.x, f.y, zFront, f.w, f.h, s.frontT, isApp ? black : f.glass ? glass : front);
    if (isApp) { box(f.x + 4, f.y + f.h - 8, zFront + s.frontT, f.w - 8, 2, 1, steel); return; }
    if (handle === 'takac' || f.k === 'panel' || f.k === 'fixed' || f.noHandle) return;
    const upper = kind === 'kitchen' && f.y > s.plinth + s.carcH + 10;
    if (handle === 'gola') { if (!upper && f.k !== 'lift' && f.y + f.h < 110) box(f.x, f.y + f.h - 2.5, zFront + s.frontT - 0.6, f.w, 2.5, 0.7, hcol); return; }
    const z = zFront + s.frontT, top = gripTop(f), vEdge = kind === 'wardrobe' && f.k === 'door', oe = f.hinge === 'L' ? f.x + f.w : f.x;
    if (handle === 'j') { if (vEdge) box(f.hinge === 'L' ? oe - 1.2 : oe, f.y, 1.2, f.h, 2.4, hcol); else box(f.x, top ? f.y + f.h - 0.4 : f.y - 0.8, z - 2, f.w, 1.2, 2.6, hcol); return; }
    if (handle === 'gizli') { if (vEdge) box(f.hinge === 'L' ? oe - 2 : oe, f.y, 2, f.h, 0.08, groove); else box(f.x, top ? f.y + f.h - 2 : f.y, z, f.w, 2, 0.08, groove); return; }
    if (handle === 'kenar') { const kw = Math.min(10, f.w / 3), kx = f.k === 'door' ? (f.hinge === 'L' ? f.x + f.w - kw - 3 : f.x + 3) : f.x + f.w / 2 - kw / 2; if (vEdge) box(f.hinge === 'L' ? oe - 1 : oe, f.y + f.h * 0.48 - 5, 1, 10, 2.2, hcol); else box(kx, top ? f.y + f.h - 0.2 : f.y - 0.8, z - 2, kw, 1, 2.4, hcol); return; }
    if (handle === 'dugme') { const c = new THREE.Mesh(new THREE.CylinderGeometry(M(1.4), M(1.4), M(2.5), 12), hcol); c.rotation.x = Math.PI / 2; const hx = f.k === 'door' ? (f.hinge === 'L' ? f.x + f.w - 4 : f.x + 4) : f.x + f.w / 2, hy = f.k === 'door' ? (upper ? f.y + 8 : f.y + f.h - 8) : f.y + f.h - 5; c.position.set(M(hx - W / 2), M(hy), M(z - D / 2 + 1.2)); g.add(c); return; }
    if (f.k === 'drawer' || f.k === 'lift') { const hw = Math.min(20, f.w * 0.5); box(f.x + f.w / 2 - hw / 2, f.k === 'lift' ? f.y + 3 : f.y + f.h - 6, z, hw, 1.2, 2.2, hcol); }
    else { const hl = kind === 'wardrobe' ? 40 : 14, hx = f.hinge === 'L' ? f.x + f.w - 5 : f.x + 3.8; const hy = kind === 'wardrobe' ? f.y + f.h * 0.48 - hl / 2 : top ? f.y + f.h - 4 - hl : f.y + 3; box(hx, hy, z, 1.2, hl, 2.2, hcol); }
  };
  /* kapaksız (açık) giysi dolabı / vestiyer modülü: yanlar, alt / üst, arkalık ve iç donanım görünür */
  const openWard = (p, t, w) => {
    const d = modD(p.m, s), H = s.H, y0 = modY0(p.m, s), ih = H - y0 - 2 * s.t, iy = y0 + s.t, x0 = p.x0, tt = s.t;
    const metal = mat('#9DA3A8', 0.3, 0.9), dark = mat('#3A3F45', 0.4, 0.6), wood = mat('#B08463', 0.6), cush = mat('#C7B39E', 0.95), mirror = mat('#DCEFF2', 0.02, 0.6);
    box(x0, y0, 0, tt, H - y0, d, body); box(x0 + w - tt, y0, 0, tt, H - y0, d, body);
    box(x0 + tt, y0, 0, w - 2 * tt, tt, d, body); box(x0 + tt, H - tt, 0, w - 2 * tt, tt, d, body);
    box(x0 + tt, y0 + tt, 0, w - 2 * tt, ih, 0.8, body);   // arkalık
    shelfPos(p.m, s, 'wardrobe').forEach(v => box(x0 + tt, iy + v, 0, w - 2 * tt, tt, d - 1, body));
    (t.rails || []).forEach(f => box(x0 + tt, iy + ih * f - 5, d / 2, w - 2 * tt, 2.2, 2.2, metal));
    (t.drawers || []).reduce((y, f) => { const dh = ih * f; box(x0 + tt + 0.3, y + 0.3, d - s.frontT, w - 2 * tt - 0.6, dh - 0.6, s.frontT, front); return y + dh; }, iy);
    if (t.panel === 'lamel') for (let x = x0 + tt + 3; x < x0 + w - tt - 2; x += 6) box(x, iy + ih * 0.42, 0.8, 3.4, ih * 0.44, 2, wood);
    if (t.panel === 'duz') box(x0 + tt + 2, iy + ih * 0.44, 0.8, w - 2 * tt - 4, ih * 0.4, 1.8, front);
    (t.hooks || []).forEach(f => { const n = hookCount(w - 2 * tt); for (let k = 0; k < n; k++) { const hx = x0 + tt + (w - 2 * tt) * (k + 0.5) / n; box(hx - 0.6, iy + ih * f - 6, 2.5, 1.2, 6, 1.2, dark); box(hx - 0.6, iy + ih * f - 6, 2.5, 1.2, 1.2, 6, dark); } });
    if (t.bench) { box(x0 + tt, t.bench - 4, 0, w - 2 * tt, 4, d, body); box(x0 + tt + 1, t.bench, 2, w - 2 * tt - 2, 5, d - 4, cush); }
    (t.shoeOpen || []).forEach(f => box(x0 + tt, iy + ih * f, 0, w - 2 * tt, tt, d - 2, body));
    (t.shoe || []).forEach(f => box(x0 + tt, iy + ih * f, 0, w - 2 * tt, tt, d - 2, body));
    if (t.mirror) box(x0 + tt + 3, iy + 8, 1, w - 2 * tt - 6, ih - 16, 0.6, mirror);
    appl3D(p, w, d);
  };
  /* çamaşır / kurutma makinesi ve termosifon (açık modülde görünür) */
  const appl3D = (p, w, d) => {
    const white = mat('#F4F5F6', 0.35), grey = mat('#9AA1A9', 0.4, 0.4), glassD = mat('#2E3A40', 0.1, 0.3);
    for (const a of applLayout(p.m, s)) {
      const ax = p.x0 + (w - a.w) / 2;
      if (a.k === 'boiler') {
        const c = new THREE.Mesh(new THREE.CylinderGeometry(M(a.w / 2), M(a.w / 2), M(a.h), 28), white);
        c.position.set(M(ax + a.w / 2 - W / 2), M(a.y + a.h / 2), M(1 + a.w / 2 - D / 2)); c.castShadow = true; g.add(c);
      } else {
        box(ax, a.y, 2, a.w, a.h, Math.min(58, d - 3), white); box(ax + 3, a.y + a.h - 12, 2 + Math.min(58, d - 3), a.w - 6, 8, 0.5, grey);
        const dr = new THREE.Mesh(new THREE.CylinderGeometry(M(17), M(17), M(1), 28), glassD); dr.rotation.x = Math.PI / 2;
        dr.position.set(M(ax + a.w / 2 - W / 2), M(a.y + a.h * 0.42), M(2.5 + Math.min(58, d - 3) - D / 2)); g.add(dr);
      }
    }
  };
  if (cab.kind === 'wardrobe') {
    const d = s.D, H = s.H;
    for (const p of layoutRow(cab.ward)) {
      const t = MT[p.m.type], w = p.x1 - p.x0; if (t.empty) continue;
      const dm = modD(p.m, s), y0 = modY0(p.m, s);
      if (!t.floor) box(p.x0, 0, 3, w, s.plinth, dm - 5, plinthM);   // makine dolabında baza yok
      if (isOpenMod(p.m, s)) { openWard(p, t, w); continue; }
      box(p.x0, y0, 0, w, H - y0, dm, body);
      if (s.doors !== 'surgulu') frontsOf(p.m, 'wardrobe', s, p.x0).forEach(f => drawFront(f, dm, 'wardrobe'));
    }
    if (s.doors === 'surgulu') {
      const n = Math.max(2, Math.ceil(W / 120)), pw = W / n + 2;
      for (let i = 0; i < n; i++) { const x = Math.min(W - pw, i * (W / n) - (i ? 1 : 0)); box(x, s.plinth, d + (i % 2 ? 0 : 2.2), pw, H - s.plinth, 2, i % 2 ? front : mat(shade(pick(FRONTS, cab.mat.front).c, -8), 0.4)); }
    }
    return;
  }
  const base = layoutRow(cab.base), cY = s.plinth + s.carcH;
  for (const p of base) {
    const t = MT[p.m.type], w = p.x1 - p.x0; if (t.empty) continue;
    const H = t.tall ? s.tallH : cY;
    box(p.x0, 0, 0, w, s.plinth, s.baseD - 5, plinthM);
    box(p.x0, s.plinth, 0, w, H - s.plinth, s.baseD, t.filler ? front : body);
    frontsOf(p.m, 'kitchen', s, p.x0).forEach(f => drawFront(f, s.baseD, 'kitchen'));
    if (t.sink) {
      box(p.x0 + w / 2 - 22, cY + s.topT - 0.4, 12, 44, 0.6, 38, steel);
      const fa = new THREE.Mesh(new THREE.CylinderGeometry(M(1.3), M(1.3), M(30), 10), steel); fa.position.set(M(p.x0 + w / 2 - W / 2), M(cY + s.topT + 15), M(6 - D / 2)); g.add(fa);
      box(p.x0 + w / 2 - 1.3, cY + s.topT + 28, 6, 2.6, 2.6, 18, steel);
    }
    if (t.hob) { box(p.x0 + 4, cY + s.topT, 6, w - 8, 0.6, 50, black); }
    if (t.fridge) { const G = fridgeGeo(p.m, s); if (G.top === 'acik') { box(p.x0 + s.t, G.nicheTop, 0, w - 2 * s.t, s.t, s.baseD, body); shelfPos(p.m, s, 'kitchen').forEach(v => box(p.x0 + s.t, G.topY + v, 0, w - 2 * s.t, s.t, s.baseD - 1, body)); } }
  }
  // tezgah
  let seg = null; const segs = [];
  for (const p of base) { const t = MT[p.m.type]; if (t.tall || t.empty) { if (seg) segs.push(seg); seg = null; continue; } seg = seg ? [seg[0], p.x1] : [p.x0, p.x1]; }
  if (seg) segs.push(seg);
  for (const [a, b] of segs) box(a, cY, 0, b - a, s.topT, s.topD, topM);
  // tezgah arası (backsplash) hafif şerit yok; üst dolaplar
  for (const p of layoutRow(cab.upper)) {
    const t = MT[p.m.type], w = p.x1 - p.x0; if (t.empty) continue;
    if (t.hood && !hoodCab(p.m)) {
      const ht = hoodOf(p.m);
      if (ht === 'aspirator') { const c = new THREE.Mesh(new THREE.CylinderGeometry(M(Math.min(15, w / 2.6)), M(Math.min(15, w / 2.6)), M(4), 28), mat('#E3E6E9', 0.4)); c.rotation.x = Math.PI / 2; c.position.set(M(p.x0 + w / 2 - W / 2), M(s.upZ + s.upH / 2), M(2 - D / 2)); g.add(c); continue; }
      if (ht === 'egik') { const gl = new THREE.Mesh(new THREE.BoxGeometry(M(w - 4), M(36), M(1.2)), mat('#1E2023', 0.08, 0.4)); gl.rotation.x = -0.75; gl.position.set(M(p.x0 + w / 2 - W / 2), M(s.upZ + 16), M(26 - D / 2)); g.add(gl); box(p.x0 + w / 2 - 13, s.upZ + 26, 0, 26, s.upH - 26, 22, steel); continue; }
      box(p.x0, s.upZ + 4, 0, w, 6, 50, steel); box(p.x0 + w / 2 - 15, s.upZ + 10, 0, 30, s.upH - 10, 25, steel); continue;
    }
    box(p.x0, s.upZ, 0, w, s.upH, s.upD, t.filler ? front : body);
    if (t.open) { const inn = modInner(p.m, s, 'kitchen'); shelfPos(p.m, s, 'kitchen').forEach(v => box(p.x0 + s.t, inn.y + v, 0, w - 2 * s.t, s.t, s.upD, body)); }
    frontsOf(p.m, 'kitchen', s, p.x0).forEach(f => drawFront(f, s.upD, 'kitchen'));
    if (cab.led?.on && !t.hood) {   // üst dolap altı LED şerit (kendinden ışıklı)
      const lc = pick(LED_TEMPS, cab.led.temp || '3000').c;
      const led = new THREE.Mesh(new THREE.BoxGeometry(M(w - 4), M(0.6), M(1.6)), new THREE.MeshStandardMaterial({ color: lc, emissive: lc, emissiveIntensity: 2.2 }));
      led.position.set(M(p.x0 + w / 2 - W / 2), M(s.upZ - 0.3), M(s.upD - 5 - D / 2)); g.add(led);
    }
  }
}

/* ── kesim listesi ve donanım ── */
export function partsList(cab) {
  const s = cab.s, t = s.t, rows = [], hw = {}, kind = cab.kind;
  const frontName = 'Kapak · ' + pick(FRONTS, cab.mat.front).t, bodyName = 'Gövde · ' + pick(BODIES, cab.mat.body).t + ' 18 mm';
  // ops: CNC işlemleri (hinge: menteşe kase delikleri, pins: raf pimi sıraları)
  const add = (mod, part, matl, L, W, n = 1, band = '', ops = null) => { if (L > 0 && W > 0 && n > 0) rows.push({ mod, part, mat: matl, L: Math.round(L * 10), W: Math.round(W * 10), n, band, ...(ops ? { ops } : {}) }); };
  const H = (k, n) => { hw[k] = +((hw[k] || 0) + n).toFixed(2); };
  const hinges = hingeN, brand = pick(HINGE_BRANDS, cab.mat.hinge), hd = cab.mat.handle;
  const carcass = (no, w, h, d, shelves, back = true) => {
    add(no, 'Yan dikme', bodyName, h, d, 2, '1 uzun kenar', shelves ? { pins: true } : null);
    add(no, 'Alt / üst tabla', bodyName, w - 2 * t, d, 2, '1 uzun kenar');
    if (shelves) { add(no, 'Raf', bodyName, w - 2 * t - 0.2, d - 2, shelves, '1 uzun kenar'); H('Raf pimi', shelves * 4); }
    if (back) add(no, 'Arkalık', 'Arkalık · 8 mm', w - 0.4, h - 0.4, 1);
  };
  const fronts = (no, fs, kindK) => {
    for (const f of fs) {
      if (f.k === 'oven' || f.k === 'micro' || f.k === 'visor') continue;
      if (f.k === 'fixed') { add(no, 'Sabit kapak', frontName, f.h, f.w, 1, '4 kenar'); continue; }
      const grip = hd === 'gizli' && f.k !== 'panel', hg = f.k === 'door' && !f.app;   // buzdolabı kapağı cihaza kızakla bağlanır, menteşe yok
      const ops = hg || grip ? { ...(hg ? { hinge: hinges(f.h) } : {}), ...(grip ? { groove: kindK === 'wardrobe' && f.k === 'door' ? 'side' : gripTop(f) ? 'top' : 'bottom' } : {}) } : null;
      add(no, f.k === 'drawer' ? 'Çekmece önü' : f.k === 'panel' ? 'Cihaz kapağı' : f.glass ? 'Camlı kapak (çerçeve)' : 'Kapak', frontName, f.h, f.w, 1, '4 kenar', ops);
      if (hg) H(brand.h, hinges(f.h));
      if (f.app === 'fridge') H('Buzdolabı kapak bağlantı (kızak) kiti', 1);
      if (f.k === 'lift' && !f.fold) H(brand.lift, 1);
      if (f.fold === 'bot') { H(brand.fold, 1); H('Ara menteşe (katlanır kapak parçaları arası)', f.w <= 70 ? 2 : 3); }
      if (f.k === 'drawer') { H('Çekmece rayı (tam açılır, takım)', 1); const bh = Math.max(8, Math.min(18, f.h - 6)), bw = f.w - 2 * t - 2.6, bd = (kindK === 'wardrobe' ? s.D : s.baseD) - 8; add(no, 'Çekmece yanı', bodyName, bd, bh, 2, '1 uzun kenar'); add(no, 'Çekmece ön/arka', bodyName, bw - 2 * t, bh, 2); add(no, 'Çekmece tabanı', 'Arkalık · 8 mm', bw, bd, 1); }
      if (f.k !== 'panel') {
        const vE = kindK === 'wardrobe' && f.k === 'door';
        if (hd === 'takac') H('Tak-aç mekanizması', 1);
        else if (hd === 'j') H('J profil kulp (m)', (vE ? f.h : f.w) / 100);
        else if (hd === 'gizli') H('Gizli kulp kanal frezesi (m)', (vE ? f.h : f.w) / 100);
        else if (hd === 'kenar') H('Kenar (tırnak) kulp', 1);
        else if (hd !== 'gola') H(hd === 'dugme' ? 'Düğme kulp' : 'Çubuk kulp', 1);
      }
    }
  };
  let sum = { base: 0, upper: 0, tall: 0, top: 0, ward: 0, frontM2: 0 };
  if (kind === 'wardrobe') {
    const h = s.H - s.plinth;
    layoutRow(cab.ward).forEach((p, i) => {
      const m = p.m, ty = MT[m.type], no = `G${i + 1}`; if (ty.empty) return;
      const dm = modD(m, s), hm = s.H - modY0(m, s), nSh = shelfPos(m, s, 'wardrobe').length + (ty.shoe || []).length + (ty.shoeOpen || []).length;
      if (ty.floor) {   // makine dolabı: yanlar zemine iner, alt tabla ve arkalık yok (makine zeminde, tesisat erişimi)
        add(no, 'Yan dikme', bodyName, hm, dm, 2, '1 uzun kenar', nSh ? { pins: true } : null);
        add(no, 'Üst tabla', bodyName, m.w - 2 * t, dm, 1, '1 uzun kenar');
        if (nSh) { add(no, 'Raf', bodyName, m.w - 2 * t - 0.2, dm - 2, nSh, '1 uzun kenar'); H('Raf pimi', nSh * 4); }
      } else carcass(no, m.w, h, dm, nSh, !ty.boiler);   // termosifon dolabında arkalık yok (duvara montaj, tesisat)
      (ty.appl || []).forEach(k => { if (k === 'washer') { H('Çamaşır makinesi su / gider bağlantısı (ankastre musluk + sifon)', 1); H('Topraklı priz (etanj)', 1); } if (k === 'dryer') H('Kurutma makinesi üst üste bağlantı kiti', 1); });
      if (ty.boiler) { H('Termosifon askı / dübel takımı (duvara)', 1); H('Termosifon emniyet ventili gider bağlantısı', 1); H('Termosifon prizi / sigortalı hat', 1); }
      if (ty.vent && s.doors !== 'acik') H('Havalandırma menfezi (kapak üst / alt)', 2);
      (ty.rails || []).forEach(() => { H('Askı borusu (m)', +((m.w - 2 * t) / 100).toFixed(2)); H('Askı borusu taşıyıcı', 2); });
      (ty.hooks || []).forEach(() => H('Askı kancası (vestiyer)', hookCount(m.w - 2 * t)));
      if (ty.panel === 'lamel') add(no, 'Lamel çıta', 'Masif / MDF çıta 34×20 mm', (h - 2 * t) * 0.44, 3.4, Math.floor((m.w - 2 * t - 2) / 6));
      if (ty.panel === 'duz') add(no, 'Askılık panosu', frontName, (h - 2 * t) * 0.4, m.w - 2 * t - 4, 1, '4 kenar');
      if (ty.bench) { add(no, 'Oturak tablası', bodyName, m.w - 2 * t, s.D, 1, '1 uzun kenar'); H('Oturak minderi (döşemeli)', 1); }
      if (ty.mirror) H('Boy aynası (m²)', +((m.w - 2 * t - 6) * (h - 2 * t - 16) / 1e4).toFixed(2));
      (ty.drawers || []).forEach(dh => fronts(no, [{ k: 'drawer', w: m.w - 2 * t - 1, h: (h - 2 * t) * dh - 1 }], 'wardrobe'));
      if (!ty.floor) H('Ayar ayağı', 4);
      if (s.doors !== 'surgulu') fronts(no, frontsOf(m, 'wardrobe', s, p.x0), 'wardrobe');
      sum.ward += m.w / 100;
    });
    const L = rowLen(cab.ward);
    if (s.doors === 'surgulu') { const n = Math.max(2, Math.ceil(L / 120)); add('Sürgü', 'Sürgülü kapak', frontName, h - 1, L / n + 2, n, '4 kenar'); H('Sürgü ray seti (alt + üst)', 1); H('Sürgü kapak tekerlek takımı', n); }
    const bz = layoutRow(cab.ward).filter(p => !MT[p.m.type].floor && !MT[p.m.type].empty).reduce((a, p) => a + p.x1 - p.x0, 0);
    if (bz) add('Genel', 'Baza paneli', bodyName, bz, s.plinth - 0.5, 1, '1 uzun kenar');
    add('Genel', 'Üst kapama', bodyName, L, s.D, 1, '1 uzun kenar');
    sum.frontM2 = +(L * (s.H - s.plinth) / 1e4).toFixed(2);
  } else {
    const base = layoutRow(cab.base);
    base.forEach((p, i) => {
      const m = p.m, ty = MT[m.type], no = `A${i + 1}`;
      if (ty.empty) return;
      if (ty.filler) { add(no, 'Dolgu paneli', frontName, ty.tall ? s.tallH - s.plinth : s.carcH, m.w, 1, '2 uzun kenar'); sum.base += m.w / 100; return; }
      const nSh = shelfPos(m, s, 'kitchen').length;
      if (ty.tall) {
        carcass(no, m.w, s.tallH - s.plinth, s.baseD, nSh); sum.tall += 1; H('Ayar ayağı', 4);
        if (ty.fridge) {
          const G = fridgeGeo(m, s);
          if (G.topH > 0) add(no, 'Buzdolabı bölme tablası', bodyName, m.w - 2 * t, s.baseD, 1, '1 uzun kenar');
          H(`Ankastre buzdolabı · ${fmt(G.frW)} × ${fmt(G.frH)} cm · ${G.doors === 2 ? 'çift kapak (alt dondurucu)' : 'tek kapak'}`, 1);
          H('Havalandırma ızgarası (baza + üst)', 1);
        }
      }
      else {
        add(no, 'Yan dikme', bodyName, s.carcH, s.baseD, 2, '1 uzun kenar', nSh ? { pins: true } : null);
        add(no, 'Alt tabla', bodyName, m.w - 2 * t, s.baseD, 1, '1 uzun kenar');
        add(no, 'Üst kuşak', bodyName, m.w - 2 * t, 10, 2);
        if (!ty.appliance) add(no, 'Arkalık', 'Arkalık · 8 mm', m.w - 0.4, s.carcH - 0.4, 1);
        if (nSh) { add(no, 'Raf', bodyName, m.w - 2 * t - 0.2, s.baseD - 2, nSh, '1 uzun kenar'); H('Raf pimi', nSh * 4); }
        if (ty.sink) H('Evye + batarya + sifon', 1);
        if (ty.hob) H('Ankastre ocak', 1);
        if (ty.oven) H('Ankastre fırın', 1);
        if (ty.appliance === 'BM') H('Ankastre bulaşık makinesi', 1);
        if (ty.appliance === 'DF') H('Tezgah altı ankastre derin dondurucu', 1);
        H('Ayar ayağı', 4);
        sum.base += m.w / 100;
      }
      if (ty.oven && ty.tall) H('Ankastre fırın', 1);
      if (ty.micro) H('Ankastre mikrodalga', 1);
      fronts(no, frontsOf(m, 'kitchen', s, p.x0), 'kitchen');
    });
    layoutRow(cab.upper).forEach((p, i) => {
      const m = p.m, ty = MT[m.type], no = `Ü${i + 1}`;
      if (ty.empty) return;
      if (ty.hood) {
        const ht = hoodOf(m), w = fmt(m.w);
        if (ht === 'aspirator') { H(`Aspiratör (duvar tipi, Ø15) · ${w} cm modül`, 1); H('Aspiratör dış panjuru', 1); return; }
        H(ht === 'ankastre' ? `Ankastre (sürgülü) davlumbaz · ${w} cm` : ht === 'gizli' ? `Gizli (gömme) davlumbaz motoru · ${w} cm` : ht === 'egik' ? `Eğik cam davlumbaz (bacalı) · ${w} cm` : `Duvar tipi bacalı davlumbaz · ${w} cm`, 1);
        H('Davlumbaz baca borusu + klape (takım)', 1);
        if (!hoodCab(m)) return;
        carcass(no, m.w, s.upH, s.upD, 0); add(no, 'Davlumbaz bölme tablası', bodyName, m.w - 2 * t, s.upD, 1, '1 uzun kenar');
        H('Üst dolap askı aparatı', 2); fronts(no, frontsOf(m, 'kitchen', s, p.x0), 'kitchen'); sum.upper += m.w / 100; return;
      }
      if (ty.filler) { add(no, 'Dolgu paneli', frontName, s.upH, m.w, 1, '2 uzun kenar'); sum.upper += m.w / 100; return; }
      carcass(no, m.w, s.upH, s.upD, shelfPos(m, s, 'kitchen').length);
      H('Üst dolap askı aparatı', 2);
      if (ty.glass) H('Kapak camı (m²)', +(m.w * s.upH / 1e4).toFixed(2));
      fronts(no, frontsOf(m, 'kitchen', s, p.x0), 'kitchen');
      sum.upper += m.w / 100;
    });
    // tezgah ve baza
    let seg = null; const segs = [];
    for (const p of base) { const ty = MT[p.m.type]; if (ty.tall || ty.empty) { if (seg) segs.push(seg); seg = null; continue; } seg = seg ? [seg[0], p.x1] : [p.x0, p.x1]; }
    if (seg) segs.push(seg);
    segs.forEach(([a, b], i) => { add('Tezgah', `Tezgah ${i + 1}`, 'Tezgah · ' + pick(TOPS, cab.mat.top).t, b - a, s.topD, 1, 'ön kenar'); sum.top += (b - a) / 100; });
    const bz = base.filter(p => !MT[p.m.type].empty).reduce((a, p) => a + p.x1 - p.x0, 0);
    if (bz) add('Genel', 'Baza paneli', 'Baza · PVC / suntalam', bz, s.plinth - 1, 1);
    if (cab.mat.handle === 'gola') H('Gola profil (m)', +(sum.base).toFixed(2));
    if (cab.led?.on) {   // üst dolap altı LED
      const len = layoutRow(cab.upper).filter(p => !MT[p.m.type].empty && !MT[p.m.type].hood).reduce((a, p) => a + p.x1 - p.x0, 0) / 100;
      if (len) {
        H(`LED şerit · ${pick(LED_TEMPS, cab.led.temp || '3000').t} (m)`, len); H('LED alüminyum gömme profil + difüzör (m)', len);
        H('LED sürücü / adaptör (12 V)', Math.max(1, Math.ceil(len / 5))); H('LED anahtarı (dokunmatik / sensörlü)', 1); sum.led = +len.toFixed(2);
      }
    }
  }
  // aynı parçaları birleştir (modül farkı gözetmeden kesim listesi için ayrıca)
  const band = rows.reduce((a, r) => a + r.n * bandLen(r), 0) / 1000;
  return { rows, hw, sum, band: +band.toFixed(1) };
}
function bandLen(r) { // mm
  if (r.band === '4 kenar') return 2 * (r.L + r.W);
  if (r.band === '1 uzun kenar' || r.band === 'ön kenar') return Math.max(r.L, r.W);
  if (r.band === '2 uzun kenar') return 2 * Math.max(r.L, r.W);
  return 0;
}
export function partsCsv(pl, title) {
  const q = v => `"${String(v).replace(/"/g, '""')}"`;
  const lines = [[title], [], ['Modül', 'Parça', 'Malzeme', 'Boy (mm)', 'En (mm)', 'Adet', 'Kenar bandı'].map(q).join(';')];
  for (const r of pl.rows) lines.push([r.mod, r.part, r.mat, r.L, r.W, r.n, r.band].map(q).join(';'));
  lines.push('', [q('Donanım'), q('Adet')].join(';'));
  for (const [k, v] of Object.entries(pl.hw)) lines.push([q(k), q(String(v).replace('.', ','))].join(';'));
  lines.push('', [q('Toplam kenar bandı (m)'), q(String(pl.band).replace('.', ','))].join(';'));
  return '﻿' + lines.map(l => Array.isArray(l) ? l.join(';') : l).join('\r\n');
}

/* ── teklif kalemleri ── */
export const PRICE_DEF = {
  'mf-alt': { desc: 'Mutfak alt dolap (gövde + kapak, tezgah hariç)', unit: 'm', price: 9500 },
  'mf-ust': { desc: 'Mutfak üst dolap', unit: 'm', price: 7000 },
  'mf-boy': { desc: 'Mutfak boy dolabı / cihaz kolonu', unit: 'adet', price: 16000 },
  'mf-tez': { desc: 'Mutfak tezgahı', unit: 'm', price: 6500 },
  'mf-gola': { desc: 'Gola profil + aksesuar', unit: 'm', price: 900 },
  'mf-led': { desc: 'Üst dolap altı LED aydınlatma (profil + şerit + sürücü)', unit: 'm', price: 1200 },
  'mf-jprofil': { desc: 'J profil kulp (alüminyum)', unit: 'm', price: 450 },
  'gd-dolap': { desc: 'Giysi dolabı (gövde + kapak, ön yüz alanı)', unit: 'm²', price: 7500 },
  'gd-surgu': { desc: 'Sürgülü kapak sistemi farkı', unit: 'm²', price: 1500 },
};
export function quoteItems(cab, label, priceOf = (k, d) => d) {
  const pl = partsList(cab), mt = `${pick(FRONTS, cab.mat.front).t} kapak, ${pick(BODIES, cab.mat.body).t} gövde`;
  const it = (k, qty, extra = '') => { const d = PRICE_DEF[k]; return { cat: cab.kind === 'wardrobe' ? 'sabitmob' : 'mutfak', desc: `${label ? label + ' — ' : ''}${d.desc}${extra ? ' · ' + extra : ''}`, unit: d.unit, qty: +qty.toFixed(2), price: priceOf(k, d.price) }; };
  const out = [];
  if (cab.kind === 'wardrobe') {
    out.push(it('gd-dolap', pl.sum.frontM2, `${mt}, ${fmt(rowLen(cab.ward))} × ${cab.s.H} cm`));
    if (cab.s.doors === 'surgulu') out.push(it('gd-surgu', pl.sum.frontM2));
    return out;
  }
  if (pl.sum.base) out.push(it('mf-alt', pl.sum.base, mt));
  if (pl.sum.upper) out.push(it('mf-ust', pl.sum.upper, mt));
  if (pl.sum.tall) out.push(it('mf-boy', pl.sum.tall, mt));
  if (pl.sum.top) out.push(it('mf-tez', pl.sum.top, pick(TOPS, cab.mat.top).t));
  if (cab.mat.handle === 'gola' && pl.sum.base) out.push(it('mf-gola', pl.sum.base));
  if (cab.mat.handle === 'j' && pl.hw['J profil kulp (m)']) out.push(it('mf-jprofil', pl.hw['J profil kulp (m)']));
  if (pl.sum.led) out.push(it('mf-led', pl.sum.led, pick(LED_TEMPS, cab.led.temp || '3000').t));
  return out;
}
export { pick, fmt };
