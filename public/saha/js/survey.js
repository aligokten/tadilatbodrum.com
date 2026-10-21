/* ═══ Detaylı müşteri anketi — tadilat kapsamı ve detaylarının belirlenmesi ═══ */
import { CATEGORIES } from './catalog.js';
import { esc, icon, $, $$ } from './ui.js';

const has = (a, k) => (a.kapsam || []).includes(k);
const any = (a, ...ks) => ks.some(k => has(a, k));

/* q: { id, t, type: text|textarea|number|date|single|multi|scale|yesno, o: [...], hint, unit } */
export const SURVEY = [
  { id: 'mulk', t: 'Mülk ve Kullanım', ic: 'home', q: [
    { id: 'mulkTipi', t: 'Mülk tipi', type: 'single', o: ['Daire', 'Villa', 'Müstakil ev', 'Rezidans', 'Yazlık site', 'Ofis / İşyeri', 'Otel / Pansiyon', 'Dükkan'] },
    { id: 'kullanim', t: 'Mülk nasıl kullanılıyor / kullanılacak?', type: 'single', o: ['Sürekli oturum', 'Yazlık / sezonluk', 'Uzun dönem kiralık', 'Günlük kiralık (Airbnb)', 'Satışa hazırlık', 'Ticari kullanım'] },
    { id: 'brutM2', t: 'Brüt alan', type: 'number', unit: 'm²' },
    { id: 'netM2', t: 'Net kullanım alanı', type: 'number', unit: 'm²' },
    { id: 'odaSayisi', t: 'Oda sayısı', type: 'single', o: ['1+0', '1+1', '2+1', '3+1', '4+1', '5+1 ve üzeri'] },
    { id: 'banyoSayisi', t: 'Banyo / WC sayısı', type: 'number', unit: 'adet' },
    { id: 'kat', t: 'Bulunduğu kat / toplam kat', type: 'text', hint: 'örn. 2 / 4' },
    { id: 'binaYasi', t: 'Bina yaşı', type: 'single', o: ['0–5', '5–10', '10–20', '20–30', '30+', 'Bilinmiyor'] },
    { id: 'asansor', t: 'Asansör var mı?', type: 'yesno' },
    { id: 'erisim', t: 'Malzeme indirme / araç erişimi', type: 'single', o: ['Kapıya kadar araç girer', 'Kısa taşıma gerekir', 'Uzun / merdivenli taşıma', 'Tekne / özel ulaşım'] },
    { id: 'site', t: 'Site yönetimi kısıtları', type: 'multi', o: ['Çalışma saati kısıtı', 'Sezonda (Haz–Eyl) tadilat yasağı', 'Yönetim izni gerekli', 'Ortak alan koruma zorunlu', 'Kısıt yok'] },
    { id: 'oturum', t: 'Tadilat süresince evde oturulacak mı?', type: 'single', o: ['Evet, tamamen', 'Kısmen (bazı odalar)', 'Hayır, ev boş olacak'] },
    { id: 'hassas', t: 'Dikkat edilmesi gereken durumlar', type: 'multi', o: ['Evcil hayvan', 'Bebek / küçük çocuk', 'Yaşlı / engelli birey', 'Toz alerjisi', 'Evden çalışan kişi'] },
  ]},
  { id: 'kapsamS', t: 'Kapsam ve Öncelikler', ic: 'clipboard', q: [
    { id: 'kapsam', t: 'Hangi işler yapılacak?', type: 'multi', o: CATEGORIES.map(c => c.t), keys: CATEGORIES.map(c => c.k), hint: 'Seçimlere göre ilgili detay bölümleri açılır' },
    { id: 'olcek', t: 'Tadilatın ölçeği', type: 'single', o: ['Hafif yenileme (boya, ufak onarım)', 'Orta (birkaç mahal)', 'Kapsamlı (tüm ev)', 'Anahtar teslim (proje + uygulama)'] },
    { id: 'sebep', t: 'Tadilatın sebebi', type: 'multi', o: ['Yıpranma / eskime', 'Estetik yenileme', 'Arıza / kaçak / rutubet', 'Yeni satın alındı', 'Satış / kiraya hazırlık', 'Enerji verimliliği', 'Aile ihtiyacı değişti'] },
    { id: 'oncelik', t: 'En öncelikli 3 iş nedir?', type: 'textarea' },
    { id: 'sorunlar', t: 'Şu an yaşanan sorunlar (kaçak, nem, çatlak, arıza…)', type: 'textarea' },
  ]},
  { id: 'butce', t: 'Bütçe ve Zamanlama', ic: 'calendar', q: [
    { id: 'butceAraligi', t: 'Öngörülen bütçe', type: 'single', o: ['100.000 ₺ altı', '100–250 bin ₺', '250–500 bin ₺', '500 bin – 1 milyon ₺', '1–2 milyon ₺', '2 milyon ₺ üzeri', 'Henüz belirsiz'] },
    { id: 'odeme', t: 'Ödeme tercihi', type: 'single', o: ['Peşin', 'Aşamalı (hakediş)', 'Kredi kartı / taksit', 'Görüşülecek'] },
    { id: 'baslangic', t: 'İstenen başlangıç tarihi', type: 'date' },
    { id: 'bitis', t: 'İşin bitmesi gereken tarih', type: 'date' },
    { id: 'sureEsnek', t: 'Zaman esnekliği', type: 'scale', o: ['Çok katı', '', 'Orta', '', 'Çok esnek'] },
    { id: 'butceEsnek', t: 'Bütçe esnekliği', type: 'scale', o: ['Çok katı', '', 'Orta', '', 'Çok esnek'] },
  ]},
  { id: 'tarz', t: 'Tarz, Renk ve Malzeme', ic: 'sparkle', q: [
    { id: 'stil', t: 'Beğenilen tarz', type: 'multi', o: ['Modern', 'Minimal', 'Ege / Bodrum taş-beyaz', 'Akdeniz', 'Skandinav', 'Japandi', 'Endüstriyel', 'Klasik', 'Rustik', 'Boho'] },
    { id: 'renk', t: 'Renk paleti', type: 'multi', o: ['Beyaz / krem', 'Toprak tonları', 'Gri tonları', 'Mavi / turkuaz', 'Yeşil tonları', 'Koyu / kontrast', 'Ahşap ağırlıklı'] },
    { id: 'segment', t: 'Malzeme kalite segmenti', type: 'single', o: ['Ekonomik', 'Orta', 'Üst', 'Lüks / ithal'] },
    { id: 'tedarik', t: 'Malzemeyi kim temin edecek?', type: 'single', o: ['TadilatBodrum.com', 'Müşteri', 'Karma (bazılarını müşteri)'] },
    { id: 'referans', t: 'Beğenilen örnekler (Pinterest / Instagram linkleri, notlar)', type: 'textarea' },
    { id: 'istenmeyen', t: 'Kesinlikle istenmeyenler', type: 'textarea' },
    { id: 'korunacak', t: 'Korunacak / tekrar kullanılacak eşya ve malzemeler', type: 'textarea' },
  ]},
  { id: 'banyoS', t: 'Banyo Detayları', ic: 'bath', when: a => has(a, 'banyo'), q: [
    { id: 'b_islem', t: 'Yapılacak işlem', type: 'single', o: ['Komple yenileme (söküm dahil)', 'Sadece vitrifiye/armatür değişimi', 'Fayans üzerine kaplama', 'Onarım'] },
    { id: 'b_dus', t: 'Duş / küvet tercihi', type: 'single', o: ['Zemine gömme duş (sıfır eşik)', 'Duş teknesi', 'Küvet', 'Küvet + duş'] },
    { id: 'b_vitrifiye', t: 'Vitrifiye ve armatür', type: 'multi', o: ['Asma klozet + gömme rezervuar', 'Taharet/bide', 'Ankastre batarya', 'Tepe duşu', 'Çift lavabo', 'Havlupan', 'Aynalı dolap', 'Çamaşır makinesi yeri'] },
    { id: 'b_fayans', t: 'Fayans ebatı', type: 'multi', o: ['30×60', '60×60', '60×120', 'Büyük ebat (120×280)', 'Mozaik', 'Mikro beton (derzsiz)'] },
    { id: 'b_ozel', t: 'Ek istekler', type: 'multi', o: ['Yerden ısıtma', 'Niş / raf', 'Epoksi derz', 'Gizli LED', 'Cam duşakabin', 'Pencere havalandırma'] },
  ]},
  { id: 'mutfakS', t: 'Mutfak Detayları', ic: 'kitchen', when: a => has(a, 'mutfak'), q: [
    { id: 'm_yerlesim', t: 'Yerleşim', type: 'single', o: ['Tek duvar', 'L', 'U', 'Paralel', 'Ada', 'Mevcut yerleşim korunacak'] },
    { id: 'm_kapak', t: 'Dolap kapağı', type: 'single', o: ['Lake', 'Akrilik', 'Membran', 'Ahşap kaplama', 'Laminat'] },
    { id: 'm_tezgah', t: 'Tezgah', type: 'single', o: ['Kuvars', 'Porselen', 'Granit', 'Mermer', 'Masif ahşap', 'Laminat'] },
    { id: 'm_cihaz', t: 'Ankastre cihazlar', type: 'multi', o: ['Ocak', 'Fırın', 'Davlumbaz', 'Bulaşık makinesi', 'Buzdolabı (ankastre)', 'Mikrodalga', 'Derin dondurucu (tezgah altı)', 'Şarap dolabı'] },
    { id: 'm_tesisat', t: 'Su / gider / ocak yeri değişecek mi?', type: 'yesno' },
    { id: 'm_sokum', t: 'Mevcut mutfak sökülecek mi?', type: 'yesno' },
  ]},
  { id: 'yuzeyS', t: 'Zemin, Duvar ve Tavan', ic: 'floor', when: a => any(a, 'zemin', 'seramik', 'boya', 'alcipan', 'yikim'), q: [
    { id: 'z_tercih', t: 'Zemin kaplaması', type: 'multi', o: ['Laminat', 'Lamine / masif parke', 'Seramik / granit', 'Mermer / traverten', 'Mikro beton', 'Epoksi', 'Mevcut korunacak'] },
    { id: 'z_supurgelik', t: 'Süpürgelik', type: 'single', o: ['MDF boyalı', 'Seramik', 'Gizli / gölge boşluklu', 'Gerek yok'] },
    { id: 'd_islem', t: 'Duvar işlemleri', type: 'multi', o: ['Boya', 'Saten alçı + boya', 'Duvar kağıdı', 'Dekoratif sıva', 'Lambri / ahşap', 'Taş / tuğla kaplama'] },
    { id: 't_islem', t: 'Tavan', type: 'multi', o: ['Boya', 'Alçıpan asma tavan', 'Gizli ışık bandı', 'Kartonpiyer', 'Ahşap tavan'] },
    { id: 'd_yikim', t: 'Duvar kaldırma / yeni bölme var mı?', type: 'yesno', hint: 'Taşıyıcı duvar için statik inceleme gerekir' },
    { id: 'd_yikimNot', t: 'Yıkım / bölme detayları', type: 'textarea' },
  ]},
  { id: 'tesisatS', t: 'Elektrik, Tesisat ve İklimlendirme', ic: 'bolt', when: a => any(a, 'elektrik', 'tesisat', 'iklim'), q: [
    { id: 'e_pano', t: 'Sigorta panosu yenilensin mi?', type: 'yesno' },
    { id: 'e_priz', t: 'Ek priz / anahtar ihtiyacı', type: 'number', unit: 'nokta' },
    { id: 'e_aydinlatma', t: 'Aydınlatma', type: 'multi', o: ['Spot', 'Lineer LED', 'Avize / sarkıt', 'Dimmer', 'Akıllı aydınlatma', 'Dış mekan aydınlatma'] },
    { id: 'e_akilli', t: 'Akıllı ev / zayıf akım', type: 'multi', o: ['Akıllı ev otomasyonu', 'Data / Wi-Fi altyapısı', 'TV / uydu hattı', 'Kamera', 'Alarm', 'Görüntülü diyafon', 'Elektrikli araç şarjı'] },
    { id: 'i_isitma', t: 'Isıtma / soğutma', type: 'multi', o: ['Kombi + petek', 'Yerden ısıtma', 'Split klima', 'Kaset tipi klima', 'VRF / kanal tipi', 'Isı pompası', 'Şömine / soba'] },
    { id: 'i_klima', t: 'Klima adedi', type: 'number', unit: 'adet' },
    { id: 's_sicak', t: 'Sıcak su', type: 'single', o: ['Kombi', 'Elektrikli termosifon', 'Güneş enerjisi', 'Isı pompası'] },
    { id: 's_depo', t: 'Su deposu / hidrofor / arıtma', type: 'multi', o: ['Su deposu', 'Hidrofor', 'Su arıtma', 'Mevcut yeterli'] },
  ]},
  { id: 'disS', t: 'Kapı, Pencere ve Dış Mekan', ic: 'door', when: a => any(a, 'kapi', 'dis', 'yalitim'), q: [
    { id: 'k_pencere', t: 'Pencere', type: 'single', o: ['PVC', 'Alüminyum (ısı yalıtımlı)', 'Ahşap', 'Değişmeyecek'] },
    { id: 'k_ickapi', t: 'İç kapı adedi', type: 'number', unit: 'adet' },
    { id: 'k_ek', t: 'Ek kapı / doğrama işleri', type: 'multi', o: ['Çelik kapı', 'Sineklik', 'Panjur / jaluzi', 'Sürme cam balkon', 'Pergola / tente'] },
    { id: 'x_dis', t: 'Dış mekan', type: 'multi', o: ['Dış cephe boya', 'Mantolama', 'Çatı onarım / yalıtım', 'Teras su yalıtımı', 'Havuz kaplama / bakım', 'Bahçe / peyzaj', 'Bahçe duvarı / taş işçiliği'] },
  ]},
  { id: 'iletisim', t: 'İletişim ve Karar Süreci', ic: 'chat', q: [
    { id: 'karar', t: 'Karar verici(ler)', type: 'text', hint: 'örn. Ayşe Hanım + eşi' },
    { id: 'iletisimTercih', t: 'İletişim tercihi', type: 'multi', o: ['WhatsApp', 'Telefon', 'E-posta', 'Yüz yüze'] },
    { id: 'saat', t: 'Uygun görüşme saatleri', type: 'text' },
    { id: 'anahtar', t: 'Mülke erişim', type: 'single', o: ['Müşteri her zaman evde', 'Anahtar bırakılacak', 'Site güvenliği / yönetici', 'Randevulu erişim'] },
    { id: 'kaynak', t: 'Bizi nereden duydunuz?', type: 'single', o: ['Instagram', 'Google', 'Web sitesi', 'Tavsiye', 'Tabela / araç', 'Daha önce çalıştık', 'Diğer'] },
    { id: 'notlar', t: 'Ek notlar', type: 'textarea' },
  ]},
];

/* multi sorularında "kapsam" kategori anahtarlarıyla saklanır, diğerleri metinle */
const qVal = (q, i) => q.keys ? q.keys[i] : q.o[i];

const answered = v => Array.isArray(v) ? v.length > 0 : v !== undefined && v !== '' && v !== null;

export function surveyProgress(answers = {}) {
  let n = 0, d = 0;
  SURVEY.filter(s => !s.when || s.when(answers)).forEach(s => s.q.forEach(q => { n++; if (answered(answers[q.id])) d++; }));
  return { n, d, pct: n ? Math.round(100 * d / n) : 0 };
}

function qHtml(q, v) {
  const id = `sq-${q.id}`;
  switch (q.type) {
    case 'text': return `<input class="inp" id="${id}" data-q="${q.id}" value="${esc(v ?? '')}" placeholder="${esc(q.hint || '')}">`;
    case 'number': return `<div class="inp-unit"><input class="inp" type="number" inputmode="decimal" id="${id}" data-q="${q.id}" value="${esc(v ?? '')}"><span>${esc(q.unit || '')}</span></div>`;
    case 'date': return `<input class="inp" type="date" id="${id}" data-q="${q.id}" value="${esc(v ?? '')}">`;
    case 'textarea': return `<textarea class="inp" rows="3" id="${id}" data-q="${q.id}" placeholder="${esc(q.hint || '')}">${esc(v ?? '')}</textarea>`;
    case 'yesno': return `<div class="chips" data-q="${q.id}" data-single>${['Evet', 'Hayır', 'Emin değil'].map(o =>
      `<button type="button" class="chip ${v === o ? 'on' : ''}" data-v="${o}">${o}</button>`).join('')}</div>`;
    case 'scale': return `<div class="scale" data-q="${q.id}" data-single>${[1, 2, 3, 4, 5].map((n, i) =>
      `<button type="button" class="chip ${String(v) === String(n) ? 'on' : ''}" data-v="${n}"><b>${n}</b>${q.o[i] ? `<small>${q.o[i]}</small>` : ''}</button>`).join('')}</div>`;
    case 'single': case 'multi': {
      const arr = Array.isArray(v) ? v : [v];
      return `<div class="chips" data-q="${q.id}" ${q.type === 'single' ? 'data-single' : ''}>${q.o.map((o, i) =>
        `<button type="button" class="chip ${arr.includes(qVal(q, i)) ? 'on' : ''}" data-v="${esc(qVal(q, i))}">${esc(o)}</button>`).join('')}</div>`;
    }
  }
  return '';
}

/* anketi bir kapsayıcıya çizer; değişikliklerde onChange() çağrılır */
export function renderSurvey(root, job, onChange) {
  const a = job.survey.answers;
  const open = new Set(JSON.parse(sessionStorage.getItem('tb-survey-open') || '["mulk"]'));
  const draw = () => {
    const pr = surveyProgress(a);
    root.innerHTML = `
      <div class="survey-head card">
        <div><h3>Müşteri Anketi</h3><p class="muted">Kapsamı netleştirmek için müşteriyle birlikte doldurun. Seçilen işlere göre detay bölümleri açılır.</p></div>
        <div class="ring" style="--p:${pr.pct}"><span>${pr.pct}%</span></div>
      </div>
      ${SURVEY.filter(s => !s.when || s.when(a)).map(s => {
        const sd = s.q.filter(q => answered(a[q.id])).length;
        return `<section class="card survey-sec ${open.has(s.id) ? 'open' : ''}" data-s="${s.id}">
          <button class="survey-sec-h" type="button"><span class="ic-badge">${icon(s.ic)}</span><b>${esc(s.t)}</b>
            <span class="pill ${sd === s.q.length ? 'pill-ok' : ''}">${sd}/${s.q.length}</span>${icon('chevR', 'chev')}</button>
          <div class="survey-sec-b">${s.q.map(q => `<div class="q"><label for="sq-${q.id}">${esc(q.t)}${q.hint && q.type !== 'text' && q.type !== 'textarea' ? `<small>${esc(q.hint)}</small>` : ''}</label>${qHtml(q, a[q.id])}</div>`).join('')}</div>
        </section>`;
      }).join('')}
      <div class="survey-actions">
        <button class="btn btn-ghost" data-act="toRequests">${icon('list')}Kapsamı taleplere aktar</button>
        <button class="btn btn-ghost" data-act="print">${icon('print')}Yazdır / PDF</button>
      </div>`;
  };
  draw();

  root.onclick = e => {
    const h = e.target.closest('.survey-sec-h');
    if (h) {
      const s = h.parentElement; s.classList.toggle('open');
      s.classList.contains('open') ? open.add(s.dataset.s) : open.delete(s.dataset.s);
      sessionStorage.setItem('tb-survey-open', JSON.stringify([...open]));
      return;
    }
    const c = e.target.closest('.chip');
    if (c) {
      const box = c.closest('[data-q]'), id = box.dataset.q;
      if (box.hasAttribute('data-single')) {
        const on = !c.classList.contains('on');
        $$('.chip', box).forEach(x => x.classList.remove('on'));
        c.classList.toggle('on', on);
        a[id] = on ? c.dataset.v : '';
      } else {
        c.classList.toggle('on');
        a[id] = $$('.chip.on', box).map(x => x.dataset.v);
      }
      job.survey.updatedAt = Date.now();
      onChange();
      if (id === 'kapsam') draw(); else refreshCounts();
    }
  };
  root.oninput = e => {
    const id = e.target.dataset.q; if (!id) return;
    a[id] = e.target.type === 'number' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value;
    job.survey.updatedAt = Date.now();
    onChange(); refreshCounts();
  };
  function refreshCounts() {
    const pr = surveyProgress(a);
    const ring = $('.ring', root); ring.style.setProperty('--p', pr.pct); $('span', ring).textContent = pr.pct + '%';
    $$('.survey-sec', root).forEach(sec => {
      const s = SURVEY.find(x => x.id === sec.dataset.s);
      const sd = s.q.filter(q => answered(a[q.id])).length;
      const p = $('.pill', sec); p.textContent = `${sd}/${s.q.length}`; p.classList.toggle('pill-ok', sd === s.q.length);
    });
  }
}

/* yazdırılabilir anket özeti (cevaplanmış sorular) */
export function surveyPrintHtml(job) {
  const a = job.survey.answers;
  const show = v => Array.isArray(v) ? v.map(x => CATEGORIES.find(c => c.k === x)?.t || x).join(', ') : v;
  return SURVEY.filter(s => !s.when || s.when(a)).map(s => `
    <h3>${esc(s.t)}</h3><table class="ptable">${s.q.map(q => `<tr><th>${esc(q.t)}</th><td>${answered(a[q.id]) ? esc(show(a[q.id])) + (q.unit ? ' ' + q.unit : '') : '<span class="blank"></span>'}</td></tr>`).join('')}</table>`).join('');
}
