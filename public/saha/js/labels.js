/* ═══ Parça etiketleri: dolap / mutfak parçaları ve doğramalar için 100 × 60 mm etiket PDF'i ═══
 * Her fiziksel parçaya (adet kadar) benzersiz kimlik verilir; etikette QR kod (parça bilgisi, UTF-8),
 * Code128 barkod (kimlik), ölçü, malzeme ve kenar bandı şeması bulunur.
 * Etiket yazıcısı için PDF sayfa boyutu = etiket boyutu (100 × 60 mm, yatay). Türkçe karakterler için
 * her etiket 300 dpi tuvale çizilip PDF'e görüntü olarak eklenir.
 */
import { partsList } from './cabinet.js';
import { joineryList } from './joinery.js';
import { modelName, useName, frameColor, leafColor, winUse, doorUse, FRAME_COLORS, LEAF_COLORS } from './openings.js';

const LW = 100, LH = 60, DPI = 300;   // etiket mm; önizleme çözünürlüğü

function loadScript(src) {
  return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error(src + ' yüklenemedi')); document.head.append(s); });
}
let libs = null;
const loadLibs = () => libs ||= Promise.all([window.jspdf ? 0 : loadScript('vendor/jspdf.umd.min.js'), window.qrcode ? 0 : loadScript('vendor/qrcode.js')])
  .catch(e => { libs = null; throw e; });

/* ── Code128 (B kümesi): ASCII 32–126 ── */
const C128 = ['212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213', '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132', '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211', '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313', '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331', '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111', '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214', '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111', '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141', '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141', '114131', '311141', '411131', '211412', '211214', '211232', '2331112'];
export function code128(text) {
  const t = String(text).replace(/[^\x20-\x7E]/g, '?'), codes = [104];
  for (const ch of t) codes.push(ch.charCodeAt(0) - 32);
  codes.push(codes.reduce((a, c, i) => a + c * (i || 1), 0) % 103, 106);
  return codes.map(c => C128[c]).join('');   // ardışık çizgi / boşluk genişlikleri (modül)
}
/* barkod çizgileri: [[x, w], …] (mm), sessiz bölge dahil W genişliğinde */
function barRects(text, X, W) {
  const pat = code128(text), mods = [...pat].reduce((a, d) => a + +d, 0), m = W / (mods + 20), out = [];
  let cx = X + 10 * m;
  [...pat].forEach((d, i) => { const w = +d * m; if (i % 2 === 0) out.push([cx, w]); cx += w; });
  return out;
}
/* QR karesi: koyu modül satır parçaları [[x, y, w, h], …] (mm) */
function qrRects(text, X, Y, S) {
  window.qrcode.stringToBytes = window.qrcode.stringToBytesFuncs['UTF-8'];
  const q = window.qrcode(0, 'M'); q.addData(text, 'Byte'); q.make();
  const n = q.getModuleCount(), c = S / (n + 2), out = [];
  for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) {
    if (!q.isDark(r, k)) continue;
    let e = k; while (e + 1 < n && q.isDark(r, e + 1)) e++;
    out.push([X + (k + 1) * c, Y + (r + 1) * c, (e - k + 1) * c, c]); k = e;
  }
  return out;
}
function drawBarcode(x, text, X, Y, W, H) {
  const pat = code128(text), mods = [...pat].reduce((a, d) => a + +d, 0), m = W / (mods + 20);   // 10 modül sessiz bölge
  let cx = X + 10 * m;
  [...pat].forEach((d, i) => { const w = +d * m; if (i % 2 === 0) x.fillRect(Math.round(cx), Y, Math.max(1, Math.round(cx + w) - Math.round(cx)), H); cx += w; });
}
function drawQR(x, text, X, Y, S) {
  window.qrcode.stringToBytes = window.qrcode.stringToBytesFuncs['UTF-8'];
  const q = window.qrcode(0, 'M'); q.addData(text, 'Byte'); q.make();
  const n = q.getModuleCount(), c = S / (n + 2);   // 1 modül sessiz bölge
  x.fillStyle = '#fff'; x.fillRect(X, Y, S, S); x.fillStyle = '#000';
  for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) if (q.isDark(r, k)) x.fillRect(Math.floor(X + (k + 1) * c), Math.floor(Y + (r + 1) * c), Math.ceil(c), Math.ceil(c));
}

/* ── etiket verisi ── */
const colorName = c => ([...FRAME_COLORS, ...LEAF_COLORS].find(x => x[0].toLowerCase() === String(c).toLowerCase()) || [, c])[1];
const shortCode = code => String(code || 'TB').replace(/\s+/g, '');

/* dolap / mutfak parçaları: her adet ayrı etiket. cabs: [{ cab, label }] */
export function cabinetLabels(cabs, { job, tops = false } = {}) {
  const out = [], jc = shortCode(job?.code);
  cabs.forEach(({ cab, label }, ci) => {
    const rows = partsList(cab).rows.filter(r => tops || !/^Tezgah/.test(r.mat));
    let seq = 0;
    for (const r of rows) for (let i = 0; i < r.n; i++) {
      seq++;
      const id = `${jc}-D${ci + 1}-${String(seq).padStart(3, '0')}`;
      out.push({
        kind: 'part', id, title: r.part, sub: `${label} · ${r.mod}${r.n > 1 ? ` · ${i + 1}/${r.n}` : ''}`,
        big: `${r.L} × ${r.W}`, unit: 'mm', lines: [r.mat, r.band ? `Kenar bandı: ${r.band}` : 'Kenar bandı yok'],
        band: r.band, L: r.L, W: r.W,
        qr: [id, `${label} · ${r.mod} · ${r.part}`, `${r.L} x ${r.W} mm`, r.mat, r.band ? `Bant: ${r.band}` : '', job ? `İş: ${job.code} ${job.customer?.name || ''}` : '', 'TadilatBodrum.com'].filter(Boolean).join('\n'),
      });
    }
  });
  return out;
}

/* doğramalar: her kapı / pencere / boşluk ayrı etiket; gap: montaj boşluğu (imalat ölçüsü) */
export function joineryLabels(plan, { job, gap = 1, only = null } = {}) {
  const out = [], jc = shortCode(job?.code);
  for (const T of joineryList(plan, only)) for (const x of T.items) {
    const o = x.o, kind = { door: 'Kapı', window: 'Pencere', opening: 'Boşluk' }[o.type];
    const ms = o.type === 'opening' || !gap ? null : [o.w - 2 * gap, o.h - (o.type === 'window' ? 2 : 1) * gap];
    const id = `${jc}-${x.no}`;
    const lines = [
      ms ? `İmalat: ${ms[0]} × ${ms[1]} cm` : '',
      o.type === 'window' ? `Parapet ${o.sill || 0} cm · duvar ${x.t} cm` : `Duvar ${x.t} cm`,
      `${x.where}${x.open && x.open !== '—' ? ' · ' + x.open : ''}`,
      o.type === 'opening' ? '' : `Kasa: ${colorName(frameColor(o))}${o.type === 'door' ? ' · kanat: ' + colorName(leafColor(o)) : ''}${o.type === 'window' && winUse(o).frost ? ' · buzlu cam' : ''}${o.type === 'door' && doorUse(o).glass ? ' · camlı' : ''}`,
    ].filter(Boolean);
    out.push({
      kind: 'joinery', id, title: `${x.no} · ${kind}`, sub: o.type === 'opening' ? 'Kapısız boşluk' : `${useName(o)} · ${modelName(o)}`,
      big: `${o.w} × ${o.h}`, unit: 'cm (kaba)', lines, otype: o.type,
      qr: [id, `${kind} ${x.no} · ${o.type === 'opening' ? 'Boşluk' : useName(o)}`, `Kaba: ${o.w} x ${o.h} cm`, ms ? `İmalat: ${ms[0]} x ${ms[1]} cm` : '', `Mahal: ${x.where}`, x.open && x.open !== '—' ? `Açılım: ${x.open}` : '', job ? `İş: ${job.code} ${job.customer?.name || ''}` : '', 'TadilatBodrum.com'].filter(Boolean).join('\n'),
    });
  }
  return out;
}

/* ── tek etiketin çizimi (tuval; önizlemede kodlar da tuvale çizilir) ── */
const QR = [2.5, 8, 31], BAR = [35, 45, 62, 9.5];   // QR (x, y, kenar) ve barkod (x, y, w, h), mm
function drawLabel(lb, head, { dpi = DPI, codes = true } = {}) {
  const PX = dpi / 25.4;
  const fit = (x, text, maxW, size, weight = 600) => { let s = size; do { x.font = `${weight} ${s * PX}px Inter, Arial, sans-serif`; s -= 0.15; } while (x.measureText(text).width > maxW * PX && s > 1.6); return text; };
  const c = document.createElement('canvas'); c.width = Math.round(LW * PX); c.height = Math.round(LH * PX);
  const x = c.getContext('2d'), M = v => v * PX;
  x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.fillStyle = '#000'; x.textBaseline = 'alphabetic';
  // üst satır: firma · iş
  fit(x, head.left, 40, 2.6, 800); x.fillText(head.left, M(3), M(5.2));
  x.textAlign = 'right'; fit(x, head.right, 52, 2.4, 500); x.fillText(head.right, M(97), M(5.2)); x.textAlign = 'left';
  x.fillRect(M(3), M(6.6), M(94), Math.max(2, M(0.25)));
  // QR + kimlik
  if (codes) drawQR(x, lb.qr, M(QR[0]), M(QR[1]), M(QR[2]));
  x.textAlign = 'center'; fit(x, lb.id, 31, 2.5, 800); x.fillText(lb.id, M(18), M(42.5)); x.textAlign = 'left';
  // sağ blok
  const R = 36, RW = lb.kind === 'part' ? 40 : 61;
  fit(x, lb.title, RW, 4.2, 800); x.fillText(lb.title, M(R), M(12.5));
  fit(x, lb.sub, RW, 2.6, 500); x.fillText(lb.sub, M(R), M(16.6));
  fit(x, lb.big, RW - 4, 7, 800); x.fillText(lb.big, M(R), M(25));
  const bw = x.measureText(lb.big).width; x.font = `600 ${2.6 * PX}px Inter, Arial, sans-serif`; x.fillText(lb.unit, M(R) + bw + M(1.2), M(25));
  lb.lines.slice(0, 4).forEach((t, i) => { fit(x, t, lb.kind === 'part' && i < 2 ? 61 : 61, 2.6, 500); x.fillText(t, M(R), M(30 + i * 3.6)); });
  // kenar bandı şeması (parça): kalın kenar = bantlı
  if (lb.kind === 'part') {
    const bx = 79, by = 9.5, bwMax = 18, bhMax = 11, k = Math.min(bwMax / lb.L, bhMax / lb.W), w = Math.max(4, lb.L * k), h = Math.max(3, lb.W * k), ox = bx + (bwMax - w) / 2, oy = by + (bhMax - h) / 2;
    x.lineWidth = Math.max(1, M(0.25)); x.strokeRect(M(ox), M(oy), M(w), M(h));
    const long = lb.L >= lb.W, thick = Math.max(3, M(0.9));
    const edge = e => { x.fillRect(e === 'L' ? M(ox) - thick / 2 : e === 'R' ? M(ox + w) - thick / 2 : M(ox), e === 'T' ? M(oy) - thick / 2 : e === 'B' ? M(oy + h) - thick / 2 : M(oy), e === 'T' || e === 'B' ? M(w) : thick, e === 'L' || e === 'R' ? M(h) : thick); };
    const b = lb.band || '';
    if (b === '4 kenar') ['T', 'B', 'L', 'R'].forEach(edge);
    else if (b === '2 uzun kenar') (long ? ['T', 'B'] : ['L', 'R']).forEach(edge);
    else if (b) edge(long ? 'B' : 'R');
    x.font = `600 ${2 * PX}px Inter, Arial, sans-serif`; x.textAlign = 'center'; x.fillText('bant', M(bx + bwMax / 2), M(by + bhMax + 2.6)); x.textAlign = 'left';
  }
  // barkod
  x.fillStyle = '#000'; if (codes) drawBarcode(x, lb.id, M(BAR[0]), M(BAR[1]), M(BAR[2]), M(BAR[3]));
  x.textAlign = 'center'; x.font = `600 ${2.1 * PX}px Inter, Arial, sans-serif`; x.fillText(lb.id, M(R - 1 + 31), M(57.4)); x.textAlign = 'left';
  return c;
}

/* etiketler → PDF (her sayfa bir etiket, 100 × 60 mm) */
export async function labelsPdf(labels, { company = 'TadilatBodrum.com', job = null, onProgress } = {}) {
  await loadLibs();
  try { await document.fonts?.load(`800 20px Inter`); } catch { /* yazı tipi yoksa Arial */ }
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [LH, LW], compress: true });
  const head = { left: company, right: job ? `${job.code}${job.customer?.name ? ' · ' + job.customer.name : ''}` : '' };
  for (let i = 0; i < labels.length; i++) {
    if (i) pdf.addPage([LH, LW], 'landscape');
    // yazılar 200 dpi görüntü (Türkçe karakter), QR ve barkod vektör (keskin, küçük dosya)
    pdf.addImage(drawLabel(labels[i], head, { dpi: 200, codes: false }), 'PNG', 0, 0, LW, LH, undefined, 'MEDIUM');
    pdf.setFillColor(0, 0, 0);
    for (const [x, y, w, h] of qrRects(labels[i].qr, ...QR)) pdf.rect(x, y, w + 0.01, h + 0.01, 'F');
    for (const [x, w] of barRects(labels[i].id, BAR[0], BAR[2])) pdf.rect(x, BAR[1], w, BAR[3], 'F');
    if (i % 10 === 9) { onProgress?.(i + 1, labels.length); await new Promise(r => setTimeout(r, 0)); }
  }
  return pdf.output('blob');
}
/* önizleme (ilk etiketin görüntüsü) */
export async function labelPreview(lb, opts = {}) {
  await loadLibs();
  const c = drawLabel(lb, { left: opts.company || 'TadilatBodrum.com', right: opts.job ? `${opts.job.code}${opts.job.customer?.name ? ' · ' + opts.job.customer.name : ''}` : '' });
  return c.toDataURL('image/png');
}

/* seçenek penceresi: dolap parçaları ve / veya doğramalar → etiket PDF'i indir */
export async function labelsDialog({ cabs = [], plan = null, job = null, settings = {}, fname = 'etiketler', jnOnly = null } = {}) {
  const { modal, toast, downloadBlob, esc } = await import('./ui.js');
  const hasJ = !!plan?.openings?.length;
  if (!cabs.length && !hasJ) return toast('Etiketlenecek dolap ya da kapı / pencere yok', 'err');
  const opt = { cab: !!cabs.length, tops: false, jn: hasJ && !cabs.length, gap: settings.jnGap ?? 1 };
  const build = () => [...(opt.cab ? cabinetLabels(cabs, { job, tops: opt.tops }) : []), ...(opt.jn ? joineryLabels(plan, { job, gap: opt.gap, only: jnOnly }) : [])];
  const r = await modal({ title: 'Parça etiketleri (10 × 6 cm)', wide: true, body: `
    <p class="muted small">Her parça için benzersiz kimlik, QR kod (parça bilgisi) ve Code128 barkod içeren etiketler. PDF'in her sayfası bir etikettir (100 × 60 mm, yatay) — etiket yazıcısında kağıt boyutunu 100 × 60 mm seçip "gerçek boyut / %100" ile yazdırın.</p>
    ${cabs.length ? `<label class="check"><input type="checkbox" data-o="cab" ${opt.cab ? 'checked' : ''}> Dolap / mutfak parçaları <small>(${cabs.map(c => esc(c.label)).join(', ')})</small></label>
    <label class="check"><input type="checkbox" data-o="tops"> Tezgahı da etiketle</label>` : ''}
    ${hasJ ? `<label class="check"><input type="checkbox" data-o="jn" ${opt.jn ? 'checked' : ''}> Kapı / pencere (doğrama) <small>(${jnOnly ? jnOnly.size : plan.openings.length} açıklık${jnOnly && jnOnly.size < plan.openings.length ? ' — doğrama listesindeki seçim' : ''})</small></label>` : ''}
    <p class="lb-sum"></p>
    <div class="lb-prev"></div>`,
    actions: [{ k: 'no', t: 'Vazgeç' }, { k: 'ok', t: 'PDF indir', cls: 'btn-primary', icon: 'download' }],
    onOpen: el => {
      const upd = async () => {
        el.querySelectorAll('[data-o]').forEach(i => { opt[i.dataset.o] = i.checked; });
        const L = build();
        el.querySelector('.lb-sum').innerHTML = `<b>${L.length}</b> etiket${opt.cab ? ` · dolap parçası ${L.filter(l => l.kind === 'part').length}` : ''}${opt.jn ? ` · doğrama ${L.filter(l => l.kind === 'joinery').length}` : ''}`;
        const pv = el.querySelector('.lb-prev');
        if (!L.length) { pv.innerHTML = ''; return; }
        const ex = [L[0], L.find(l => l.kind !== L[0].kind)].filter(Boolean);
        try { pv.innerHTML = (await Promise.all(ex.map(l => labelPreview(l, { job, company: settings.company?.name })))).map(u => `<img src="${u}" alt="Etiket önizleme">`).join(''); } catch (e) { pv.textContent = e.message; }
      };
      el.addEventListener('change', upd); upd();
    } });
  if (r?.k !== 'ok') return;
  const L = build();
  if (!L.length) return toast('Etiket seçilmedi', 'err');
  toast(`${L.length} etiket hazırlanıyor…`);
  try {
    const blob = await labelsPdf(L, { job, company: settings.company?.name || 'TadilatBodrum.com' });
    downloadBlob(blob, `${fname}-etiketler.pdf`);
    toast(`${L.length} etiket indirildi (${Math.round(blob.size / 1024)} KB)`);
  } catch (e) { console.error(e); toast('Etiketler hazırlanamadı: ' + e.message, 'err'); }
}
