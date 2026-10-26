/* ═══ TadilatBodrum Saha — tadilat koordinasyon uygulaması ═══
 * Rota (hash): #/  ·  #/is/:id/:sekme  ·  #/is/:id/plan  ·  #/ayarlar
 */
import { openLocal, openCloud, openDemo, MODE_KEY, newJob, uid, compressImage } from './store.js';
import { STATUSES, statusOf, CATEGORIES, catOf, SEVERITY, sevOf, PHOTO_TAGS, ROOM_TYPES, INSPECTION, CHECK_STATES, UNITS, DEFAULT_SETTINGS } from './catalog.js';
import { icon, gicon, esc, h, $, $$, toast, modal, confirmDlg, promptDlg, fmtMoney, fmtNum, fmtDate, telLink, waLink, bindFields, debounce, downloadBlob } from './ui.js';
import { LOGO } from './brand.js';
import { renderRemindCard, renderRemindSettings, remindDialog, dueAll, REMIND_KINDS, team as teamOf } from './remind.js';
import { renderSurvey, surveyProgress, surveyPrintHtml } from './survey.js';
import { renderQuote, quoteTotals, printDoc, docHeader, docFooter, jobMetrics, newQuote } from './quote.js';
import { PlanEditor, planThumbSvg, planImageUrl } from './plan2d.js';
import { useName, modelName } from './openings.js';
import { emptyPlan, planMetrics, rectRoom } from './plan-geom.js';
import { mergeJob, assignInPlace } from './merge.js';
import { dirLink } from './mappick.js';
import { FEEDBACK_Q, STAR_Q, fbScore } from './feedbackq.js';
import { renderExec, execProgress, execAlerts } from './exec.js';
import { samplePlan, demoJobs, DEMO_USER, DEMO_PASS, DEMO_MODE } from './demo.js';

const DISTRICTS = ['Bodrum Merkez', 'Bitez', 'Gümbet', 'Ortakent', 'Yahşi', 'Turgutreis', 'Akyarlar', 'Gümüşlük', 'Yalıkavak', 'Gündoğan', 'Göltürkbükü', 'Torba', 'Gölköy', 'Konacık', 'Güvercinlik', 'Mumcular', 'Dereköy', 'Kadıkalesi', 'Peksimet', 'Gürece'];

export const APP_VERSION = '2026.10.26-5';
export const LICENSE = {
  owner: 'Sinem Ali Gökten Grup İnşaat Mimarlık Akustik Müh. San. Tic. Ltd. Şti.',
  developer: 'SAGG+ App',
};
const S = { be: null, jobs: [], job: null, base: null, dirty: false, unwatch: null, tab: 'genel', settings: null, editor: null, p3: null, route: '' };
const app = $('#app');

/* <base href="/saha/"> varken "#/..." linkleri sayfayı yeniden yüklemesin (adres /saha veya /saha/ olabilir) */
document.addEventListener('click', e => {
  const a = e.target.closest('a[href^="#"]');
  if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
  e.preventDefault();
  location.hash = a.getAttribute('href');
});

function updateBanner() {
  if ($('.upd-banner')) return;
  const b = h(`<div class="upd-banner" role="status">${icon('sparkle')}<span>Uygulamanın yeni sürümü hazır.</span><button class="btn btn-primary btn-xs">Yenile</button><button class="icon-btn sm" aria-label="Sonra">${icon('x')}</button></div>`);
  $('.btn', b).onclick = async () => { await flushSave().catch(() => {}); location.reload(); };
  $('.icon-btn', b).onclick = () => b.remove();
  document.body.append(b);
}

/* ═════════ açılış ═════════ */
async function boot() {
  // yeni sürüm yayınlanınca (yeni servis çalışanı devreye girince) sayfayı bir kez yenile → eski kod çalışmaya devam etmesin
  // Açılışta gelirse hemen yenile; uygulama uzun süredir açıkken (ör. Windows uygulaması) gelirse
  // çalışmayı bölmemek için "Yeni sürüm hazır — Yenile" bildirimi göster.
  const bootAt = Date.now();
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.addEventListener('controllerchange', async () => {
      if (Date.now() - bootAt < 15000) {
        if (sessionStorage.getItem('tb-sw-reloaded')) return;
        sessionStorage.setItem('tb-sw-reloaded', '1');
        await flushSave().catch(() => {});
        location.reload();
      } else updateBanner();
    });
  }
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js', location.pathname.startsWith('/saha') ? {} : { scope: '/' }).then(reg => {
      // yeni yayınları açık pencerede de yakala: 30 dakikada bir ve pencereye dönüldüğünde denetle
      const check = () => reg.update().catch(() => {});
      setInterval(check, 30 * 60 * 1000);
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
    }).catch(() => {});
  }
  const mode = localStorage.getItem(MODE_KEY);
  if (mode === 'local') return start(await openLocal());
  if (mode === DEMO_MODE) return startDemo();
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
      ${be ? '' : `<p class="warn">${icon('alert')} Buluta bağlanılamadı${err ? ': ' + esc(err) : ''}. İnternet yoksa yerel modda çalışabilirsiniz.</p>`}
      <label>Kullanıcı adı<input class="inp" name="u" autocomplete="username" required placeholder="admin"></label>
      <label>Şifre<input class="inp" type="password" name="p" autocomplete="current-password" required></label>
      <button class="btn btn-primary btn-lg">${icon('cloud')}Giriş yap</button>
      <p class="form-err" hidden></p>
      <div class="or"><span>veya</span></div>
      <button type="button" class="btn btn-ghost" data-local>${icon('device')}Bu cihazda yerel çalış</button>
      <p class="muted small">Yerel modda veriler yalnızca bu cihazda saklanır; daha sonra buluta aktarılabilir.</p>
    </form></div>`;
  const f = $('form', app);
  f.onsubmit = async e => {
    e.preventDefault();
    const btn = $('button.btn-primary', f); btn.disabled = true;
    // demo hesabı: bulut yerine ayrı, yalnızca bu cihazdaki demo veritabanı
    if (f.u.value.trim().toLocaleLowerCase('tr') === DEMO_USER && f.p.value === DEMO_PASS) { localStorage.setItem(MODE_KEY, DEMO_MODE); return startDemo(); }
    try { if (!be) throw new Error('offline'); await be.signIn(f.u.value.trim(), f.p.value); localStorage.setItem(MODE_KEY, 'cloud'); start(be); }
    catch { const er = $('.form-err', f); er.hidden = false; er.textContent = 'Kullanıcı adı veya şifre hatalı.'; btn.disabled = false; }
  };
  $('[data-local]', f).onclick = async () => { localStorage.setItem(MODE_KEY, 'local'); start(await openLocal()); };
}

/* demo: ilk girişte (ya da sıfırlamada) örnek işler ve varsayılan ayarlar */
async function seedDemo(be, reset = false) {
  if (reset) { for (const j of await be.listJobs()) await be.deleteJob(j); await be.saveSettings(structuredClone(DEFAULT_SETTINGS)); }
  if (reset || !(await be.listJobs()).length) {
    const st = await be.getSettings().catch(() => structuredClone(DEFAULT_SETTINGS));
    for (const j of demoJobs(st)) await be.saveJob(j);
  }
}
async function startDemo() { const be = await openDemo(); await seedDemo(be); return start(be); }

async function start(be) {
  S.be = be;
  app.innerHTML = splash('Yükleniyor…');
  S.settings = await be.getSettings().catch(() => structuredClone(DEFAULT_SETTINGS));
  // kütüphane güncellemesi (v2): elektrik / tesisat kalemlerine plandan adet metrajı
  if ((S.settings.catV || 1) < 2 && Array.isArray(S.settings.catalog)) {
    const C = S.settings.catalog, def = id => DEFAULT_SETTINGS.catalog.find(c => c.id === id);
    for (const id of ['c14', 'c15']) { const c = C.find(x => x.id === id); if (c && !c.qty) c.qty = def(id).qty; }
    if (!C.some(c => c.id === 'c40')) C.splice(Math.max(0, C.findIndex(c => c.id === 'c18') + 1), 0, structuredClone(def('c40')));
    S.settings.catV = 2;
  }
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
        <a href="#/" data-nav="home">${gicon('home')}<span>İşler</span></a>
        <button data-new>${gicon('plus')}<span>Yeni iş</span></button>
        <a href="#/ayarlar" data-nav="ayarlar">${gicon('settings')}<span>Ayarlar</span></a>
      </nav>
      <div class="side-foot">
        <div class="mode">${icon(S.be.kind === 'cloud' ? 'cloud' : 'device')}<span>${esc(S.be.label)}</span></div>
        <span class="save-state" id="saveState"></span>
        <span class="app-ver">Sürüm ${APP_VERSION}</span>
        <button data-logout>${gicon('logout')}<span>${S.be.kind === 'cloud' ? 'Çıkış' : S.be.demo ? 'Demodan çık' : 'Mod değiştir'}</span></button>
      </div>
    </aside>
    ${S.be.demo ? `<div class="demo-bar">${icon('play')}<b>DEMO</b><span>Örnek verilerle deneme hesabı · kayıtlar yalnızca bu cihazda</span></div>` : ''}
    <main id="view"></main>
    <nav class="bottom-nav" aria-label="Ana menü">
      <a href="#/" class="bn-brand" aria-label="TadilatBodrum — işler"><svg viewBox="52 72 170 150" aria-hidden="true"><path fill="${LOGO.cyan}" d="${LOGO.c}"/><path fill="${LOGO.orange}" d="${LOGO.o}"/></svg></a>
      <div class="bn-items">
        <a href="#/" data-nav="home">${gicon('home')}<span>İşler</span></a>
        <button data-search>${gicon('search')}<span>Ara</span></button>
        <button data-new class="bn-new"><i>${icon('plus')}</i><span>Yeni iş</span></button>
        <a href="#/ayarlar" data-nav="ayarlar">${gicon('settings')}<span>Ayarlar</span></a>
      </div>
    </nav>
  </div>`;
  $$('[data-new]', app).forEach(b => b.onclick = newJobDialog);
  // Ara: işler listesindeki arama kutusuna git
  $('[data-search]', app).onclick = () => {
    const go = () => { const q = $('#q'); if (!q) return false; q.scrollIntoView({ block: 'center', behavior: 'smooth' }); q.focus({ preventScroll: true }); return true; };
    if (location.hash.replace(/^#\/?/, '') && location.hash !== '#/') { location.hash = '#/'; let n = 0; const t = setInterval(() => { if (go() || ++n > 30) clearInterval(t); }, 100); }
    else go();
  };
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
      openJob(await S.be.getJob(parts[1]));
      if (!S.job) { toast('İş bulunamadı', 'err'); location.hash = '#/'; return; }
    }
    if (parts[2] === 'plan') return planScreen();
    S.tab = parts[2] || 'genel';
    return jobView(S.tab);
  }
  openJob(null);
  if (parts[0] === 'ayarlar') return settingsView();
  dashboard();
  // listeyi buluttan tazele (başka cihazlarda eklenen/değişen işler)
  S.be.listJobs().then(list => {
    if (J(list) === J(S.jobs)) return;
    S.jobs = list;
    if (!location.hash.replace(/^#\/?/, '')) dashboard();
  }).catch(() => {});
}
const J = v => JSON.stringify(v);

/* işi aç / kapat: canlı dinleme + eşitleme tabanı */
function openJob(job) {
  S.unwatch?.(); S.unwatch = null;
  S.job = job; S.dirty = false;
  if (!job) { S.base = null; return; }
  migrate(job);
  S.base = structuredClone(job);
  S.unwatch = S.be.watchJob(job.id, remote => applyRemote(remote));
  recoverPhotos(job);
}
/* Storage'da duran ama iş kaydında referansı olmayan fotoğrafları geri ekle
 * (silme işlemi dosyayı da sildiği için burada bulunan her dosya kaybolmuş bir referanstır) */
async function recoverPhotos(job) {
  let files;
  try { files = await S.be.listPhotoFiles(job.id); } catch (e) { console.warn('Fotoğraf listesi alınamadı', e); return; }
  if (S.job !== job) return;
  const known = new Set(job.photos.flatMap(p => [p.path, p.id]));
  const lost = files.filter(f => !known.has(f.path) && !known.has(f.name.replace(/\.\w+$/, '')));
  if (!lost.length) return;
  for (const f of lost.sort((a, b) => a.t - b.t))
    job.photos.push({ id: f.name.replace(/\.\w+$/, ''), url: f.url, path: f.path, tag: 'kesif', room: '', findingId: '', caption: 'Kurtarılan fotoğraf', t: f.t });
  logEvt(`${lost.length} kayıp fotoğraf kurtarıldı`);
  toast(`${lost.length} kayıp fotoğraf geri getirildi`);
  softRefresh(true);
}
/* başka cihazdan gelen değişikliği yerel (kaydedilmemiş) değişikliklerle birleştir */
function applyRemote(remote) {
  const j = S.job; if (!j || remote.id !== j.id) return;
  migrate(remote);
  const merged = mergeJob(S.base, j, remote);
  S.base = structuredClone(remote);
  if (J(merged) === J(j)) return;
  assignInPlace(j, merged);
  softRefresh();
}
/* ekranı, kullanıcı yazı yazmıyorsa yenile */
function softRefresh(silent = false) {
  if (document.body.classList.contains('plan-mode')) { S.editor?.render(); return; }
  const a = document.activeElement;
  const busy = (a && /INPUT|TEXTAREA|SELECT/.test(a.tagName) && a.closest('#view')) || $('.modal-back, .lightbox, .docview');
  if (busy) { S.refreshLater = true; return; }
  const y = scrollY; jobView(S.tab); scrollTo(0, y);
  if (!silent) toast('Başka bir cihazdan güncellendi');
}
document.addEventListener('focusout', () => setTimeout(() => {
  if (S.refreshLater && S.job && !document.activeElement?.closest?.('#view input, #view textarea, #view select')) { S.refreshLater = false; softRefresh(); }
}, 300));
function migrate(j) {
  const n = newJob(j.code);
  for (const k of Object.keys(n)) if (j[k] === undefined) j[k] = n[k];
  j.survey.answers ??= {}; j.inspection.rooms ??= [];
}

/* ═════════ kaydetme ═════════ */
let saving = Promise.resolve();
const doSave = async () => {
  await saving;                                   // kayıtlar sırayla gitsin
  const j = S.job; if (!j || !S.dirty) return;    // değişiklik yoksa yazma (diğer cihazın verisini ezmesin)
  S.dirty = false;
  j.updatedAt = Date.now();
  const sent = structuredClone(j), base = S.base;
  const st = $('#saveState'); if (st) { st.textContent = 'Kaydediliyor…'; st.className = 'save-state busy'; }
  saving = S.be.saveJob(sent, base).then(result => {
    if (S.job !== j) return;
    // buluttan gelen eklemeleri (başka cihaz) kayıt sırasında yapılan yeni yerel değişikliklerle birleştir
    const merged = mergeJob(sent, j, result);
    S.base = structuredClone(result);
    if (J(merged) !== J(j)) { assignInPlace(j, merged); softRefresh(); }
    const i = S.jobs.findIndex(x => x.id === j.id);
    const copy = structuredClone(j); if (i >= 0) S.jobs[i] = copy; else S.jobs.unshift(copy);
    if (st) { st.textContent = 'Kaydedildi'; st.className = 'save-state ok'; }
  }).catch(e => {
    console.error(e);
    if (S.job === j) { S.dirty = true; clearTimeout(S.retryT); S.retryT = setTimeout(() => save(), 5000); }   // veri ezilmez; tekrar denenir
    if (st) { st.textContent = 'Kaydedilemedi — tekrar deneniyor'; st.className = 'save-state err'; }
    toast('Kaydedilemedi, tekrar denenecek: ' + e.message, 'err');
  });
  return saving;
};
const _save = debounce(doSave, 700);
const save = Object.assign(() => { S.dirty = true; _save(); }, { flush: () => _save.flush() });
async function flushSave() { if (S.job) { await save.flush(); await saving; } }
addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') save.flush(); });
addEventListener('beforeunload', () => save.flush());
function logEvt(text) { S.job.log.unshift({ t: Date.now(), text }); save(); }

/* ═════════ panel (iş listesi) ═════════ */
/* "yarın 14:30" / "bugün" / "28 Ekim Salı 10:00" */
function remindWhen(j) {
  const d = new Date(j.kesifDate.length > 10 ? j.kesifDate : j.kesifDate + 'T00:00'), t = new Date(), k = x => x.toDateString();
  const tm = new Date(t); tm.setDate(t.getDate() + 1);
  const day = k(d) === k(t) ? 'Bugün' : k(d) === k(tm) ? 'Yarın' : d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' });
  return `${day}${j.kesifDate.length > 10 ? ' ' + d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : ''} · ${j.customer.district || j.code}`;
}

function dashboard() {
  const st = sessionStorage.getItem('tb-filter') || 'aktif';
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = S.jobs.filter(j => j.kesifDate && j.kesifDate.slice(0, 10) >= today && !['iptal', 'teslim'].includes(j.status))
    .sort((a, b) => a.kesifDate.localeCompare(b.kesifDate)).slice(0, 5);
  const cnt = k => S.jobs.filter(j => j.status === k).length;
  const due = dueAll(S.jobs, S.settings);
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
        <button class="stat" data-f="${k}"><span class="gi-wrap">${gicon(ic, 'lg')}</span><b>${cnt(k)}</b><small>${t}</small></button>`).join('')}
      <div class="stat wide"><span class="gi-wrap">${gicon('file', 'lg')}</span><b>${fmtMoney(pipeline).replace(',00', '')}</b><small>Bekleyen teklif hacmi</small></div>
      ${(() => { const d = S.jobs.filter(j => j.feedback?.status === 'done'); if (!d.length) return ''; const avg = d.reduce((s, j) => s + fbScore(j.feedback.answers), 0) / d.length;
        return `<button class="stat wide" data-reviews><span class="gi-wrap">${gicon('star', 'lg')}</span><b>${fmtNum(avg, 1)} ★</b><small>Müşteri memnuniyeti · ${d.length} değerlendirme</small></button>`; })()}
    </section>
    ${due.length ? `<section class="card rm-due"><h3>${gicon('calendar')}Gönderilecek hatırlatmalar <small class="muted">${due.reduce((s, x) => s + x.ks.length, 0)}</small></h3>${due.map(({ j, ks }) => `
      <div class="rd-row" data-j="${j.id}"><a href="#/is/${j.id}"><b>${esc(j.customer.name || j.code)}</b><small>${esc(remindWhen(j))}</small></a>
        <div class="rd-ks">${ks.map(k => `<button class="btn btn-xs ${k === 'team' ? 'btn-ghost' : 'btn-primary'}" data-rk="${k}">${icon(k === 'team' ? 'user' : 'bell')}${esc(REMIND_KINDS.find(x => x.k === k).t)}</button>`).join('')}</div></div>`).join('')}</section>` : ''}
    ${upcoming.length ? `<section class="card upcoming"><h3>${gicon('calendar')}Yaklaşan keşifler</h3>${upcoming.map(j => `
      <a href="#/is/${j.id}" class="up-row"><span class="up-date"><b>${new Date(j.kesifDate).getDate()}</b>${new Date(j.kesifDate).toLocaleDateString('tr-TR', { month: 'short' })}</span>
      <span><b>${esc(j.customer.name || 'İsimsiz')}</b><small>${esc(j.customer.district || '')} · ${j.kesifDate.length > 10 ? new Date(j.kesifDate).toLocaleTimeString('tr-TR', { timeStyle: 'short' }) : ''}</small></span>${icon('chevR')}</a>`).join('')}</section>` : ''}
    <section class="list-head">
      <div class="search">${icon('search')}<input class="inp" placeholder="Müşteri, telefon, iş kodu, bölge ara…" id="q" value="${esc(sessionStorage.getItem('tb-q') || '')}"></div>
      <div class="chips scroll" id="fl">
        ${[['aktif', 'Aktif'], ['tumu', 'Tümü'], ...STATUSES.map(s => [s.k, s.t])].map(([k, t]) => `<button class="chip ${st === k ? 'on' : ''}" data-v="${k}">${t}</button>`).join('')}
      </div>
    </section>
    <section class="jobs" id="jobs"></section>`;
  $$('.rd-row [data-rk]').forEach(b => b.onclick = async () => {
    const j = S.jobs.find(x => x.id === b.closest('.rd-row').dataset.j); if (!j) return;
    const ok = await remindDialog(j, S.settings, b.dataset.rk, { onSent: t => j.log.unshift({ t: Date.now(), text: t }) });
    if (!ok) return;
    j.updatedAt = Date.now();
    await S.be.saveJob(j).catch(e => toast(e.message, 'err'));
    if (S.job?.id === j.id) Object.assign(S.job, { remind: structuredClone(j.remind), log: structuredClone(j.log) });
    dashboard();
  });
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
  const rv = $('[data-reviews]'); if (rv) rv.onclick = reviewsDialog;
  syncFeedback(S.jobs.filter(j => j.feedback?.status === 'pending').slice(0, 12)).then(n => { if (n && location.hash.replace(/^#\/?/, '') === '') dashboard(); });
}

function jobCard(j) {
  const s = statusOf(j.status), pr = surveyProgress(j.survey?.answers);
  const tot = j.quote ? quoteTotals(j.quote).total : 0;
  const docs = [j.plan?.walls?.length || (j.drawings || []).some(d => hasContent(d.plan)), j.quote?.items?.length, (j.photos || []).length].filter(Boolean).length;
  return `<a class="job-card folder f-${s.k}" href="#/is/${j.id}">
    <span class="f-back" aria-hidden="true"></span>
    ${docs ? `<span class="f-paper" aria-hidden="true"></span>` : ''}${docs > 1 ? `<span class="f-paper p2" aria-hidden="true"></span>` : ''}
    <span class="pill f-pill">${s.t}</span>
    <div class="f-front">
      <span class="code">${esc(j.code)}</span>
      <h3>${esc(j.customer.name || 'İsimsiz müşteri')}</h3>
      <p class="muted">${icon('map')}${esc([j.customer.district, j.customer.address].filter(Boolean).join(' · ') || 'Adres girilmedi')}</p>
      <div class="jc-meta">
        ${j.kesifDate ? `<span>${icon('calendar')}${fmtDate(j.kesifDate)}</span>` : ''}
        <span>${icon('list')}${(j.requests || []).length} talep</span>
        <span>${icon('camera')}${(j.photos || []).length}</span>
        ${j.plan?.walls?.length ? `<span>${icon('ruler')}Rölöve</span>` : ''}${(j.drawings || []).some(d => hasContent(d.plan)) ? `<span>${icon('layers')}Proje</span>` : ''}
        ${tot ? `<span class="money">${fmtMoney(tot)}</span>` : ''}
      </div>
      ${j.exec ? `<div class="bar ex" title="Uygulama %${execProgress(j.exec)}${execAlerts(j.exec).late ? ' · gecikme var' : ''}"><i style="width:${execProgress(j.exec)}%"></i></div>` : `<div class="bar" title="Anket %${pr.pct}"><i style="width:${pr.pct}%"></i></div>`}
    </div>
  </a>`;
}

async function newJobDialog() {
  const r = await modal({ title: 'Yeni iş / keşif kaydı', body: `
    <div class="grid2">
      <label>Müşteri adı soyadı<input class="inp" id="nj-n" required autocomplete="off"></label>
      <label>Telefon<input class="inp" id="nj-p" type="tel" inputmode="tel" placeholder="05xx xxx xx xx"></label>
      <label>Bölge<input class="inp" id="nj-d" list="dl-d"></label>
      <label>Keşif tarihi / saati<input class="inp" id="nj-k" type="datetime-local"></label>
      ${teamOf(S.settings).length ? `<label>Keşfe gelecek kişi<select class="inp" id="nj-b"><option value="">—</option>${teamOf(S.settings).map(m => `<option value="${m.id}">${esc(m.name)}${m.title ? ' · ' + esc(m.title) : ''}</option>`).join('')}</select></label>` : ''}
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
  j.kesifDate = $('#nj-k', r.el).value; j.summary = $('#nj-s', r.el).value.trim(); j.kesifBy = $('#nj-b', r.el)?.value || '';
  if (j.kesifDate) j.status = 'kesif';
  if (j.summary) j.requests.push({ id: uid('rq'), category: 'diger', room: '', text: j.summary, priority: 'normal', status: 'acik', t: Date.now() });
  await S.be.saveJob(j);
  S.jobs.unshift(structuredClone(j));
  openJob(j);
  location.hash = `#/is/${j.id}`;
}

/* kaşe görseli: en çok 800 px, açık (beyaz) zemin saydam, kenar boşlukları kırpılır → PNG veri adresi */
async function prepStamp(file) {
  const url = URL.createObjectURL(file), im = new Image(); im.src = url;
  try { await im.decode(); } finally { URL.revokeObjectURL(url); }
  const sc = Math.min(1, 800 / im.naturalWidth), w = Math.max(1, Math.round(im.naturalWidth * sc)), h = Math.max(1, Math.round(im.naturalHeight * sc));
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); g.drawImage(im, 0, 0, w, h);
  const d = g.getImageData(0, 0, w, h), p = d.data; let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let i = 0; i < p.length; i += 4) {
    const l = p[i] * 0.3 + p[i + 1] * 0.59 + p[i + 2] * 0.11;
    p[i + 3] = Math.round(p[i + 3] * Math.min(1, Math.max(0, (245 - l) / 75)));   // açık tonlar saydamlaşır
    if (p[i + 3] > 30) { const k = i / 4, x = k % w, y = (k - x) / w; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (x1 < 0) throw new Error('görselde kaşe bulunamadı');
  g.putImageData(d, 0, 0);
  const pad = 6, cw = Math.min(w, x1 - x0 + 1 + 2 * pad), ch = Math.min(h, y1 - y0 + 1 + 2 * pad);
  const o = document.createElement('canvas'); o.width = cw; o.height = ch;
  o.getContext('2d').drawImage(c, Math.max(0, x0 - pad), Math.max(0, y0 - pad), cw, ch, 0, 0, cw, ch);
  return o.toDataURL('image/png');
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
  { k: 'uygulama', t: 'Uygulama', ic: 'roller' },
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
    <nav class="tabs" role="tablist">${TABS.map(t => `<a href="#/is/${j.id}/${t.k}" class="${t.k === tab ? 'on' : ''}" role="tab">${gicon(t.ic)}<span>${t.t}</span>${badge(t.k)}</a>`).join('')}</nav>
    <section class="tab-body" id="tb"></section>`;
  $('.tabs .on')?.scrollIntoView({ inline: 'center', block: 'nearest' });
  const tb = $('#tb');
  ({ genel: tabGenel, talepler: tabTalepler, anket: tabAnket, kesif: tabKesif, rolove: tabRolove, foto: tabFoto, teklif: tabTeklif, uygulama: tabUygulama }[tab] || tabGenel)(tb);
}
function badge(k) {
  const j = S.job;
  const n = { talepler: j.requests.filter(r => r.status !== 'kapsamdisi').length, kesif: j.findings.length, foto: j.photos.length }[k];
  if (k === 'anket') { const p = surveyProgress(j.survey.answers).pct; return p ? `<i class="tbadge">${p}%</i>` : ''; }
  if (k === 'uygulama') { if (!j.exec) return ''; const A = execAlerts(j.exec), w = A.late + A.mats + A.nok; return `<i class="tbadge ${w ? 'warn' : ''}">${w || execProgress(j.exec) + '%'}</i>`; }
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
        <h3>${gicon('user')}Müşteri</h3>
        <div class="grid2">
          <label>Ad soyad<input class="inp" data-f="customer.name"></label>
          <label>Telefon<input class="inp" type="tel" inputmode="tel" data-f="customer.phone"></label>
          <label>E-posta<input class="inp" type="email" data-f="customer.email"></label>
          <label>Bizi nereden buldu<input class="inp" data-f="customer.source" list="dl-src"></label>
          <label>Bölge<input class="inp" data-f="customer.district" list="dl-d"></label>
        </div>
        <label>Adres<textarea class="inp" rows="2" data-f="customer.address"></textarea></label>
        <div class="geo-row">
          ${j.customer.geo?.lat ? `<span class="geo-pin">${icon('map')}<span><b>Konum işaretli</b><small>${j.customer.geo.lat.toFixed(5)}, ${j.customer.geo.lng.toFixed(5)}</small></span></span>` : `<span class="muted small">${j.customer.mapsUrl ? 'Konum linki kayıtlı (eski kayıt). Haritadan işaretleyerek kesinleştirin.' : 'Konum henüz işaretlenmedi.'}</span>`}
          <div class="row wrap">
            <button class="btn btn-${j.customer.geo?.lat ? 'ghost' : 'primary'} btn-sm" data-geo>${icon('map')}${j.customer.geo?.lat ? 'Konumu düzelt' : 'Haritadan işaretle'}</button>
            ${j.customer.geo?.lat || j.customer.mapsUrl ? `<a class="btn btn-ghost btn-sm" href="${esc(j.customer.geo?.lat ? dirLink(j.customer.geo) : j.customer.mapsUrl)}" target="_blank" rel="noopener">${icon('chevR')}Yol tarifi</a>` : ''}
            ${j.customer.geo?.lat ? `<button class="btn btn-ghost btn-sm" data-geoshare title="Konumu WhatsApp ile ekibe gönder">${icon('share')}Konumu gönder</button>` : ''}
          </div>
        </div>
        <datalist id="dl-d">${DISTRICTS.map(d => `<option value="${d}">`).join('')}</datalist>
        <datalist id="dl-src">${['Instagram', 'Google', 'Web sitesi', 'Tavsiye', 'Tabela', 'Eski müşteri'].map(d => `<option value="${d}">`).join('')}</datalist>
      </div>
      <div class="card">
        <h3>${gicon('calendar')}Keşif ve sorumlu</h3>
        <div class="grid2">
          <label>Keşif tarihi / saati<input class="inp" type="datetime-local" data-f="kesifDate"></label>
          <label>Sorumlu / proje yöneticisi<input class="inp" data-f="assigned"></label>
          <label>Keşfe gelecek kişi<select class="inp" data-f="kesifBy"><option value="">${teamOf(S.settings).length ? '— seçin —' : '— Ayarlar → Keşif ekibi —'}</option>${teamOf(S.settings).map(m => `<option value="${m.id}">${esc(m.name)}${m.title ? ' · ' + esc(m.title) : ''}</option>`).join('')}</select></label>
        </div>
        <label>İş özeti<textarea class="inp" rows="3" data-f="summary"></textarea></label>
        <div class="kpis">
          <a href="#/is/${j.id}/talepler"><b>${j.requests.length}</b><small>Talep</small></a>
          <a href="#/is/${j.id}/anket"><b>${pr.pct}%</b><small>Anket</small></a>
          <a href="#/is/${j.id}/kesif"><b>${j.findings.length}</b><small>Tespit</small></a>
          <a href="#/is/${j.id}/rolove"><b>${fmtNum(met.floor, 1)}</b><small>m² (${met.rooms.length} mahal)</small></a>
          <a href="#/is/${j.id}/foto"><b>${j.photos.length}</b><small>Fotoğraf</small></a>
          <a href="#/is/${j.id}/teklif"><b>${T ? fmtMoney(T.total).replace(/,\d+\s/, '\u00A0') : '—'}</b><small>Teklif</small></a>
        </div>
      </div>
    </div>
    <div class="card rm-card" id="rmCard"></div>
    ${j.exec || ['onay', 'uygulama'].includes(j.status) ? `<a class="card ex-mini" href="#/is/${j.id}/uygulama">
      <div class="row-between"><h3>${gicon('roller')}Uygulama</h3>${j.exec ? `<b>%${execProgress(j.exec)}</b>` : '<span class="btn btn-primary btn-sm">Başlat</span>'}</div>
      ${j.exec ? `<div class="bar ex"><i style="width:${execProgress(j.exec)}%"></i></div><p class="muted small">${(() => { const A = execAlerts(j.exec); return [A.late && `${A.late} adım gecikmede`, A.mats && `${A.mats} malzeme termini yaklaşıyor`, A.nok && `${A.nok} kontrol uygunsuz`].filter(Boolean).join(' · ') || 'Her şey planlandığı gibi'; })()}</p>` : '<p class="muted small">Teklif onaylandı — iş programı, ekip yönlendirme, malzeme ve kontrol föyü için uygulamayı başlatın.</p>'}</a>` : ''}
    <div class="card fb-card" id="fbCard"></div>
    <div class="card">
      <div class="row-between"><h3>${gicon('note')}Notlar ve iş geçmişi</h3><button class="btn btn-ghost btn-sm" data-note>${icon('plus')}Not ekle</button></div>
      <ul class="timeline">${j.log.slice(0, 30).map(l => `<li><time>${fmtDate(l.t, true)}</time><p>${esc(l.text)}</p></li>`).join('')}</ul>
    </div>
    <div class="row wrap">
      <button class="btn btn-primary" data-report>${icon('print')}Keşif raporu (PDF)</button>
      <button class="btn btn-ghost" data-video>${icon('film')}Video rapor (WhatsApp)</button>
      <button class="btn btn-ghost" data-cancel>${j.status === 'iptal' ? 'İptali geri al' : 'İşi iptal et'}</button>
      <button class="btn btn-danger" data-del>${icon('trash')}İşi sil</button>
    </div>`;
  const rmDraw = () => renderRemindCard($('#rmCard', tb), j, S.settings, { onSent: t => logEvt(t) });
  bindFields(tb, j, p => { save(); if (p === 'customer.name') $('.jh-t h1').textContent = j.customer.name || 'İsimsiz müşteri'; if (['kesifDate', 'kesifBy', 'customer.phone'].includes(p)) rmDraw(); });
  rmDraw();
  $$('[data-st]', tb).forEach(b => b.onclick = () => { j.status = b.dataset.st; logEvt(`Durum: ${statusOf(j.status).t}`); jobView('genel'); });
  $('[data-geo]', tb).onclick = async e => {
    e.preventDefault();
    const { pickLocation, mapsLink } = await import('./mappick.js');
    const c = j.customer, g = await pickLocation({ geo: c.geo, query: [c.address, c.district].filter(Boolean).join(', ') });
    if (!g) return;
    c.geo = { lat: g.lat, lng: g.lng, t: Date.now() };
    c.mapsUrl = mapsLink(c.geo);
    // adres boşsa haritadan gelen adresi öner
    if (g.address) {
      if (!c.address && (g.address.street || g.address.neighbourhood)) c.address = [g.address.neighbourhood, g.address.street].filter(Boolean).join(', ');
      if (!c.district && g.address.district) c.district = g.address.district;
    }
    logEvt('Konum haritadan işaretlendi'); save(); jobView('genel'); toast('Konum kaydedildi');
  };
  const gs = $('[data-geoshare]', tb);
  if (gs) gs.onclick = () => { const c = j.customer; window.open(waLink('', `${c.name || j.code} — ${[c.district, c.address].filter(Boolean).join(', ')}\n${dirLink(c.geo)}`), '_blank'); };
  $('[data-note]', tb).onclick = async () => { const t = await promptDlg('Not ekle', '', 'Görüşme, karar, hatırlatma…'); if (t) { logEvt(t); jobView('genel'); } };
  $('[data-cancel]', tb).onclick = () => { j.status = j.status === 'iptal' ? 'talep' : 'iptal'; logEvt(j.status === 'iptal' ? 'İş iptal edildi' : 'İptal geri alındı'); jobView('genel'); };
  $('[data-del]', tb).onclick = async () => {
    if (!await confirmDlg(`${j.code} — ${j.customer.name} işi tüm fotoğraf ve çizimleriyle kalıcı olarak silinecek.`)) return;
    await S.be.deleteJob(j); S.jobs = S.jobs.filter(x => x.id !== j.id); openJob(null); location.hash = '#/'; toast('İş silindi');
  };
  $('[data-report]', tb).onclick = printReport;
  renderFeedback(j, $('#fbCard', tb));
  $('[data-video]', tb).onclick = async () => { const { openVideoReport } = await import('./video.js'); openVideoReport(j, S.settings, S.be); };
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
        <div class="row-between"><h3>${gicon('scan')}Mahal bazlı keşif</h3>
          <div class="row"><button class="btn btn-ghost btn-sm" data-imp ${j.plan?.rooms?.length ? '' : 'disabled title="Önce rölöve planında oda çizin"'}>${icon('ruler')}Plandan aktar</button>
          <button class="btn btn-primary btn-sm" data-add>${icon('plus')}Mahal ekle</button></div></div>
        <p class="muted small">Her mahal için ölçüleri girin, kontrol listesini sistematik olarak işaretleyin, fotoğrafları mahale bağlayın.</p>
      </div>
      <div id="rooms">${rooms.map(roomCard).join('') || `<div class="empty card"><div class="empty-ic">${icon('home')}</div><h3>Mahal eklenmedi</h3><p class="muted">Salon, banyo, mutfak… her alanı ayrı ayrı kaydedin.</p></div>`}</div>
      <div class="card">
        <div class="row-between"><h3>${gicon('alert')}Tespitler</h3><button class="btn btn-primary btn-sm" data-fadd>${icon('plus')}Tespit ekle</button></div>
        <div class="findings">${j.findings.length ? j.findings.map(findingCard).join('') : '<p class="muted small">Hasar, kaçak, nem, statik risk, mevzuat… keşifte gördüğünüz her durumu not edin.</p>'}</div>
      </div>
      <div class="card"><h3>${gicon('note')}Genel keşif notları</h3><textarea class="inp" rows="4" data-f="kesifNotes" placeholder="Bina genel durumu, ortak alanlar, erişim, komşular, otopark…"></textarea></div>`;
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
/* ── çizimler ──
 * Rölöve (mevcut durum) işin ana planıdır: j.plan (metraj, keşif ve teklif buradan beslenir).
 * Proje / tasarım ve diğer çizimler j.drawings içinde ayrı planlar olarak tutulur.
 */
const DRAW_KINDS = [{ k: 'proje', t: 'Proje / tasarım' }, { k: 'rolove', t: 'Rölöve (ek)' }, { k: 'diger', t: 'Diğer' }];
const kindOf = k => DRAW_KINDS.find(x => x.k === k) || DRAW_KINDS[0];
function drawingsOf(j) { return [{ id: 'rolove', name: 'Rölöve (mevcut durum)', kind: 'rolove', main: true, plan: j.plan }, ...(j.drawings || [])]; }
function drawingOf(j, id) { const all = drawingsOf(j); return all.find(d => d.id === id) || all[0]; }
function setDrawingPlan(j, id, p) {
  if (id === 'rolove') { j.plan = p; return; }
  const d = (j.drawings || []).find(x => x.id === id); if (d) { d.plan = p; d.updatedAt = Date.now(); }
}
const hasContent = p => !!(p?.walls?.length || p?.rooms?.length || p?.items?.length || p?.rails?.length);
const clonePlan = p => p ? JSON.parse(JSON.stringify(p)) : emptyPlan();

async function newDrawingDialog(j, then) {
  const n = (j.drawings || []).filter(d => d.kind === 'proje').length + 1;
  const srcs = drawingsOf(j).filter(d => hasContent(d.plan));
  const r = await modal({ title: 'Yeni çizim', body: `
    <div class="grid2">
      <label>Ad<input class="inp" id="dwn" value="Proje ${n}"></label>
      <label>Tür<select class="inp" id="dwk">${DRAW_KINDS.map(k => `<option value="${k.k}">${k.t}</option>`).join('')}</select></label>
    </div>
    <label>Başlangıç<select class="inp" id="dws">
      ${srcs.map((d, i) => `<option value="${d.id}" ${i === 0 ? 'selected' : ''}>"${esc(d.name)}" çiziminin kopyasından</option>`).join('')}
      <option value="" ${srcs.length ? '' : 'selected'}>Boş çizim</option></select></label>
    <p class="muted small">Proje çizimini rölövenin kopyasından başlatın; duvar yıkıp ekleyin, mahalleri ve mutfak / dolapları yeniden düzenleyin. Rölöve çizimi değişmeden kalır ve projede soluk altlık olarak görünür.</p>`,
    actions: [{ k: 'no', t: 'Vazgeç' }, { k: 'ok', t: 'Oluştur', cls: 'btn-primary' }] });
  if (r?.k !== 'ok') return;
  const src = $('#dws', r.el).value;
  const d = { id: uid('dw'), name: $('#dwn', r.el).value.trim() || `Proje ${n}`, kind: $('#dwk', r.el).value, plan: src ? clonePlan(drawingOf(j, src).plan) : emptyPlan(), createdAt: Date.now(), updatedAt: Date.now() };
  if (d.plan.meta) d.plan.meta.bg = src ? d.plan.meta.bg : null;
  (j.drawings ||= []).push(d);
  logEvt(`Yeni çizim: ${d.name}`); save();
  then ? then(d) : (location.hash = `#/is/${j.id}/plan?d=${d.id}`);
}

function tabRolove(tb) {
  const j = S.job, P = j.plan;
  const rl = j.photos.filter(p => p.tag === 'rolove' || p.tag === 'render');
  const list = drawingsOf(j);
  const card = d => {
    const has = hasContent(d.plan), met = planMetrics(d.plan), url = `#/is/${j.id}/plan?d=${d.id}`;
    return `<div class="dw-card ${d.main ? 'main' : ''}" data-dw="${d.id}">
      <a class="thumb-wrap" href="${url}">${has ? planThumbSvg(d.plan) : `<div class="dw-empty">${icon('ruler')}<span>Boş çizim</span></div>`}</a>
      <div class="dw-info">
        <div class="dw-t"><b>${esc(d.name)}</b><span class="dw-kind k-${d.kind}">${d.main ? 'Rölöve' : kindOf(d.kind).t}</span></div>
        ${has ? `<div class="met-chips sm"><span><small>Mahal</small><b>${met.rooms.length}</b></span><span><small>Zemin</small><b>${fmtNum(met.floor)} m²</b></span><span><small>Net duvar</small><b>${fmtNum(met.wall)} m²</b></span></div>` : `<p class="muted small">${d.main ? 'Ölçtüğünüz mahalleri duvar, kapı, pencere ve donatılarıyla çizin; plan otomatik olarak 3D modele dönüşür.' : 'Henüz çizim yok.'}</p>`}
        <div class="row wrap">
          <a class="btn btn-primary btn-sm" href="${url}">${icon('edit')}${has ? 'Aç' : 'Çizime başla'}</a>
          ${has ? `<a class="btn btn-ghost btn-sm" href="${url}&v=3d">${icon('cube')}3D</a><a class="btn btn-ghost btn-sm" href="${url}&v=3d&r=1">${icon('sparkle')}Render</a>` : ''}
          ${d.main && !has ? `<a class="btn btn-ghost btn-sm" href="${url}&import=1">${icon('upload')}DXF / PDF aktar</a><button class="btn btn-ghost btn-sm" data-tpl>${icon('layers')}Örnek plan</button>` : ''}
          ${d.plan?.openings?.length ? `<button class="btn btn-ghost btn-sm" data-dwa="jn" title="Kapı / pencere listesi, ölçülü (PDF)">${icon('print')}Doğrama listesi</button>` : ''}
          ${d.plan?.rooms?.length ? `<button class="btn btn-ghost btn-sm" data-dwa="fl" title="Zemin kaplaması malzemelerine göre sipariş listesi (PDF)">${icon('layers')}Zemin sipariş listesi</button>` : ''}
          ${has ? `<button class="btn btn-ghost btn-sm" data-dwa="copy" title="Kopyasını oluştur">${icon('copy')}</button>` : ''}
          ${d.main ? '' : `<button class="btn btn-ghost btn-sm" data-dwa="ren" title="Yeniden adlandır">${icon('edit')}</button><button class="btn btn-ghost btn-sm danger-t" data-dwa="del" title="Sil">${icon('trash')}</button>`}
        </div>
      </div>
    </div>`;
  };
  tb.innerHTML = `
    <div class="card plan-card">
      <div class="row-between"><h3>${gicon('ruler')}Çizimler <small class="muted">${list.length}</small></h3>
        <button class="btn btn-primary btn-sm" data-newdw>${icon('plus')}Yeni çizim</button></div>
      <p class="muted small">Rölöve mevcut durumu gösterir (metraj ve teklif buradan alınır). Müşterinin isteklerine göre hazırlanan tasarım için "Proje" çizimi ekleyin; birden fazla seçenek de hazırlayabilirsiniz.</p>
      <div class="dw-list">${list.map(card).join('')}</div>
    </div>
    <div class="card">
      <div class="row-between"><h3>${gicon('image')}Kroki, rölöve fotoğrafları ve renderlar</h3>
        <label class="btn btn-ghost btn-sm">${icon('upload')}Kroki ekle<input type="file" accept="image/*" multiple hidden data-up></label></div>
      <div class="gallery">${rl.map(p => `<button class="gimg" data-ph="${p.id}"><img data-src="${p.id}" alt=""><span>${esc(p.caption || PHOTO_TAGS.find(t => t.k === p.tag)?.t)}</span></button>`).join('') || '<p class="muted small">Elle çizilmiş krokilerin fotoğrafını ekleyin; çizim editöründe "Altlık" olarak kullanıp üzerinden ölçekli çizebilirsiniz.</p>'}</div>
    </div>`;
  hydratePhotos(tb);
  $('[data-newdw]', tb).onclick = () => newDrawingDialog(j);
  $$('[data-dwa]', tb).forEach(b => b.onclick = async () => {
    const id = b.closest('[data-dw]').dataset.dw, d = drawingOf(j, id), a = b.dataset.dwa;
    if (a === 'jn') return printJoinery(j, d, d.plan);
    if (a === 'fl') return printFloorOrder(j, d, d.plan);
    if (a === 'del') {
      if (!await confirmDlg(`"${d.name}" çizimi silinecek.`)) return;
      j.drawings = j.drawings.filter(x => x.id !== id); logEvt(`Çizim silindi: ${d.name}`);
    }
    if (a === 'ren') { const n = await promptDlg('Çizimin adı', d.name); if (!n?.trim()) return; d.name = n.trim(); d.updatedAt = Date.now(); }
    if (a === 'copy') { (j.drawings ||= []).push({ id: uid('dw'), name: `${d.name} (kopya)`, kind: d.main ? 'proje' : d.kind, plan: clonePlan(d.plan), createdAt: Date.now(), updatedAt: Date.now() }); }
    save(); tabRolove(tb);
  });
  $('[data-up]', tb).onchange = async e => { await addPhotos(e.target.files, { tag: 'rolove' }); tabRolove(tb); };
  $$('[data-ph]', tb).forEach(b => b.onclick = () => lightbox(b.dataset.ph, () => tabRolove(tb)));
  $('[data-tpl]', tb)?.addEventListener('click', () => {
    const p = samplePlan();
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

/* ── Uygulama: iş programı, ekip, malzeme, kontrol föyü, günlük, hakediş ── */
function tabUygulama(tb) {
  renderExec(tb, S.job, {
    settings: S.settings, save: () => { save(); const pl = $('.jh-act .pill'), s = statusOf(S.job.status); if (pl) { pl.textContent = s.t; pl.style.setProperty('--c', s.c); } },
    saveSettings: () => S.be.saveSettings(S.settings).catch(e => toast(e.message, 'err')),
    logEvt, addPhotos, hydratePhotos, lightbox, printDoc, docHeader, docFooter,
  });
}

/* ── Teklif ── */
function tabTeklif(tb) {
  renderQuote(tb, S.job, S.settings, () => { save(); if (S.job.quote && ['talep', 'kesif'].includes(S.job.status) && S.job.quote.items.length) { S.job.status = 'teklif'; logEvt('Teklif hazırlanıyor'); } }, { photoUrl: p => S.be.photoUrl(p), drawings: () => drawingsOf(S.job).filter(d => hasContent(d.plan)).map(d => ({ id: d.id, name: d.main ? 'Rölöve (mevcut durum)' : d.name, main: !!d.main })), planImg: (id, W, H) => planImageUrl(drawingOf(S.job, id).plan, W, H) });
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
    for (const d of drawingsOf(j)) if (d.plan?.meta?.bg?.photoId === p.id) d.plan.meta.bg = null;
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
  const dw = drawingOf(j, qs.get('d') || 'rolove');
  if (!dw.plan) setDrawingPlan(j, dw.id, dw.plan = emptyPlan());
  S.dw = dw;
  let mode = qs.get('v') === '3d' ? '3d' : '2d';
  view().innerHTML = `<div class="plan-screen" data-mode="${mode}">
    <header class="ps-head">
      <a href="#/is/${j.id}/rolove" class="icon-btn" aria-label="Geri">${icon('back')}</a>
      <div class="ps-t"><b>${esc(j.customer.name || j.code)}</b>
        <select class="ps-dw" id="psDw" aria-label="Çizim">${drawingsOf(j).map(d => `<option value="${d.id}" ${d.id === dw.id ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}<option value="+">+ Yeni çizim…</option></select></div>
      <div class="seg big" id="psMode"><button data-m="2d">2D Plan</button><button data-m="3d">${icon('cube')}3D</button><button data-m="split" class="hide-m">Yan yana</button></div>
      <div class="ps-act">
        <button class="btn btn-ghost btn-sm" data-share title="3D modeli ve 2D planı müşteriye bağlantıyla gönder">${icon('share')}<span>Müşteriyle paylaş</span></button>
        <button class="btn btn-ghost btn-sm" data-exp title="2D çizimi ve 3D modeli dışa aktar (DXF, SketchUp, 3DS, STL…)">${icon('download')}<span>Dışa aktar</span></button>
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
  S.editor = new PlanEditor($('#ps2d'), dw.plan, {
    onChange: p => { setDrawingPlan(j, dw.id, p); save(); if (mode !== '2d') sync3d(); },
    // proje çiziminde rölöve (mevcut durum) soluk altlık olarak görünür
    ghost: !dw.main && hasContent(j.plan) ? j.plan : null,
    resolvePhoto: id => { const p = j.photos.find(x => x.id === id); return p ? S.be.photoUrl(p) : ''; },
    pickBackground: pickPhoto,
    addImage: (blob, caption) => addBlobPhoto(blob, { tag: 'rolove', caption }),
    cab: {
      // mutfak / dolap tasarlayıcı → teklif kalemleri, çizim PDF'i, fiyat kütüphanesi
      addQuoteItems: items => {
        if (!j.quote) j.quote = newQuote(j, S.settings);
        j.quote.items.push(...items.map(i => ({ id: uid('q'), qtyKey: '', ...i })));
        if (['talep', 'kesif'].includes(j.status)) { j.status = 'teklif'; logEvt('Teklif hazırlanıyor'); }
        save();
      },
      printSheet: (title, body) => printDoc(`<div class="pdoc">${docHeader(S.settings, title, `<div class="p-meta"><span>İş kodu <b>${esc(j.code)}</b></span><span>Müşteri <b>${esc(j.customer.name || '—')}</b></span><span>Tarih <b>${fmtDate(Date.now())}</b></span></div>`)}${body}${docFooter()}</div>`, `${title} ${j.code}`),
      priceOf: (k, def) => S.settings.catalog?.find(c => c.id === k)?.price ?? def,
      settings: S.settings, saveSettings: () => S.be.saveSettings(S.settings).catch(() => {}), job: j, montajFor: id => montajLink(j, 'cab:' + id),
    },
  });
  const setMode = async m => {
    mode = m; root.dataset.mode = m;
    $$('#psMode button').forEach(b => b.classList.toggle('on', b.dataset.m === m));
    if (m !== '2d') await ensure3d();
    setTimeout(() => { S.editor?.render(); S.p3?.resize(); }, 50);
  };
  $('#psMode').onclick = e => { const b = e.target.closest('[data-m]'); if (b) setMode(b.dataset.m); };
  $('#psDw').onchange = e => {
    const v = e.target.value;
    if (v === '+') { e.target.value = dw.id; return newDrawingDialog(j); }
    location.hash = `#/is/${j.id}/plan${v === 'rolove' ? '' : '?d=' + v}${mode !== '2d' ? (v === 'rolove' ? '?' : '&') + 'v=3d' : ''}`;
  };
  const fname = ext => `${j.code}-${(dw.main ? 'rolove' : dw.name).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/ı/g, 'i').replace(/[^A-Za-z0-9_-]+/g, '-')}.${ext}`;
  // 3D model: görünür 3D yoksa geçici, ekran dışı bir görüntüleyici kurulur
  const with3d = async fn => {
    if (S.p3) { S.p3.setPlan(S.editor.plan); return fn(S.p3); }
    const { Plan3D } = await import('./plan3d.js');
    const host = h('<div style="position:fixed;left:-3000px;top:0;width:400px;height:300px"></div>'); document.body.append(host);
    const p3 = new Plan3D(host);
    try { await p3.init(); p3.setPlan(S.editor.plan); return await fn(p3); } finally { p3.dispose(); host.remove(); }
  };
  $('[data-share]').onclick = () => shareDialog(j, S.dw, S.editor.plan);
  $('[data-exp]').onclick = async () => {
    if (!hasContent(S.editor.plan)) return toast('Çizim boş', 'err');
    const opts = [
      ['dxf2', '2D çizim', 'DXF', 'AutoCAD / ArchiCAD / NanoCAD — duvar, kapı, pencere, oda, mobilya, ölçü katmanlarıyla (mm)'],
      ['png', '2D çizim', 'PNG', 'Plan görseli — fotoğraflara da kaydedilir'],
      ['etiket', 'Etiket', 'Parça etiketleri (10 × 6 cm PDF)', 'Dolap parçaları ve kapı / pencereler için QR kodlu, barkodlu etiketler — her sayfa bir etiket'],
      ['cnc', 'Mutfak / dolap', 'CNC kesim şablonu (DXF)', 'Çizimdeki tüm mutfak ve dolapların parçaları levhalara yerleşik; menteşe ve raf pimi delikleri, kenar bandı işaretli'],
      ['dograma', 'Liste', 'Doğrama listesi (PDF)', 'Kapı ve pencereler: poz numaraları, ölçülü görünüşler, imalat ölçüleri, adet ve m²'],
      ['zemin', 'Liste', 'Zemin sipariş listesi (PDF)', 'Zemin kaplamaları malzemeye göre: karo adedi ve kutu, parke / laminat paketi, yapıştırıcı, derz dolgu, şilte, süpürgelik'],
      ['dae', '3D model', 'SketchUp (.dae)', 'SketchUp: Dosya → İçe aktar → Collada; malzeme renkleriyle'],
      ['3ds', '3D model', '3DS', '3ds Max, SketchUp Pro, Rhino, Blender (cm)'],
      ['stl', '3D model', 'STL', '3D yazıcı / CAD (mm)'],
      ['dxf3', '3D model', 'DXF 3D', 'AutoCAD 3D — 3DFACE yüzeyler, katman = nesne (mm)'],
      ['glb', '3D model', 'GLB', 'Web, AR, Blender — dokularıyla'],
    ];
    const r = await modal({ title: `Dışa aktar — ${dw.name}`, body: `<div class="exp-list">${opts.map(([k, g, t, d]) => `<button class="exp-opt" data-x="${k}"><small>${g}</small><b>${t}</b><span>${d}</span></button>`).join('')}</div>
      <p class="muted small">SketchUp'ın kendi .skp biçimi kapalı bir formattır ve tarayıcıda yazılamaz; SketchUp, .dae (Collada) dosyasını doğrudan içe aktarır ve kaydettiğinizde .skp olur.</p>`,
      actions: [{ k: 'no', t: 'Kapat' }], onOpen: (el, close) => el.onclick = e => { const b = e.target.closest('[data-x]'); if (b) close({ k: b.dataset.x }); } });
    const k = r?.k; if (!k || k === 'no') return;
    try {
      if (k === 'png') return savePng();
      if (k === 'dograma') return printJoinery(j, dw, S.editor.plan);
      if (k === 'zemin') return printFloorOrder(j, dw, S.editor.plan);
      if (k === 'etiket') {
        const cabs = S.editor.plan.items.filter(it => it.type === 'cabinet' && it.cab).map((it, i) => ({ cab: it.cab, label: it.label || `Dolap ${i + 1}` }));
        const off = new Set(j.jnOff?.[dw.id] || []), jnOnly = off.size ? new Set(S.editor.plan.openings.map(o => o.id).filter(id => !off.has(id))) : null;
        const { labelsDialog } = await import('./labels.js');
        return labelsDialog({ cabs, plan: S.editor.plan, job: j, settings: S.settings, fname: fname('x').replace(/\.x$/, ''), jnOnly, montaj: montajLink(j, 'dw:' + dw.id) });
      }
      if (k === 'cnc') {
        const cabs = S.editor.plan.items.filter(it => it.type === 'cabinet' && it.cab).map((it, i) => ({ cab: it.cab, label: it.label || `Dolap ${i + 1}` }));
        const { cncDialog } = await import('./cnc.js');
        return cncDialog(cabs, { title: `${j.code} ${dw.main ? 'Rolove' : dw.name}`, fname: fname('x').replace(/\.x$/, ''), settings: S.settings, saveSettings: () => S.be.saveSettings(S.settings).catch(() => {}) });
      }
      if (k === 'dxf2') { const { planToDXF } = await import('./exporters.js'); downloadBlob(planToDXF(S.editor.plan), fname('dxf')); return toast('DXF indirildi'); }
      toast('3D model hazırlanıyor…');
      const ex = await import('./exporters.js');
      const blob = await with3d(async p3 => {
        if (k === 'glb') return p3.exportGLB();
        const gr = await p3.exportGroups();
        return { dae: () => ex.toDAE(gr, `${j.code} ${dw.name}`), '3ds': () => ex.to3DS(gr), stl: () => ex.toSTL(gr), dxf3: () => ex.toDXF3D(gr) }[k]();
      });
      downloadBlob(blob, fname({ dae: 'dae', '3ds': '3ds', stl: 'stl', dxf3: '3d.dxf', glb: 'glb' }[k]));
      toast(`${({ dae: 'SketchUp (.dae)', '3ds': '3DS', stl: 'STL', dxf3: 'DXF 3D', glb: 'GLB' })[k]} indirildi (${Math.max(1, Math.round(blob.size / 1024))} KB)`);
    } catch (e) { console.error(e); toast('Dışa aktarılamadı: ' + e.message, 'err'); }
  };
  const savePng = async () => {
    const blob = await S.editor.exportPng({ title: `${j.code} ${j.customer.name || ''} — ${dw.name}` });
    if (!blob) return toast('Plan boş', 'err');
    const p = await addBlobPhoto(blob, { tag: 'rolove', caption: `${dw.main ? 'Rölöve planı' : dw.name} ` + new Date().toLocaleDateString('tr-TR') });
    downloadBlob(blob, fname('png'));
    toast('Plan görseli fotoğraflara kaydedildi');
    return p;
  };
  $('[data-render]').onclick = async () => { if (mode === '2d') await setMode('3d'); renderDialog(); };
  setMode(mode).then(() => { if (qs.get('r')) renderDialog(); if (qs.get('import')) S.editor.importDialog(); });
}

/* müşteriyle paylaşım: kısa bağlantı (bulutta sites/…/shares/{id}) ya da — yerel modda / kural eksikse —
 * çizimin bağlantının # kısmına gömüldüğü uzun bağlantı. Müşteri goster.html'de 3D kuşbakışı + 2D plan görür. */
/* montaj şeması bağlantısı (etiket QR kodları için): anahtar başına tek kalıcı bağlantı, her etiket alımında güncellenir.
 * Veri müşteri paylaşımlarıyla aynı 'shares' koleksiyonunda (kural değişmez); görüntüleyici: /m/KİMLİK → saha/montaj.html */
function montajLink(j, key) {
  if (!S.be.saveShare) return null;   // yerel / demo: bağlantı yok, QR metin içerir
  return async payload => {
    const { encodeShare, slimPlan, newShareId } = await import('./share.js');
    if (payload.p) payload.p = slimPlan(payload.p);
    const map = (j.montaj ||= {}), id = map[key] || newShareId();
    await S.be.saveShare(id, { d: await encodeShare(payload), k: 'montaj', t: Date.now() });
    if (map[key] !== id) { map[key] = id; save(); }
    return `${location.origin}/m/${id}`;
  };
}

async function shareDialog(j, dw, plan) {
  if (!hasContent(plan)) return toast('Çizim boş', 'err');
  const { encodeShare, slimPlan, viewerBase, newShareId, shortUrl } = await import('./share.js');
  const co = S.settings.company || {}, cloud = !!S.be.saveShare;
  const mine = () => (j.shares || []).filter(x => x.dw === dw.id);
  const makePayload = (t, s, v2, contact) => {
    const p = { v: 1, t, s, v2, p: slimPlan(plan) };
    if (contact) p.co = { phone: co.phone || '', wa: co.whatsapp || co.phone || '', web: co.web || '' };
    return p;
  };
  const msg = (t, url) => `Merhaba${j.customer.name ? ' ' + j.customer.name.split(' ')[0] : ''}, ${t || 'projeniz'} için hazırladığımız 3D modeli ve planı telefonunuzdan inceleyebilirsiniz:\n${url}\n\nTadilatBodrum.com`;
  const rulesHelp = `<p class="warn small">Kısa bağlantı için Firebase kuralına bir satır eklenmesi gerekiyor (DEPLOY.md → "Müşteri paylaşım bağlantıları"). Şimdilik uzun bağlantı oluşturuldu; çalışır.</p>`;
  const listHtml = () => mine().length ? `<h4 style="margin-top:6px">Bu çizimin bağlantıları</h4>${mine().map(x => `
    <div class="sh-row" data-sid="${x.id}"><div><b>${esc(x.title || dw.name)}</b><small>${esc(shortUrl(x.id).replace(/^https?:\/\//, ''))} · ${fmtDate(x.u || x.t, true)}</small></div>
      <div class="row"><button class="btn btn-xs btn-ghost" data-sa="up" title="Bağlantıyı değiştirmeden çizimin güncel halini yükle">${icon('rotate')}Güncelle</button><button class="btn btn-xs btn-ghost" data-sa="send">${icon('share')}Gönder</button><button class="btn btn-xs btn-ghost danger-t" data-sa="del" title="Bağlantıyı kapat">${icon('trash')}</button></div></div>`).join('')}
    <p class="muted small">"Güncelle" çizimde yaptığınız değişiklikleri aynı bağlantıya yükler; müşteri yeniden açtığında yeni hali görür. Silinen bağlantı açılmaz.</p>` : '';
  let action = null;
  const r = await modal({ title: 'Müşteriyle paylaş', body: `
    <p class="muted small">Müşteriniz bağlantıyı telefonunda açınca yalnızca bu çizimin <b>3D kuşbakışı modelini</b> ve <b>ölçülü 2D planını</b> görür; düzenleyemez. Keşif, teklif, fotoğraf ve diğer iş bilgileri paylaşılmaz.</p>
    <label>Başlık<input class="inp" id="shT" value="${esc(dw.kind === 'rolove' ? 'Mevcut durum (rölöve)' : dw.name)}"></label>
    <label>Alt başlık<input class="inp" id="shS" value="${esc(j.customer.name ? `Sayın ${j.customer.name}` : '')}"></label>
    <div class="grid2"><label>İlk açılış<select class="inp" id="shV"><option value="3d">3D model</option><option value="2d">2D plan</option></select></label>
    <label class="check" style="align-self:end"><input type="checkbox" id="shC" ${co.phone || co.whatsapp ? 'checked' : ''}> WhatsApp / arama düğmesi</label></div>
    ${cloud ? '' : '<p class="muted small">Yerel modda kısa bağlantı oluşturulamaz; çizim bağlantının içine gömülür (uzun bağlantı).</p>'}
    <div id="shList">${listHtml()}</div>`,
    actions: [{ k: 'no', t: 'Kapat' }, { k: 'ok', t: 'Yeni bağlantı oluştur', cls: 'btn-primary', icon: 'share' }],
    onOpen: (el, close) => {
      el.onclick = async e => {
        const b = e.target.closest('[data-sa]'); if (!b) return;
        const sid = b.closest('[data-sid]').dataset.sid, rec = (j.shares || []).find(x => x.id === sid);
        if (b.dataset.sa === 'del') {
          if (!await confirmDlg('Bağlantı kapatılsın mı? Müşteri bu bağlantıyı artık açamaz.', 'Kapat')) return;
          try { await S.be.deleteShare(sid); } catch (err) { return toast('Silinemedi: ' + (err.code || err.message), 'err'); }
          j.shares = j.shares.filter(x => x.id !== sid); save(); $('#shList', el).innerHTML = listHtml(); toast('Bağlantı kapatıldı');
        } else { action = { kind: b.dataset.sa, rec }; close({ k: 'act', el }); }
      };
    } });
  if (!r || r.k === 'no') return;
  let url, title, note = '';
  if (r.k === 'act') {   // var olan bağlantı: güncelle / tekrar gönder
    const { rec } = action; title = rec.title; url = shortUrl(rec.id);
    if (action.kind === 'up') {
      const p = makePayload(rec.title, rec.sub || '', rec.v2 || '3d', rec.co !== false);
      try { await S.be.saveShare(rec.id, { d: await encodeShare(p), t: rec.t, u: Date.now() }); rec.u = Date.now(); save(); toast('Bağlantı güncellendi — müşteri yeni hali görecek'); }
      catch (err) { return toast('Güncellenemedi: ' + (err.code || err.message), 'err'); }
    }
  } else {
    title = $('#shT', r.el).value.trim();
    const sub = $('#shS', r.el).value.trim(), v2 = $('#shV', r.el).value, contact = $('#shC', r.el).checked;
    const enc = await encodeShare(makePayload(title, sub, v2, contact));
    if (cloud) {
      const id = newShareId();
      try {
        await S.be.saveShare(id, { d: enc, t: Date.now() });
        (j.shares ||= []).push({ id, dw: dw.id, title, sub, v2, co: contact, t: Date.now() }); save();
        url = shortUrl(id);
      } catch (err) { console.warn('kısa bağlantı', err); note = rulesHelp; }
    }
    url ||= `${viewerBase()}#${enc}`;
    logEvt(`Müşteriyle paylaşıldı: ${title || dw.name}`);
  }
  const text = msg(title, url), long = url.length > 6000;
  await modal({ title: 'Bağlantı hazır', body: `
    ${note}
    <p class="muted small">${url.length < 100 ? 'Kısa bağlantı. Çizimi değiştirirseniz "Müşteriyle paylaş" → "Güncelle" ile aynı bağlantıyı yenileyebilirsiniz.' : `Uzun bağlantı (${fmtNum(url.length / 1000, 1)} bin karakter): çizim bağlantının içinde taşınır. Çizimi değiştirirseniz yeni bağlantı oluşturun.`}</p>
    ${long ? '<p class="warn small">Bağlantı çok uzun. WhatsApp\'a doğrudan açmak yerine "Paylaş" ya da "Kopyala" kullanın.</p>' : ''}
    <textarea class="inp" rows="${url.length < 100 ? 1 : 3}" readonly id="shU" style="font-size:13px">${esc(url)}</textarea>
    <div class="row wrap">
      <a class="btn btn-primary" id="shWa" href="${esc(waLink(j.customer.phone, text))}" target="_blank" rel="noopener">${icon('chat')}WhatsApp'ta gönder</a>
      ${navigator.share ? `<button class="btn btn-ghost" id="shSh">${icon('share')}Paylaş</button>` : ''}
      <button class="btn btn-ghost" id="shCp">${icon('copy')}Kopyala</button>
      <a class="btn btn-ghost" href="${esc(url)}" target="_blank" rel="noopener">${icon('eye')}Önizle</a>
    </div>`, actions: [{ k: 'ok', t: 'Kapat' }], onOpen: el => {
    $('#shCp', el).onclick = async () => { try { await navigator.clipboard.writeText(url); } catch { $('#shU', el).select(); document.execCommand('copy'); } toast('Bağlantı kopyalandı'); };
    const sh = $('#shSh', el); if (sh) sh.onclick = () => navigator.share({ title: title || 'Projeniz', text: text.replace(url, '').trim(), url }).catch(() => {});
  } });
}

/* ── iş sonu müşteri değerlendirmesi ──
 * Bağlantı (/d/KİMLİK) müşteriye WhatsApp ile gönderilir; yanıt bulutta sites/…/feedback/{id}'ye yazılır,
 * uygulama açıldığında işe (j.feedback) kopyalanır — her iş için kalıcı kayıt. */
const fbUrl = id => `${location.origin}/d/${id}`;
const starsTxt = v => '★★★★★'.slice(0, Math.round(v)) + '☆☆☆☆☆'.slice(0, 5 - Math.round(v));
async function syncFeedback(jobs) {
  if (!S.be.getFeedback) return 0;
  let n = 0;
  for (const j of jobs) {
    try {
      const d = await S.be.getFeedback(j.feedback.id);
      if (d?.status === 'done' && j.feedback.status !== 'done') {
        Object.assign(j.feedback, { status: 'done', answers: d.answers || {}, doneAt: d.doneAt || Date.now() });
        j.log.unshift({ t: Date.now(), text: `Müşteri değerlendirmesi geldi: ${fmtNum(fbScore(j.feedback.answers), 1)} ★` });
        if (j === S.job) save(); else await S.be.saveJob(j, null).catch(() => {});
        n++;
      }
    } catch { /* kural / bağlantı yok: sessiz */ }
  }
  return n;
}
function renderFeedback(j, el) {
  if (!el) return;
  const f = j.feedback, cloud = !!S.be.createFeedback;
  if (f?.status === 'done') {
    const a = f.answers || {}, sc = fbScore(a);
    el.innerHTML = `<div class="row-between"><h3>${gicon('star')}Müşteri değerlendirmesi</h3><span class="fb-big">${fmtNum(sc, 1)} <i>★</i></span></div>
      <div class="fb-grid">${STAR_Q.map(q => `<div><span>${esc(q.t)}</span><b class="fb-st">${a[q.id] ? starsTxt(a[q.id]) : '—'}</b></div>`).join('')}
        ${a.nps !== undefined ? `<div><span>Tavsiye (0–10)</span><b>${a.nps}</b></div>` : ''}</div>
      ${a.yorum ? `<blockquote class="fb-quote">“${esc(a.yorum)}”</blockquote>` : ''}
      <p class="muted small">${fmtDate(f.doneAt, true)} · ${a.izin ? 'Web sitesinde yayınlanmasına izin verdi' : 'Yayın izni yok'}</p>`;
    return;
  }
  if (f?.status === 'pending') {
    el.innerHTML = `<div class="row-between"><h3>${gicon('star')}Müşteri değerlendirmesi</h3><span class="pill" style="--c:#F2A33A">Yanıt bekleniyor</span></div>
      <p class="muted small">Bağlantı ${fmtDate(f.t, true)} tarihinde oluşturuldu: <a href="${esc(fbUrl(f.id))}" target="_blank" rel="noopener">${esc(fbUrl(f.id).replace(/^https?:\/\//, ''))}</a></p>
      <div class="row wrap"><a class="btn btn-primary btn-sm" href="${esc(waLink(j.customer.phone, fbMsg(j)))}" target="_blank" rel="noopener">${icon('chat')}WhatsApp'ta tekrar gönder</a>
        <button class="btn btn-ghost btn-sm" data-fb="check">${icon('rotate')}Yanıtı kontrol et</button>
        <button class="btn btn-ghost btn-sm danger-t" data-fb="cancel">${icon('trash')}İptal</button></div>`;
  } else {
    el.innerHTML = `<h3>${gicon('star')}Müşteri değerlendirmesi</h3>
      <p class="muted small">İş bitince müşteriye bir dakikalık memnuniyet anketi gönderin: genel memnuniyet, işçilik, takvime uyum, temizlik, iletişim, fiyat/performans, tavsiye puanı ve yorum. Yanıtlar bu işe kaydedilir.</p>
      ${cloud ? `<div class="row"><button class="btn ${j.status === 'teslim' ? 'btn-primary' : 'btn-ghost'} btn-sm" data-fb="new">${icon('star')}Değerlendirme linki gönder</button></div>` : '<p class="warn small">Değerlendirme anketi bulut modunda çalışır.</p>'}`;
  }
  el.onclick = async e => {
    const a = e.target.closest('[data-fb]')?.dataset.fb; if (!a) return;
    if (a === 'new') {
      const id = (await import('./share.js')).newShareId(10);
      const rec = { status: 'pending', t: Date.now(), name: (j.customer.name || '').split(' ')[0], title: j.code, reviewUrl: S.settings.company?.reviewUrl || '' };
      try { await S.be.createFeedback(id, rec); }
      catch (err) { return toast(err.code === 'permission-denied' ? 'Firebase kuralı eksik — DEPLOY.md "5e" adımını uygulayın' : 'Oluşturulamadı: ' + (err.code || err.message), 'err'); }
      j.feedback = { id, status: 'pending', t: rec.t }; logEvt('Değerlendirme anketi gönderildi'); save();
      window.open(waLink(j.customer.phone, fbMsg(j)), '_blank');
      renderFeedback(j, el);
    } else if (a === 'check') {
      const n = await syncFeedback([j]); if (n) { save(); renderFeedback(j, el); toast('Değerlendirme alındı'); } else toast('Henüz yanıt yok');
    } else if (a === 'cancel') {
      if (!await confirmDlg('Değerlendirme bağlantısı iptal edilsin mi? Müşteri bağlantıyı açamaz.', 'İptal et')) return;
      await S.be.deleteFeedback(j.feedback.id).catch(() => {}); delete j.feedback; save(); renderFeedback(j, el);
    }
  };
  if (f?.status === 'pending' && !renderFeedback.busy) { renderFeedback.busy = true; syncFeedback([j]).then(n => { renderFeedback.busy = false; if (n && el.isConnected) { save(); renderFeedback(j, el); toast('Müşteri değerlendirmesi geldi'); } }); }
}
const fbMsg = j => `Merhaba${j.customer.name ? ' ' + j.customer.name.split(' ')[0] : ''}, TadilatBodrum.com olarak işinizi tamamladık. Bizimle çalıştığınız için teşekkür ederiz! Deneyiminizi 1 dakikada değerlendirebilir misiniz?\n${fbUrl(j.feedback.id)}`;
function reviewsDialog() {
  const list = S.jobs.filter(j => j.feedback?.status === 'done').sort((a, b) => (b.feedback.doneAt || 0) - (a.feedback.doneAt || 0));
  const avg = k => { const v = list.map(j => +j.feedback.answers?.[k]).filter(x => x >= 0); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : 0; };
  const nps = (() => { const v = list.map(j => j.feedback.answers?.nps).filter(x => x !== undefined && x !== null); if (!v.length) return null; return Math.round(100 * (v.filter(x => x >= 9).length - v.filter(x => x <= 6).length) / v.length); })();
  modal({ title: 'Müşteri değerlendirmeleri', wide: true, body: `
    <div class="fb-grid">${STAR_Q.map(q => `<div><span>${esc(q.t)}</span><b>${fmtNum(avg(q.id), 1)} ★</b></div>`).join('')}${nps !== null ? `<div><span>NPS (tavsiye skoru)</span><b>${nps}</b></div>` : ''}</div>
    <div class="fb-list">${list.map(j => { const a = j.feedback.answers || {}; return `<a class="fb-item" href="#/is/${j.id}"><div class="row-between"><b>${esc(j.customer.name || j.code)}</b><span>${fmtNum(fbScore(a), 1)} ★</span></div>
      ${a.yorum ? `<p>“${esc(a.yorum)}”</p>` : ''}<small class="muted">${esc(j.code)} · ${fmtDate(j.feedback.doneAt)}${a.izin ? ' · yayın izni var' : ''}</small></a>`; }).join('')}</div>`,
    actions: [{ k: 'csv', t: 'CSV indir', icon: 'download' }, { k: 'ok', t: 'Kapat', cls: 'btn-primary' }] }).then(r => {
    if (r?.k !== 'csv') return;
    const head = ['İş kodu', 'Müşteri', 'Tarih', ...FEEDBACK_Q.map(q => q.t)];
    const rows = list.map(j => [j.code, j.customer.name, new Date(j.feedback.doneAt || 0).toLocaleDateString('tr-TR'), ...FEEDBACK_Q.map(q => { const v = j.feedback.answers?.[q.id]; return q.type === 'check' ? (v ? 'Evet' : 'Hayır') : v ?? ''; })]);
    const csv = '\ufeff' + [head, ...rows].map(r => r.map(x => `"${String(x ?? '').replace(/"/g, '""')}"`).join(';')).join('\n');
    downloadBlob(new Blob([csv], { type: 'text/csv' }), 'degerlendirmeler.csv');
  });
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
          await addBlobPhoto(jpg, { tag: 'render', caption: `Render${S.dw && !S.dw.main ? ' · ' + S.dw.name : ''} · ${p3.opt.mode === 'interior' ? (S.editor.plan.rooms.find(r => r.id === p3.opt.roomId)?.name || 'iç mekan') : 'genel görünüm'}` });
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
          const notes = [];
          blob = await p3.renderImage({ w, h: hh, quality: q, samples: n, signal: ctrl.signal,
            onNote: m => { notes.push(m); toast(m); },
            onProgress: (v, smp) => { $('.bar i', prog).style.width = Math.round(v * 100) + '%'; $('span', prog).textContent = smp ? `Örnek ${smp}/${n} · ${Math.round((performance.now() - t0) / 1000)} sn` : 'Sahne hazırlanıyor…'; } });
          $('img', out).src = URL.createObjectURL(blob); out.hidden = false;
          $('span', prog).textContent = `Tamamlandı · ${Math.round((performance.now() - t0) / 1000)} sn${notes.length ? ' · ' + notes.at(-1) : ''}`;
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
/* doğrama listesi: kapı / pencere pozları, ölçülü görünüşler (PDF) */
async function printJoinery(j, dw, plan) {
  if (!plan?.openings?.length) return toast('Çizimde kapı / pencere yok', 'err');
  const { joineryHtml, joineryItems } = await import('./joinery.js');
  const items = joineryItems(plan), off = new Set(j.jnOff?.[dw.id] || []);
  const sel = new Set(items.map(x => x.o.id).filter(id => !off.has(id)));
  const num = new Map(items.map((x, i) => [x.o.id, i + 1]));
  const GR = [['door', 'Kapılar'], ['window', 'Pencereler'], ['opening', 'Kapısız boşluklar']].filter(([t]) => items.some(x => x.o.type === t));
  // seçim haritası: her açıklığın sıra numarası plan üzerinde; seçilenler renkli
  const ov = s => items.map(x => {
    const p = { x: x.c.x - x.n.x * x.sd * (x.t / 2 + 14 / s), y: x.c.y - x.n.y * x.sd * (x.t / 2 + 14 / s) }, r = 10 / s;
    return `<g class="jn-pin" data-o="${x.o.id}"><circle cx="${p.x}" cy="${p.y}" r="${r}"/><text x="${p.x}" y="${p.y + 4 / s}" font-size="${11 / s}" text-anchor="middle">${num.get(x.o.id)}</text></g>`;
  }).join('');
  const row = x => `<label class="jn-row"><input type="checkbox" data-o="${x.o.id}" ${sel.has(x.o.id) ? 'checked' : ''}><span class="jn-n">${num.get(x.o.id)}</span>
    <span><b>${x.o.type === 'opening' ? 'Boşluk' : esc(useName(x.o))}</b> <small>${fmtNum(x.o.w, 1)} × ${fmtNum(x.o.h, 1)}${x.o.type === 'window' ? ' · parapet ' + fmtNum(x.o.sill || 0, 1) : ''}</small><br><small class="muted">${esc(x.where)}${x.o.type !== 'opening' ? ' · ' + esc(modelName(x.o)) : ''}</small></span></label>`;
  const r = await modal({ title: 'Doğrama listesi', wide: true, body: `
    <p class="muted small">${esc(dw.main ? 'Rölöve (mevcut durum)' : dw.name)} — listeye eklenecek kapı ve pencereleri seçin. Aynı ölçü ve özellikteki seçili doğramalar tek pozda toplanır.</p>
    <div class="jn-pick">
      <div class="jn-map">${planThumbSvg(plan, 600, 380, false, false, ov)}</div>
      <div class="jn-side">
        <div class="row wrap jn-quick"><button class="btn btn-xs btn-ghost" data-q="all">Tümü</button><button class="btn btn-xs btn-ghost" data-q="none">Hiçbiri</button>${GR.length > 1 ? GR.map(([t, n]) => `<button class="btn btn-xs btn-ghost" data-q="${t}">Yalnız ${n.toLocaleLowerCase('tr')}</button>`).join('') : ''}</div>
        <div class="jn-list">${GR.map(([t, n]) => `<div class="jn-grp"><label class="jn-gh"><input type="checkbox" data-g="${t}"> ${n}</label>${items.filter(x => x.o.type === t).map(row).join('')}</div>`).join('')}</div>
        <p class="small jn-cnt"></p>
      </div>
    </div>
    <div class="grid2"><label>Montaj boşluğu (her kenar, cm)<input class="inp" type="number" id="jnGap" min="0" max="5" step="0.5" value="${S.settings.jnGap ?? 1}"></label>
      <label class="check" style="align-self:end"><input type="checkbox" id="jnKey" checked> Anahtar plan (poz numaraları plan üzerinde)</label></div>
    <p class="muted small">İmalat ölçüsü = açıklık − 2 × boşluk (kapıda yükseklikten yalnızca üst boşluk düşülür). 0 girilirse imalat ölçüsü gösterilmez.</p>`,
    actions: [{ k: 'no', t: 'Vazgeç' }, { k: 'ok', t: 'PDF hazırla', cls: 'btn-primary', icon: 'print', validate: () => { if (!sel.size) { toast('En az bir kapı / pencere seçin', 'err'); return false; } return true; } }],
    onOpen: el => {
      const sync = () => {
        $$('[data-o]', el).forEach(x => x.tagName === 'INPUT' ? (x.checked = sel.has(x.dataset.o)) : x.classList.toggle('on', sel.has(x.dataset.o)));
        $$('[data-g]', el).forEach(g => { const ids = items.filter(x => x.o.type === g.dataset.g).map(x => x.o.id), n = ids.filter(id => sel.has(id)).length; g.checked = n === ids.length; g.indeterminate = n > 0 && n < ids.length; });
        $('.jn-cnt', el).textContent = `${sel.size} / ${items.length} seçili`;
      };
      el.addEventListener('change', e => {
        const t = e.target;
        if (t.dataset.o) t.checked ? sel.add(t.dataset.o) : sel.delete(t.dataset.o);
        if (t.dataset.g) items.filter(x => x.o.type === t.dataset.g).forEach(x => t.checked ? sel.add(x.o.id) : sel.delete(x.o.id));
        sync();
      });
      el.addEventListener('click', e => {
        const pin = e.target.closest('.jn-pin'), q = e.target.closest('[data-q]');
        if (pin) { const id = pin.dataset.o; sel.has(id) ? sel.delete(id) : sel.add(id); $(`.jn-row [data-o="${id}"]`, el)?.closest('.jn-row').scrollIntoView({ block: 'nearest' }); }
        if (q) { sel.clear(); items.filter(x => q.dataset.q === 'all' || q.dataset.q === x.o.type).forEach(x => sel.add(x.o.id)); }
        if (pin || q) sync();
      });
      sync();
    } });
  if (r?.k !== 'ok') return;
  const gap = Math.max(0, Math.min(5, +$('#jnGap', r.el).value || 0)), key = $('#jnKey', r.el).checked;
  if (S.settings.jnGap !== gap) { S.settings.jnGap = gap; S.be.saveSettings(S.settings).catch(() => {}); }
  // seçim çizim bazında hatırlanır (yeni eklenen açıklıklar varsayılan olarak seçili gelir)
  const offNow = items.map(x => x.o.id).filter(id => !sel.has(id));
  if (offNow.join() !== [...off].join()) { (j.jnOff ||= {})[dw.id] = offNow; save(); }
  const name = dw.main ? 'Rölöve (mevcut durum)' : dw.name;
  const body = joineryHtml(plan, { gap, only: sel, keyPlan: key ? ov => planImageUrl(plan, 900, 560, ov) : null });
  printDoc(`<div class="pdoc">${docHeader(S.settings, 'Doğrama Listesi', `<div class="p-meta"><span>İş kodu <b>${esc(j.code)}</b></span><span>Müşteri <b>${esc(j.customer.name || '—')}</b></span><span>Çizim <b>${esc(name)}</b></span><span>Tarih <b>${fmtDate(Date.now())}</b></span></div>`)}${body}${docFooter()}</div>`, `Doğrama Listesi ${j.code}`);
}

/* zemin sipariş listesi: mahaller malzemeye göre gruplanır (PDF / metin) */
async function printFloorOrder(j, dw, plan) {
  if (!plan?.rooms?.length) return toast('Çizimde oda / mahal yok', 'err');
  const F = await import('./floororder.js'), { floorOf } = await import('./catalog.js');
  const off = new Set(j.flOff?.[dw.id] || []), sel = new Set(plan.rooms.map(r => r.id).filter(id => !off.has(id)));
  const cfg = JSON.parse(JSON.stringify(j.floorCfg || {}));
  const mats = [...new Set(plan.rooms.map(r => r.floor || 'parke'))];
  const other = mats.filter(k => F.FLOOR_MAT[k]);
  const numIn = (k, f, v, u, st = 'any') => `<label>${f}<div class="inp-unit sm"><input type="number" inputmode="decimal" step="${st}" min="0" data-c="${k}" value="${v}"><span>${u}</span></div></label>`;
  const matBox = k => { const c = F.matCfg(k, cfg); return `<div class="fo-mat" data-m="${k}"><b>${esc(floorOf(k).t)}</b>
    <label>Ürün / seri<input class="inp sm" data-c="name" value="${esc(c.name)}" placeholder="isteğe bağlı"></label>
    <div class="grid3">${numIn('fire', 'Fire', c.fire, '%', 1)}${c.packT === 'paket' ? numIn('pack', 'Paket', c.pack, 'm²') : ''}${c.kgm2 ? numIn('kgm2', 'Sarfiyat', c.kgm2, 'kg/m²') + numIn('bag', 'Torba', c.bag, 'kg', 1) : ''}</div></div>`; };
  const row = r => `<label class="jn-row"><input type="checkbox" data-r="${r.id}" ${sel.has(r.id) ? 'checked' : ''}><span><b>${esc(r.name)}</b> <small>${fmtNum(Math.abs(planMetrics({ ...plan, rooms: [r] }).floor))} m²</small><br><small class="muted">${esc(floorOf(r.floor).t)}${r.tile ? ` · ${fmtNum(r.tile.w, 1)} × ${fmtNum(r.tile.l, 1)}${r.tile.name ? ' · ' + esc(r.tile.name) : ''}` : ''}</small></span></label>`;
  const read = el => { $$('.fo-mat', el).forEach(b => { const k = b.dataset.m, c = (cfg[k] ||= {}); $$('[data-c]', b).forEach(i => { c[i.dataset.c] = i.type === 'number' ? Math.max(0, +i.value || 0) : i.value.trim(); }); }); };
  const summary = el => { read(el); const g = F.floorOrderData(plan, { only: sel, cfg }); $('.fo-sum', el).innerHTML = g.length ? `<table class="p-table sm"><tbody>${F.orderLines(g).map(([c, t, n, q, o]) => `<tr${c ? '' : ' class="sub"'}><td><b>${c}</b></td><td>${esc(t)}${n ? `<br><small class="muted">${esc(n)}</small>` : ''}</td><td class="r">${o}</td></tr>`).join('')}</tbody></table>` : '<p class="muted small">Mahal seçin.</p>'; };
  const r = await modal({ title: 'Zemin sipariş listesi', wide: true, body: `
    <p class="muted small">${esc(dw.main ? 'Rölöve (mevcut durum)' : dw.name)} — listeye girecek mahalleri seçin. Seramik / karo mahallerinde boyut, döşeme şekli ve derz, odanın "döşeme hesabı" bölümünden alınır; aynı malzeme ve ürün tek kalemde toplanır.</p>
    <div class="jn-pick">
      <div class="jn-side"><div class="row wrap jn-quick"><button class="btn btn-xs btn-ghost" data-q="all">Tümü</button><button class="btn btn-xs btn-ghost" data-q="none">Hiçbiri</button>${mats.length > 1 ? mats.map(k => `<button class="btn btn-xs btn-ghost" data-q="${k}">Yalnız ${esc(floorOf(k).t.toLocaleLowerCase('tr'))}</button>`).join('') : ''}</div>
        <div class="jn-list">${plan.rooms.map(row).join('')}</div></div>
      <div class="jn-side">${other.map(matBox).join('')}<div class="fo-sum"></div></div>
    </div>
    <label class="check"><input type="checkbox" id="foKey" checked> Anahtar plan (malzeme kodları plan üzerinde)</label>`,
    actions: [{ k: 'no', t: 'Vazgeç' }, { k: 'txt', t: 'Metni kopyala', icon: 'copy', validate: () => sel.size > 0 || (toast('En az bir mahal seçin', 'err'), false) }, { k: 'ok', t: 'PDF hazırla', cls: 'btn-primary', icon: 'print', validate: () => sel.size > 0 || (toast('En az bir mahal seçin', 'err'), false) }],
    onOpen: el => {
      const sync = () => { $$('[data-r]', el).forEach(x => x.checked = sel.has(x.dataset.r)); summary(el); };
      el.addEventListener('change', e => { const t = e.target; if (t.dataset.r) t.checked ? sel.add(t.dataset.r) : sel.delete(t.dataset.r); sync(); });
      el.addEventListener('input', e => { if (e.target.dataset.c) summary(el); });
      el.addEventListener('click', e => { const q = e.target.closest('[data-q]'); if (!q) return; sel.clear(); plan.rooms.filter(x => q.dataset.q === 'all' || (x.floor || 'parke') === q.dataset.q).forEach(x => sel.add(x.id)); sync(); });
      sync();
    } });
  if (!r || r.k === 'no') return;
  read(r.el);
  const offNow = plan.rooms.map(x => x.id).filter(id => !sel.has(id));
  (j.flOff ||= {})[dw.id] = offNow; j.floorCfg = cfg; save();
  const groups = F.floorOrderData(plan, { only: sel, cfg }), name = dw.main ? 'Rölöve (mevcut durum)' : dw.name;
  if (r.k === 'txt') {
    const strip = x => String(x).replace(/<[^>]+>/g, '');
    const txt = [`Zemin sipariş listesi — ${j.code}${j.customer.name ? ' · ' + j.customer.name : ''} (${name})`, ...F.orderLines(groups).map(([c, t, n, q, o]) => `${c ? c + ' ' : '   – '}${t}${n ? ' (' + n + ')' : ''}: ${strip(o)}${c ? ' — ' + q : ''}`)].join('\n');
    try { await navigator.clipboard.writeText(txt); toast('Sipariş listesi kopyalandı'); } catch { await modal({ title: 'Sipariş listesi', body: `<textarea class="inp" rows="12" style="width:100%">${esc(txt)}</textarea>`, actions: [{ k: 'ok', t: 'Kapat' }] }); }
    return;
  }
  const key = $('#foKey', r.el).checked;
  const body = F.floorOrderHtml(plan, groups, { keyPlan: key ? ov => planImageUrl(plan, 900, 560, ov) : null });
  printDoc(`<div class="pdoc">${docHeader(S.settings, 'Zemin Kaplaması Sipariş Listesi', `<div class="p-meta"><span>İş kodu <b>${esc(j.code)}</b></span><span>Müşteri <b>${esc(j.customer.name || '—')}</b></span><span>Çizim <b>${esc(name)}</b></span><span>Tarih <b>${fmtDate(Date.now())}</b></span></div>`)}${body}${docFooter()}</div>`, `Zemin Siparis ${j.code}`);
}

async function printReport() {
  const j = S.job, met = jobMetrics(j);
  const urls = {};
  await Promise.all(j.photos.map(async p => { urls[p.id] = await S.be.photoUrl(p); }));
  const imgs = ps => ps.length ? `<div class="p-grid">${ps.map(p => `<figure><img src="${urls[p.id]}"><figcaption>${esc(p.caption || p.room || '')}</figcaption></figure>`).join('')}</div>` : '';
  const html = `<div class="pdoc">
    ${docHeader(S.settings, 'Keşif Raporu', `<div class="p-meta"><span>İş kodu <b>${esc(j.code)}</b></span><span>Keşif <b>${fmtDate(j.kesifDate || j.createdAt)}</b></span><span>Rapor <b>${fmtDate(Date.now())}</b></span></div>`)}
    <section class="p-cust">
      <div><small>Müşteri</small><b>${esc(j.customer.name)}</b>${esc(j.customer.phone)}</div>
      <div><small>Adres</small><b>${esc(j.customer.district)}</b>${esc(j.customer.address)}${j.customer.geo?.lat ? `<br><a href="${esc(dirLink(j.customer.geo))}">Haritada konum (${j.customer.geo.lat.toFixed(5)}, ${j.customer.geo.lng.toFixed(5)})</a>` : ''}</div>
      <div><small>Sorumlu</small><b>${esc(j.assigned || '—')}</b>${esc(statusOf(j.status).t)}</div>
    </section>
    ${j.summary ? `<p class="p-intro">${esc(j.summary)}</p>` : ''}
    ${drawingsOf(j).filter(d => hasContent(d.plan)).map(d => `<section><h3>${d.main ? 'Rölöve (mevcut durum)' : esc(d.name)} ${d.main ? '' : `<small>(${kindOf(d.kind).t})</small>`}</h3><div class="p-plan"><img src="${planImageUrl(d.plan, 900, 520)}" alt="${esc(d.name)}"></div></section>`).join('')}
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
        <h3>${gicon('home')}Firma bilgileri <small class="muted">(teklif ve raporlarda)</small></h3>
        <div class="grid2">
          <label>Firma adı<input class="inp" data-f="company.name"></label>
          <label>Telefon<input class="inp" data-f="company.phone"></label>
          <label>E-posta<input class="inp" data-f="company.email"></label>
          <label>Web<input class="inp" data-f="company.web"></label>
          <label>Google yorum bağlantısı<input class="inp" data-f="company.reviewUrl" placeholder="https://g.page/r/…/review"></label>
          <label>Vergi no<input class="inp" data-f="company.taxNo"></label>
          <label>IBAN<input class="inp" data-f="company.iban"></label>
        </div>
        <label>Adres<textarea class="inp" rows="2" data-f="company.address"></textarea></label>
        <div class="stamp-set">
          <b>Kaşe görseli</b><span class="muted small">Teklifte "Kaşe / İmza" alanına basılır. Beyaz zemin otomatik saydam yapılır.</span>
          <div class="stamp-prev" id="stPrev"></div>
          <div class="row wrap"><label class="btn btn-ghost btn-sm">${icon('upload')}Kaşe yükle<input type="file" accept="image/*" hidden data-stamp></label><button class="btn btn-ghost btn-sm danger-t" data-stamp-del hidden>${icon('trash')}Kaldır</button></div>
        </div>
      </div>
      <div class="card">
        <h3>${gicon('file')}Teklif varsayılanları</h3>
        <div class="grid2"><label>KDV %<input class="inp" type="number" data-f="vat"></label><label>Geçerlilik (gün)<input class="inp" type="number" data-f="validDays"></label><label>Yüklenici kârı %<input class="inp" type="number" step="0.5" data-f="profit"></label></div>
        <label>Şartlar ve koşullar (her satır bir madde)<textarea class="inp" rows="7" data-f="terms"></textarea></label>
      </div>
      <div class="card">
        <h3>${gicon('film')}Video rapor</h3>
        <label>Kapanış mesajları — "Süreç bizde, keyfi sizde" sahnesi (her satır bir madde, en çok 5)<textarea class="inp" rows="5" data-f="videoLines"></textarea></label>
        <p class="muted small">Müşterinin çekincelerine (bütçe aşımı, gecikme, dağınıklık, muhatap bulamama…) açıkça yanıt veren kısa cümleler yazın. Yalnızca gerçekten sunduğunuz güvenceleri yazın; garanti süresi gibi taahhütler yazılı teklifle de uyumlu olmalı.</p>
      </div>
      <div class="card rm-set" id="rmSet"></div>
    </div>
    <div class="card">
      <div class="row-between"><h3>${gicon('list')}Fiyat kütüphanesi</h3><div class="row"><button class="btn btn-ghost btn-sm" data-cadd>${icon('plus')}Kalem ekle</button><button class="btn btn-ghost btn-sm" data-creset>Varsayılana dön</button></div></div>
      <p class="muted small">Birim fiyatlar örnektir; kendi fiyatlarınızla güncelleyin. "Metraj" sütunu, teklife eklenirken miktarın plandan otomatik alınacağı ölçüyü belirler.</p>
      <div class="cat-table" id="ct"></div>
    </div>
    <div class="grid-2">
      <div class="card">
        <h3>${gicon(S.be.kind === 'cloud' ? 'cloud' : 'device')}Çalışma modu: ${esc(S.be.label)}</h3>
        <p class="muted small">${S.be.demo ? 'Demo hesabındasınız: bulut ve gerçek müşteri kayıtları kullanılmaz. Örnek işler ve yaptığınız değişiklikler yalnızca bu cihazda, ayrı bir demo veritabanında saklanır.' : S.be.kind === 'cloud' ? 'Veriler Firebase\'de saklanır, tüm ekip aynı kayıtları görür. İnternet kesildiğinde değişiklikler cihazda bekletilir ve bağlantı gelince eşitlenir.' : 'Veriler yalnızca bu cihazda (tarayıcı veritabanı) saklanır. Düzenli yedek alın veya buluta geçin.'}</p>
        <div class="row wrap">
          ${S.be.demo ? `<button class="btn btn-ghost btn-sm" data-demoreset>${icon('rotate')}Demo verilerini sıfırla</button>` : S.be.kind === 'local' ? `<button class="btn btn-primary btn-sm" data-tocloud>${icon('cloud')}Buluta giriş yap ve aktar</button>` : `<button class="btn btn-ghost btn-sm" data-fromlocal>${icon('upload')}Bu cihazdaki yerel işleri buluta aktar</button>`}
        </div>
      </div>
      <div class="card">
        <h3>${gicon('download')}Yedekleme</h3>
        <p class="muted small">Tüm iş kayıtlarını JSON olarak indirin (fotoğraf dosyaları hariç) ya da yedekten geri yükleyin.</p>
        <div class="row wrap"><button class="btn btn-ghost btn-sm" data-exp>${icon('download')}Yedek indir</button><label class="btn btn-ghost btn-sm">${icon('upload')}Yedekten yükle<input type="file" accept="application/json" hidden data-imp></label></div>
      </div>
    </div>
    <div class="card about">
      <h3>${gicon('shield')}Hakkında</h3>
      <dl class="about-dl">
        <dt>Program</dt><dd>TadilatBodrum Saha · Sürüm ${APP_VERSION}${window.tbDesktop ? ` · Windows uygulaması ${esc(window.tbDesktop.version)}` : ''}</dd>
        <dt>Lisans sahibi</dt><dd>${esc(LICENSE.owner)}</dd>
        <dt>Geliştirici</dt><dd>${esc(LICENSE.developer)}</dd>
        <dt>İletişim</dt><dd><a href="https://www.saggplus.com" target="_blank" rel="noopener">www.saggplus.com</a> · <a href="mailto:info@saggplus.com">info@saggplus.com</a></dd>
      </dl>
      <p class="muted small">© ${new Date().getFullYear()} ${esc(LICENSE.owner)}. Tüm hakları saklıdır.</p>
      ${window.tbDesktop ? `<div class="row wrap"><button class="btn btn-ghost btn-sm" data-dupd>${icon('download')}Güncellemeleri denetle</button><span class="muted small" id="dupdS"></span></div>` : `<p class="muted small">Windows uygulaması: <a href="https://github.com/aligokten/tadilatbodrum.com/releases/latest" target="_blank" rel="noopener">kurulum dosyasını indir</a></p>`}
    </div>`;
  const du = $('[data-dupd]');
  if (du) du.onclick = async () => {
    const st = $('#dupdS'); st.textContent = 'Denetleniyor…';
    try { st.textContent = await window.tbDesktop.checkUpdates(); } catch (e) { st.textContent = 'Denetlenemedi: ' + (e.message || e); }
  };
  const persist = debounce(() => S.be.saveSettings(S.settings).then(() => toast('Ayarlar kaydedildi')).catch(e => toast(e.message, 'err')), 900);
  bindFields(view(), st, persist);
  renderRemindSettings($('#rmSet'), st, persist);
  const drawStamp = () => {
    $('#stPrev').innerHTML = st.company.stamp ? `<img src="${st.company.stamp}" alt="Kaşe">` : '<span class="muted small">Kaşe yüklenmedi</span>';
    $('[data-stamp-del]').hidden = !st.company.stamp;
  };
  drawStamp();
  $('[data-stamp]').onchange = async e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    try { st.company.stamp = await prepStamp(f); persist(); drawStamp(); } catch (er) { toast('Görsel okunamadı: ' + er.message, 'err'); }
  };
  $('[data-stamp-del]').onclick = async () => { if (await confirmDlg('Kaşe görseli kaldırılsın mı?', 'Kaldır')) { delete st.company.stamp; persist(); drawStamp(); } };
  const drawCat = () => {
    $('#ct').innerHTML = `<div class="ct-row ct-h"><span>Kategori</span><span>Açıklama</span><span>Birim</span><span>Fiyat ₺</span><span>Metraj</span><span></span></div>` +
      st.catalog.map(c => `<div class="ct-row" data-id="${c.id}">
        <select class="inp sm" data-c="cat">${CATEGORIES.map(x => `<option value="${x.k}" ${x.k === c.cat ? 'selected' : ''}>${x.t}</option>`).join('')}</select>
        <input class="inp sm" data-c="desc" value="${esc(c.desc)}">
        <select class="inp sm" data-c="unit">${UNITS.map(u => `<option ${u === c.unit ? 'selected' : ''}>${u}</option>`).join('')}</select>
        <input class="inp sm" type="number" data-c="price" value="${c.price}">
        <select class="inp sm" data-c="qty"><option value="">—</option>${[['floor', 'Zemin'], ['wall', 'Duvar'], ['ceil', 'Tavan'], ['perim', 'Çevre'], ['elec', 'Priz / anahtar sayısı'], ['light', 'Aydınlatma sayısı'], ['plumb', 'Tesisat noktası sayısı']].map(([k, t]) => `<option value="${k}" ${c.qty === k ? 'selected' : ''}>${t}</option>`).join('')}</select>
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
  $('[data-demoreset]')?.addEventListener('click', async () => {
    if (!await confirmDlg('Demo hesabındaki tüm işler silinip örnek işler yeniden oluşturulacak.', 'Sıfırla')) return;
    await flushSave(); await seedDemo(S.be, true); location.hash = ''; location.reload();
  });
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
