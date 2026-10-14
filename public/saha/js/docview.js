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
    p.innerHTML = html;
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
      pdfFile = new File([await buildPdf(html, p => { $('span', status).textContent = `PDF hazırlanıyor… ${Math.round(p * 100)}%`; })], fileName(title), { type: 'application/pdf' });
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

const canShare = f => !!(navigator.canShare && navigator.canShare({ files: [f] }));
async function sharePdf(file, quiet = false) {
  if (canShare(file)) {
    try { await navigator.share({ files: [file], title: file.name }); return; }
    catch (e) { if (e.name === 'AbortError') return; if (quiet) return; }
  }
  if (!quiet || !canShare(file)) downloadBlob(file, file.name);
}

/* belgeyi A4 genişliğinde ekran dışında çiz, sayfalara böl, PDF üret */
async function buildPdf(html, onProgress) {
  const { html2canvas, jsPDF } = await loadLibs();
  const host = h(`<div class="pdf-render"><div class="pdoc-wrap">${html}</div></div>`);
  document.body.append(host);
  try {
    const el = $('.pdoc-wrap', host);
    // bulut fotoğraflarını yerel blob'a çevir (başka alan adındaki görseller tuvali kirletmesin)
    await Promise.all($$('img', el).map(async img => {
      const src = img.getAttribute('src') || '';
      if (!/^https?:/.test(src) || new URL(src, location.href).origin === location.origin) return;
      try { const r = await fetch(src, { mode: 'cors' }); if (r.ok) img.src = URL.createObjectURL(await r.blob()); } catch { /* CORS kapalıysa görsel PDF'te boş kalır */ }
    }));
    await waitImages(el);
    if (document.fonts?.ready) await document.fonts.ready;
    onProgress?.(0.1);
    // sayfa sonlarını bölünmemesi gereken blokların arasına yerleştir
    const top0 = el.getBoundingClientRect().top;
    const blocks = $$('tr, figure, li, p, h1, h2, h3, h4, .p-find, .p-room h4, .p-sign, .p-foot, .p-totals, .p-cust, .p-title, .p-head, .tline, .p-plan, .p-imgs, .p-grid', el)
      .map(b => { const r = b.getBoundingClientRect(); return { t: r.top - top0, b: r.bottom - top0 }; });
    const total = el.scrollHeight;
    const cuts = [0];
    while (cuts.at(-1) + PAGE_H < total) {
      const start = cuts.at(-1), limit = start + PAGE_H;
      // limit'i kesen bir blok varsa, o bloğun üstünden kes
      const crossing = blocks.filter(x => x.t < limit && x.b > limit && x.t > start + PAGE_H * 0.35);
      const cut = crossing.length ? Math.min(...crossing.map(x => x.t)) - 4 : limit;
      cuts.push(Math.max(start + 50, Math.floor(cut)));
    }
    cuts.push(total);
    const scale = Math.min(2, Math.max(1.5, devicePixelRatio || 1));
    const canvas = await html2canvas(el, { scale, useCORS: true, backgroundColor: '#ffffff', logging: false, windowWidth: A4_W, width: A4_W, height: total });
    onProgress?.(0.7);
    const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4', compress: true });
    const mmPerPx = (210 - 2 * MARGIN_MM) / A4_W;
    for (let i = 0; i < cuts.length - 1; i++) {
      const y0 = cuts[i], hh = cuts[i + 1] - y0;
      const pc = document.createElement('canvas');
      pc.width = canvas.width; pc.height = Math.ceil(hh * scale);
      const ctx = pc.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, pc.width, pc.height);
      ctx.drawImage(canvas, 0, Math.floor(y0 * scale), canvas.width, pc.height, 0, 0, pc.width, pc.height);
      if (i) pdf.addPage();
      pdf.addImage(pc.toDataURL('image/jpeg', 0.9), 'JPEG', MARGIN_MM, MARGIN_MM, 210 - 2 * MARGIN_MM, hh * mmPerPx, undefined, 'FAST');
      pdf.setFontSize(8); pdf.setTextColor(140);
      pdf.text(`${i + 1} / ${cuts.length - 1}`, 210 - MARGIN_MM, 297 - 4, { align: 'right' });
      onProgress?.(0.7 + 0.3 * (i + 1) / (cuts.length - 1));
    }
    return pdf.output('blob');
  } finally { host.remove(); }
}
