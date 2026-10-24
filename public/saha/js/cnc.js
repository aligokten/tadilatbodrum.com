/* ═══ CNC kesim şablonu: mutfak / dolap parçalarını levhalara yerleştir, DXF olarak ver ═══
 * Parçalar dolap tasarımının kesim listesinden (partsList) gelir; malzemeye göre gruplanır ve
 * MaxRects (en kısa kenar uyumu) ile levhalara yerleştirilir. Birim mm, y yukarı.
 * DXF katmanları CAM yazılımında işlem eşlemesi için ad içinde çap / derinlik taşır:
 *   KESIM_Z18 (dış kontur, levha kalınlığı), MENTESE_D35_Z13 (kase), RAF_PIMI_D5_Z12, BANT (kenar bandı işareti), YAZI, LEVHA.
 */
import { partsList } from './cabinet.js';
import { esc, modal, toast, downloadBlob } from './ui.js';

export const CNC_DEF = { sheetW: 2800, sheetH: 2100, kerf: 4, trim: 10, grain: false, tops: false };

const thick = mat => { const m = /(\d+(?:[.,]\d+)?)\s*mm/.exec(mat || ''); return m ? Math.round(parseFloat(m[1].replace(',', '.'))) : 18; };
const tr = s => String(s).replace(/ğ/g, 'g').replace(/Ğ/g, 'G').replace(/ş/g, 's').replace(/Ş/g, 'S').replace(/ı/g, 'i').replace(/İ/g, 'I')
  .replace(/ç/g, 'c').replace(/Ç/g, 'C').replace(/ö/g, 'o').replace(/Ö/g, 'O').replace(/ü/g, 'u').replace(/Ü/g, 'U').replace(/·/g, '-').replace(/[^\x20-\x7E]/g, '');

/* tasarımlardan tek tek parçalar: [{ id, mod, part, mat, L, W (mm), band, ops, src }] */
export function cncParts(cabs, { tops = false } = {}) {
  const out = [];
  cabs.forEach(({ cab, label }, ci) => {
    const pre = cabs.length > 1 ? `${ci + 1}-` : '';
    for (const r of partsList(cab).rows) {
      if (!tops && /^Tezgah/.test(r.mat)) continue;
      if (/PVC/.test(r.mat)) continue;                  // PVC baza profilden kesilir, levhadan değil
      for (let i = 0; i < r.n; i++) out.push({ id: out.length + 1, mod: pre + r.mod, part: r.part, mat: r.mat, L: r.L, W: r.W, band: r.band, ops: r.ops || null, src: label });
    }
  });
  return out;
}

/* MaxRects yerleşimi; malzeme başına levhalar */
export function nest(parts, o = {}) {
  const { sheetW, sheetH, kerf, trim, grain } = { ...CNC_DEF, ...o };
  const UW = sheetW - 2 * trim + kerf, UH = sheetH - 2 * trim + kerf;   // son parçanın ardında testere payı gerekmez
  const groups = new Map();
  for (const p of parts) { if (!groups.has(p.mat)) groups.set(p.mat, []); groups.get(p.mat).push(p); }
  const sheets = [], unfit = [];
  for (const [mat, list] of groups) {
    const mine = [];
    const newSheet = () => { const s = { mat, t: thick(mat), free: [{ x: 0, y: 0, w: UW, h: UH }], placed: [] }; mine.push(s); return s; };
    const sorted = [...list].sort((a, b) => Math.max(b.L, b.W) - Math.max(a.L, a.W) || b.L * b.W - a.L * a.W);
    for (const p of sorted) {
      const opts = [[p.L + kerf, p.W + kerf, false]]; if (!grain && p.L !== p.W) opts.push([p.W + kerf, p.L + kerf, true]);
      if (!opts.some(([w, h]) => w <= UW && h <= UH)) { unfit.push(p); continue; }
      let best = null;
      for (const s of mine) for (const f of s.free) for (const [w, h, rot] of opts) {
        if (w > f.w || h > f.h) continue;
        const sc = Math.min(f.w - w, f.h - h), sc2 = Math.max(f.w - w, f.h - h);
        if (!best || sc < best.sc || (sc === best.sc && sc2 < best.sc2)) best = { s, x: f.x, y: f.y, w, h, rot, sc, sc2 };
      }
      if (!best) { const s = newSheet(); const [w, h, rot] = opts.find(([w, h]) => w <= UW && h <= UH); best = { s, x: 0, y: 0, w, h, rot }; }
      const { s } = best;
      s.placed.push({ p, x: trim + best.x, y: trim + best.y, w: best.w - kerf, h: best.h - kerf, rot: best.rot });
      // serbest dikdörtgenleri böl ve kapsananları at
      const R = { x: best.x, y: best.y, w: best.w, h: best.h }, nf = [];
      for (const f of s.free) {
        if (R.x >= f.x + f.w || R.x + R.w <= f.x || R.y >= f.y + f.h || R.y + R.h <= f.y) { nf.push(f); continue; }
        if (R.x > f.x) nf.push({ x: f.x, y: f.y, w: R.x - f.x, h: f.h });
        if (R.x + R.w < f.x + f.w) nf.push({ x: R.x + R.w, y: f.y, w: f.x + f.w - R.x - R.w, h: f.h });
        if (R.y > f.y) nf.push({ x: f.x, y: f.y, w: f.w, h: R.y - f.y });
        if (R.y + R.h < f.y + f.h) nf.push({ x: f.x, y: R.y + R.h, w: f.w, h: f.y + f.h - R.y - R.h });
      }
      s.free = nf.filter((a, i) => !nf.some((b, j) => j !== i && a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h && (j < i || a.w * a.h < b.w * b.h)));
    }
    mine.forEach(s => { s.use = s.placed.reduce((a, q) => a + q.w * q.h, 0) / (sheetW * sheetH); delete s.free; });
    sheets.push(...mine);
  }
  return { sheets, unfit, sheetW, sheetH, kerf, trim };
}

/* parçanın yerel işlemleri (u: boy L boyunca, v: en W boyunca; delik yüzü = iç yüz) */
function partOps(p) {
  const holes = [], bands = [], grooves = [];
  if (p.ops?.groove) {  // gizli kulp: tutma kenarına paralel kanal freze (kenardan 10 mm, 10 mm derinlik); kapakta boy = L, en = W
    const g = p.ops.groove;
    if (g === 'side') grooves.push([[0, p.W - 10], [p.L, p.W - 10]]);
    else { const u = g === 'top' ? p.L - 10 : 10; grooves.push([[u, 0], [u, p.W]]); }
  }
  if (p.ops?.hinge) {   // menteşe kaseleri: bir uzun kenarda, kenardan 22,5 mm; uçlardan 100 mm, aradakiler eşit
    const n = p.ops.hinge, long = p.L >= p.W, len = long ? p.L : p.W;
    for (let i = 0; i < n; i++) { const a = n === 1 ? len / 2 : 100 + i * (len - 200) / (n - 1); holes.push({ ...(long ? { u: a, v: 22.5 } : { u: 22.5, v: a }), d: 35, z: 13 }); }
  }
  if (p.ops?.pins) {    // raf pimi sıraları: ön ve arka kenardan 37 mm, 32 mm aralıkla (orta bölge)
    const long = p.L >= p.W, len = long ? p.L : p.W, wid = long ? p.W : p.L;
    for (let a = 160; a <= len - 160; a += 32) for (const b of [37, wid - 37]) holes.push({ ...(long ? { u: a, v: b } : { u: b, v: a }), d: 5, z: 12 });
  }
  const longU = p.L >= p.W;   // kenar bandı: uzun kenar(lar) / 4 kenar
  if (p.band === '4 kenar') bands.push('u0', 'u1', 'v0', 'v1');
  else if (p.band === '2 uzun kenar') bands.push(...(longU ? ['v0', 'v1'] : ['u0', 'u1']));
  else if (p.band === '1 uzun kenar' || p.band === 'ön kenar') bands.push(longU ? 'v1' : 'u1');
  return { holes, bands, grooves };
}

/* levhalar → DXF (R12, mm). Levhalar yan yana, aralarında 300 mm */
export function cncDxf(res, title = '') {
  const { sheets, sheetW, sheetH } = res, GAP = 300;
  const thicks = [...new Set(sheets.map(s => s.t))];
  const layers = [['LEVHA', 8], ...thicks.map(t => [`KESIM_Z${t}`, 7]), ['MENTESE_D35_Z13', 5], ['RAF_PIMI_D5_Z12', 3], ['KANAL_FREZE_Z10', 6], ['BANT', 30], ['YAZI', 2]];
  const out = ['0', 'SECTION', '2', 'HEADER', '9', '$ACADVER', '1', 'AC1009', '9', '$INSUNITS', '70', '4', '0', 'ENDSEC',
    '0', 'SECTION', '2', 'TABLES', '0', 'TABLE', '2', 'LAYER', '70', String(layers.length + 1),
    ...[['0', 7], ...layers].flatMap(([n, c]) => ['0', 'LAYER', '2', n, '70', '0', '62', String(c), '6', 'CONTINUOUS']),
    '0', 'ENDTAB', '0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES'];
  const f = v => (+v).toFixed(2);
  const poly = (L, pts) => { out.push('0', 'POLYLINE', '8', L, '66', '1', '70', '1', '10', '0', '20', '0', '30', '0'); for (const [x, y] of pts) out.push('0', 'VERTEX', '8', L, '10', f(x), '20', f(y), '30', '0'); out.push('0', 'SEQEND', '8', L); };
  const line = (L, x1, y1, x2, y2) => out.push('0', 'LINE', '8', L, '10', f(x1), '20', f(y1), '30', '0', '11', f(x2), '21', f(y2), '31', '0');
  const circle = (L, x, y, r) => out.push('0', 'CIRCLE', '8', L, '10', f(x), '20', f(y), '30', '0', '40', f(r));
  const text = (x, y, s, h, ang = 0) => out.push('0', 'TEXT', '8', 'YAZI', '10', f(x), '20', f(y), '30', '0', '40', f(h), '1', tr(s), '50', String(ang), '72', '1', '73', '2', '11', f(x), '21', f(y), '31', '0');
  sheets.forEach((s, i) => {
    const ox = i * (sheetW + GAP);
    poly('LEVHA', [[ox, 0], [ox + sheetW, 0], [ox + sheetW, sheetH], [ox, sheetH]]);
    text(ox + sheetW / 2, sheetH + 90, `${title ? title + ' - ' : ''}Levha ${i + 1}/${sheets.length}`, 50);
    text(ox + sheetW / 2, sheetH + 35, `${s.mat} - ${sheetW}x${sheetH}x${s.t} mm - ${s.placed.length} parca - doluluk %${Math.round(s.use * 100)}`, 30);
    for (const q of s.placed) {
      const x0 = ox + q.x, y0 = q.y, p = q.p;
      poly(`KESIM_Z${s.t}`, [[x0, y0], [x0 + q.w, y0], [x0 + q.w, y0 + q.h], [x0, y0 + q.h]]);
      // yerelden levhaya: döndürülmemişse u→x, v→y; döndürülmüşse v→x, u→y
      const P = (u, v) => q.rot ? [x0 + v, y0 + u] : [x0 + u, y0 + v];
      const { holes, bands, grooves } = partOps(p);
      for (const [a, c] of grooves) { const A = P(...a), C = P(...c); line('KANAL_FREZE_Z10', A[0], A[1], C[0], C[1]); }
      for (const hl of holes) { const [x, y] = P(hl.u, hl.v); circle(hl.d === 35 ? 'MENTESE_D35_Z13' : 'RAF_PIMI_D5_Z12', x, y, hl.d / 2); }
      const k = 4;
      for (const b of bands) {
        const [a, c] = { u0: [[k, k], [k, p.W - k]], u1: [[p.L - k, k], [p.L - k, p.W - k]], v0: [[k, k], [p.L - k, k]], v1: [[k, p.W - k], [p.L - k, p.W - k]] }[b];
        const A = P(...a), C = P(...c); line('BANT', A[0], A[1], C[0], C[1]);
      }
      const vert = q.h > q.w, th = Math.max(12, Math.min(40, Math.min(q.w, q.h) / 5)), cx = x0 + q.w / 2, cy = y0 + q.h / 2;
      const d1 = vert ? [th * 0.7, 0] : [0, th * 0.7], d2 = vert ? [-th * 0.7, 0] : [0, -th * 0.7];
      text(cx + d1[0], cy + d1[1], `${p.id}. ${p.mod} ${p.part}`, th, vert ? 90 : 0);
      text(cx + d2[0], cy + d2[1], `${p.L} x ${p.W}${p.band ? ' - bant: ' + p.band : ''}`, th * 0.8, vert ? 90 : 0);
    }
  });
  out.push('0', 'ENDSEC', '0', 'EOF');
  return out.join('\r\n');
}

/* önizleme: levha SVG'leri */
export function sheetSvg(s, res, W = 280) {
  const { sheetW, sheetH } = res, k = W / sheetW, H = sheetH * k;
  const col = s.mat.startsWith('Kapak') ? '#FDE3D6' : s.mat.startsWith('Arkalık') ? '#E6ECEF' : s.mat.startsWith('Tezgah') ? '#E9E2D3' : '#D8F1F1';
  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H.toFixed(0)}"><rect width="${W}" height="${H}" fill="#F4F5F6" stroke="#9AA1A9"/>
    ${s.placed.map(q => `<rect x="${(q.x * k).toFixed(1)}" y="${(H - (q.y + q.h) * k).toFixed(1)}" width="${(q.w * k).toFixed(1)}" height="${(q.h * k).toFixed(1)}" fill="${col}" stroke="#24272B" stroke-width=".6"><title>${q.p.id}. ${q.p.mod} ${q.p.part} — ${q.p.L}×${q.p.W}</title></rect>`).join('')}</svg>`;
}

/* seçenekler + levha önizlemesi + DXF indirme. cabs: [{ cab, label }] */
export async function cncDialog(cabs, { title = 'CNC', fname = 'cnc-kesim', settings = null, saveSettings = null } = {}) {
  if (!cabs.length) return toast('Çizimde mutfak / dolap yok', 'err');
  const o = { ...CNC_DEF, ...(settings?.cnc || {}) };
  let res = null;
  const r = await modal({ title: 'CNC kesim şablonu (DXF)', wide: true, body: `
    <p class="muted small">${cabs.map(c => esc(c.label)).join(', ')} — parçalar kesim listesinden alınır, malzemeye göre levhalara yerleştirilir.</p>
    <div class="grid2 cnc-opts">
      <label>Levha boyu (mm)<input class="inp" type="number" data-o="sheetW" value="${o.sheetW}" min="500" step="10"></label>
      <label>Levha eni (mm)<input class="inp" type="number" data-o="sheetH" value="${o.sheetH}" min="500" step="10"></label>
      <label>Testere / freze payı (mm)<input class="inp" type="number" data-o="kerf" value="${o.kerf}" min="0" max="20" step="0.5"></label>
      <label>Kenar tıraşı (mm)<input class="inp" type="number" data-o="trim" value="${o.trim}" min="0" max="50" step="1"></label>
    </div>
    <label class="check"><input type="checkbox" data-o="grain" ${o.grain ? 'checked' : ''}> Desen yönü önemli — parçalar döndürülmesin (ahşap desenli levha)</label>
    <label class="check"><input type="checkbox" data-o="tops" ${o.tops ? 'checked' : ''}> Tezgahı da ekle (lamine tezgah levhadan kesilecekse)</label>
    <div class="cnc-sum"></div>
    <div class="cnc-prev"></div>
    <p class="muted small">DXF katmanları: KESIM_Z18 / KESIM_Z8 (dış kontur), MENTESE_D35_Z13 (menteşe kasesi, kapak iç yüzü), RAF_PIMI_D5_Z12, BANT (kenar bandı işareti), YAZI, LEVHA. Ölçüler mm; delikler iç yüzden delinir. Kulp delikleri eklenmez.</p>`,
    actions: [{ k: 'no', t: 'Kapat' }, { k: 'ok', t: 'DXF indir', cls: 'btn-primary', icon: 'download' }],
    onOpen: el => {
      const run = () => {
        el.querySelectorAll('[data-o]').forEach(i => { o[i.dataset.o] = i.type === 'checkbox' ? i.checked : Math.max(0, +i.value || 0); });
        o.sheetW = Math.max(500, o.sheetW); o.sheetH = Math.max(500, o.sheetH);
        res = nest(cncParts(cabs, o), o);
        const by = new Map(); res.sheets.forEach(s => { const g = by.get(s.mat) || { n: 0, p: 0, a: 0 }; g.n++; g.p += s.placed.length; g.a += s.use; by.set(s.mat, g); });
        el.querySelector('.cnc-sum').innerHTML = `<table class="tbl"><thead><tr><th>Malzeme</th><th class="r">Parça</th><th class="r">Levha</th><th class="r">Ort. doluluk</th></tr></thead><tbody>
          ${[...by].map(([m, g]) => `<tr><td>${esc(m)}</td><td class="r">${g.p}</td><td class="r"><b>${g.n}</b></td><td class="r">%${Math.round(g.a / g.n * 100)}</td></tr>`).join('')}</tbody></table>
          ${res.unfit.length ? `<p class="small" style="color:#C0392B">Levhaya sığmayan ${res.unfit.length} parça: ${res.unfit.map(p => `${esc(p.mod)} ${esc(p.part)} ${p.L}×${p.W}`).join(', ')}</p>` : ''}`;
        el.querySelector('.cnc-prev').innerHTML = res.sheets.map((s, i) => `<figure><figcaption><b>Levha ${i + 1}</b> · ${esc(s.mat)} · %${Math.round(s.use * 100)}</figcaption>${sheetSvg(s, res)}</figure>`).join('');
      };
      el.addEventListener('change', run); run();
    } });
  if (r?.k !== 'ok' || !res?.sheets.length) return;
  if (settings && saveSettings) { settings.cnc = { ...o }; saveSettings(); }
  downloadBlob(new Blob([cncDxf(res, title)], { type: 'application/dxf' }), `${fname}-cnc.dxf`);
  toast(`CNC DXF indirildi — ${res.sheets.length} levha`);
}
