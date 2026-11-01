/* ═══ Ürün standartlaştırma (Yeniden Yapılanma Yol Haritası V1.0) ═══
   Ürün kataloğu (8 bileşen), paketler (Essential / Comfort / Signature), onaylı malzeme kütüphanesi,
   maliyet reçeteleri ve fiyat formülü, proje sınıfı (A/B/C), kalite kontrol (K1–K6), dönüşüm programı.
   Veri ayarlarda (settings.urun) tutulur — ekipteki herkes aynı kataloğu kullanır. */

export const PKS = [
  { k: 'ess', t: 'Essential', s: 'ESS', d: 'İşlevsel, dayanıklı ve erişilebilir — ekonomik ürün seçimleri' },
  { k: 'cmf', t: 'Comfort', s: 'CMF', d: 'Tasarım ve konfor dengesi — genişletilmiş malzeme seçenekleri' },
  { k: 'sig', t: 'Signature', s: 'SIG', d: 'Premium tasarım ve detaylar — üst segment ürün seçenekleri' },
];
export const pkOf = k => PKS.find(p => p.k === k) || PKS[0];

export const PROJECT_CLASS = [
  { k: 'A', t: 'Standart ürün', c: '#1E8A4C', d: 'Mevcut yerleşim korunuyor, altyapı uygun; standart reçete üzerinden doğrudan teklif.' },
  { k: 'B', t: 'Standart + opsiyonel modüller', c: '#C77700', d: 'Temel paket korunur; tesisat taşıma, özel seramik, ilave tamir gibi değişiklikler ayrı fiyatlandırılır.' },
  { k: 'C', t: 'Özel proje', c: '#B5341F', d: 'Yapısal müdahale, kapsamlı nem / tesisat sorunu, ruhsat ihtimali ya da ciddi belirsizlik: standart paket satışı durur; teknik inceleme ve özel teklif.' },
];
export const SURFACE_CLASS = [
  { k: 'A', t: 'Sağlam yüzey', d: 'Sağlam, düzgün, lokal küçük onarım — standart birim fiyat' },
  { k: 'B', t: 'Ek hazırlık', d: 'Çatlak, çok sayıda delik ya da fazla yüzey hazırlığı — ek hazırlık modülü' },
  { k: 'C', t: 'Özel inceleme', d: 'Aktif rutubet, kabarma, yaygın bozuk sıva — önce tespit ve özel teklif' },
];
export const STATUS = [
  { k: 'taslak', t: 'Taslak', c: '#8E959E' },
  { k: 'pilot', t: 'Pilot', c: '#C77700' },
  { k: 'satista', t: 'Satışta', c: '#1E8A4C' },
  { k: 'ikinci', t: 'İkinci dalga', c: '#5B6169' },
  { k: 'ozel', t: 'Özel teklif', c: '#1F4E8C' },
];
export const statusOf = k => STATUS.find(s => s.k === k) || STATUS[0];

/* metraj tabanları: plandan / keşiften gelen değerler */
export const BASES = [
  { k: 'floor', t: 'Zemin', u: 'm²' }, { k: 'wall', t: 'Net duvar', u: 'm²' }, { k: 'ceil', t: 'Tavan', u: 'm²' },
  { k: 'tile', t: 'Zemin + duvar', u: 'm²' }, { k: 'wallceil', t: 'Duvar + tavan', u: 'm²' }, { k: 'perim', t: 'Çevre', u: 'm' },
  { k: 'plumb', t: 'Tesisat noktası', u: 'nokta' }, { k: 'elec', t: 'Elektrik noktası', u: 'nokta' }, { k: 'unit', t: 'Proje başına', u: 'adet' },
];
export const baseOf = k => BASES.find(b => b.k === k) || BASES.at(-1);
export const LINE_KINDS = [['mat', 'Malzeme'], ['lab', 'İşçilik'], ['sub', 'Taşeron'], ['oth', 'Diğer doğrudan']];

/* sekiz bileşen */
export const COMPONENTS = [
  ['def', 'Tanım', 'Müşteri ne satın alıyor?'], ['scope', 'Kapsam', 'Neler dahil, neler hariç?'], ['tech', 'Teknik reçete', 'Nasıl ve hangi standartla uygulanır?'],
  ['mat', 'Malzeme', 'Onaylı ürünler ve alternatifleri'], ['metraj', 'Metraj', 'Miktarlar nasıl hesaplanır?'], ['cost', 'Maliyet', 'Doğrudan giderler ve satış fiyatı'],
  ['prog', 'İş programı', 'İş sırası, süre ve bağımlılıklar'], ['qc', 'Kalite ve teslim', 'Kontroller, testler ve kayıtlar'],
];

const L = (k, d, base, f, x = {}) => ({ id: Math.random().toString(36).slice(2, 9), k, d, base, f, ...x });
const today = () => new Date().toISOString().slice(0, 10);

/* ── başlangıç kataloğu (yol haritasındaki ürünler; fiyatlar TAHMİNİ, tarihsiz → onay gerekir) ── */
function seedProducts() {
  const A = (code, name, cat, unit, base, lab, mat) => ({
    code, name, level: 'A', cat, unit, base, status: 'taslak', ver: 'V1.0', def: '', incl: [], excl: [], tech: '', metraj: `${baseOf(base).t} (${baseOf(base).u})`,
    recipe: [lab && L('lab', 'İşçilik', base, 1, { p: lab, u: baseOf(base).u }), mat && L('mat', 'Malzeme', base, 1, { m: { ess: mat } })].filter(Boolean), prog: [], qc: [], subs: [], pk: {}, pilots: 0,
  });
  const BN = {
    code: 'TB-BN', name: 'Banyo Yenileme', level: 'B', cat: 'banyo', unit: 'götürü', base: 'unit', status: 'pilot', ver: 'V1.0', group: 'TB Express', pilots: 0,
    def: 'Mevcut banyonun yerleşimi korunarak kontrollü söküm, tesisat, su yalıtımı, kaplama, vitrifiye ve teslim kontrollerini içeren birleşik yenileme ürünü. Fiyat keşif sonrası net kapsamlı tekliftir; süre teknik keşif ve iş programından sonra kesinleşir.',
    incl: [
      'Hazırlık: çalışma alanının korunması, su / elektrik izolasyonu, gerekli güvenlik önlemleri',
      'Söküm: mevcut seramik, vitrifiye ve tanımlı kaplamaların kontrollü sökümü',
      'Atık yönetimi: molozun toplanması ve izinli şekilde uzaklaştırılması',
      'Altyapı: keşifte belirlenen temiz su, pis su ve elektrik noktalarının yenilenmesi',
      'Yüzey hazırlığı: gerekli lokal sıva, tamir, tesviye ve eğim düzenlemeleri',
      'Su yalıtımı: uygun yüzey hazırlığı, köşe ve geçiş detayları, onaylı yalıtım sistemi',
      'Kaplama: standart seramik, yapıştırıcı, derz, birleşim ve bitiş detayları',
      'Montaj: seçilen vitrifiye, batarya, duş sistemi ve banyo aksesuarları',
      'Teslim: temizlik, fonksiyon testleri, fotoğraflı kontrol ve teslim tutanağı',
    ],
    excl: [
      'Taşıyıcı sisteme müdahale veya ruhsat gerektiren proje değişiklikleri',
      'Banyonun başka bir mahalle taşınması',
      'Bina ana tesisat hattının yenilenmesi',
      'Gizli ve önceden belirlenemeyen ciddi yapısal, tesisat veya nem problemleri',
      'Keşifte kapsamlandırılmamış özel dolap, niş, aydınlatma veya dekoratif uygulamalar',
      'Standart ürün listesi dışındaki müşteri seçimleri',
    ],
    tech: 'Islak hacim su yalıtımı yüzeye ve su etkisine uygun seçilir; eğim ve tahliye detayları çözülür, sistem bileşenleri birbiriyle uyumlu olur (İnşaat Genel Teknik Şartnamesi, TS EN 14891, TS 13780). Üzeri kapanacak imalatlar kontrol onayı olmadan sonraki aşamaya geçmez.\nStandart detaylar: zemin–duvar yalıtım birleşimi · duş süzgeci ve eğim · boru geçişleri · kapı eşiği ıslak–kuru geçiş · seramik köşe ve bitiş · asılı vitrifiye ve dolap montajı · asma tavan, aydınlatma, havalandırma.',
    metraj: 'Zemin ve net duvar alanı rölöve planından (kapı / pencere düşülmüş); tesisat noktaları plandaki donatılardan; vitrifiye, armatür ve dolap proje başına.',
    recipe: [
      L('lab', 'Kontrollü söküm (seramik + vitrifiye)', 'tile', 1, { p: 180, u: 'm²' }),
      L('oth', 'Moloz toplama ve bertaraf', 'unit', 1, { p: 3500, u: 'sefer' }),
      L('sub', 'Temiz su / pis su tesisat yenileme', 'unit', 1, { p: 22000, u: 'götürü' }),
      L('mat', 'Su yalıtım sistemi (zemin + duvar 30 cm)', 'floor', 1.6, { m: { ess: 'ML-SY-001' }, fire: 10 }),
      L('lab', 'Su yalıtımı uygulama', 'floor', 1.6, { p: 380, u: 'm²' }),
      L('mat', 'Zemin seramiği', 'floor', 1, { m: { ess: 'ML-SR-001', cmf: 'ML-SR-002', sig: 'ML-SR-003' }, fire: 10 }),
      L('mat', 'Duvar seramiği', 'wall', 1, { m: { ess: 'ML-SR-011', cmf: 'ML-SR-012', sig: 'ML-SR-013' }, fire: 12 }),
      L('mat', 'Yapıştırıcı ve derz dolgu', 'tile', 1, { m: { ess: 'ML-YP-001' }, fire: 5 }),
      L('lab', 'Seramik döşeme işçiliği', 'tile', 1, { p: 680, u: 'm²' }),
      L('mat', 'Vitrifiye seti (klozet, lavabo, duş)', 'unit', 1, { m: { ess: 'ML-VT-001', cmf: 'ML-VT-002', sig: 'ML-VT-003' } }),
      L('mat', 'Armatür seti (batarya, duş sistemi)', 'unit', 1, { m: { ess: 'ML-AR-001', cmf: 'ML-AR-002', sig: 'ML-AR-003' } }),
      L('mat', 'Banyo dolabı + ayna', 'unit', 1, { m: { ess: 'ML-DL-001', cmf: 'ML-DL-002', sig: 'ML-DL-003' } }),
      L('lab', 'Vitrifiye, armatür ve dolap montajı', 'unit', 1, { p: 6500, u: 'takım' }),
      L('oth', 'Nakliye, koruma ve temizlik sarfı', 'unit', 1, { p: 3000, u: 'götürü' }),
    ],
    prog: [
      { t: 'Hazırlık ve koruma', d: 0.5 }, { t: 'Kontrollü söküm ve moloz', d: 1 }, { t: 'Tesisat altyapısı', d: 1.5 }, { t: 'Yüzey hazırlığı ve eğim', d: 1 },
      { t: 'Su yalıtımı (kuruma dahil)', d: 2 }, { t: 'Seramik kaplama', d: 3 }, { t: 'Vitrifiye ve armatür montajı', d: 1 }, { t: 'Temizlik, test ve teslim', d: 0.5 },
    ],
    qc: [
      { k: 'K1', t: 'Söküm sonrası kontrol', d: 'Alt zemin, duvar durumu, tesisat ve gizli hasar tespiti' },
      { k: 'K2', t: 'Tesisat kontrolü', d: 'Bağlantı, sızdırmazlık ve gerekli işlev testleri' },
      { k: 'K3', t: 'Yalıtım öncesi kontrol', d: 'Yüzey, eğim, süzgeç ve köşe birleşimlerinin incelenmesi' },
      { k: 'K4', t: 'Yalıtım sonrası kontrol', d: 'Üretici sistemine uygun uygulama ve gerekli testlerin belgelenmesi' },
      { k: 'K5', t: 'Kaplama kontrolü', d: 'Kot, düzlem, derz, bitiş ve kaplama işçiliği' },
      { k: 'K6', t: 'Son kabul', d: 'Armatürler, tahliye, elektrik, temizlik ve eksik iş listesi' },
    ],
    subs: ['TB-YK-01', 'TB-ST-01', 'TB-SY-01', 'TB-SR-01', 'TB-SR-02'],
    pk: {
      ess: 'Seçilmiş ekonomik seramik serisi · güvenilir standart armatür · standart ölçü dolap · temel aydınlatma · paket görselleri',
      cmf: 'Orta-üst segment seramik · tasarım serisi armatür · geliştirilmiş dolap · ilave aydınlatma seçeneği · seçim önizlemesi',
      sig: 'Premium / özel ebat seramik · üst segment armatür · özel üretim dolap · özel aydınlatma planı · projeye özel görselleştirme',
    },
  };
  const BY = {
    code: 'TB-BY', name: 'Boya & Yüzey Yenileme', level: 'B', cat: 'boya', unit: 'm²', base: 'wallceil', status: 'pilot', ver: 'V1.0', pilots: 0, surf: true,
    def: 'Standart duvar ve tavan yüzeylerinde yüzey hazırlığı, lokal tamir, astar, boya ve temizliği içeren boya yenileme ürünü. Fiyat yüzey sınıfına (A / B / C) göre oluşur.',
    incl: ['Mobilya ve zeminin korunması (naylon, bant, koruma kartonu)', 'Yüzey hazırlığı: zımpara, lokal macun ve küçük onarımlar', 'Astar (gerekli yüzeylerde)', 'Duvar ve tavanlarda 2 kat boya', 'Temizlik ve teslim kontrolü'],
    excl: ['Aktif rutubet, kabarma ve yaygın bozuk sıva onarımı (C sınıfı — özel teklif)', 'Ahşap, metal ve dış cephe yüzeyleri', 'Ağır mobilya taşıma ve demontajı', 'Dekoratif boya ve özel efekt uygulamaları'],
    tech: 'Yüzey sınıflandırılır; korunacak alanlar belirlenir; astar ihtiyacı, boya sistemi ve kat sayısı, renk değişimi, erişim koşulları ve mobilya durumu keşifte kayda alınır. Duvar ve tavan ayrı yüzey grupları olarak uygulanır.',
    metraj: 'Duvar ve tavan ayrı yüzey grupları: duvar = net duvar alanı (kapı ve pencere boşlukları düşülmüş), tavan = zemin alanı.',
    recipe: [
      L('oth', 'Koruma ve temizlik sarfı', 'floor', 1, { p: 25, u: 'm²' }),
      L('lab', 'Yüzey hazırlığı (A sınıfı)', 'wallceil', 1, { p: 55, u: 'm²' }),
      L('lab', 'Ek hazırlık modülü (B sınıfı: çatlak, delik, macun)', 'wallceil', 1, { p: 95, u: 'm²', cls: 'B' }),
      L('mat', 'Astar', 'wallceil', 1, { m: { ess: 'ML-BY-010' }, fire: 5 }),
      L('mat', 'İç cephe boyası (2 kat)', 'wallceil', 1, { m: { ess: 'ML-BY-001', cmf: 'ML-BY-002', sig: 'ML-BY-003' }, fire: 5 }),
      L('lab', 'Astar + 2 kat boya işçiliği', 'wallceil', 1, { p: 140, u: 'm²' }),
    ],
    prog: [{ t: 'Koruma', d: 0.5 }, { t: 'Yüzey hazırlığı', d: 1 }, { t: 'Astar', d: 0.5 }, { t: '1. ve 2. kat boya', d: 1.5 }, { t: 'Rötuş, temizlik ve teslim', d: 0.5 }],
    qc: [
      { k: 'K1', t: 'Yüzey sınıflandırma', d: 'A / B / C sınıfı, rutubet ve sıva kontrolü, fotoğraflı kayıt' },
      { k: 'K2', t: 'Koruma kontrolü', d: 'Mobilya, zemin, priz ve doğramaların korunması' },
      { k: 'K3', t: 'Hazırlık ve astar kontrolü', d: 'Macun, zımpara, astar kapsaması' },
      { k: 'K4', t: 'Son kat kontrolü', d: 'Renk, örtücülük, iz ve akıntı kontrolü' },
      { k: 'K5', t: 'Son kabul', d: 'Rötuş, temizlik ve eksik iş listesi' },
    ],
    subs: ['TB-BY-01'],
    pk: { ess: 'Standart iç cephe boyası, beyaz / açık tonlar', cmf: 'Silinebilir mat boya, renk danışmanlığı', sig: 'Premium seri, özel renk ve tavan / duvar detayları' },
  };
  const MT = { ...A('TB-MT', 'Mutfak Yenileme', 'mutfak', 'götürü', 'unit', 0, ''), level: 'B', status: 'ikinci', def: 'Dolap, tezgâh, tesisat, duvar ve zemin yenileme alt ürünlerinden oluşan birleşik ürün (ikinci dalga).', recipe: [] };
  const RN = { ...A('TB-RN', 'Komple Konut Renovasyonu', 'diger', 'götürü', 'unit', 0, ''), level: 'B', status: 'ozel', def: 'Mimari tasarım, projelendirme, uygulama ve saha yönetimi içeren özel kapsamlı üst ürün — özel teklif.', recipe: [] };
  return [BN, BY, MT, RN,
    A('TB-BY-01', 'İç cephe boya yenileme', 'boya', 'm²', 'wallceil', 260, ''),
    A('TB-SR-01', 'Zemin seramik kaplama', 'seramik', 'm²', 'floor', 650, 'ML-SR-001'),
    A('TB-SR-02', 'Duvar seramik kaplama', 'seramik', 'm²', 'wall', 700, 'ML-SR-011'),
    A('TB-AL-01', 'Alçıpan asma tavan', 'alcipan', 'm²', 'ceil', 900, ''),
    A('TB-AL-02', 'Alçıpan bölme duvar', 'alcipan', 'm²', 'unit', 1100, ''),
    A('TB-YK-01', 'Kontrollü iç mekân yıkımı', 'yikim', 'm²', 'tile', 180, ''),
    A('TB-SY-01', 'Islak hacim su yalıtımı', 'yalitim', 'm²', 'floor', 380, 'ML-SY-001'),
    A('TB-EL-01', 'Elektrik tesisatı yenileme', 'elektrik', 'nokta', 'elec', 850, ''),
    A('TB-ST-01', 'Sıhhi tesisat yenileme', 'tesisat', 'nokta', 'plumb', 1400, ''),
  ];
}
function seedMaterials() {
  const M = (code, name, cat, use, level, unit, price, fire = 0, size = '') => ({ code, name, cat, use, level, unit, price, fire, size, brand: 'Onay sonrası belirlenecek', alt: '', supA: '', supB: '', lead: 0, upd: '', note: 'Tahmini fiyat — tedarikçi teyidi gerekli' });
  return [
    M('ML-SR-001', 'Porselen zemin seramiği (ekonomik seri)', 'Porselen seramik', 'Banyo zemini', 'ess', 'm²', 600, 10, '60 × 60 cm'),
    M('ML-SR-002', 'Porselen zemin seramiği (orta-üst seri)', 'Porselen seramik', 'Banyo zemini', 'cmf', 'm²', 950, 10, '60 × 120 cm'),
    M('ML-SR-003', 'Porselen zemin seramiği (premium / özel ebat)', 'Porselen seramik', 'Banyo zemini', 'sig', 'm²', 1800, 12, '120 × 120 cm'),
    M('ML-SR-011', 'Duvar seramiği (ekonomik seri)', 'Seramik', 'Banyo duvarı', 'ess', 'm²', 550, 12, '30 × 60 cm'),
    M('ML-SR-012', 'Duvar seramiği (orta-üst seri)', 'Porselen seramik', 'Banyo duvarı', 'cmf', 'm²', 900, 12, '60 × 120 cm'),
    M('ML-SR-013', 'Duvar seramiği (premium / özel ebat)', 'Porselen seramik', 'Banyo duvarı', 'sig', 'm²', 1700, 15, '120 × 280 cm'),
    M('ML-YP-001', 'Seramik yapıştırıcısı + derz dolgu (C2TE / CG2)', 'Yapı kimyasalı', 'Seramik uygulama', 'all', 'm²', 95, 5),
    M('ML-SY-001', 'Çimento esaslı esnek su yalıtım sistemi (TS EN 14891)', 'Su yalıtımı', 'Islak hacim', 'all', 'm²', 180, 10),
    M('ML-VT-001', 'Vitrifiye seti — standart', 'Vitrifiye', 'Banyo', 'ess', 'takım', 18000),
    M('ML-VT-002', 'Vitrifiye seti — tasarım serisi', 'Vitrifiye', 'Banyo', 'cmf', 'takım', 32000),
    M('ML-VT-003', 'Vitrifiye seti — üst segment', 'Vitrifiye', 'Banyo', 'sig', 'takım', 60000),
    M('ML-AR-001', 'Armatür seti — güvenilir standart seri', 'Armatür', 'Banyo', 'ess', 'takım', 9000),
    M('ML-AR-002', 'Armatür seti — tasarım serisi', 'Armatür', 'Banyo', 'cmf', 'takım', 16000),
    M('ML-AR-003', 'Armatür seti — üst segment', 'Armatür', 'Banyo', 'sig', 'takım', 35000),
    M('ML-DL-001', 'Banyo dolabı + ayna — standart ölçü', 'Banyo dolabı', 'Banyo', 'ess', 'takım', 9000),
    M('ML-DL-002', 'Banyo dolabı + ayna — geliştirilmiş', 'Banyo dolabı', 'Banyo', 'cmf', 'takım', 16000),
    M('ML-DL-003', 'Banyo dolabı + ayna — özel üretim', 'Banyo dolabı', 'Banyo', 'sig', 'takım', 35000),
    M('ML-BY-001', 'İç cephe boyası (2 kat) — standart', 'Boya', 'İç duvar / tavan', 'ess', 'm²', 55, 5),
    M('ML-BY-002', 'Silinebilir mat iç cephe boyası (2 kat)', 'Boya', 'İç duvar / tavan', 'cmf', 'm²', 85, 5),
    M('ML-BY-003', 'Premium iç cephe boyası (2 kat)', 'Boya', 'İç duvar / tavan', 'sig', 'm²', 130, 5),
    M('ML-BY-010', 'Astar', 'Boya', 'İç duvar / tavan', 'all', 'm²', 18, 5),
  ];
}

/* ── dönüşüm programı ── */
export const PHASES = [
  ['01', 'Ürün standartlaştırma', '1–4. hafta', 'Hizmet kataloğu, paketler, teknik şartnameler, malzeme sistemleri, maliyet reçeteleri'],
  ['02', 'Operasyon standartlaştırma', '5–8. hafta', 'Keşif, teklif, satın alma, iş programı, şantiye kalite kontrolü'],
  ['03', 'Dijital sistem entegrasyonu', '7–12. hafta', 'Ürün kataloğu, otomatik metraj-teklif, müşteri paneli ve dijital tadilat karnesi'],
  ['04', 'Pilot projeler ve optimizasyon', '9–16. hafta', 'Gerçek maliyet, süre ve müşteri memnuniyeti testleri'],
  ['05', 'Satış ve dağıtım kanalları', '13–20. hafta', 'Web ürün sayfaları, dijital reklam, site yönetimleri ve iş ortaklıkları'],
  ['06', 'Ölçekleme ve yeni ürünler', '21–26. hafta', 'Yeni tadilat paketleri, ekip kapasitesi ve TB Care hizmeti'],
];
export const WEEKS = [
  ['1. Hafta — Veri toplama ve ürün tanımı', '2–8 Kasım', ['Son tamamlanan 15–20 işin maliyet, metraj ve süre verilerini toplamak', 'Hizmet kataloğu ve ürün kodlama standardını kesinleştirmek', 'Boya ve banyo ürünleri için kapsam ve istisnaları oluşturmak', 'A/B/C keşif ve proje sınıflandırmasını hazırlamak']],
  ['2. Hafta — Teknik reçeteler ve tedarikçiler', '9–15 Kasım', ['İki ürünün teknik iş kalemlerini ve uygulama sırasını belirlemek', 'Onaylı malzeme listesini ve alternatif tedarikçileri oluşturmak', 'Standart detayları ve teknik şartname taslaklarını hazırlamak', 'Kalite kontrol ve fotoğraflama formlarını hazırlamak']],
  ['3. Hafta — Fiyatlandırma ve satış sistemi', '16–22 Kasım', ['Malzeme, işçilik ve lojistik maliyet reçetelerini oluşturmak', 'Hedef marj, risk karşılığı ve fiyat onay kurallarını belirlemek', 'Keşif ve teklif şablonlarını ürünlerle ilişkilendirmek', 'Paket seçenekleri ve müşteri satış sayfalarını hazırlamak']],
  ['4. Hafta — Kontrol, test ve onay', '23–29 Kasım', ['Ekiplerle masa başı ve saha uygulanabilirlik testleri yapmak', 'En az iki geçmiş işi yeni maliyet reçeteleriyle yeniden hesaplamak', 'Eksikleri düzeltip ürün dosyalarına V1.0 sürüm onayı vermek', 'İlk gerçek pilot müşteri işlerini ve ölçüm planını belirlemek']],
];
export const PILOT_KPI = [
  ['Teknik dosya ve kontrol formlarının tamamlanması', '%100'], ['Onaylanmış kapsam dışı işlerin kayıt oranı', '%100'],
  ['Gerçek maliyet ile hedef maliyet arasındaki sapma', 'En fazla %5–10'], ['Kritik kalite kontrollerinin tamamlanması', '%100'],
  ['Teklif hazırlama süresi', 'Uygun keşif sonrası en fazla 48 saat'], ['Müşteri onayı olmadan ekstra maliyet', '0'], ['Ürün kaynaklı kritik kalite hatası', '0'],
];

export function ensureUrun(st) {
  if (st.urun?.products) return false;
  st.urun = { v: 1, products: seedProducts(), materials: seedMaterials(), road: { done: {} }, cfg: { risk: 5, margin: 30, staleDays: 45 } };
  return true;
}
export const productCode = (p, pk) => p.level === 'B' && p.pk && Object.keys(p.pk).length ? `${p.code}-${pkOf(pk).s}-01` : p.code;

/* ── sekiz bileşen hazırlığı ── */
export function readiness(p, U) {
  const lib = U.materials || [], mats = p.recipe.filter(l => l.k === 'mat');
  const priced = p.recipe.length > 0 && p.recipe.every(l => l.k === 'mat' ? Object.values(l.m || {}).every(c => lib.find(m => m.code === c)?.price > 0) : +l.p > 0);
  const r = {
    def: !!p.def?.trim(), scope: p.incl?.length > 0 && p.excl?.length > 0, tech: !!p.tech?.trim(),
    mat: mats.length > 0 && mats.every(l => Object.values(l.m || {}).every(c => lib.some(m => m.code === c))),
    metraj: !!p.metraj?.trim() && p.recipe.length > 0, cost: priced, prog: p.prog?.length > 0, qc: p.qc?.length > 0,
  };
  return { r, n: Object.values(r).filter(Boolean).length };
}
/* satışa açılma koşulu: 8/8 bileşen + en az iki pilot uygulama */
export const canSell = (p, U) => readiness(p, U).n === 8 && (p.pilots || 0) >= 2;

/* ── metraj ── */
export function quantities(met, roomIds, fx = {}) {
  const rs = roomIds?.length ? met.rooms.filter(r => roomIds.includes(r.id)) : met.rooms;
  const S = k => rs.reduce((s, r) => s + (+r[k] || 0), 0);
  const floor = S('area'), wall = S('wallArea'), ceil = S('ceil') || floor;
  return { floor, wall, ceil, tile: floor + wall, wallceil: wall + ceil, perim: S('perim'), plumb: fx.plumb || 0, elec: fx.elec || 0, unit: 1 };
}

/* ── maliyet reçetesi hesabı ──
   Satış fiyatı = (doğrudan maliyet + risk karşılığı) / (1 − hedef brüt marj) */
export function calcSel(sel, p, U, q) {
  const lib = U.materials || [], cfg = { ...U.cfg, ...(sel.cfg || {}) }, staleD = +cfg.staleDays || 45, rows = [], warn = [];
  const age = d => d ? (Date.now() - new Date(d).getTime()) / 864e5 : Infinity;
  for (const l of p.recipe) {
    if (l.cls && l.cls !== sel.surf) continue;
    if (l.pkOnly?.length && !l.pkOnly.includes(sel.pk)) continue;
    const qty = (q[l.base] ?? 0) * (+l.f || 1);
    if (!(qty > 0)) continue;
    let unit = 0, fire = +l.fire || 0, name = l.d, u = l.u || baseOf(l.base).u, src = null;
    if (l.k === 'mat') {
      const code = l.m?.[sel.pk] || l.m?.ess || Object.values(l.m || {})[0], m = lib.find(x => x.code === code);
      src = m; unit = +m?.price || 0; fire = l.fire ?? m?.fire ?? 0; u = m?.unit || u; name = `${l.d}${m ? ' — ' + m.name : ''}`;
      if (!m) warn.push(`${l.d}: malzeme kütüphanede yok (${code || 'kod yok'})`);
      else if (!(unit > 0)) warn.push(`${m.code}: fiyat girilmemiş`);
      else if (age(m.upd) > staleD) warn.push(`${m.code}: fiyat ${m.upd ? Math.round(age(m.upd)) + ' günlük' : 'tarihsiz (tahmini)'} — tedarikçi teyidi gerekli`);
    } else { unit = +l.p || 0; if (!(unit > 0)) warn.push(`${l.d}: birim fiyat girilmemiş`); }
    const cost = qty * (1 + fire / 100) * unit;
    rows.push({ k: l.k, name, qty, u, unit, fire, cost, code: src?.code || '' });
  }
  const by = k => rows.filter(r => r.k === k).reduce((s, r) => s + r.cost, 0);
  const mat = by('mat'), lab = by('lab'), sub = by('sub'), oth = by('oth'), direct = mat + lab + sub + oth;
  const risk = direct * (+cfg.risk || 0) / 100, margin = Math.min(0.9, (+cfg.margin || 0) / 100);
  const price = (direct + risk) / (1 - margin), gross = price - direct - risk;
  const days = (p.prog || []).reduce((s, x) => s + (+x.d || 0), 0);
  return { rows, mat, lab, sub, oth, direct, risk, price, gross, margin, warn, days };
}
export const simPrice = (direct, riskPct, marginPct) => { const risk = direct * riskPct / 100, price = (direct + risk) / (1 - Math.min(0.9, marginPct / 100)); return { risk, cost: direct + risk, price, gross: price - direct - risk }; };
export { today };
