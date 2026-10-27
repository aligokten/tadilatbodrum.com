/* ═══ Kağıt formlar (A4): müşteri anket formu ve rölöve çizim altlığı ═══
   • Anket formu: uygulamadaki anketin tüm soruları, işaretlenecek kutular ve yazılacak çizgilerle (PDF / yazdır).
   • Çizim altlığı: 5 mm kare ızgaralı A4 sayfa — ızgara PDF'te vektör olduğundan yazıcıda tam ölçüde çıkar;
     üstte iş bilgisi, altta ölçek, kuzey oku, ölçü bilgileri ve sembol açıklaması; isteğe bağlı ölçü cetveli sayfası. */
import { esc, icon, $, $$, modal, toast, downloadBlob } from './ui.js';
import { CATEGORIES } from './catalog.js';
import { SURVEY } from './survey.js';
import { roomMetrics } from './plan-geom.js';

/* ───────────────────────── anket formu ───────────────────────── */
const WHEN = {
  banyoS: 'banyo yapılacaksa', mutfakS: 'mutfak yapılacaksa', yuzeyS: 'zemin, duvar, boya, alçıpan veya yıkım işi varsa',
  tesisatS: 'elektrik, tesisat veya iklimlendirme işi varsa', cepheS: 'dış cephe veya yalıtım işi varsa', disS: 'kapı, pencere, dış mekan veya yalıtım işi varsa',
};
const cb = r => `<i class="fm-cb${r ? ' r' : ''}"></i>`;
const opt = (t, r) => `<span class="fm-o">${cb(r)}${esc(t)}</span>`;
const inl = w => `<span class="fm-inl ${w || ''}"></span>`;

function qInput(q) {
  const r = q.type === 'single';
  switch (q.type) {
    case 'text': return `<span class="fm-line">${q.hint ? `<small>${esc(q.hint)}</small>` : ''}</span>`;
    case 'number': return `${inl('w60')} ${esc(q.unit || '')}`;
    case 'date': return `${inl('w30')} / ${inl('w30')} / ${inl('w50')}`;
    case 'textarea': return `<span class="fm-line">${q.hint ? `<small>${esc(q.hint)}</small>` : ''}</span>`.repeat(q.id === 'notlar' || q.id === 'sorunlar' ? 3 : 2);
    case 'yesno': return ['Evet', 'Hayır', 'Emin değil'].map(o => opt(o, true)).join('');
    case 'scale': return `<span class="fm-sc"><small>${esc(q.o[0])}</small>${[1, 2, 3, 4, 5].map(n => `<span class="fm-o">${cb(true)}${n}</span>`).join('')}<small>${esc(q.o[4])}</small></span>`;
    case 'single': case 'multi': return q.o.map(o => o === 'Diğer' ? `<span class="fm-o">${cb(r)}Diğer: ${inl('w60')}</span>` : opt(o, r)).join('') + (q.o.includes('Diğer') ? '' : `<span class="fm-o">${cb(r)}Diğer: ${inl('w60')}</span>`);
  }
  return '';
}

/* job verilirse müşteri bilgileri önceden yazılır; verilmezse boş form */
export function surveyFormHtml(job = null, { person = '' } = {}) {
  const c = job?.customer || {};
  const when = job?.kesifDate ? new Date(job.kesifDate.length > 10 ? job.kesifDate : job.kesifDate + 'T00:00') : null;
  const dt = when ? when.toLocaleDateString('tr-TR') + (job.kesifDate.length > 10 ? ' ' + when.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : '') : '';
  const f = (l, v, wide) => `<th>${l}</th><td${wide ? ' colspan="3"' : ''}><span class="fm-line">${v ? `<b class="fm-v">${esc(v)}</b>` : ''}</span></td>`;
  const head = `<section class="fm-sec"><h3>Müşteri ve keşif bilgileri</h3><table class="fm-t fm-cust"><tbody>
    <tr>${f('Ad soyad', c.name)}${f('Telefon', c.phone)}</tr>
    <tr>${f('Adres', [c.address, c.district].filter(Boolean).join(', '), true)}</tr>
    <tr>${f('Keşif tarihi / saati', dt)}${f('Keşfi yapan', person)}</tr>
    <tr>${f('İş kodu', job?.code || '')}${f('E-posta', c.email || '')}</tr></tbody></table></section>
    <p class="fm-note">${cb(true)} tek seçim &nbsp;·&nbsp; ${cb(false)} birden fazla seçim &nbsp;·&nbsp; çizgili alanları yazarak doldurun. "Hangi işler yapılacak?" sorusunda işaretlenen işlere göre ilgili detay bölümlerini doldurun; diğerlerini boş bırakın.</p>`;
  const secs = SURVEY.map(s => `<section class="fm-sec"><h3>${esc(s.t)}${WHEN[s.id] ? ` <small>— ${WHEN[s.id]}</small>` : ''}</h3>
    <table class="fm-t"><tbody>${s.q.map(q => `<tr><th>${esc(q.t)}${q.hint && q.type !== 'text' && q.type !== 'textarea' ? `<small>${esc(q.hint)}</small>` : ''}</th><td>${q.id === 'kapsam' ? CATEGORIES.map(k => opt(k.t, false)).join('') : qInput(q)}</td></tr>`).join('')}</tbody></table></section>`).join('');
  const sign = `<div class="p-sign fm-sign"><div>Keşfi yapan<span></span></div><div>Müşteri<span></span></div></div>
    <p class="fm-note">Bu form keşif görüşmesi notlarıdır; teklif değildir. Doldurulan bilgiler keşif sonrası uygulamadaki ankete işlenir.</p>`;
  return head + secs + sign;
}

/* ───────────────────────── çizim altlığı ───────────────────────── */
export const SKETCH_SCALES = [[10, '1 kare = 10 cm  (1:20)'], [25, '1 kare = 25 cm  (1:50)'], [50, '1 kare = 50 cm  (1:100)'], [0, 'Serbest — elle yazılır']];
const FONT = 'Inter, Arial, sans-serif';
const LOGO_H = 18;   // logo yüksekliği (mm)
const INK = '#16171A', MUTE = '#6A7380', LINE = '#B5BBC2', ORANGE = '#EB591F';

export function sketchGeom(land) {
  const [W, H] = land ? [297, 210] : [210, 297];
  const m = 8, headH = land ? 30 : 32, footH = land ? 36 : 40, gy = m + headH + 3;
  const gw = Math.floor((W - 20) / 5) * 5, gh = Math.floor((H - gy - footH - m - 3) / 5) * 5;
  return { W, H, m, headH, footH, gx: (W - gw) / 2, gy, gw, gh, fy: gy + gh + 3, bw: W - 2 * m };
}

/* tuval yardımcıları (mm → px) */
function pen(c, PX) {
  const M = v => v * PX;
  const fit = (s, size, w, maxW) => { let k = size; do { c.font = `${w} ${k * PX}px ${FONT}`; k -= 0.12; } while (maxW && c.measureText(s).width > maxW * PX && k > 1.4); };
  return {
    M,
    t(s, x, y, size, { w = 600, color = INK, align = 'left', max = 0 } = {}) { fit(s, size, w, max); c.fillStyle = color; c.textAlign = align; c.textBaseline = 'alphabetic'; c.fillText(s, M(x), M(y)); },
    ln(x1, y1, x2, y2, lw = 0.2, color = INK, dash) { c.beginPath(); c.setLineDash(dash ? dash.map(M) : []); c.lineWidth = Math.max(1, M(lw)); c.strokeStyle = color; c.moveTo(M(x1), M(y1)); c.lineTo(M(x2), M(y2)); c.stroke(); c.setLineDash([]); },
    box(x, y, w, h, lw = 0.25, color = INK, r = 0) { c.beginPath(); c.lineWidth = Math.max(1, M(lw)); c.strokeStyle = color; if (r) c.roundRect(M(x), M(y), M(w), M(h), M(r)); else c.rect(M(x), M(y), M(w), M(h)); c.stroke(); },
    fill(x, y, w, h, color) { c.fillStyle = color; c.fillRect(M(x), M(y), M(w), M(h)); },
    circ(x, y, r, lw = 0.25, fillc) { c.beginPath(); c.arc(M(x), M(y), M(r), 0, Math.PI * 2); if (fillc) { c.fillStyle = fillc; c.fill(); } else { c.lineWidth = Math.max(1, M(lw)); c.strokeStyle = INK; c.stroke(); } },
  };
}
const mkCanvas = (w, h, PX) => { const c = document.createElement('canvas'); c.width = Math.round(w * PX); c.height = Math.round(h * PX); return c; };

let logoImg;
const loadLogo = () => logoImg ||= new Promise(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = 'assets/logo.png'; });

/* üst bant: logo + başlık + alanlar */
function drawHeader(g, PX, info, logo) {
  const w = g.bw, h = g.headH, c = mkCanvas(w, h, PX), x = c.getContext('2d'), p = pen(x, PX);
  p.box(0.15, 0.15, w - 0.3, h - 0.3, 0.3, INK, 2.5);
  let lw = 0;
  if (logo) { lw = Math.min(56, LOGO_H * logo.width / logo.height); x.drawImage(logo, p.M(3), p.M(2.5), p.M(lw), p.M(lw * logo.height / logo.width)); }
  p.t('ROLÖVE ÇİZİM ALTLIĞI', 3, h - 4.2, 3.5, { w: 800 });
  p.t('ölçüler cm · duvarın iç yüzünden', 3, h - 1.1, 2, { w: 500, color: MUTE });
  const x0 = 72, cols = 3, cw = (w - x0 - 3) / cols, rh = (h - 4) / 2;
  const F = [['İş kodu', info.code], ['Müşteri', info.customer], ['Mahal / kat', info.room], ['Tarih', info.date], ['Ölçümü yapan', info.by], ['Sayfa', info.page]];
  F.forEach(([l, v], i) => {
    const cx = x0 + (i % cols) * cw, cy = 2 + Math.floor(i / cols) * rh;
    p.t(l, cx, cy + 3.2, 2.1, { w: 600, color: MUTE });
    if (v) p.t(v, cx + 0.5, cy + rh - 2.6, 3.4, { w: 800, max: cw - 4 });
    p.ln(cx, cy + rh - 1.6, cx + cw - 3, cy + rh - 1.6, 0.2, LINE);
  });
  return c;
}

/* alt bant: ölçek · kuzey · ölçü bilgileri · semboller */
function drawFooter(g, PX, o) {
  const w = g.bw, h = g.footH, c = mkCanvas(w, h, PX), x = c.getContext('2d'), p = pen(x, PX);
  const fr = [0.27, 0.1, 0.29, 0.34], xs = []; let a = 0;
  fr.forEach(f => { xs.push([a * w, f * w]); a += f; });
  p.box(0.15, 0.15, w - 0.3, h - 0.3, 0.3, INK, 2.5);
  xs.slice(1).forEach(([px]) => p.ln(px, 0.15, px, h - 0.15, 0.2, LINE));
  const title = (i, s) => p.t(s, xs[i][0] + 3, 5.2, 2.3, { w: 800, color: ORANGE });
  // 1 · ölçek
  title(0, 'ÖLÇEK');
  const [sx] = xs[0];
  if (o.scale) {
    p.t(`1 kare (5 mm) = ${o.scale} cm`, sx + 3, 12, 3.3, { w: 800, max: xs[0][1] - 5 });
    p.t(`≈ 1:${o.scale * 2}`, sx + 3, 16.5, 2.6, { w: 600, color: MUTE });
    const bx = sx + 3, by = 22;                                       // ölçek çubuğu: 4 kare
    for (let i = 0; i < 4; i++) { p.fill(bx + i * 5, by, 5, 2.2, i % 2 ? '#fff' : INK); }
    p.box(bx, by, 20, 2.2, 0.2, INK);
    p.t('0', bx, by + 5.6, 2, { w: 600, align: 'center' }); p.t(`${o.scale * 4} cm`, bx + 20, by + 5.6, 2, { w: 600, align: 'center' });
  } else {
    ['1:20', '1:50', '1:100'].forEach((s, i) => { p.box(sx + 3, 8 + i * 5.2, 3.2, 3.2, 0.3); p.t(s, sx + 8, 10.8 + i * 5.2, 2.6, { w: 700 }); });
    p.t('1 kare (5 mm) = ', sx + 3, 28, 2.6, { w: 600 }); p.ln(sx + 27, 28, sx + xs[0][1] - 11, 28, 0.25, INK); p.t('cm', sx + xs[0][1] - 9, 28, 2.6, { w: 600 });
  }
  p.t('Kare sayısı × değer = gerçek ölçü', sx + 3, h - 3, 1.9, { w: 500, color: MUTE, max: xs[0][1] - 5 });
  // 2 · kuzey oku
  title(1, 'KUZEY');
  const [nx, nw] = xs[1], cx = nx + nw / 2, cy = h / 2 + 3;
  p.circ(cx, cy, 8, 0.3);
  x.beginPath(); x.moveTo(p.M(cx), p.M(cy - 7)); x.lineTo(p.M(cx + 3), p.M(cy + 5)); x.lineTo(p.M(cx), p.M(cy + 2.6)); x.lineTo(p.M(cx - 3), p.M(cy + 5)); x.closePath(); x.fillStyle = INK; x.fill();
  p.t('K', cx, cy - 9.2, 2.6, { w: 800, align: 'center' });
  // 3 · ölçü bilgileri
  title(2, 'ÖLÇÜ BİLGİLERİ');
  const [dx, dw] = xs[2];
  ['Tavan yüksekliği', 'Duvar kalınlığı', 'Kapı yüksekliği', 'Denizlik yüksekliği'].forEach((s, i) => {
    const y = 12 + i * 6.4; p.t(s, dx + 3, y, 2.5, { w: 600 }); p.ln(dx + 3 + 30, y + 0.6, dx + dw - 10, y + 0.6, 0.2, LINE); p.t('cm', dx + dw - 8.5, y, 2.3, { w: 600, color: MUTE });
  });
  // 4 · semboller
  title(3, 'SEMBOLLER');
  const [sy, sw] = xs[3], S = [
    ['Kapı', (X, Y) => { p.ln(X, Y, X + 7, Y, 0.35); p.ln(X, Y, X, Y - 7, 0.25); x.beginPath(); x.lineWidth = p.M(0.2); x.strokeStyle = INK; x.arc(p.M(X), p.M(Y), p.M(7), -Math.PI / 2, 0); x.stroke(); }],
    ['Pencere', (X, Y) => { for (const d of [-1.4, 0, 1.4]) p.ln(X, Y + d - 1.4, X + 8, Y + d - 1.4, 0.25); }],
    ['Priz', (X, Y) => { p.circ(X + 3, Y - 2.5, 2.4, 0.3); p.ln(X + 3, Y - 4.9, X + 3, Y - 6.6, 0.3); p.ln(X + 1.7, Y - 2.5, X + 4.3, Y - 2.5, 0.25); }],
    ['Anahtar', (X, Y) => { p.circ(X + 3, Y - 2.5, 2.4, 0.3); p.circ(X + 3, Y - 2.5, 0.8, 0.3, INK); p.ln(X + 4.7, Y - 4.2, X + 6.6, Y - 6.2, 0.3); }],
    ['Su / gider', (X, Y) => { p.circ(X + 2, Y - 2.5, 2.2, 0.3); p.t('S', X + 2, Y - 1.6, 2.4, { w: 800, align: 'center' }); p.circ(X + 7, Y - 2.5, 2.2, 0.3); p.t('G', X + 7, Y - 1.6, 2.4, { w: 800, align: 'center' }); }],
    ['Pano / klima', (X, Y) => { p.box(X, Y - 5, 3.8, 5, 0.3); p.t('P', X + 1.9, Y - 1.2, 2.3, { w: 800, align: 'center' }); p.box(X + 5, Y - 4, 5, 3, 0.3); p.ln(X + 5.6, Y - 1.8, X + 9.4, Y - 1.8, 0.2); }],
  ];
  S.forEach(([n, d], i) => { const col = i % 2, row = Math.floor(i / 2), X = sy + 3 + col * (sw / 2 - 1), Y = 17 + row * 9.5; d(X, Y); p.t(n, X + (n === 'Su / gider' || n === 'Pano / klima' ? 11.5 : 9.5), Y - 1.6, 2.3, { w: 600, max: sw / 2 - 14 }); });
  return c;
}

/* ızgara: ctx (önizleme) ya da jsPDF (vektör) */
const gridLines = (g, type) => {
  const out = [];
  if (type === 'blank') return out;
  const nx = g.gw / 5, ny = g.gh / 5;
  if (type === 'dot') { for (let i = 0; i <= nx; i++) for (let j = 0; j <= ny; j++) out.push({ d: [g.gx + i * 5, g.gy + j * 5], big: i % 5 === 0 && j % 5 === 0 }); return out; }
  for (let i = 0; i <= nx; i++) out.push({ l: [g.gx + i * 5, g.gy, g.gx + i * 5, g.gy + g.gh], big: i % 5 === 0 });
  for (let j = 0; j <= ny; j++) out.push({ l: [g.gx, g.gy + j * 5, g.gx + g.gw, g.gy + j * 5], big: j % 5 === 0 });
  return out;
};

/* ölçü cetveli sayfası (tam sayfa tuval) */
function drawTable(W, H, PX, info, logo, rooms = []) {
  const c = mkCanvas(W, H, PX), x = c.getContext('2d'), p = pen(x, PX);
  x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
  const m = 10, bw = W - 2 * m;
  if (logo) { const lw = Math.min(56, LOGO_H * logo.width / logo.height); x.drawImage(logo, p.M(m), p.M(m - 1), p.M(lw), p.M(lw * logo.height / logo.width)); }
  p.t('ÖLÇÜ CETVELİ', W - m, m + 8, 5, { w: 900, align: 'right' });
  p.t([info.code, info.customer, info.date].filter(Boolean).join('  ·  ') || 'İş kodu / müşteri / tarih: ………………………………', W - m, m + 14, 2.6, { w: 600, color: MUTE, align: 'right', max: bw - 70 });
  p.ln(m, m + 21, W - m, m + 21, 0.5, INK);
  let y = m + 27;
  const table = (title, cols, rows, prefill = []) => {
    p.t(title, m, y, 3.3, { w: 800, color: ORANGE }); y += 2;
    const tw = cols.reduce((s, k) => s + k[1], 0), k = bw / tw, rh = 7.4;
    p.fill(m, y, bw, 6.4, INK);
    let cx = m; cols.forEach(([n, wd]) => { p.t(n, cx + 1.4, y + 4.4, 2.2, { w: 700, color: '#fff', max: wd * k - 2 }); cx += wd * k; });
    y += 6.4;
    rows.forEach((_, r) => {
      cx = m; cols.forEach(([n, wd], ci) => { p.box(cx, y, wd * k, rh, 0.15, LINE); if (ci === 0 && prefill[r]) p.t(prefill[r], cx + 1.4, y + rh - 2.2, 2.7, { w: 700, max: wd * k - 2 }); cx += wd * k; });
      y += rh;
    });
    y += 7;
  };
  const rn = Math.max(8, Math.min(12, rooms.length));
  table('1 · MAHAL ÖLÇÜLERİ', [['Mahal', 34], ['En', 14], ['Boy', 14], ['Tavan h.', 14], ['Alan m²', 14], ['Zemin / duvar', 26], ['Not', 34]], Array.from({ length: rn }), rooms.slice(0, rn));
  table('2 · KAPI / PENCERE', [['No', 8], ['Mahal', 26], ['Tür K/P/B', 14], ['Duvardan', 15], ['Genişlik', 14], ['Yükseklik', 15], ['Denizlik', 14], ['Açılım', 20], ['Not', 24]], Array.from({ length: 11 }));
  table('3 · ELEKTRİK / TESİSAT NOKTALARI', [['Mahal', 32], ['Priz', 12], ['Anahtar', 14], ['Aydınlatma', 18], ['Su', 10], ['Gider', 12], ['Klima', 12], ['Not', 40]], Array.from({ length: 5 }));
  p.t('NOTLAR', m, y, 3.3, { w: 800, color: ORANGE }); y += 3;
  for (; y < H - m - 6; y += 8) p.ln(m, y + 5, W - m, y + 5, 0.15, LINE);
  p.t('Ölçüler cm cinsindendir; kaba (duvar) ölçüsü yazın. Tüm ölçüler siparişten önce yerinde kontrol edilmelidir.', m, H - m + 1, 2, { w: 500, color: MUTE, max: bw });
  return c;
}

/* sayfa listesi: [{ room, page }] */
export function sketchPages(o) {
  const names = o.perRoom && o.rooms?.length ? o.rooms : null;
  const n = names ? names.length : Math.max(1, Math.min(8, +o.pages || 1));
  return Array.from({ length: n }, (_, i) => ({ room: names ? names[i] : '', page: `${i + 1} / ${n}` }));
}
const infoOf = (o, pg) => ({ code: o.job?.code || '', customer: o.job?.customer?.name || '', room: pg?.room || '', date: o.date || '', by: o.by || '', page: pg?.page || '' });

/* PDF (vektör ızgara + 200 dpi bantlar) */
export async function sketchPdf(o, onProgress) {
  const { jsPDF } = await jsPdfLib();
  const logo = await loadLogo();
  try { await document.fonts?.load('800 20px Inter'); } catch { /* yazı tipi yoksa Arial */ }
  const g = sketchGeom(o.land), pages = sketchPages(o), PX = 200 / 25.4;
  const pdf = new jsPDF({ orientation: o.land ? 'l' : 'p', unit: 'mm', format: 'a4', compress: true });
  const foot = drawFooter(g, PX, o).toDataURL('image/png');
  for (let i = 0; i < pages.length; i++) {
    if (i) pdf.addPage('a4', o.land ? 'l' : 'p');
    for (const e of gridLines(g, o.grid)) {
      if (e.l) { pdf.setLineWidth(e.big ? 0.22 : 0.1); pdf.setDrawColor(...(e.big ? [150, 158, 168] : [205, 210, 216])); pdf.line(...e.l); }
      else { pdf.setFillColor(...(e.big ? [90, 98, 108] : [150, 158, 168])); pdf.circle(e.d[0], e.d[1], e.big ? 0.34 : 0.2, 'F'); }
    }
    pdf.setLineWidth(0.4); pdf.setDrawColor(22, 23, 26); pdf.rect(g.gx, g.gy, g.gw, g.gh);
    pdf.addImage(drawHeader(g, PX, infoOf(o, pages[i]), logo).toDataURL('image/png'), 'PNG', g.m, g.m, g.bw, g.headH, undefined, 'FAST');
    pdf.addImage(foot, 'PNG', g.m, g.fy, g.bw, g.footH, undefined, 'FAST');
    onProgress?.((i + 1) / pages.length);
  }
  if (o.table) {
    pdf.addPage('a4', 'p');
    const t = drawTable(210, 297, 200 / 25.4, infoOf(o, null), logo, o.rooms || []);
    pdf.addImage(t.toDataURL('image/png'), 'PNG', 0, 0, 210, 297, undefined, 'FAST');
  }
  return pdf.output('blob');
}

/* önizleme: ilk sayfa, düşük çözünürlüklü tuval */
export async function sketchPreview(o) {
  const logo = await loadLogo(), g = sketchGeom(o.land), PX = 3.2, pg = sketchPages(o)[0];
  const c = mkCanvas(g.W, g.H, PX), x = c.getContext('2d'), p = pen(x, PX);
  x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
  for (const e of gridLines(g, o.grid)) {
    if (e.l) p.ln(...e.l, e.big ? 0.22 : 0.1, e.big ? '#969EA8' : '#CDD2D8');
    else p.circ(e.d[0], e.d[1], e.big ? 0.34 : 0.2, 0.1, e.big ? '#5A626C' : '#969EA8');
  }
  p.box(g.gx, g.gy, g.gw, g.gh, 0.4, INK);
  x.drawImage(drawHeader(g, PX, infoOf(o, pg), logo), p.M(g.m), p.M(g.m));
  x.drawImage(drawFooter(g, PX, o), p.M(g.m), p.M(g.fy));
  return c.toDataURL('image/png');
}

function loadScript(src) { return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error(src + ' yüklenemedi')); document.head.append(s); }); }
let jp = null;
const jsPdfLib = async () => { if (!window.jspdf) await (jp ||= loadScript('vendor/jspdf.umd.min.js').catch(e => { jp = null; throw e; })); return window.jspdf; };

/* seçenek penceresi → PDF indir */
export async function sketchDialog({ job = null, settings = {}, fname = 'rolove-altligi' } = {}) {
  const rooms = (job?.plan?.rooms || []).map(r => r.name).filter(Boolean);
  const o = { land: false, grid: 'sq', scale: 25, pages: 2, perRoom: false, table: true, job, writeJob: !!job, by: '', date: '', rooms };
  const roomArea = rooms.length ? job.plan.rooms.map(r => `${r.name} (${roomMetrics(job.plan, r).area.toLocaleString('tr-TR', { maximumFractionDigits: 1 })} m²)`) : [];
  const r = await modal({ title: 'Rölöve çizim altlığı (A4)', wide: true, body: `
    <p class="muted small">Tablet ya da bilgisayar olmadan, kağıt üzerinde çizip ölçü almak için ızgaralı A4 sayfa. Yazıcıda <b>"gerçek boyut / %100"</b> seçin (sığdırma kapalı) — kareler tam 5 mm çıkar.</p>
    <div class="grid2">
      <label>Yön<select class="inp" data-o="land"><option value="0">Dikey (A4)</option><option value="1">Yatay (A4)</option></select></label>
      <label>Izgara<select class="inp" data-o="grid"><option value="sq">Kare ızgara (5 mm)</option><option value="dot">Noktalı ızgara (5 mm)</option><option value="blank">Çizgisiz (yalnız çerçeve)</option></select></label>
      <label>Ölçek<select class="inp" data-o="scale">${SKETCH_SCALES.map(([v, t]) => `<option value="${v}" ${v === o.scale ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      <label>Sayfa adedi<input class="inp" type="number" min="1" max="8" value="${o.pages}" data-o="pages"></label>
      <label>Ölçümü yapan<input class="inp" data-o="by" placeholder="isteğe bağlı"></label>
      <label>Tarih<input class="inp" type="date" data-o="date"></label>
    </div>
    ${rooms.length ? `<label class="check"><input type="checkbox" data-o="perRoom"> Her mahal için ayrı sayfa <small>(${esc(roomArea.slice(0, 4).join(', '))}${rooms.length > 4 ? '…' : ''})</small></label>` : ''}
    ${job ? `<label class="check"><input type="checkbox" data-o="writeJob" checked> İş bilgilerini (kod, müşteri) sayfa başına yaz</label>` : ''}
    <label class="check"><input type="checkbox" data-o="table" checked> Ölçü cetveli sayfası ekle <small>(mahal, kapı / pencere, elektrik / tesisat tabloları)</small></label>
    <div class="sk-prev"></div>`,
    actions: [{ k: 'no', t: 'Vazgeç' }, { k: 'ok', t: 'PDF indir', cls: 'btn-primary', icon: 'download' }],
    onOpen: el => {
      const eff = () => ({ ...o, job: o.writeJob ? job : null, date: o.date ? new Date(o.date + 'T00:00').toLocaleDateString('tr-TR') : '' });
      let busy = 0;
      const upd = async () => {
        $$('[data-o]', el).forEach(i => { const k = i.dataset.o; o[k] = i.type === 'checkbox' ? i.checked : k === 'land' ? i.value === '1' : k === 'scale' || k === 'pages' ? +i.value : i.value; });
        $('[data-o="pages"]', el).disabled = !!(o.perRoom && rooms.length);
        const my = ++busy;
        try { const u = await sketchPreview(eff()); if (my === busy) $('.sk-prev', el).innerHTML = `<img src="${u}" alt="Önizleme" class="${o.land ? 'land' : ''}"><p class="muted small">${sketchPages(eff()).length} ızgara sayfası${o.table ? ' + 1 ölçü cetveli' : ''} · önizleme: ilk sayfa</p>`; }
        catch (e) { $('.sk-prev', el).textContent = e.message; }
      };
      el.addEventListener('input', upd); el.addEventListener('change', upd); upd();
      el._eff = eff;
    } });
  if (r?.k !== 'ok') return;
  const fin = { ...o, job: o.writeJob ? job : null, date: o.date ? new Date(o.date + 'T00:00').toLocaleDateString('tr-TR') : '' };
  toast('Altlık hazırlanıyor…');
  try {
    const blob = await sketchPdf(fin);
    downloadBlob(blob, `${fname}.pdf`);
    toast(`Çizim altlığı indirildi (${Math.round(blob.size / 1024)} KB)`);
  } catch (e) { console.error(e); toast('Altlık hazırlanamadı: ' + e.message, 'err'); }
}
