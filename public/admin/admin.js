/* ═══ TadilatBodrum.com — admin paneli (Firebase) ═══ */
import { auth, db, storage } from "/js/firebase-init.js";
import { firebaseConfig, ADMIN_EMAIL_DOMAIN, SITE_ID } from "/js/firebase-config.js";
import {
  signInWithEmailAndPassword, signOut, onAuthStateChanged, updatePassword
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  collection, getDocs, doc, getDoc, setDoc, addDoc, updateDoc, deleteDoc,
  query, orderBy, onSnapshot, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  ref as sref, uploadBytes, getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

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
  pool:  '<path d="M2 17q2.5-2 5 0t5 0 5 0 5 0M2 21q2.5-2 5 0t5 0 5 0 5 0M8 15V5a2 2 0 0 1 4 0M14 15V5a2 2 0 0 1 4 0"/>',
  window:'<rect x="4" y="3" width="16" height="18" rx="1"/><path d="M4 12h16M12 3v18"/>',
  door:  '<path d="M5 21V4a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v17M3 21h18M13 12h.01"/>',
  brush: '<path d="M9.5 14.5 4 20M14 4l6 6-7 3-2-2z"/><path d="M8 13l3 3"/>',
  wall:  '<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M3 9h18M3 15h18M8 4v5M16 9v6M8 15v5"/>',
};
const svgIcon = k => `<svg viewBox="0 0 24 24">${ICONS[k] || ICONS.tools}</svg>`;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const $ = id => document.getElementById(id);

/* tüm veriler sites/{SITE_ID}/... altında izole */
const col = name => collection(db, 'sites', SITE_ID, name);
const dref = (name, id) => doc(db, 'sites', SITE_ID, name, id);
const cfgRef = () => doc(db, 'sites', SITE_ID);

/* yerel bellek — Firestore'dan yüklenen içerik */
const DB = { config: {}, services: [], projects: [], reviews: [], appointments: [], messages: [] };
let unsubApp = null, unsubMsg = null;

/* ── görsel yükleme (Storage) ── */
async function uploadImage(file, folder) {
  const clean = (file.name || 'img').replace(/[^\w.\-]/g, '_');
  const r = sref(storage, `tadilatbodrum/${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${clean}`);
  await uploadBytes(r, file);
  return await getDownloadURL(r);
}
const fmtDate = ts => ts && ts.toDate ? ts.toDate().toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' }) : '';

/* ── giriş / çıkış ── */
$('loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  const st = $('loginStatus');
  st.textContent = 'Giriş yapılıyor…'; st.className = 'form-status';
  const u = $('loginUser').value.trim();
  const email = u.includes('@') ? u : `${u}@${ADMIN_EMAIL_DOMAIN}`;
  try {
    await signInWithEmailAndPassword(auth, email, $('loginPassword').value);
    // onAuthStateChanged paneli açar
  } catch (err) {
    st.textContent = '⚠ Kullanıcı adı veya şifre hatalı';
    st.className = 'form-status err';
  }
});
$('logoutBtn').onclick = () => signOut(auth);

onAuthStateChanged(auth, user => {
  if (user) {
    $('loginView').style.display = 'none';
    $('panelView').hidden = false;
    startPanel();
  } else {
    if (unsubApp) unsubApp(); if (unsubMsg) unsubMsg();
    $('panelView').hidden = true;
    $('loginView').style.display = 'flex';
    $('loginPassword').value = '';
  }
});

/* ── sekmeler ── */
document.querySelectorAll('.side-link[data-tab]').forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll('.side-link[data-tab]').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    $('tab-' + btn.dataset.tab).classList.add('active');
  };
});

/* ── panel verilerini yükle ── */
async function startPanel() {
  await loadContent();
  // gerçek zamanlı gelen kutuları
  if (unsubApp) unsubApp();
  if (unsubMsg) unsubMsg();
  unsubApp = onSnapshot(query(col('appointments'), orderBy('createdAt', 'desc')), snap => {
    DB.appointments = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderInbox('appointments'); renderBadges();
  });
  unsubMsg = onSnapshot(query(col('messages'), orderBy('createdAt', 'desc')), snap => {
    DB.messages = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderInbox('messages'); renderBadges();
  });
}

async function fetchColl(name) {
  const snap = await getDocs(query(col(name), orderBy('order')));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function loadContent() {
  const cfg = await getDoc(cfgRef());
  DB.config = cfg.exists() ? cfg.data() : {};
  [DB.services, DB.projects, DB.reviews] = await Promise.all([
    fetchColl('services'), fetchColl('projects'), fetchColl('reviews'),
  ]);
  $('tickerInput').value = DB.config.ticker || '';
  $('heroPreview').src = DB.config.heroImage || '/assets/hero.jpg';
  renderProjects(); renderServices(); renderReviews();
}

function renderBadges() {
  const set = (id, n) => { const b = $(id); b.textContent = n; b.classList.toggle('show', n > 0); };
  set('badgeRandevu', DB.appointments.filter(a => !a.read).length);
  set('badgeMesaj', DB.messages.filter(m => !m.read).length);
}

function toast(btn, msg) {
  const old = btn.textContent;
  btn.textContent = msg;
  setTimeout(() => { btn.textContent = old; btn.disabled = false; }, 1600);
}

/* ═══ Genel ayarlar ═══ */
$('saveTicker').onclick = async () => {
  try { await setDoc(cfgRef(), { ticker: $('tickerInput').value }, { merge: true }); toast($('saveTicker'), '✔ Kaydedildi'); }
  catch (e) { alert('Kaydedilemedi: ' + e.message); }
};

let heroFile = null;
$('heroFile').addEventListener('change', e => {
  heroFile = e.target.files[0] || null;
  if (heroFile) { $('heroPreview').src = URL.createObjectURL(heroFile); $('saveHero').disabled = false; }
});
$('saveHero').onclick = async () => {
  if (!heroFile) return;
  $('saveHero').disabled = true;
  try {
    const url = await uploadImage(heroFile, 'hero');
    await setDoc(cfgRef(), { heroImage: url }, { merge: true });
    DB.config.heroImage = url; heroFile = null;
    toast($('saveHero'), '✔ Yüklendi');
  } catch (e) { alert('Yüklenemedi: ' + e.message); $('saveHero').disabled = false; }
};

$('savePassword').onclick = async () => {
  const p = $('newPassword').value;
  if (p.length < 6) return alert('Şifre en az 6 karakter olmalı');
  try {
    await updatePassword(auth.currentUser, p);
    $('newPassword').value = '';
    toast($('savePassword'), '✔ Güncellendi');
  } catch (e) {
    if (e.code === 'auth/requires-recent-login') alert('Güvenlik için çıkıp tekrar giriş yaptıktan sonra şifreyi değiştirin.');
    else alert('Güncellenemedi: ' + e.message);
  }
};

/* ═══ Projeler ═══ */
let editingProject = null;
let pfImageList = [];

function renderProjects() {
  const el = $('projectList');
  if (!DB.projects.length) { el.innerHTML = '<div class="empty">Henüz proje eklenmemiş.</div>'; return; }
  el.innerHTML = DB.projects.map(p => `
    <div class="item">
      <img class="item-thumb" src="${esc((p.images && p.images[0]) || '')}" alt="">
      <div class="item-body"><h4>${esc(p.title)}</h4><p>${esc(p.location || '')} — ${esc(p.desc || '')}</p></div>
      <div class="item-actions">
        <button class="btn btn-ghost btn-xs" data-edit="${p.id}">Düzenle</button>
        <button class="btn btn-danger btn-xs" data-del="${p.id}">Sil</button>
      </div>
    </div>`).join('');
  el.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => openProjectForm(DB.projects.find(p => p.id === b.dataset.edit)));
  el.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
    if (!confirm('Bu proje silinsin mi?')) return;
    await deleteDoc(dref('projects', b.dataset.del));
    DB.projects = DB.projects.filter(p => p.id !== b.dataset.del);
    renderProjects();
  });
}

function openProjectForm(proj) {
  editingProject = proj || null;
  pfImageList = proj ? [...(proj.images || [])] : [];
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
  const files = [...e.target.files];
  e.target.value = '';
  const st = $('projectFormStatus');
  st.textContent = 'Görsel yükleniyor…'; st.className = 'form-status';
  try {
    for (const f of files) pfImageList.push(await uploadImage(f, 'projects'));
    st.textContent = '';
    renderPfImages();
  } catch (err) { st.textContent = '⚠ Görsel yüklenemedi'; st.className = 'form-status err'; }
});

$('projectForm').addEventListener('submit', async e => {
  e.preventDefault();
  const st = $('projectFormStatus');
  st.textContent = 'Kaydediliyor…'; st.className = 'form-status';
  const payload = { title: $('pfTitle').value, location: $('pfLocation').value, desc: $('pfDesc').value, images: pfImageList };
  if (!payload.title) { st.textContent = '⚠ Başlık gerekli'; st.className = 'form-status err'; return; }
  try {
    if (editingProject) {
      await updateDoc(dref('projects', editingProject.id), payload);
      Object.assign(editingProject, payload);
    } else {
      const ref = await addDoc(col('projects'), { ...payload, order: Date.now(), createdAt: serverTimestamp() });
      DB.projects.push({ id: ref.id, ...payload });
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
    await deleteDoc(dref('services', b.dataset.del));
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
  if (!payload.title) { st.textContent = '⚠ Başlık gerekli'; st.className = 'form-status err'; return; }
  try {
    if (editingService) {
      await updateDoc(dref('services', editingService.id), payload);
      Object.assign(editingService, payload);
    } else {
      const ref = await addDoc(col('services'), { ...payload, order: Date.now(), createdAt: serverTimestamp() });
      DB.services.push({ id: ref.id, ...payload });
    }
    $('serviceModal').classList.remove('open');
    renderServices();
  } catch (err) { st.textContent = '⚠ ' + err.message; st.className = 'form-status err'; }
});

/* ═══ Müşteri Yorumları ═══ */
let editingReview = null;

function renderReviews() {
  const el = $('reviewList');
  if (!DB.reviews.length) { el.innerHTML = '<div class="empty">Henüz yorum eklenmemiş.</div>'; return; }
  el.innerHTML = DB.reviews.map(r => `
    <div class="item">
      <div class="rev-badge">${esc((r.name || '?').trim().charAt(0).toUpperCase())}</div>
      <div class="item-body">
        <h4>${esc(r.name)} <span class="rev-rate">${'★'.repeat(Math.max(1, Math.min(5, r.rating || 5)))}</span></h4>
        <p>${esc(r.location || '')}${r.location ? ' — ' : ''}${esc(r.text || '')}</p>
      </div>
      <div class="item-actions">
        <button class="btn btn-ghost btn-xs" data-edit="${r.id}">Düzenle</button>
        <button class="btn btn-danger btn-xs" data-del="${r.id}">Sil</button>
      </div>
    </div>`).join('');
  el.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => openReviewForm(DB.reviews.find(r => r.id === b.dataset.edit)));
  el.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
    if (!confirm('Bu yorum silinsin mi?')) return;
    await deleteDoc(dref('reviews', b.dataset.del));
    DB.reviews = DB.reviews.filter(r => r.id !== b.dataset.del);
    renderReviews();
  });
}

function openReviewForm(rev) {
  editingReview = rev || null;
  $('reviewFormTitle').textContent = rev ? 'Yorumu Düzenle' : 'Yeni Yorum';
  $('rfName').value = rev ? rev.name : '';
  $('rfLocation').value = rev ? (rev.location || '') : '';
  $('rfRating').value = rev ? String(rev.rating || 5) : '5';
  $('rfText').value = rev ? (rev.text || '') : '';
  $('reviewFormStatus').textContent = '';
  $('reviewModal').classList.add('open');
}
$('newReview').onclick = () => openReviewForm(null);

$('reviewForm').addEventListener('submit', async e => {
  e.preventDefault();
  const st = $('reviewFormStatus');
  st.textContent = 'Kaydediliyor…'; st.className = 'form-status';
  const payload = { name: $('rfName').value, location: $('rfLocation').value, rating: +$('rfRating').value, text: $('rfText').value };
  if (!payload.name || !payload.text) { st.textContent = '⚠ İsim ve yorum metni gerekli'; st.className = 'form-status err'; return; }
  try {
    if (editingReview) {
      await updateDoc(dref('reviews', editingReview.id), payload);
      Object.assign(editingReview, payload);
    } else {
      const ref = await addDoc(col('reviews'), { ...payload, order: Date.now(), createdAt: serverTimestamp() });
      DB.reviews.push({ id: ref.id, ...payload });
    }
    $('reviewModal').classList.remove('open');
    renderReviews();
  } catch (err) { st.textContent = '⚠ ' + err.message; st.className = 'form-status err'; }
});

/* ═══ Gelen kutuları ═══ */
function waNumber(phone) {
  let d = String(phone).replace(/\D/g, '');
  if (d.startsWith('90')) return d;
  if (d.startsWith('0')) return '9' + d;
  return '90' + d;
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
        <time>${esc(fmtDate(r.createdAt))}</time>
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

  el.querySelectorAll('[data-read]').forEach(b => b.onclick = async () =>
    updateDoc(dref(key, b.dataset.read), { read: true }));
  el.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
    if (!confirm('Bu kayıt silinsin mi?')) return;
    await deleteDoc(dref(key, b.dataset.del));
  });
}

/* ── modal kapatma ── */
document.querySelectorAll('[data-close-modal]').forEach(b =>
  b.onclick = () => b.closest('.modal-backdrop').classList.remove('open'));
document.querySelectorAll('.modal-backdrop').forEach(m =>
  m.addEventListener('click', e => { if (e.target === m) m.classList.remove('open'); }));

/* ═══ Örnek içerik yükleme ═══ */
const SEED = {
  config: { ticker: "Bodrum ve Milas genelinde ücretsiz keşif! Hemen arayın: 0 541 348 88 33  •  Yaz sezonu öncesi tadilat randevularınızı bugünden planlayın." },
  services: [
    { icon: "villa", title: "Villa Tadilatı",    desc: "Villalarınız için kapsamlı tadilat ve renovasyon çözümleri." },
    { icon: "sun",   title: "Yazlık Yenileme",   desc: "Yazlıklarınıza modern, konforlu ve estetik dokunuşlar." },
    { icon: "sofa",  title: "İç Mekan Tasarımı", desc: "Fonksiyonel, şık ve size özel iç mekan tasarım çözümleri." },
    { icon: "bath",  title: "Banyo & Mutfak",    desc: "Banyo ve mutfak alanlarınızı yenileyerek değer katıyoruz." },
    { icon: "paint", title: "Boya & Uygulama",   desc: "İç ve dış boya, dekoratif uygulama ve yüzey çözümleri." },
    { icon: "key",   title: "Anahtar Teslim",    desc: "Tasarım, uygulama ve teslimat dahil anahtar teslim hizmet." },
  ],
  projects: [
    { title: "Bitez Villa Yenileme", location: "Bitez, Bodrum",
      desc: "Havuzlu villanın iç ve dış mekanlarının komple yenilenmesi; mutfak, banyolar, zemin kaplamaları ve dış cephe boyası anahtar teslim tamamlandı.",
      images: ["/uploads/seed-bitez.svg", "/assets/hero.jpg"] },
    { title: "Ören Villa Yenileme", location: "Ören, Milas",
      desc: "Deniz manzaralı villada iç mekan tasarımı, banyo & mutfak yenileme ve dekoratif boya uygulamaları gerçekleştirildi.",
      images: ["/uploads/seed-oren.svg"] },
    { title: "Güllük Daire Yenileme", location: "Güllük, Milas",
      desc: "Yazlık dairenin komple renovasyonu; zemin, elektrik-su tesisatı, mutfak dolapları ve boya işleri şeffaf süreç yönetimiyle teslim edildi.",
      images: ["/uploads/seed-gulluk.svg"] },
  ],
  reviews: [
    { name: "Ayşe K.", location: "Bitez, Bodrum", rating: 5, text: "Villamızın tadilatını baştan sona kusursuz yönettiler. Söz verilen tarihte, temiz ve kaliteli bir işçilikle teslim aldık. Kesinlikle tavsiye ederim." },
    { name: "Mehmet A.", location: "Ören, Milas", rating: 5, text: "Banyo ve mutfak yenilemesi yaptırdık. Şeffaf fiyatlandırma ve düzenli bilgilendirme çok iyiydi. İşçilik gerçekten kaliteli." },
    { name: "Zeynep T.", location: "Güllük, Milas", rating: 5, text: "Yazlık dairemiz adeta yeniden doğdu. Ekip son derece profesyonel ve titizdi. Sürecin her aşamasında yanımızdaydılar." },
  ],
};

$('seedBtn').onclick = async () => {
  if (!confirm('Örnek içerik yüklensin mi? (Sadece boş bölümler doldurulur)')) return;
  $('seedBtn').disabled = true;
  try {
    if (!DB.config.ticker) await setDoc(cfgRef(), SEED.config, { merge: true });
    let t = Date.now();
    if (!DB.services.length) for (const s of SEED.services) await addDoc(col('services'), { ...s, order: t++, createdAt: serverTimestamp() });
    if (!DB.projects.length) for (const p of SEED.projects) await addDoc(col('projects'), { ...p, order: t++, createdAt: serverTimestamp() });
    if (!DB.reviews.length)  for (const r of SEED.reviews)  await addDoc(col('reviews'),  { ...r, order: t++, createdAt: serverTimestamp() });
    await loadContent();
    toast($('seedBtn'), '✔ Yüklendi');
  } catch (e) { alert('Yüklenemedi: ' + e.message); $('seedBtn').disabled = false; }
};

/* ── yapılandırma uyarısı ── */
if (String(firebaseConfig.apiKey).startsWith('BURAYA')) {
  $('loginStatus').textContent = '⚠ Firebase yapılandırması eksik (js/firebase-config.js).';
  $('loginStatus').className = 'form-status err';
}
