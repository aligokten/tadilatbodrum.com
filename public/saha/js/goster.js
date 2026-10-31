/* ═══ Müşteri görüntüleyici — 3D kuşbakışı + 2D plan (yalnızca okuma) ═══
 * Veri bağlantının # kısmında (share.js). Giriş, hesap ya da sunucu verisi gerekmez.
 */
import { decodeShare } from './share.js';
import { planThumbSvg } from './plan2d.js';
import { roomMetrics, planLevels } from './plan-geom.js';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fail = (t, d) => { $('#p3').innerHTML = `<div class="msg"><b>${esc(t)}</b><p>${esc(d)}</p></div>`; $('.tabs').hidden = true; $('#tools3').hidden = true; $('#hint').hidden = true; };

/* kısa bağlantı (/p/KİMLİK): veri Firestore'dan REST ile okunur (SDK yüklenmez; kural: yalnızca tekil okuma serbest)
 * uzun bağlantı (#…): veri bağlantının içinde */
async function loadShort(id) {
  const { firebaseConfig: c, SITE_ID } = await import('/js/firebase-config.js');
  const r = await fetch(`https://firestore.googleapis.com/v1/projects/${c.projectId}/databases/(default)/documents/sites/${SITE_ID}/shares/${encodeURIComponent(id)}?key=${c.apiKey}`);
  if (r.status === 404 || r.status === 403) throw Object.assign(new Error('gone'), { gone: true });
  if (!r.ok) throw new Error('http ' + r.status);
  return (await r.json()).fields?.d?.stringValue;
}
let data;
try {
  const sid = (location.pathname.match(/\/p\/([A-Za-z0-9]{6,20})\/?$/) || [])[1];
  const h = sid ? await loadShort(sid) : location.hash.slice(1);
  if (!h) throw new Error('empty');
  data = await decodeShare(h);
  if (!data?.p?.walls) throw new Error('bad');
} catch (e) {
  if (e.gone) fail('Bu bağlantı artık geçerli değil', 'Bağlantı kaldırılmış olabilir. Güncel bağlantı için bizimle iletişime geçin.');
  else if (e instanceof TypeError) fail('Bağlantı açılamadı', 'İnternet bağlantınızı kontrol edip sayfayı yenileyin.');
  else fail('Bağlantı açılamadı', 'Bağlantı eksik ya da bozuk görünüyor. Lütfen size gönderilen bağlantının tamamını açın.');
  throw e;
}
const plan = data.p;
const prep = P => { for (const k of ['walls', 'openings', 'rooms', 'items', 'dims', 'labels', 'rails', 'roofs', 'stairs']) P[k] ||= []; return P; };
prep(plan); (plan.levels || []).forEach(prep);

/* katlar: kontrol panelinden seçilir; 2D'de o katın planı, 3D'de o kat (kesitli) ya da tüm bina */
const LV = planLevels(plan), multi = LV.length > 1;
let lvSel = 0;   // LV sırası; -1: tüm bina (yalnız 3D)
const curPlan = () => { const L = LV[Math.max(0, lvSel)]; return L.idx ? { ...L.plan, meta: { ...plan.meta, ...(L.plan.meta || {}) } } : plan; };
function lvPanel() {
  if (!multi) return;
  const box = $('#lvp'), v3 = !$('#p3').hidden;
  if (!v3 && lvSel < 0) lvSel = 0;
  box.hidden = false;
  box.innerHTML = `<small>Katlar</small>${v3 ? `<button data-l="-1" class="${lvSel < 0 ? 'on' : ''}">Tüm bina</button>` : ''}${LV.slice().reverse().map(L => `<button data-l="${L.idx}" class="${lvSel === L.idx ? 'on' : ''}">${esc(L.name)}</button>`).join('')}`;
}
function setLevel(i) {
  lvSel = i; lvPanel();
  if (built2d) { built2d = false; z = { s: 1, x: 0, y: 0 }; if (!$('#p2').hidden) build2d(); }
  if (p3) { p3.opt.level = i < 0 ? LV.length - 1 : i; p3.set('cut', i >= 0); $('[data-c="cut"]')?.classList.toggle('on', i >= 0); frame(); }
  const nm = i < 0 ? 'Tüm bina' : LV[i].name; $('#hint').textContent = nm; $('#hint').style.opacity = 1; clearTimeout(show.tm); show.tm = setTimeout(() => { $('#hint').style.opacity = 0; }, 2500);
}
document.title = `${data.t || 'Projeniz'} — TadilatBodrum.com`;
$('#t').textContent = data.t || 'Projeniz';
$('#st').textContent = data.s || '';

// iletişim
const co = data.co || {}, digits = s => String(s || '').replace(/\D/g, '').replace(/^0/, '90');
if (co.wa || co.phone) {
  const f = $('#foot'); f.hidden = false;
  const msg = encodeURIComponent(`Merhaba, "${data.t || 'projem'}" çizimini inceledim.`);
  f.innerHTML = `${co.wa || co.phone ? `<a class="wa" href="https://wa.me/${digits(co.wa || co.phone)}?text=${msg}" target="_blank" rel="noopener"><svg viewBox="0 0 24 24"><path d="M21 12a9 9 0 0 1-13.4 7.8L3 21l1.2-4.5A9 9 0 1 1 21 12z"/></svg>WhatsApp'tan yaz</a>` : ''}
    ${co.phone ? `<a class="tel" href="tel:${esc(co.phone.replace(/\s/g, ''))}"><svg viewBox="0 0 24 24"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/></svg>Ara</a>` : ''}`;
}

/* dikey telefon ekranında modeli kadraja yaklaştır */
function frame() {
  p3.frame();
  const k = p3.camera.aspect < 1 ? 0.78 : 0.9, c = p3.camera, t = p3.controls.target;
  c.position.sub(t).multiplyScalar(k).add(t); p3.controls.update(); p3.dirty = true;
}

/* ── 3D: yalnızca kuşbakışı / üstten (iç mekan ve render yok) ── */
let p3 = null;
async function start3d() {
  try {
    const { Plan3D } = await import('./plan3d.js');
    const host = $('#p3');
    p3 = new Plan3D(host);
    await p3.init();
    host.querySelector('.msg')?.remove();
    if (multi) { p3.opt.level = Math.max(0, lvSel); p3.opt.cut = lvSel >= 0; }
    p3.setPlan(plan); frame();
    if (!host.hidden) $('#tools3').hidden = false;
  } catch (e) {
    fail('3D görünüm açılamadı', 'Cihazınız 3D grafikleri desteklemiyor olabilir. 2D planı inceleyebilirsiniz.');
    $('.tabs').hidden = false; show('2d');
  }
}
$('#tools3').onclick = e => {
  const b = e.target.closest('[data-c]'); if (!b || !p3) return;
  const c = b.dataset.c;
  if (c === 'frame') frame();
  else if (c === 'top') p3.top();
  else if (c === 'cut') { p3.set('cut', !p3.opt.cut); b.classList.toggle('on', p3.opt.cut); }
};

/* ── 2D: ölçülü plan, sürükle / iki parmakla yakınlaştır ── */
let z = { s: 1, x: 0, y: 0 }, built2d = false;
function build2d() {
  const host = $('#p2'), W = host.clientWidth || 360, H = host.clientHeight || 560;
  const plan = curPlan();
  host.innerHTML = `<div class="svgw">${planThumbSvg(plan, W * 2, H * 2, true, true).replace(/width="\d+" height="\d+"/, 'width="100%" height="100%"')}</div>`;
  const rooms = plan.rooms.map(r => ({ n: r.name, a: roomMetrics(plan, r).area })).filter(r => r.a > 0);
  if (rooms.length) {
    const tot = rooms.reduce((s, r) => s + r.a, 0), f = v => v.toLocaleString('tr-TR', { maximumFractionDigits: 1 });
    host.insertAdjacentHTML('beforeend', `<div class="legend">${rooms.slice(0, 8).map(r => `<div><span>${esc(r.n)}</span><b>${f(r.a)} m²</b></div>`).join('')}${rooms.length > 1 ? `<div class="tot"><span>Toplam</span><b>${f(tot)} m²</b></div>` : ''}</div>`);
  }
  built2d = true; apply();
}
const apply = () => { const w = $('#p2 .svgw'); if (w) w.style.transform = `translate(${z.x}px,${z.y}px) scale(${z.s})`; };
const zoomAt = (k, cx, cy) => { const s = Math.min(8, Math.max(0.6, z.s * k)); k = s / z.s; z.x = cx - (cx - z.x) * k; z.y = cy - (cy - z.y) * k; z.s = s; apply(); };
{
  const host = $('#p2'), pts = new Map(); let last = null;
  host.addEventListener('pointerdown', e => { host.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); last = null; });
  host.addEventListener('pointermove', e => {
    if (!pts.has(e.pointerId)) return;
    const prev = pts.get(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const r = host.getBoundingClientRect();
    if (pts.size === 1) { z.x += e.clientX - prev.x; z.y += e.clientY - prev.y; apply(); }
    else if (pts.size === 2) {
      const [a, b] = [...pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y), c = { x: (a.x + b.x) / 2 - r.left, y: (a.y + b.y) / 2 - r.top };
      if (last) { zoomAt(d / last.d, c.x, c.y); z.x += c.x - last.c.x; z.y += c.y - last.c.y; apply(); }
      last = { d, c };
    }
  });
  const up = e => { pts.delete(e.pointerId); last = null; };
  host.addEventListener('pointerup', up); host.addEventListener('pointercancel', up);
  host.addEventListener('wheel', e => { e.preventDefault(); const r = host.getBoundingClientRect(); zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX - r.left, e.clientY - r.top); }, { passive: false });
  $('#tools2').onclick = () => { z = { s: 1, x: 0, y: 0 }; apply(); };
}

/* ── sekmeler ── */
function show(v) {
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
  $('#p3').hidden = v !== '3d'; $('#tools3').hidden = v !== '3d' || !p3;
  $('#p2').hidden = v !== '2d'; $('#tools2').hidden = v !== '2d';
  $('#hint').textContent = v === '3d' ? 'Döndürmek için sürükleyin · iki parmakla yakınlaştırın' : 'Kaydırmak için sürükleyin · iki parmakla yakınlaştırın';
  $('#hint').style.opacity = 1; clearTimeout(show.tm); show.tm = setTimeout(() => { $('#hint').style.opacity = 0; }, 3500);
  if (v === '2d' && !built2d) build2d();
  lvPanel();
  if (v === '3d') p3?.resize();
}
document.querySelector('.tabs').onclick = e => { const b = e.target.closest('[data-v]'); if (b) show(b.dataset.v); };
$('#lvp').onclick = e => { const b = e.target.closest('[data-l]'); if (b) setLevel(+b.dataset.l); };
show(data.v2 === '2d' ? '2d' : '3d');
start3d();
