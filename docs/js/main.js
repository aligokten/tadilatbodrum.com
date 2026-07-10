/* ═══ TadilatBodrum.com — ana sayfa (Firebase / Firestore) ═══ */
import { db } from "./firebase-init.js";
import {
  collection, getDocs, getDoc, doc, query, orderBy,
  addDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/* Tek renk (currentColor) 2D çizgi ikon seti */
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
const svgIcon = k => `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${ICONS[k] || ICONS.tools}</svg>`;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/* Firestore boş/erişilemezse gösterilecek yedek içerik */
const FALLBACK_SITE = {
  ticker: "Bodrum ve Milas genelinde ücretsiz keşif! Hemen arayın: 0 541 348 88 33  •  Yaz sezonu öncesi tadilat randevularınızı bugünden planlayın.",
  heroImage: "assets/hero.jpg",
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
      images: ["uploads/seed-bitez.svg", "assets/hero.jpg"] },
    { title: "Ören Villa Yenileme", location: "Ören, Milas",
      desc: "Deniz manzaralı villada iç mekan tasarımı, banyo & mutfak yenileme ve dekoratif boya uygulamaları gerçekleştirildi.",
      images: ["uploads/seed-oren.svg"] },
    { title: "Güllük Daire Yenileme", location: "Güllük, Milas",
      desc: "Yazlık dairenin komple renovasyonu; zemin, elektrik-su tesisatı, mutfak dolapları ve boya işleri şeffaf süreç yönetimiyle teslim edildi.",
      images: ["uploads/seed-gulluk.svg"] },
  ],
  reviews: [
    { name: "Ayşe K.", location: "Bitez, Bodrum", rating: 5,
      text: "Villamızın tadilatını baştan sona kusursuz yönettiler. Söz verilen tarihte, temiz ve kaliteli bir işçilikle teslim aldık. Kesinlikle tavsiye ederim." },
    { name: "Mehmet A.", location: "Ören, Milas", rating: 5,
      text: "Banyo ve mutfak yenilemesi yaptırdık. Şeffaf fiyatlandırma ve düzenli bilgilendirme çok iyiydi. İşçilik gerçekten kaliteli." },
    { name: "Zeynep T.", location: "Güllük, Milas", rating: 5,
      text: "Yazlık dairemiz adeta yeniden doğdu. Ekip son derece profesyonel ve titizdi. Sürecin her aşamasında yanımızdaydılar." },
  ],
};

let SITE = { projects: [], services: [], reviews: [] };
let STATIC_MODE = false;

async function fetchCollection(name) {
  const snap = await getDocs(query(collection(db, name), orderBy('order')));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/* ── veri yükle ── */
async function loadSite() {
  try {
    const cfgSnap = await getDoc(doc(db, 'site', 'config'));
    const cfg = cfgSnap.exists() ? cfgSnap.data() : {};
    const [services, projects, reviews] = await Promise.all([
      fetchCollection('services'), fetchCollection('projects'), fetchCollection('reviews'),
    ]);
    SITE = {
      ticker: cfg.ticker ?? FALLBACK_SITE.ticker,
      heroImage: cfg.heroImage || FALLBACK_SITE.heroImage,
      services: services.length ? services : FALLBACK_SITE.services,
      projects: projects.length ? projects : FALLBACK_SITE.projects,
      reviews: reviews.length ? reviews : FALLBACK_SITE.reviews,
    };
  } catch (err) {
    console.warn('Firestore okunamadı, yedek içerik gösteriliyor:', err);
    STATIC_MODE = true;
    SITE = FALLBACK_SITE;
  }
  renderSite();
}

function renderSite() {
  // kayan yazı
  const track = document.getElementById('tickerTrack');
  const msg = SITE.ticker || '';
  if (msg.trim()) {
    track.innerHTML = `<span>${esc(msg)}</span><span>${esc(msg)}</span>`;
    track.style.animationDuration = Math.max(18, msg.length / 3) + 's';
  } else {
    document.getElementById('ticker').style.display = 'none';
  }

  // hero görseli
  if (SITE.heroImage) document.getElementById('heroImage').src = SITE.heroImage;

  // hizmetler
  document.getElementById('servicesGrid').innerHTML = (SITE.services || []).map(s => `
    <div class="service-card glass reveal">
      <div class="service-icon">${svgIcon(s.icon)}</div>
      <h3>${esc(s.title)}</h3>
      <p>${esc(s.desc)}</p>
    </div>`).join('');

  renderReviews();
  buildCarousel();
  observeReveals();
}

/* ── müşteri yorumları ── */
function starRow(n) {
  n = Math.max(1, Math.min(5, +n || 5));
  let s = '';
  for (let i = 1; i <= 5; i++) {
    s += `<svg class="star ${i <= n ? 'on' : ''}" viewBox="0 0 24 24"><path d="M12 3l2.6 5.3 5.9.9-4.3 4.2 1 5.9L12 16.9 6.8 19.4l1-5.9L3.5 9.2l5.9-.9z"/></svg>`;
  }
  return s;
}
function renderReviews() {
  const el = document.getElementById('reviewsGrid');
  if (!el) return;
  el.innerHTML = (SITE.reviews || []).map(r => `
    <figure class="review-card glass reveal">
      <div class="review-stars">${starRow(r.rating)}</div>
      <blockquote>“${esc(r.text)}”</blockquote>
      <figcaption>
        <span class="rev-avatar">${esc((r.name || '?').trim().charAt(0).toUpperCase())}</span>
        <span class="rev-meta"><strong>${esc(r.name)}</strong><small>${esc(r.location || '')}</small></span>
      </figcaption>
    </figure>`).join('');
}

/* ── scroll reveal ── */
function observeReveals() {
  const io = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); io.unobserve(e.target); } });
  }, { threshold: 0.12 });
  document.querySelectorAll('.reveal:not(.visible)').forEach(el => io.observe(el));
}

/* ═══ animasyonlu glassmorphism karusel ═══ */
const carStage = document.getElementById('carStage');
const carDots = document.getElementById('carDots');
let carActive = 0;
let carCards = [];

function buildCarousel() {
  const items = SITE.projects || [];
  carStage.innerHTML = '';
  carActive = 0;
  carCards = items.map((p, i) => {
    const el = document.createElement('article');
    el.className = 'car-card';
    el.innerHTML = `
      <img src="${esc((p.images && p.images[0]) || '')}" alt="${esc(p.title)}" loading="lazy">
      <button class="car-open" aria-label="Detay"><svg class="ic" viewBox="0 0 24 24"><path d="M7 17L17 7M9 7h8v8"/></svg></button>
      <div class="car-body">
        <span class="car-loc"><svg class="ic" viewBox="0 0 24 24"><path d="M12 21s7-6.5 7-11a7 7 0 0 0-14 0c0 4.5 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>${esc(p.location || '')}</span>
        <h3>${esc(p.title)}</h3>
      </div>`;
    el.addEventListener('click', () => {
      if (i === carActive) openProjModal(i);
      else setCarActive(i);
    });
    carStage.appendChild(el);
    return el;
  });

  carDots.innerHTML = items.map((_, i) =>
    `<button class="${i === 0 ? 'active' : ''}" data-i="${i}" aria-label="Proje ${i + 1}"></button>`).join('');
  carDots.querySelectorAll('button').forEach(b => b.onclick = () => setCarActive(+b.dataset.i));

  positionCards();
}

function positionCards() {
  const n = carCards.length;
  carCards.forEach((el, i) => {
    let off = i - carActive;
    if (off > n / 2) off -= n;
    if (off < -n / 2) off += n;
    const a = Math.abs(off);
    if (a > 2) {
      el.style.transform = `translateX(${off > 0 ? 220 : -220}%) scale(.5)`;
      el.classList.add('hidden');
    } else {
      el.classList.remove('hidden');
      const x = off * 62;
      const scale = a === 0 ? 1 : a === 1 ? 0.82 : 0.66;
      const rotY = off * -8;
      el.style.transform = `translateX(${x}%) scale(${scale}) rotateY(${rotY}deg)`;
      el.style.opacity = a === 0 ? 1 : a === 1 ? 0.9 : 0.45;
      el.style.zIndex = 10 - a;
    }
    el.classList.toggle('active', off === 0);
  });
  carDots.querySelectorAll('button').forEach((b, i) => b.classList.toggle('active', i === carActive));
}

function setCarActive(i) {
  const n = carCards.length;
  if (!n) return;
  carActive = ((i % n) + n) % n;
  positionCards();
}

document.getElementById('carPrev').onclick = () => setCarActive(carActive - 1);
document.getElementById('carNext').onclick = () => setCarActive(carActive + 1);

/* ── proje modalı ── */
const projModal = document.getElementById('projModal');
const modalImg = document.getElementById('modalImg');
const modalDots = document.getElementById('modalDots');
let curProj = null, curImg = 0;

function openProjModal(idx) {
  curProj = SITE.projects[idx];
  if (!curProj) return;
  curImg = 0;
  document.getElementById('modalTitle').textContent = curProj.title;
  document.getElementById('modalLoc').textContent = curProj.location || '';
  document.getElementById('modalDesc').textContent = curProj.desc || '';
  renderModalSlide();
  openModal(projModal);
}

function renderModalSlide() {
  const imgs = curProj.images || [];
  modalImg.classList.add('switching');
  setTimeout(() => {
    modalImg.src = imgs[curImg] || '';
    modalImg.alt = curProj.title;
    modalImg.classList.remove('switching');
  }, 160);
  modalDots.innerHTML = imgs.map((_, i) =>
    `<button class="${i === curImg ? 'active' : ''}" aria-label="Görsel ${i + 1}"></button>`).join('');
  modalDots.querySelectorAll('button').forEach((b, i) => b.onclick = () => { curImg = i; renderModalSlide(); });
  const many = imgs.length > 1;
  document.getElementById('modalPrev').style.display = many ? '' : 'none';
  document.getElementById('modalNext').style.display = many ? '' : 'none';
}

document.getElementById('modalPrev').onclick = () => { const n = curProj.images.length; curImg = (curImg - 1 + n) % n; renderModalSlide(); };
document.getElementById('modalNext').onclick = () => { const n = curProj.images.length; curImg = (curImg + 1) % n; renderModalSlide(); };

/* ── genel modal aç/kapa ── */
function openModal(el) { el.classList.add('open'); el.setAttribute('aria-hidden', 'false'); document.body.classList.add('modal-open'); }
function closeModal(el) { el.classList.remove('open'); el.setAttribute('aria-hidden', 'true'); document.body.classList.remove('modal-open'); }

document.getElementById('projModalClose').onclick = () => closeModal(projModal);
projModal.addEventListener('click', e => { if (e.target === projModal) closeModal(projModal); });

const kesifModal = document.getElementById('kesifModal');
document.getElementById('kesifModalClose').onclick = () => closeModal(kesifModal);
kesifModal.addEventListener('click', e => { if (e.target === kesifModal) closeModal(kesifModal); });
document.querySelectorAll('[data-open-kesif]').forEach(b =>
  b.addEventListener('click', e => { e.preventDefault(); openModal(kesifModal); document.getElementById('navLinks').classList.remove('open'); }));

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeModal(projModal); closeModal(kesifModal); }
  if (projModal.classList.contains('open') && curProj && curProj.images.length > 1) {
    if (e.key === 'ArrowLeft') document.getElementById('modalPrev').click();
    if (e.key === 'ArrowRight') document.getElementById('modalNext').click();
  } else if (!projModal.classList.contains('open') && !kesifModal.classList.contains('open')) {
    if (e.key === 'ArrowLeft') setCarActive(carActive - 1);
    if (e.key === 'ArrowRight') setCarActive(carActive + 1);
  }
});

/* ── formlar → Firestore ── */
async function submitForm(form, coll, statusEl, okMsg) {
  const data = Object.fromEntries(new FormData(form).entries());
  statusEl.textContent = 'Gönderiliyor…';
  statusEl.className = 'form-status';
  if (STATIC_MODE) {
    setTimeout(() => {
      statusEl.textContent = '✔ (Önizleme) Bağlantı kurulunca bu bilgi yönetim paneline iletilir.';
      statusEl.className = 'form-status ok';
      form.reset();
    }, 500);
    return;
  }
  try {
    await addDoc(collection(db, coll), { ...data, read: false, createdAt: serverTimestamp() });
    statusEl.textContent = okMsg;
    statusEl.className = 'form-status ok';
    form.reset();
  } catch (err) {
    statusEl.textContent = '⚠ Gönderilemedi, lütfen tekrar deneyin.';
    statusEl.className = 'form-status err';
    console.error(err);
  }
}

document.getElementById('contactForm').addEventListener('submit', e => {
  e.preventDefault();
  submitForm(e.target, 'messages', document.getElementById('contactStatus'), '✔ Mesajınız alındı, en kısa sürede dönüş yapacağız.');
});

document.getElementById('kesifForm').addEventListener('submit', e => {
  e.preventDefault();
  submitForm(e.target, 'appointments', document.getElementById('kesifStatus'), '✔ Randevu talebiniz alındı! Onay için sizi arayacağız.');
});

/* ── mobil menü ── */
const navLinks = document.getElementById('navLinks');
document.getElementById('navBurger').onclick = () => navLinks.classList.toggle('open');
navLinks.querySelectorAll('a').forEach(a => a.addEventListener('click', () => navLinks.classList.remove('open')));

document.getElementById('year').textContent = new Date().getFullYear();

loadSite();
window.addEventListener('resize', () => { if (carCards.length) positionCards(); });
