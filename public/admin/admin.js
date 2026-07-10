/* ═══ TadilatBodrum.com — admin paneli ═══ */

const ICONS = {
  villa: '<path d="M3 21h18M5 21V10l7-6 7 6v11M9 21v-6h6v6"/>',
  sun:   '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  sofa:  '<path d="M5 11V8a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v3M3 14a2 2 0 0 1 4 0v1h10v-1a2 2 0 0 1 4 0v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM6 19v2M18 19v2"/>',
  bath:  '<path d="M4 12h16v2a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zM6 12V5a2 2 0 0 1 4 0M7 19l-1 2M17 19l1 2"/>',
  paint: '<rect x="4" y="3" width="14" height="6" rx="1"/><path d="M18 5h2a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-8v3M11 14h2v7h-2z"/>',
  key:   '<circle cx="8" cy="8" r="5"/><path d="M11.5 11.5 21 21M17 17l2-2M14 20l2-2"/>',
  tools: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18v3h3l6.3-6.3a4 4 0 0 0 5.4-5.4l-2.7 2.7-2.4-2.4z"/>',
  floor: '<rect x="3" y="3" width="18" height="18" rx="1"/><path d="M3 9h18M3 15h18M9 3v6M15 9v6M9 15v6"/>',
  roof:  '<path d="M2 12 12 3l10 9M5 10v10h14V10"/>',
  garden:'<path d="M12 21v-8M12 13c0-4 3-7 7-7 0 4-3 7-7 7zM12 13c0-4-3-7-7-7 0 4 3 7 7 7z"/>',
  elec:  '<path d="M13 2 4 14h6l-1 8 9-12h-6z"/>',
  pool:  '<path d="M2 17q2.5-2 5 0t5 0 5 0 5 0M2 21q2.5-2 5 0t5 0 5 0 5 0M8 15V5a2 2 0 0 1 4 0M14 15V5a2 2 0 0 1 4 0"/>'
};
const svgIcon = k => `<svg viewBox="0 0 24 24">${ICONS[k] || ICONS.tools}</svg>`;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const $ = id => document.getElementById(id);

let TOKEN = sessionStorage.getItem('tb_token') || '';
let DB = null;

/* ── api ── */
async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Auth-Token': TOKEN },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) { logout(); throw new Error('Oturum süresi doldu, tekrar giriş yapın'); }
  const j = await res.json();
  if (!res.ok) throw new Error(j.error || 'İşlem başarısız');
  return j;
}

const fileToDataURL = f => new Promise((ok, err) => {
  const r = new FileReader();
  r.onload = () => ok(r.result);
  r.onerror = err;
  r.readAsDataURL(f);
});

/* ── giriş / çıkış ── */
$('loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  const st = $('loginStatus');
  st.textContent = 'Giriş yapılıyor…'; st.className = 'form-status';
  try {
    const j = await api('POST', '/api/admin/login', { password: $('loginPassword').value });
    TOKEN = j.token;
    sessionStorage.setItem('tb_token', TOKEN);
    await enterPanel();
  } catch (err) { st.textContent = '⚠ ' + err.message; st.className = 'form-status err'; }
});

function logout() {
  TOKEN = ''; sessionStorage.removeItem('tb_token');
  $('panelView').hidden = true; $('loginView').style.display = 'flex';
}
$('logoutBtn').onclick = logout;

async function enterPanel() {
  DB = await api('GET', '/api/admin/data');
  $('loginView').style.display = 'none';
  $('panelView').hidden = false;
  renderAll();
}

/* ── sekmeler ── */
document.querySelectorAll('.side-link[data-tab]').forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll('.side-link[data-tab]').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    $('tab-' + btn.dataset.tab).classList.add('active');
  };
});

/* ── render ── */
function renderAll() {
  $('tickerInput').value = DB.ticker || '';
  $('heroPreview').src = DB.heroImage || '';
  renderProjects(); renderServices(); renderInbox('appointments'); renderInbox('messages'); renderBadges();
}

function renderBadges() {
  const set = (id, n) => { const b = $(id); b.textContent = n; b.classList.toggle('show', n > 0); };
  set('badgeRandevu', DB.appointments.filter(a => !a.read).length);
  set('badgeMesaj', DB.messages.filter(m => !m.read).length);
}

/* ═══ Genel ayarlar ═══ */
$('saveTicker').onclick = async () => {
  try { await api('POST', '/api/admin/ticker', { ticker: $('tickerInput').value }); toast($('saveTicker'), '✔ Kaydedildi'); }
  catch (e) { alert(e.message); }
};

let heroData = null;
$('heroFile').addEventListener('change', async e => {
  if (!e.target.files[0]) return;
  heroData = await fileToDataURL(e.target.files[0]);
  $('heroPreview').src = heroData;
  $('saveHero').disabled = false;
});
$('saveHero').onclick = async () => {
  if (!heroData) return;
  $('saveHero').disabled = true;
  try {
    const j = await api('POST', '/api/admin/hero', { image: heroData });
    DB.heroImage = j.heroImage; heroData = null;
    toast($('saveHero'), '✔ Yüklendi');
  } catch (e) { alert(e.message); $('saveHero').disabled = false; }
};

$('savePassword').onclick = async () => {
  const p = $('newPassword').value;
  if (p.length < 6) return alert('Şifre en az 6 karakter olmalı');
  try { await api('POST', '/api/admin/password', { password: p }); $('newPassword').value = ''; toast($('savePassword'), '✔ Güncellendi'); }
  catch (e) { alert(e.message); }
};

function toast(btn, msg) {
  const old = btn.textContent;
  btn.textContent = msg;
  setTimeout(() => { btn.textContent = old; btn.disabled = false; }, 1600);
}

/* ═══ Projeler ═══ */
let editingProject = null;
let pfImageList = [];

function renderProjects() {
  const el = $('projectList');
  if (!DB.projects.length) { el.innerHTML = '<div class="empty">Henüz proje eklenmemiş.</div>'; return; }
  el.innerHTML = DB.projects.map(p => `
    <div class="item">
      <img class="item-thumb" src="${esc(p.images[0] || '')}" alt="">
      <div class="item-body"><h4>${esc(p.title)}</h4><p>${esc(p.location || '')} — ${esc(p.desc || '')}</p></div>
      <div class="item-actions">
        <button class="btn btn-ghost btn-xs" data-edit="${p.id}">Düzenle</button>
        <button class="btn btn-danger btn-xs" data-del="${p.id}">Sil</button>
      </div>
    </div>`).join('');
  el.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => openProjectForm(DB.projects.find(p => p.id === b.dataset.edit)));
  el.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
    if (!confirm('Bu proje silinsin mi?')) return;
    await api('DELETE', '/api/admin/projects/' + b.dataset.del);
    DB.projects = DB.projects.filter(p => p.id !== b.dataset.del);
    renderProjects();
  });
}

function openProjectForm(proj) {
  editingProject = proj || null;
  pfImageList = proj ? [...proj.images] : [];
  $('projectFormTitle').textContent = proj ? 'Projeyi Düzenle' : 'Yeni Proje';
  $('pfTitle').value = proj ? proj.title : '';
  $('pfLocation').value = proj ? (proj.location || '') : '';
  $('pfDesc').value = proj ? (proj.desc || '') : '';
  $('projectFormStatus').textContent = '';
  renderPfImages();
  $('projectModal').classList.add('open');
}
$('newProject').onclick = () => openProjectForm(null);

function renderPfImages() {
  $('pfImages').innerHTML = pfImageList.map((im, i) => `
    <div class="pf-img"><img src="${esc(im)}" alt=""><button type="button" data-rm="${i}">✕</button></div>`).join('')
    || '<p style="font-size:13px;color:#888;font-weight:400">Henüz görsel yok.</p>';
  $('pfImages').querySelectorAll('[data-rm]').forEach(b =>
    b.onclick = () => { pfImageList.splice(+b.dataset.rm, 1); renderPfImages(); });
}

$('pfFile').addEventListener('change', async e => {
  for (const f of e.target.files) pfImageList.push(await fileToDataURL(f));
  e.target.value = '';
  renderPfImages();
});

$('projectForm').addEventListener('submit', async e => {
  e.preventDefault();
  const st = $('projectFormStatus');
  st.textContent = 'Kaydediliyor…'; st.className = 'form-status';
  const payload = { title: $('pfTitle').value, location: $('pfLocation').value, desc: $('pfDesc').value, images: pfImageList };
  try {
    if (editingProject) {
      const j = await api('PUT', '/api/admin/projects/' + editingProject.id, payload);
      Object.assign(editingProject, j);
    } else {
      const j = await api('POST', '/api/admin/projects', payload);
      DB.projects.unshift(j);
    }
    $('projectModal').classList.remove('open');
    renderProjects();
  } catch (err) { st.textContent = '⚠ ' + err.message; st.className = 'form-status err'; }
});

/* ═══ Hizmetler ═══ */
let editingService = null;
let sfIcon = 'tools';

function renderServices() {
  const el = $('serviceList');
  if (!DB.services.length) { el.innerHTML = '<div class="empty">Henüz hizmet eklenmemiş.</div>'; return; }
  el.innerHTML = DB.services.map(s => `
    <div class="item">
      <div class="item-icon">${svgIcon(s.icon)}</div>
      <div class="item-body"><h4>${esc(s.title)}</h4><p>${esc(s.desc || '')}</p></div>
      <div class="item-actions">
        <button class="btn btn-ghost btn-xs" data-edit="${s.id}">Düzenle</button>
        <button class="btn btn-danger btn-xs" data-del="${s.id}">Sil</button>
      </div>
    </div>`).join('');
  el.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => openServiceForm(DB.services.find(s => s.id === b.dataset.edit)));
  el.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
    if (!confirm('Bu hizmet silinsin mi?')) return;
    await api('DELETE', '/api/admin/services/' + b.dataset.del);
    DB.services = DB.services.filter(s => s.id !== b.dataset.del);
    renderServices();
  });
}

function openServiceForm(svc) {
  editingService = svc || null;
  sfIcon = svc ? svc.icon : 'tools';
  $('serviceFormTitle').textContent = svc ? 'Hizmeti Düzenle' : 'Yeni Hizmet';
  $('sfTitle').value = svc ? svc.title : '';
  $('sfDesc').value = svc ? (svc.desc || '') : '';
  $('serviceFormStatus').textContent = '';
  renderIconPicker();
  $('serviceModal').classList.add('open');
}
$('newService').onclick = () => openServiceForm(null);

function renderIconPicker() {
  $('sfIcons').innerHTML = Object.keys(ICONS).map(k =>
    `<button type="button" class="icon-opt ${k === sfIcon ? 'active' : ''}" data-icon="${k}" title="${k}">${svgIcon(k)}</button>`).join('');
  $('sfIcons').querySelectorAll('[data-icon]').forEach(b =>
    b.onclick = () => { sfIcon = b.dataset.icon; renderIconPicker(); });
}

$('serviceForm').addEventListener('submit', async e => {
  e.preventDefault();
  const st = $('serviceFormStatus');
  st.textContent = 'Kaydediliyor…'; st.className = 'form-status';
  const payload = { title: $('sfTitle').value, desc: $('sfDesc').value, icon: sfIcon };
  try {
    if (editingService) {
      const j = await api('PUT', '/api/admin/services/' + editingService.id, payload);
      Object.assign(editingService, j);
    } else {
      const j = await api('POST', '/api/admin/services', payload);
      DB.services.push(j);
    }
    $('serviceModal').classList.remove('open');
    renderServices();
  } catch (err) { st.textContent = '⚠ ' + err.message; st.className = 'form-status err'; }
});

/* ═══ Gelen kutuları ═══ */
function waNumber(phone) {
  let d = String(phone).replace(/\D/g, '');
  if (d.startsWith('90')) return d;          // +90 5xx …
  if (d.startsWith('0')) return '9' + d;     // 05xx …
  return '90' + d;                           // 5xx …
}

function renderInbox(key) {
  const el = key === 'appointments' ? $('appointmentList') : $('messageList');
  const list = DB[key];
  if (!list.length) {
    el.innerHTML = `<div class="empty">${key === 'appointments' ? 'Henüz randevu talebi yok.' : 'Henüz mesaj yok.'}</div>`;
    return;
  }
  el.innerHTML = list.map(r => `
    <div class="inbox-item ${r.read ? '' : 'unread'}">
      <div class="inbox-top">
        <strong>${esc(r.name)}</strong>
        ${r.read ? '' : '<span class="new-tag">YENİ</span>'}
        <time>${esc(r.createdAt)}</time>
      </div>
      <div class="inbox-meta">
        ${r.phone ? `<span>📞 <a href="tel:${esc(r.phone)}">${esc(r.phone)}</a></span>` : ''}
        ${r.email ? `<span>✉️ <a href="mailto:${esc(r.email)}">${esc(r.email)}</a></span>` : ''}
        ${r.district ? `<span>📍 ${esc(r.district)}</span>` : ''}
        ${r.date ? `<span>📅 Tercih: ${esc(r.date)}</span>` : ''}
      </div>
      ${(r.message || r.note) ? `<div class="inbox-body">${esc(r.message || r.note)}</div>` : ''}
      <div class="inbox-actions">
        ${r.read ? '' : `<button class="btn btn-ghost btn-xs" data-read="${r.id}">Okundu işaretle</button>`}
        ${r.phone ? `<a class="btn btn-primary btn-xs" href="https://wa.me/${waNumber(r.phone)}" target="_blank">WhatsApp</a>` : ''}
        <button class="btn btn-danger btn-xs" data-del="${r.id}">Sil</button>
      </div>
    </div>`).join('');

  el.querySelectorAll('[data-read]').forEach(b => b.onclick = async () => {
    await api('PUT', `/api/admin/${key}/${b.dataset.read}/read`, { read: true });
    DB[key].find(r => r.id === b.dataset.read).read = true;
    renderInbox(key); renderBadges();
  });
  el.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
    if (!confirm('Bu kayıt silinsin mi?')) return;
    await api('DELETE', `/api/admin/${key}/${b.dataset.del}`);
    DB[key] = DB[key].filter(r => r.id !== b.dataset.del);
    renderInbox(key); renderBadges();
  });
}

/* ── modal kapatma ── */
document.querySelectorAll('[data-close-modal]').forEach(b =>
  b.onclick = () => b.closest('.modal-backdrop').classList.remove('open'));
document.querySelectorAll('.modal-backdrop').forEach(m =>
  m.addEventListener('click', e => { if (e.target === m) m.classList.remove('open'); }));

/* ── her 60 sn'de gelen kutularını tazele ── */
setInterval(async () => {
  if (!TOKEN || $('panelView').hidden) return;
  try {
    const j = await api('GET', '/api/admin/data');
    DB.appointments = j.appointments; DB.messages = j.messages;
    renderInbox('appointments'); renderInbox('messages'); renderBadges();
  } catch { /* sessiz geç */ }
}, 60000);

/* ── otomatik giriş ── */
if (TOKEN) enterPanel().catch(logout);
