/* ═══ Yatay kaydırma: sekme / araç çubukları masaüstünde fare tekeri, sürükleme ve oklarla kaydırılır ═══
 * Dokunmatikte zaten parmakla kayar; burada fare / dokunmatik yüzey için tamamlanır.
 * HS: yatay kayan şeritler. Taşma varsa şeridin kenarında ‹ › düğmeleri (data-hs-arrows olan sarmalayıcıda). */
const HS = '.tabs, .chips.scroll, .stepper, .p3-bar, .pe-bar, .pe-tools, .ex-tabs';

const over = el => el.scrollWidth > el.clientWidth + 2;
const stripOf = t => t?.closest?.(HS);

/* fare tekeri: dikey tekeri yatay kaydırmaya çevir (şerit taşıyorsa ve uca gelinmediyse) */
function onWheel(e) {
  const el = stripOf(e.target); if (!el || !over(el) || e.ctrlKey) return;
  if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;   // dokunmatik yüzeyde yatay kaydırma zaten çalışır
  const max = el.scrollWidth - el.clientWidth, d = e.deltaY * (e.deltaMode === 1 ? 32 : 1);
  if ((d < 0 && el.scrollLeft <= 0) || (d > 0 && el.scrollLeft >= max - 1)) return;   // uçta sayfa kaysın
  el.scrollLeft += d; e.preventDefault();
}

/* fareyle sürükleyerek kaydırma; sürükleme olduysa ardından gelen tıklama yutulur */
let drag = null;
function onDown(e) {
  if (e.pointerType !== 'mouse' || e.button !== 0) return;
  const el = stripOf(e.target); if (!el || !over(el)) return;
  if (e.target.closest('input, select, textarea, [contenteditable]')) return;
  drag = { el, x: e.clientX, s: el.scrollLeft, moved: false };
}
function onMove(e) {
  if (!drag) return;
  const dx = e.clientX - drag.x;
  if (!drag.moved && Math.abs(dx) < 6) return;
  drag.moved = true; drag.el.classList.add('hs-drag');
  drag.el.scrollLeft = drag.s - dx;
}
function onUp() {
  if (!drag) return;
  const d = drag; drag = null; d.el.classList.remove('hs-drag');
  if (d.moved) addEventListener('click', ev => { ev.preventDefault(); ev.stopPropagation(); }, { capture: true, once: true });
}

/* ok düğmeleri: [data-hs-arrows] sarmalayıcı içindeki şerit için */
function syncArrows(wrap) {
  const el = wrap.querySelector(HS); if (!el) return;
  const max = el.scrollWidth - el.clientWidth;
  wrap.classList.toggle('hs-l', max > 2 && el.scrollLeft > 2);
  wrap.classList.toggle('hs-r', max > 2 && el.scrollLeft < max - 2);
}
export function hsArrows(wrap) {
  if (!wrap || wrap._hs) return; wrap._hs = true;
  const el = wrap.querySelector(HS); if (!el) return;
  for (const [k, sym, lbl] of [['l', '‹', 'Sola kaydır'], ['r', '›', 'Sağa kaydır']]) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'hs-btn ' + k; b.textContent = sym; b.setAttribute('aria-label', lbl); b.tabIndex = -1;
    b.onclick = () => el.scrollBy({ left: (k === 'l' ? -1 : 1) * Math.max(160, el.clientWidth * 0.7), behavior: 'smooth' });
    wrap.appendChild(b);
  }
  el.addEventListener('scroll', () => syncArrows(wrap), { passive: true });
  new ResizeObserver(() => syncArrows(wrap)).observe(el);
  syncArrows(wrap);
}

let inited = false;
export function initHScroll() {
  if (inited) return; inited = true;
  addEventListener('wheel', onWheel, { passive: false });
  addEventListener('pointerdown', onDown);
  addEventListener('dragstart', e => { if (stripOf(e.target)) e.preventDefault(); });   // bağlantı sürüklenmesin
  addEventListener('pointermove', onMove);
  addEventListener('pointerup', onUp);
  addEventListener('pointercancel', onUp);
  addEventListener('resize', () => document.querySelectorAll('[data-hs-arrows]').forEach(syncArrows));
}
