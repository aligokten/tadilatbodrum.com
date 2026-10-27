/* SAGG Drywall+ — malzeme kataloğu ve varsayılan ayarlar.
 * Ölçüler mm, fiyatlar ₺ (Ayarlar'dan değiştirilir, tarayıcıda saklanır). */

// Profil sistemleri: gövde genişliği (web) ve kanat yüksekliği (flange)
export const SYSTEMS = {
  50:  { label: '50 sistem (C50 / U50)',   web: 50,  cFl: 50, uFl: 40 },
  75:  { label: '75 sistem (C75 / U75)',   web: 75,  cFl: 50, uFl: 40 },
  100: { label: '100 sistem (C100 / U100)', web: 100, cFl: 50, uFl: 40 },
};

export const BOARDS = {
  std: { label: 'Standart (beyaz) alçıpan', short: 'STD', color: '#e9e6df' },
  h2:  { label: 'Suya dayanıklı (yeşil) alçıpan', short: 'YŞL', color: '#cfe6cf' },
  f:   { label: 'Yangına dayanıklı (kırmızı) alçıpan', short: 'YNG', color: '#f1cfcf' },
  hd:  { label: 'Darbeye dayanıklı (mavi) alçıpan', short: 'DRB', color: '#cddcf0' },
};

export const INSULATION = {
  none: { label: 'Yok' },
  tasyunu: { label: 'Taşyünü levha' },
  camyunu: { label: 'Camyünü şilte' },
};

export const DEFAULT_SETTINGS = {
  boardT: 12.5,            // levha kalınlığı
  sheetW: 1200,
  sheetH: 2500,            // 2500 / 2600 / 3000
  barU: 3000,              // U profil boyu
  barC: 3000,              // C profil boyu (3000 / 4000)
  kerfBar: 2,              // profil kesim payı
  kerfSheet: 3,            // levha kesim payı
  spliceLap: 300,          // profil ek bindirmesi
  dowelPitch: 600,         // U profil dübel aralığı
  screwPitchOuter: 250,    // dış kat levha vida aralığı
  screwPitchInner: 750,    // iç kat levha vida aralığı
  studToTrackScrew: true,  // dikmeler U'ya LN ile vidalanır
  wastePct: 5,             // genel fire (sarf malzemeler)
  currency: '₺',
  prices: {
    U50: 95, U75: 120, U100: 145,
    C50: 115, C75: 145, C100: 175,
    corner: 45,               // köşe profili (boy)
    sheet_std: 260, sheet_h2: 340, sheet_f: 360, sheet_hd: 520,
    TN25: 0.45, TN35: 0.55, LN9: 0.40, dowel: 1.6,
    tape_seal: 6,             // sızdırmazlık bandı (m)
    tape_joint: 1.2,          // derz bandı (m)
    filler: 32,               // derz dolgu alçısı (kg)
    insul: 95,                // yalıtım (m²)
    labor_m2: 0,              // işçilik (m² kaplama yüzeyi) — isteğe bağlı
  },
  company: 'SAGG Plus · TadilatBodrum.com',
};

// Sarf malzeme tanımları (malzeme listesinde sıra ve birim)
export const CONSUMABLES = [
  { k: 'TN25', name: 'TN 3,5×25 alçıpan vidası', unit: 'adet', pack: 1000 },
  { k: 'TN35', name: 'TN 3,5×35 alçıpan vidası', unit: 'adet', pack: 1000 },
  { k: 'LN9', name: 'LN 3,5×9,5 profil (çakmak) vidası', unit: 'adet', pack: 1000 },
  { k: 'dowel', name: 'Çakma dübel 6×40', unit: 'adet', pack: 100 },
  { k: 'tape_seal', name: 'Sızdırmazlık (izolasyon) bandı', unit: 'm', pack: 30 },
  { k: 'tape_joint', name: 'Derz bandı (kağıt / file)', unit: 'm', pack: 90 },
  { k: 'filler', name: 'Derz dolgu alçısı', unit: 'kg', pack: 25 },
  { k: 'insul', name: 'Yalıtım (taşyünü / camyünü)', unit: 'm²' },
];

export const ROLE_COLORS = {
  U: '#7a8a99',
  C: '#2d8fa3',
  K: '#d4692a', // takviyeli / kasa elemanları
};
