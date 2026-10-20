/* ═══ İş sonu müşteri değerlendirme anketi — sorular (uygulama ve müşteri sayfası ortak) ═══ */
export const FEEDBACK_Q = [
  { id: 'genel',    t: 'Genel memnuniyetiniz', type: 'stars', main: true },
  { id: 'iscilik',  t: 'İşçilik kalitesi', type: 'stars' },
  { id: 'takvim',   t: 'Takvime uyum', type: 'stars' },
  { id: 'temizlik', t: 'Temizlik ve düzen', type: 'stars' },
  { id: 'iletisim', t: 'İletişim ve bilgilendirme', type: 'stars' },
  { id: 'fiyat',    t: 'Fiyat / performans', type: 'stars' },
  { id: 'nps',      t: 'TadilatBodrum.com\'u bir yakınınıza tavsiye etme olasılığınız', type: 'nps' },
  { id: 'yorum',    t: 'Görüş ve önerileriniz', type: 'text' },
  { id: 'izin',     t: 'Yorumumun web sitesinde adımın baş harfleriyle yayınlanmasına izin veriyorum', type: 'check' },
];
export const STAR_Q = FEEDBACK_Q.filter(q => q.type === 'stars');
/* bir yanıtın yıldız ortalaması (yanıtlanmış yıldız soruları üzerinden) */
export function fbScore(a = {}) {
  const v = STAR_Q.map(q => +a[q.id]).filter(x => x >= 1 && x <= 5);
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : 0;
}
