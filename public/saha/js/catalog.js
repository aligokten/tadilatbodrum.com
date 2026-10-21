/* ═══ Sabit listeler, varsayılan ayarlar ve fiyat kütüphanesi ═══ */
import { FIXTURES, FIXTURE_GROUPS } from './fixtures.js';

export const STATUSES = [
  { k: 'talep',    t: 'Talep',      c: '#7A8594' },
  { k: 'kesif',    t: 'Keşif',      c: '#1EC3D3' },
  { k: 'teklif',   t: 'Teklif',     c: '#F2A33A' },
  { k: 'onay',     t: 'Onaylandı',  c: '#00AFB0' },
  { k: 'uygulama', t: 'Uygulamada', c: '#EB591F' },
  { k: 'teslim',   t: 'Teslim',     c: '#1F9D55' },
  { k: 'iptal',    t: 'İptal',      c: '#B4B9C0' },
];
export const statusOf = k => STATUSES.find(s => s.k === k) || STATUSES[0];

export const CATEGORIES = [
  { k: 'banyo',    t: 'Banyo',          ic: 'bath' },
  { k: 'mutfak',   t: 'Mutfak',         ic: 'kitchen' },
  { k: 'boya',     t: 'Boya / Badana',  ic: 'roller' },
  { k: 'seramik',  t: 'Seramik / Fayans', ic: 'tiles' },
  { k: 'zemin',    t: 'Zemin / Parke',  ic: 'floor' },
  { k: 'elektrik', t: 'Elektrik',       ic: 'bolt' },
  { k: 'tesisat',  t: 'Su Tesisatı',    ic: 'pipe' },
  { k: 'alcipan',  t: 'Alçı / Alçıpan', ic: 'wall' },
  { k: 'kapi',     t: 'Kapı / Pencere', ic: 'door' },
  { k: 'iklim',    t: 'Isıtma / Klima', ic: 'snow' },
  { k: 'yalitim',  t: 'Yalıtım / Çatı', ic: 'roof' },
  { k: 'dis',      t: 'Dış Cephe / Teras / Havuz', ic: 'sun' },
  { k: 'yikim',    t: 'Yıkım / Moloz',  ic: 'hammer' },
  { k: 'diger',    t: 'Diğer',          ic: 'tools' },
];
export const catOf = k => CATEGORIES.find(c => c.k === k) || CATEGORIES[CATEGORIES.length - 1];

export const SEVERITY = [
  { k: 'bilgi',  t: 'Bilgi',  c: '#7A8594' },
  { k: 'dusuk',  t: 'Düşük',  c: '#00AFB0' },
  { k: 'orta',   t: 'Orta',   c: '#F2A33A' },
  { k: 'yuksek', t: 'Yüksek', c: '#EB591F' },
  { k: 'acil',   t: 'Acil',   c: '#D62C1A' },
];
export const sevOf = k => SEVERITY.find(s => s.k === k) || SEVERITY[0];

export const PHOTO_TAGS = [
  { k: 'kesif', t: 'Keşif' }, { k: 'tespit', t: 'Tespit' }, { k: 'rolove', t: 'Rölöve / Kroki' },
  { k: 'once', t: 'Önce' }, { k: 'uygulama', t: 'Uygulama' }, { k: 'sonra', t: 'Sonra' }, { k: 'render', t: 'Render' }, { k: 'diger', t: 'Diğer' },
];

export const ROOM_TYPES = ['Salon', 'Oturma Odası', 'Yatak Odası', 'Çocuk Odası', 'Mutfak', 'Banyo', 'WC', 'Ebeveyn Banyosu',
  'Antre / Hol', 'Koridor', 'Balkon', 'Teras', 'Çalışma Odası', 'Kiler / Depo', 'Çamaşır Odası', 'Merdiven', 'Bahçe', 'Diğer'];

/* keşif kontrol listesi — her mahal için sistematik inceleme kalemleri */
export const INSPECTION = [
  { k: 'zemin',    t: 'Zemin kaplaması',        hint: 'çatlak, kabarma, seviye farkı, derz' },
  { k: 'duvar',    t: 'Duvar yüzeyi / sıva',    hint: 'çatlak, kabarma, dökülme, rutubet' },
  { k: 'tavan',    t: 'Tavan',                  hint: 'leke, sarkma, kaplama durumu' },
  { k: 'nem',      t: 'Nem / rutubet / küf',    hint: 'nem ölçer değeri, kaynak' },
  { k: 'pencere',  t: 'Pencere / doğrama',      hint: 'yalıtım, mekanizma, cam' },
  { k: 'kapi',     t: 'Kapı',                   hint: 'kasa, pervaz, menteşe, kilit' },
  { k: 'elektrik', t: 'Elektrik (priz/anahtar)', hint: 'adet, topraklama, sigorta, kablo' },
  { k: 'aydinlatma', t: 'Aydınlatma',           hint: 'armatür, spot, LED' },
  { k: 'tesisat',  t: 'Su tesisatı / gider',    hint: 'kaçak, basınç, gider eğimi, vana' },
  { k: 'isitma',   t: 'Isıtma / klima',         hint: 'petek, yerden ısıtma, klima hattı' },
  { k: 'mobilya',  t: 'Sabit mobilya / dolap',  hint: 'mutfak, gardırop, banyo dolabı' },
  { k: 'vitrifiye', t: 'Vitrifiye / armatür',   hint: 'klozet, lavabo, batarya, duş' },
];
export const CHECK_STATES = [
  { k: 'iyi',  t: 'İyi',   c: '#1F9D55' },
  { k: 'orta', t: 'Orta',  c: '#F2A33A' },
  { k: 'kotu', t: 'Kötü',  c: '#EB591F' },
  { k: 'yok',  t: 'Yok / N.A.', c: '#B4B9C0' },
];

/* 2D/3D zemin kaplamaları ve mobilya/donatı kütüphanesi */
export const FLOORS = [
  { k: 'parke',    t: 'Ahşap parke', c: '#B98A5E' },
  { k: 'laminat',  t: 'Laminat (açık)', c: '#D6B994' },
  { k: 'seramik',  t: 'Seramik 60×60', c: '#E6E2DB' },
  { k: 'mermer',   t: 'Mermer', c: '#F1EFEA' },
  { k: 'traverten', t: 'Traverten (Bodrum)', c: '#DCCBB0' },
  { k: 'beton',    t: 'Mikro beton', c: '#A9A7A3' },
  { k: 'hali',     t: 'Halı', c: '#8C8F99' },
  { k: 'dis',      t: 'Dış mekan taş', c: '#C9B79A' },
];
export const floorOf = k => FLOORS.find(f => f.k === k) || FLOORS[0];

/* g: kategori (seçim listesinde gruplanır), z: yerden yükseklik (cm) */
export const FURN_GROUPS = [
  ['oturma', 'Oturma / salon'], ['yemek', 'Yemek'], ['yatak', 'Yatak odası'], ['calisma', 'Çalışma'],
  ['mutfak', 'Mutfak'], ['banyo', 'Banyo'], ['tesisat', 'Isıtma / tesisat'], ...FIXTURE_GROUPS, ['yapi', 'Yapı elemanları'], ['dis', 'Dış mekan'], ['diger', 'Diğer'],
];
export const FURNITURE = [
  { g: 'oturma', k: 'kanepe',   t: 'Kanepe (3\'lü)', w: 220, d: 90,  h: 85,  c: '#9AA3AE' },
  { g: 'oturma', k: 'ikili',    t: 'Kanepe (2\'li)', w: 160, d: 88,  h: 85,  c: '#9AA3AE' },
  { g: 'oturma', k: 'lkanepe',  t: 'L köşe koltuk', w: 280, d: 200, h: 85,  c: '#8E979F' },
  { g: 'oturma', k: 'ukanepe',  t: 'U köşe koltuk', w: 320, d: 220, h: 85,  c: '#8E979F' },
  { g: 'oturma', k: 'koltuk',   t: 'Berjer',        w: 85,  d: 85,  h: 85,  c: '#C7A27A' },
  { g: 'oturma', k: 'puf',      t: 'Puf',           w: 50,  d: 50,  h: 42,  c: '#D9B98F' },
  { g: 'oturma', k: 'sehpa',    t: 'Orta sehpa',    w: 110, d: 60,  h: 40,  c: '#6E5341' },
  { g: 'oturma', k: 'yansehpa', t: 'Yan sehpa',     w: 45,  d: 45,  h: 55,  c: '#6E5341' },
  { g: 'oturma', k: 'tv',       t: 'TV ünitesi',    w: 180, d: 45,  h: 50,  c: '#2E3135' },
  { g: 'oturma', k: 'kitaplik', t: 'Kitaplık',      w: 100, d: 35,  h: 200, c: '#E8E2D6' },
  { g: 'oturma', k: 'konsol',   t: 'Konsol / dresuar', w: 120, d: 40, h: 80, c: '#8A6A4F' },
  { g: 'oturma', k: 'hali',     t: 'Halı',          w: 200, d: 300, h: 1,   c: '#B9A58C' },
  { g: 'oturma', k: 'lambader', t: 'Lambader',      w: 40,  d: 40,  h: 170, c: '#2E3135' },
  { g: 'oturma', k: 'avize',    t: 'Sarkıt avize',  w: 60,  d: 60,  h: 40,  c: '#2E3135', z: 210 },
  { g: 'oturma', k: 'somine',   t: 'Şömine',        w: 150, d: 50,  h: 110, c: '#E4DED3' },
  { g: 'yemek',  k: 'masa',     t: 'Yemek masası',  w: 180, d: 90,  h: 75,  c: '#8A6A4F' },
  { g: 'yemek',  k: 'yuvarlakmasa', t: 'Yuvarlak masa', w: 110, d: 110, h: 75, c: '#8A6A4F' },
  { g: 'yemek',  k: 'sandalye', t: 'Sandalye',      w: 45,  d: 50,  h: 90,  c: '#3B3F45' },
  { g: 'yemek',  k: 'tabure',   t: 'Bar taburesi',  w: 40,  d: 40,  h: 75,  c: '#3B3F45' },
  { g: 'yemek',  k: 'vitrin',   t: 'Vitrin / büfe', w: 160, d: 45,  h: 90,  c: '#F2F0EC' },
  { g: 'yatak',  k: 'yatak',    t: 'Çift kişilik yatak', w: 160, d: 200, h: 50, c: '#ECE8E1' },
  { g: 'yatak',  k: 'kingyatak', t: 'King yatak (180)', w: 180, d: 200, h: 50, c: '#ECE8E1' },
  { g: 'yatak',  k: 'tekyatak', t: 'Tek kişilik yatak',  w: 100, d: 200, h: 50, c: '#ECE8E1' },
  { g: 'yatak',  k: 'ranza',    t: 'Ranza',         w: 100, d: 200, h: 160, c: '#F2F0EC' },
  { g: 'yatak',  k: 'bebek',    t: 'Bebek yatağı',  w: 70,  d: 130, h: 90,  c: '#FFFFFF' },
  { g: 'yatak',  k: 'komodin',  t: 'Komodin',       w: 50,  d: 40,  h: 50,  c: '#F2F0EC' },
  { g: 'yatak',  k: 'sifonyer', t: 'Şifonyer',      w: 100, d: 50,  h: 90,  c: '#F2F0EC' },
  { g: 'yatak',  k: 'makyaj',   t: 'Makyaj masası', w: 100, d: 45,  h: 75,  c: '#F2F0EC' },
  { g: 'yatak',  k: 'gardirop', t: 'Gardırop',      w: 200, d: 60,  h: 240, c: '#F2F0EC' },
  { g: 'calisma', k: 'calismamasa', t: 'Çalışma masası', w: 140, d: 70, h: 75, c: '#E8E2D6' },
  { g: 'calisma', k: 'ofiskoltuk', t: 'Ofis koltuğu', w: 60, d: 60, h: 110, c: '#2E3135' },
  { g: 'calisma', k: 'dosyadolap', t: 'Dosya dolabı', w: 80, d: 40, h: 120, c: '#D9DCDF' },
  { g: 'mutfak', k: 'tezgah',   t: 'Alt dolap + tezgah', w: 240, d: 62, h: 90, c: '#F4F4F2' },
  { g: 'mutfak', k: 'ustdolap', t: 'Üst dolap',     w: 240, d: 35,  h: 70,  c: '#F4F4F2', z: 150 },
  { g: 'mutfak', k: 'boydolap', t: 'Boy dolabı',    w: 60,  d: 60,  h: 220, c: '#F4F4F2' },
  { g: 'mutfak', k: 'ada',      t: 'Mutfak adası',  w: 180, d: 90,  h: 90,  c: '#22B8C8' },
  { g: 'mutfak', k: 'buzdolabi', t: 'Buzdolabı',    w: 70,  d: 70,  h: 190, c: '#D9DCDF' },
  { g: 'mutfak', k: 'gardrobbuz', t: 'Gardırop tipi buzdolabı', w: 90, d: 72, h: 180, c: '#D9DCDF' },
  { g: 'mutfak', k: 'dondurucu', t: 'Tezgah altı ankastre derin dondurucu', w: 60, d: 55, h: 82, c: '#F4F4F2' },
  { g: 'mutfak', k: 'bulasik',  t: 'Bulaşık makinesi', w: 60, d: 60, h: 85, c: '#E9EBED' },
  { g: 'mutfak', k: 'firin',    t: 'Ankastre fırın', w: 60, d: 56, h: 60,  c: '#2E3135', z: 85 },
  { g: 'mutfak', k: 'ocak',     t: 'Ocak',          w: 60,  d: 52,  h: 3,   c: '#16171A', z: 90 },
  { g: 'mutfak', k: 'evye',     t: 'Evye',          w: 80,  d: 50,  h: 20,  c: '#C9CDD2', z: 72 },
  { g: 'mutfak', k: 'davlumbaz', t: 'Davlumbaz',    w: 90,  d: 50,  h: 60,  c: '#C9CDD2', z: 160 },
  { g: 'banyo',  k: 'klozet',   t: 'Klozet',        w: 38,  d: 60,  h: 40,  c: '#FFFFFF' },
  { g: 'banyo',  k: 'asmaklozet', t: 'Asma klozet + gömme rezervuar', w: 50, d: 70, h: 110, c: '#FFFFFF' },
  { g: 'banyo',  k: 'lavabo',   t: 'Lavabo dolabı', w: 80,  d: 48,  h: 85,  c: '#FFFFFF' },
  { g: 'banyo',  k: 'ayna',     t: 'Ayna / ayna dolabı', w: 80, d: 12, h: 80, c: '#DCEFF2', z: 110 },
  { g: 'banyo',  k: 'dus',      t: 'Duş teknesi',   w: 90,  d: 90,  h: 5,   c: '#F5F5F5' },
  { g: 'banyo',  k: 'duskabin', t: 'Duşakabin',     w: 90,  d: 90,  h: 200, c: '#F5F5F5' },
  { g: 'banyo',  k: 'kuvet',    t: 'Küvet',         w: 170, d: 75,  h: 58,  c: '#FFFFFF' },
  { g: 'banyo',  k: 'camasir',  t: 'Çamaşır mak.',  w: 60,  d: 60,  h: 85,  c: '#E9EBED' },
  { g: 'banyo',  k: 'kurutma',  t: 'Kurutma mak.',  w: 60,  d: 60,  h: 85,  c: '#E9EBED' },
  { g: 'banyo',  k: 'havlupan', t: 'Havlupan',      w: 50,  d: 8,   h: 120, c: '#E9EBED', z: 20 },
  { g: 'tesisat', k: 'radyator', t: 'Panel radyatör', w: 100, d: 10, h: 60,  c: '#FFFFFF', z: 12 },
  { g: 'tesisat', k: 'kombi',   t: 'Kombi',         w: 45,  d: 35,  h: 75,  c: '#FFFFFF', z: 140 },
  { g: 'tesisat', k: 'klima',   t: 'Klima iç ünite', w: 90, d: 25,  h: 30,  c: '#FFFFFF', z: 220 },
  { g: 'tesisat', k: 'kasetklima', t: 'Kaset tipi klima (çift yönlü)', w: 100, d: 60, h: 30, c: '#FFFFFF', ceil: true },
  { g: 'tesisat', k: 'termosifon', t: 'Termosifon', w: 50,  d: 50,  h: 90,  c: '#FFFFFF', z: 120 },
  { g: 'yapi',   k: 'kolon',    t: 'Kolon',         w: 30,  d: 30,  h: 280, c: '#D7D3CC' },
  { g: 'yapi',   k: 'merdiven', t: 'Merdiven (düz)', w: 100, d: 300, h: 280, c: '#D7D3CC' },
  { g: 'yapi',   k: 'basamak',  t: 'Basamak / platform', w: 100, d: 30, h: 17, c: '#D7D3CC' },
  { g: 'yapi',   k: 'nis',      t: 'Niş / şaft',    w: 60,  d: 40,  h: 280, c: '#C9CDD2' },
  { g: 'dis',    k: 'sezlong',  t: 'Şezlong',       w: 70,  d: 190, h: 40,  c: '#F2F0EC' },
  { g: 'dis',    k: 'bahcemasa', t: 'Bahçe masası', w: 120, d: 120, h: 75,  c: '#6E5341' },
  { g: 'dis',    k: 'semsiye',  t: 'Güneş şemsiyesi', w: 250, d: 250, h: 250, c: '#F2F0EC' },
  { g: 'dis',    k: 'barbeku',  t: 'Barbekü',       w: 120, d: 60,  h: 100, c: '#7A7F86' },
  { g: 'dis',    k: 'agac',     t: 'Ağaç',          w: 200, d: 200, h: 450, c: '#4F8A4B' },
  { g: 'dis',    k: 'bitki',    t: 'Saksı bitki',   w: 50,  d: 50,  h: 120, c: '#4F8A4B' },
  { g: 'diger',  k: 'kutu',     t: 'Genel kutu',    w: 100, d: 60,  h: 100, c: '#C9CDD2' },
  ...FIXTURES,
];
export const furnOf = k => FURNITURE.find(f => f.k === k) || FURNITURE.find(f => f.k === 'kutu');

export const WALL_COLORS = ['#F7F5F0', '#FFFFFF', '#ECE6DA', '#DDE4E4', '#CFE7EA', '#F3E1D3', '#E2DCCF', '#C9D6C3', '#B7C4CF', '#3A3D42'];

/* ── teklif birimleri ve fiyat kütüphanesi (örnek birim fiyatlar, Ayarlar'dan düzenlenir) ── */
export const UNITS = ['m²', 'm', 'adet', 'takım', 'nokta', 'gün', 'saat', 'kg', 'götürü'];

/* qty: plandan / keşiften otomatik metraj alınırken kullanılacak ölçü
 * floor = zemin alanı, wall = net duvar alanı, ceil = tavan alanı, perim = çevre */
export const DEFAULT_CATALOG = [
  { id: 'mf-alt', cat: 'mutfak', desc: 'Mutfak alt dolap (gövde + kapak, tezgah hariç)', unit: 'm', price: 9500 },
  { id: 'mf-ust', cat: 'mutfak', desc: 'Mutfak üst dolap', unit: 'm', price: 7000 },
  { id: 'mf-boy', cat: 'mutfak', desc: 'Mutfak boy dolabı / cihaz kolonu', unit: 'adet', price: 16000 },
  { id: 'mf-tez', cat: 'mutfak', desc: 'Mutfak tezgahı', unit: 'm', price: 6500 },
  { id: 'mf-gola', cat: 'mutfak', desc: 'Gola profil + aksesuar', unit: 'm', price: 900 },
  { id: 'gd-dolap', cat: 'diger', desc: 'Giysi dolabı (gövde + kapak, ön yüz alanı)', unit: 'm²', price: 7500 },
  { id: 'gd-surgu', cat: 'diger', desc: 'Sürgülü kapak sistemi farkı', unit: 'm²', price: 1500 },
  { id: 'c1',  cat: 'yikim',    desc: 'Mevcut seramik/fayans söküm ve moloz atımı', unit: 'm²', price: 180, qty: 'wall' },
  { id: 'c2',  cat: 'yikim',    desc: 'Mevcut zemin kaplaması söküm', unit: 'm²', price: 120, qty: 'floor' },
  { id: 'c3',  cat: 'boya',     desc: 'Duvar alçı + saten alçı + 2 kat iç cephe boyası', unit: 'm²', price: 260, qty: 'wall' },
  { id: 'c4',  cat: 'boya',     desc: 'Tavan boyası (2 kat)', unit: 'm²', price: 150, qty: 'ceil' },
  { id: 'c5',  cat: 'boya',     desc: 'Silikonlu dış cephe boyası', unit: 'm²', price: 220 },
  { id: 'c6',  cat: 'seramik',  desc: 'Zemin seramiği döşeme (işçilik + yapıştırıcı + derz)', unit: 'm²', price: 650, qty: 'floor' },
  { id: 'c7',  cat: 'seramik',  desc: 'Duvar fayansı döşeme (işçilik + yapıştırıcı + derz)', unit: 'm²', price: 700, qty: 'wall' },
  { id: 'c8',  cat: 'seramik',  desc: 'Seramik malzeme (orta segment, 60×60)', unit: 'm²', price: 750, qty: 'floor' },
  { id: 'c9',  cat: 'zemin',    desc: 'Laminat parke + şilte + süpürgelik (malzeme + işçilik)', unit: 'm²', price: 950, qty: 'floor' },
  { id: 'c10', cat: 'zemin',    desc: 'Şap / tesviye betonu', unit: 'm²', price: 320, qty: 'floor' },
  { id: 'c11', cat: 'yalitim',  desc: 'Islak hacim su yalıtımı (2 kat + file)', unit: 'm²', price: 380, qty: 'floor' },
  { id: 'c12', cat: 'alcipan',  desc: 'Asma tavan alçıpan + gizli ışık bandı', unit: 'm²', price: 900, qty: 'ceil' },
  { id: 'c13', cat: 'alcipan',  desc: 'Alçıpan bölme duvar (çift yüz, yalıtımlı)', unit: 'm²', price: 1100 },
  { id: 'c14', cat: 'elektrik', desc: 'Priz / anahtar noktası (kablo + kasa + montaj)', unit: 'nokta', price: 850, qty: 'elec' },
  { id: 'c15', cat: 'elektrik', desc: 'Spot aydınlatma (LED, montaj dahil)', unit: 'adet', price: 450, qty: 'light' },
  { id: 'c16', cat: 'elektrik', desc: 'Elektrik tesisatı yenileme (daire)', unit: 'götürü', price: 45000 },
  { id: 'c17', cat: 'tesisat',  desc: 'Temiz su + pis su tesisatı yenileme (ıslak hacim)', unit: 'götürü', price: 22000 },
  { id: 'c18', cat: 'tesisat',  desc: 'Ankastre rezervuar + asma klozet montajı', unit: 'takım', price: 6500 },
  { id: 'c40', cat: 'tesisat',  desc: 'Sıhhi tesisat noktası (temiz su / pis su / sifon)', unit: 'nokta', price: 1400, qty: 'plumb' },
  { id: 'c19', cat: 'banyo',    desc: 'Lavabo dolabı + ayna montajı', unit: 'takım', price: 3500 },
  { id: 'c20', cat: 'banyo',    desc: 'Duşakabin (temperli cam, montaj dahil)', unit: 'adet', price: 14000 },
  { id: 'c21', cat: 'mutfak',   desc: 'Mutfak dolabı (lake kapak, alt+üst)', unit: 'm', price: 16000 },
  { id: 'c22', cat: 'mutfak',   desc: 'Kuvars tezgah', unit: 'm', price: 9500 },
  { id: 'c23', cat: 'kapi',     desc: 'Amerikan panel iç kapı (kasa + pervaz + montaj)', unit: 'adet', price: 9000 },
  { id: 'c24', cat: 'kapi',     desc: 'PVC pencere (ısıcamlı)', unit: 'm²', price: 6500 },
  { id: 'c25', cat: 'iklim',    desc: 'Split klima montajı + bakır boru hattı', unit: 'adet', price: 4500 },
  { id: 'c26', cat: 'dis',      desc: 'Teras / balkon traverten kaplama', unit: 'm²', price: 1800 },
  { id: 'c27', cat: 'diger',    desc: 'İnşaat sonrası ince temizlik', unit: 'm²', price: 60, qty: 'floor' },
  { id: 'c28', cat: 'diger',    desc: 'Nakliye / malzeme taşıma', unit: 'götürü', price: 5000 },
];

export const DEFAULT_SETTINGS = {
  company: {
    name: 'TadilatBodrum.com', phone: '', whatsapp: '', email: 'info@tadilatbodrum.com',
    address: 'Bodrum / Muğla', web: 'tadilatbodrum.com', taxNo: '', iban: '',
  },
  vat: 20,
  profit: 0,
  videoLines: 'Net ve kalem kalem teklif — sürpriz maliyet yok\nPlanlı takvim, her aşamada düzenli bilgilendirme\nTek muhatap: tüm ustalar ve ekipler bizden\nTemiz, korumalı ve düzenli çalışma alanı',
  validDays: 15,
  terms: [
    'Teklif, belirtilen geçerlilik süresi boyunca geçerlidir.',
    'Ödeme planı: %40 sözleşmede, %40 iş ortasında, %20 teslimde.',
    'Teklif kapsamı dışındaki ek işler ayrıca fiyatlandırılır ve yazılı onayla yapılır.',
    'Malzeme seçimleri müşteri onayı ile kesinleşir; fiyat farkları teklife yansıtılır.',
    'Tüm işçilikler 2 yıl TadilatBodrum.com garantisi altındadır.',
  ].join('\n'),
  catalog: DEFAULT_CATALOG,
};
