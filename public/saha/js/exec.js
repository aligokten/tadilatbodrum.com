/* ═══ Uygulama / iş takibi — teklifi onaylanan işler ═══
 * j.exec = {
 *   start, end, manager, started,
 *   tasks:  [{ id, title, cat, crew: [id], start, end, status, note, done }]   iş programı + ekip yönlendirme
 *   mats:   [{ id, name, qty, unit, supplier, phone, status, due, cost, note, t }] malzeme tedarik kaydı
 *   checks: [{ id, cat, text, s: ok|nok|na, note, photo, t }]                  kontrol föyü
 *   diary:  [{ id, t, text, photos: [id] }]                                    şantiye günlüğü
 *   pays:   [{ id, date, amount, kind, note }]                                 hakediş / tahsilat
 *   handover: { t, by, customer }                                              teslim tutanağı
 * }
 * Ekip rehberi (ustalar / taşeronlar) ayarlarda tutulur: settings.crew [{ id, name, trade, phone }]
 */
import { icon, esc, $, $$, modal, toast, confirmDlg, fmtMoney, fmtNum, fmtDate, waLink } from './ui.js';
import { CATEGORIES, catOf } from './catalog.js';
import { uid } from './store.js';
import { quoteTotals } from './quote.js';

/* iş sırası ve varsayılan süre (iş günü) */
const TASK_DEF = {
  yikim:    ['Söküm, yıkım ve moloz atımı', 2],
  tesisat:  ['Temiz su / pis su tesisatı', 2],
  elektrik: ['Elektrik tesisatı (kablo, kasa, pano)', 2],
  yalitim:  ['Su / ısı yalıtımı', 2],
  iklim:    ['Isıtma / klima altyapısı ve montajı', 1],
  alcipan:  ['Alçıpan / asma tavan', 3],
  seramik:  ['Seramik / fayans döşeme', 4],
  banyo:    ['Banyo vitrifiye ve armatür montajı', 2],
  boya:     ['Alçı, zımpara ve boya', 4],
  zemin:    ['Zemin kaplaması', 2],
  mutfak:   ['Mutfak dolapları ve tezgah montajı', 2],
  kapi:     ['Kapı / pencere montajı', 1],
  dis:      ['Dış cephe / teras işleri', 3],
  diger:    ['Diğer işler', 1],
};
const ORDER = ['yikim', 'tesisat', 'elektrik', 'yalitim', 'iklim', 'alcipan', 'seramik', 'banyo', 'boya', 'zemin', 'mutfak', 'kapi', 'dis', 'diger'];

/* kontrol föyü maddeleri (kategori bazlı) */
const CHECK_DEF = {
  yikim:    ['Moloz tamamen atıldı, alan süpürüldü', 'Korunacak yüzey ve eşyalar hasarsız', 'Açıkta kalan tesisat uçları kapatıldı / işaretlendi'],
  tesisat:  ['Basınç testi yapıldı (en az 6 bar, 30 dk)', 'Gider eğimleri ve akış kontrol edildi', 'Vana ve kolektörler erişilebilir', 'Kapatılmadan önce tesisat fotoğrafla belgelendi'],
  elektrik: ['Kaçak akım rölesi test edildi', 'Topraklama ölçüldü / kontrol edildi', 'Priz ve anahtar yerleri plana uygun', 'Pano sigortaları etiketlendi', 'Kapatılmadan önce hatlar fotoğrafla belgelendi'],
  yalitim:  ['Yalıtım en az 2 kat, köşelerde file uygulandı', 'Su testi yapıldı (24 saat göllendirme)', 'Duvar dönüşleri en az 15 cm'],
  iklim:    ['Çalışma testi yapıldı', 'Drenaj / yoğuşma suyu tahliyesi kontrol edildi', 'Kombi / petek basıncı uygun'],
  alcipan:  ['Profil aralıkları ve askılar uygun', 'Derz bandı ve macun düzgün, iz yok', 'Gizli ışık bandı düz ve eşit', 'Revizyon kapakları yerinde'],
  seramik:  ['Derz aralıkları eşit ve düz', 'Terazi / şakul kontrolü yapıldı', 'Boşluk (tok ses) yok', 'Islak hacimlerde eğim gidere doğru', 'Derz ve silikon temizliği yapıldı'],
  banyo:    ['Vitrifiye sabit, sızdırmazlık kontrol edildi', 'Batarya sıcak / soğuk yönü doğru', 'Gider akışı ve sifonlar kontrol edildi', 'Ayna ve aksesuarlar terazide'],
  boya:     ['Yan ışıkta dalga / iz yok', 'Renk kodları müşteriyle onaylandı', 'Kenar, köşe ve pervaz birleşimleri temiz', 'Zemin, priz ve doğramalar korundu / temizlendi'],
  zemin:    ['Seviye farkı ve gıcırtı yok', 'Dilatasyon boşlukları bırakıldı', 'Süpürgelik birleşimleri düzgün', 'Kapı altı geçiş profilleri takıldı'],
  mutfak:   ['Kapak ayarları ve aralıklar eşit', 'Tezgah birleşimleri ve silikon düzgün', 'Ankastre cihazlar çalışıyor', 'Evye ve gider sızdırmaz'],
  kapi:     ['Açılıp kapanma ve kilit sorunsuz', 'Kasa terazide, pervaz derzleri düzgün', 'Pencere conta ve mekanizmaları çalışıyor'],
  dis:      ['Yüzey ve renk kontrolü yapıldı', 'Su akışı ve damlalıklar kontrol edildi'],
  genel:    ['İnce temizlik yapıldı', 'Müşteriye kullanım / bakım bilgisi verildi', 'Artan malzemeler teslim edildi / kaldırıldı', 'Eksik ve kusur listesi kapandı', 'Teslim fotoğrafları çekildi'],
};
export const TASK_ST = [
  { k: 'bekliyor', t: 'Bekliyor', c: '#7A8594' },
  { k: 'devam',    t: 'Devam ediyor', c: '#1EC3D3' },
  { k: 'sorun',    t: 'Sorun var', c: '#EB591F' },
  { k: 'tamam',    t: 'Tamamlandı', c: '#1F9D55' },
];
export const MAT_ST = [
  { k: 'gerekli', t: 'Planlandı', c: '#7A8594' },
  { k: 'siparis', t: 'Sipariş verildi', c: '#F2A33A' },
  { k: 'yolda',   t: 'Yolda', c: '#1EC3D3' },
  { k: 'teslim',  t: 'Şantiyede', c: '#1F9D55' },
  { k: 'iade',    t: 'İade / iptal', c: '#B4B9C0' },
];
const PAY_KIND = [['avans', 'Avans'], ['hakedis', 'Hakediş'], ['son', 'Son ödeme'], ['ek', 'Ek iş']];
const st = (L, k) => L.find(x => x.k === k) || L[0];
const iso = d => { const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 10); };
const today = () => iso(Date.now());
// iş günü ekle (pazar günleri atlanır)
function addWork(d, n) { const x = new Date(d + 'T12:00'); let k = 0; while (k < n) { x.setDate(x.getDate() + 1); if (x.getDay() !== 0) k++; } return iso(x); }
const days = (a, b) => Math.round((new Date(b + 'T12:00') - new Date(a + 'T12:00')) / 864e5);

/* ── hesaplar (pano ve iş kartı da kullanır) ── */
export function execProgress(x) {
  if (!x?.tasks?.length) return 0;
  return Math.round(100 * x.tasks.reduce((s, t) => s + (t.status === 'tamam' ? 1 : t.status === 'devam' || t.status === 'sorun' ? 0.5 : 0), 0) / x.tasks.length);
}
export function execAlerts(x) {
  if (!x) return { late: 0, mats: 0, nok: 0 };
  const t0 = today();
  return {
    late: (x.tasks || []).filter(t => t.status !== 'tamam' && t.end && t.end < t0).length,
    mats: (x.mats || []).filter(m => ['gerekli', 'siparis', 'yolda'].includes(m.status) && m.due && m.due <= addWork(t0, 2)).length,
    nok: (x.checks || []).filter(c => c.s === 'nok').length,
  };
}

/* teklif kategorilerinden iş programı ve kontrol föyü oluştur */
export function newExec(job, { start, manager }) {
  const cats = [...new Set((job.quote?.items || []).map(i => i.cat))];
  const seq = ORDER.filter(c => cats.includes(c));
  if (!seq.length) seq.push('diger');
  let d = start;
  const tasks = seq.map(c => { const [title, n] = TASK_DEF[c] || [catOf(c).t, 2]; const t = { id: uid('t'), title, cat: c, crew: [], start: d, end: addWork(d, Math.max(0, n - 1)), status: 'bekliyor', note: '' }; d = addWork(t.end, 1); return t; });
  tasks.push({ id: uid('t'), title: 'İnce temizlik ve teslim', cat: 'genel', crew: [], start: d, end: d, status: 'bekliyor', note: '' });
  const checks = [...seq, 'genel'].flatMap(c => (CHECK_DEF[c] || []).map(text => ({ id: uid('c'), cat: c, text, s: '', note: '' })));
  return { start, end: d, manager: manager || '', started: Date.now(), tasks, mats: [], checks, diary: [], pays: [] };
}

/* ═══ arayüz ═══ */
export function renderExec(root, job, ctx) {
  const sub = () => sessionStorage.getItem('tb-exsub') || 'ozet';
  const crew = () => (ctx.settings.crew ||= []);
  const crewOf = id => crew().find(c => c.id === id);
  const draw = () => {
    const x = job.exec;
    if (!x) return drawStart();
    const tabs = [['ozet', 'Özet', 'grid'], ['program', 'İş programı', 'calendar'], ['malzeme', 'Malzeme', 'box'], ['kontrol', 'Kontrol föyü', 'clipboard'], ['gunluk', 'Günlük', 'note'], ['hakedis', 'Hakediş', 'file']];
    const A = execAlerts(x), bad = { program: A.late, malzeme: A.mats, kontrol: A.nok };
    root.innerHTML = `<div class="seg ex-tabs" id="exT">${tabs.map(([k, t, ic]) => `<button data-s="${k}" class="${sub() === k ? 'on' : ''}">${icon(ic)}<span>${t}</span>${bad[k] ? `<i class="tbadge warn">${bad[k]}</i>` : ''}</button>`).join('')}</div><div id="exB"></div>`;
    $('#exT', root).onclick = e => { const b = e.target.closest('[data-s]'); if (!b) return; sessionStorage.setItem('tb-exsub', b.dataset.s); draw(); };
    ({ ozet: drawOzet, program: drawProgram, malzeme: drawMats, kontrol: drawChecks, gunluk: drawDiary, hakedis: drawPays }[sub()] || drawOzet)($('#exB', root));
  };
  const save = () => ctx.save();

  /* ── başlangıç ── */
  function drawStart() {
    const ok = ['onay', 'uygulama', 'teslim'].includes(job.status), hasQ = job.quote?.items?.length;
    root.innerHTML = `<div class="card ex-start">
      <div class="empty-ic">${icon('roller')}</div>
      <h3>Uygulamaya başla</h3>
      <p class="muted">${hasQ ? 'Teklif kalemlerine göre iş programı (sıralı iş adımları ve tarihler) ve kontrol föyü otomatik hazırlanır. Sonra ekip atayıp iş emirlerini WhatsApp ile gönderebilir, malzeme siparişlerini, şantiye günlüğünü ve tahsilatları takip edebilirsiniz.' : 'Önce teklif hazırlayın; iş programı teklif kalemlerinden oluşturulur. Teklif olmadan da boş bir programla başlayabilirsiniz.'}</p>
      ${ok ? '' : `<p class="warn small">Bu işin teklifi henüz onaylanmamış görünüyor (durum: ${esc(job.status)}). Başlatınca durum "Uygulamada" olur.</p>`}
      <div class="grid2"><label>Başlangıç tarihi<input class="inp" type="date" id="exS" value="${today()}"></label>
        <label>Şantiye sorumlusu<input class="inp" id="exM" value="${esc(job.assigned || '')}" placeholder="Ad soyad"></label></div>
      <button class="btn btn-primary btn-lg" id="exGo">${icon('check')}İş programını oluştur ve başlat</button></div>`;
    $('#exGo', root).onclick = () => {
      job.exec = newExec(job, { start: $('#exS', root).value || today(), manager: $('#exM', root).value.trim() });
      if (['talep', 'kesif', 'teklif', 'onay'].includes(job.status)) job.status = 'uygulama';
      ctx.logEvt(`Uygulama başladı — ${job.exec.tasks.length} iş adımı, ${job.exec.checks.length} kontrol maddesi`);
      sessionStorage.setItem('tb-exsub', 'program'); save(); draw();
    };
  }

  /* ── özet: ilerleme, uyarılar, zaman çizelgesi ── */
  function drawOzet(el) {
    const x = job.exec, pr = execProgress(x), A = execAlerts(x), T = job.quote ? quoteTotals(job.quote).total : 0;
    const paid = (x.pays || []).reduce((s, p) => s + (+p.amount || 0), 0), ext = (x.pays || []).filter(p => p.kind === 'ek').reduce((s, p) => s + (+p.amount || 0), 0);
    const done = x.tasks.filter(t => t.status === 'tamam').length, chk = x.checks.filter(c => c.s).length;
    const t0 = x.tasks.reduce((m, t) => t.start && t.start < m ? t.start : m, x.start), t1 = x.tasks.reduce((m, t) => t.end && t.end > m ? t.end : m, x.end || x.start);
    const span = Math.max(1, days(t0, t1) + 1), pos = d => Math.max(0, Math.min(100, 100 * days(t0, d) / span));
    el.innerHTML = `
      <div class="ex-kpis">
        <div class="card ex-ring" style="--p:${pr}"><div class="ring-in"><b>%${pr}</b><small>ilerleme</small></div></div>
        <div class="card kpi"><small>İş adımları</small><b>${done} / ${x.tasks.length}</b><span class="${A.late ? 'bad' : 'muted'}">${A.late ? `${A.late} adım gecikmede` : 'Gecikme yok'}</span></div>
        <div class="card kpi"><small>Malzeme</small><b>${(x.mats || []).filter(m => m.status === 'teslim').length} / ${(x.mats || []).filter(m => m.status !== 'iade').length}</b><span class="${A.mats ? 'bad' : 'muted'}">${A.mats ? `${A.mats} kalem yaklaşan / gecikmiş` : 'Şantiyede / zamanında'}</span></div>
        <div class="card kpi"><small>Kontrol föyü</small><b>${chk} / ${x.checks.length}</b><span class="${A.nok ? 'bad' : 'muted'}">${A.nok ? `${A.nok} uygunsuzluk` : 'Uygunsuzluk yok'}</span></div>
        <div class="card kpi"><small>Tahsilat</small><b>${fmtMoney(paid).replace(',00', '')}</b><span class="muted">Kalan ${fmtMoney(Math.max(0, T + ext - paid)).replace(',00', '')}</span></div>
      </div>
      <div class="card">
        <div class="row-between"><h3>${icon('calendar')}Zaman çizelgesi</h3><span class="muted small">${fmtDate(t0)} → ${fmtDate(t1)} · sorumlu: ${esc(x.manager || '—')}</span></div>
        <div class="gantt">${x.tasks.map(t => { const s = st(TASK_ST, t.status), late = t.status !== 'tamam' && t.end && t.end < today(); return `
          <div class="g-row"><span class="g-t">${esc(t.title)}</span><div class="g-track"><i class="g-bar ${late ? 'late' : ''}" style="left:${pos(t.start)}%;width:${Math.max(2, pos(addWork(t.end, 0)) - pos(t.start) + 100 / span)}%;--c:${s.c}"></i>${today() >= t0 && today() <= t1 ? `<i class="g-now" style="left:${pos(today())}%"></i>` : ''}</div></div>`; }).join('')}</div>
      </div>
      <div class="row wrap">
        <button class="btn btn-ghost" data-pr="program">${icon('print')}İş programı (PDF)</button>
        <button class="btn btn-ghost" data-pr="kontrol">${icon('print')}Kontrol föyü / teslim tutanağı</button>
        <button class="btn btn-ghost" data-day>${icon('chat')}Yarının programını ekibe gönder</button>
        ${job.status !== 'teslim' ? `<button class="btn btn-primary" data-finish>${icon('check')}İşi teslim et</button>` : ''}
      </div>`;
    el.onclick = async e => {
      const pr2 = e.target.closest('[data-pr]')?.dataset.pr;
      if (pr2) return pr2 === 'program' ? printProgram() : printChecks();
      if (e.target.closest('[data-day]')) return sendDay();
      if (e.target.closest('[data-finish]')) {
        const open = x.tasks.filter(t => t.status !== 'tamam').length, nok = x.checks.filter(c => c.s === 'nok').length, empty = x.checks.filter(c => !c.s).length;
        if ((open || nok || empty) && !await confirmDlg(`${open ? open + ' iş adımı tamamlanmadı. ' : ''}${nok ? nok + ' kontrol maddesi uygun değil. ' : ''}${empty ? empty + ' kontrol maddesi işaretlenmedi. ' : ''}Yine de teslim edilsin mi?`, 'Teslim et', false)) return;
        const who = await new Promise(res => modal({ title: 'Teslim', body: `<label>Teslim alan (müşteri)<input class="inp" id="hoC" value="${esc(job.customer.name || '')}"></label><label>Teslim eden<input class="inp" id="hoB" value="${esc(x.manager || '')}"></label>`, actions: [{ k: 'no', t: 'Vazgeç' }, { k: 'ok', t: 'Teslim edildi', cls: 'btn-primary' }] }).then(r => res(r?.k === 'ok' ? { customer: $('#hoC', r.el).value.trim(), by: $('#hoB', r.el).value.trim() } : null)));
        if (!who) return;
        x.handover = { t: Date.now(), ...who }; x.tasks.forEach(t => { if (t.status !== 'tamam') { t.status = 'tamam'; t.done = Date.now(); } });
        job.status = 'teslim'; ctx.logEvt('İş teslim edildi'); save(); toast('İş teslim edildi — müşteriye değerlendirme linki göndermeyi unutmayın');
        draw();
      }
    };
  }

  /* ── iş programı + ekip yönlendirme ── */
  function drawProgram(el) {
    const x = job.exec;
    el.innerHTML = `<div class="row-between ex-head"><p class="muted small">Adımlara ekip atayın; "İş emri" ekibe WhatsApp ile adres, konum ve iş tanımını gönderir. Tarihi değiştirince sonraki adımları kaydırabilirsiniz.</p>
      <div class="row"><button class="btn btn-ghost btn-sm" data-crew>${icon('user')}Ekip rehberi (${crew().length})</button><button class="btn btn-primary btn-sm" data-add>${icon('plus')}Adım ekle</button></div></div>
      <div class="ex-list">${x.tasks.map((t, i) => { const s = st(TASK_ST, t.status), late = t.status !== 'tamam' && t.end && t.end < today(); return `
      <div class="card ex-task ${late ? 'late' : ''}" data-id="${t.id}" style="--c:${s.c}">
        <div class="ex-row1"><span class="ex-n">${i + 1}</span><input class="inp ex-title" data-k="title" value="${esc(t.title)}">
          <select class="inp sm ex-st" data-k="status">${TASK_ST.map(o => `<option value="${o.k}" ${o.k === t.status ? 'selected' : ''}>${o.t}</option>`).join('')}</select></div>
        <div class="ex-row2">
          <label>Başlangıç<input class="inp sm" type="date" data-k="start" value="${t.start || ''}"></label>
          <label>Bitiş<input class="inp sm" type="date" data-k="end" value="${t.end || ''}"></label>
          <div class="ex-crew"><span class="lbl">Ekip</span>${(t.crew || []).map(id => { const c = crewOf(id); return c ? `<span class="chip on sm" data-uncrew="${id}">${esc(c.name)} ×</span>` : ''; }).join('')}
            <select class="inp sm" data-addcrew><option value="">+ ata</option>${crew().map(c => `<option value="${c.id}">${esc(c.name)}${c.trade ? ' · ' + esc(c.trade) : ''}</option>`).join('')}<option value="+">Yeni kişi…</option></select></div>
        </div>
        <textarea class="inp sm" rows="1" data-k="note" placeholder="Not / iş tanımı / ölçü">${esc(t.note || '')}</textarea>
        <div class="row ex-act">${late ? `<span class="pill" style="--c:#EB591F">${days(t.end, today())} gün gecikme</span>` : ''}
          <button class="btn btn-xs btn-ghost" data-wo ${t.crew?.length ? '' : 'disabled'}>${icon('chat')}İş emri gönder</button>
          <button class="btn btn-xs btn-ghost" data-shift title="Bu adımın bitişine göre sonraki adımları kaydır">${icon('chevR')}Sonrakileri kaydır</button>
          <button class="btn btn-xs btn-ghost" data-up ${i ? '' : 'disabled'}>↑</button><button class="btn btn-xs btn-ghost" data-down ${i < x.tasks.length - 1 ? '' : 'disabled'}>↓</button>
          <button class="btn btn-xs btn-ghost danger-t" data-del>${icon('trash')}</button></div>
      </div>`; }).join('')}</div>`;
    el.onchange = async e => {
      const card = e.target.closest('[data-id]'), t = card && x.tasks.find(q => q.id === card.dataset.id);
      if (e.target.matches('[data-addcrew]')) {
        let v = e.target.value; if (!v) return;
        if (v === '+') { const c = await crewDialog(); if (!c) return drawProgram(el); v = c.id; }
        (t.crew ||= []).includes(v) || t.crew.push(v); save(); return drawProgram(el);
      }
      const k = e.target.dataset.k; if (!t || !k) return;
      t[k] = e.target.value;
      if (k === 'status') { if (t.status === 'tamam') t.done = Date.now(); ctx.logEvt(`${t.title}: ${st(TASK_ST, t.status).t}`); }
      if (k === 'start' && t.end && t.end < t.start) t.end = t.start;
      x.end = x.tasks.reduce((m, q) => q.end > m ? q.end : m, x.start);
      save(); if (['status', 'start', 'end'].includes(k)) drawProgram(el);
    };
    el.onclick = async e => {
      if (e.target.closest('[data-crew]')) return crewBook();
      if (e.target.closest('[data-add]')) { const last = x.tasks.at(-1); x.tasks.push({ id: uid('t'), title: 'Yeni iş adımı', cat: 'diger', crew: [], start: last?.end || x.start, end: last?.end || x.start, status: 'bekliyor', note: '' }); save(); return drawProgram(el); }
      const card = e.target.closest('[data-id]'); if (!card) return;
      const i = x.tasks.findIndex(q => q.id === card.dataset.id), t = x.tasks[i];
      const un = e.target.closest('[data-uncrew]'); if (un) { t.crew = t.crew.filter(id => id !== un.dataset.uncrew); save(); return drawProgram(el); }
      if (e.target.closest('[data-wo]')) return sendWorkOrder(t);
      if (e.target.closest('[data-shift]')) { let d = addWork(t.end, 1); for (const q of x.tasks.slice(i + 1)) { const n = Math.max(0, days(q.start, q.end)); q.start = d; q.end = addWork(d, n); d = addWork(q.end, 1); } x.end = x.tasks.at(-1).end; save(); toast('Sonraki adımlar kaydırıldı'); return drawProgram(el); }
      if (e.target.closest('[data-up]') && i > 0) { [x.tasks[i - 1], x.tasks[i]] = [x.tasks[i], x.tasks[i - 1]]; save(); return drawProgram(el); }
      if (e.target.closest('[data-down]') && i < x.tasks.length - 1) { [x.tasks[i + 1], x.tasks[i]] = [x.tasks[i], x.tasks[i + 1]]; save(); return drawProgram(el); }
      if (e.target.closest('[data-del]') && await confirmDlg(`"${t.title}" adımı silinsin mi?`)) { x.tasks.splice(i, 1); save(); drawProgram(el); }
    };
  }
  const addr = () => [job.customer.district, job.customer.address].filter(Boolean).join(', ');
  const geoLink = () => job.customer.geo?.lat ? `https://www.google.com/maps/dir/?api=1&destination=${job.customer.geo.lat.toFixed(6)},${job.customer.geo.lng.toFixed(6)}` : job.customer.mapsUrl || '';
  function sendWorkOrder(t) {
    const people = (t.crew || []).map(crewOf).filter(Boolean);
    if (!people.length) return toast('Önce ekip atayın', 'err');
    const text = `📋 İş emri — ${job.code}\n${t.title}\n🗓 ${fmtDate(t.start)}${t.end && t.end !== t.start ? ' – ' + fmtDate(t.end) : ''}\n📍 ${addr() || '—'}${geoLink() ? '\n' + geoLink() : ''}${t.note ? '\n📝 ' + t.note : ''}${job.exec.manager ? '\nŞantiye sorumlusu: ' + job.exec.manager : ''}\n— TadilatBodrum.com`;
    if (people.length === 1) window.open(waLink(people[0].phone, text), '_blank');
    else modal({ title: 'İş emri gönder', body: `<p class="muted small">Her kişiye ayrı WhatsApp mesajı açılır.</p><div class="col">${people.map(p => `<a class="btn btn-ghost" href="${esc(waLink(p.phone, text))}" target="_blank" rel="noopener">${icon('chat')}${esc(p.name)}${p.trade ? ' · ' + esc(p.trade) : ''}</a>`).join('')}</div>`, actions: [{ k: 'ok', t: 'Kapat' }] });
    ctx.logEvt(`İş emri gönderildi: ${t.title} → ${people.map(p => p.name).join(', ')}`);
  }
  function sendDay() {
    const d = addWork(today(), 1), list = job.exec.tasks.filter(t => t.status !== 'tamam' && t.start <= d && t.end >= d);
    if (!list.length) return toast(`${fmtDate(d)} için planlı iş yok`);
    const text = `🗓 ${fmtDate(d)} iş programı — ${job.code}\n📍 ${addr()}${geoLink() ? '\n' + geoLink() : ''}\n\n${list.map(t => `• ${t.title}${t.crew?.length ? ' (' + t.crew.map(id => crewOf(id)?.name).filter(Boolean).join(', ') + ')' : ''}`).join('\n')}\n— TadilatBodrum.com`;
    window.open(waLink('', text), '_blank');
  }
  async function crewDialog(c = {}) {
    const r = await modal({ title: c.id ? 'Ekip üyesi' : 'Yeni ekip üyesi', body: `<div class="grid2"><label>Ad soyad / firma<input class="inp" id="cN" value="${esc(c.name || '')}"></label><label>Uzmanlık<input class="inp" id="cT" list="dl-tr" value="${esc(c.trade || '')}" placeholder="örn. Elektrikçi"></label></div>
      <label>Telefon<input class="inp" id="cP" type="tel" value="${esc(c.phone || '')}"></label>
      <datalist id="dl-tr">${['Usta başı', 'Elektrikçi', 'Tesisatçı', 'Seramikçi', 'Boyacı', 'Alçıpancı', 'Parkeci', 'Mobilyacı', 'Doğramacı', 'Yalıtımcı', 'Klima', 'Temizlik', 'Nakliye', 'Hurdacı'].map(x => `<option value="${x}">`).join('')}</datalist>`,
      actions: [{ k: 'no', t: 'Vazgeç' }, { k: 'ok', t: 'Kaydet', cls: 'btn-primary', validate: el => !!$('#cN', el).value.trim() }] });
    if (r?.k !== 'ok') return null;
    const v = { id: c.id || uid('cr'), name: $('#cN', r.el).value.trim(), trade: $('#cT', r.el).value.trim(), phone: $('#cP', r.el).value.trim() };
    const L = crew(), i = L.findIndex(q => q.id === v.id); if (i >= 0) L[i] = v; else L.push(v);
    await ctx.saveSettings(); return v;
  }
  async function crewBook() {
    await modal({ title: 'Ekip rehberi', body: `<p class="muted small">Ustalar, taşeronlar ve tedarikçiler — tüm işlerde ortak kullanılır.</p><div class="col" id="cbL"></div><button class="btn btn-ghost btn-sm" id="cbA">${icon('plus')}Kişi ekle</button>`, actions: [{ k: 'ok', t: 'Kapat' }], onOpen: el => {
      const L = () => { $('#cbL', el).innerHTML = crew().map(c => `<div class="sh-row" data-c="${c.id}"><div><b>${esc(c.name)}</b><small>${esc([c.trade, c.phone].filter(Boolean).join(' · '))}</small></div><div class="row"><button class="btn btn-xs btn-ghost" data-e>Düzenle</button><button class="btn btn-xs btn-ghost danger-t" data-x>${icon('trash')}</button></div></div>`).join('') || '<p class="muted small">Henüz kimse yok.</p>'; };
      L();
      $('#cbA', el).onclick = async () => { await crewDialog(); L(); };
      $('#cbL', el).onclick = async e => { const row = e.target.closest('[data-c]'); if (!row) return; const c = crewOf(row.dataset.c); if (e.target.closest('[data-e]')) { await crewDialog(c); L(); } if (e.target.closest('[data-x]') && await confirmDlg(`${c.name} rehberden silinsin mi?`)) { ctx.settings.crew = crew().filter(q => q.id !== c.id); await ctx.saveSettings(); L(); } };
    } });
    draw();
  }

  /* ── malzeme tedarik ── */
  function drawMats(el) {
    const x = job.exec; x.mats ||= [];
    const f = sessionStorage.getItem('tb-matf') || '';
    const list = x.mats.filter(m => !f || m.status === f), cost = x.mats.filter(m => m.status !== 'iade').reduce((s, m) => s + (+m.cost || 0), 0);
    el.innerHTML = `<div class="row-between ex-head"><div class="chips scroll" id="mF"><button class="chip ${!f ? 'on' : ''}" data-v="">Tümü (${x.mats.length})</button>${MAT_ST.map(s => { const n = x.mats.filter(m => m.status === s.k).length; return n ? `<button class="chip ${f === s.k ? 'on' : ''}" data-v="${s.k}">${s.t} (${n})</button>` : ''; }).join('')}</div>
      <div class="row"><button class="btn btn-ghost btn-sm" data-fromq ${job.quote?.items?.length ? '' : 'disabled'}>${icon('list')}Teklif kalemlerinden</button><button class="btn btn-ghost btn-sm" data-order>${icon('chat')}Sipariş gönder</button><button class="btn btn-primary btn-sm" data-add>${icon('plus')}Malzeme</button></div></div>
      <div class="card ex-mats">${list.length ? `<table class="tbl"><thead><tr><th>Malzeme</th><th class="r">Miktar</th><th>Tedarikçi</th><th>Termin</th><th>Durum</th><th class="r">Tutar</th><th></th></tr></thead><tbody>${list.map(m => { const s = st(MAT_ST, m.status), late = ['gerekli', 'siparis', 'yolda'].includes(m.status) && m.due && m.due < today(); return `
        <tr data-id="${m.id}" class="${late ? 'late' : ''}"><td><input class="inp sm" data-k="name" value="${esc(m.name)}"></td>
        <td class="r nowrap"><input class="inp sm num" data-k="qty" type="number" step="any" value="${m.qty ?? ''}"> <input class="inp sm unit" data-k="unit" value="${esc(m.unit || '')}"></td>
        <td><input class="inp sm" data-k="supplier" list="dl-sup" value="${esc(m.supplier || '')}"></td>
        <td><input class="inp sm" type="date" data-k="due" value="${m.due || ''}"></td>
        <td><select class="inp sm" data-k="status" style="--c:${s.c}">${MAT_ST.map(o => `<option value="${o.k}" ${o.k === m.status ? 'selected' : ''}>${o.t}</option>`).join('')}</select></td>
        <td class="r"><input class="inp sm num" data-k="cost" type="number" step="any" value="${m.cost ?? ''}"></td>
        <td><button class="icon-btn sm danger" data-del>${icon('trash')}</button></td></tr>`; }).join('')}</tbody></table>` : `<p class="muted">Malzeme kaydı yok. Sipariş edilecek malzemeleri ekleyin; termin ve durumla takip edin.</p>`}
      ${x.mats.length ? `<p class="muted small">Toplam malzeme maliyeti: <b>${fmtMoney(cost)}</b> · termini geçen ve yaklaşan kalemler kırmızı görünür.</p>` : ''}</div>
      <datalist id="dl-sup">${[...new Set([...x.mats.map(m => m.supplier), ...crew().map(c => c.name)].filter(Boolean))].map(v => `<option value="${esc(v)}">`).join('')}</datalist>`;
    $('#mF', el).onclick = e => { const b = e.target.closest('.chip'); if (!b) return; sessionStorage.setItem('tb-matf', b.dataset.v); drawMats(el); };
    el.onchange = e => {
      const row = e.target.closest('[data-id]'), m = row && x.mats.find(q => q.id === row.dataset.id), k = e.target.dataset.k; if (!m || !k) return;
      m[k] = ['qty', 'cost'].includes(k) ? (e.target.value === '' ? '' : +e.target.value) : e.target.value;
      if (k === 'status') { ctx.logEvt(`Malzeme: ${m.name} → ${st(MAT_ST, m.status).t}`); drawMats(el); }
      save();
    };
    el.onclick = async e => {
      if (e.target.closest('[data-add]')) { x.mats.push({ id: uid('m'), name: '', qty: '', unit: 'adet', supplier: '', status: 'gerekli', due: job.exec.tasks[0]?.start || '', cost: '', t: Date.now() }); save(); drawMats(el); $$('[data-k="name"]', el).at(-1)?.focus(); return; }
      if (e.target.closest('[data-fromq]')) return fromQuote(el);
      if (e.target.closest('[data-order]')) return sendOrder();
      const row = e.target.closest('[data-id]');
      if (row && e.target.closest('[data-del]')) { x.mats = x.mats.filter(q => q.id !== row.dataset.id); save(); drawMats(el); }
    };
  }
  async function fromQuote(el) {
    const items = job.quote.items;
    const r = await modal({ title: 'Teklif kalemlerinden malzeme', body: `<p class="muted small">Seçtiğiniz kalemler miktar ve birimleriyle malzeme listesine eklenir; adlarını tedarik edilecek ürüne göre düzenleyebilirsiniz.</p>
      <div class="lib-list">${items.map((i, n) => `<label class="lib-item"><input type="checkbox" value="${n}"><span><b>${esc(i.desc)}</b><small>${esc(catOf(i.cat).t)} · ${fmtNum(i.qty)} ${esc(i.unit)}</small></span></label>`).join('')}</div>`,
      actions: [{ k: 'no', t: 'Vazgeç' }, { k: 'ok', t: 'Ekle', cls: 'btn-primary' }] });
    if (r?.k !== 'ok') return;
    const sel = $$('input:checked', r.el).map(i => items[+i.value]);
    sel.forEach(i => job.exec.mats.push({ id: uid('m'), name: i.desc.split('\n')[0], qty: i.qty, unit: i.unit, supplier: '', status: 'gerekli', due: job.exec.tasks.find(t => t.cat === i.cat)?.start || '', cost: '', t: Date.now() }));
    save(); toast(`${sel.length} malzeme eklendi`); drawMats(el);
  }
  async function sendOrder() {
    const x = job.exec, open = x.mats.filter(m => m.status === 'gerekli' && m.name);
    if (!open.length) return toast('"Planlandı" durumunda malzeme yok', 'err');
    const sups = [...new Set(open.map(m => m.supplier || ''))];
    const r = await modal({ title: 'Sipariş gönder', body: `<label>Tedarikçi<select class="inp" id="oS">${sups.map(s => `<option value="${esc(s)}">${esc(s || 'Tedarikçisi belirtilmemiş')}</option>`).join('')}</select></label>
      <label class="check"><input type="checkbox" id="oM" checked> Gönderilenleri "Sipariş verildi" yap</label>`, actions: [{ k: 'no', t: 'Vazgeç' }, { k: 'ok', t: 'WhatsApp\'ta aç', cls: 'btn-primary' }] });
    if (r?.k !== 'ok') return;
    const sup = $('#oS', r.el).value, list = open.filter(m => (m.supplier || '') === sup), phone = crew().find(c => c.name === sup)?.phone || '';
    const text = `Merhaba${sup ? ' ' + sup : ''}, ${job.code} için sipariş:\n\n${list.map(m => `• ${m.name} — ${fmtNum(+m.qty || 0)} ${m.unit || ''}${m.due ? ' (termin ' + fmtDate(m.due) + ')' : ''}`).join('\n')}\n\nTeslim adresi: ${addr()}${geoLink() ? '\n' + geoLink() : ''}\n— TadilatBodrum.com`;
    window.open(waLink(phone, text), '_blank');
    if ($('#oM', r.el).checked) { list.forEach(m => { m.status = 'siparis'; }); ctx.logEvt(`Sipariş gönderildi: ${list.length} kalem${sup ? ' → ' + sup : ''}`); }
    draw();
  }

  /* ── kontrol föyü ── */
  function drawChecks(el) {
    const x = job.exec, groups = [...new Set(x.checks.map(c => c.cat))];
    const lab = c => c === 'genel' ? 'Genel / teslim' : catOf(c).t;
    el.innerHTML = `<div class="row-between ex-head"><p class="muted small">Her maddeyi işaretleyin: <b>Uygun</b>, <b>Uygun değil</b> (not ve fotoğraf ekleyin) ya da <b>Gerekmiyor</b>. Föy, teslim tutanağıyla birlikte PDF alınıp müşteriye imzalatılabilir.</p>
      <div class="row"><button class="btn btn-ghost btn-sm" data-addc>${icon('plus')}Madde</button><button class="btn btn-primary btn-sm" data-print>${icon('print')}Föy / tutanak</button></div></div>
      ${groups.map(g => { const L = x.checks.filter(c => c.cat === g), ok = L.filter(c => c.s === 'ok' || c.s === 'na').length; return `
      <div class="card ex-chk"><div class="row-between"><h3>${esc(lab(g))}</h3><span class="muted small">${ok} / ${L.length}</span></div>
        ${L.map(c => `<div class="chk-row s-${c.s || 'x'}" data-id="${c.id}"><span class="chk-t">${esc(c.text)}</span>
          <div class="seg sm">${[['ok', 'Uygun'], ['nok', 'Uygun değil'], ['na', 'Gerekmiyor']].map(([k, t]) => `<button data-s="${k}" class="${c.s === k ? 'on' : ''}">${t}</button>`).join('')}</div>
          ${c.s === 'nok' || c.note ? `<input class="inp sm chk-note" data-note value="${esc(c.note || '')}" placeholder="Uygunsuzluk / yapılacak düzeltme">` : ''}
          <label class="icon-btn sm" title="Fotoğraf ekle">${icon('camera')}<input type="file" accept="image/*" capture="environment" hidden data-ph></label>${c.photo ? `<img class="chk-ph" data-src="${c.photo}" alt="">` : ''}</div>`).join('')}
      </div>`; }).join('')}`;
    ctx.hydratePhotos(el);
    el.onclick = async e => {
      if (e.target.closest('[data-print]')) return printChecks();
      if (e.target.closest('[data-addc]')) {
        const r = await modal({ title: 'Kontrol maddesi', body: `<label>Grup<select class="inp" id="kG">${[...groups, ...ORDER.filter(c => !groups.includes(c))].map(g => `<option value="${g}">${esc(lab(g))}</option>`).join('')}</select></label><label>Madde<input class="inp" id="kT"></label>`, actions: [{ k: 'no', t: 'Vazgeç' }, { k: 'ok', t: 'Ekle', cls: 'btn-primary', validate: el2 => !!$('#kT', el2).value.trim() }] });
        if (r?.k === 'ok') { x.checks.push({ id: uid('c'), cat: $('#kG', r.el).value, text: $('#kT', r.el).value.trim(), s: '', note: '' }); save(); drawChecks(el); }
        return;
      }
      const row = e.target.closest('[data-id]'), b = e.target.closest('[data-s]'); if (!row || !b) return;
      const c = x.checks.find(q => q.id === row.dataset.id); c.s = c.s === b.dataset.s ? '' : b.dataset.s; c.t = Date.now();
      if (c.s === 'nok') ctx.logEvt(`Kontrol: uygun değil — ${c.text}`);
      save(); drawChecks(el);
    };
    el.onchange = async e => {
      const row = e.target.closest('[data-id]'); if (!row) return; const c = x.checks.find(q => q.id === row.dataset.id);
      if (e.target.matches('[data-note]')) { c.note = e.target.value; save(); }
      if (e.target.matches('[data-ph]')) { const [p] = await ctx.addPhotos(e.target.files, { tag: 'sonra', caption: c.text }); if (p) { c.photo = p.id; save(); drawChecks(el); } }
    };
  }

  /* ── şantiye günlüğü ── */
  function drawDiary(el) {
    const x = job.exec; x.diary ||= [];
    el.innerHTML = `<div class="card ex-diary-new"><textarea class="inp" rows="3" id="dT" placeholder="Bugün yapılanlar, sahadaki ekip, gelen malzeme, sorunlar, müşteri talepleri…"></textarea>
      <div class="row wrap"><label class="btn btn-ghost btn-sm">${icon('camera')}Fotoğraf<input type="file" accept="image/*" multiple hidden id="dP"></label><span class="muted small" id="dPn"></span><button class="btn btn-primary btn-sm" id="dS">${icon('check')}Günlüğe ekle</button></div></div>
      <div class="ex-diary">${x.diary.map(d => `<div class="card dy" data-id="${d.id}"><div class="row-between"><b>${fmtDate(d.t, true)}</b><button class="icon-btn sm danger" data-del>${icon('trash')}</button></div><p>${esc(d.text).replace(/\n/g, '<br>')}</p>${d.photos?.length ? `<div class="gallery">${d.photos.map(id => `<button class="gimg" data-ph="${id}"><img data-src="${id}" alt=""></button>`).join('')}</div>` : ''}</div>`).join('') || '<p class="muted">Henüz kayıt yok. Her gün kısa bir not ve fotoğrafla şantiyeyi kayıt altına alın.</p>'}</div>`;
    ctx.hydratePhotos(el);
    let files = null;
    $('#dP', el).onchange = e => { files = e.target.files; $('#dPn', el).textContent = files.length ? `${files.length} fotoğraf seçildi` : ''; };
    $('#dS', el).onclick = async () => {
      const text = $('#dT', el).value.trim(); if (!text && !files?.length) return;
      const ps = files?.length ? await ctx.addPhotos(files, { tag: 'uygulama', caption: text.slice(0, 60) }) : [];
      x.diary.unshift({ id: uid('dy'), t: Date.now(), text, photos: ps.map(p => p.id) }); save(); drawDiary(el);
    };
    el.onclick = async e => {
      const ph = e.target.closest('[data-ph]'); if (ph) return ctx.lightbox(ph.dataset.ph, () => drawDiary(el));
      const row = e.target.closest('[data-id]'); if (row && e.target.closest('[data-del]') && await confirmDlg('Günlük kaydı silinsin mi? (Fotoğraflar kalır)')) { x.diary = x.diary.filter(d => d.id !== row.dataset.id); save(); drawDiary(el); }
    };
  }

  /* ── hakediş / tahsilat ── */
  function drawPays(el) {
    const x = job.exec; x.pays ||= [];
    const T = job.quote ? quoteTotals(job.quote).total : 0, ext = x.pays.filter(p => p.kind === 'ek').reduce((s, p) => s + (+p.amount || 0), 0);
    const paid = x.pays.reduce((s, p) => s + (+p.amount || 0), 0), due = T + ext;
    el.innerHTML = `<div class="ex-kpis"><div class="card kpi"><small>Teklif bedeli</small><b>${fmtMoney(T)}</b></div>${ext ? `<div class="card kpi"><small>Ek işler</small><b>${fmtMoney(ext)}</b></div>` : ''}<div class="card kpi"><small>Tahsil edilen</small><b>${fmtMoney(paid)}</b><span class="muted">%${due ? Math.round(100 * paid / due) : 0}</span></div><div class="card kpi"><small>Kalan</small><b class="${due - paid > 0 ? 'bad' : ''}">${fmtMoney(Math.max(0, due - paid))}</b></div></div>
      <div class="card"><div class="row-between"><h3>${icon('file')}Tahsilatlar</h3><button class="btn btn-primary btn-sm" data-add>${icon('plus')}Tahsilat</button></div>
      ${x.pays.length ? `<table class="tbl"><thead><tr><th>Tarih</th><th>Tür</th><th>Açıklama</th><th class="r">Tutar</th><th></th></tr></thead><tbody>${x.pays.map(p => `<tr data-id="${p.id}"><td><input class="inp sm" type="date" data-k="date" value="${p.date || ''}"></td><td><select class="inp sm" data-k="kind">${PAY_KIND.map(([k, t]) => `<option value="${k}" ${p.kind === k ? 'selected' : ''}>${t}</option>`).join('')}</select></td><td><input class="inp sm" data-k="note" value="${esc(p.note || '')}"></td><td class="r"><input class="inp sm num" type="number" step="any" data-k="amount" value="${p.amount ?? ''}"></td><td><button class="icon-btn sm danger" data-del>${icon('trash')}</button></td></tr>`).join('')}</tbody></table>` : '<p class="muted">Henüz tahsilat yok.</p>'}
      <p class="muted small">"Ek iş" türündeki kayıtlar teklif dışı işlerin bedelidir; toplam alacağa eklenir.</p></div>`;
    el.onchange = e => { const row = e.target.closest('[data-id]'), p = row && x.pays.find(q => q.id === row.dataset.id), k = e.target.dataset.k; if (!p || !k) return; p[k] = k === 'amount' ? +e.target.value || 0 : e.target.value; save(); if (k === 'amount' || k === 'kind') drawPays(el); };
    el.onclick = async e => {
      if (e.target.closest('[data-add]')) { x.pays.push({ id: uid('p'), date: today(), kind: x.pays.length ? 'hakedis' : 'avans', amount: 0, note: '' }); save(); return drawPays(el); }
      const row = e.target.closest('[data-id]'); if (row && e.target.closest('[data-del]') && await confirmDlg('Tahsilat kaydı silinsin mi?')) { x.pays = x.pays.filter(p => p.id !== row.dataset.id); save(); drawPays(el); }
    };
  }

  /* ── çıktılar ── */
  function printProgram() {
    const x = job.exec;
    const html = `<div class="pdoc">${ctx.docHeader(ctx.settings, 'İş Programı', `<div class="p-meta"><span>İş kodu <b>${esc(job.code)}</b></span><span>Başlangıç <b>${fmtDate(x.start)}</b></span><span>Bitiş <b>${fmtDate(x.end)}</b></span></div>`)}
      <section class="p-cust"><div><small>Müşteri</small><b>${esc(job.customer.name || '—')}</b>${esc(job.customer.phone || '')}</div><div><small>Adres</small><b>${esc(job.customer.district || '')}</b>${esc(job.customer.address || '')}</div><div><small>Şantiye sorumlusu</small><b>${esc(x.manager || '—')}</b>İlerleme %${execProgress(x)}</div></section>
      <table class="p-table"><thead><tr><th>#</th><th>İş adımı</th><th>Başlangıç</th><th>Bitiş</th><th>Ekip</th><th>Durum</th></tr></thead><tbody>${x.tasks.map((t, i) => `<tr><td class="c">${i + 1}</td><td>${esc(t.title)}${t.note ? `<br><small>${esc(t.note)}</small>` : ''}</td><td>${fmtDate(t.start)}</td><td>${fmtDate(t.end)}</td><td>${esc((t.crew || []).map(id => crewOf(id)?.name).filter(Boolean).join(', '))}</td><td>${st(TASK_ST, t.status).t}</td></tr>`).join('')}</tbody></table>
      ${x.mats?.length ? `<section><h3>Malzeme tedarik</h3><table class="p-table"><thead><tr><th>Malzeme</th><th class="r">Miktar</th><th>Tedarikçi</th><th>Termin</th><th>Durum</th></tr></thead><tbody>${x.mats.map(m => `<tr><td>${esc(m.name)}</td><td class="r">${fmtNum(+m.qty || 0)} ${esc(m.unit || '')}</td><td>${esc(m.supplier || '')}</td><td>${m.due ? fmtDate(m.due) : ''}</td><td>${st(MAT_ST, m.status).t}</td></tr>`).join('')}</tbody></table></section>` : ''}
      ${ctx.docFooter()}</div>`;
    ctx.printDoc(html, `İş programı ${job.code}`);
  }
  function printChecks() {
    const x = job.exec, groups = [...new Set(x.checks.map(c => c.cat))], S2 = { ok: 'Uygun', nok: 'Uygun değil', na: 'Gerekmiyor', '': '—' };
    const html = `<div class="pdoc">${ctx.docHeader(ctx.settings, 'Kontrol Föyü ve Teslim Tutanağı', `<div class="p-meta"><span>İş kodu <b>${esc(job.code)}</b></span><span>Tarih <b>${fmtDate(x.handover?.t || Date.now())}</b></span></div>`)}
      <section class="p-cust"><div><small>Müşteri</small><b>${esc(job.customer.name || '—')}</b>${esc(job.customer.phone || '')}</div><div><small>Adres</small><b>${esc(job.customer.district || '')}</b>${esc(job.customer.address || '')}</div><div><small>Şantiye sorumlusu</small><b>${esc(x.manager || '—')}</b></div></section>
      ${groups.map(g => `<section><h3>${esc(g === 'genel' ? 'Genel / teslim' : catOf(g).t)}</h3><table class="p-table"><thead><tr><th>Kontrol</th><th>Sonuç</th><th>Not</th></tr></thead><tbody>${x.checks.filter(c => c.cat === g).map(c => `<tr><td>${esc(c.text)}</td><td style="font-weight:700;color:${c.s === 'nok' ? '#C9461A' : c.s === 'ok' ? '#1F9D55' : '#6A7380'}">${S2[c.s || '']}</td><td>${esc(c.note || '')}</td></tr>`).join('')}</tbody></table></section>`).join('')}
      <p class="p-intro">Yukarıdaki kontroller birlikte yapılmış; işler ${x.checks.some(c => c.s === 'nok') ? '"Uygun değil" olarak belirtilen maddeler dışında ' : ''}eksiksiz teslim edilmiştir.</p>
      <section class="p-sign"><div>${esc(x.handover?.by || x.manager || 'TadilatBodrum.com')}<span>Teslim eden — İmza</span></div><div>${esc(x.handover?.customer || job.customer.name || '')}<span>Teslim alan — İmza / Tarih</span></div></section>
      ${ctx.docFooter()}</div>`;
    ctx.printDoc(html, `Kontrol föyü ${job.code}`);
  }

  draw();
}
