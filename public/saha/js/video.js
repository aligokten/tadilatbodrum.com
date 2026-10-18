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

const W = 1080, H = 1920, FPS = 30, MAX_T = 59.5;
const C = { teal: '#00AFB0', cyan: '#1EC3D3', tealD: '#00898A', orange: '#EB591F', orangeD: '#C9461A', amber: '#F2A33A', sage: '#9CC6A6', ink: '#111214', ink2: '#2B2E33', muted: '#6A7380', bg: '#F5F6F7', dark: '#16171A', line: '#E6E8EB' };
const FD = '"Inter Tight", Inter, system-ui, sans-serif', FB = 'Inter, system-ui, sans-serif';
const font = (w, s, f = FD) => `${w} ${s}px ${f}`;

/* ── zaman / yumuşatma ── */
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const E = {
  out: x => 1 - Math.pow(1 - x, 3),
  inOut: x => x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2,
  back: x => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); },
  lin: x => x,
};
const P = (t, a, b, e = E.out) => e(clamp((t - a) / (b - a)));
const lerp = (a, b, k) => a + (b - a) * k;

/* ── ikonlar: ui.js SVG yollarını Path2D'ye çevir (görsel yükleme / canvas kirlenmesi yok) ── */
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
// satırları sırayla aşağıdan kayarak göster
function textLines(g, lines, x, y, lh, t, t0, { color = C.ink, f, align = 'left', stagger = 0.08, dur = 0.5, rise = 40 } = {}) {
  g.save(); g.font = f; g.fillStyle = color; g.textAlign = align; g.textBaseline = 'alphabetic';
  lines.forEach((l, i) => { const k = P(t, t0 + i * stagger, t0 + i * stagger + dur); if (k <= 0) return; g.globalAlpha = k; g.fillText(l, x, y + i * lh + (1 - k) * rise); });
  g.restore();
  return y + lines.length * lh;
}
function cover(g, img, x, y, w, h, zoom = 1, px = 0, py = 0) {
  const iw = img.width, ih = img.height, s = Math.max(w / iw, h / ih) * zoom, dw = iw * s, dh = ih * s;
  g.drawImage(img, x + (w - dw) / 2 + px * (dw - w) / 2, y + (h - dh) / 2 + py * (dh - h) / 2, dw, dh);
}
function contain(g, img, x, y, w, h) {
  const s = Math.min(w / img.width, h / img.height), dw = img.width * s, dh = img.height * s;
  g.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}
// yumuşak hareketli renk bulutları (marka renkleri)
function blobs(g, t, cols, alpha = 0.55, r = 760) {
  g.save();
  cols.forEach((c, i) => {
    const x = W * (0.15 + ((i * 0.43) % 1) * 0.7) + Math.sin(t * 0.45 + i * 2.1) * 140;
    const y = H * (0.12 + ((i * 0.61) % 1) * 0.76) + Math.cos(t * 0.35 + i * 1.3) * 180;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, c); gr.addColorStop(1, c.slice(0, 7) + '00');
    g.globalAlpha = alpha; g.fillStyle = gr; g.fillRect(0, 0, W, H);
  });
  g.restore();
}
const brandGrad = (g, x0, y0, x1, y1) => { const gr = g.createLinearGradient(x0, y0, x1, y1); gr.addColorStop(0, C.cyan); gr.addColorStop(0.38, C.sage); gr.addColorStop(0.62, C.amber); gr.addColorStop(1, C.orange); return gr; };
// marka dalgası (logodaki su dalgaları): soldan çizilerek gelir
function waves(g, x, y, w, k, color, lw = 10, n = 3, gap = 34, amp = 12) {
  g.save(); g.strokeStyle = color; g.lineWidth = lw; g.lineCap = 'round';
  for (let j = 0; j < n; j++) {
    const kk = clamp(k * 1.25 - j * 0.12); if (kk <= 0) continue;
    g.beginPath();
    for (let i = 0; i <= 60 * kk; i++) { const xx = x + (w * i) / 60, yy = y + j * gap + Math.sin((i / 60) * Math.PI * 4) * amp; i ? g.lineTo(xx, yy) : g.moveTo(xx, yy); }
    g.stroke();
  }
  g.restore();
}
function pill(g, x, y, s, { bg = C.teal, fg = '#fff', f = font(700, 34, FB), padX = 26, h = 64, align = 'left', dot = null } = {}) {
  g.save(); g.font = f; const tw = g.measureText(s).width + (dot ? 30 : 0), w = tw + padX * 2, x0 = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
  rr(g, x0, y, w, h, h / 2); g.fillStyle = bg; g.fill();
  if (dot) { g.fillStyle = dot; g.beginPath(); g.arc(x0 + padX + 8, y + h / 2, 9, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = fg; g.textBaseline = 'middle'; g.fillText(s, x0 + padX + (dot ? 30 : 0), y + h / 2 + 1);
  g.restore(); return w;
}
const footer = (g, dark, a = 1) => { g.save(); g.globalAlpha = 0.7 * a; g.font = font(600, 30, FB); g.textAlign = 'center'; g.fillStyle = dark ? 'rgba(255,255,255,.75)' : C.muted; g.fillText('tadilatbodrum.com', W / 2, H - 70); g.restore(); };

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
  await Promise.all([font(800, 100), font(700, 100), font(600, 50, FB), font(500, 50, FB), font(700, 50, FB)].map(f => document.fonts.load(f).catch(() => {})));
  const photo = async p => p ? loadImg(await be.photoUrl(p)) : null;
  const reqs = (job.requests || []).filter(r => r.status !== 'kapsamdisi');
  const sevRank = k => SEVERITY.findIndex(s => s.k === k);
  const finds = [...(job.findings || [])].sort((a, b) => sevRank(b.severity || 'orta') - sevRank(a.severity || 'orta'));
  const met = jobMetrics(job);
  const coverP = job.photos.find(p => ['kesif', 'once'].includes(p.tag)) || job.photos.find(p => p.tag !== 'render');
  const renders = job.photos.filter(p => p.tag === 'render').slice(0, 2);
  const D = {
    job, co: settings.company || {}, opt,
    name: job.customer?.name || 'Değerli müşterimiz',
    place: [job.customer?.district, job.customer?.address].filter(Boolean).join(' · '),
    date: new Date(job.kesifDate || job.created || Date.now()).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }),
    reqs, finds, met,
    lines: String(settings.videoLines ?? DEFAULT_SETTINGS.videoLines).split('\n').map(s => s.trim()).filter(Boolean).slice(0, 5),
    total: job.quote?.items?.length ? quoteTotals(job.quote).total : 0,
    logo: await loadImg('assets/logo-hd.png'),
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
function buildScenes(D) {
  const S = [], o = D.opt;
  const add = (k, dur, dark, draw) => S.push({ k, dur, dark, draw });

  // 1) logo açılışı
  add('intro', 3.0, false, (g, t) => {
    g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
    blobs(g, t, [C.cyan + '55', C.amber + '44'], 0.5, 700);
    // dalga halkaları
    for (let i = 0; i < 3; i++) { const k = P(t, 0.1 + i * 0.25, 1.6 + i * 0.25, E.out); if (k <= 0 || k >= 1) continue; g.save(); g.globalAlpha = (1 - k) * 0.35; g.strokeStyle = C.teal; g.lineWidth = 6; g.beginPath(); g.arc(W / 2, 860, 120 + k * 520, 0, Math.PI * 2); g.stroke(); g.restore(); }
    const lw = 960, lh = lw * 634 / 1536, ly = 860 - lh / 2, lx = (W - lw) / 2;
    if (D.logo) {
      const L = D.logo, sx = L.width / 1536;
      // ev + dalga simgesi: yaylanarak büyür
      const k1 = P(t, 0.05, 0.75, E.back), iw = 480 * sx, iwD = lw * 480 / 1536;
      g.save(); g.globalAlpha = clamp(k1 * 1.5); g.translate(lx + iwD * 0.55, ly + lh * 0.55); g.scale(0.4 + 0.6 * k1, 0.4 + 0.6 * k1);
      g.drawImage(L, 0, 0, iw, L.height, -iwD * 0.55, -lh * 0.55, iwD, lh); g.restore();
      // yazı: soldan sağa açılır
      const k2 = P(t, 0.45, 1.25, E.inOut);
      g.save(); g.beginPath(); g.rect(lx + iwD, ly, (lw - iwD) * k2, lh); g.clip();
      g.drawImage(L, iw, 0, L.width - iw, L.height, lx + iwD + (1 - k2) * -40, ly, lw - iwD, lh); g.restore();
    }
    const k3 = P(t, 1.2, 1.9, E.inOut);
    g.fillStyle = brandGrad(g, W / 2 - 300, 0, W / 2 + 300, 0); rr(g, W / 2 - 300 * k3, 1110, 600 * k3, 12, 6); g.fill();
    textLines(g, ['KEŞİF VİDEO RAPORU'], W / 2, 1200, 50, t, 1.6, { f: font(700, 40, FB), color: C.ink2, align: 'center' });
    textLines(g, [D.name], W / 2, 1270, 50, t, 1.8, { f: font(600, 40, FB), color: C.muted, align: 'center' });
  });

  // 2) kapak: müşteri, adres, tarih
  add('title', 3.6, true, (g, t, d) => {
    g.fillStyle = C.dark; g.fillRect(0, 0, W, H);
    if (D.cover) { g.save(); g.globalAlpha = 0.85; cover(g, D.cover, 0, 0, W, H, 1.08 + t / d * 0.1, -0.3 + t / d * 0.6, 0); g.restore(); }
    const sh = g.createLinearGradient(0, 0, 0, H); sh.addColorStop(0, 'rgba(22,23,26,.25)'); sh.addColorStop(0.45, 'rgba(22,23,26,.55)'); sh.addColorStop(1, 'rgba(22,23,26,.96)'); g.fillStyle = sh; g.fillRect(0, 0, W, H);
    blobs(g, t, [C.teal, C.orange], 0.35, 650);
    waves(g, 90, 880, 300, P(t, 0.1, 1.1), C.cyan, 9);
    const k = P(t, 0.2, 0.7);
    g.save(); g.globalAlpha = k; pill(g, 90, 1040, 'KEŞİF RAPORU', { bg: C.teal }); g.restore();
    g.font = font(800, 116); const nl = wrap(g, D.name, W - 180, 2);
    let y = textLines(g, nl, 90, 1240, 124, t, 0.35, { f: font(800, 116), color: '#fff' });
    g.font = font(500, 44, FB);
    if (D.place) { const pl = wrap(g, D.place, W - 250, 2); g.save(); g.globalAlpha = P(t, 0.8, 1.3); drawIcon(g, 'map', 116, y + 26, 50, C.cyan, 2.2); g.restore(); y = textLines(g, pl, 166, y + 44, 56, t, 0.8, { f: font(500, 44, FB), color: 'rgba(255,255,255,.85)' }); }
    g.save(); g.globalAlpha = P(t, 1.05, 1.5); drawIcon(g, 'calendar', 116, y + 52, 46, C.amber, 2.2); g.restore();
    textLines(g, [`${D.date}  ·  ${D.job.code || ''}`], 166, y + 68, 56, t, 1.05, { f: font(600, 40, FB), color: 'rgba(255,255,255,.75)' });
  });

  // 3) talepler
  const R = D.reqs.slice(0, 6);
  if (o.reqs && R.length) add('reqs', 1.2 + R.length * 0.45 + 1.6, false, (g, t) => {
    g.fillStyle = C.bg; g.fillRect(0, 0, W, H); blobs(g, t, [C.cyan + '66', C.amber + '44'], 0.45);
    textLines(g, ['Sizi dinledik'], 90, 300, 60, t, 0.05, { f: font(700, 42, FB), color: C.tealD });
    textLines(g, ['Talepleriniz'], 90, 420, 120, t, 0.15, { f: font(800, 116) });
    R.forEach((r, i) => {
      const k = P(t, 0.7 + i * 0.45, 1.3 + i * 0.45, E.out); if (k <= 0) return;
      const y = 540 + i * 196, x = 90 + (1 - k) * 260;
      g.save(); g.globalAlpha = k;
      g.shadowColor = 'rgba(17,18,20,.08)'; g.shadowBlur = 30; g.shadowOffsetY = 10;
      rr(g, x, y, W - 180, 170, 36); g.fillStyle = '#fff'; g.fill(); g.shadowColor = 'transparent';
      rr(g, x + 26, y + 30, 110, 110, 30); g.fillStyle = '#E3F7F8'; g.fill();
      drawIcon(g, catOf(r.category).ic, x + 81, y + 85, 62, C.teal, 2.1);
      g.font = font(800, 46); g.fillStyle = C.ink; const ct = catOf(r.category).t, same = r.room && ct.toLocaleLowerCase('tr').includes(r.room.toLocaleLowerCase('tr'));
      g.fillText(wrap(g, r.room && !same ? `${ct} · ${r.room}` : ct, W - 400, 1)[0], x + 166, y + 72);
      g.font = font(500, 36, FB); g.fillStyle = C.muted; g.fillText(wrap(g, r.text, W - 400, 1)[0] || '', x + 166, y + 124);
      g.restore();
    });
    if (D.reqs.length > R.length) textLines(g, [`+${D.reqs.length - R.length} talep daha`], W / 2, 540 + R.length * 196 + 70, 50, t, 0.8 + R.length * 0.45, { f: font(600, 38, FB), color: C.muted, align: 'center' });
    footer(g, false, P(t, 0.3, 0.8));
  });

  // 4) tespit girişi + 5) tespit kartları — sığan kadar
  const fixedAfter = (o.visual && (D.renders.length || D.plan) ? 3.8 : 0) + 3.6 + 5.4 + 3.6;
  const used = S.reduce((a, s) => a + s.dur, 0);
  const F = o.finds ? D.finds.slice(0, Math.max(0, Math.min(6, Math.floor((MAX_T - used - fixedAfter - 2.2) / 4.6)))) : [];
  if (o.finds && D.finds.length) {
    add('fintro', 2.2, true, (g, t) => {
      const gr = g.createLinearGradient(0, 0, W, H); gr.addColorStop(0, C.orange); gr.addColorStop(1, C.amber); g.fillStyle = gr; g.fillRect(0, 0, W, H);
      blobs(g, t, ['#ffffff', C.orangeD], 0.18, 700);
      const n = Math.round(D.finds.length * P(t, 0.1, 1.1, E.out));
      g.save(); g.fillStyle = '#fff'; g.textAlign = 'center'; g.font = font(900, 360); g.globalAlpha = P(t, 0, 0.3); g.fillText(String(n), W / 2, 900); g.restore();
      textLines(g, ['tespit ettik'], W / 2, 1020, 80, t, 0.3, { f: font(800, 84), color: '#fff', align: 'center' });
      // önem dağılımı çubuğu
      const cnt = SEVERITY.map(s => ({ s, n: D.finds.filter(f => (f.severity || 'orta') === s.k).length })).filter(x => x.n).reverse();
      const k = P(t, 0.6, 1.5, E.inOut), bw = W - 240; let x = 120;
      cnt.forEach(({ s, n }) => { const w = bw * n / D.finds.length * k; rr(g, x, 1130, Math.max(0, w - 6), 34, 17); g.fillStyle = s.k === 'yuksek' || s.k === 'acil' ? '#fff' : s.c; g.fill(); x += bw * n / D.finds.length * k; });
      g.save(); g.globalAlpha = P(t, 1.2, 1.7); let lx = 120;
      cnt.forEach(({ s, n }) => { lx += pill(g, lx, 1200, `${s.t} ${n}`, { bg: 'rgba(255,255,255,.22)', f: font(700, 32, FB), h: 58, dot: s.k === 'yuksek' || s.k === 'acil' ? '#fff' : s.c }) + 14; });
      g.restore();
      textLines(g, ['Her birini çözümüyle birlikte anlatıyoruz'], W / 2, 1400, 50, t, 1.3, { f: font(600, 40, FB), color: 'rgba(255,255,255,.92)', align: 'center' });
    });
    F.forEach((f, i) => {
      const sv = sevOf(f.severity || 'orta'), img = D.fimg[f.id];
      add('find', 4.6, false, (g, t, d) => {
        g.fillStyle = C.bg; g.fillRect(0, 0, W, H);
        const ph = 1020;
        g.save(); rr(g, 0, 0, W, ph + 60, 0); g.clip();
        if (img) cover(g, img, 0, 0, W, ph + 60, 1.06 + 0.12 * t / d, 0.4 - 0.8 * t / d, -0.2);
        else {   // fotoğraf yoksa: önem renginde degrade + büyük kategori simgesi
          const gr = g.createLinearGradient(0, 0, W, ph); gr.addColorStop(0, sv.c); gr.addColorStop(1, C.dark); g.fillStyle = gr; g.fillRect(0, 0, W, ph + 60);
          blobs(g, t, ['#ffffff'], 0.12, 600); g.save(); g.globalAlpha = 0.9; drawIcon(g, catOf(f.category).ic, W / 2, 470, 300 + 20 * Math.sin(t * 2), '#fff', 1.4); g.restore();
        }
        const sh = g.createLinearGradient(0, 0, 0, 260); sh.addColorStop(0, 'rgba(0,0,0,.45)'); sh.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = sh; g.fillRect(0, 0, W, 260);
        g.restore();
        // dikkat halkası
        if (img) { const pk = (t * 0.9) % 1; g.save(); g.strokeStyle = sv.c; g.lineWidth = 8; g.globalAlpha = (1 - pk) * 0.9; g.beginPath(); g.arc(W / 2, 470, 60 + pk * 170, 0, Math.PI * 2); g.stroke(); g.globalAlpha = 1; g.fillStyle = sv.c; g.beginPath(); g.arc(W / 2, 470, 22, 0, Math.PI * 2); g.fill(); g.restore(); }
        g.save(); g.globalAlpha = P(t, 0.1, 0.5);
        pill(g, 90, 110, `Tespit ${i + 1} / ${D.finds.length}`, { bg: 'rgba(17,18,20,.55)', f: font(700, 32, FB), h: 60 });
        pill(g, W - 90, 110, sv.t, { bg: sv.c, f: font(800, 32, FB), h: 60, align: 'right' });
        g.restore();
        // içerik kartı
        const ky = P(t, 0.15, 0.65), cy = ph - 80 + (1 - ky) * 120;
        g.save(); g.globalAlpha = ky; g.shadowColor = 'rgba(17,18,20,.12)'; g.shadowBlur = 40; g.shadowOffsetY = -6;
        rr(g, 40, cy, W - 80, H - cy + 60, 56); g.fillStyle = '#fff'; g.fill(); g.restore();
        let y = cy + 100;
        const ct = catOf(f.category).t, same = f.room && ct.toLocaleLowerCase('tr').includes(f.room.toLocaleLowerCase('tr'));
        textLines(g, [[ct, same ? '' : f.room].filter(Boolean).join(' · ').toLocaleUpperCase('tr')], 100, y, 50, t, 0.35, { f: font(700, 34, FB), color: C.tealD });
        g.font = font(800, 70); const tl = wrap(g, f.title || ct, W - 200, 2);
        y = textLines(g, tl, 100, y + 88, 80, t, 0.45, { f: font(800, 70) });
        if (f.desc) { g.font = font(500, 42, FB); y = textLines(g, wrap(g, f.desc, W - 200, 3), 100, y + 24, 56, t, 0.65, { f: font(500, 42, FB), color: C.muted }); }
        // çözüm paneli
        const ks = P(t, 1.5, 2.1, E.out); if (ks > 0) {
          g.font = font(600, 42, FB);
          const al = wrap(g, f.action || 'Uygulama yöntemi ve maliyeti teklifimizde ayrıntılı olarak yer alıyor.', W - 260, 4);
          const ph2 = 160 + al.length * 58, py = Math.min(H - 150 - ph2, y + 50) + (1 - ks) * 160;
          g.save(); g.globalAlpha = ks; rr(g, 70, py, W - 140, ph2, 44);
          const gr = g.createLinearGradient(70, py, W - 70, py + ph2); gr.addColorStop(0, C.teal); gr.addColorStop(1, C.tealD); g.fillStyle = gr; g.fill();
          g.beginPath(); g.arc(150, py + 82, 44, 0, Math.PI * 2); g.fillStyle = '#fff'; g.fill();
          drawIcon(g, 'check', 150, py + 82, 50, C.teal, 3.2 * P(t, 1.8, 2.2));
          g.font = font(800, 40); g.fillStyle = '#fff'; g.fillText('ÇÖZÜMÜMÜZ', 220, py + 96);
          g.restore();
          textLines(g, al, 120, py + 180, 58, t, 1.9, { f: font(600, 42, FB), color: '#fff', stagger: 0.12 });
        }
        footer(g, false, P(t, 0.3, 0.8));
      });
    });
  } else if (o.finds) add('nofind', 2.6, false, (g, t) => {
    g.fillStyle = C.bg; g.fillRect(0, 0, W, H); blobs(g, t, [C.teal + '66', C.sage + '66'], 0.5);
    g.save(); g.globalAlpha = P(t, 0, 0.5); g.beginPath(); g.arc(W / 2, 760, 150, 0, Math.PI * 2); g.fillStyle = C.teal; g.fill(); drawIcon(g, 'check', W / 2, 760, 170, '#fff', 3 * P(t, 0.2, 0.8)); g.restore();
    textLines(g, ['Kritik bir sorun', 'tespit edilmedi'], W / 2, 1060, 110, t, 0.4, { f: font(800, 96), align: 'center' });
  });

  // 6) hedef görsel / rölöve
  if (o.visual && (D.renders.length || D.plan)) add('visual', 3.8, true, (g, t, d) => {
    const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, C.tealD); gr.addColorStop(1, '#06464A'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
    blobs(g, t, [C.cyan, C.amber], 0.25, 650);
    textLines(g, [D.renders.length ? 'Hedeflediğimiz sonuç' : 'Mekanınızı ölçtük'], 90, 300, 60, t, 0.05, { f: font(700, 42, FB), color: '#BFF3F4' });
    textLines(g, [D.renders.length ? 'Yeni yaşam alanınız' : 'Rölöve planınız'], 90, 420, 110, t, 0.15, { f: font(800, 100), color: '#fff' });
    const k = P(t, 0.3, 0.9, E.out), x = 70, y = 520 + (1 - k) * 80, w = W - 140, h = 1100;
    g.save(); g.globalAlpha = k; g.shadowColor = 'rgba(0,0,0,.3)'; g.shadowBlur = 50; g.shadowOffsetY = 20; rr(g, x, y, w, h, 48); g.fillStyle = '#fff'; g.fill(); g.restore();
    g.save(); g.globalAlpha = k; rr(g, x, y, w, h, 48); g.clip();
    if (D.renders.length) {
      const n = D.renders.length, seg = d / n, idx = Math.min(n - 1, Math.floor(t / seg)), lt = t - idx * seg;
      cover(g, D.renders[idx], x, y, w, h, 1.04 + 0.1 * lt / seg, 0.3 - 0.6 * lt / seg, 0);
      if (idx > 0 && lt < 0.5) { g.globalAlpha = 1 - lt / 0.5; cover(g, D.renders[idx - 1], x, y, w, h, 1.14, -0.3, 0); }
    } else { const kr = P(t, 0.5, 2.6, E.inOut); g.beginPath(); g.rect(x, y, w * kr, h); g.clip(); contain(g, D.plan, x + 30, y + 30, w - 60, h - 60); }
    g.restore();
    footer(g, true, P(t, 0.3, 0.8));
  });

  // 7) özet sayılar
  add('stats', 3.6, false, (g, t) => {
    g.fillStyle = C.bg; g.fillRect(0, 0, W, H); blobs(g, t, [C.cyan + '55', C.orange + '33'], 0.45);
    textLines(g, ['Kısaca'], 90, 300, 60, t, 0.05, { f: font(700, 42, FB), color: C.tealD });
    textLines(g, ['Keşif özeti'], 90, 420, 120, t, 0.15, { f: font(800, 116) });
    const m = D.met, tiles = [
      { v: m.rooms.length, s: 'mahal', ic: 'home', c: C.teal },
      { v: m.floor || 0, s: 'm² alan', ic: 'ruler', c: C.cyan, dec: 1 },
      { v: D.reqs.length, s: 'talep', ic: 'list', c: C.amber },
      { v: D.finds.length, s: 'tespit', ic: 'alert', c: C.orange },
    ];
    tiles.forEach((tl, i) => {
      const k = P(t, 0.35 + i * 0.15, 0.95 + i * 0.15, E.back); if (k <= 0) return;
      const x = 90 + (i % 2) * 465, y = 540 + Math.floor(i / 2) * 400, w = 435, h = 370;
      g.save(); g.translate(x + w / 2, y + h / 2); g.scale(0.85 + 0.15 * k, 0.85 + 0.15 * k); g.globalAlpha = clamp(k);
      g.shadowColor = 'rgba(17,18,20,.08)'; g.shadowBlur = 30; g.shadowOffsetY = 10; rr(g, -w / 2, -h / 2, w, h, 44); g.fillStyle = '#fff'; g.fill(); g.shadowColor = 'transparent';
      rr(g, -w / 2 + 36, -h / 2 + 36, 96, 96, 28); g.fillStyle = tl.c + '22'; g.fill(); drawIcon(g, tl.ic, -w / 2 + 84, -h / 2 + 84, 54, tl.c, 2.2);
      const v = tl.v * P(t, 0.5 + i * 0.15, 1.6 + i * 0.15, E.out);
      g.font = font(900, 120); g.fillStyle = C.ink; g.fillText(tl.dec ? fmtNum(v, 0) : String(Math.round(v)), -w / 2 + 36, h / 2 - 90);
      g.font = font(600, 40, FB); g.fillStyle = C.muted; g.fillText(tl.s, -w / 2 + 36, h / 2 - 36);
      g.restore();
    });
    if (o.price && D.total) {
      const k = P(t, 1.1, 1.6); g.save(); g.globalAlpha = k;
      rr(g, 90, 1360 + (1 - k) * 40, W - 180, 220, 44); g.fillStyle = C.dark; g.fill();
      g.font = font(600, 38, FB); g.fillStyle = 'rgba(255,255,255,.7)'; g.fillText('Teklif tutarı (KDV dahil)', 140, 1440 + (1 - k) * 40);
      g.font = font(900, 76); g.fillStyle = '#fff'; g.fillText(fmtMoney(D.total * P(t, 1.2, 2.4)).replace(',00', ''), 140, 1530 + (1 - k) * 40);
      g.restore();
    }
    footer(g, false, P(t, 0.3, 0.8));
  });

  // 8) neden biz — süreç güvencesi
  add('trust', 5.4, true, (g, t) => {
    g.fillStyle = C.dark; g.fillRect(0, 0, W, H); blobs(g, t, [C.teal, C.orange, C.cyan], 0.32, 720);
    waves(g, 90, 300, 260, P(t, 0, 0.9), C.cyan, 9);
    textLines(g, ['Süreç bizde,', 'keyfi sizde.'], 90, 560, 128, t, 0.15, { f: font(800, 120), color: '#fff' });
    g.font = font(500, 40, FB); textLines(g, wrap(g, 'TadilatBodrum.com ile tadilatınız baştan sona planlı ilerler.', W - 180, 2), 90, 820, 54, t, 0.5, { f: font(500, 40, FB), color: 'rgba(255,255,255,.75)' });
    D.lines.forEach((l, i) => {
      const k = P(t, 0.9 + i * 0.5, 1.4 + i * 0.5, E.out); if (k <= 0) return;
      const y = 980 + i * 170;
      g.save(); g.globalAlpha = k; g.translate((1 - k) * 80, 0);
      rr(g, 90, y, W - 180, 140, 36); g.fillStyle = 'rgba(255,255,255,.08)'; g.fill();
      g.beginPath(); g.arc(166, y + 70, 42, 0, Math.PI * 2); g.fillStyle = brandGrad(g, 124, y, 208, y + 140); g.fill();
      drawIcon(g, 'check', 166, y + 70, 46, '#fff', 3.2 * P(t, 1.1 + i * 0.5, 1.5 + i * 0.5));
      g.font = font(600, 38, FB); g.fillStyle = '#fff'; const wl = wrap(g, l, W - 400, 2);
      wl.forEach((s, j) => g.fillText(s, 240, y + 70 + 13 - (wl.length - 1) * 23 + j * 46));
      g.restore();
    });
  });

  // 9) kapanış: logo + iletişim
  add('outro', 3.6, false, (g, t) => {
    g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); blobs(g, t, [C.cyan + '44', C.amber + '33'], 0.5);
    const k = P(t, 0, 0.7, E.back);
    if (D.logo) { const lw = 900, lh = lw * D.logo.height / D.logo.width; g.save(); g.globalAlpha = clamp(k); g.translate(W / 2, 640); g.scale(0.8 + 0.2 * k, 0.8 + 0.2 * k); g.drawImage(D.logo, -lw / 2, -lh / 2, lw, lh); g.restore(); }
    const kb = P(t, 0.4, 1.0, E.inOut); g.fillStyle = brandGrad(g, W / 2 - 300, 0, W / 2 + 300, 0); rr(g, W / 2 - 300 * kb, 860, 600 * kb, 12, 6); g.fill();
    textLines(g, [D.total ? 'Teklifiniz hazır.' : 'Hayalinizdeki mekân', D.total ? 'Hemen başlayalım.' : 'bir mesaj uzağınızda.'], W / 2, 1010, 92, t, 0.5, { f: font(800, 80), align: 'center' });
    const rows = [[D.co.whatsapp || D.co.phone, 'phone'], [D.co.web || 'tadilatbodrum.com', 'globe'], [D.co.email, 'mail']].filter(r => r[0]);
    rows.forEach(([s, ic], i) => {
      const kk = P(t, 1.0 + i * 0.2, 1.5 + i * 0.2); if (kk <= 0) return;
      const y = 1260 + i * 120; g.save(); g.globalAlpha = kk; g.font = font(700, 46, FB); const tw = g.measureText(s).width, x0 = W / 2 - (tw + 80) / 2;
      drawIcon(g, ic, x0 + 28, y - 16, 52, C.teal, 2.2); g.fillStyle = C.ink; g.fillText(s, x0 + 80, y); g.restore();
    });
    const kw = P(t, 0.3, 1.6); waves(g, W / 2 - 160, 1660, 320, kw, C.teal, 8, 3, 30, 10);
  });

  // süreyi sınırla (güvenlik): toplam ≤ MAX_T
  let tot = S.reduce((a, s) => a + s.dur, 0);
  if (tot > MAX_T) { const k = MAX_T / tot; S.forEach(s => { s.dur *= k; }); tot = MAX_T; }
  let a = 0; S.forEach(s => { s.t0 = a; a += s.dur; });
  return { scenes: S, dur: tot };
}

/* sahne geçişi: marka degradeli eğik bant ekranı süpürür */
function transition(g, p) {
  if (p <= 0 || p >= 1) return;
  const x = lerp(-1.6, 1.6, E.inOut(p)) * (W + H);
  g.save(); g.translate(W / 2 + x * 0.5, H / 2); g.rotate(-0.42);
  const bw = H * 1.25; g.fillStyle = brandGrad(g, -bw / 2, 0, bw / 2, 0); g.fillRect(-bw / 2, -H * 1.2, bw, H * 2.4);
  g.restore();
}

export function makeTimeline(D) {
  const tl = buildScenes(D), TR = 0.32;
  tl.frame = (g, t) => {
    t = clamp(t, 0, tl.dur - 1e-4);
    const S = tl.scenes; let i = S.findIndex(s => t < s.t0 + s.dur); if (i < 0) i = S.length - 1;
    const s = S[i];
    g.save(); s.draw(g, t - s.t0, s.dur); g.restore();
    // hikâye çubuğu
    if (s.k !== 'intro') {
      const n = S.length - 1, gap = 10, bw = (W - 160 - gap * (n - 1)) / n;
      for (let j = 1; j < S.length; j++) {
        const x = 80 + (j - 1) * (bw + gap), f = j < i ? 1 : j > i ? 0 : (t - s.t0) / s.dur;
        g.fillStyle = s.dark ? 'rgba(255,255,255,.28)' : 'rgba(17,18,20,.12)'; rr(g, x, 46, bw, 8, 4); g.fill();
        if (f > 0) { g.fillStyle = s.dark ? '#fff' : C.ink; rr(g, x, 46, bw * f, 8, 4); g.fill(); }
      }
    }
    // geçişler: sahne sınırlarında
    for (let j = 1; j < S.length; j++) { const b = S[j].t0, p = (t - (b - TR)) / (2 * TR); if (p > 0 && p < 1) transition(g, p); }
    // son 0,4 sn: beyaza yumuşak kapanış yok — son kare logo ile kalır
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

