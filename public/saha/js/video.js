/* ═══ Video rapor — müşteriye WhatsApp'tan gönderilecek dikey motion graphic sunum ═══
 * 1080 × 1920, 30 fps, en çok 59,5 sn. Sahne motoru tamamen canvas üzerinde çizer (her kare zamana bağlı,
 * deterministik): önizleme gerçek zamanlı oynatır, dışa aktarma kareleri tek tek WebCodecs H.264 ile kodlayıp
 * MP4'e paketler (mp4-muxer). WebCodecs yoksa MediaRecorder ile gerçek zamanlı kayda düşer.
 * Müzik: OfflineAudioContext ile üretilen telifsiz sentez altlık (AAC kodlanabiliyorsa videoya eklenir).
 */
import { icon, $, modal, toast, downloadBlob, fmtNum, fmtMoney } from './ui.js';
import { catOf, sevOf, SEVERITY, DEFAULT_SETTINGS } from './catalog.js';
import { planImageUrl } from './plan2d.js';
import { jobMetrics, quoteTotals } from './quote.js';

import { LOGO } from './brand.js';

const W = 1080, H = 1920, FPS = 30, MAX_T = 59.5;
/* kurumsal görsel dil (sosyal medya şablonları): beyaz / siyah yuvarlak köşeli kart, iri siyah başlık + degrade vurgu
 * kelimesi, camgöbeği ve turuncu şeritler, yuvarlak rozetler, ikonlu hap etiketler, alttaki güvence satırı */
const C = {
  cyan: '#13C4D8', cyanL: '#05D3DF', orange: '#FE6B02', amber: '#F7943A', sage: '#A9C29A', green: '#22C55E',
  ink: '#0B0B0C', ink2: '#2A2C30', muted: '#5B6067', line: '#E7E9EB',
  outer: '#ECEEEF', card: '#FFFFFF', outerD: '#000000', cardD: '#141516', cardD2: '#1F2023',
};
const FD = '"Inter Tight", Inter, system-ui, sans-serif', FB = 'Inter, system-ui, sans-serif';
const font = (w, s, f = FD) => `${w} ${s}px ${f}`;
const M = 28, CR = 72, X0 = 110, XW = W - 2 * X0;   // kart kenar boşluğu, köşe yarıçapı, içerik kenarı / genişliği

/* ── zaman / yumuşatma ── */
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const E = {
  out: x => 1 - Math.pow(1 - x, 3),
  inOut: x => x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2,
  back: x => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); },
};
const P = (t, a, b, e = E.out) => e(clamp((t - a) / (b - a)));
const lerp = (a, b, k) => a + (b - a) * k;

/* ── ikonlar: ui.js SVG yollarını Path2D'ye çevir ── */
const ICON_CACHE = new Map();
function iconPaths(k) {
  if (ICON_CACHE.has(k)) return ICON_CACHE.get(k);
  const out = [];
  for (const m of icon(k).matchAll(/<(path|circle|rect|line|polyline|ellipse)\b([^>]*?)\/?>/g)) {
    const a = {}; for (const x of m[2].matchAll(/([\w-]+)="([^"]*)"/g)) a[x[1]] = x[2];
    let p = new Path2D();
    if (m[1] === 'path') p = new Path2D(a.d);
    else if (m[1] === 'circle') p.arc(+a.cx, +a.cy, +a.r, 0, Math.PI * 2);
    else if (m[1] === 'ellipse') p.ellipse(+a.cx, +a.cy, +a.rx, +a.ry, 0, 0, Math.PI * 2);
    else if (m[1] === 'rect') p.roundRect(+a.x || 0, +a.y || 0, +a.width, +a.height, +(a.rx || 0));
    else if (m[1] === 'line') { p.moveTo(+a.x1, +a.y1); p.lineTo(+a.x2, +a.y2); }
    else { const n = a.points.trim().split(/[\s,]+/).map(Number); p.moveTo(n[0], n[1]); for (let i = 2; i < n.length; i += 2) p.lineTo(n[i], n[i + 1]); }
    out.push(p);
  }
  ICON_CACHE.set(k, out); return out;
}
function drawIcon(g, k, cx, cy, size, color, lw = 2) {
  g.save(); g.translate(cx - size / 2, cy - size / 2); g.scale(size / 24, size / 24);
  g.strokeStyle = color; g.lineWidth = lw; g.lineCap = 'round'; g.lineJoin = 'round';
  for (const p of iconPaths(k)) g.stroke(p);
  g.restore();
}

/* ── logo (vektör) ── */
const LP = { c: new Path2D(LOGO.c), o: new Path2D(LOGO.o) };
function logo(g, cx, y, w, { mark = false, reveal = 1 } = {}) {
  const [vx, vy, vw, vh] = LOGO.vb, bw = mark ? LOGO.markW : vw, s = w / bw;
  g.save(); g.translate(cx - w / 2, y); g.scale(s, s); g.translate(-vx, -vy);
  g.beginPath(); g.rect(vx - 2, vy - 2, (mark ? LOGO.markW : LOGO.markW + (vw - LOGO.markW) * reveal) + 4, vh + 4); g.clip();
  g.fillStyle = LOGO.cyan; g.fill(LP.c, 'evenodd'); g.fillStyle = LOGO.orange; g.fill(LP.o, 'evenodd');
  g.restore();
  return vh * s;
}
// sahne başlığı: her sahnenin üstünde ortalı logo
function logoHead(g, t, w = 600, y = 110) { g.save(); g.globalAlpha *= P(t, 0, 0.45); logo(g, W / 2, y + (1 - P(t, 0, 0.5)) * -20, w); g.restore(); }

/* ── çizim yardımcıları ── */
function wrap(g, s, maxW, maxLines = 99) {
  const words = String(s || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean), lines = [];
  let cur = '';
  for (const w of words) { const t = cur ? cur + ' ' + w : w; if (g.measureText(t).width <= maxW || !cur) cur = t; else { lines.push(cur); cur = w; } }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    lines.length = maxLines; let l = lines[maxLines - 1];
    while (l && g.measureText(l + '…').width > maxW) l = l.slice(0, -1);
    lines[maxLines - 1] = l.trimEnd() + '…';
  }
  return lines;
}
function rr(g, x, y, w, h, r) { g.beginPath(); g.roundRect(x, y, w, h, r); }
const shadow = (g, blur = 40, oy = 14, a = 0.12) => { g.shadowColor = `rgba(11,11,12,${a})`; g.shadowBlur = blur; g.shadowOffsetY = oy; };
const noShadow = g => { g.shadowColor = 'transparent'; g.shadowBlur = 0; g.shadowOffsetY = 0; };
// marka degradesi (camgöbeği → adaçayı → kehribar → turuncu)
const gradH = (g, x0, x1) => { const gr = g.createLinearGradient(x0, 0, x1, 0); gr.addColorStop(0, C.cyan); gr.addColorStop(0.38, C.sage); gr.addColorStop(0.62, C.amber); gr.addColorStop(1, C.orange); return gr; };
const gradD = (g, x0, y0, x1, y1) => { const gr = g.createLinearGradient(x0, y0, x1, y1); gr.addColorStop(0, C.cyan); gr.addColorStop(0.5, C.amber); gr.addColorStop(1, C.orange); return gr; };

// metin satırları: aşağıdan kayarak
function textLines(g, lines, x, y, lh, t, t0, { color = C.ink, f, align = 'left', stagger = 0.08, dur = 0.5, rise = 36 } = {}) {
  g.save(); g.font = f; g.fillStyle = color; g.textAlign = align;
  lines.forEach((l, i) => { const k = P(t, t0 + i * stagger, t0 + i * stagger + dur); if (k <= 0) return; g.globalAlpha = k; g.fillText(l, x, y + i * lh + (1 - k) * rise); });
  g.restore();
  return y + lines.length * lh;
}
/* iri başlık: satırlar maskeden yükselir; stil: ink | white | grad | orange | cyan */
function headline(g, rows, x, y, size, t, t0, { dark = false, align = 'left', maxW = XW } = {}) {
  g.save(); g.textAlign = align;
  const setF = s => { g.font = font(800, s); g.letterSpacing = `${(-s * 0.035).toFixed(1)}px`; };
  setF(size); const widest = Math.max(...rows.map(([s]) => g.measureText(s).width));
  if (widest > maxW) { size = Math.floor(size * maxW / widest); setF(size); }
  const lh = size * 1.02;
  rows.forEach(([s, st], i) => {
    const k = P(t, t0 + i * 0.12, t0 + i * 0.12 + 0.65); if (k <= 0) return;
    const yy = y + size * 0.82 + i * lh, w = g.measureText(s).width, xs = align === 'center' ? x - w / 2 : x;
    g.save(); g.beginPath(); g.rect(0, yy - size * 1.0, W, size * 1.32); g.clip();
    g.fillStyle = st === 'grad' ? gradH(g, xs, xs + w) : st === 'orange' ? C.orange : st === 'cyan' ? C.cyan : (st === 'white' || dark) ? '#fff' : C.ink;
    g.fillText(s, x, yy + (1 - k) * size * 1.15);
    g.restore();
  });
  g.restore();
  return y + rows.length * lh;
}
// başlık satırlarına sığacak şekilde bir adı satırlara böl
function nameRows(g, s, size, maxW, max = 2) { g.font = font(800, size); g.letterSpacing = `${(-size * 0.035).toFixed(1)}px`; const r = wrap(g, s, maxW, max); g.letterSpacing = '0px'; return r; }
// camgöbeği dikey çizgili açıklama
function accent(g, lines, x, y, t, t0, { size = 42, dark = false, color, lh = size * 1.32, bar = C.cyan, weight = 500 } = {}) {
  const k = P(t, t0, t0 + 0.5); if (k <= 0) return y;
  g.save(); g.globalAlpha *= k; g.fillStyle = bar; rr(g, x, y - size * 0.9, 7, lh * (lines.length - 1) + size * 1.15 * k, 4); g.fill(); g.restore();
  return textLines(g, lines, x + 34, y, lh, t, t0 + 0.05, { f: font(weight, size, FB), color: color || (dark ? 'rgba(255,255,255,.86)' : C.ink2) });
}
function cover(g, img, x, y, w, h, zoom = 1, px = 0, py = 0) {
  const iw = img.width, ih = img.height, s = Math.max(w / iw, h / ih) * zoom, dw = iw * s, dh = ih * s;
  g.drawImage(img, x + (w - dw) / 2 + px * (dw - w) / 2, y + (h - dh) / 2 + py * (dh - h) / 2, dw, dh);
}
function contain(g, img, x, y, w, h) {
  const s = Math.min(w / img.width, h / img.height), dw = img.width * s, dh = img.height * s;
  g.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}
// yaklaşık kübik bezier uzunluğu
function bezLen(p) { let L = 0, px = p[0], py = p[1]; for (let i = 1; i <= 24; i++) { const t = i / 24, u = 1 - t, x = u * u * u * p[0] + 3 * u * u * t * p[2] + 3 * u * t * t * p[4] + t * t * t * p[6], y = u * u * u * p[1] + 3 * u * u * t * p[3] + 3 * u * t * t * p[5] + t * t * t * p[7]; L += Math.hypot(x - px, y - py); px = x; py = y; } return L; }
// kalın marka şeridi: k (0..1) kadar çizilir, üstünde ince ışık
function ribbon(g, p, color, lw, k) {
  if (k <= 0) return;
  const L = bezLen(p);
  g.save(); g.lineCap = 'round'; g.setLineDash([L * k, L + 50]);
  g.beginPath(); g.moveTo(p[0], p[1]); g.bezierCurveTo(p[2], p[3], p[4], p[5], p[6], p[7]);
  g.strokeStyle = color; g.lineWidth = lw; g.stroke();
  g.strokeStyle = 'rgba(255,255,255,.22)'; g.lineWidth = lw * 0.22; g.translate(0, -lw * 0.2); g.stroke();
  g.restore();
}
// ince eş merkezli halkalar
function rings(g, cx, cy, t, dark = false, n = 4) {
  g.save(); g.lineWidth = 2;
  for (let i = 0; i < n; i++) {
    const r = 260 + i * 170 + (t * 24) % 170;
    g.globalAlpha = 0.5 * (1 - i / n); g.strokeStyle = i % 2 ? (dark ? 'rgba(254,107,2,.28)' : 'rgba(254,107,2,.22)') : (dark ? 'rgba(255,255,255,.08)' : 'rgba(11,11,12,.06)');
    if (i % 2) g.setLineDash([6, 10]); else g.setLineDash([]);
    g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
  }
  g.restore();
}
// yuvarlak rozet ("Ücretsiz Keşif" gibi) + köşede ikon balonu
function badge(g, cx, cy, r, bg, lines, ic, k, { fg = '#fff', rot = -0.12, icColor = C.ink } = {}) {
  if (k <= 0) return;
  g.save(); g.translate(cx, cy); g.scale(k, k); g.rotate(rot);
  shadow(g, 40, 16, 0.18); g.beginPath(); g.arc(0, 0, r + 12, 0, Math.PI * 2); g.fillStyle = '#fff'; g.fill(); noShadow(g);
  g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fillStyle = bg; g.fill();
  const fs = r * (lines.length > 1 ? 0.3 : 0.36); g.font = font(800, fs); g.fillStyle = fg; g.textAlign = 'center';
  lines.forEach((l, i) => g.fillText(l, 0, (i - (lines.length - 1) / 2) * fs * 1.08 + fs * 0.35));
  if (ic) { const bx = r * 0.66, by = -r * 0.74, br = r * 0.32; shadow(g, 20, 8, 0.18); g.beginPath(); g.arc(bx, by, br, 0, Math.PI * 2); g.fillStyle = '#fff'; g.fill(); noShadow(g); drawIcon(g, ic, bx, by, br * 1.1, icColor, 2.4); }
  g.restore();
}
// beyaz hap etiket + renkli ikon dairesi
function chip(g, x, y, label, ic, color, k, { h = 104, sub = '', w = 0, dark = false } = {}) {
  if (k <= 0) return 0;
  g.save(); g.globalAlpha *= clamp(k * 1.4); g.font = font(700, h * 0.36, FB);
  const tw = Math.max(g.measureText(label).width, sub ? (g.font = font(500, h * 0.25, FB), g.measureText(sub).width) : 0), ww = w || tw + h * 1.45;
  const dy = (1 - k) * 40;
  shadow(g, 30, 10, dark ? 0.35 : 0.1); rr(g, x, y + dy, ww, h, h / 2); g.fillStyle = '#fff'; g.fill(); noShadow(g);
  g.beginPath(); g.arc(x + h / 2, y + dy + h / 2, h * 0.36, 0, Math.PI * 2); g.fillStyle = color; g.fill();
  drawIcon(g, ic, x + h / 2, y + dy + h / 2, h * 0.38, '#fff', 2.2);
  g.fillStyle = C.ink; g.font = font(700, h * 0.32, FB);
  const lw = ww - h * 1.15;
  if (sub) { g.fillText(wrap(g, label, lw, 1)[0], x + h * 0.98, y + dy + h * 0.46); g.font = font(500, h * 0.235, FB); g.fillStyle = C.muted; g.fillText(wrap(g, sub, lw, 1)[0] || '', x + h * 0.98, y + dy + h * 0.76); }
  else g.fillText(label, x + h * 0.98, y + dy + h * 0.62);
  g.restore(); return ww;
}
// beyaz, gölgeli, yuvarlak köşeli "uygulama ikonu" + logo simgesi
function appTile(g, cx, cy, s, k, check = false) {
  if (k <= 0) return;
  g.save(); g.translate(cx, cy); g.scale(k, k); g.rotate((1 - k) * -0.2);
  shadow(g, 70, 30, 0.16); rr(g, -s / 2, -s / 2, s, s, s * 0.24); g.fillStyle = '#fff'; g.fill(); noShadow(g);
  const gr = g.createLinearGradient(0, -s / 2, 0, s / 2); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(11,11,12,.04)'); g.fillStyle = gr; g.fill();
  const mw = s * 0.66; logo(g, 0, -mw * (150 / 170) / 2, mw, { mark: true });
  if (check) { const r = s * 0.13, x = s * 0.4, y = s * 0.36; shadow(g, 20, 8, 0.2); g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fillStyle = C.green; g.fill(); noShadow(g); drawIcon(g, 'check', x, y, r * 1.2, '#fff', 3.4); }
  g.restore();
}
// alt güvence satırı (şablonlardaki gibi)
const TRUST = [['shield', 'Güvenilir', 'Ustalar', C.cyan], ['clipboard', 'Planlı', 'Süreç', C.orange], ['clock', 'Zamanında', 'Teslim', C.cyan], ['award', 'Kaliteli', 'Malzeme', C.orange]];
function trustRow(g, y, t, t0, dark = false, items = TRUST) {
  const n = items.length, cw = (W - 2 * M - 80) / n;
  items.forEach(([ic, a, b, c], i) => {
    const k = P(t, t0 + i * 0.1, t0 + i * 0.1 + 0.5); if (k <= 0) return;
    const x = M + 40 + i * cw;
    g.save(); g.globalAlpha *= k;
    drawIcon(g, ic, x + 52, y, 64, c, 2);
    g.font = font(500, 28, FB); g.fillStyle = dark ? 'rgba(255,255,255,.8)' : C.ink2; g.fillText(a, x + 98, y - 6); g.fillText(b, x + 98, y + 28);
    if (i) { g.fillStyle = dark ? 'rgba(255,255,255,.14)' : C.line; g.fillRect(x - 6, y - 40, 2, 80); }
    g.restore();
  });
}
// çerçeveli fotoğraf kartı
function photoCard(g, img, x, y, w, h, t, d, k, fallback) {
  if (k <= 0) return;
  g.save(); g.globalAlpha *= clamp(k * 1.3); const dy = (1 - k) * 60;
  shadow(g, 60, 24, 0.2); rr(g, x - 10, y - 10 + dy, w + 20, h + 20, 58); g.fillStyle = '#fff'; g.fill(); noShadow(g);
  rr(g, x, y + dy, w, h, 48); g.clip();
  if (img) cover(g, img, x, y + dy, w, h, 1.05 + 0.1 * t / d, 0.35 - 0.7 * t / d, 0); else fallback?.(x, y + dy, w, h);
  g.restore();
}
// sahne zemini: dış kenar + yuvarlak köşeli kart
function frame(g, dark) {
  g.fillStyle = dark ? C.outerD : C.outer; g.fillRect(0, 0, W, H);
  rr(g, M, M, W - 2 * M, H - 2 * M, CR); g.fillStyle = dark ? C.cardD : C.card; g.fill();
}

/* ── veri hazırlığı ── */
async function loadImg(src) {
  if (!src) return null;
  try {
    let url = src;
    if (!/^(data:|blob:)/.test(src)) { const r = await fetch(src, { mode: 'cors' }); if (!r.ok) return null; url = URL.createObjectURL(await r.blob()); }
    const im = new Image(); im.decoding = 'async'; im.src = url; await im.decode();
    // canvas'ı kirletip kirletmediğini sına (kirli görüntü video karesine çevrilemez)
    const c = document.createElement('canvas'); c.width = c.height = 4; const x = c.getContext('2d'); x.drawImage(im, 0, 0, 4, 4); x.getImageData(0, 0, 1, 1);
    return im;
  } catch { return null; }
}

export async function prepareVideo(job, settings, be, opt) {
  await Promise.all([font(800, 100), font(900, 100), font(700, 50, FB), font(600, 50, FB), font(500, 50, FB)].map(f => document.fonts.load(f).catch(() => {})));
  const photo = async p => p ? loadImg(await be.photoUrl(p)) : null;
  const reqs = (job.requests || []).filter(r => r.status !== 'kapsamdisi');
  const sevRank = k => SEVERITY.findIndex(s => s.k === k);
  const finds = [...(job.findings || [])].sort((a, b) => sevRank(b.severity || 'orta') - sevRank(a.severity || 'orta'));
  const coverP = job.photos.find(p => ['kesif', 'once'].includes(p.tag)) || job.photos.find(p => p.tag !== 'render');
  const renders = job.photos.filter(p => p.tag === 'render').slice(0, 2);
  const D = {
    job, co: settings.company || {}, opt,
    name: job.customer?.name || 'Değerli müşterimiz',
    place: [job.customer?.district, job.customer?.address].filter(Boolean).join(' · '),
    date: new Date(job.kesifDate || job.created || Date.now()).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }),
    reqs, finds, met: jobMetrics(job),
    lines: String(settings.videoLines ?? DEFAULT_SETTINGS.videoLines).split('\n').map(s => s.trim()).filter(Boolean).slice(0, 5),
    total: job.quote?.items?.length ? quoteTotals(job.quote).total : 0,
    cover: opt.photos ? await photo(coverP) : null,
    fimg: {}, renders: [], plan: null,
  };
  if (opt.photos) for (const f of finds.slice(0, 8)) D.fimg[f.id] = await photo(job.photos.find(p => p.findingId === f.id));
  if (opt.visual) {
    if (opt.photos) for (const p of renders) { const im = await photo(p); if (im) D.renders.push(im); }
    if (!D.renders.length && job.plan?.walls?.length) D.plan = await loadImg(planImageUrl(job.plan, 1000, 1000));
  }
  return D;
}

/* ── sahneler ── */
const sameAs = (cat, room) => room && cat.toLocaleLowerCase('tr').includes(room.toLocaleLowerCase('tr'));
function buildScenes(D) {
  const S = [], o = D.opt;
  const add = (k, dur, dark, draw) => S.push({ k, dur, dark, draw });

  // 1) açılış: şeritler, uygulama ikonu, logo, "Keşif raporunuz hazır."
  add('intro', 3.2, false, (g, t) => {
    rings(g, W / 2, 1120, t);
    ribbon(g, [-60, 1010, 330, 940, 330, 1560, 1150, 1500], C.cyanL, 74, P(t, 0.15, 1.3, E.inOut));
    ribbon(g, [1150, 760, 700, 800, 800, 1380, 1150, 1420], C.orange, 64, P(t, 0.35, 1.5, E.inOut));
    appTile(g, W / 2, 1150, 430, P(t, 0.3, 1.0, E.back), true);
    g.save(); g.globalAlpha *= P(t, 0.8, 1.2); logo(g, W / 2, 130, 760, { reveal: P(t, 0.8, 1.5, E.inOut) }); g.restore();
    headline(g, [['Keşif raporunuz', 'ink'], ['hazır.', 'grad']], X0, 380, 132, t, 1.0);
    g.font = font(500, 42, FB); accent(g, wrap(g, `${D.name} için hazırlandı`, XW - 40, 2), X0, 720, t, 1.4);
    trustRow(g, 1730, t, 1.7, false, TRUST.filter((_, i) => i !== 1));
  });

  // 2) kapak: "Merhaba, <ad>" + keşif fotoğrafı
  add('title', 3.8, true, (g, t, d) => {
    rings(g, 760, 1260, t, true);
    logoHead(g, t);
    const nr = nameRows(g, D.name, 116, XW, 2);
    let y = headline(g, [['Merhaba,', 'white'], ...nr.map(s => [s, 'grad'])], X0, 300, 116, t, 0.15, { dark: true });
    g.font = font(500, 40, FB);
    const sub = [...(D.place ? wrap(g, D.place, XW - 60, 2) : []), `${D.date} · ${D.job.code || ''}`];
    y = accent(g, sub, X0, y + 70, t, 0.6, { size: 40, dark: true });
    const py = Math.max(y + 40, 1000), ph = 1720 - py;
    ribbon(g, [-60, py + 120, 260, py + 60, 300, py + ph * 0.8, 620, H + 40], C.cyanL, 70, P(t, 0.3, 1.4, E.inOut));
    ribbon(g, [1150, py - 120, 760, py - 60, 980, py + ph * 0.9, 1150, py + ph * 0.8], C.orange, 62, P(t, 0.45, 1.6, E.inOut));
    photoCard(g, D.cover, 150, py, W - 300, ph, t, d, P(t, 0.5, 1.1), (x, yy, w, h) => { g.fillStyle = '#fff'; g.fillRect(x, yy, w, h); appTile(g, x + w / 2, yy + h / 2, Math.min(w, h) * 0.6, 1); });
    badge(g, 900, py + 20, 112, C.orange, ['Keşif', 'raporu'], 'search', P(t, 1.1, 1.6, E.back));
  });

  // 3) talepler
  const R = D.reqs.slice(0, 6);
  if (o.reqs && R.length) add('reqs', 1.4 + R.length * 0.4 + 1.6, true, (g, t) => {
    ribbon(g, [-60, 1500, 200, 1380, 260, 1900, 520, H + 60], C.cyanL, 66, P(t, 0.2, 1.4, E.inOut));
    ribbon(g, [1150, 520, 860, 560, 980, 900, 1150, 980], C.orange, 58, P(t, 0.35, 1.4, E.inOut));
    logoHead(g, t);
    let y = headline(g, [['Talepleriniz', 'white'], ['tek listede', 'grad']], X0, 300, 128, t, 0.1, { dark: true });
    y = accent(g, ['Keşifte sizden dinlediklerimiz'], X0, y + 70, t, 0.45, { size: 40, dark: true });
    R.forEach((r, i) => {
      const ct = catOf(r.category).t;
      chip(g, X0 - 10, y + 50 + i * 156, sameAs(ct, r.room) || !r.room ? ct : `${ct} · ${r.room}`, catOf(r.category).ic, i % 2 ? C.orange : C.cyan, P(t, 0.8 + i * 0.4, 1.3 + i * 0.4, E.out), { h: 130, sub: r.text, w: XW + 20, dark: true });
    });
    if (D.reqs.length > R.length) textLines(g, [`+${D.reqs.length - R.length} talep daha`], W / 2, y + 50 + R.length * 156 + 50, 50, t, 0.8 + R.length * 0.4, { f: font(600, 36, FB), color: 'rgba(255,255,255,.7)', align: 'center' });
  });

  // 4) tespit girişi + 5) tespit kartları — sığan kadar
  const fixedAfter = (o.visual && (D.renders.length || D.plan) ? 3.8 : 0) + 3.8 + 5.6 + 3.8;
  const used = S.reduce((a, s) => a + s.dur, 0);
  const F = o.finds ? D.finds.slice(0, Math.max(0, Math.min(6, Math.floor((MAX_T - used - fixedAfter - 2.4) / 4.6)))) : [];
  if (o.finds && D.finds.length) {
    add('fintro', 2.4, false, (g, t) => {
      rings(g, 780, 900, t);
      ribbon(g, [1150, 1180, 820, 1200, 760, 1720, 1150, 1760], C.orange, 66, P(t, 0.1, 1.2, E.inOut));
      ribbon(g, [-60, 1300, 220, 1260, 240, 1700, 520, H + 60], C.cyanL, 62, P(t, 0.25, 1.3, E.inOut));
      logoHead(g, t);
      const n = Math.round(D.finds.length * P(t, 0.15, 1.0));
      g.save(); g.font = font(900, 430); g.letterSpacing = '-18px'; const nw = g.measureText(String(D.finds.length)).width; g.globalAlpha *= P(t, 0.05, 0.4);
      g.fillStyle = gradH(g, X0, X0 + nw); g.fillText(String(n), X0 - 10, 700); g.restore();
      let y = headline(g, [['konu tespit ettik,', 'ink'], ['çözümleri hazır.', 'grad']], X0, 760, 104, t, 0.3);
      // önem dağılımı: renk noktalı haplar
      const cnt = SEVERITY.map(s => ({ s, n: D.finds.filter(f => (f.severity || 'orta') === s.k).length })).filter(x => x.n).reverse();
      let x = X0 - 10; y += 60;
      cnt.forEach(({ s, n: c }, i) => {
        const k = P(t, 0.9 + i * 0.12, 1.4 + i * 0.12); if (k <= 0) return;
        g.save(); g.globalAlpha *= k; g.font = font(700, 34, FB); const tw = g.measureText(`${s.t} · ${c}`).width + 90;
        if (x + tw > W - X0) { x = X0 - 10; y += 100; }
        shadow(g, 24, 8, 0.1); rr(g, x, y, tw, 80, 40); g.fillStyle = '#fff'; g.fill(); noShadow(g);
        g.beginPath(); g.arc(x + 42, y + 40, 13, 0, Math.PI * 2); g.fillStyle = s.c; g.fill();
        g.fillStyle = C.ink; g.fillText(`${s.t} · ${c}`, x + 66, y + 52); g.restore(); x += tw + 16;
      });
      badge(g, 850, 420, 120, C.cyan, ['Çözüm', 'odaklı'], 'check', P(t, 1.0, 1.5, E.back), { icColor: C.green });
    });
    F.forEach((f, i) => {
      const sv = sevOf(f.severity || 'orta'), img = D.fimg[f.id], ct = catOf(f.category).t;
      add('find', 4.6, false, (g, t, d) => {
        logoHead(g, t, 500, 92);
        const px = 90, py = 230, pw = W - 180, ph = 640;
        photoCard(g, img, px, py, pw, ph, t, d, P(t, 0.05, 0.55), (x, y, w, h) => {
          const gr = g.createLinearGradient(x, y, x + w, y + h); gr.addColorStop(0, sv.c); gr.addColorStop(1, C.cardD); g.fillStyle = gr; g.fillRect(x, y, w, h);
          rings(g, x + w / 2, y + h / 2, t, true, 3); drawIcon(g, catOf(f.category).ic, x + w / 2, y + h / 2, 260 + 14 * Math.sin(t * 2), '#fff', 1.5);
        });
        if (img) {   // dikkat halkası
          const pk = (t * 0.9) % 1, cx = W / 2, cy = py + ph * 0.45; g.save(); g.strokeStyle = '#fff'; g.lineWidth = 7; g.globalAlpha = (1 - pk) * 0.95 * P(t, 0.4, 0.8);
          g.beginPath(); g.arc(cx, cy, 50 + pk * 150, 0, Math.PI * 2); g.stroke(); g.globalAlpha = P(t, 0.4, 0.8); g.fillStyle = sv.c; g.beginPath(); g.arc(cx, cy, 20, 0, Math.PI * 2); g.fill(); g.restore();
        }
        badge(g, W - 170, py + 10, 100, sv.c, [sv.t], 'alert', P(t, 0.45, 0.9, E.back));
        chip(g, px + 20, py + ph - 60, `Tespit ${i + 1} / ${D.finds.length}`, 'search', C.ink, P(t, 0.5, 0.9), { h: 96 });
        let y = py + ph + 130;
        textLines(g, [[ct, sameAs(ct, f.room) ? '' : f.room].filter(Boolean).join(' · ').toLocaleUpperCase('tr')], X0, y, 44, t, 0.55, { f: font(700, 32, FB), color: C.cyan });
        const tl = nameRows(g, f.title || ct, 74, XW, 2);
        y = headline(g, tl.map(s => [s, 'ink']), X0, y + 18, 74, t, 0.6);
        if (f.desc) { g.font = font(500, 38, FB); y = accent(g, wrap(g, f.desc, XW - 40, 2), X0, y + 56, t, 0.85, { size: 38 }); }
        // çözüm kartı: degrade çerçeveli beyaz kart + yeşil onay
        const ks = P(t, 1.6, 2.2); if (ks > 0) {
          g.font = font(600, 40, FB);
          const al = wrap(g, f.action || 'Uygulama yöntemi ve maliyeti teklifimizde ayrıntılı olarak yer alıyor.', XW - 150, 4);
          const ch = 150 + al.length * 54, cy = Math.min(H - M - 60 - ch, y + 40) + (1 - ks) * 120, cx = X0 - 30, cw = XW + 60;
          g.save(); g.globalAlpha *= ks;
          shadow(g, 50, 18, 0.14); rr(g, cx, cy, cw, ch, 50); g.fillStyle = gradD(g, cx, cy, cx + cw, cy + ch); g.fill(); noShadow(g);
          rr(g, cx + 8, cy + 8, cw - 16, ch - 16, 43); g.fillStyle = '#fff'; g.fill();
          g.beginPath(); g.arc(cx + 92, cy + 86, 40, 0, Math.PI * 2); g.fillStyle = C.green; g.fill(); drawIcon(g, 'check', cx + 92, cy + 86, 46, '#fff', 3.4 * P(t, 1.9, 2.3));
          g.font = font(800, 44); g.fillStyle = C.ink; g.fillText('Çözümümüz', cx + 156, cy + 102);
          g.restore();
          textLines(g, al, cx + 60, cy + 178, 54, t, 2.0, { f: font(600, 40, FB), color: C.ink2, stagger: 0.12 });
        }
      });
    });
  } else if (o.finds) add('nofind', 2.8, false, (g, t) => {
    rings(g, W / 2, 1100, t); logoHead(g, t);
    appTile(g, W / 2, 1150, 400, P(t, 0.2, 0.8, E.back), true);
    headline(g, [['Kritik bir sorun', 'ink'], ['tespit edilmedi.', 'grad']], X0, 380, 112, t, 0.3);
  });

  // 6) hedef görsel / rölöve
  if (o.visual && (D.renders.length || D.plan)) add('visual', 3.8, false, (g, t, d) => {
    rings(g, W / 2, 1150, t);
    ribbon(g, [-60, 900, 260, 860, 280, 1500, 560, H + 60], C.cyanL, 66, P(t, 0.2, 1.3, E.inOut));
    ribbon(g, [1150, 1000, 820, 1040, 900, 1700, 1150, 1720], C.orange, 60, P(t, 0.3, 1.4, E.inOut));
    logoHead(g, t);
    const y = headline(g, D.renders.length ? [['Hedeflenen', 'ink'], ['sonuç', 'grad']] : [['Rölöve', 'ink'], ['planınız', 'grad']], X0, 280, 128, t, 0.1);
    const py = y + 90, ph = H - M - 120 - py;
    photoCard(g, null, 110, py, W - 220, ph, t, d, P(t, 0.3, 0.9), (x, yy, w, h) => {
      g.fillStyle = '#fff'; g.fillRect(x, yy, w, h);
      if (D.renders.length) {
        const n = D.renders.length, seg = d / n, idx = Math.min(n - 1, Math.floor(t / seg)), lt = t - idx * seg;
        cover(g, D.renders[idx], x, yy, w, h, 1.04 + 0.1 * lt / seg, 0.3 - 0.6 * lt / seg, 0);
        if (idx > 0 && lt < 0.5) { g.save(); g.globalAlpha = 1 - lt / 0.5; cover(g, D.renders[idx - 1], x, yy, w, h, 1.14, -0.3, 0); g.restore(); }
      } else { const kr = P(t, 0.6, 2.6, E.inOut); g.save(); g.beginPath(); g.rect(x, yy, w * kr, h); g.clip(); contain(g, D.plan, x + 20, yy + 20, w - 40, h - 40); g.restore(); }
    });
    badge(g, 880, py + 10, 110, C.cyan, D.renders.length ? ['Size özel', 'tasarım'] : ['Ölçülü', 'çizim'], D.renders.length ? 'sparkle' : 'ruler', P(t, 0.9, 1.4, E.back));
  });

  // 7) özet sayılar
  add('stats', 3.8, true, (g, t) => {
    rings(g, 800, 700, t, true);
    ribbon(g, [1150, 380, 860, 420, 960, 760, 1150, 820], C.orange, 56, P(t, 0.2, 1.2, E.inOut));
    logoHead(g, t);
    const y = headline(g, [['Keşif', 'white'], ['özeti', 'grad']], X0, 280, 140, t, 0.1, { dark: true });
    const m = D.met, tiles = [
      { v: m.rooms.length, s: 'mahal', ic: 'home', c: C.cyan },
      { v: m.floor || 0, s: 'm² alan', ic: 'ruler', c: C.orange },
      { v: D.reqs.length, s: 'talep', ic: 'list', c: C.orange },
      { v: D.finds.length, s: 'tespit', ic: 'alert', c: C.cyan },
    ];
    const ty = y + 80, tw = (XW + 20 - 24) / 2, th = 330;
    tiles.forEach((tl, i) => {
      const k = P(t, 0.35 + i * 0.15, 0.95 + i * 0.15, E.back); if (k <= 0) return;
      const x = X0 - 10 + (i % 2) * (tw + 24), yy = ty + Math.floor(i / 2) * (th + 24);
      g.save(); g.translate(x + tw / 2, yy + th / 2); g.scale(0.85 + 0.15 * k, 0.85 + 0.15 * k); g.globalAlpha *= clamp(k);
      rr(g, -tw / 2, -th / 2, tw, th, 44); g.fillStyle = C.cardD2; g.fill();
      g.beginPath(); g.arc(-tw / 2 + 80, -th / 2 + 80, 44, 0, Math.PI * 2); g.fillStyle = tl.c; g.fill(); drawIcon(g, tl.ic, -tw / 2 + 80, -th / 2 + 80, 46, '#fff', 2.2);
      const v = tl.v * P(t, 0.5 + i * 0.15, 1.6 + i * 0.15), s = String(Math.round(v));
      g.font = font(900, 120); g.letterSpacing = '-5px'; const w = g.measureText(s).width;
      g.fillStyle = gradH(g, -tw / 2 + 36, -tw / 2 + 36 + Math.max(w, 120)); g.fillText(s, -tw / 2 + 36, th / 2 - 82);
      g.letterSpacing = '0px'; g.font = font(600, 36, FB); g.fillStyle = 'rgba(255,255,255,.7)'; g.fillText(tl.s, -tw / 2 + 40, th / 2 - 34);
      g.restore();
    });
    if (o.price && D.total) {
      const k = P(t, 1.1, 1.6), yy = ty + 2 * (th + 24) + (1 - k) * 40, x = X0 - 10, w = XW + 20;
      g.save(); g.globalAlpha *= k;
      rr(g, x, yy, w, 220, 50); g.fillStyle = gradD(g, x, yy, x + w, yy + 220); g.fill(); rr(g, x + 6, yy + 6, w - 12, 208, 45); g.fillStyle = C.cardD2; g.fill();
      g.font = font(600, 36, FB); g.fillStyle = 'rgba(255,255,255,.7)'; g.fillText('Teklif tutarı (KDV dahil)', x + 50, yy + 80);
      g.font = font(900, 80); g.fillStyle = '#fff'; g.fillText(fmtMoney(D.total * P(t, 1.2, 2.4)).replace(',00', ''), x + 48, yy + 170);
      g.restore();
    }
  });

  // 8) güvence: "Süreç bizde, keyfi sizde."
  add('trust', 5.6, false, (g, t) => {
    rings(g, W / 2, 1150, t);
    logoHead(g, t);
    let y = headline(g, [['Süreç bizde,', 'ink'], ['keyfi sizde.', 'grad']], X0, 280, 132, t, 0.1);
    g.font = font(500, 40, FB); y = accent(g, wrap(g, 'Keşiften teslime, tadilatınızı baştan sona biz planlıyor ve yönetiyoruz.', XW - 40, 2), X0, y + 70, t, 0.45, { size: 40 });
    const rows = D.lines, rh = 136, gap = 20, y0 = y + 50;
    rows.forEach((l, i) => {
      const k = P(t, 0.9 + i * 0.45, 1.4 + i * 0.45); if (k <= 0) return;
      const yy = y0 + i * (rh + gap), x = X0 - 10 + (1 - k) * 80;
      g.save(); g.globalAlpha *= k;
      shadow(g, 30, 10, 0.08); rr(g, x, yy, XW + 20, rh, rh / 2); g.fillStyle = '#fff'; g.fill(); noShadow(g);
      g.strokeStyle = C.line; g.lineWidth = 2; g.stroke();
      g.beginPath(); g.arc(x + rh / 2, yy + rh / 2, 44, 0, Math.PI * 2); g.fillStyle = i % 2 ? C.orange : C.cyan; g.fill();
      drawIcon(g, 'check', x + rh / 2, yy + rh / 2, 46, '#fff', 3.4 * P(t, 1.1 + i * 0.45, 1.5 + i * 0.45));
      g.font = font(600, 36, FB); g.fillStyle = C.ink; const wl = wrap(g, l, XW - rh - 40, 2);
      wl.forEach((s, j) => g.fillText(s, x + rh + 8, yy + rh / 2 + 13 - (wl.length - 1) * 22 + j * 44));
      g.restore();
    });
    // "Tek ekip. Net süreç. Güvenilir sonuç." (şablon dili)
    const ky = y0 + rows.length * (rh + gap) + 70, kk = P(t, 1.2 + rows.length * 0.45, 1.7 + rows.length * 0.45);
    if (kk > 0) {
      g.save(); g.globalAlpha *= kk; g.fillStyle = C.cyan; rr(g, X0, ky - 44, 7, 60, 4); g.fill();
      g.font = font(700, 42, FB); g.fillStyle = C.ink; const a = 'Tek ekip. Net süreç. '; g.fillText(a, X0 + 34, ky); const aw = g.measureText(a).width;
      g.fillStyle = C.orange; g.fillText('Güvenilir sonuç.', X0 + 34 + aw, ky); g.restore();
    }
    trustRow(g, H - M - 110, t, 1.4 + rows.length * 0.45);
  });

  // 9) kapanış: logo, çağrı, iletişim
  add('outro', 3.8, false, (g, t) => {
    rings(g, W / 2, 1480, t);
    ribbon(g, [-60, 1240, 240, 1190, 360, 1720, 700, H + 60], C.cyanL, 72, P(t, 0.2, 1.3, E.inOut));
    ribbon(g, [1150, 1060, 760, 1100, 820, 1700, 1150, 1720], C.orange, 64, P(t, 0.3, 1.4, E.inOut));
    g.save(); g.globalAlpha *= P(t, 0, 0.4); logo(g, W / 2, 130, 760); g.restore();
    let y = headline(g, D.total ? [['Teklifiniz', 'ink'], ['hazır,', 'grad'], ['başlayalım!', 'ink']] : [['Hayalinizdeki', 'ink'], ['mekân', 'grad'], ['bir mesaj uzakta!', 'ink']], X0, 360, 124, t, 0.2);
    const rows = [[D.co.web || 'tadilatbodrum.com', null], [D.co.whatsapp || D.co.phone, 'chat'], [D.co.email, 'mail']].filter(r => r[0]);
    y += 110;
    rows.forEach(([s, ic], i) => {
      const k = P(t, 0.8 + i * 0.15, 1.3 + i * 0.15); if (k <= 0) return;
      g.save(); g.globalAlpha *= k;
      if (!ic) { g.fillStyle = C.cyan; rr(g, X0, y - 40, 7, 54, 4); g.fill(); g.font = font(800, 46); g.fillStyle = C.orange; g.fillText(s, X0 + 34, y); }
      else { drawIcon(g, ic, X0 + 24, y - 15, 52, C.cyan, 2.2); g.font = font(600, 42, FB); g.fillStyle = C.ink; g.fillText(s, X0 + 74, y); }
      g.restore(); y += 84;
    });
    appTile(g, W / 2, 1520, 360, P(t, 0.6, 1.3, E.back), true);
    badge(g, 860, 1240, 112, C.cyan, ['Hızlı', 'Randevu'], 'calendar', P(t, 1.2, 1.7, E.back));
  });

  // süreyi sınırla: toplam ≤ MAX_T
  let tot = S.reduce((a, s) => a + s.dur, 0);
  if (tot > MAX_T) { const k = MAX_T / tot; S.forEach(s => { s.dur *= k; }); tot = MAX_T; }
  let a = 0; S.forEach(s => { s.t0 = a; a += s.dur; });
  return { scenes: S, dur: tot };
}

/* sahne geçişi: camgöbeği + turuncu eğik şeritler ekranı süpürür */
function transition(g, p) {
  if (p <= 0 || p >= 1) return;
  const e = E.inOut(p), bw = 2500, pos = lerp(-2900, 2900, e);
  g.save(); g.translate(W / 2, H / 2); g.rotate(-0.5);
  g.fillStyle = C.cyanL; g.fillRect(pos - bw / 2, -H * 1.5, bw, H * 3);
  g.fillStyle = C.orange; g.fillRect(pos + bw / 2, -H * 1.5, 340, H * 3);
  g.restore();
}

export function makeTimeline(D) {
  const tl = buildScenes(D), TR = 0.34;
  tl.frame = (g, t) => {
    t = clamp(t, 0, tl.dur - 1e-4);
    const S = tl.scenes; let i = S.findIndex(s => t < s.t0 + s.dur); if (i < 0) i = S.length - 1;
    const s = S[i];
    g.save(); g.letterSpacing = '0px'; g.textBaseline = 'alphabetic'; frame(g, s.dark);
    rr(g, M, M, W - 2 * M, H - 2 * M, CR); g.clip();
    s.draw(g, t - s.t0, s.dur);
    g.restore();
    for (let j = 1; j < S.length; j++) { const b = S[j].t0, p = (t - (b - TR)) / (2 * TR); if (p > 0 && p < 1) transition(g, p); }
  };
  return tl;
}

/* ── müzik: sakin, umut veren sentez altlık (C–Am–F–G), sahne geçişlerinde hafif "whoosh" ── */
export async function renderMusic(tl, sr = 48000) {
  const dur = tl.dur, ac = new OfflineAudioContext(2, Math.ceil(sr * dur), sr);
  const master = ac.createGain(); master.gain.value = 0.0;
  master.gain.setValueAtTime(0, 0); master.gain.linearRampToValueAtTime(0.75, 1.2); master.gain.setValueAtTime(0.75, Math.max(1.3, dur - 2.2)); master.gain.linearRampToValueAtTime(0, dur);
  const comp = ac.createDynamicsCompressor(); master.connect(comp); comp.connect(ac.destination);
  const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400; lp.connect(master);
  const hz = m => 440 * Math.pow(2, (m - 69) / 12);
  const bpm = 96, beat = 60 / bpm, bar = beat * 4;
  const chords = [[48, 52, 55, 59], [45, 48, 52, 55], [41, 45, 48, 52], [43, 47, 50, 52]];
  for (let c = 0, t = 0; t < dur; c++, t += bar * 2) {
    const ch = chords[c % 4];
    for (const n of ch) for (const det of [-6, 6]) {   // pad
      const o = ac.createOscillator(), gn = ac.createGain(); o.type = 'triangle'; o.frequency.value = hz(n + 12); o.detune.value = det;
      gn.gain.setValueAtTime(0, t); gn.gain.linearRampToValueAtTime(0.035, t + 0.9); gn.gain.setValueAtTime(0.035, t + bar * 2 - 0.4); gn.gain.linearRampToValueAtTime(0, t + bar * 2 + 0.6);
      o.connect(gn); gn.connect(lp); o.start(t); o.stop(t + bar * 2 + 0.7);
    }
    const bo = ac.createOscillator(), bg = ac.createGain(); bo.type = 'sine'; bo.frequency.value = hz(ch[0] - 12);   // bas
    bg.gain.setValueAtTime(0, t); bg.gain.linearRampToValueAtTime(0.16, t + 0.05); bg.gain.exponentialRampToValueAtTime(0.03, t + bar * 2); bo.connect(bg); bg.connect(master); bo.start(t); bo.stop(t + bar * 2);
    for (let s = 0; s < 16; s++) {   // arpej
      const at = t + s * beat / 2; if (at < 1.5 || at > dur - 1.5) continue;
      const n = ch[[0, 1, 2, 3, 2, 1, 3, 2][s % 8]] + 24, o = ac.createOscillator(), gn = ac.createGain();
      o.type = 'sine'; o.frequency.value = hz(n); gn.gain.setValueAtTime(0, at); gn.gain.linearRampToValueAtTime(0.05, at + 0.01); gn.gain.exponentialRampToValueAtTime(0.0008, at + 0.45);
      o.connect(gn); gn.connect(lp); o.start(at); o.stop(at + 0.5);
    }
  }
  // hafif ritim: 1. sahneden sonra
  const noise = ac.createBuffer(1, sr, sr); const nd = noise.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  const t1 = tl.scenes[1]?.t0 || 3;
  for (let t = t1; t < dur - 2; t += beat) {
    const k = ac.createOscillator(), kg = ac.createGain(); k.frequency.setValueAtTime(110, t); k.frequency.exponentialRampToValueAtTime(42, t + 0.18);
    kg.gain.setValueAtTime(0.22, t); kg.gain.exponentialRampToValueAtTime(0.001, t + 0.25); k.connect(kg); kg.connect(master); k.start(t); k.stop(t + 0.26);
    const h = ac.createBufferSource(), hf = ac.createBiquadFilter(), hg = ac.createGain(); h.buffer = noise; hf.type = 'highpass'; hf.frequency.value = 7000;
    hg.gain.setValueAtTime(0.025, t + beat / 2); hg.gain.exponentialRampToValueAtTime(0.0005, t + beat / 2 + 0.06); h.connect(hf); hf.connect(hg); hg.connect(master); h.start(t + beat / 2); h.stop(t + beat / 2 + 0.08);
  }
  for (const s of tl.scenes.slice(1)) {   // geçiş sesi
    const t = Math.max(0, s.t0 - 0.35), w = ac.createBufferSource(), f = ac.createBiquadFilter(), gn = ac.createGain();
    w.buffer = noise; f.type = 'bandpass'; f.Q.value = 1.2; f.frequency.setValueAtTime(400, t); f.frequency.exponentialRampToValueAtTime(5000, t + 0.6);
    gn.gain.setValueAtTime(0, t); gn.gain.linearRampToValueAtTime(0.09, t + 0.3); gn.gain.linearRampToValueAtTime(0, t + 0.65);
    w.connect(f); f.connect(gn); gn.connect(master); w.start(t); w.stop(t + 0.7);
  }
  return ac.startRendering();
}

/* ── dışa aktarma ── */
async function pickVideoCodec() {
  if (typeof VideoEncoder === 'undefined') return null;
  for (const codec of ['avc1.640028', 'avc1.4d0028', 'avc1.42e028', 'avc1.640032', 'avc1.42003e']) {
    const cfg = { codec, width: W, height: H, bitrate: 4_500_000, framerate: FPS, avc: { format: 'avc' } };
    try { const r = await VideoEncoder.isConfigSupported(cfg); if (r.supported) return cfg; } catch { /* sıradaki */ }
  }
  return null;
}
async function pickAudio() {
  if (typeof AudioEncoder === 'undefined') return null;
  const cfg = { codec: 'mp4a.40.2', sampleRate: 48000, numberOfChannels: 2, bitrate: 128000 };
  try { return (await AudioEncoder.isConfigSupported(cfg)).supported ? cfg : null; } catch { return null; }
}

export async function exportMp4(tl, music, onProgress, signal, force = null) {
  const vcfg = force || await pickVideoCodec();   // force: test için kodek (ör. VP9)
  if (!vcfg) return exportRealtime(tl, music, onProgress, signal);
  const acfg = music ? await pickAudio() : null;
  const { Muxer, ArrayBufferTarget } = await import('../vendor/mp4-muxer.mjs');
  const mux = new Muxer({ target: new ArrayBufferTarget(), video: { codec: vcfg.codec.startsWith('vp09') ? 'vp9' : 'avc', width: W, height: H, frameRate: FPS }, ...(acfg ? { audio: { codec: 'aac', numberOfChannels: 2, sampleRate: 48000 } } : {}), fastStart: 'in-memory', firstTimestampBehavior: 'offset' });
  let err = null;
  const ve = new VideoEncoder({ output: (c, m) => mux.addVideoChunk(c, m), error: e => { err = e; } });
  ve.configure(vcfg);
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d', { alpha: false });
  const N = Math.round(tl.dur * FPS);
  for (let i = 0; i < N; i++) {
    if (signal?.aborted) { ve.close(); throw new DOMException('İptal', 'AbortError'); }
    if (err) throw err;
    tl.frame(g, i / FPS);
    const fr = new VideoFrame(cv, { timestamp: Math.round(i * 1e6 / FPS), duration: Math.round(1e6 / FPS) });
    ve.encode(fr, { keyFrame: i % (FPS * 2) === 0 }); fr.close();
    while (ve.encodeQueueSize > 4) await new Promise(r => setTimeout(r, 2));
    if (i % 6 === 0) { onProgress?.(i / N * (acfg ? 0.92 : 1)); await new Promise(r => setTimeout(r, 0)); }
  }
  await ve.flush(); ve.close();
  if (acfg) {
    try {
      const buf = await renderMusic(tl), ae = new AudioEncoder({ output: (c, m) => mux.addAudioChunk(c, m), error: e => { err = e; } });
      ae.configure(acfg);
      const L = buf.getChannelData(0), R = buf.getChannelData(1), step = 4800;
      for (let s = 0; s < buf.length; s += step) {
        const n = Math.min(step, buf.length - s), data = new Float32Array(n * 2); data.set(L.subarray(s, s + n), 0); data.set(R.subarray(s, s + n), n);
        const ad = new AudioData({ format: 'f32-planar', sampleRate: 48000, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round(s * 1e6 / 48000), data });
        ae.encode(ad); ad.close();
      }
      await ae.flush(); ae.close();
    } catch (e) { console.warn('müzik eklenemedi', e); }
  }
  if (err) throw err;
  mux.finalize(); onProgress?.(1);
  return { blob: new Blob([mux.target.buffer], { type: 'video/mp4' }), ext: 'mp4', audio: !!acfg };
}

// yedek yol: gerçek zamanlı oynatıp kaydet (WebCodecs H.264 yoksa)
async function exportRealtime(tl, music, onProgress, signal) {
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d', { alpha: false });
  tl.frame(g, 0);
  const stream = cv.captureStream(FPS);
  let actx = null;
  if (music) { try { const buf = await renderMusic(tl); actx = new AudioContext({ sampleRate: 48000 }); const src = actx.createBufferSource(); src.buffer = buf; const dst = actx.createMediaStreamDestination(); src.connect(dst); dst.stream.getAudioTracks().forEach(tr => stream.addTrack(tr)); stream._src = src; } catch { actx = null; } }
  const types = ['video/mp4;codecs=avc1.640028,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm'];
  const mime = types.find(t => MediaRecorder.isTypeSupported(t)) || '';
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 4_500_000 }), parts = [];
  rec.ondataavailable = e => e.data.size && parts.push(e.data);
  const done = new Promise(r => { rec.onstop = r; });
  rec.start(500); stream._src?.start();
  const t0 = performance.now();
  await new Promise(res => {
    const tick = () => {
      const t = (performance.now() - t0) / 1000;
      if (signal?.aborted || t >= tl.dur) return res();
      tl.frame(g, t); onProgress?.(t / tl.dur); requestAnimationFrame(tick);
    };
    tick();
  });
  rec.stop(); await done; actx?.close();
  if (signal?.aborted) throw new DOMException('İptal', 'AbortError');
  const type = mime.split(';')[0] || 'video/webm';
  return { blob: new Blob(parts, { type }), ext: type.includes('mp4') ? 'mp4' : 'webm', audio: !!actx };
}

/* ── arayüz ── */
export async function openVideoReport(job, settings, be) {
  const opt = { reqs: true, finds: true, photos: true, visual: true, price: false, music: true };
  const body = document.createElement('div'); body.className = 'vr';
  body.innerHTML = `
    <div class="vr-stage"><canvas class="vr-cv" width="540" height="960"></canvas><button class="vr-play" aria-label="Oynat">${icon('play')}</button><div class="vr-wait"><div class="spin"></div><p>Hazırlanıyor…</p></div></div>
    <div class="vr-side">
      <p class="muted small">Müşteriye WhatsApp'tan gönderilecek dikey (1080×1920) MP4 sunum. Logo ile açılır; talepler, tespitler ve önerilen çözümler, özet ve iletişim bilgileriyle kapanır.</p>
      <div class="vr-opts">
        ${[['reqs', 'Talepler'], ['finds', 'Tespitler ve çözümler'], ['photos', 'Fotoğraflar'], ['visual', 'Render / rölöve görseli'], ['price', 'Teklif tutarını göster'], ['music', 'Arka plan müziği']].map(([k, t]) => `<label class="check"><input type="checkbox" data-o="${k}" ${opt[k] ? 'checked' : ''}> ${t}</label>`).join('')}
      </div>
      <p class="vr-info muted small"></p>
      <div class="vr-prog" hidden><div class="bar"><i></i></div><small></small></div>
      <div class="vr-acts">
        <button class="btn btn-primary" data-v="make">${icon('download')}Videoyu oluştur</button>
        <button class="btn btn-ghost" data-v="share" hidden>${icon('share')}WhatsApp / paylaş</button>
        <button class="btn btn-ghost" data-v="dl" hidden>${icon('download')}İndir</button>
      </div>
      <p class="muted small">Kapanış mesajlarını Ayarlar → "Video rapor" bölümünden düzenleyebilirsiniz.</p>
    </div>`;
  let tl = null, D = null, playing = false, raf = 0, t0 = 0, actx = null, asrc = null, music = null, result = null, abort = null, gen = 0;
  const cv = $('.vr-cv', body), g = cv.getContext('2d', { alpha: false }); g.scale(cv.width / W, cv.height / H);
  const info = () => { $('.vr-info', body).textContent = tl ? `Süre ${fmtNum(tl.dur, 1)} sn · ${tl.scenes.length} sahne · ${D.finds.length ? Math.min(D.finds.length, tl.scenes.filter(s => s.k === 'find').length) + '/' + D.finds.length + ' tespit' : 'tespit yok'}` : ''; };
  const stop = () => { playing = false; cancelAnimationFrame(raf); try { asrc?.stop(); } catch { /* */ } asrc = null; $('.vr-play', body).hidden = false; };
  const build = async () => {
    const my = ++gen; stop(); $('.vr-wait', body).hidden = false;
    D = await prepareVideo(job, settings, be, { ...opt }); if (my !== gen) return;
    tl = makeTimeline(D); music = null; result = null;
    $('[data-v=share]', body).hidden = $('[data-v=dl]', body).hidden = true;
    $('.vr-wait', body).hidden = true; tl.frame(g, 1.6); info();
  };
  const play = async () => {
    if (!tl) return;
    if (playing) return stop();
    playing = true; $('.vr-play', body).hidden = true;
    if (opt.music) { try { music ||= await renderMusic(tl); actx ||= new AudioContext(); asrc = actx.createBufferSource(); asrc.buffer = music; asrc.connect(actx.destination); asrc.start(); } catch { /* sessiz */ } }
    t0 = performance.now();
    const tick = () => { const t = (performance.now() - t0) / 1000; if (!playing) return; if (t >= tl.dur) { tl.frame(g, tl.dur); return stop(); } tl.frame(g, t); raf = requestAnimationFrame(tick); };
    tick();
  };
  const fname = () => `Video_Rapor_${(job.code || 'is').replace(/[^\w-]+/g, '_')}.${result?.ext || 'mp4'}`;
  body.addEventListener('change', e => { const k = e.target.dataset.o; if (!k) return; opt[k] = e.target.checked; build(); });
  $('.vr-play', body).onclick = play; cv.onclick = play;
  $('[data-v=make]', body).onclick = async () => {
    if (!tl) return; stop();
    const pr = $('.vr-prog', body), bar = $('.bar i', pr), lab = $('small', pr), mk = $('[data-v=make]', body);
    pr.hidden = false; mk.disabled = true; abort = new AbortController();
    try {
      result = await exportMp4(tl, opt.music, p => { bar.style.width = `${Math.round(p * 100)}%`; lab.textContent = `Video oluşturuluyor… %${Math.round(p * 100)}`; }, abort.signal);
      lab.textContent = `Hazır: ${fmtNum(result.blob.size / 1048576, 1)} MB · ${result.ext.toUpperCase()}${opt.music && !result.audio ? ' · bu tarayıcı müzik kodlamayı desteklemiyor, video sessiz' : ''}`;
      $('[data-v=dl]', body).hidden = false;
      const file = new File([result.blob], fname(), { type: result.blob.type });
      $('[data-v=share]', body).hidden = !(navigator.canShare && navigator.canShare({ files: [file] }));
      if (result.ext !== 'mp4') toast('Bu tarayıcı MP4 üretemedi (WebM). WhatsApp için Chrome / Edge / Safari güncel sürüm önerilir.', 'err');
    } catch (e) { if (e.name !== 'AbortError') { console.error(e); lab.textContent = 'Video oluşturulamadı: ' + (e.message || e); } else pr.hidden = true; }
    mk.disabled = false; abort = null;
  };
  $('[data-v=dl]', body).onclick = () => result && downloadBlob(result.blob, fname());
  $('[data-v=share]', body).onclick = async () => {
    if (!result) return;
    const file = new File([result.blob], fname(), { type: result.blob.type });
    try { await navigator.share({ files: [file], title: 'Keşif video raporu', text: `${job.customer?.name || ''} — TadilatBodrum.com keşif video raporu` }); } catch { /* vazgeçildi */ }
  };
  const done = modal({ title: 'Video rapor', body, wide: true, actions: [], onOpen: () => build() });
  await done;
  gen++; stop(); abort?.abort(); actx?.close();
}

