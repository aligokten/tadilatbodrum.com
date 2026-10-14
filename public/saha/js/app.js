/* ═══ TadilatBodrum Saha — tadilat koordinasyon uygulaması ═══
 * Rota (hash): #/  ·  #/is/:id/:sekme  ·  #/is/:id/plan  ·  #/ayarlar
 */
import { openLocal, openCloud, MODE_KEY, newJob, uid, compressImage } from './store.js';
import { STATUSES, statusOf, CATEGORIES, catOf, SEVERITY, sevOf, PHOTO_TAGS, ROOM_TYPES, INSPECTION, CHECK_STATES, UNITS, DEFAULT_SETTINGS } from './catalog.js';
import { icon, esc, h, $, $$, toast, modal, confirmDlg, promptDlg, fmtMoney, fmtNum, fmtDate, telLink, waLink, bindFields, debounce, downloadBlob } from './ui.js';
import { renderSurvey, surveyProgress, surveyPrintHtml } from './survey.js';
import { renderQuote, quoteTotals, printDoc, docHeader, docFooter, jobMetrics } from './quote.js';
import { PlanEditor, planThumbSvg, planImageUrl } from './plan2d.js';
import { emptyPlan, planMetrics, rectRoom } from './plan-geom.js';

const DISTRICTS = ['Bodrum Merkez', 'Bitez', 'Gümbet', 'Ortakent', 'Yahşi', 'Turgutreis', 'Akyarlar', 'Gümüşlük', 'Yalıkavak', 'Gündoğan', 'Göltürkbükü', 'Torba', 'Gölköy', 'Konacık', 'Güvercinlik', 'Mumcular', 'Dereköy', 'Kadıkalesi', 'Peksimet', 'Gürece'];

const S = { be: null, jobs: [], job: null, settings: null, editor: null, p3: null, route: '' };
const app = $('#app');

/* <base href="/saha/"> varken "#/..." linkleri sayfayı yeniden yüklemesin (adres /saha veya /saha/ olabilir) */
document.addEventListener('click', e => {
  const a = e.target.closest('a[href^="#"]');
  if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
  e.preventDefault();
  location.hash = a.getAttribute('href');
});

/* ═════════ açılış ═════════ */
async function boot() {
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js', location.pathname.startsWith('/saha') ? {} : { scope: '/' }).catch(() => {});
  const mode = localStorage.getItem(MODE_KEY);
  if (mode === 'local') return start(await openLocal());
  app.innerHTML = splash('Bağlanılıyor…');
  try {
    const be = await openCloud();
    if (be.user) return start(be);
    loginView(be);
  } catch (e) {
    loginView(null, e.message);
  }
}
const splash = t => `<div class="splash"><img src="assets/logo.png" alt="TadilatBodrum.com"><div class="spin"></div><p>${esc(t)}</p></div>`;

function loginView(be, err = '') {
  app.innerHTML = `<div class="login">
    <div class="login-art" aria-hidden="true"><span class="swoosh t"></span><span class="swoosh o"></span></div>
    <form class="login-card">
      <img src="assets/logo.png" alt="TadilatBodrum.com" class="login-logo">
      <h1>Saha <span class="grad">Koordinasyon</span></h1>
      <p class="muted">Keşif, rölöve, anket ve teklif — tek noktadan.</p>
      ${be ? `<label>Kullanıcı adı<input class="inp" name="u" autocomplete="username" required placeholder="admin"></label>
      <label>Şifre<input class="inp" type="password" name="p" autocomplete="current-password" required></label>
      <button class="btn btn-primary btn-lg">${icon('cloud')}Giriş yap</button>` : `<p class="warn">${icon('alert')} Buluta bağlanılamadı${err ? ': ' + esc(err) : ''}. İnternet yoksa yerel modda çalışabilirsiniz.</p>`}
      <p class="form-err" hidden></p>
      <div class="or"><span>veya</span></div>
      <button type="button" class="btn btn-ghost" data-local>${icon('device')}Bu cihazda yerel çalış</button>
      <p class="muted small">Yerel modda veriler yalnızca bu cihazda saklanır; daha sonra buluta aktarılabilir.</p>
    </form></div>`;
  const f = $('form', app);
  f.onsubmit = async e => {
    e.preventDefault();
    const btn = $('button.btn-primary', f); btn.disabled = true;
    try { await be.signIn(f.u.value.trim(), f.p.value); localStorage.setItem(MODE_KEY, 'cloud'); start(be); }
    catch { const er = $('.form-err', f); er.hidden = false; er.textContent = 'Kullanıcı adı veya şifre hatalı.'; btn.disabled = false; }
  };
  $('[data-local]', f).onclick = async () => { localStorage.setItem(MODE_KEY, 'local'); start(await openLocal()); };
}

async function start(be) {
  S.be = be;
  app.innerHTML = splash('Yükleniyor…');
  S.settings = await be.getSettings().catch(() => structuredClone(DEFAULT_SETTINGS));
  S.jobs = await be.listJobs().catch(() => []);
  shell();
  window.onhashchange = route;
  route();
}

/* ═════════ kabuk ═════════ */
function shell() {
  app.innerHTML = `<div class="shell">
    <aside class="side">
      <a href="#/" class="side-logo"><img src="assets/logo.png" alt="TadilatBodrum.com"></a>
      <nav>
        <a href="#/" data-nav="home">${icon('home')}<span>İşler</span></a>
        <button data-new>${icon('plus')}<span>Yeni iş</span></button>
        <a href="#/ayarlar" data-nav="ayarlar">${icon('settings')}<span>Ayarlar</span></a>
      </nav>
      <div class="side-foot">
        <div class="mode">${icon(S.be.kind === 'cloud' ? 'cloud' : 'device')}<span>${esc(S.be.label)}</span></div>
        <span class="save-state" id="saveState"></span>
        <button data-logout>${icon('logout')}<span>${S.be.kind === 'cloud' ? 'Çıkış' : 'Mod değiştir'}</span></button>
      </div>
    </aside>
    <main id="view"></main>
    <nav class="bottom-nav">
      <a href="#/" data-nav="home">${icon('home')}<span>İşler</span></a>
      <button data-new class="fab">${icon('plus')}</button>
      <a href="#/ayarlar" data-nav="ayarlar">${icon('settings')}<span>Ayarlar</span></a>
    </nav>
  </div>`;
  $$('[data-new]', app).forEach(b => b.onclick = newJobDialog);
  $('[data-logout]', app).onclick = async () => {
    await flushSave();
    await S.be.signOut();
    localStorage.removeItem(MODE_KEY);
    location.hash = ''; location.reload();
  };
}
const view = () => $('#view');

async function route() {
  await flushSave();
  teardownPlan();
  const parts = location.hash.replace(/^#\/?/, '').split('?')[0].split('/').filter(Boolean);
  const nav = parts[0] === 'ayarlar' ? 'ayarlar' : 'home';
  $$('[data-nav]').forEach(a => a.classList.toggle('on', a.dataset.nav === nav && parts[0] !== 'is'));
  document.body.classList.toggle('plan-mode', parts[0] === 'is' && parts[2] === 'plan');
  if (parts[0] === 'is' && parts[1]) {
    if (S.job?.id !== parts[1]) {
      view().innerHTML = splash('İş yükleniyor…');
      S.job = await S.be.getJob(parts[1]);
      if (!S.job) { toast('İş bulunamadı', 'err'); location.hash = '#/'; return; }
      migrate(S.job);
    }
    if (parts[2] === 'plan') return planScreen();
    return jobView(parts[2] || 'genel');
  }
  S.job = null;
  if (parts[0] === 'ayarlar') return settingsView();
  dashboard();
}
function migrate(j) {
  const n = newJob(j.code);
  for (const k of Object.keys(n)) if (j[k] === undefined) j[k] = n[k];
  j.survey.answers ??= {}; j.inspection.rooms ??= [];
}

/* ═════════ kaydetme ═════════ */
let saving = Promise.resolve();
const doSave = async () => {
  const j = S.job; if (!j) return;
  j.updatedAt = Date.now();
  const st = $('#saveState'); if (st) { st.textContent = 'Kaydediliyor…'; st.className = 'save-state busy'; }
  saving = S.be.saveJob(j).then(() => {
    const i = S.jobs.findIndex(x => x.id === j.id);
    const copy = structuredClone(j); if (i >= 0) S.jobs[i] = copy; else S.jobs.unshift(copy);
    if (st) { st.textContent = 'Kaydedildi'; st.className = 'save-state ok'; }
  }).catch(e => { console.error(e); if (st) { st.textContent = 'Kaydedilemedi!'; st.className = 'save-state err'; } toast('Kaydedilemedi: ' + e.message, 'err'); });
  return saving;
};
const save = debounce(doSave, 700);
async function flushSave() { if (S.job) { await save.flush(); await saving; } }
addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') save.flush(); });
addEventListener('beforeunload', () => save.flush());
function logEvt(text) { S.job.log.unshift({ t: Date.now(), text }); save(); }

/* ═════════ panel (iş listesi) ═════════ */
function dashboard() {
  const st = sessionStorage.getItem('tb-filter') || 'aktif';
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = S.jobs.filter(j => j.kesifDate && j.kesifDate.slice(0, 10) >= today && !['iptal', 'teslim'].includes(j.status))
    .sort((a, b) => a.kesifDate.localeCompare(b.kesifDate)).slice(0, 5);
  const cnt = k => S.jobs.filter(j => j.status === k).length;
  const pipeline = S.jobs.filter(j => ['teklif', 'onay'].includes(j.status) && j.quote).reduce((s, j) => s + quoteTotals(j.quote).total, 0);
  view().innerHTML = `
    <header class="dash-hero">
      <div class="hero-txt">
        <p class="eyebrow">${new Date().toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        <h1>Tüm tadilat işleri <span class="grad">tek yerde</span></h1>
        <p class="muted">Keşiften teklife, rölöveden render'a — sahadaki her adım burada.</p>
      </div>
      <button class="btn btn-primary btn-lg hide-m" data-new2>${icon('plus')}Yeni iş / keşif</button>
      <span class="swoosh o" aria-hidden="true"></span>
    </header>
    <section class="stats">
      ${[['talep', 'Yeni talep', 'chat'], ['kesif', 'Keşifte', 'scan'], ['teklif', 'Teklif aşaması', 'file'], ['uygulama', 'Uygulamada', 'roller']].map(([k, t, ic]) => `
        <button class="stat" data-f="${k}"><span class="ic-badge" style="--c:${statusOf(k).c}">${icon(ic)}</span><b>${cnt(k)}</b><small>${t}</small></button>`).join('')}
      <div class="stat wide"><span class="ic-badge">${icon('file')}</span><b>${fmtMoney(pipeline).replace(',00', '')}</b><small>Bekleyen teklif hacmi</small></div>
    </section>
    ${upcoming.length ? `<section class="card upcoming"><h3>${icon('calendar')}Yaklaşan keşifler</h3>${upcoming.map(j => `
      <a href="#/is/${j.id}" class="up-row"><span class="up-date"><b>${new Date(j.kesifDate).getDate()}</b>${new Date(j.kesifDate).toLocaleDateString('tr-TR', { month: 'short' })}</span>
      <span><b>${esc(j.customer.name || 'İsimsiz')}</b><small>${esc(j.customer.district || '')} · ${j.kesifDate.length > 10 ? new Date(j.kesifDate).toLocaleTimeString('tr-TR', { timeStyle: 'short' }) : ''}</small></span>${icon('chevR')}</a>`).join('')}</section>` : ''}
    <section class="list-head">
      <div class="search">${icon('search')}<input class="inp" placeholder="Müşteri, telefon, iş kodu, bölge ara…" id="q" value="${esc(sessionStorage.getItem('tb-q') || '')}"></div>
      <div class="chips scroll" id="fl">
        ${[['aktif', 'Aktif'], ['tumu', 'Tümü'], ...STATUSES.map(s => [s.k, s.t])].map(([k, t]) => `<button class="chip ${st === k ? 'on' : ''}" data-v="${k}">${t}</button>`).join('')}
      </div>
    </section>
    <section class="jobs" id="jobs"></section>`;
  const draw = () => {
    const q = $('#q').value.toLocaleLowerCase('tr'), f = sessionStorage.getItem('tb-filter') || 'aktif';
    sessionStorage.setItem('tb-q', $('#q').value);
    const list = S.jobs.filter(j => (f === 'tumu' || (f === 'aktif' ? !['iptal', 'teslim'].includes(j.status) : j.status === f)) &&
      (!q || [j.code, j.customer.name, j.customer.phone, j.customer.district, j.customer.address].join(' ').toLocaleLowerCase('tr').includes(q)));
    $('#jobs').innerHTML = list.length ? list.map(jobCard).join('') : `<div class="empty card"><div class="empty-ic">${icon('clipboard')}</div><h3>${S.jobs.length ? 'Sonuç yok' : 'İlk işinizi ekleyin'}</h3><p class="muted">${S.jobs.length ? 'Filtreyi değiştirin.' : 'Yeni bir müşteri talebi ya da keşif kaydı oluşturun.'}</p>${S.jobs.length ? '' : `<button class="btn btn-primary" data-new3>${icon('plus')}Yeni iş</button>`}</div>`;
    $('[data-new3]')?.addEventListener('click', newJobDialog);
  };
  draw();
  $('#q').oninput = draw;
  $('#fl').onclick = e => { const b = e.target.closest('.chip'); if (!b) return; sessionStorage.setItem('tb-filter', b.dataset.v); $$('#fl .chip').forEach(x => x.classList.toggle('on', x === b)); draw(); };
  $$('.stat[data-f]').forEach(b => b.onclick = () => { sessionStorage.setItem('tb-filter', b.dataset.f); dashboard(); });
  $('[data-new2]').onclick = newJobDialog;
}

function jobCard(j) {
  const s = statusOf(j.status), pr = surveyProgress(j.survey?.answers);
  const tot = j.quote ? quoteTotals(j.quote).total : 0;
  return `<a class="job-card" href="#/is/${j.id}">
    <div class="jc-top"><span class="code">${esc(j.code)}</span><span class="pill" style="--c:${s.c}">${s.t}</span></div>
    <h3>${esc(j.customer.name || 'İsimsiz müşteri')}</h3>
    <p class="muted">${icon('map')}${esc([j.customer.district, j.customer.address].filter(Boolean).join(' · ') || 'Adres girilmedi')}</p>
    <div class="jc-meta">
      ${j.kesifDate ? `<span>${icon('calendar')}${fmtDate(j.kesifDate)}</span>` : ''}
      <span>${icon('list')}${(j.requests || []).length} talep</span>
      <span>${icon('camera')}${(j.photos || []).length}</span>
      ${j.plan?.walls?.length ? `<span>${icon('ruler')}Rölöve</span>` : ''}
      ${tot ? `<span class="money">${fmtMoney(tot)}</span>` : ''}
    </div>
    <div class="bar" title="Anket %${pr.pct}"><i style="width:${pr.pct}%"></i></div>
  </a>`;
}

async function newJobDialog() {
  const r = await modal({ title: 'Yeni iş / keşif kaydı', body: `
    <div class="grid2">
      <label>Müşteri adı soyadı<input class="inp" id="nj-n" required autocomplete="off"></label>
      <label>Telefon<input class="inp" id="nj-p" type="tel" inputmode="tel" placeholder="05xx xxx xx xx"></label>
      <label>Bölge<input class="inp" id="nj-d" list="dl-d"></label>
      <label>Keşif tarihi / saati<input class="inp" id="nj-k" type="datetime-local"></label>
    </div>
    <label>Adres<textarea class="inp" id="nj-a" rows="2"></textarea></label>
    <label>Talep özeti<textarea class="inp" id="nj-s" rows="2" placeholder="örn. Banyo ve mutfak komple yenileme, salon boya"></textarea></label>
    <datalist id="dl-d">${DISTRICTS.map(d => `<option value="${d}">`).join('')}</datalist>`,
    actions: [{ k: 'no', t: 'Vazgeç' }, { k: 'ok', t: 'Oluştur', cls: 'btn-primary', validate: el => { const ok = !!$('#nj-n', el).value.trim(); if (!ok) $('#nj-n', el).focus(); return ok; } }] });
  if (r?.k !== 'ok') return;
  const d = new Date(), pre = `TB-${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}`;
  const n = S.jobs.filter(j => j.code?.startsWith(pre)).length + 1;
  const j = newJob(`${pre}-${String(n).padStart(3, '0')}`);
  Object.assign(j.customer, { name: $('#nj-n', r.el).value.trim(), phone: $('#nj-p', r.el).value.trim(), district: $('#nj-d', r.el).value.trim(), address: $('#nj-a', r.el).value.trim() });
  j.kesifDate = $('#nj-k', r.el).value; j.summary = $('#nj-s', r.el).value.trim();
  if (j.kesifDate) j.status = 'kesif';
  if (j.summary) j.requests.push({ id: uid('rq'), category: 'diger', room: '', text: j.summary, priority: 'normal', status: 'acik', t: Date.now() });
  await S.be.saveJob(j);
  S.jobs.unshift(structuredClone(j));
  S.job = j;
  location.hash = `#/is/${j.id}`;
}

/* ═════════ iş detayı ═════════ */
const TABS = [
  { k: 'genel', t: 'Genel', ic: 'user' },
  { k: 'talepler', t: 'Talepler', ic: 'list' },
  { k: 'anket', t: 'Anket', ic: 'clipboard' },
  { k: 'kesif', t: 'Keşif', ic: 'scan' },
  { k: 'rolove', t: 'Rölöve & 3D', ic: 'ruler' },
  { k: 'foto', t: 'Fotoğraflar', ic: 'camera' },
  { k: 'teklif', t: 'Teklif', ic: 'file' },
];

function jobView(tab) {
  const j = S.job, s = statusOf(j.status);
  view().innerHTML = `
    <header class="job-head">
      <a href="#/" class="icon-btn back" aria-label="Geri">${icon('back')}</a>
      <div class="jh-t"><span class="code">${esc(j.code)}</span><h1>${esc(j.customer.name || 'İsimsiz müşteri')}</h1>
        <p class="muted">${esc([j.customer.district, j.customer.address].filter(Boolean).join(' · '))}</p></div>
      <div class="jh-act">
        ${j.customer.phone ? `<a class="icon-btn" href="${telLink(j.customer.phone)}" title="Ara">${icon('phone')}</a>
        <a class="icon-btn wa" href="${waLink(j.customer.phone)}" target="_blank" rel="noopener" title="WhatsApp">${icon('chat')}</a>` : ''}
        <span class="pill lg" style="--c:${s.c}">${s.t}</span>
      </div>
    </header>
    <nav class="tabs" role="tablist">${TABS.map(t => `<a href="#/is/${j.id}/${t.k}" class="${t.k === tab ? 'on' : ''}" role="tab">${icon(t.ic)}<span>${t.t}</span>${badge(t.k)}</a>`).join('')}</nav>
    <section class="tab-body" id="tb"></section>`;
  $('.tabs .on')?.scrollIntoView({ inline: 'center', block: 'nearest' });
  const tb = $('#tb');
  ({ genel: tabGenel, talepler: tabTalepler, anket: tabAnket, kesif: tabKesif, rolove: tabRolove, foto: tabFoto, teklif: tabTeklif }[tab] || tabGenel)(tb);
}
function badge(k) {
  const j = S.job;
  const n = { talepler: j.requests.filter(r => r.status !== 'kapsamdisi').length, kesif: j.findings.length, foto: j.photos.length }[k];
  if (k === 'anket') { const p = surveyProgress(j.survey.answers).pct; return p ? `<i class="tbadge">${p}%</i>` : ''; }
  return n ? `<i class="tbadge">${n}</i>` : '';
}

/* ── Genel ── */
function tabGenel(tb) {
  const j = S.job, pr = surveyProgress(j.survey.answers), met = jobMetrics(j);
  const T = j.quote ? quoteTotals(j.quote) : null;
  tb.innerHTML = `
    <div class="card">
      <h3>İş durumu</h3>
      <div class="stepper">${STATUSES.filter(x => x.k !== 'iptal').map((x, i, arr) => {
        const idx = arr.findIndex(y => y.k === j.status);
        return `<button class="step ${x.k === j.status ? 'on' : i < idx ? 'done' : ''}" data-st="${x.k}" style="--c:${x.c}"><i>${i < idx ? icon('check') : i + 1}</i><span>${x.t}</span></button>`;
      }).join('')}</div>
      ${j.status === 'iptal' ? '<p class="warn">Bu iş iptal edildi.</p>' : ''}
    </div>
    <div class="grid-2">
      <div class="card">
        <h3>${icon('user')}Müşteri</h3>
        <div class="grid2">
          <label>Ad soyad<input class="inp" data-f="customer.name"></label>
          <label>Telefon<input class="inp" type="tel" inputmode="tel" data-f="customer.phone"></label>
          <label>E-posta<input class="inp" type="email" data-f="customer.email"></label>
          <label>Bizi nereden buldu<input class="inp" data-f="customer.source" list="dl-src"></label>
          <label>Bölge<input class="inp" data-f="customer.district" list="dl-d"></label>
          <label>Konum linki<div class="inp-btn"><input class="inp" data-f="customer.mapsUrl" placeholder="Google Maps"><button class="icon-btn" data-geo title="Şu anki konumu al">${icon('map')}</button></div></label>
        </div>
        <label>Adres<textarea class="inp" rows="2" data-f="customer.address"></textarea></label>
        ${j.customer.mapsUrl ? `<a class="btn btn-ghost btn-sm" href="${esc(j.customer.mapsUrl)}" target="_blank" rel="noopener">${icon('map')}Yol tarifi</a>` : ''}
        <datalist id="dl-d">${DISTRICTS.map(d => `<option value="${d}">`).join('')}</datalist>
        <datalist id="dl-src">${['Instagram', 'Google', 'Web sitesi', 'Tavsiye', 'Tabela', 'Eski müşteri'].map(d => `<option value="${d}">`).join('')}</datalist>
      </div>
      <div class="card">
        <h3>${icon('calendar')}Keşif ve sorumlu</h3>
        <div class="grid2">
          <label>Keşif tarihi / saati<input class="inp" type="datetime-local" data-f="kesifDate"></label>
          <label>Sorumlu / proje yöneticisi<input class="inp" data-f="assigned"></label>
        </div>
        <label>İş özeti<textarea class="inp" rows="3" data-f="summary"></textarea></label>
        <div class="kpis">
          <a href="#/is/${j.id}/talepler"><b>${j.requests.length}</b><small>Talep</small></a>
          <a href="#/is/${j.id}/anket"><b>${pr.pct}%</b><small>Anket</small></a>
          <a href="#/is/${j.id}/kesif"><b>${j.findings.length}</b><small>Tespit</small></a>
          <a href="#/is/${j.id}/rolove"><b>${fmtNum(met.floor, 1)}</b><small>m² (${met.rooms.length} mahal)</small></a>
          <a href="#/is/${j.id}/foto"><b>${j.photos.length}</b><small>Fotoğraf</small></a>
          <a href="#/is/${j.id}/teklif"><b>${T ? fmtMoney(T.total).replace(/,\d+ /, ' ') : '—'}</b><small>Teklif</small></a>
        </div>
      </div>
    </div>
    <div class="card">
      <div class="row-between"><h3>${icon('note')}Notlar ve iş geçmişi</h3><button class="btn btn-ghost btn-sm" data-note>${icon('plus')}Not ekle</button></div>
      <ul class="timeline">${j.log.slice(0, 30).map(l => `<li><time>${fmtDate(l.t, true)}</time><p>${esc(l.text)}</p></li>`).join('')}</ul>
    </div>
    <div class="row wrap">
      <button class="btn btn-primary" data-report>${icon('print')}Keşif raporu (PDF)</button>
      <button class="btn btn-ghost" data-cancel>${j.status === 'iptal' ? 'İptali geri al' : 'İşi iptal et'}</button>
      <button class="btn btn-danger" data-del>${icon('trash')}İşi sil</button>
    </div>`;
  bindFields(tb, j, p => { save(); if (p === 'customer.name') $('.jh-t h1').textContent = j.customer.name || 'İsimsiz müşteri'; });
  $$('[data-st]', tb).forEach(b => b.onclick = () => { j.status = b.dataset.st; logEvt(`Durum: ${statusOf(j.status).t}`); jobView('genel'); });
  $('[data-geo]', tb).onclick = e => {
    e.preventDefault();
    navigator.geolocation?.getCurrentPosition(p => {
      j.customer.mapsUrl = `https://maps.google.com/?q=${p.coords.latitude.toFixed(6)},${p.coords.longitude.toFixed(6)}`;
      save(); jobView('genel'); toast('Konum eklendi');
    }, () => toast('Konum alınamadı', 'err'), { enableHighAccuracy: true, timeout: 10000 });
  };
  $('[data-note]', tb).onclick = async () => { const t = await promptDlg('Not ekle', '', 'Görüşme, karar, hatırlatma…'); if (t) { logEvt(t); jobView('genel'); } };
  $('[data-cancel]', tb).onclick = () => { j.status = j.status === 'iptal' ? 'talep' : 'iptal'; logEvt(j.status === 'iptal' ? 'İş iptal edildi' : 'İptal geri alındı'); jobView('genel'); };
  $('[data-del]', tb).onclick = async () => {
    if (!await confirmDlg(`${j.code} — ${j.customer.name} işi tüm fotoğraf ve çizimleriyle kalıcı olarak silinecek.`)) return;
    await S.be.deleteJob(j); S.jobs = S.jobs.filter(x => x.id !== j.id); S.job = null; location.hash = '#/'; toast('İş silindi');
  };
  $('[data-report]', tb).onclick = printReport;
}

/* ── Talepler ── */
function tabTalepler(tb) {
  const j = S.job;
  const PRI = { dusuk: 'Düşük', normal: 'Normal', yuksek: 'Yüksek' };
  const RST = { acik: 'Değerlendirilecek', kapsamda: 'Kapsamda', kapsamdisi: 'Kapsam dışı' };
  const draw = () => {
    tb.innerHTML = `
      <form class="card req-form">
        <h3>Müşteri talebi ekle</h3>
        <div class="chips scroll" id="rc">${CATEGORIES.map((c, i) => `<button type="button" class="chip ${i === 0 ? 'on' : ''}" data-v="${c.k}">${icon(c.ic)}${c.t}</button>`).join('')}</div>
        <div class="grid3">
          <label>Mahal<input class="inp" id="rr" list="dl-room" placeholder="örn. Ebeveyn banyosu"></label>
          <label>Öncelik<select class="inp" id="rp">${Object.entries(PRI).map(([k, v]) => `<option value="${k}" ${k === 'normal' ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
        </div>
        <label>Talep<textarea class="inp" id="rt" rows="2" required placeholder="Müşterinin kendi ifadesiyle ne istediği…"></textarea></label>
        <button class="btn btn-primary">${icon('plus')}Ekle</button>
        <datalist id="dl-room">${roomNames().map(r => `<option value="${esc(r)}">`).join('')}</datalist>
      </form>
      <div class="req-list">${j.requests.length ? CATEGORIES.map(c => {
        const rs = j.requests.filter(r => r.category === c.k); if (!rs.length) return '';
        return `<div class="card"><h4 class="cat-h"><span class="ic-badge sm">${icon(c.ic)}</span>${c.t}<span class="muted">${rs.length}</span></h4>${rs.map(r => `
          <div class="req ${r.status}" data-id="${r.id}">
            <div class="req-main"><p>${esc(r.text)}</p><small class="muted">${r.room ? esc(r.room) + ' · ' : ''}${PRI[r.priority]} öncelik · ${fmtDate(r.t)}</small></div>
            <div class="req-ops">
              <select class="inp mini" data-rs>${Object.entries(RST).map(([k, v]) => `<option value="${k}" ${r.status === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
              <button class="icon-btn sm" data-ed title="Düzenle">${icon('edit')}</button>
              <button class="icon-btn sm danger" data-dl title="Sil">${icon('trash')}</button>
            </div></div>`).join('')}</div>`;
      }).join('') : `<div class="empty card"><div class="empty-ic">${icon('list')}</div><h3>Henüz talep yok</h3><p class="muted">Müşterinin istediklerini kategori kategori kaydedin; anketten de aktarabilirsiniz.</p></div>`}</div>`;
    let cat = CATEGORIES[0].k;
    $('#rc').onclick = e => { const b = e.target.closest('.chip'); if (!b) return; cat = b.dataset.v; $$('#rc .chip').forEach(x => x.classList.toggle('on', x === b)); };
    $('.req-form').onsubmit = e => {
      e.preventDefault();
      j.requests.push({ id: uid('rq'), category: cat, room: $('#rr').value.trim(), text: $('#rt').value.trim(), priority: $('#rp').value, status: 'acik', t: Date.now() });
      save(); draw(); toast('Talep eklendi');
    };
    tb.onchange = e => { if (e.target.matches('[data-rs]')) { j.requests.find(r => r.id === e.target.closest('.req').dataset.id).status = e.target.value; save(); draw(); } };
    $$('.req [data-dl]', tb).forEach(b => b.onclick = async () => { const id = b.closest('.req').dataset.id; if (await confirmDlg('Talep silinsin mi?')) { j.requests = j.requests.filter(r => r.id !== id); save(); draw(); } });
    $$('.req [data-ed]', tb).forEach(b => b.onclick = async () => {
      const r = j.requests.find(x => x.id === b.closest('.req').dataset.id);
      const res = await modal({ title: 'Talebi düzenle', body: `<label>Talep<textarea class="inp" rows="3" id="et">${esc(r.text)}</textarea></label>
        <div class="grid2"><label>Mahal<input class="inp" id="er" value="${esc(r.room)}"></label><label>Kategori<select class="inp" id="ec">${CATEGORIES.map(c => `<option value="${c.k}" ${c.k === r.category ? 'selected' : ''}>${c.t}</option>`).join('')}</select></label></div>`,
        actions: [{ k: 'no', t: 'Vazgeç' }, { k: 'ok', t: 'Kaydet', cls: 'btn-primary' }] });
      if (res?.k === 'ok') { r.text = $('#et', res.el).value; r.room = $('#er', res.el).value; r.category = $('#ec', res.el).value; save(); draw(); }
    });
  };
  draw();
}
function roomNames() {
  const j = S.job;
  return [...new Set([...(j.inspection.rooms || []).map(r => r.name), ...(j.plan?.rooms || []).map(r => r.name), ...ROOM_TYPES])].filter(Boolean);
}

/* ── Anket ── */
function tabAnket(tb) {
  const j = S.job;
  renderSurvey(tb, j, () => save());
  tb.addEventListener('click', e => {
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (a === 'toRequests') {
      const ks = j.survey.answers.kapsam || [];
      let n = 0;
      ks.forEach(k => { if (!j.requests.some(r => r.category === k)) { j.requests.push({ id: uid('rq'), category: k, room: '', text: `${catOf(k).t} işleri (anketten)`, priority: 'normal', status: 'kapsamda', t: Date.now() }); n++; } });
      save(); toast(n ? `${n} kategori taleplere eklendi` : 'Tüm kapsam zaten taleplerde');
    }
    if (a === 'print') printDoc(`<div class="pdoc">${docHeader(S.settings, 'Müşteri Anketi', `<div class="p-meta"><span>${esc(j.code)}</span><span>${esc(j.customer.name)}</span><span>${fmtDate(Date.now())}</span></div>`)}${surveyPrintHtml(j)}${docFooter()}</div>`, `Anket ${j.code}`);
  });
}

/* ── Keşif ── */
function tabKesif(tb) {
  const j = S.job, rooms = j.inspection.rooms;
  const openSet = new Set(JSON.parse(sessionStorage.getItem('tb-insp-open') || '[]'));
  const draw = async () => {
    tb.innerHTML = `
      <div class="card">
        <div class="row-between"><h3>${icon('scan')}Mahal bazlı keşif</h3>
          <div class="row"><button class="btn btn-ghost btn-sm" data-imp ${j.plan?.rooms?.length ? '' : 'disabled title="Önce rölöve planında oda çizin"'}>${icon('ruler')}Plandan aktar</button>
          <button class="btn btn-primary btn-sm" data-add>${icon('plus')}Mahal ekle</button></div></div>
        <p class="muted small">Her mahal için ölçüleri girin, kontrol listesini sistematik olarak işaretleyin, fotoğrafları mahale bağlayın.</p>
      </div>
      <div id="rooms">${rooms.map(roomCard).join('') || `<div class="empty card"><div class="empty-ic">${icon('home')}</div><h3>Mahal eklenmedi</h3><p class="muted">Salon, banyo, mutfak… her alanı ayrı ayrı kaydedin.</p></div>`}</div>
      <div class="card">
        <div class="row-between"><h3>${icon('alert')}Tespitler</h3><button class="btn btn-primary btn-sm" data-fadd>${icon('plus')}Tespit ekle</button></div>
        <div class="findings">${j.findings.length ? j.findings.map(findingCard).join('') : '<p class="muted small">Hasar, kaçak, nem, statik risk, mevzuat… keşifte gördüğünüz her durumu not edin.</p>'}</div>
      </div>
      <div class="card"><h3>${icon('note')}Genel keşif notları</h3><textarea class="inp" rows="4" data-f="kesifNotes" placeholder="Bina genel durumu, ortak alanlar, erişim, komşular, otopark…"></textarea></div>`;
    bindFields(tb, j, () => save());
    await hydratePhotos(tb);
  };
  const roomCard = r => {
    const area = r.w && r.l ? r.w * r.l / 1e4 : 0, wall = r.w && r.l ? 2 * (r.w + r.l) / 100 * ((r.h || 280) / 100) : 0;
    const done = INSPECTION.filter(i => r.checks?.[i.k]?.state).length;
    const ph = j.photos.filter(p => p.room === r.name);
    return `<section class="card room-card ${openSet.has(r.id) ? 'open' : ''}" data-id="${r.id}">
      <button class="room-h"><span class="ic-badge sm">${icon('home')}</span><b>${esc(r.name)}</b><span class="muted small rh-m">${area ? fmtNum(area) + ' m²' : 'ölçü yok'} · kontrol ${done}/${INSPECTION.length}</span>${icon('chevR', 'chev')}</button>
      <div class="room-b">
        <div class="grid4">
          <label>Ad<input class="inp" data-r="name" value="${esc(r.name)}" list="dl-rt"></label>
          <label>En<div class="inp-unit"><input class="inp" type="number" inputmode="decimal" data-r="w" value="${r.w || ''}"><span>cm</span></div></label>
          <label>Boy<div class="inp-unit"><input class="inp" type="number" inputmode="decimal" data-r="l" value="${r.l || ''}"><span>cm</span></div></label>
          <label>Yükseklik<div class="inp-unit"><input class="inp" type="number" inputmode="decimal" data-r="h" value="${r.h || ''}" placeholder="280"><span>cm</span></div></label>
        </div>
        <p class="met-line" ${area ? '' : 'hidden'}>${metLine(r)}</p>
        <div class="checks">${INSPECTION.map(i => {
          const c = r.checks?.[i.k] || {};
          return `<div class="chk" data-k="${i.k}"><div class="chk-t"><b>${i.t}</b><small>${i.hint}</small></div>
            <div class="seg">${CHECK_STATES.map(s => `<button class="${c.state === s.k ? 'on' : ''}" style="--c:${s.c}" data-s="${s.k}">${s.t}</button>`).join('')}</div>
            ${c.state && c.state !== 'iyi' && c.state !== 'yok' ? `<input class="inp sm" data-n placeholder="Not / ölçüm" value="${esc(c.note || '')}">` : ''}</div>`;
        }).join('')}</div>
        <label>Mahal notu<textarea class="inp" rows="2" data-r="notes">${esc(r.notes || '')}</textarea></label>
        <div class="thumbs">${ph.map(p => `<button class="thumb" data-ph="${p.id}"><img data-src="${p.id}" alt=""></button>`).join('')}
          <label class="thumb add">${icon('camera')}<input type="file" accept="image/*" capture="environment" multiple hidden data-cam></label></div>
        <div class="row"><button class="btn btn-ghost btn-sm" data-fr>${icon('alert')}Bu mahal için tespit</button><button class="btn btn-ghost btn-sm danger-t" data-rdel>${icon('trash')}Mahali sil</button></div>
      </div></section>`;
  };
  const findingCard = f => {
    const sv = sevOf(f.severity), ph = j.photos.filter(p => p.findingId === f.id);
    return `<div class="finding" data-id="${f.id}" style="--c:${sv.c}">
      <div class="f-top"><span class="pill" style="--c:${sv.c}">${sv.t}</span><b>${esc(f.title)}</b><span class="muted small">${esc(catOf(f.category).t)}${f.room ? ' · ' + esc(f.room) : ''}</span></div>
      ${f.desc ? `<p>${esc(f.desc)}</p>` : ''}${f.action ? `<p class="f-act">${icon('tools')}${esc(f.action)}</p>` : ''}
      <div class="thumbs">${ph.map(p => `<button class="thumb" data-ph="${p.id}"><img data-src="${p.id}" alt=""></button>`).join('')}
        <label class="thumb add">${icon('camera')}<input type="file" accept="image/*" capture="environment" multiple hidden data-fcam></label></div>
      <div class="row"><button class="btn btn-ghost btn-xs" data-fed>${icon('edit')}Düzenle</button><button class="btn btn-ghost btn-xs danger-t" data-fdl>${icon('trash')}Sil</button></div></div>`;
  };
  draw();
  tb.onclick = async e => {
    const rc = e.target.closest('.room-card'), fc = e.target.closest('.finding');
    const t = e.target.closest('button, [data-ph]');
    if (!t) return;
    if (t.matches('.room-h')) { rc.classList.toggle('open'); rc.classList.contains('open') ? openSet.add(rc.dataset.id) : openSet.delete(rc.dataset.id); sessionStorage.setItem('tb-insp-open', JSON.stringify([...openSet])); return; }
    if (t.matches('[data-add]')) {
      const name = await promptDlg('Mahal adı', '', 'örn. Salon'); if (!name) return;
      const r = { id: uid('m'), name, w: '', l: '', h: '', checks: {}, notes: '' }; rooms.push(r); openSet.add(r.id); save(); draw(); return;
    }
    if (t.matches('[data-imp]')) {
      let n = 0;
      for (const pr of planMetrics(j.plan).rooms) {
        const src = j.plan.rooms.find(x => x.id === pr.id);
        const xs = src.pts.map(p => p.x), ys = src.pts.map(p => p.y);
        let r = rooms.find(x => x.planId === pr.id || x.name === pr.name);
        if (!r) { r = { id: uid('m'), name: pr.name, checks: {}, notes: '' }; rooms.push(r); n++; }
        Object.assign(r, { planId: pr.id, w: Math.round(Math.max(...xs) - Math.min(...xs)), l: Math.round(Math.max(...ys) - Math.min(...ys)), h: Math.round(pr.h * 100) });
      }
      save(); draw(); toast(`${n} yeni mahal aktarıldı, ölçüler güncellendi`); return;
    }
    if (t.matches('.seg button')) {
      const r = rooms.find(x => x.id === rc.dataset.id), k = t.closest('.chk').dataset.k;
      r.checks ??= {}; r.checks[k] ??= {};
      r.checks[k].state = r.checks[k].state === t.dataset.s ? '' : t.dataset.s;
      save(); const y = scrollY; await draw(); scrollTo(0, y); return;
    }
    if (t.matches('[data-rdel]')) { if (await confirmDlg('Mahal kaydı silinsin mi? (Fotoğraflar kalır)')) { j.inspection.rooms = j.inspection.rooms.filter(x => x.id !== rc.dataset.id); tabKesif(tb); save(); } return; }
    if (t.matches('[data-fr]')) { const r = rooms.find(x => x.id === rc.dataset.id); if (await findingDialog({ room: r.name })) draw(); return; }
    if (t.matches('[data-fadd]')) { if (await findingDialog({})) draw(); return; }
    if (t.matches('[data-fed]')) { if (await findingDialog(j.findings.find(f => f.id === fc.dataset.id))) draw(); return; }
    if (t.matches('[data-fdl]')) { if (await confirmDlg('Tespit silinsin mi?')) { j.findings = j.findings.filter(f => f.id !== fc.dataset.id); save(); draw(); } return; }
    if (t.matches('[data-ph]')) { lightbox(t.dataset.ph, () => draw()); }
  };
  tb.oninput = e => {
    const rc = e.target.closest('.room-card'); if (!rc) return;
    const r = rooms.find(x => x.id === rc.dataset.id);
    if (e.target.dataset.r) {
      const k = e.target.dataset.r; r[k] = e.target.type === 'number' ? (e.target.value === '' ? '' : +e.target.value) : e.target.value;
      if (k === 'name') $('.room-h b', rc).textContent = r.name;
      if ('wlh'.includes(k)) {
        const ml = $('.met-line', rc), ok = r.w && r.l; ml.hidden = !ok; if (ok) ml.innerHTML = metLine(r);
        const done = INSPECTION.filter(i => r.checks?.[i.k]?.state).length;
        $('.rh-m', rc).textContent = `${ok ? fmtNum(r.w * r.l / 1e4) + ' m²' : 'ölçü yok'} · kontrol ${done}/${INSPECTION.length}`;
      }
      save();
    }
    if (e.target.matches('[data-n]')) { r.checks[e.target.closest('.chk').dataset.k].note = e.target.value; save(); }
  };
  tb.onchange = async e => {
    if (e.target.matches('[data-cam]')) { const r = rooms.find(x => x.id === e.target.closest('.room-card').dataset.id); await addPhotos(e.target.files, { tag: 'kesif', room: r.name }); draw(); }
    if (e.target.matches('[data-fcam]')) { const f = j.findings.find(x => x.id === e.target.closest('.finding').dataset.id); await addPhotos(e.target.files, { tag: 'tespit', room: f.room, findingId: f.id }); draw(); }
  };
  if (!$('#dl-rt')) document.body.append(h(`<datalist id="dl-rt">${ROOM_TYPES.map(r => `<option value="${r}">`).join('')}</datalist>`));
}

function metLine(r) {
  if (!(r.w && r.l)) return '';
  const area = r.w * r.l / 1e4, per = 2 * (r.w + r.l) / 100;
  return `<span>Zemin <b>${fmtNum(area)} m²</b></span><span>Brüt duvar <b>${fmtNum(per * ((r.h || 280) / 100))} m²</b></span><span>Çevre <b>${fmtNum(per)} m</b></span>`;
}

async function findingDialog(f) {
  const j = S.job, isNew = !f.id;
  const r = await modal({ title: isNew ? 'Yeni tespit' : 'Tespiti düzenle', body: `
    <label>Başlık<input class="inp" id="ft" value="${esc(f.title || '')}" placeholder="örn. Banyo tavanında rutubet lekesi"></label>
    <div class="grid3">
      <label>Kategori<select class="inp" id="fc">${CATEGORIES.map(c => `<option value="${c.k}" ${c.k === f.category ? 'selected' : ''}>${c.t}</option>`).join('')}</select></label>
      <label>Mahal<input class="inp" id="fm" list="dl-rt" value="${esc(f.room || '')}"></label>
      <label>Önem<select class="inp" id="fs">${SEVERITY.map(s => `<option value="${s.k}" ${s.k === (f.severity || 'orta') ? 'selected' : ''}>${s.t}</option>`).join('')}</select></label>
    </div>
    <label>Açıklama / ölçüm<textarea class="inp" rows="3" id="fd">${esc(f.desc || '')}</textarea></label>
    <label>Önerilen çözüm<textarea class="inp" rows="2" id="fa">${esc(f.action || '')}</textarea></label>
    ${isNew ? `<label class="file-drop">${icon('camera')}<span>Fotoğraf ekle (isteğe bağlı)</span><input type="file" accept="image/*" capture="environment" multiple id="fp" hidden></label>` : ''}`,
    actions: [{ k: 'no', t: 'Vazgeç' }, { k: 'ok', t: 'Kaydet', cls: 'btn-primary', validate: el => !!$('#ft', el).value.trim() }],
    onOpen: el => { const fp = $('#fp', el); if (fp) fp.onchange = () => { $('.file-drop span', el).textContent = `${fp.files.length} fotoğraf seçildi`; }; } });
  if (r?.k !== 'ok') return false;
  const x = isNew ? { id: uid('f'), t: Date.now() } : f;
  Object.assign(x, { title: $('#ft', r.el).value.trim(), category: $('#fc', r.el).value, room: $('#fm', r.el).value.trim(), severity: $('#fs', r.el).value, desc: $('#fd', r.el).value.trim(), action: $('#fa', r.el).value.trim() });
  if (isNew) { j.findings.push(x); logEvt(`Tespit: ${x.title}`); }
  const files = $('#fp', r.el)?.files;
  if (files?.length) await addPhotos(files, { tag: 'tespit', room: x.room, findingId: x.id });
  save();
  return true;
}

/* ── Rölöve & 3D (özet) ── */
function tabRolove(tb) {
  const j = S.job, P = j.plan, met = planMetrics(P);
  const rl = j.photos.filter(p => p.tag === 'rolove' || p.tag === 'render');
  tb.innerHTML = `
    <div class="card plan-card">
      <div class="row-between"><h3>${icon('ruler')}Rölöve çizimi</h3>
        <a class="btn btn-primary" href="#/is/${j.id}/plan">${icon('edit')}${P?.walls?.length ? 'Çizimi aç' : 'Çizime başla'}</a></div>
      ${P?.walls?.length || P?.rooms?.length ? `<a class="thumb-wrap" href="#/is/${j.id}/plan">${planThumbSvg(P)}</a>
        <div class="met-chips"><span><small>Mahal</small><b>${met.rooms.length}</b></span><span><small>Toplam zemin</small><b>${fmtNum(met.floor)} m²</b></span><span><small>Net duvar</small><b>${fmtNum(met.wall)} m²</b></span><span><small>Çevre</small><b>${fmtNum(met.perim)} m</b></span></div>
        <div class="row wrap"><a class="btn btn-ghost" href="#/is/${j.id}/plan?v=3d">${icon('cube')}3D model</a><a class="btn btn-ghost" href="#/is/${j.id}/plan?v=3d&r=1">${icon('sparkle')}Render oluştur</a></div>`
        : `<div class="empty"><div class="empty-ic">${icon('ruler')}</div><p class="muted">Ölçtüğünüz mahalleri duvar, kapı, pencere ve donatılarıyla çizin; plan otomatik olarak 3D modele dönüşür ve gerçekçi render alınabilir.</p>
          <div class="row wrap center"><button class="btn btn-ghost" data-tpl>${icon('layers')}Örnek daire planıyla başla</button></div></div>`}
    </div>
    <div class="card">
      <div class="row-between"><h3>${icon('image')}Kroki, rölöve fotoğrafları ve renderlar</h3>
        <label class="btn btn-ghost btn-sm">${icon('upload')}Kroki ekle<input type="file" accept="image/*" multiple hidden data-up></label></div>
      <div class="gallery">${rl.map(p => `<button class="gimg" data-ph="${p.id}"><img data-src="${p.id}" alt=""><span>${esc(p.caption || PHOTO_TAGS.find(t => t.k === p.tag)?.t)}</span></button>`).join('') || '<p class="muted small">Elle çizilmiş krokilerin fotoğrafını ekleyin; çizim editöründe "Altlık" olarak kullanıp üzerinden ölçekli çizebilirsiniz.</p>'}</div>
    </div>`;
  hydratePhotos(tb);
  $('[data-up]', tb).onchange = async e => { await addPhotos(e.target.files, { tag: 'rolove' }); tabRolove(tb); };
  $$('[data-ph]', tb).forEach(b => b.onclick = () => lightbox(b.dataset.ph, () => tabRolove(tb)));
  $('[data-tpl]', tb)?.addEventListener('click', () => {
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
    j.plan = p; save(); location.hash = `#/is/${j.id}/plan`;
  });
}

/* ── Fotoğraflar ── */
function tabFoto(tb) {
  const j = S.job, f = sessionStorage.getItem('tb-ptag') || '';
  const list = j.photos.filter(p => !f || p.tag === f);
  tb.innerHTML = `
    <div class="card photo-top">
      <div class="row wrap">
        <label class="btn btn-primary">${icon('camera')}Fotoğraf çek<input type="file" accept="image/*" capture="environment" multiple hidden data-up></label>
        <label class="btn btn-ghost">${icon('upload')}Galeriden ekle<input type="file" accept="image/*" multiple hidden data-up></label>
        <select class="inp mini" id="ptag" title="Yeni fotoğrafların etiketi">${PHOTO_TAGS.map(t => `<option value="${t.k}">${t.t}</option>`).join('')}</select>
      </div>
      <div class="chips scroll" id="pf"><button class="chip ${!f ? 'on' : ''}" data-v="">Tümü (${j.photos.length})</button>${PHOTO_TAGS.map(t => { const n = j.photos.filter(p => p.tag === t.k).length; return n ? `<button class="chip ${f === t.k ? 'on' : ''}" data-v="${t.k}">${t.t} (${n})</button>` : ''; }).join('')}</div>
    </div>
    <div class="gallery big">${list.map(p => `<button class="gimg" data-ph="${p.id}"><img data-src="${p.id}" alt="" loading="lazy"><span>${esc(p.caption || p.room || PHOTO_TAGS.find(t => t.k === p.tag)?.t || '')}</span></button>`).join('') || `<div class="empty card"><div class="empty-ic">${icon('camera')}</div><h3>Fotoğraf yok</h3><p class="muted">Keşif fotoğraflarını çekin; mahal ve etiketle düzenleyin.</p></div>`}</div>`;
  hydratePhotos(tb);
  $('#ptag', tb).value = sessionStorage.getItem('tb-newtag') || 'kesif';
  $('#ptag', tb).onchange = e => sessionStorage.setItem('tb-newtag', e.target.value);
  $$('[data-up]', tb).forEach(i => i.onchange = async () => { await addPhotos(i.files, { tag: $('#ptag', tb).value }); tabFoto(tb); });
  $('#pf', tb).onclick = e => { const b = e.target.closest('.chip'); if (!b) return; sessionStorage.setItem('tb-ptag', b.dataset.v); tabFoto(tb); };
  $$('[data-ph]', tb).forEach(b => b.onclick = () => lightbox(b.dataset.ph, () => tabFoto(tb)));
}

/* ── Teklif ── */
function tabTeklif(tb) {
  renderQuote(tb, S.job, S.settings, () => { save(); if (S.job.quote && ['talep', 'kesif'].includes(S.job.status) && S.job.quote.items.length) { S.job.status = 'teklif'; logEvt('Teklif hazırlanıyor'); } }, { photoUrl: p => S.be.photoUrl(p) });
}

/* ═════════ fotoğraf yardımcıları ═════════ */
async function addPhotos(files, meta = {}) {
  const arr = [...(files || [])]; if (!arr.length) return [];
  const t = h(`<div class="upload-bar"><div class="spin sm"></div><span>Fotoğraflar yükleniyor 0/${arr.length}</span></div>`);
  document.body.append(t);
  const out = [];
  try {
    for (const [i, file] of arr.entries()) {
      const { blob, w, h: hh } = await compressImage(file);
      const id = uid('p');
      const res = await S.be.uploadPhoto(S.job.id, blob, id);
      const p = { id, ...res, tag: meta.tag || 'kesif', room: meta.room || '', findingId: meta.findingId || '', caption: meta.caption || '', w, h: hh, t: Date.now() };
      S.job.photos.push(p); out.push(p);
      $('span', t).textContent = `Fotoğraflar yükleniyor ${i + 1}/${arr.length}`;
    }
    save(); toast(`${arr.length} fotoğraf eklendi`);
  } catch (e) { toast('Yükleme hatası: ' + e.message, 'err'); }
  finally { t.remove(); }
  return out;
}
async function addBlobPhoto(blob, meta) {
  const id = uid('p');
  const res = await S.be.uploadPhoto(S.job.id, blob, id);
  const p = { id, ...res, tag: meta.tag, room: '', findingId: '', caption: meta.caption || '', t: Date.now() };
  S.job.photos.push(p); save();
  return p;
}
async function hydratePhotos(root) {
  for (const img of $$('img[data-src]', root)) {
    const p = S.job.photos.find(x => x.id === img.dataset.src);
    if (p) S.be.photoUrl(p).then(u => { img.src = u; });
  }
}
async function lightbox(id, onChange) {
  const j = S.job, i0 = j.photos.findIndex(p => p.id === id); if (i0 < 0) return;
  let i = i0;
  const lb = h(`<div class="lightbox"><button class="icon-btn lb-x">${icon('x')}</button>
    <button class="icon-btn lb-prev">‹</button><img alt=""><button class="icon-btn lb-next">›</button>
    <div class="lb-panel"><div class="grid3">
      <label>Açıklama<input class="inp" data-k="caption"></label>
      <label>Etiket<select class="inp" data-k="tag">${PHOTO_TAGS.map(t => `<option value="${t.k}">${t.t}</option>`).join('')}</select></label>
      <label>Mahal<input class="inp" data-k="room" list="dl-rt"></label></div>
      <div class="row"><button class="btn btn-ghost btn-sm" data-dl>${icon('download')}İndir</button><button class="btn btn-danger btn-sm" data-del>${icon('trash')}Sil</button><span class="muted small lb-meta"></span></div>
    </div></div>`);
  const show = async () => {
    const p = j.photos[i];
    $('img', lb).src = await S.be.photoUrl(p);
    $$('[data-k]', lb).forEach(el => { el.value = p[el.dataset.k] || ''; });
    $('.lb-meta', lb).textContent = `${i + 1}/${j.photos.length} · ${fmtDate(p.t, true)}`;
  };
  const close = () => { lb.remove(); document.removeEventListener('keydown', key); onChange?.(); };
  const key = e => { if (e.key === 'Escape') close(); if (e.key === 'ArrowRight') { i = (i + 1) % j.photos.length; show(); } if (e.key === 'ArrowLeft') { i = (i - 1 + j.photos.length) % j.photos.length; show(); } };
  document.addEventListener('keydown', key);
  $('.lb-x', lb).onclick = close;
  $('.lb-next', lb).onclick = () => { i = (i + 1) % j.photos.length; show(); };
  $('.lb-prev', lb).onclick = () => { i = (i - 1 + j.photos.length) % j.photos.length; show(); };
  lb.oninput = e => { const k = e.target.dataset.k; if (k) { j.photos[i][k] = e.target.value; save(); } };
  $('[data-dl]', lb).onclick = async () => downloadBlob(await S.be.photoBlob(j.photos[i]), `${j.code}-${j.photos[i].id}.${j.photos[i].path?.endsWith('png') ? 'png' : 'jpg'}`);
  $('[data-del]', lb).onclick = async () => {
    if (!await confirmDlg('Fotoğraf kalıcı olarak silinsin mi?')) return;
    const p = j.photos[i];
    await S.be.deletePhoto(j, p).catch(() => {});
    j.photos.splice(i, 1);
    if (j.plan?.meta?.bg?.photoId === p.id) j.plan.meta.bg = null;
    save();
    if (!j.photos.length) return close();
    i = Math.min(i, j.photos.length - 1); show();
  };
  // kaydırma ile geçiş (mobil)
  let sx = null;
  $('img', lb).addEventListener('touchstart', e => { sx = e.touches[0].clientX; }, { passive: true });
  $('img', lb).addEventListener('touchend', e => { if (sx === null) return; const d = e.changedTouches[0].clientX - sx; if (Math.abs(d) > 50) { i = (i + (d < 0 ? 1 : -1) + j.photos.length) % j.photos.length; show(); } sx = null; });
  document.body.append(lb);
  show();
}

async function pickPhoto() {
  const j = S.job;
  const body = h(`<div><label class="btn btn-primary">${icon('upload')}Yeni görsel yükle<input type="file" accept="image/*" hidden></label>
    <div class="gallery pick">${j.photos.map(p => `<button class="gimg" data-id="${p.id}"><img data-src="${p.id}" alt=""><span>${esc(p.caption || PHOTO_TAGS.find(t => t.k === p.tag)?.t || '')}</span></button>`).join('')}</div></div>`);
  hydratePhotos(body);
  return new Promise(res => {
    let done = false;
    modal({ title: 'Görsel seç', body, wide: true, actions: [{ k: 'no', t: 'Vazgeç' }],
      onOpen: (el, close) => {
        $('input', el).onchange = async e => { const [p] = await addPhotos(e.target.files, { tag: 'rolove' }); done = true; res(p); close(null); };
        el.onclick = e => { const b = e.target.closest('[data-id]'); if (b) { done = true; res(j.photos.find(p => p.id === b.dataset.id)); close(null); } };
      } }).then(() => { if (!done) res(null); });
  });
}

/* ═════════ rölöve ekranı (2D editör + 3D + render) ═════════ */
function teardownPlan() {
  S.editor?.destroy(); S.editor = null;
  S.p3?.dispose(); S.p3 = null;
}

function planScreen() {
  const j = S.job;
  j.plan ??= emptyPlan();
  const qs = new URLSearchParams(location.hash.split('?')[1] || '');
  let mode = qs.get('v') === '3d' ? '3d' : '2d';
  view().innerHTML = `<div class="plan-screen" data-mode="${mode}">
    <header class="ps-head">
      <a href="#/is/${j.id}/rolove" class="icon-btn" aria-label="Geri">${icon('back')}</a>
      <div class="ps-t"><b>${esc(j.customer.name || j.code)}</b><small>Rölöve · ${esc(j.code)}</small></div>
      <div class="seg big" id="psMode"><button data-m="2d">2D Plan</button><button data-m="3d">${icon('cube')}3D</button><button data-m="split" class="hide-m">Yan yana</button></div>
      <div class="ps-act">
        <button class="btn btn-ghost btn-sm" data-png title="Planı PNG olarak fotoğraflara kaydet">${icon('download')}<span>Plan görseli</span></button>
        <button class="btn btn-primary btn-sm" data-render>${icon('sparkle')}<span>Render</span></button>
      </div>
    </header>
    <div class="ps-body">
      <div class="ps-2d" id="ps2d"></div>
      <div class="ps-3d" id="ps3d">
        <div class="p3-bar">
          <div class="seg" id="cam"><button data-c="orbit" class="on">Kuşbakışı</button><button data-c="top">Üstten</button><button data-c="interior">${icon('walk')}İç mekan</button></div>
          <select class="inp mini" id="p3room" hidden></select>
          <button class="tgl" data-t="cut">${icon('layers')}<span>Kesit</span></button>
          <button class="tgl" data-t="ceiling">${icon('home')}<span>Tavan</span></button>
          <label class="sl">${icon('sun2')}<input type="range" min="0" max="360" step="5" id="sunAz" title="Güneş yönü"></label>
          <label class="sl">↕<input type="range" min="5" max="85" step="1" id="sunEl" title="Güneş yüksekliği"></label>
          <label class="sl">☀︎<input type="range" min="0.4" max="2" step="0.05" id="expo" title="Pozlama"></label>
        </div>
        <div class="p3-host" id="p3host"><div class="p3-load"><div class="spin"></div><p>3D model hazırlanıyor…</p></div></div>
        <p class="p3-hint" id="p3hint">Sürükle: döndür · iki parmak / sağ tık: kaydır · tekerlek / kıstırma: yakınlaştır</p>
      </div>
    </div>
  </div>`;
  const root = $('.plan-screen');
  const sync3d = debounce(() => S.p3?.setPlan(S.editor.plan), 350);
  S.editor = new PlanEditor($('#ps2d'), j.plan, {
    onChange: p => { j.plan = p; save(); if (mode !== '2d') sync3d(); },
    resolvePhoto: id => { const p = j.photos.find(x => x.id === id); return p ? S.be.photoUrl(p) : ''; },
    pickBackground: pickPhoto,
  });
  const setMode = async m => {
    mode = m; root.dataset.mode = m;
    $$('#psMode button').forEach(b => b.classList.toggle('on', b.dataset.m === m));
    if (m !== '2d') await ensure3d();
    setTimeout(() => { S.editor?.render(); S.p3?.resize(); }, 50);
  };
  $('#psMode').onclick = e => { const b = e.target.closest('[data-m]'); if (b) setMode(b.dataset.m); };
  $('[data-png]').onclick = async () => {
    const blob = await S.editor.exportPng({ title: `${j.code} ${j.customer.name || ''}` });
    if (!blob) return toast('Plan boş', 'err');
    const p = await addBlobPhoto(blob, { tag: 'rolove', caption: 'Rölöve planı ' + new Date().toLocaleDateString('tr-TR') });
    downloadBlob(blob, `${j.code}-rolove.png`);
    toast('Plan görseli fotoğraflara kaydedildi');
    return p;
  };
  $('[data-render]').onclick = async () => { if (mode === '2d') await setMode('3d'); renderDialog(); };
  setMode(mode).then(() => { if (qs.get('r')) renderDialog(); });
}

async function ensure3d() {
  if (S.p3) { S.p3.setPlan(S.editor.plan); return S.p3; }
  const { Plan3D } = await import('./plan3d.js');
  const host = $('#p3host'); if (!host) return;
  const p3 = new Plan3D(host);
  try { await p3.init(); } catch (e) { $('.p3-load', host).innerHTML = `<p class="warn">3D başlatılamadı: ${esc(e.message)}</p>`; return; }
  if (!$('#p3host')) { p3.dispose(); return; }
  S.p3 = p3;
  $('.p3-load', host)?.remove();
  p3.setPlan(S.editor.plan);
  const sel = $('#p3room');
  const fillRooms = () => { sel.innerHTML = S.editor.plan.rooms.map(r => `<option value="${r.id}">${esc(r.name)}</option>`).join(''); };
  $('#sunAz').value = p3.opt.sunAz; $('#sunEl').value = p3.opt.sunEl; $('#expo').value = p3.opt.exposure;
  $('#sunAz').oninput = e => p3.set('sunAz', +e.target.value);
  $('#sunEl').oninput = e => p3.set('sunEl', +e.target.value);
  $('#expo').oninput = e => p3.set('exposure', +e.target.value);
  $$('.p3-bar [data-t]').forEach(b => b.classList.toggle('on', !!p3.opt[b.dataset.t]));
  $$('.p3-bar [data-t]').forEach(b => b.onclick = () => { const k = b.dataset.t; p3.set(k, !p3.opt[k]); b.classList.toggle('on', p3.opt[k]); });
  $('#cam').onclick = e => {
    const b = e.target.closest('[data-c]'); if (!b) return;
    const c = b.dataset.c;
    if (c === 'interior') {
      fillRooms();
      if (!S.editor.plan.rooms.length) return toast('İç mekan için önce oda çizin', 'err');
      sel.hidden = false;
      if (!p3.opt.ceiling) { p3.set('ceiling', true); $('.p3-bar [data-t="ceiling"]').classList.add('on'); }
      if (p3.opt.cut) { p3.set('cut', false); $('.p3-bar [data-t="cut"]').classList.remove('on'); }
      p3.interior(sel.value);
      $('#p3hint').textContent = 'Sürükle: etrafına bak · zemine dokun: oraya yürü';
    } else {
      sel.hidden = true;
      if (p3.opt.ceiling) { p3.set('ceiling', false); $('.p3-bar [data-t="ceiling"]').classList.remove('on'); }
      c === 'top' ? p3.top() : p3.frame();
      $('#p3hint').textContent = 'Sürükle: döndür · iki parmak / sağ tık: kaydır · tekerlek / kıstırma: yakınlaştır';
    }
    $$('#cam button').forEach(x => x.classList.toggle('on', x === b));
  };
  sel.onchange = () => p3.interior(sel.value);
  return p3;
}

async function renderDialog() {
  const p3 = S.p3 || await ensure3d(); if (!p3) return;
  const j = S.job;
  const body = h(`<div class="render-dlg">
    <p class="muted">Render, 3D görünümdeki mevcut kamera açısından alınır. İç mekan render'ı için önce "İç mekan" kamerasına geçin.</p>
    <div class="grid2">
      <label>Kalite<select class="inp" id="rq">
        <option value="pt">Fotogerçekçi (path tracing) — yavaş</option>
        <option value="fast">Hızlı önizleme — saniyeler</option></select></label>
      <label>Çözünürlük<select class="inp" id="rs">
        <option value="1280x720">1280 × 720</option><option value="1920x1080" selected>1920 × 1080 (Full HD)</option>
        <option value="2560x1440">2560 × 1440</option><option value="1600x1600">1600 × 1600 (kare)</option><option value="1080x1350">1080 × 1350 (Instagram)</option><option value="1080x1920">1080 × 1920 (Story)</option></select></label>
      <label>Örnek sayısı (kalite)<select class="inp" id="rn"><option value="64">64 — taslak</option><option value="200" selected>200 — iyi</option><option value="500">500 — yüksek</option><option value="1200">1200 — çok yüksek</option></select></label>
    </div>
    <div class="render-prog" hidden><div class="bar"><i></i></div><span>Hazırlanıyor…</span></div>
    <div class="render-out" hidden><img alt="Render"></div>
  </div>`);
  let ctrl = null, blob = null;
  await modal({ title: 'Gerçekçi render', body, wide: true,
    actions: [{ k: 'close', t: 'Kapat' }, { k: 'dl', t: 'İndir', icon: 'download' }, { k: 'save', t: 'Projeye kaydet', icon: 'check' }, { k: 'go', t: 'Render al', cls: 'btn-primary', icon: 'sparkle' }],
    onOpen: (el, close) => {
      const foot = el.parentElement.querySelector('.modal-foot');
      const btn = k => foot.querySelector(`[data-k="${k}"]`);
      btn('dl').hidden = btn('save').hidden = true;
      const go = btn('go'), prog = $('.render-prog', el), out = $('.render-out', el);
      foot.onclick = async e => {
        const k = e.target.closest('[data-k]')?.dataset.k;
        if (k === 'close') { ctrl?.abort(); }
        if (k === 'dl' && blob) downloadBlob(blob, `${j.code}-render-${Date.now()}.png`);
        if (k === 'save' && blob) {
          const jpg = await toJpeg(blob);
          await addBlobPhoto(jpg, { tag: 'render', caption: `Render · ${p3.opt.mode === 'interior' ? (S.editor.plan.rooms.find(r => r.id === p3.opt.roomId)?.name || 'iç mekan') : 'genel görünüm'}` });
          toast('Render projeye kaydedildi'); btn('save').hidden = true;
        }
      };
      // modal() varsayılan kapatma davranışını sadece "close" için kullan
      $$('.modal-foot [data-k]', el.parentElement).forEach(b => { if (b.dataset.k !== 'close') b.onclick = null; });
      go.onclick = async () => {
        const [w, hh] = $('#rs', el).value.split('x').map(Number), q = $('#rq', el).value, n = +$('#rn', el).value;
        go.disabled = true; prog.hidden = false; out.hidden = true; btn('dl').hidden = btn('save').hidden = true;
        ctrl = new AbortController();
        const t0 = performance.now();
        try {
          blob = await p3.renderImage({ w, h: hh, quality: q, samples: n, signal: ctrl.signal,
            onProgress: (v, smp) => { $('.bar i', prog).style.width = Math.round(v * 100) + '%'; $('span', prog).textContent = smp ? `Örnek ${smp}/${n} · ${Math.round((performance.now() - t0) / 1000)} sn` : 'Sahne hazırlanıyor…'; } });
          $('img', out).src = URL.createObjectURL(blob); out.hidden = false;
          $('span', prog).textContent = `Tamamlandı · ${Math.round((performance.now() - t0) / 1000)} sn`;
          btn('dl').hidden = btn('save').hidden = false;
        } catch (e) {
          console.error(e);
          $('span', prog).textContent = 'Render hatası: ' + e.message + (q === 'pt' ? ' — "Hızlı" kaliteyi deneyin.' : '');
        } finally { go.disabled = false; }
      };
    } });
  ctrl?.abort();
}
async function toJpeg(blob) {
  const bmp = await createImageBitmap(blob);
  const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
  c.getContext('2d').drawImage(bmp, 0, 0);
  return new Promise(r => c.toBlob(r, 'image/jpeg', 0.92));
}

/* ═════════ keşif raporu ═════════ */
async function printReport() {
  const j = S.job, met = jobMetrics(j);
  const urls = {};
  await Promise.all(j.photos.map(async p => { urls[p.id] = await S.be.photoUrl(p); }));
  const imgs = ps => ps.length ? `<div class="p-grid">${ps.map(p => `<figure><img src="${urls[p.id]}"><figcaption>${esc(p.caption || p.room || '')}</figcaption></figure>`).join('')}</div>` : '';
  const html = `<div class="pdoc">
    ${docHeader(S.settings, 'Keşif Raporu', `<div class="p-meta"><span>İş kodu <b>${esc(j.code)}</b></span><span>Keşif <b>${fmtDate(j.kesifDate || j.createdAt)}</b></span><span>Rapor <b>${fmtDate(Date.now())}</b></span></div>`)}
    <section class="p-cust">
      <div><small>Müşteri</small><b>${esc(j.customer.name)}</b>${esc(j.customer.phone)}</div>
      <div><small>Adres</small><b>${esc(j.customer.district)}</b>${esc(j.customer.address)}</div>
      <div><small>Sorumlu</small><b>${esc(j.assigned || '—')}</b>${esc(statusOf(j.status).t)}</div>
    </section>
    ${j.summary ? `<p class="p-intro">${esc(j.summary)}</p>` : ''}
    ${j.plan?.walls?.length ? `<section><h3>Rölöve</h3><div class="p-plan"><img src="${planImageUrl(j.plan, 900, 520)}" alt="Rölöve planı"></div></section>` : ''}
    ${met.rooms.length ? `<section><h3>Mahal metrajı <small>(${esc(met.src)})</small></h3><table class="p-table"><thead><tr><th>Mahal</th><th class="r">Zemin m²</th><th class="r">Net duvar m²</th><th class="r">Çevre m</th></tr></thead><tbody>
      ${met.rooms.map(r => `<tr><td>${esc(r.name)}</td><td class="r">${fmtNum(r.area)}</td><td class="r">${fmtNum(r.wallArea)}</td><td class="r">${fmtNum(r.perim)}</td></tr>`).join('')}
      <tr class="grp"><td>Toplam</td><td class="r">${fmtNum(met.floor)}</td><td class="r">${fmtNum(met.wall)}</td><td class="r">${fmtNum(met.perim)}</td></tr></tbody></table></section>` : ''}
    ${j.requests.length ? `<section><h3>Müşteri talepleri</h3><ul class="p-list">${j.requests.filter(r => r.status !== 'kapsamdisi').map(r => `<li><b>${esc(catOf(r.category).t)}</b>${r.room ? ' · ' + esc(r.room) : ''} — ${esc(r.text)}</li>`).join('')}</ul></section>` : ''}
    ${j.findings.length ? `<section><h3>Tespitler</h3>${j.findings.map(f => `<div class="p-find" style="--c:${sevOf(f.severity).c}"><div><span class="p-sev">${sevOf(f.severity).t}</span><b>${esc(f.title)}</b> <small>${esc(catOf(f.category).t)}${f.room ? ' · ' + esc(f.room) : ''}</small></div>${f.desc ? `<p>${esc(f.desc)}</p>` : ''}${f.action ? `<p><i>Öneri:</i> ${esc(f.action)}</p>` : ''}${imgs(j.photos.filter(p => p.findingId === f.id))}</div>`).join('')}</section>` : ''}
    ${j.inspection.rooms.length ? `<section><h3>Mahal kontrolleri</h3>${j.inspection.rooms.map(r => `<div class="p-room"><h4>${esc(r.name)} ${r.w && r.l ? `<small>${r.w}×${r.l}${r.h ? '×' + r.h : ''} cm</small>` : ''}</h4>
      <table class="p-table sm">${INSPECTION.filter(i => r.checks?.[i.k]?.state).map(i => { const c = r.checks[i.k], s = CHECK_STATES.find(x => x.k === c.state); return `<tr><td>${i.t}</td><td style="color:${s.c};font-weight:700">${s.t}</td><td>${esc(c.note || '')}</td></tr>`; }).join('')}</table>
      ${r.notes ? `<p>${esc(r.notes)}</p>` : ''}${imgs(j.photos.filter(p => p.room === r.name && !p.findingId).slice(0, 6))}</div>`).join('')}</section>` : ''}
    ${j.kesifNotes ? `<section><h3>Genel notlar</h3><p>${esc(j.kesifNotes).replace(/\n/g, '<br>')}</p></section>` : ''}
    ${surveyProgress(j.survey.answers).d ? `<section class="p-break"><h2>Müşteri anketi</h2>${surveyPrintHtml(j)}</section>` : ''}
    ${docFooter()}</div>`;
  printDoc(html, `Keşif Raporu ${j.code}`);
}

/* ═════════ ayarlar ═════════ */
function settingsView() {
  const st = S.settings;
  view().innerHTML = `
    <header class="page-head"><h1>Ayarlar</h1></header>
    <div class="grid-2">
      <div class="card">
        <h3>${icon('home')}Firma bilgileri <small class="muted">(teklif ve raporlarda)</small></h3>
        <div class="grid2">
          <label>Firma adı<input class="inp" data-f="company.name"></label>
          <label>Telefon<input class="inp" data-f="company.phone"></label>
          <label>E-posta<input class="inp" data-f="company.email"></label>
          <label>Web<input class="inp" data-f="company.web"></label>
          <label>Vergi no<input class="inp" data-f="company.taxNo"></label>
          <label>IBAN<input class="inp" data-f="company.iban"></label>
        </div>
        <label>Adres<textarea class="inp" rows="2" data-f="company.address"></textarea></label>
      </div>
      <div class="card">
        <h3>${icon('file')}Teklif varsayılanları</h3>
        <div class="grid2"><label>KDV %<input class="inp" type="number" data-f="vat"></label><label>Geçerlilik (gün)<input class="inp" type="number" data-f="validDays"></label></div>
        <label>Şartlar ve koşullar (her satır bir madde)<textarea class="inp" rows="7" data-f="terms"></textarea></label>
      </div>
    </div>
    <div class="card">
      <div class="row-between"><h3>${icon('list')}Fiyat kütüphanesi</h3><div class="row"><button class="btn btn-ghost btn-sm" data-cadd>${icon('plus')}Kalem ekle</button><button class="btn btn-ghost btn-sm" data-creset>Varsayılana dön</button></div></div>
      <p class="muted small">Birim fiyatlar örnektir; kendi fiyatlarınızla güncelleyin. "Metraj" sütunu, teklife eklenirken miktarın plandan otomatik alınacağı ölçüyü belirler.</p>
      <div class="cat-table" id="ct"></div>
    </div>
    <div class="grid-2">
      <div class="card">
        <h3>${icon(S.be.kind === 'cloud' ? 'cloud' : 'device')}Çalışma modu: ${esc(S.be.label)}</h3>
        <p class="muted small">${S.be.kind === 'cloud' ? 'Veriler Firebase\'de saklanır, tüm ekip aynı kayıtları görür. İnternet kesildiğinde değişiklikler cihazda bekletilir ve bağlantı gelince eşitlenir.' : 'Veriler yalnızca bu cihazda (tarayıcı veritabanı) saklanır. Düzenli yedek alın veya buluta geçin.'}</p>
        <div class="row wrap">
          ${S.be.kind === 'local' ? `<button class="btn btn-primary btn-sm" data-tocloud>${icon('cloud')}Buluta giriş yap ve aktar</button>` : `<button class="btn btn-ghost btn-sm" data-fromlocal>${icon('upload')}Bu cihazdaki yerel işleri buluta aktar</button>`}
        </div>
      </div>
      <div class="card">
        <h3>${icon('download')}Yedekleme</h3>
        <p class="muted small">Tüm iş kayıtlarını JSON olarak indirin (fotoğraf dosyaları hariç) ya da yedekten geri yükleyin.</p>
        <div class="row wrap"><button class="btn btn-ghost btn-sm" data-exp>${icon('download')}Yedek indir</button><label class="btn btn-ghost btn-sm">${icon('upload')}Yedekten yükle<input type="file" accept="application/json" hidden data-imp></label></div>
      </div>
    </div>`;
  const persist = debounce(() => S.be.saveSettings(S.settings).then(() => toast('Ayarlar kaydedildi')).catch(e => toast(e.message, 'err')), 900);
  bindFields(view(), st, persist);
  const drawCat = () => {
    $('#ct').innerHTML = `<div class="ct-row ct-h"><span>Kategori</span><span>Açıklama</span><span>Birim</span><span>Fiyat ₺</span><span>Metraj</span><span></span></div>` +
      st.catalog.map(c => `<div class="ct-row" data-id="${c.id}">
        <select class="inp sm" data-c="cat">${CATEGORIES.map(x => `<option value="${x.k}" ${x.k === c.cat ? 'selected' : ''}>${x.t}</option>`).join('')}</select>
        <input class="inp sm" data-c="desc" value="${esc(c.desc)}">
        <select class="inp sm" data-c="unit">${UNITS.map(u => `<option ${u === c.unit ? 'selected' : ''}>${u}</option>`).join('')}</select>
        <input class="inp sm" type="number" data-c="price" value="${c.price}">
        <select class="inp sm" data-c="qty"><option value="">—</option>${[['floor', 'Zemin'], ['wall', 'Duvar'], ['ceil', 'Tavan'], ['perim', 'Çevre']].map(([k, t]) => `<option value="${k}" ${c.qty === k ? 'selected' : ''}>${t}</option>`).join('')}</select>
        <button class="icon-btn sm danger" data-cdel>${icon('trash')}</button></div>`).join('');
  };
  drawCat();
  $('#ct').oninput = e => { const r = e.target.closest('.ct-row'), k = e.target.dataset.c; if (!k) return; const c = st.catalog.find(x => x.id === r.dataset.id); c[k] = e.target.type === 'number' ? +e.target.value : e.target.value; persist(); };
  $('#ct').onclick = e => { if (e.target.closest('[data-cdel]')) { st.catalog = st.catalog.filter(x => x.id !== e.target.closest('.ct-row').dataset.id); persist(); drawCat(); } };
  $('[data-cadd]').onclick = () => { st.catalog.push({ id: uid('c'), cat: 'diger', desc: 'Yeni kalem', unit: 'adet', price: 0 }); persist(); drawCat(); $$('#ct [data-c="desc"]').at(-1).select(); };
  $('[data-creset]').onclick = async () => { if (await confirmDlg('Fiyat kütüphanesi varsayılan kalemlere dönsün mü?', 'Sıfırla')) { st.catalog = structuredClone(DEFAULT_SETTINGS.catalog); persist(); drawCat(); } };
  $('[data-exp]').onclick = async () => {
    const jobs = await S.be.listJobs();
    downloadBlob(new Blob([JSON.stringify({ app: 'tb-saha', v: 1, at: Date.now(), settings: st, jobs }, null, 1)], { type: 'application/json' }), `tadilatbodrum-yedek-${new Date().toISOString().slice(0, 10)}.json`);
  };
  $('[data-imp]').onchange = async e => {
    try {
      const d = JSON.parse(await e.target.files[0].text());
      if (!Array.isArray(d.jobs)) throw new Error('Geçersiz yedek dosyası');
      if (!await confirmDlg(`${d.jobs.length} iş kaydı içe aktarılacak (aynı kimlikli kayıtların üzerine yazılır).`, 'İçe aktar', false)) return;
      for (const j of d.jobs) await S.be.saveJob(j);
      S.jobs = await S.be.listJobs(); toast(`${d.jobs.length} kayıt yüklendi`);
    } catch (er) { toast(er.message, 'err'); }
  };
  $('[data-tocloud]')?.addEventListener('click', async () => {
    try {
      const be = await openCloud();
      if (!be.user) { localStorage.removeItem(MODE_KEY); sessionStorage.setItem('tb-migrate', '1'); return loginView(be); }
      await migrateLocal(be);
    } catch (er) { toast(er.message, 'err'); }
  });
  $('[data-fromlocal]')?.addEventListener('click', () => migrateLocal(S.be));
}
async function migrateLocal(cloud) {
  const local = await openLocal(), jobs = await local.listJobs();
  if (!jobs.length) return toast('Bu cihazda yerel iş yok');
  if (!await confirmDlg(`${jobs.length} yerel iş fotoğraflarıyla buluta aktarılacak.`, 'Aktar', false)) return;
  const t = h(`<div class="upload-bar"><div class="spin sm"></div><span>Aktarılıyor…</span></div>`); document.body.append(t);
  try {
    for (const [i, j] of jobs.entries()) {
      for (const p of j.photos) if (p.localKey) {
        const b = await local.photoBlob(p);
        if (b) Object.assign(p, await cloud.uploadPhoto(j.id, b, p.id));
        delete p.localKey;
      }
      await cloud.saveJob(j);
      $('span', t).textContent = `Aktarılıyor ${i + 1}/${jobs.length}`;
    }
    toast('Yerel işler buluta aktarıldı');
    localStorage.setItem(MODE_KEY, 'cloud');
    setTimeout(() => location.reload(), 600);
  } catch (e) { toast('Aktarım hatası: ' + e.message, 'err'); }
  finally { t.remove(); }
}

boot();
