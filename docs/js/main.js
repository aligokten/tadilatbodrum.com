/* ═══ TadilatBodrum.com — ana sayfa ═══ */

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

const svgIcon = k => `<svg viewBox="0 0 24 24" fill="none" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${ICONS[k] || ICONS.tools}</svg>`;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/* Statik/önizleme yedeği: API'ye (Python sunucusu) ulaşılamazsa —
   örn. GitHub Pages gibi yalnızca statik barındırmada — site bu verilerle dolu görünür. */
const FALLBACK_SITE = {
  ticker: "🏗️ Bodrum ve Milas genelinde ücretsiz keşif! Hemen arayın: 0 541 348 88 33  •  Yaz sezonu öncesi tadilat randevularınızı bugünden planlayın.",
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
};

let SITE = { projects: [], services: [] };
let STATIC_MODE = false;   // API yoksa true → formlar demo modunda çalışır

/* ── veri yükle ── */
async function loadSite() {
  try {
    const res = await fetch('/api/site');
    if (!res.ok) throw new Error('api');
    SITE = await res.json();
  } catch {
    STATIC_MODE = true;
    SITE = FALLBACK_SITE;   // statik barındırma yedeği
  }

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
  const sg = document.getElementById('servicesGrid');
  sg.innerHTML = (SITE.services || []).map(s => `
    <div class="service-card glass reveal">
      <div class="service-icon">${svgIcon(s.icon)}</div>
      <h3>${esc(s.title)}</h3>
      <p>${esc(s.desc)}</p>
    </div>`).join('');

  // projeler
  const ps = document.getElementById('projSlider');
  ps.innerHTML = (SITE.projects || []).map((p, i) => `
    <article class="proj-card" data-idx="${i}" tabindex="0" role="button" aria-label="${esc(p.title)} detayları">
      <div class="proj-card-img"><img src="${esc((p.images && p.images[0]) || '')}" alt="${esc(p.title)}" loading="lazy"></div>
      <div class="proj-card-body"><span>${esc(p.location || '')}</span><h3>${esc(p.title)}</h3></div>
    </article>`).join('');

  ps.querySelectorAll('.proj-card').forEach(card => {
    const open = () => openProjModal(+card.dataset.idx);
    card.addEventListener('click', open);
    card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
  });

  observeReveals();
}

/* ── scroll reveal ── */
function observeReveals() {
  const io = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); io.unobserve(e.target); } });
  }, { threshold: 0.12 });
  document.querySelectorAll('.reveal:not(.visible)').forEach(el => io.observe(el));
}

/* ── proje slider okları ── */
const slider = document.getElementById('projSlider');
document.getElementById('projPrev').onclick = () => slider.scrollBy({ left: -410, behavior: 'smooth' });
document.getElementById('projNext').onclick = () => slider.scrollBy({ left: 410, behavior: 'smooth' });

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
  document.getElementById('modalLoc').textContent = '📍 ' + (curProj.location || '');
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
  }
});

/* ── formlar ── */
async function submitForm(form, url, statusEl, okMsg) {
  const data = Object.fromEntries(new FormData(form).entries());
  statusEl.textContent = 'Gönderiliyor…';
  statusEl.className = 'form-status';
  if (STATIC_MODE) {   // GitHub Pages önizlemesi: sunucu yok, demo yanıt ver
    setTimeout(() => {
      statusEl.textContent = '✔ (Önizleme) Canlı sitede bu bilgi yönetim paneline iletilir.';
      statusEl.className = 'form-status ok';
      form.reset();
    }, 500);
    return;
  }
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    const j = await res.json();
    if (!res.ok) throw new Error(j.error || 'Hata oluştu');
    statusEl.textContent = okMsg;
    statusEl.className = 'form-status ok';
    form.reset();
  } catch (err) {
    statusEl.textContent = '⚠ ' + err.message;
    statusEl.className = 'form-status err';
  }
}

document.getElementById('contactForm').addEventListener('submit', e => {
  e.preventDefault();
  submitForm(e.target, '/api/message', document.getElementById('contactStatus'), '✔ Mesajınız alındı, en kısa sürede dönüş yapacağız.');
});

document.getElementById('kesifForm').addEventListener('submit', e => {
  e.preventDefault();
  submitForm(e.target, '/api/appointment', document.getElementById('kesifStatus'), '✔ Randevu talebiniz alındı! Onay için sizi arayacağız.');
});

/* ── mobil menü ── */
const burger = document.getElementById('navBurger');
const navLinks = document.getElementById('navLinks');
burger.onclick = () => navLinks.classList.toggle('open');
navLinks.querySelectorAll('a').forEach(a => a.addEventListener('click', () => navLinks.classList.remove('open')));

document.getElementById('year').textContent = new Date().getFullYear();

loadSite();
