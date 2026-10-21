/* ═══ Demo hesabı ═══
 * Kullanıcı adı DEMO / şifre demo2026 ile girilir. Bulut (Firebase) kullanılmaz: veriler bu cihazda,
 * gerçek işlerden ayrı bir tarayıcı veritabanında (tb-saha-demo) tutulur; gerçek müşteri kayıtlarına erişim yoktur.
 * İlk girişte örnek işler oluşturulur; "Demo verilerini sıfırla" ile baştan kurulur.
 */
import { newJob, uid } from './store.js';
import { emptyPlan, rectRoom } from './plan-geom.js';
import { newQuote } from './quote.js';
import { newExec } from './exec.js';

export const DEMO_USER = 'demo', DEMO_PASS = 'demo2026', DEMO_MODE = 'demo';

/* örnek daire planı (salon, mutfak, yatak odası, banyo) */
export function samplePlan() {
  const p = emptyPlan();
  const salon = rectRoom(p, 0, 0, 520, 420, 'Salon');
  const mutfak = rectRoom(p, 520 + 15, 0, 300, 420, 'Mutfak');
  const yatak = rectRoom(p, 0, 420 + 15, 380, 360, 'Yatak Odası');
  const banyo = rectRoom(p, 380 + 15, 420 + 15, 230, 260, 'Banyo');
  mutfak.floor = 'seramik'; banyo.floor = 'mermer'; banyo.wallColor = '#DDE4E4'; salon.floor = 'parke';
  const w = id => p.walls.find(x => x.id === id);
  const op = (wid, type, pos, wd, hh, sill) => wid && p.openings.push({ id: uid('o'), wallId: wid, type, pos, w: wd, h: hh, sill, flip: false, side: 1 });
  op(salon.walls[0], 'window', 260, 180, 150, 80); op(salon.walls[3], 'door', 200, 100, 215, 0);
  op(mutfak.walls[0], 'window', 150, 120, 120, 100); op(mutfak.walls[3] || salon.walls[1], 'gap', 210, 120, 220, 0);
  op(yatak.walls[3], 'window', 180, 140, 140, 90); op(yatak.walls[0] || salon.walls[2], 'door', 280, 90, 210, 0);
  op(banyo.walls[0] || yatak.walls[1], 'door', 120, 80, 210, 0); op(banyo.walls[1], 'window', 130, 60, 60, 150);
  const it = (type, x, y, rot = 0, wd, d) => { const f = { koltuk: [85, 85, 85, '#C7A27A'], kanepe: [220, 90, 85, '#9AA3AE'], sehpa: [110, 60, 40, '#6E5341'], tv: [180, 45, 50, '#2E3135'], yatak: [160, 200, 50, '#ECE8E1'], gardirop: [200, 60, 240, '#F2F0EC'], tezgah: [300, 62, 90, '#F4F4F2'], ada: [180, 90, 90, '#22B8C8'], buzdolabi: [70, 70, 190, '#D9DCDF'], klozet: [38, 60, 40, '#FFFFFF'], lavabo: [80, 48, 85, '#FFFFFF'], dus: [90, 90, 5, '#F5F5F5'], bitki: [50, 50, 120, '#4F8A4B'], masa: [180, 90, 75, '#8A6A4F'] }[type]; p.items.push({ id: uid('i'), type, label: type, x, y, w: wd || f[0], d: d || f[1], h: f[2], z: 0, rot, color: f[3] }); };
  it('kanepe', 260, 340, 180); it('sehpa', 260, 270); it('tv', 260, 25); it('bitki', 480, 380); it('koltuk', 75, 290, 90);
  it('tezgah', 535 + 31, 210, 270, 300); it('ada', 535 + 185, 250, 90); it('buzdolabi', 535 + 260, 40);
  it('yatak', 190, 435 + 260, 180); it('gardirop', 190, 435 + 31, 0);
  it('klozet', 395 + 30, 435 + 230, 180); it('lavabo', 395 + 150, 435 + 236, 180); it('dus', 395 + 185, 435 + 50);
  p.items.forEach(x => { x.label = { koltuk: 'Berjer', kanepe: 'Kanepe', sehpa: 'Sehpa', tv: 'TV', bitki: 'Bitki', masa: 'Masa', tezgah: 'Tezgah', ada: 'Ada', buzdolabi: 'Buzdolabı', yatak: 'Yatak', gardirop: 'Gardırop', klozet: 'WC', lavabo: 'Lavabo', dus: 'Duş' }[x.type]; });
  return p;
}

const day = (n = 0) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const ago = n => Date.now() - n * 864e5;

/* örnek işler: farklı aşamalarda dört iş */
export function demoJobs(settings) {
  const cat = id => settings.catalog?.find(c => c.id === id);
  const qi = (id, qty, fb) => { const c = cat(id) || fb; return { id: uid('q'), cat: c.cat, desc: c.desc, unit: c.unit, price: c.price, qty, qtyKey: c.qty || '' }; };
  const rq = (category, room, text, status = 'kapsamda') => ({ id: uid('rq'), category, room, text, priority: 'normal', status, t: ago(10) });
  const fd = (category, room, severity, title, desc, action) => ({ id: uid('f'), t: ago(8), category, room, severity, title, desc, action });

  const a = newJob('DEMO-001');
  Object.assign(a, { status: 'talep', createdAt: ago(1), updatedAt: ago(1), summary: 'Banyo yenileme ve salon boyası için keşif talebi.' });
  Object.assign(a.customer, { name: 'Ayşe Yılmaz (örnek)', phone: '0555 000 00 01', district: 'Bitez', address: 'Örnek Sitesi B Blok No: 4', source: 'Web sitesi' });
  a.requests.push(rq('banyo', 'Banyo', 'Banyo komple yenilensin, duş teknesi yerine yerden duş', 'acik'), rq('boya', 'Salon', 'Salon ve koridor boyası', 'acik'));

  const b = newJob('DEMO-002');
  Object.assign(b, { status: 'kesif', createdAt: ago(6), updatedAt: ago(2), kesifDate: day(-2), assigned: 'Demo Kullanıcı', summary: '3+1 dairede mutfak ve banyo yenileme.' });
  Object.assign(b.customer, { name: 'Mehmet Kaya (örnek)', phone: '0555 000 00 02', district: 'Yalıkavak', address: 'Örnek Cad. No: 12 D: 3', source: 'Tavsiye' });
  Object.assign(b.property, { type: 'Daire', area: '120', floor: '2', age: '15' });
  b.plan = samplePlan();
  b.requests.push(rq('mutfak', 'Mutfak', 'Mutfak dolapları ve tezgah yenilensin, ada eklensin'), rq('banyo', 'Banyo', 'Banyo seramik ve vitrifiye yenileme'), rq('zemin', 'Salon', 'Salona laminat parke'));
  b.findings.push(
    fd('tesisat', 'Banyo', 'yuksek', 'Banyo tavanında rutubet lekesi', 'Üst kat banyosundan sızıntı şüphesi; nem ölçümü %28.', 'Üst kat ile görüşülüp tesisat kontrolü, ardından su yalıtımı.'),
    fd('elektrik', 'Mutfak', 'orta', 'Mutfakta kuvvet hattı yok', 'Fırın ve ocak için ayrı hat çekilmemiş.', 'Panodan 6 mm² kuvvet hattı çekilmeli.'),
    fd('zemin', 'Salon', 'dusuk', 'Parke altında hafif kot farkı', 'Pencere önünde 6 mm kot farkı.', 'Tesviye şapı ile düzeltme.'));
  Object.assign(b.survey, { answers: { mulkTipi: 'Daire', kullanim: 'Sürekli oturum', odaSayisi: '3+1', banyoSayisi: 2, asansor: true }, updatedAt: ago(2) });

  const c = newJob('DEMO-003');
  Object.assign(c, { status: 'teklif', createdAt: ago(14), updatedAt: ago(1), kesifDate: day(-10), assigned: 'Demo Kullanıcı', summary: 'Villa mutfak yenileme teklifi.' });
  Object.assign(c.customer, { name: 'Zeynep Demir (örnek)', phone: '0555 000 00 03', district: 'Gündoğan', address: 'Örnek Villaları No: 7', source: 'Instagram' });
  c.plan = samplePlan();
  c.requests.push(rq('mutfak', 'Mutfak', 'Mutfak komple yenileme'), rq('elektrik', 'Mutfak', 'Spot aydınlatma ve tezgah prizleri'));
  c.quote = newQuote(c, settings);
  c.quote.items.push(qi('mf-alt', 4.2, { cat: 'mutfak', desc: 'Mutfak alt dolap', unit: 'm', price: 9500 }), qi('mf-ust', 3.6, { cat: 'mutfak', desc: 'Mutfak üst dolap', unit: 'm', price: 7000 }),
    qi('mf-boy', 1, { cat: 'mutfak', desc: 'Mutfak boy dolabı', unit: 'adet', price: 16000 }), qi('mf-tez', 4.2, { cat: 'mutfak', desc: 'Mutfak tezgahı', unit: 'm', price: 6500 }));
  c.quote.intro = 'Keşif ve görüşmemiz doğrultusunda mutfak yenileme teklifimiz aşağıdadır.';

  const d = newJob('DEMO-004');
  Object.assign(d, { status: 'uygulama', createdAt: ago(30), updatedAt: ago(0), kesifDate: day(-25), assigned: 'Demo Kullanıcı', summary: 'Daire boya ve banyo yenileme — uygulamada.' });
  Object.assign(d.customer, { name: 'Can Öztürk (örnek)', phone: '0555 000 00 04', district: 'Turgutreis', address: 'Örnek Mah. 3. Sok. No: 9', source: 'Web sitesi' });
  d.plan = samplePlan();
  d.requests.push(rq('boya', '', 'Tüm daire iç cephe boyası'), rq('banyo', 'Banyo', 'Banyo yenileme'));
  d.quote = newQuote(d, settings);
  d.quote.items.push(qi('mf-alt', 3, { cat: 'mutfak', desc: 'Mutfak alt dolap', unit: 'm', price: 9500 }));
  d.quote.items.push({ id: uid('q'), cat: 'boya', desc: 'İç cephe boyası (2 kat, astar dahil)', unit: 'm²', qty: 240, price: 180, qtyKey: '' }, { id: uid('q'), cat: 'banyo', desc: 'Banyo yenileme (seramik + vitrifiye + işçilik)', unit: 'adet', qty: 1, price: 85000, qtyKey: '' });
  d.exec = newExec(d, { start: day(-6), manager: 'Demo Kullanıcı' });
  d.exec.started = ago(6);
  d.exec.tasks.forEach((t, i) => { t.status = i === 0 ? 'tamam' : i === 1 ? 'devam' : 'bekliyor'; if (i === 0) t.done = ago(2); });
  d.exec.pays = [{ id: uid('p'), date: day(-6), amount: 50000, kind: 'avans', note: 'Sözleşme avansı' }];
  [a, b, c, d].forEach(j => j.log.push({ t: j.updatedAt, text: 'Demo verisi' }));
  return [a, b, c, d];
}
