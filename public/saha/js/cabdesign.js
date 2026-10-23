/* ═══ Mutfak / giysi dolabı tasarlayıcı ekranı ═══
 * Rölövedeki bir dolap dizisini (type: 'cabinet') düzenler: modüller, ölçüler, malzeme,
 * ön görünüş (kotlu), iç düzen, 3D önizleme, kesim listesi, PDF / DXF / CSV ve teklife aktarım.
 */
import { icon, esc, h, $, $$, toast, confirmDlg, downloadBlob, fmtNum } from './ui.js';
import {
  MT, typesFor, mod, doorCount, autoFill, layoutRow, rowLen, runLength, itemDims, elevation, elevationSvg, elevationDxf,
  partsList, partsCsv, quoteItems, FRONTS, BODIES, TOPS, HANDLES, HANDLE_COLORS, pick, fmt, WARD_DOORS, isOpenMod, modWarn, modD, shelfPos, shelfable, modInner,
} from './cabinet.js';

const clone = o => JSON.parse(JSON.stringify(o));

export function openCabinetDesigner(item, ctx) {
  return new Promise(resolve => {
    const cab = clone(item.cab), kind = cab.kind, isW = kind === 'wardrobe';
    let label = item.label || (isW ? 'Giysi dolabı' : 'Mutfak');
    let sel = null, view = 'front', dirty = false, p3 = null;
    const avail = ctx.avail || runLength(cab);
    let wantL = Math.round(avail * 2) / 2;
    const rows = isW ? ['ward'] : ['base', 'upper'];
    const rowName = { base: 'Alt / boy', upper: 'Üst', ward: 'Dolap' };

    const el = h(`<div class="cd" role="dialog" aria-modal="true">
      <header class="cd-bar">
        <button class="icon-btn" data-x aria-label="Kapat">${icon('x')}</button>
        <div class="cd-title"><small>${isW ? (cab.style === 'vestiyer' ? 'Vestiyer tasarlayıcı' : 'Giysi dolabı tasarlayıcı') : 'Mutfak tasarlayıcı'}</small><input class="cd-name" value="${esc(label)}" aria-label="Ad"></div>
        <nav class="cd-tabs">
          <button data-v="front" class="on">${icon('ruler')}<span>Ön görünüş</span></button>
          <button data-v="inside">${icon('layers')}<span>İç düzen</span></button>
          <button data-v="3d">${icon('cube')}<span>3D</span></button>
          <button data-v="list">${icon('list')}<span>Kesim listesi</span></button>
        </nav>
        <div class="cd-act">
          <button class="btn btn-ghost btn-sm" data-a="pdf" title="Çizim + kesim listesi PDF">${icon('print')}<span>PDF</span></button>
          <button class="btn btn-ghost btn-sm" data-a="dxf" title="Ön görünüş DXF (AutoCAD)">${icon('download')}<span>DXF</span></button>
          <button class="btn btn-ghost btn-sm" data-a="csv" title="Kesim listesi CSV (Excel)">${icon('download')}<span>CSV</span></button>
          <button class="btn btn-ghost btn-sm" data-a="lbl" title="Her parça için QR / barkodlu 10 × 6 cm etiket (PDF)">${icon('grid')}<span>Etiket</span></button>
          <button class="btn btn-ghost btn-sm" data-a="cnc" title="CNC kesim şablonu: parçalar levhalara yerleşik DXF">${icon('layers')}<span>CNC</span></button>
          <button class="btn btn-ghost btn-sm" data-a="quote" title="Teklife kalem olarak ekle">${icon('file')}<span>Teklife ekle</span></button>
          <button class="btn btn-primary btn-sm" data-a="apply">${icon('check')}<span>Uygula</span></button>
        </div>
      </header>
      <div class="cd-main">
        <section class="cd-stage">
          <div class="cd-view"></div>
          <div class="cd-under">
            ${rows.map(r => `<button class="btn btn-xs btn-ghost" data-add="${r}">${icon('plus')}${rowName[r]} modül</button>`).join('')}
            <span class="cd-fit"></span>
          </div>
        </section>
        <aside class="cd-side"></aside>
      </div>
    </div>`);
    document.body.append(el); document.body.classList.add('dv-open');
    const V = $('.cd-view', el), side = $('.cd-side', el);

    /* ── yardımcılar ── */
    const find = id => { for (const r of ['base', 'upper', 'ward']) { const i = (cab[r] || []).findIndex(m => m.id === id); if (i >= 0) return { r, i, m: cab[r][i] }; } return null; };
    const changed = () => { dirty = true; draw(); };
    const fitInfo = () => {
      const L = runLength(cab), d = L - avail;
      $('.cd-fit', el).innerHTML = `Dizi <b>${fmt(L)}</b> cm · Duvar <b>${fmt(avail)}</b> cm ${Math.abs(d) < 0.5 ? '<span class="ok">✓ tam</span>' : `<span class="warn">${d > 0 ? fmt(d) + ' cm fazla' : fmt(-d) + ' cm eksik'}</span> <button class="btn btn-xs btn-ghost" data-a="fitlast">Farkı son modüle uygula</button>`}`;
    };

    /* ── çizim alanı ── */
    function draw() {
      $$('.cd-tabs button', el).forEach(b => b.classList.toggle('on', b.dataset.v === view));
      if (view !== '3d' && p3) { p3.dispose(); p3 = null; }
      if (view === 'front' || view === 'inside') {
        const E = elevation(cab, { obstacles: ctx.obstacles || [], interior: view === 'inside', wallH: ctx.wallH || 280 });
        V.innerHTML = `<div class="cd-svg">${elevationSvg(E, { sel })}</div><p class="muted small cd-hint">Bir modüle dokunarak seçin. ${isW ? '"İç düzen" sekmesi kapakları kaldırıp raf / askı / çekmece yerleşimini gösterir.' : 'Kesik V çizgisi kapağın menteşe tarafını gösterir. Turuncu Ü numaraları üst dolaplardır. "İç düzen" kapakları kaldırıp rafları gösterir.'}</p>`;
      } else if (view === 'list') V.innerHTML = listHtml();
      else if (view === '3d') draw3d();
      fitInfo(); drawSide();
    }
    V.addEventListener('click', e => { const r = e.target.closest('[data-mid]'); if (r) { sel = r.dataset.mid; draw(); } });

    async function draw3d() {
      V.innerHTML = '<div class="cd-3d"><div class="p3-load"><div class="spin"></div></div></div>';
      try {
        const { Plan3D } = await import('./plan3d.js');
        if (view !== '3d') return;
        const host = $('.cd-3d', V); p3?.dispose();
        p3 = new Plan3D(host); await p3.init();
        $('.p3-load', host)?.remove();
        p3.setPlan(previewPlan());
      } catch (e) { V.innerHTML = `<p class="warn">3D önizleme açılamadı: ${esc(e.message)}</p>`; }
    }
    function previewPlan() {
      const d = itemDims(cab), L = d.w;
      const it = { id: 'cdprev', type: 'cabinet', label, x: L / 2, y: d.d / 2, w: L, d: d.d, h: d.h, z: 0, rot: 0, color: pick(FRONTS, cab.mat.front).c, cab };
      const walls = [{ id: 'w1', a: { x: -25, y: -7.5 }, b: { x: L + 25, y: -7.5 }, t: 15, h: 0 }];
      return { v: 1, walls, openings: [], rooms: [{ id: 'r1', name: '', pts: [{ x: -25, y: 0 }, { x: L + 25, y: 0 }, { x: L + 25, y: 320 }, { x: -25, y: 320 }], floor: 'parke', wallColor: '', h: 0, walls: [] }], items: [it], dims: [], labels: [], meta: { wallH: ctx.wallH || 280, wallT: 15, wallColor: '#F7F5F0', bg: null } };
    }

    function listHtml() {
      const pl = partsList(cab);
      const s = pl.sum;
      const sumRows = isW ? [['Dolap uzunluğu', fmt(rowLen(cab.ward)) + ' cm'], ['Ön yüz alanı', fmtNum(s.frontM2) + ' m²']]
        : [['Alt dolap', fmtNum(s.base) + ' m'], ['Üst dolap', fmtNum(s.upper) + ' m'], ['Boy dolap / kolon', s.tall + ' adet'], ['Tezgah', fmtNum(s.top) + ' m']];
      return `<div class="cd-list">
        <div class="mtable cd-sum">${sumRows.map(([a, b]) => `<div><span>${a}</span><b>${b}</b></div>`).join('')}<div><span>Kenar bandı</span><b>${fmtNum(pl.band)} m</b></div></div>
        <h4>Kesim listesi <small class="muted">(ölçüler mm)</small></h4>
        <div class="cd-table-wrap"><table class="cd-table"><thead><tr><th>Modül</th><th>Parça</th><th>Malzeme</th><th class="r">Boy</th><th class="r">En</th><th class="r">Adet</th><th>Bant</th></tr></thead>
        <tbody>${pl.rows.map(r => `<tr><td>${esc(r.mod)}</td><td>${esc(r.part)}</td><td>${esc(r.mat)}</td><td class="r">${r.L}</td><td class="r">${r.W}</td><td class="r">${r.n}</td><td>${esc(r.band)}</td></tr>`).join('')}</tbody></table></div>
        <h4>Donanım ve cihazlar</h4>
        <div class="mtable">${Object.entries(pl.hw).map(([k, v]) => `<div><span>${esc(k)}</span><b>${String(v).replace('.', ',')}</b></div>`).join('')}</div>
        <p class="muted small">Kesim ölçüleri standart 18 mm gövde / 8 mm arkalık ve modüller arası 3 mm kapak boşluğuna göre hesaplanır; üretim öncesi atölye standartlarınızla kontrol edin.</p>
      </div>`;
    }

    /* ── yan panel ── */
    function drawSide() {
      const f = sel && find(sel);
      let modHtml = '<p class="muted small">Çizimde bir modüle dokunun.</p>';
      if (f) {
        const t = MT[f.m.type], lay = layoutRow(cab[f.r]), p = lay[f.i];
        const no = (f.r === 'upper' ? 'Ü' : f.r === 'ward' ? 'G' : 'A') + (f.i + 1);
        const doorable = !t.empty && !t.filler && !t.hood && !t.open && !t.drawers && !t.appliance && !t.oven && !t.lift && !t.fridge && !(isW && (cab.s.doors === 'surgulu' || isOpenMod(f.m, cab.s)));
        const dc = doorable ? doorCount(f.m, kind, cab.s) : 0;
        modHtml = `<div class="cd-modh"><b>${no}</b><span>${esc(t.t)}</span><small>${fmt(p.x0)} – ${fmt(p.x1)} cm</small></div>
          <label>Tür<select class="inp sm" data-m="type">${typesFor(kind, f.r).map(o => `<option value="${o.k}" ${o.k === f.m.type ? 'selected' : ''}>${o.t}</option>`).join('')}</select></label>
          <label>Genişlik<div class="inp-unit sm"><input type="number" step="0.5" inputmode="decimal" data-m="w" value="${f.m.w}"><span>cm</span></div></label>
          ${isW && (t.appl || t.boiler) ? `<label>Derinlik<div class="inp-unit sm"><input type="number" step="0.5" inputmode="decimal" data-m="D" value="${modD(f.m, cab.s)}"><span>cm</span></div></label>` : ''}
          ${isW ? modWarn(f.m, cab.s).map(w => `<p class="cd-warn">${icon('alert')}${esc(w)}</p>`).join('') : ''}
          ${shelfable(f.m, kind) ? (() => { const sp = shelfPos(f.m, cab.s, kind), ih = modInner(f.m, cab.s, kind).h; return `<div class="cd-shelves">
            <div class="row-between"><b>Raflar <small class="muted">${f.m.shelves ? 'elle' : 'varsayılan'} · iç yükseklik ${fmt(ih)} cm</small></b>${f.m.shelves ? `<button class="btn btn-xs btn-ghost" data-op="shreset" title="Modül tipinin varsayılan raflarına dön">Varsayılan</button>` : ''}</div>
            ${sp.length ? sp.map((v, k) => `<div class="cd-shrow"><span>${k + 1}.</span><div class="inp-unit sm"><input type="number" step="0.5" inputmode="decimal" data-shelf="${k}" value="${v}"><span>cm</span></div><button class="icon-btn sm danger" data-op="shdel" data-k="${k}" title="Rafı kaldır">${icon('trash')}</button></div>`).join('') : '<p class="muted small">Raf yok.</p>'}
            <div class="row wrap"><button class="btn btn-xs btn-primary" data-op="shadd">${icon('plus')}Raf ekle</button>
              <label class="cd-shn">Eşit dağıt<input class="inp sm" type="number" min="0" max="12" step="1" data-shn value="${sp.length}"></label></div>
            <p class="muted small">Yükseklik modülün iç tabanından ölçülür. "Raf ekle" en geniş boşluğun ortasına raf koyar; "İç düzen" görünümünde rafları görebilirsiniz.</p></div>`; })() : ''}
          ${doorable ? `<div class="grid2"><label>Kapak<select class="inp sm" data-m="doors"><option value="">Otomatik (${dc})</option>${[1, 2, 3].map(n => `<option value="${n}" ${f.m.doors === n ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
            ${dc === 1 ? `<label>Menteşe<select class="inp sm" data-m="hinge"><option value="L" ${(f.m.hinge || 'L') === 'L' ? 'selected' : ''}>Sol</option><option value="R" ${f.m.hinge === 'R' ? 'selected' : ''}>Sağ</option></select></label>` : ''}</div>` : ''}
          <div class="cd-btns">
            <button class="btn btn-xs btn-ghost" data-op="left" title="Sola taşı">◀</button><button class="btn btn-xs btn-ghost" data-op="right" title="Sağa taşı">▶</button>
            <button class="btn btn-xs btn-ghost" data-op="dup">${icon('copy')}Çoğalt</button><button class="btn btn-xs btn-ghost" data-op="ins">${icon('plus')}Sağına ekle</button>
            <button class="btn btn-xs btn-ghost" data-op="split" title="İkiye böl">½</button><button class="btn btn-xs btn-danger" data-op="del">${icon('trash')}</button>
          </div>`;
      }
      const S = cab.s, o = cab.opts || (cab.opts = {});
      const n = (k, l, step = 0.5) => `<label>${l}<div class="inp-unit sm"><input type="number" step="${step}" inputmode="decimal" data-s="${k}" value="${S[k]}"><span>cm</span></div></label>`;
      const sw = (list, k) => `<div class="swatches cd-sw" data-mat="${k}">${list.map(x => `<button style="background:${x.c}" data-c="${x.k}" class="${cab.mat[k] === x.k ? 'on' : ''}" title="${esc(x.t)}"></button>`).join('')}</div>`;
      const sel1 = (list, k) => `<select class="inp sm" data-mat="${k}">${list.map(x => `<option value="${x.k}" ${cab.mat[k] === x.k ? 'selected' : ''}>${esc(x.t)}</option>`).join('')}</select>`;
      side.innerHTML = `
        <section class="cd-box"><h4>Seçili modül</h4>${modHtml}</section>
        <details class="cd-box" open><summary><h4>Otomatik diz</h4></summary>
          <label>Dizi uzunluğu<div class="inp-unit sm"><input type="number" step="0.5" data-auto="L" value="${wantL}"><span>cm</span></div></label>
          ${isW ? `<div class="cd-chk">
            <label><input type="checkbox" data-o="washer" ${o.washer ? 'checked' : ''}> Çamaşır makinesi yeri</label>
            <label><input type="checkbox" data-o="dryer" ${o.dryer ? 'checked' : ''}> Kurutma makinesi (üst üste)</label>
            <label><input type="checkbox" data-o="boiler" ${o.boiler ? 'checked' : ''}> Termosifon</label></div>
            <p class="muted small">Cihaz modülleri dizinin sonuna eklenir; makine zemine oturur (baza yok), derinlik cihaza göre artar, kapaklarda havalandırma menfezi olur.</p>` : `<div class="cd-chk">
            <label><input type="checkbox" data-o="fridge" ${o.fridge ? 'checked' : ''}> Ankastre buzdolabı</label>
            <label><input type="checkbox" data-o="dish" ${o.dish ? 'checked' : ''}> Bulaşık makinesi</label>
            <label><input type="checkbox" data-o="hood" ${o.hood ? 'checked' : ''}> Davlumbaz</label></div>
            <label>Fırın<select class="inp sm" data-o="oven"><option value="kolon" ${o.oven === 'kolon' ? 'selected' : ''}>Boy kolonda</option><option value="alt" ${o.oven === 'alt' ? 'selected' : ''}>Ocak altında</option><option value="yok" ${o.oven === 'yok' ? 'selected' : ''}>Yok</option></select></label>`}
          <button class="btn btn-sm btn-ghost" data-a="auto">${icon('sparkle')}Yeniden diz</button>
          <p class="muted small">Pencere ve kapılar duvardan okunur; evye pencere altına, davlumbaz ocağın üstüne yerleşir.</p>
        </details>
        <details class="cd-box" open><summary><h4>Malzeme ve kulp</h4></summary>
          <label>Kapak rengi</label>${sw(FRONTS, 'front')}
          <label>Gövde${sel1(BODIES, 'body')}</label>
          ${isW ? '' : `<label>Tezgah${sel1(TOPS, 'top')}</label>`}
          <div class="grid2"><label>Kulp${sel1(HANDLES, 'handle')}</label><label>Kulp rengi${sel1(HANDLE_COLORS, 'hcolor')}</label></div>
          ${isW ? `<label>Kapak tipi<select class="inp sm" data-s="doors">${WARD_DOORS.map(d => `<option value="${d.k}" ${(S.doors || 'menteseli') === d.k ? 'selected' : ''}>${d.t}</option>`).join('')}</select></label>
            <p class="muted small">Vestiyer askılık, oturak ve ayna modülleri her zaman kapaksızdır; "Kapaksız (açık)" seçilirse tüm dizi açık raf / askı olarak tasarlanır.</p>` : ''}
        </details>
        <details class="cd-box"><summary><h4>Ölçüler</h4></summary>
          ${isW ? `<div class="grid2">${n('H', 'Toplam yükseklik')}${n('D', 'Gövde derinliği')}${n('plinth', 'Baza')}${n('t', 'Gövde kalınlığı', 0.1)}</div>`
            : `<div class="grid2">${n('plinth', 'Baza')}${n('carcH', 'Alt gövde yük.')}${n('topT', 'Tezgah kalınlığı')}${n('baseD', 'Alt gövde der.')}${n('topD', 'Tezgah derinliği')}${n('upZ', 'Üst dolap alt kotu')}${n('upH', 'Üst dolap yük.')}${n('upD', 'Üst gövde der.')}${n('tallH', 'Boy dolap yük.')}${n('t', 'Gövde kalınlığı', 0.1)}</div>
            <p class="muted small">Tezgah üstü: ${fmt(S.plinth + S.carcH + S.topT)} cm · tezgah – üst dolap arası: ${fmt(S.upZ - S.plinth - S.carcH - S.topT)} cm</p>`}
        </details>`;
    }

    /* ── olaylar ── */
    side.addEventListener('change', e => {
      const t = e.target, f = sel && find(sel);
      if ((t.dataset.shelf !== undefined || t.dataset.shn !== undefined) && f) {   // raf yüksekliği / eşit dağıtım
        const ih = modInner(f.m, cab.s, kind).h, cur = shelfPos(f.m, cab.s, kind);
        if (t.dataset.shn !== undefined) { const n = Math.max(0, Math.min(12, Math.round(+t.value || 0))); f.m.shelves = Array.from({ length: n }, (_, i) => Math.round(ih * (i + 1) / (n + 1) * 2) / 2); }
        else { const v = parseFloat(String(t.value).replace(',', '.')); if (!(v > 0)) return; cur[+t.dataset.shelf] = Math.min(ih - 1, Math.round(v * 2) / 2); f.m.shelves = cur.sort((x, y) => x - y); }
        if (view === 'front') view = 'inside';
        return changed();
      }
      if (t.dataset.m && f) {
        const k = t.dataset.m;
        if (k === 'type') f.m.type = t.value;
        else if (k === 'w') f.m.w = Math.max(1, Math.round(parseFloat(String(t.value).replace(',', '.')) * 2) / 2 || f.m.w);
        else if (k === 'doors') { if (t.value) f.m.doors = +t.value; else delete f.m.doors; }
        else if (k === 'hinge') f.m.hinge = t.value;
        else if (k === 'D') { const v = parseFloat(String(t.value).replace(',', '.')); if (v > 0) f.m.D = Math.max(v, MT[f.m.type]?.minD || 0); }
        return changed();
      }
      if (t.dataset.s) { cab.s[t.dataset.s] = t.dataset.s === 'doors' ? t.value : (parseFloat(String(t.value).replace(',', '.')) || cab.s[t.dataset.s]); return changed(); }
      if (t.dataset.mat) { cab.mat[t.dataset.mat] = t.value; return changed(); }
      if (t.dataset.o) { cab.opts[t.dataset.o] = t.type === 'checkbox' ? t.checked : t.value; return; }
      if (t.dataset.auto) { wantL = parseFloat(String(t.value).replace(',', '.')) || wantL; }
    });
    side.addEventListener('click', async e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.closest('[data-mat]') && b.dataset.c) { cab.mat[b.closest('[data-mat]').dataset.mat] = b.dataset.c; return changed(); }
      const op = b.dataset.op, f = sel && find(sel);
      if (op && f) {
        const arr = cab[f.r];
        if (op === 'left' && f.i > 0) [arr[f.i - 1], arr[f.i]] = [arr[f.i], arr[f.i - 1]];
        if (op === 'right' && f.i < arr.length - 1) [arr[f.i + 1], arr[f.i]] = [arr[f.i], arr[f.i + 1]];
        if (op === 'dup') { const c = { ...clone(f.m), id: mod('x', 1).id }; arr.splice(f.i + 1, 0, c); sel = c.id; }
        if (op === 'ins') { const c = mod(f.r === 'upper' ? 'ust' : f.r === 'ward' ? 'aski' : 'kapak', 60); arr.splice(f.i + 1, 0, c); sel = c.id; }
        if (op === 'split') { const w1 = Math.round(f.m.w / 2 * 2) / 2; const c = { ...clone(f.m), id: mod('x', 1).id, w: f.m.w - w1 }; f.m.w = w1; delete f.m.doors; delete c.doors; arr.splice(f.i + 1, 0, c); }
        if (op === 'del') { arr.splice(f.i, 1); sel = null; }
        if (op === 'shadd' || op === 'shdel' || op === 'shreset') {   // elle raf
          const ih = modInner(f.m, cab.s, kind).h, cur = shelfPos(f.m, cab.s, kind);
          if (op === 'shreset') delete f.m.shelves;
          else if (op === 'shdel') { cur.splice(+b.dataset.k, 1); f.m.shelves = cur; }
          else { const pts = [0, ...cur, ih]; let bi = 0; for (let k = 1; k < pts.length - 1; k++) if (pts[k + 1] - pts[k] > pts[bi + 1] - pts[bi]) bi = k; f.m.shelves = [...cur, Math.round((pts[bi] + pts[bi + 1]) / 2 * 2) / 2].sort((x, y) => x - y); }
          if (view === 'front') view = 'inside';
        }
        return changed();
      }
      if (b.dataset.a === 'auto') {
        if (!await confirmDlg('Mevcut modül dizilimi silinip duvara göre yeniden dizilecek. Malzeme ve ölçü ayarları korunur.', 'Yeniden diz', false)) return;
        autoFill(cab, wantL, ctx.obstacles || []); sel = null; return changed();
      }
    });
    el.addEventListener('click', async e => {
      const t = e.target.closest('[data-v]'); if (t) { view = t.dataset.v; draw(); return; }
      const ad = e.target.closest('[data-add]'); if (ad) { const r = ad.dataset.add, m = mod(r === 'upper' ? 'ust' : r === 'ward' ? 'aski' : 'kapak', 60); cab[r].push(m); sel = m.id; return changed(); }
      const a = e.target.closest('[data-a]')?.dataset.a; if (!a || e.target.closest('.cd-side')) return;
      label = $('.cd-name', el).value.trim() || label;
      if (a === 'fitlast') {
        // her sıranın uzunluğunu duvara eşitle: fark, boy dolap olmayan son modüle
        for (const r of rows) { const arr = cab[r], dd = rowLen(arr) - avail; if (!arr.length || Math.abs(dd) < 0.5) continue; const last = [...arr].reverse().find(m => !MT[m.type].tall) || arr.at(-1); last.w = Math.max(1, Math.round((last.w - dd) * 2) / 2); }
        return changed();
      }
      if (a === 'apply') { finish(cab); return; }
      if (a === 'dxf') { downloadBlob(new Blob([elevationDxf(elevation(cab, { obstacles: ctx.obstacles || [], wallH: ctx.wallH }))], { type: 'application/dxf' }), `${label}-on-gorunus.dxf`); return; }
      if (a === 'lbl') { const { labelsDialog } = await import('./labels.js'); return labelsDialog({ cabs: [{ cab, label }], job: ctx.job, settings: ctx.settings || {}, fname: label }); }
      if (a === 'cnc') { const { cncDialog } = await import('./cnc.js'); return cncDialog([{ cab, label }], { title: label, fname: label, settings: ctx.settings, saveSettings: ctx.saveSettings }); }
      if (a === 'csv') { downloadBlob(new Blob([partsCsv(partsList(cab), label)], { type: 'text/csv;charset=utf-8' }), `${label}-kesim-listesi.csv`); return; }
      if (a === 'quote') {
        const items = quoteItems(cab, label, ctx.priceOf);
        if (!items.length) return toast('Teklife eklenecek modül yok', 'err');
        if (!ctx.addQuoteItems) return toast('Teklif bu ekrandan eklenemiyor', 'err');
        ctx.addQuoteItems(items); toast(`${items.length} kalem teklife eklendi — birim fiyatları Teklif sekmesinde düzenleyin`); return;
      }
      if (a === 'pdf') return ctx.printSheet?.(label, sheetHtml());
    });
    el.addEventListener('input', e => { if (e.target.classList.contains('cd-name')) { label = e.target.value; dirty = true; } });
    $('[data-x]', el).onclick = async () => { if (dirty && !await confirmDlg('Uygulanmamış değişiklikler var. Kapatılsın mı?', 'Kapat')) return; finish(null); };
    const onKey = e => { if (e.key === 'Escape' && !document.querySelector('.modal-back')) $('[data-x]', el).click(); };
    document.addEventListener('keydown', onKey);

    function sheetHtml() {
      const img = interior => { const E = elevation(cab, { obstacles: ctx.obstacles || [], interior, wallH: ctx.wallH }); const ratio = (E.L + 70) / (E.H + 80);   // elevationSvg görünüm kutusu oranı; yükseklik ~600 px'i geçmesin
        return `<img class="cd-pimg" style="width:${Math.round(600 * ratio)}px" src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(elevationSvg(E, { standalone: true, maxW: 1400 }))}" alt="">`; };
      const pl = partsList(cab), S = cab.s;
      const spec = isW ? [['Ölçü', `${fmt(rowLen(cab.ward))} × ${S.H} × ${S.D + S.frontT} cm`], ['Kapak', (WARD_DOORS.find(d => d.k === S.doors) || WARD_DOORS[0]).t], ['Kapak rengi', pick(FRONTS, cab.mat.front).t], ['Gövde', pick(BODIES, cab.mat.body).t], ['Kulp', pick(HANDLES, cab.mat.handle).t + ' · ' + pick(HANDLE_COLORS, cab.mat.hcolor).t]]
        : [['Dizi uzunluğu', fmt(runLength(cab)) + ' cm'], ['Tezgah yüksekliği', fmt(S.plinth + S.carcH + S.topT) + ' cm'], ['Kapak', pick(FRONTS, cab.mat.front).t], ['Gövde', pick(BODIES, cab.mat.body).t], ['Tezgah', pick(TOPS, cab.mat.top).t], ['Kulp', pick(HANDLES, cab.mat.handle).t + ' · ' + pick(HANDLE_COLORS, cab.mat.hcolor).t]];
      const mods = rows.map(r => layoutRow(cab[r]).map((p, i) => `<tr><td>${(r === 'upper' ? 'Ü' : r === 'ward' ? 'G' : 'A') + (i + 1)}</td><td>${esc(MT[p.m.type].t)}</td><td class="r">${fmt(p.x1 - p.x0)}</td></tr>`).join('')).join('');
      return `<section class="p-cust">${spec.slice(0, 3).map(([a, b]) => `<div><small>${a}</small><b>${esc(b)}</b></div>`).join('')}</section>
        <section><h3>Ön görünüş</h3><div class="p-plan">${img(false)}</div></section>
        ${isW ? `<section><h3>İç düzen</h3><div class="p-plan">${img(true)}</div></section>` : ''}
        <section><h3>Malzeme</h3><table class="ptable">${spec.map(([a, b]) => `<tr><th>${a}</th><td>${esc(b)}</td></tr>`).join('')}</table></section>
        <section><h3>Modüller</h3><table class="p-table sm"><thead><tr><th>No</th><th>Modül</th><th class="r">Genişlik (cm)</th></tr></thead><tbody>${mods}</tbody></table></section>
        <section><h3>Kesim listesi <small>(mm)</small></h3><table class="p-table sm"><thead><tr><th>Modül</th><th>Parça</th><th>Malzeme</th><th class="r">Boy</th><th class="r">En</th><th class="r">Adet</th><th>Bant</th></tr></thead><tbody>
          ${pl.rows.map(r => `<tr><td>${esc(r.mod)}</td><td>${esc(r.part)}</td><td>${esc(r.mat)}</td><td class="r">${r.L}</td><td class="r">${r.W}</td><td class="r">${r.n}</td><td>${esc(r.band)}</td></tr>`).join('')}</tbody></table></section>
        <section><h3>Donanım</h3><table class="p-table sm"><tbody>${Object.entries(pl.hw).map(([k, v]) => `<tr><td>${esc(k)}</td><td class="r">${String(v).replace('.', ',')}</td></tr>`).join('')}<tr class="grp"><td>Toplam kenar bandı</td><td class="r">${fmtNum(pl.band)} m</td></tr></tbody></table></section>`;
    }

    function finish(result) {
      document.removeEventListener('keydown', onKey);
      p3?.dispose(); p3 = null;
      el.remove(); document.body.classList.remove('dv-open');
      resolve(result ? { cab: result, label } : null);
    }
    draw();
  });
}
