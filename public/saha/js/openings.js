/* ═══ Kapı ve pencere modelleri / kullanım alanları ═══
 * Açıklık kaydı: { type, w, h, sill, flip, side, model, use, fc (kasa rengi), lc (kanat rengi) }
 * model çizim biçimini (2D sembol, 3D kanat düzeni), use varsayılan ölçüleri ve malzemeyi belirler.
 */

export const DOOR_MODELS = [
  { k: 'tek',       t: 'Tek kanat (menteşeli)' },
  { k: 'cift',      t: 'Çift kanat' },
  { k: 'asimetrik', t: 'Bir buçuk kanat (asimetrik)' },
  { k: 'surgu',     t: 'Sürgülü (duvar üstü, raylı)' },
  { k: 'gomme',     t: 'Gömme sürgü (cep kapı)' },
  { k: 'katlanir',  t: 'Katlanır (akordeon)' },
];
export const DOOR_USES = [
  { k: 'ic',     t: 'İç oda kapısı',                    w: 90,  h: 210, fc: '#F4F4F2', lc: '#F2F0EC' },
  { k: 'giris',  t: 'Daire giriş (çelik kapı)',         w: 100, h: 210, fc: '#3A3F45', lc: '#5B3F2C' },
  { k: 'banyo',  t: 'Banyo / WC (alt menfezli)',        w: 80,  h: 210, fc: '#F4F4F2', lc: '#F2F0EC' },
  { k: 'balkon', t: 'Balkon / bahçe (PVC, camlı)',      w: 90,  h: 220, fc: '#F4F4F2', lc: '#F4F4F2', glass: 'low' },
  { k: 'cam',    t: 'Cam kapı (mutfak / salon geçişi)', w: 90,  h: 210, fc: '#1F2125', lc: '#1F2125', glass: 'full' },
];
export const WIN_MODELS = [
  { k: 'tek',      t: 'Tek kanat açılır' },
  { k: 'tekacvas', t: 'Tek kanat açılır + vasistas (çift açılım)' },
  { k: 'cift',     t: 'Çift kanat açılır' },
  { k: 'acvas',    t: 'Çift kanat açılır + vasistas (çift açılım)' },
  { k: 'vasistas', t: 'Vasistas (üstten devrilir)' },
  { k: 'uclu',     t: 'Üç bölmeli (orta sabit)' },
  { k: 'surme',    t: 'Sürme (kaydırmalı)' },
  { k: 'sabit',    t: 'Sabit cam' },
];
export const WIN_USES = [
  { k: 'oda',     t: 'Oda penceresi',                       w: 120, h: 140, sill: 90 },
  { k: 'mutfak',  t: 'Mutfak (tezgah üstü)',                w: 120, h: 110, sill: 105 },
  { k: 'banyo',   t: 'Banyo / WC (buzlu cam, yüksek)',      w: 60,  h: 60,  sill: 160, frost: true, model: 'vasistas' },
  { k: 'fransiz', t: 'Fransız balkon (yere kadar, korkuluk)', w: 120, h: 220, sill: 0, rail: true, model: 'cift' },
  { k: 'fransizK', t: 'Fransız pencere (yere kadar, korkuluksuz)', w: 120, h: 220, sill: 0, model: 'cift' },
  { k: 'vitrin',  t: 'Vitrin / panoramik',                  w: 240, h: 220, sill: 10,  model: 'sabit' },
];
export const FRAME_COLORS = [['#F4F4F2', 'Beyaz'], ['#3A3F45', 'Antrasit'], ['#1F2125', 'Siyah'], ['#9A6B3F', 'Altın meşe'], ['#5B3F2C', 'Ceviz']];
export const LEAF_COLORS = [['#F2F0EC', 'Beyaz lake'], ['#E9E1D3', 'Krem'], ['#B08463', 'Meşe'], ['#6E4B33', 'Ceviz'], ['#4A4F55', 'Antrasit'], ['#1F2125', 'Siyah']];

const pick = (L, k) => L.find(x => x.k === k);
export const doorModel = o => pick(DOOR_MODELS, o.model) ? o.model : 'tek';
export const doorUse = o => pick(DOOR_USES, o.use) || DOOR_USES[0];
// eski kayıtlar: modelsiz pencere 90 cm üstünde çift kanat çizilirdi
export const winModel = o => pick(WIN_MODELS, o.model) ? o.model : (o.w > 90 ? 'cift' : 'tek');
export const winUse = o => pick(WIN_USES, o.use) || WIN_USES[0];
export const frameColor = o => o.fc || (o.type === 'door' ? doorUse(o).fc : '#F4F4F2');
export const leafColor = o => o.lc || doorUse(o).lc;
export const modelName = o => o.type === 'door' ? pick(DOOR_MODELS, doorModel(o)).t : o.type === 'window' ? pick(WIN_MODELS, winModel(o)).t : 'Boşluk';
// pencere dış korkuluğu: açıklıkta elle seçildiyse o, yoksa kullanım varsayılanı
// tek kanatlı modeller (menteşe yönü çevrilebilir) ve vasistas (üstten devrilme) açılımı olanlar
export const winSingle = o => ['tek', 'tekacvas'].includes(winModel(o));
export const winTilt = o => ['vasistas', 'acvas', 'tekacvas'].includes(winModel(o));
/* kanadın menteşesi başlangıç (x0) tarafında mı */
export const winHingeAtStart = (o, x0) => x0 === 0 && !(winSingle(o) && o.flip);
export const winRail = o => o.type === 'window' && (o.rail ?? !!winUse(o).rail);

/* çizilen korkuluk (balkon, teras, merdiven boşluğu…) türleri */
export const RAIL_KINDS = [
  { k: 'dikey', t: 'Metal, dikey çubuklu', c: '#3A3F45' },
  { k: 'yatay', t: 'Metal, yatay çubuklu', c: '#3A3F45' },
  { k: 'cam',   t: 'Cam panel + küpeşte', c: '#9DB7BD' },
  { k: 'dolu',  t: 'Dolu parapet (duvar)', c: '#C9C4BA' },
];
export const railKind = r => RAIL_KINDS.find(x => x.k === r.kind) || RAIL_KINDS[0];

export const useName = o => o.type === 'door' ? doorUse(o).t : o.type === 'window' ? winUse(o).t : '';

/* kullanım seçildiğinde ölçü / model / renk varsayılanlarını uygula (duvar boyuna sığdırarak) */
export function applyUse(o, k, wallL = Infinity) {
  if (o.type === 'door') {
    const u = pick(DOOR_USES, k) || DOOR_USES[0];
    Object.assign(o, { use: u.k, h: u.h, sill: 0, fc: u.fc, lc: u.lc });
    o.w = Math.min(u.w, wallL - 4);
  } else if (o.type === 'window') {
    const u = pick(WIN_USES, k) || WIN_USES[0];
    Object.assign(o, { use: u.k, h: u.h, sill: u.sill }); delete o.rail;
    if (u.model) o.model = u.model;
    o.w = Math.min(u.w, wallL - 4);
  }
  return o;
}

/* pencere kanat düzeni: [x0, x1] (0..1), açılır mı */
export function sashes(o) {
  switch (winModel(o)) {
    case 'tek': case 'tekacvas': case 'vasistas': return [[0, 1, 1]];
    case 'cift': case 'acvas': return [[0, 0.5, 1], [0.5, 1, 1]];
    case 'uclu': return [[0, 1 / 3, 1], [1 / 3, 2 / 3, 0], [2 / 3, 1, 1]];
    case 'surme': return [[0, 0.54, 1], [0.46, 1, 1]];
    default: return [];
  }
}

/* kapı kanatları: [başlangıç oranı, bitiş oranı, menteşe ucu 'a'|'b'] */
export function leaves(o) {
  switch (doorModel(o)) {
    case 'cift': return [[0, 0.5, 'a'], [0.5, 1, 'b']];
    case 'asimetrik': return o.flip ? [[0, 1 / 3, 'a'], [1 / 3, 1, 'b']] : [[0, 2 / 3, 'a'], [2 / 3, 1, 'b']];
    default: return [[0, 1, o.flip ? 'b' : 'a']];
  }
}
