/* ═══ İçe aktarma penceresi — DXF / DWG / PDF → plan ═══ */
import { icon, esc, h, $, $$, modal, toast, debounce } from './ui.js';
import { detectFormat, readDXF, readPDF, recognize, guessLayers, guessScale, rawToSvg, rawToPng } from './importer.js';
import { planThumbSvg } from './plan2d.js';
import { planBounds } from './plan-geom.js';

const SCALES = [20, 25, 50, 75, 100, 200, 500];
const PT_CM = 2.54 / 72;              // 1 punto = 0.03528 cm (kağıt üzerinde)

export async function openImportDialog(ed, { addImage } = {}) {
  let raw = null, result = null, name = '';
  const body = h(`<div class="imp">
    <label class="imp-drop">${icon('upload')}<b>DXF, DWG veya PDF çizim seçin</b><small>AutoCAD rölöve / mimari plan · vektör PDF · taranmış PDF</small>
      <input type="file" accept=".dxf,.dwg,.pdf,application/pdf,image/vnd.dxf" hidden></label>
    <div class="imp-msg" hidden></div>
    <div class="imp-main" hidden>
      <div class="imp-opts">
        <div class="imp-unit"></div>
        <label>Duvar algılama<select class="inp sm" data-o="mode"><option value="auto">Çift çizgi (mimari çizim)</option><option value="single">Tek çizgi (kroki)</option></select></label>
        <div class="grid2"><label>Min. kalınlık<div class="inp-unit sm"><input type="number" data-o="minT" value="7"><span>cm</span></div></label>
        <label>Maks. kalınlık<div class="inp-unit sm"><input type="number" data-o="maxT" value="40"><span>cm</span></div></label></div>
        <label class="check"><input type="checkbox" data-o="openings" checked> Kapı / pencere tanı</label>
        <label class="check"><input type="checkbox" data-o="rooms" checked> Odaları bul (yazılardan ad al)</label>
        <label class="check"><input type="checkbox" data-o="underlay" checked> Orijinal çizimi altlık olarak ekle</label>
        <label class="check"><input type="checkbox" data-o="replace" ${ed.plan.walls.length ? '' : 'checked'}> Mevcut planın yerine koy</label>
        <details class="imp-layers"><summary>Katmanlar <span></span></summary><div class="imp-layer-list"></div></details>
      </div>
      <div class="imp-prev">
        <div class="seg" data-v><button class="on" data-p="res">Sonuç</button><button data-p="raw">Orijinal</button></div>
        <div class="imp-canvas"></div>
        <p class="imp-stats"></p>
      </div>
    </div>
  </div>`);
  const opt = { unitCm: 1, layers: [], mode: 'auto', minT: 7, maxT: 40, minLen: 10, defT: 15, openings: true, rooms: true, minGap: 50, maxGap: 320, underlay: true, replace: !ed.plan.walls.length };
  let view = 'res';
  const msg = (html, kind = '') => { const m = $('.imp-msg', body); m.hidden = !html; m.className = 'imp-msg ' + kind; m.innerHTML = html; };

  const run = debounce(() => {
    if (!raw) return;
    try {
      result = recognize(raw, opt);
      const st = result.stats;
      $('.imp-stats', body).innerHTML = st.walls
        ? `<b>${st.walls}</b> duvar · <b>${st.doors}</b> kapı · <b>${st.windows}</b> pencere${st.gaps ? ` · <b>${st.gaps}</b> boşluk` : ''} · <b>${st.rooms}</b> oda`
        : `<span class="warn">${icon('alert')} Duvar bulunamadı — katman seçimini, birimi/ölçeği veya "Tek çizgi" modunu deneyin.</span>`;
      draw();
    } catch (e) { console.error(e); msg(`${icon('alert')} Dönüştürme hatası: ${esc(e.message)}`, 'err'); }
  }, 200);
  const draw = () => {
    const c = $('.imp-canvas', body);
    if (view === 'raw' || !result?.plan.walls.length) c.innerHTML = rawToSvg(raw, opt, { W: 900, H: 600 }).svg || '';
    else c.innerHTML = planThumbSvg(result.plan, 900, 600);
  };

  const unitUI = () => {
    const box = $('.imp-unit', body);
    if (raw.format === 'pdf') {
      const g = guessScale(raw);                       // cm/punto tahmini
      const est = g ? g / PT_CM : 0;               // tahmini ölçek paydası
      const std = est ? SCALES.reduce((b, s) => Math.abs(s - est) < Math.abs(b - est) ? s : b, 50) : 50;
      const guessN = !est || Math.abs(est / std - 1) < 0.06 ? std : Math.round(est);   // standarda yakın değilse tahmini kullan
      const scales = SCALES.includes(guessN) ? SCALES : [...SCALES, guessN].sort((a, b) => a - b);
      opt.unitCm = guessN * PT_CM;
      box.innerHTML = `${raw.pages > 1 ? `<label>Sayfa<select class="inp sm" data-page>${Array.from({ length: raw.pages }, (_, i) => `<option value="${i + 1}" ${i + 1 === raw.page ? 'selected' : ''}>${i + 1}</option>`).join('')}</select></label>` : ''}
        <label>Çizim ölçeği ${g ? '<small>(tahmini — gerekirse değiştirin)</small>' : ''}<select class="inp sm" data-scale>${scales.map(s => `<option value="${s}" ${s === guessN ? 'selected' : ''}>1:${s}</option>`).join('')}<option value="x">Özel…</option></select></label>`;
      $('[data-scale]', box).onchange = async e => {
        let v = e.target.value;
        if (v === 'x') { v = parseFloat(prompt('Ölçek paydası (örn. 50 → 1:50)', '50')); if (!(v > 0)) return; e.target.add(new Option('1:' + v, v, true, true)); }
        opt.unitCm = +v * PT_CM; run();
      };
      $('[data-page]', box)?.addEventListener('change', async e => { await load(raw.bytes, +e.target.value); });
    } else {
      let g = raw.unitCm, src = 'dosyadan';
      if (!g) { const cm = guessScale(raw); g = cm ? [0.1, 1, 100, 2.54].reduce((b, u) => Math.abs(Math.log(u / cm)) < Math.abs(Math.log(b / cm)) ? u : b, 1) : 1; src = 'tahmini'; }
      opt.unitCm = g;
      const U = [[0.1, 'mm'], [1, 'cm'], [100, 'm'], [2.54, 'inç']];
      box.innerHTML = `<label>Çizim birimi <small>(${src})</small><select class="inp sm" data-unit>${U.map(([v, t]) => `<option value="${v}" ${v === g ? 'selected' : ''}>${t}</option>`).join('')}</select></label>`;
      $('[data-unit]', box).onchange = e => { opt.unitCm = +e.target.value; run(); };
    }
  };
  const layersUI = () => {
    const list = $('.imp-layer-list', body);
    opt.layers = raw.format === 'pdf' ? ['PDF'] : guessLayers(raw.layers);
    list.innerHTML = raw.layers.map(l => `<label class="check"><input type="checkbox" value="${esc(l.name)}" ${opt.layers.includes(l.name) ? 'checked' : ''}> ${esc(l.name)} <small>${l.n}</small></label>`).join('');
    $('.imp-layers summary span', body).textContent = `(${opt.layers.length}/${raw.layers.length} seçili)`;
    if (raw.format === 'dxf') $('.imp-layers', body).open = true;
    list.onchange = () => { opt.layers = $$('input:checked', list).map(i => i.value); $('.imp-layers summary span', body).textContent = `(${opt.layers.length}/${raw.layers.length} seçili)`; run(); };
  };

  async function load(bytes, page = 1) {
    msg(`<div class="spin sm"></div> Çizim okunuyor…`);
    $('.imp-main', body).hidden = true;
    const fmt = detectFormat(name, bytes);
    try {
      if (fmt === 'dwg') {
        msg(`${icon('alert')} <div><b>DWG doğrudan okunamıyor.</b> DWG, Autodesk'in kapalı formatıdır. Çizimi bir kez DXF olarak kaydedip onu yükleyin:
          <ul><li><b>AutoCAD:</b> Farklı Kaydet → Dosya türü: <i>AutoCAD DXF (*.dxf)</i> (komut: <code>DXFOUT</code>)</li>
          <li><b>Ücretsiz:</b> ODA File Converter veya LibreCAD ile DWG → DXF</li></ul></div>`, 'warn');
        return;
      }
      if (fmt === 'dxf') raw = await readDXF(new TextDecoder(guessEncoding(bytes)).decode(bytes));
      else if (fmt === 'pdf') raw = await readPDF(bytes, page);
      else { msg(`${icon('alert')} Desteklenmeyen dosya. DXF, DWG veya PDF seçin.`, 'err'); return; }
      raw.bytes = bytes;
      if (raw.raster) {
        msg(`${icon('image')} <div><b>Bu PDF taranmış bir görüntü</b> (çizgi bilgisi yok), otomatik dönüştürülemez.
          Sayfayı plana <b>altlık</b> olarak ekleyip ölçekleyebilir, üzerinden hızlıca çizebilirsiniz.</div>
          <button class="btn btn-primary btn-sm" data-raster>${icon('image')}Altlık olarak ekle</button>`, 'warn');
        $('[data-raster]', body).onclick = async () => {
          if (!addImage) return;
          const ph = await addImage(raw.raster, name);
          const b = planBounds(ed.plan);
          ed.snap();
          ed.plan.meta.bg = { photoId: ph.id, x: b ? b.x0 : 0, y: b ? b.y0 : 0, w: raw.rasterSize.w * 50 * PT_CM, ar: raw.rasterSize.h / raw.rasterSize.w, opacity: 0.55 };
          await ed.loadBg(); ed.changed(); ed.fit(); closeFn?.(null);
          ed.setTool('calib');
          toast('Altlık eklendi — bilinen bir ölçünün iki ucunu işaretleyip gerçek değerini girin');
        };
        return;
      }
      msg(raw.segs.length ? '' : `${icon('alert')} Çizimde çizgi bulunamadı.`, raw.segs.length ? '' : 'err');
      $('.imp-main', body).hidden = false;
      unitUI(); layersUI(); run();
    } catch (e) { console.error(e); msg(`${icon('alert')} Dosya okunamadı: ${esc(e.message)}`, 'err'); }
  }

  $('input[type=file]', body).onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    name = f.name; $('.imp-drop b', body).textContent = f.name;
    await load(new Uint8Array(await f.arrayBuffer()));
  };
  $$('[data-o]', body).forEach(el => el.onchange = () => {
    opt[el.dataset.o] = el.type === 'checkbox' ? el.checked : el.type === 'number' ? +el.value : el.value; run();
  });
  $('[data-v]', body).onclick = e => { const b = e.target.closest('[data-p]'); if (!b) return; view = b.dataset.p; $$('[data-p]', body).forEach(x => x.classList.toggle('on', x === b)); draw(); };

  let closeFn = null;
  const r = await modal({ title: 'Çizimden plana aktar', body, wide: true,
    actions: [{ k: 'no', t: 'Vazgeç' }, { k: 'ok', t: 'Plana aktar', cls: 'btn-primary', icon: 'check', validate: () => !!result?.plan.walls.length }],
    onOpen: (_, close) => { closeFn = close; } });
  if (r?.k !== 'ok' || !result) return;

  // ── plana uygula ──
  const P = result.plan;
  ed.snap();
  let dx = 0, dy = 0;
  if (opt.replace) {
    P.meta.wallH = ed.plan.meta.wallH; P.meta.wallColor = ed.plan.meta.wallColor;
    ed.plan.walls = P.walls; ed.plan.openings = P.openings; ed.plan.rooms = P.rooms;
    ed.plan.items = []; ed.plan.dims = []; ed.plan.labels = []; ed.plan.meta.wallT = P.meta.wallT; ed.plan.meta.bg = null;
  } else {
    const b = planBounds(ed.plan); if (b) { dx = b.x1 + 150; dy = b.y0; }
    const mv = p => ({ x: p.x + dx, y: p.y + dy });
    P.walls.forEach(w => { w.a = mv(w.a); w.b = mv(w.b); }); P.rooms.forEach(rm => { rm.pts = rm.pts.map(mv); });
    ed.plan.walls.push(...P.walls); ed.plan.openings.push(...P.openings); ed.plan.rooms.push(...P.rooms);
  }
  if (opt.underlay && addImage) {
    try {
      const png = await rawToPng(raw, opt, P.origin);
      const ph = await addImage(png.blob, name.replace(/\.\w+$/, '') + ' (altlık)');
      ed.plan.meta.bg = { photoId: ph.id, x: png.x + dx, y: png.y + dy, w: png.w, ar: png.ar, opacity: 0.35 };
      await ed.loadBg();
    } catch (e) { console.warn('Altlık eklenemedi', e); }
  }
  ed.sel = null; ed.changed(); ed.fit();
  toast(`${P.walls.length} duvar, ${P.openings.length} açıklık, ${P.rooms.length} oda eklendi${raw.format === 'pdf' ? ' — ölçek yanlışsa "Ölçekle" ile düzeltin' : ''}`);
}

/* Türkçe DXF'ler çoğunlukla ANSI_1254 kodlu; $DWGCODEPAGE'e bak */
function guessEncoding(bytes) {
  const head = new TextDecoder('latin1').decode(bytes.slice(0, 4000));
  const m = head.match(/\$DWGCODEPAGE\s*\r?\n\s*3\s*\r?\n\s*(\S+)/);
  if (/AC10(2[1-9]|3\d)/.test(head)) return 'utf-8';             // AutoCAD 2007+ DXF: UTF-8
  if (m && /1254/.test(m[1])) return 'windows-1254';
  if (m && /1252/.test(m[1])) return 'windows-1252';
  return 'utf-8';
}
