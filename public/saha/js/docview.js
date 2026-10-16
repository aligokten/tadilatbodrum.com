/* ═══ Belge önizleme: Yazdır + PDF oluştur / paylaş ═══
 * Mobilde window.print() güvenilir değil (iOS ana ekran uygulamasında hiç çalışmayabilir,
 * kullanıcı dokunuşundan sonra gecikmeli çağrılınca tarayıcı engeller). Bu yüzden belge önce
 * ekranda önizlenir; "Yazdır" doğrudan dokunuşla çağrılır, "PDF" ise cihazda üretilip
 * paylaşılır/indirilir (html2canvas + jsPDF, vendor/ altında, yalnızca gerektiğinde yüklenir).
 */
import { icon, esc, h, $, $$, toast, downloadBlob } from './ui.js';

const A4_W = 794;                 // px (96 dpi'de 210 mm)
const MARGIN_MM = 10;
const PAGE_H = Math.round(A4_W * (297 - 2 * MARGIN_MM) / (210 - 2 * MARGIN_MM)); // sayfa başına içerik yüksekliği (px)

let libs = null;
function loadScript(src) {
  return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error(src + ' yüklenemedi')); document.head.append(s); });
}
async function loadLibs() {
  if (!libs) libs = Promise.all([
    window.html2canvas ? 0 : loadScript('vendor/html2canvas.min.js'),
    window.jspdf ? 0 : loadScript('vendor/jspdf.umd.min.js'),
  ]).catch(e => { libs = null; throw e; });
  await libs;
  return { html2canvas: window.html2canvas, jsPDF: window.jspdf.jsPDF };
}

const waitImages = root => Promise.all($$('img', root).map(i => i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; })));
const fileName = t => (t || 'belge').replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim() + '.pdf';

export function openDocument(html, title = 'TadilatBodrum') {
  const ov = h(`<div class="docview" role="dialog" aria-modal="true">
    <header class="dv-bar">
      <button class="icon-btn" data-x aria-label="Kapat">${icon('x')}</button>
      <b class="dv-t">${esc(title)}</b>
      <div class="dv-act">
        <button class="btn btn-ghost btn-sm" data-print>${icon('print')}<span>Yazdır</span></button>
        <button class="btn btn-primary btn-sm" data-pdf>${icon('download')}<span>PDF oluştur</span></button>
      </div>
    </header>
    <div class="dv-status" hidden></div>
    <div class="dv-scroll"><div class="dv-page">${html}</div></div>
  </div>`);
  document.body.append(ov);
  document.body.classList.add('dv-open');
  const page = $('.dv-page', ov), status = $('.dv-status', ov);
  const fit = () => { page.style.zoom = Math.min(1, (ov.clientWidth - 24) / A4_W); };
  fit(); addEventListener('resize', fit);
  const close = () => { ov.remove(); document.body.classList.remove('dv-open'); removeEventListener('resize', fit); document.removeEventListener('keydown', onKey); };
  const onKey = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  $('[data-x]', ov).onclick = close;

  // Yazdır: dokunuşun içinde, eşzamanlı çağrı (mobil tarayıcılar ancak böyle izin verir)
  $('[data-print]', ov).onclick = () => {
    let p = $('#printArea');
    if (!p) { p = h('<div id="printArea"></div>'); document.body.append(p); }
    p.innerHTML = printHtml(html);
    const old = document.title; document.title = title;
    try { window.print(); } catch { toast('Bu cihaz yazdırmayı desteklemiyor — "PDF oluştur" kullanın', 'err'); }
    setTimeout(() => { document.title = old; }, 1000);
  };

  let pdfFile = null;
  $('[data-pdf]', ov).onclick = async () => {
    const btn = $('[data-pdf]', ov);
    if (pdfFile) return sharePdf(pdfFile);
    btn.disabled = true;
    status.hidden = false; status.innerHTML = `<div class="spin sm"></div><span>PDF hazırlanıyor…</span>`;
    try {
      pdfFile = new File([await buildPdf(html, title, p => { $('span', status).textContent = `PDF hazırlanıyor… ${Math.round(p * 100)}%`; })], fileName(title), { type: 'application/pdf' });
      status.innerHTML = `${icon('check')}<span>PDF hazır (${Math.max(1, Math.round(pdfFile.size / 1024))} KB)</span>
        <button class="btn btn-primary btn-xs" data-share>${icon('share')}Paylaş</button>
        <button class="btn btn-ghost btn-xs" data-dl>${icon('download')}İndir</button>`;
      $('[data-share]', status).hidden = !canShare(pdfFile);
      $('[data-share]', status).onclick = () => sharePdf(pdfFile);
      $('[data-dl]', status).onclick = () => downloadBlob(pdfFile, pdfFile.name);
      btn.innerHTML = `${icon('share')}<span>PDF'i paylaş</span>`;
      // dokunuş hâlâ geçerliyse doğrudan paylaşım/indirme penceresini aç
      sharePdf(pdfFile, true);
    } catch (e) {
      console.error(e);
      status.innerHTML = `${icon('alert')}<span>PDF oluşturulamadı: ${esc(e.message)}</span>`;
    } finally { btn.disabled = false; }
  };
  return { close };
}

/* yazdırma: alt bilgiyi tablonun tfoot'una koy — tarayıcı her sayfanın altında tekrarlar */
function printHtml(html) {
  const t = document.createElement('template'); t.innerHTML = html;
  const doc = t.content.firstElementChild, foot = doc?.querySelector(':scope > .p-foot');
  if (!foot) return html;
  foot.remove();
  return `<table class="pr-wrap"><tbody><tr><td>${doc.outerHTML}</td></tr></tbody><tfoot><tr><td>${foot.outerHTML}</td></tr></tfoot></table>`;
}

const canShare = f => !!(navigator.canShare && navigator.canShare({ files: [f] }));
async function sharePdf(file, quiet = false) {
  if (canShare(file)) {
    try { await navigator.share({ files: [file], title: file.name }); return; }
    catch (e) { if (e.name === 'AbortError') return; if (quiet) return; }
  }
  if (!quiet || !canShare(file)) downloadBlob(file, file.name);
}

/* ── sayfalama ──
 * Belge resim olarak dilimlenmez; içerik gerçek A4 sayfalarına yerleştirilir. Böylece hiçbir satır,
 * tablo satırı, fotoğraf ya da kutu iki sayfaya bölünmez; başlıklar sayfa sonunda yalnız kalmaz
 * (bir sonraki içerikle birlikte yeni sayfaya geçer); alt bilgi ve sayfa numarası her sayfada yer alır.
 */
const SPLIT = 'div.pdoc, section, table, tbody, ul, ol, .p-grid, .p-imgs, .p-find, .p-room, .p-notes';   // gerekirse bölünebilen kaplar
const KEEP = 'tr, li, p, figure, img, h1, h2, h3, h4, .p-head, .p-title, .p-cust, .p-sign, .p-totals, .p-plan, .p-iban, .p-intro'; // asla bölünmeyenler
const isHeading = el => el.matches('h1, h2, h3, h4, thead');

function shallowClone(src) {
  const c = src.cloneNode(false);
  if (src.tagName === 'TABLE') { const th = [...src.children].find(x => x.tagName === 'THEAD'); if (th) c.append(th.cloneNode(true)); }  // tablo başlığı her sayfada tekrar
  c.dataset.pgShell = '1';
  return c;
}

function paginate(src, makePage) {
  const pages = [];
  let page, map;            // map: kaynak kap → bu sayfadaki kopyası
  let placed = [];          // bu sayfaya yerleştirilen atomlar [{clone, src}]
  const open = chain => {
    page = makePage(); pages.push(page); map = new Map(); placed = [];
    let parent = page.body;
    for (const el of chain) { const c = shallowClone(el); parent.append(c); map.set(el, c); parent = c; }
  };
  const fits = () => page.body.scrollHeight <= page.body.clientHeight + 1;
  const prune = root => {   // içerik almamış boş kapları sil
    for (const c of [...root.querySelectorAll('[data-pg-shell]')].reverse()) {
      const real = [...c.childNodes].some(n => n.nodeType === 1 ? n.tagName !== 'THEAD' : n.textContent.trim());
      if (!real) c.remove();
    }
  };
  const nextPage = chain => {
    // sayfa sonunda yalnız kalan başlıkları yeni sayfaya taşı
    const carry = [];
    while (placed.length > 1 && isHeading(placed.at(-1).src)) carry.unshift(placed.pop());
    carry.forEach(a => a.clone.remove());
    prune(page.body);
    open(chain);
    for (const a of carry) {   // yeni sayfada kendi kabının en başına (ör. tablodan önce)
      const par = map.get(a.src.parentElement) || page.body;
      par.insertBefore(a.clone, [...par.childNodes].find(n => !carry.some(x => x.clone === n)) || null);
      placed.push(a);
    }
  };
  const place = (el, chain) => {
    if (el.classList?.contains('p-break') && placed.length) nextPage(chain);
    const target = () => map.get(el.parentElement) || page.body;
    const c = el.cloneNode(true);
    target().append(c);
    if (fits()) { placed.push({ clone: c, src: el }); return; }
    c.remove();
    const splittable = el.matches(SPLIT) && !el.matches(KEEP) && el.children.length > 0;
    if (splittable) {
      const sc = shallowClone(el); target().append(sc); map.set(el, sc);
      const sub = [...chain, el];
      for (const k of el.children) { if (k.tagName === 'THEAD') continue; place(k, sub); }
      return;
    }
    if (placed.length) nextPage(chain);
    const c2 = el.cloneNode(true); target().append(c2); placed.push({ clone: c2, src: el });   // boş sayfaya da sığmıyorsa olduğu gibi kalır
  };
  open([]);
  for (const k of src.children) place(k, []);
  prune(page.body);
  return pages;
}

/* belgeyi A4 sayfalarına yerleştir, her sayfayı çiz, PDF üret */
export async function buildPdf(html, title, onProgress) {
  const { html2canvas, jsPDF } = await loadLibs();
  const host = h(`<div class="pdf-render"><div class="pdoc-wrap">${html}</div><div class="pdf-pages"></div></div>`);
  document.body.append(host);
  try {
    const el = $('.pdoc-wrap', host), out = $('.pdf-pages', host);
    // bulut fotoğraflarını yerel blob'a çevir (başka alan adındaki görseller tuvali kirletmesin)
    await Promise.all($$('img', el).map(async img => {
      const src = img.getAttribute('src') || '';
      if (!/^https?:/.test(src) || new URL(src, location.href).origin === location.origin) return;
      try { const r = await fetch(src, { mode: 'cors' }); if (r.ok) img.src = URL.createObjectURL(await r.blob()); } catch { /* CORS kapalıysa görsel PDF'te boş kalır */ }
    }));
    await waitImages(el);
    // kopyalar ölçülürken görseller henüz yüklenmemiş olsa da doğru yer kaplasın
    $$('img', el).forEach(i => { if (i.naturalWidth) { i.setAttribute('width', i.naturalWidth); i.setAttribute('height', i.naturalHeight); } });
    if (document.fonts?.ready) await document.fonts.ready;
    onProgress?.(0.1);

    const doc = el.firstElementChild?.matches('.pdoc') ? el.firstElementChild : el;
    const foot = $(':scope > .p-foot', doc);
    foot?.remove();
    const footHtml = foot ? foot.outerHTML : '';
    const makePage = () => {
      const pg = h(`<div class="pdf-page" style="height:${PAGE_H}px"><div class="pdoc pdf-body"></div><div class="pdoc pdf-foot">${footHtml}<div class="pdf-num"><span>${esc(title)}</span><b></b></div></div></div>`);
      out.append(pg);
      return { el: pg, body: $('.pdf-body', pg) };
    };
    const pages = paginate(doc, makePage);
    el.remove();
    pages.forEach((p, i) => { $('.pdf-num b', p.el).textContent = `${i + 1} / ${pages.length}`; });
    await waitImages(out);
    onProgress?.(0.2);

    const scale = Math.min(2, Math.max(1.5, devicePixelRatio || 1));
    const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4', compress: true });
    for (let i = 0; i < pages.length; i++) {
      const canvas = await html2canvas(pages[i].el, { scale, useCORS: true, backgroundColor: '#ffffff', logging: false, windowWidth: A4_W, width: A4_W, height: PAGE_H });
      if (i) pdf.addPage();
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.9), 'JPEG', MARGIN_MM, MARGIN_MM, 210 - 2 * MARGIN_MM, 297 - 2 * MARGIN_MM, undefined, 'FAST');
      onProgress?.(0.2 + 0.8 * (i + 1) / pages.length);
    }
    return pdf.output('blob');
  } finally { host.remove(); }
}
