/* SAGG Drywall+ — uygulama: proje durumu, arayüz, sekmeler, dışa aktarım ve imalat dosyası. */
import { SYSTEMS, BOARDS, INSULATION, DEFAULT_SETTINGS } from './catalog.js';
import { TYPES, defaults, generate } from './generators.js';
import { assignPoz, projectTakeoff, steps } from './takeoff.js';
import { frameView, boardView, sheetView, barsView, wallSection, floorDetail, nicheDetail } from './draw.js';
import { toDXF } from './dxf.js';

export const APP_VERSION = '1.0.0';
const LS = 'sagg-drywall-v1';
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const nf = (v, d = 0) => Number(v || 0).toLocaleString('tr-TR', { minimumFractionDigits: d, maximumFractionDigits: d });
const uid = () => Math.random().toString(36).slice(2, 9);
const clone = o => JSON.parse(JSON.stringify(o));

/* ───────────── durum ───────────── */
function blankProject() {
  return { v: 1, name: 'Yeni proje', client: '', address: '', author: '', date: new Date().toISOString().slice(0, 10), note: '', elements: [], settings: clone(DEFAULT_SETTINGS) };
}
function load() {
  try { const p = JSON.parse(localStorage.getItem(LS)); if (p && p.elements) return normalize(p); } catch { /* boş */ }
  const p = blankProject();
  p.name = 'Örnek proje';
  addEl(p, 'duvar'); addEl(p, 'tv'); addEl(p, 'ada');
  return p;
}
function normalize(p) {
  const S = clone(DEFAULT_SETTINGS);
  p.settings = { ...S, ...(p.settings || {}), prices: { ...S.prices, ...(p.settings?.prices || {}) } };
  for (const e of p.elements) e.params = { ...defaults(e.type), ...e.params };
  return p;
}
function addEl(p, type) {
  const n = p.elements.filter(e => e.type === type).length + 1;
  let code = TYPES[type].code + n;
  while (p.elements.some(e => e.code === code)) code = TYPES[type].code + (+code.replace(/\D/g, '') + 1);
  const el = { id: uid(), type, code, name: `${TYPES[type].label} ${n}`, params: defaults(type) };
  p.elements.push(el);
  return el;
}
let P = load();
let sel = P.elements[0]?.id || null;
let tab = '3d';
let models = [], T = null;
const save = () => { try { localStorage.setItem(LS, JSON.stringify(P)); } catch { /* kota */ } };

/* ───────────── form şemaları ───────────── */
const SYS = Object.entries(SYSTEMS).map(([k, v]) => [+k, v.label]);
const SP = [[300, '300 mm'], [400, '400 mm'], [600, '600 mm']];
const BO = Object.entries(BOARDS).map(([k, v]) => [k, v.label]);
const LAY = n => (n ? [[0, 'Kaplama yok']] : []).concat([[1, '1 kat'], [2, '2 kat']]);
const FACES = [['front', 'Ön'], ['back', 'Arka'], ['left', 'Sol'], ['right', 'Sağ']];
const sec = l => ({ sec: l });
const num = (k, l, o = {}) => ({ k, l, t: 'num', u: 'mm', ...o });
const sl = (k, l, opts) => ({ k, l, t: 'sel', o: opts });
const ck = (k, l) => ({ k, l, t: 'chk' });
const sysF = [sec('Profil sistemi'), sl('sys', 'Sistem', SYS), sl('s', 'Dikme aralığı', SP)];
const boardF = [sec('Kaplama'), sl('board', 'Levha', BO), sl('layers', 'Kat sayısı', LAY(false))];
const nicheList = { list: 'niches', l: 'Nişler', title: i => `Niş ${i + 1}`, fields: [['face', 'Yüz', FACES], ['u', 'Soldan'], ['v', 'Tabandan'], ['w', 'Genişlik'], ['h', 'Yükseklik'], ['d', 'Derinlik']], add: () => ({ face: 'front', u: 200, v: 300, w: 600, h: 300, d: 250 }) };

const FORMS = {
  duvar: [
    sec('Ölçüler'), num('L', 'Duvar uzunluğu', { min: 300 }), num('H', 'Duvar yüksekliği', { min: 300 }),
    ...sysF,
    sec('A yüzü'), sl('A.layers', 'Kat', LAY(true)), sl('A.board', 'Levha', BO),
    sec('B yüzü'), sl('B.layers', 'Kat', LAY(true)), sl('B.board', 'Levha', BO),
    sec('Yalıtım'), sl('insul', 'Malzeme', Object.entries(INSULATION).map(([k, v]) => [k, v.label])), sl('insulT', 'Kalınlık', [[50, '50 mm'], [75, '75 mm'], [100, '100 mm']]),
    sec('Duvar uçları'), sl('endA', 'Başlangıç ucu', [['wall', 'Duvara bağlı'], ['free', 'Serbest uç']]), sl('endB', 'Bitiş ucu', [['wall', 'Duvara bağlı'], ['free', 'Serbest uç']]),
    { list: 'openings', l: 'Boşluklar (kapı / pencere)', title: (i, o) => `${({ door: 'Kapı', window: 'Pencere', pass: 'Geçit' })[o.type]} ${i + 1}`, fields: [['type', 'Tip', [['door', 'Kapı'], ['window', 'Pencere'], ['pass', 'Geçit']]], ['x', 'Baştan'], ['w', 'Genişlik'], ['h', 'Yükseklik'], ['sill', 'Denizlik']], add: () => ({ type: 'door', x: 300, w: 900, h: 2100, sill: 0 }) },
  ],
  ada: [
    sec('Gövde (iskelet) ölçüleri'), num('W', 'Genişlik'), num('D', 'Derinlik'), num('H', 'Yükseklik (tezgah altı)'),
    ...sysF, ...boardF, ck('topClad', 'Üst yüz alçıpan kaplı'),
    sec('Tezgah'), num('ctT', 'Tezgah kalınlığı'), num('ovF', 'Ön taşma'), num('ovB', 'Arka taşma (bar)'), num('ovL', 'Sol taşma'), num('ovR', 'Sağ taşma'),
    nicheList,
  ],
  tv: [
    sec('Genel'), num('W', 'Toplam genişlik'), num('H', 'Toplam yükseklik'), ck('toCeiling', 'Tavana kadar'),
    ...sysF, ...boardF,
    sec('Alt konsol'), num('consoleH', 'Yükseklik (0 = yok)'), num('consoleD', 'Derinlik'), num('consoleNiches', 'Açık niş sayısı', { u: 'adet' }), num('consoleNicheH', 'Niş yüksekliği'), num('consoleNicheD', 'Niş derinliği'),
    sec('Duvar paneli'), num('panelD', 'Panel derinliği'),
    sec('TV nişi'), num('tvW', 'Genişlik'), num('tvH', 'Yükseklik'), num('tvV', 'Zeminden yükseklik'), num('tvD', 'Derinlik'),
    sec('Yan nişler (her iki yan)'), num('sideRows', 'Sıra sayısı', { u: 'adet' }), num('sideW', 'Genişlik'), num('sideH', 'Yükseklik'), num('sideD', 'Derinlik'),
  ],
  raf: [
    sec('Ölçüler'), num('W', 'Genişlik'), num('H', 'Yükseklik'), num('D', 'Derinlik'), ck('toCeiling', 'Tavana kadar'),
    ...sysF, ...boardF,
    sec('Niş ızgarası'), num('rows', 'Sıra', { u: 'adet' }), num('cols', 'Sütun', { u: 'adet' }), num('margin', 'Kenar payı'), num('gap', 'Niş arası'), num('bottom', 'Alt boşluk'), num('nicheD', 'Niş derinliği'),
  ],
  kutu: [
    sec('Gövde (iskelet) ölçüleri'), num('W', 'Genişlik'), num('D', 'Derinlik'), num('H', 'Yükseklik'),
    ...sysF, ...boardF,
    sec('Kaplanan yüzler'), ck('cladF', 'Ön'), ck('cladB', 'Arka'), ck('cladL', 'Sol'), ck('cladR', 'Sağ'), ck('cladT', 'Üst'),
    sec('Bağlantı / yük'), ck('wallBack', 'Arkası duvara dayalı'), ck('topLoad', 'Üstte tezgah / yük var'),
    nicheList,
  ],
};
const getP = (o, k) => k.split('.').reduce((a, b) => a?.[b], o);
const setP = (o, k, v) => { const ks = k.split('.'); const last = ks.pop(); ks.reduce((a, b) => a[b], o)[last] = v; };
const cast = (v, ref) => (typeof ref === 'number' || /^-?\d+(\.\d+)?$/.test(v)) && v !== '' ? +v : v;

/* ───────────── hesap ───────────── */
function compute() {
  models = P.elements.map(el => { try { return assignPoz(generate(el, P.settings)); } catch (e) { console.error(e); return null; } }).filter(Boolean);
  T = models.length ? projectTakeoff(models, P.settings) : null;
}
const curEl = () => P.elements.find(e => e.id === sel);
const curMd = () => models.find(m => m.el.id === sel);

/* ───────────── çizim yardımcıları ───────────── */
function elementSheets(md) {
  const S = P.settings, out = [];
  if (md.el.type === 'duvar') {
    out.push({ key: 'front', title: 'Ön görünüş — iskelet (A yüzünden)', S: frameView(md, 'front') });
    out.push({ key: 'top', title: 'Plan — duvar yatay kesiti', S: frameView(md, 'top', { boards: true }) });
    out.push({ key: 'sec', title: 'Detay — duvar katmanları', S: wallSection(md.el.params, SYSTEMS[md.el.params.sys], S.boardT), detail: true });
    out.push({ key: 'floor', title: 'Detay — taban bağlantısı', S: floorDetail(SYSTEMS[md.el.params.sys], S.boardT, +md.el.params.A.layers, +md.el.params.B.layers), detail: true });
  } else {
    out.push({ key: 'front', title: 'Ön görünüş — iskelet', S: frameView(md, 'front') });
    out.push({ key: 'side', title: 'Sağ yan görünüş — iskelet', S: frameView(md, 'side') });
    out.push({ key: 'top', title: 'Üst görünüş — iskelet', S: frameView(md, 'top') });
    const p = md.el.params;
    const nd = md.el.type === 'tv' ? +p.tvD : md.el.type === 'raf' ? +p.nicheD : +(p.niches?.[0]?.d || 0);
    if (nd > 0) out.push({ key: 'niche', title: 'Detay — niş kesiti', S: nicheDetail(SYSTEMS[p.sys], S.boardT, +p.layers, Math.min(nd, 400)), detail: true });
  }
  return out;
}
function cladSheets(md) { return md.faces.map(f => ({ key: 'clad-' + f.label, title: 'Kaplama — ' + f.label, S: boardView(f, md) })); }

/* ───────────── görünüm ───────────── */
let view3d = null;
async function ensure3D() {
  if (view3d) return view3d;
  try {
    const { View3D } = await import('./view3d.js');
    view3d = new View3D($('#v3d'));
  } catch (e) {
    $('#v3d').innerHTML = `<div class="doc">3B görünüm yüklenemedi: ${esc(e.message)}</div>`;
  }
  return view3d;
}

function renderList() {
  $('#elList').innerHTML = P.elements.map(e => `<li data-id="${e.id}" class="${e.id === sel ? 'on' : ''}"><span class="code">${esc(e.code)}</span><span class="nm" title="${esc(e.name)}">${esc(e.name)}</span><button class="mini" data-dup="${e.id}" title="Kopyala">⧉</button><button class="mini" data-del="${e.id}" title="Sil">✕</button></li>`).join('') || '<li class="hint">Eleman ekleyin →</li>';
  const s = $('#projSum');
  if (!T) { s.innerHTML = ''; return; }
  const sheets = T.rows.filter(r => r.grp === 'Levha').reduce((a, r) => a + r.qty, 0);
  const bars = T.rows.filter(r => r.grp === 'Profil').reduce((a, r) => a + r.qty, 0);
  s.innerHTML = `<div>Profil: <b>${nf(bars)} boy</b></div><div>Levha: <b>${nf(sheets)} adet</b></div><div>Kaplama: <b>${nf(T.cladArea, 1)} m²</b></div><div>Malzeme: <b>${nf(T.total)} ${P.settings.currency}</b></div>`;
}

function fieldHTML(f, obj) {
  if (f.sec) return `<div class="sec">${esc(f.sec)}</div>`;
  const v = getP(obj, f.k);
  if (f.t === 'chk') return `<div class="fld chk"><label for="f_${f.k}">${esc(f.l)}</label><input type="checkbox" id="f_${f.k}" data-k="${f.k}" ${v ? 'checked' : ''}></div>`;
  if (f.t === 'sel') return `<div class="fld"><label for="f_${f.k}">${esc(f.l)}</label><select id="f_${f.k}" data-k="${f.k}">${f.o.map(([a, b]) => `<option value="${a}" ${String(a) === String(v) ? 'selected' : ''}>${esc(b)}</option>`).join('')}</select></div>`;
  return `<div class="fld"><label for="f_${f.k}">${esc(f.l)}</label><span class="u" data-u="${f.u || ''}"><input type="number" id="f_${f.k}" data-k="${f.k}" value="${v}" step="${f.step || 10}" ${f.min != null ? `min="${f.min}"` : ''}></span></div>`;
}
function listHTML(L, obj) {
  const arr = obj[L.list] || [];
  return `<div class="sec">${esc(L.l)}</div>` + arr.map((it, i) => `<div class="lst"><div class="lst-h">${esc(L.title(i, it))}<button type="button" data-rm="${L.list}:${i}" title="Kaldır">✕</button></div><div class="row">${L.fields.map(([k, l, o]) => `<label>${esc(l)}${o ? `<select data-li="${L.list}:${i}:${k}">${o.map(([a, b]) => `<option value="${a}" ${String(a) === String(it[k]) ? 'selected' : ''}>${b}</option>`).join('')}</select>` : `<input type="number" step="10" data-li="${L.list}:${i}:${k}" value="${it[k]}">`}</label>`).join('')}</div></div>`).join('') + `<button type="button" class="add-row" data-addli="${L.list}">+ ${esc(L.l.split(' ')[0].replace(/lar$|ler$/, ''))} ekle</button>`;
}
function renderForm() {
  const el = curEl();
  if (!el) { $('#props').innerHTML = '<p class="hint">Soldan bir eleman seçin ya da ekleyin.</p>'; $('#propTitle').textContent = 'Parametreler'; $('#elInfo').innerHTML = ''; return; }
  $('#propTitle').textContent = `${el.code} · ${TYPES[el.type].label}`;
  $('#props').innerHTML = `<div class="fld"><label for="f_name">Ad</label><input type="text" id="f_name" data-name value="${esc(el.name)}"></div>` +
    FORMS[el.type].map(f => (f.list ? listHTML(f, el.params) : fieldHTML(f, el.params))).join('');
  renderInfo();
}
function renderInfo() {
  const md = curMd();
  if (!md) { $('#elInfo').innerHTML = ''; return; }
  $('#elInfo').innerHTML = md.info.map(s => `<div>${esc(s)}</div>`).join('') + md.notes.map(s => `<div class="warn">⚠ ${esc(s)}</div>`).join('') +
    `<div style="margin-top:6px">${md.members.length} profil parçası · ${md.boards.length} levha parçası</div>`;
}

function cardHTML(sh, i) { return `<div class="drw-card" data-zoom="${i}"><h4>${esc(sh.title)}</h4>${sh.S.svg()}</div>`; }
let currentSheets = [];

function cutTablesHTML(md) {
  const S = P.settings;
  let h = `<h3>${esc(md.el.code)} · ${esc(md.el.name)} — profil kesim listesi</h3><table class="t"><thead><tr><th>Poz</th><th>Profil</th><th class="n">Kesim boyu</th><th class="n">Adet</th><th class="n">Toplam</th><th>Kullanım yeri</th><th>Not</th></tr></thead><tbody>`;
  for (const g of md.memberGroups) h += `<tr><td class="pz">${g.poz}</td><td>${g.kind}${g.sys}${g.strong ? '<span class="tag">takviye</span>' : ''}</td><td class="n">${g.len} mm</td><td class="n">${g.items.length}</td><td class="n">${nf(g.len * g.items.length / 1000, 2)} m</td><td>${esc([...g.roles].join(', '))}</td><td>${esc([...g.notes].join('; '))}${g.len > (g.kind === 'U' ? S.barU : S.barC) ? `<span class="tag">ekli (${S.spliceLap} mm bindirme)</span>` : ''}</td></tr>`;
  h += `</tbody></table><h3>Levha kesim listesi (${S.boardT} mm)</h3><table class="t"><thead><tr><th>Poz</th><th>Levha</th><th class="n">En × Boy</th><th class="n">Adet</th><th class="n">Alan</th><th>Yüz / kat</th><th>Çentik (boşluk kesimi)</th></tr></thead><tbody>`;
  for (const g of md.boardGroups) h += `<tr><td class="pz">${g.poz}</td><td>${BOARDS[g.type].short}</td><td class="n">${g.w} × ${g.h}</td><td class="n">${g.items.length}</td><td class="n">${nf(g.items.reduce((s, b) => s + b.area, 0), 2)} m²</td><td>${esc([...g.faces].join(', '))}</td><td>${g.notches.map(n => `${n.w}×${n.h} @ (${n.u}, ${n.v})`).join('<br>') || '—'}</td></tr>`;
  h += '</tbody></table><p class="hint">Çentik konumu: parçanın sol-alt köşesinden (yatay, düşey) mm. Levha ölçüleri kesim ölçüsüdür; ±2 mm tolerans.</p>';
  return h;
}

function bomHTML() {
  if (!T) return '<p class="hint">Eleman yok.</p>';
  const c = P.settings.currency;
  let h = `<table class="t"><thead><tr><th>Malzeme</th><th class="n">Miktar</th><th>Birim</th><th class="n">Birim fiyat</th><th class="n">Tutar</th><th>Açıklama</th></tr></thead><tbody>`;
  let g0 = '';
  for (const r of T.rows) {
    if (r.grp !== g0) { g0 = r.grp; h += `<tr class="grp"><td colspan="6">${esc(g0)}</td></tr>`; }
    h += `<tr><td>${esc(r.name)}</td><td class="n">${nf(r.qty, r.unit === 'adet' || r.unit === 'boy' ? 0 : 1)}</td><td>${r.unit}</td><td class="n">${r.price ? nf(r.price, 2) + ' ' + c : '—'}</td><td class="n">${r.total ? nf(r.total, 2) + ' ' + c : '—'}</td><td>${esc(r.note)}</td></tr>`;
  }
  h += `</tbody><tfoot><tr><td colspan="4">Toplam malzeme (KDV hariç, ek kalemler hariç)</td><td class="n">${nf(T.total, 2)} ${c}</td><td></td></tr></tfoot></table>`;
  h += `<p class="hint">Sarf malzemelere %${P.settings.wastePct} fire eklenmiştir. Profil boy ve levha adetleri kesim optimizasyonundan gelir. Fiyatlar Ayarlar'dan güncellenir.</p>`;
  return h;
}

function nestHTML(perPage = 0) {
  if (!T) return '';
  const S = P.settings;
  let h = '';
  for (const k of Object.keys(T.bars).sort()) h += `<h3>Profil ${k} — ${T.bars[k].bars.length} boy</h3><div class="bars">${barsView(k, T.bars[k]).svg()}</div>`;
  for (const t of Object.keys(T.sheetNest)) {
    const n = T.sheetNest[t];
    h += `<h3>${esc(BOARDS[t].label)} — ${n.sheets.length} levha</h3><div class="nest-grid">${n.sheets.map((s, i) => sheetView(s, S.sheetW, S.sheetH, t, i + 1, n.sheets.length).svg()).join('')}</div>`;
    if (n.oversize.length) h += `<p class="warn">Levhaya sığmayan parçalar: ${n.oversize.map(o => o.tag).join(', ')}</p>`;
  }
  return h;
}

function stepsHTML(md, checks = true) {
  const st = steps(md, P.settings);
  return `<ol class="steps">${st.map(s => `<li><b>${esc(s.title)}</b><ul>${s.items.map(i => `<li>${checks ? `<label><input type="checkbox"> <span>${esc(i)}</span></label>` : esc(i)}</li>`).join('')}</ul></li>`).join('')}</ol>`;
}

async function renderTab() {
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  document.querySelectorAll('.pane').forEach(p => p.classList.toggle('on', p.dataset.pane === tab));
  const md = curMd();
  if (tab === '3d') { const v = await ensure3D(); v?.resize(); v?.show(md || null); }
  else if (tab === 'draw') { currentSheets = md ? elementSheets(md) : []; $('#drawings').innerHTML = currentSheets.map(cardHTML).join('') || '<p class="doc hint">Eleman seçin.</p>'; }
  else if (tab === 'clad') { currentSheets = md ? cladSheets(md) : []; $('#cladViews').innerHTML = currentSheets.map(cardHTML).join('') || '<p class="doc hint">Bu elemanda kaplama yok.</p>'; }
  else if (tab === 'cut') $('#cutList').innerHTML = md ? cutTablesHTML(md) : '';
  else if (tab === 'plan') $('#nestViews').innerHTML = nestHTML();
  else if (tab === 'bom') $('#bom').innerHTML = bomHTML();
  else if (tab === 'steps') $('#steps').innerHTML = md ? `<h3>${esc(md.el.code)} · ${esc(md.el.name)} — imalat aşamaları</h3>` + stepsHTML(md) : '';
}

let tmr = 0;
function refresh(full = true) {
  compute();
  save();
  renderList();
  if (full) renderForm(); else renderInfo();
  clearTimeout(tmr);
  tmr = setTimeout(renderTab, full ? 0 : 120);
}

/* ───────────── olaylar ───────────── */
$('#tabs').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { tab = b.dataset.tab; renderTab(); } });
$('#elList').addEventListener('click', e => {
  const d = e.target.closest('[data-del]'), c = e.target.closest('[data-dup]'), li = e.target.closest('li[data-id]');
  if (d) {
    const el = P.elements.find(x => x.id === d.dataset.del);
    if (!confirm(`${el.code} · ${el.name} silinsin mi?`)) return;
    P.elements = P.elements.filter(x => x !== el);
    if (sel === el.id) sel = P.elements[0]?.id || null;
    return refresh();
  }
  if (c) {
    const src = P.elements.find(x => x.id === c.dataset.dup);
    const el = addEl(P, src.type); el.params = clone(src.params); el.name = src.name + ' (kopya)';
    sel = el.id; return refresh();
  }
  if (li) { sel = li.dataset.id; view3d && (view3d.fitted = false); refresh(); }
});
$('#addBtns').innerHTML = Object.entries(TYPES).map(([k, t]) => `<button data-add="${k}"><span>${t.icon}</span>${t.label}</button>`).join('');
$('#addBtns').addEventListener('click', e => {
  const b = e.target.closest('[data-add]'); if (!b) return;
  sel = addEl(P, b.dataset.add).id; view3d && (view3d.fitted = false); refresh();
});
$('#props').addEventListener('input', e => {
  const el = curEl(); if (!el) return;
  const t = e.target;
  if (t.dataset.name != null) { el.name = t.value; save(); renderList(); return; }
  if (t.dataset.k) {
    const old = getP(el.params, t.dataset.k);
    setP(el.params, t.dataset.k, t.type === 'checkbox' ? t.checked : cast(t.value, old));
    if (t.type === 'number' && t.value === '') return;
    return refresh(false);
  }
  if (t.dataset.li) {
    const [l, i, k] = t.dataset.li.split(':');
    const it = el.params[l][+i];
    it[k] = cast(t.value, it[k]);
    if (t.tagName === 'SELECT') { refresh(); return; }
    if (t.value === '') return;
    return refresh(false);
  }
});
$('#props').addEventListener('change', e => { if (e.target.tagName === 'SELECT' && e.target.dataset.k) renderForm(); });
$('#props').addEventListener('click', e => {
  const el = curEl(); if (!el) return;
  const rm = e.target.closest('[data-rm]'), ad = e.target.closest('[data-addli]');
  if (rm) { const [l, i] = rm.dataset.rm.split(':'); el.params[l].splice(+i, 1); refresh(); }
  if (ad) { const L = FORMS[el.type].find(f => f.list === ad.dataset.addli); (el.params[L.list] ||= []).push(L.add()); refresh(); }
});
$('#projName').value = P.name;
$('#projName').addEventListener('input', e => { P.name = e.target.value; save(); });

$('#boardOp').addEventListener('input', e => { if (view3d) { view3d.opts.boards = +e.target.value; view3d.show(curMd()); } });
$('#showFrame').addEventListener('change', e => { if (view3d) { view3d.opts.frame = e.target.checked; view3d.show(curMd()); } });
$('#fitBtn').addEventListener('click', () => view3d?.fit());

/* yakınlaştırma */
['#drawings', '#cladViews'].forEach(s => $(s).addEventListener('click', e => { const c = e.target.closest('[data-zoom]'); if (c) openZoom(currentSheets[+c.dataset.zoom].S.svg()); }));
$('#nestViews').addEventListener('click', e => { const s = e.target.closest('svg'); if (s) openZoom(s.outerHTML); });
function openZoom(svg) {
  const z = $('#zoom'); z.hidden = false;
  const body = $('#zoomBody'); body.innerHTML = svg;
  const el = body.querySelector('svg');
  let vb = el.getAttribute('viewBox').split(' ').map(Number);
  const set = () => el.setAttribute('viewBox', vb.join(' '));
  body.onwheel = e => {
    e.preventDefault();
    const r = el.getBoundingClientRect(), k = e.deltaY > 0 ? 1.15 : 1 / 1.15;
    const s = Math.max(vb[2] / r.width, vb[3] / r.height);
    const mx = vb[0] + (e.clientX - r.left - (r.width - vb[2] / s) / 2) * s, my = vb[1] + (e.clientY - r.top - (r.height - vb[3] / s) / 2) * s;
    vb = [mx - (mx - vb[0]) * k, my - (my - vb[1]) * k, vb[2] * k, vb[3] * k]; set();
  };
  const pts = new Map(); let last = null, pinch = 0;
  body.onpointerdown = e => { body.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); last = [e.clientX, e.clientY]; };
  body.onpointermove = e => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, [e.clientX, e.clientY]);
    const r = el.getBoundingClientRect(), s = Math.max(vb[2] / r.width, vb[3] / r.height);
    if (pts.size === 2) {
      const [a, b] = [...pts.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (pinch) { const k = pinch / d; const cx = vb[0] + vb[2] / 2, cy = vb[1] + vb[3] / 2; vb = [cx - vb[2] * k / 2, cy - vb[3] * k / 2, vb[2] * k, vb[3] * k]; set(); }
      pinch = d; return;
    }
    vb[0] -= (e.clientX - last[0]) * s; vb[1] -= (e.clientY - last[1]) * s; last = [e.clientX, e.clientY]; set();
  };
  body.onpointerup = body.onpointercancel = e => { pts.delete(e.pointerId); pinch = 0; };
}
document.addEventListener('click', e => { if (e.target.closest('[data-close]')) { e.target.closest('.modal,.zoom').hidden = true; } });
document.addEventListener('keydown', e => { if (e.key === 'Escape') { $('#zoom').hidden = true; $('#modal').hidden = true; } });

/* ───────────── indirmeler ───────────── */
function download(name, data, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(data instanceof Blob ? data : new Blob([data], { type }));
  a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
const fileBase = () => (P.name || 'proje').replace(/[^\wçğıöşüÇĞİÖŞÜ-]+/g, '_');
document.addEventListener('click', e => {
  const b = e.target.closest('[data-dl]'); if (!b) return;
  const md = curMd();
  if (b.dataset.dl === 'csv') {
    const rows = [['Grup', 'Malzeme', 'Miktar', 'Birim', 'Birim fiyat', 'Tutar', 'Açıklama'], ...T.rows.map(r => [r.grp, r.name, r.qty, r.unit, r.price, Math.round(r.total * 100) / 100, r.note])];
    for (const m of models) {
      rows.push([], [`${m.el.code} ${m.el.name} — profil kesim listesi`], ['Poz', 'Profil', 'Boy (mm)', 'Adet', 'Kullanım']);
      for (const g of m.memberGroups) rows.push([g.poz, g.kind + g.sys, g.len, g.items.length, [...g.roles].join(', ')]);
      rows.push(['Poz', 'Levha', 'En (mm)', 'Boy (mm)', 'Adet', 'Yüz']);
      for (const g of m.boardGroups) rows.push([g.poz, BOARDS[g.type].short, g.w, g.h, g.items.length, [...g.faces].join(', ')]);
    }
    const csv = '﻿' + rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
    return download(`${fileBase()}_malzeme.csv`, csv, 'text/csv;charset=utf-8');
  }
  if (!md) return;
  const sheets = [...elementSheets(md).filter(s => !s.detail), ...cladSheets(md)].map(s => s.S);
  if (b.dataset.dl === 'dxf') download(`${fileBase()}_${md.el.code}.dxf`, toDXF(sheets), 'application/dxf');
  if (b.dataset.dl === 'svg') download(`${fileBase()}_${md.el.code}_on.svg`, sheets[0].svg(), 'image/svg+xml');
});

/* ───────────── üst menü ───────────── */
$('.top-actions').addEventListener('click', e => {
  const a = e.target.closest('[data-act]')?.dataset.act;
  if (a === 'new') {
    if (!confirm('Yeni proje başlatılsın mı? Kaydedilmemiş değişiklikler için önce "Kaydet" ile dosyaya alın.')) return;
    const s = P.settings; P = blankProject(); P.settings = s; sel = null; $('#projName').value = P.name; refresh();
  }
  if (a === 'save') download(`${fileBase()}.drywall.json`, JSON.stringify({ app: 'SAGG Drywall+', version: APP_VERSION, ...P }, null, 1), 'application/json');
  if (a === 'open') $('#fileIn').click();
  if (a === 'settings') openSettings();
  if (a === 'info') openInfo();
  if (a === 'report') openReport();
});
$('#fileIn').addEventListener('change', async e => {
  const f = e.target.files[0]; if (!f) return;
  try {
    const p = JSON.parse(await f.text());
    if (!Array.isArray(p.elements)) throw new Error('Geçersiz dosya');
    delete p.app; delete p.version;
    P = normalize(p); sel = P.elements[0]?.id || null; $('#projName').value = P.name; refresh();
  } catch (err) { alert('Dosya açılamadı: ' + err.message); }
  e.target.value = '';
});

function modal(html, onInput) {
  $('#modalBody').innerHTML = html;
  $('#modal').hidden = false;
  $('#modalBody').oninput = onInput;
}
function openInfo() {
  const f = [['name', 'Proje adı'], ['client', 'Müşteri'], ['address', 'Adres / konum'], ['author', 'Hazırlayan'], ['date', 'Tarih', 'date'], ['note', 'Not']];
  modal(`<h2>Proje bilgileri</h2>${f.map(([k, l, t]) => `<div class="fld"><label>${l}</label><input type="${t || 'text'}" data-pk="${k}" value="${esc(P[k])}"></div>`).join('')}<p class="hint">Bilgiler çıktı kapağında ve antetlerde yer alır.</p>`,
    e => { const k = e.target.dataset.pk; if (k) { P[k] = e.target.value; if (k === 'name') $('#projName').value = P.name; save(); } });
}
function openSettings() {
  const S = P.settings;
  const n = (k, l, u = 'mm', st = 1) => `<div class="fld"><label>${l}</label><span class="u" data-u="${u}"><input type="number" step="${st}" data-sk="${k}" value="${getP(S, k)}"></span></div>`;
  const prices = [['U50', 'U50 profil (boy)'], ['U75', 'U75 profil (boy)'], ['U100', 'U100 profil (boy)'], ['C50', 'C50 profil (boy)'], ['C75', 'C75 profil (boy)'], ['C100', 'C100 profil (boy)'], ['corner', 'Köşe profili (boy)'],
    ...Object.keys(BOARDS).map(k => ['sheet_' + k, BOARDS[k].label + ' (adet)']), ['TN25', 'TN25 vida (adet)'], ['TN35', 'TN35 vida (adet)'], ['LN9', 'LN9,5 vida (adet)'], ['dowel', 'Dübel (adet)'],
    ['tape_seal', 'Sızdırmazlık bandı (m)'], ['tape_joint', 'Derz bandı (m)'], ['filler', 'Derz dolgu (kg)'], ['insul', 'Yalıtım (m²)'], ['labor_m2', 'İşçilik (m², 0 = hariç)']];
  modal(`<h2>Ayarlar</h2>
    <div class="sec">Levha ve profil</div>
    ${n('boardT', 'Levha kalınlığı', 'mm', 0.5)}
    <div class="fld"><label>Levha ölçüsü</label><select data-sk="sheetH">${[2000, 2500, 2600, 2800, 3000].map(h => `<option value="${h}" ${h === S.sheetH ? 'selected' : ''}>1200 × ${h}</option>`).join('')}</select></div>
    <div class="fld"><label>U profil boyu</label><select data-sk="barU">${[3000, 4000].map(h => `<option ${h === S.barU ? 'selected' : ''}>${h}</option>`).join('')}</select></div>
    <div class="fld"><label>C profil boyu</label><select data-sk="barC">${[2600, 3000, 4000].map(h => `<option ${h === S.barC ? 'selected' : ''}>${h}</option>`).join('')}</select></div>
    ${n('kerfBar', 'Profil kesim payı')}${n('kerfSheet', 'Levha kesim payı')}${n('spliceLap', 'Profil ek bindirmesi')}
    <div class="sec">Montaj</div>
    ${n('dowelPitch', 'Dübel aralığı')}${n('screwPitchOuter', 'Dış kat vida aralığı')}${n('screwPitchInner', 'İç kat vida aralığı')}
    <div class="fld chk"><label>Dikmeler raylara LN vida ile bağlanır</label><input type="checkbox" data-sk="studToTrackScrew" ${S.studToTrackScrew ? 'checked' : ''}></div>
    ${n('wastePct', 'Sarf malzeme firesi', '%')}
    <div class="sec">Birim fiyatlar (${esc(S.currency)}, KDV hariç)</div>
    ${prices.map(([k, l]) => n('prices.' + k, l, S.currency, 0.01)).join('')}
    <div class="fld"><label>Firma (antet)</label><input type="text" data-sk="company" value="${esc(S.company)}"></div>
    <p style="margin-top:12px"><button type="button" id="resetSet">Varsayılanlara dön</button></p>`,
  e => {
    const k = e.target.dataset.sk; if (!k) return;
    const v = e.target.type === 'checkbox' ? e.target.checked : e.target.type === 'text' ? e.target.value : +e.target.value;
    if (typeof v === 'number' && !isFinite(v)) return;
    setP(S, k, v); refresh(false);
  });
  $('#resetSet').onclick = () => { P.settings = clone(DEFAULT_SETTINGS); refresh(); openSettings(); };
}

/* ───────────── imalat dosyası (yazdır / PDF) ───────────── */
const REP_CATS = [['cover', 'Kapak'], ['draw', 'Çizimler'], ['clad', 'Kaplama'], ['cut', 'Kesim listeleri'], ['plan', 'Kesim planı'], ['bom', 'Malzeme'], ['steps', 'Aşamalar']];
async function openReport() {
  if (!models.length) return alert('Önce eleman ekleyin.');
  const S = P.settings;
  const pages = [];
  const page = (cat, el, title, body) => pages.push({ cat, el, title, body });
  // 3B görüntüler
  const v = await ensure3D();
  const shots = {};
  if (v) {
    const host = $('#v3d'), prevTab = tab;
    if (tab !== '3d') { document.querySelector('[data-pane="3d"]').classList.add('on'); }
    const keep = { ...v.opts };
    v.opts.boards = 0.45; v.opts.frame = true;
    host.style.width = '1200px'; host.style.height = '800px'; v.resize();
    for (const m of models) { v.show(m, true); shots[m.el.id] = v.png(); }
    host.style.width = ''; host.style.height = '';
    Object.assign(v.opts, keep);
    if (prevTab !== '3d') document.querySelector('[data-pane="3d"]').classList.remove('on');
    v.resize(); v.fitted = false; v.show(curMd() || null);
  }
  // kapak
  const elRows = models.map(m => `<tr><td class="pz">${esc(m.el.code)}</td><td>${esc(m.el.name)}</td><td>${TYPES[m.el.type].label}</td><td>${esc(m.info[0])}</td></tr>`).join('');
  page('cover', null, 'Kapak', `<div class="brandline"></div><div class="cover"><div><h1>${esc(P.name)}</h1>
    <div class="kv"><b>Müşteri</b><span>${esc(P.client) || '—'}</span><b>Adres</b><span>${esc(P.address) || '—'}</span><b>Hazırlayan</b><span>${esc(P.author) || '—'}</span><b>Tarih</b><span>${esc(P.date)}</span><b>Firma</b><span>${esc(S.company)}</span>${P.note ? `<b>Not</b><span>${esc(P.note)}</span>` : ''}</div>
    <h3 style="margin-top:8mm">Elemanlar</h3><table class="t"><thead><tr><th>Kod</th><th>Ad</th><th>Tip</th><th>Ölçü</th></tr></thead><tbody>${elRows}</tbody></table>
    <h3>Özet</h3><div class="kv"><b>Profil</b><span>${nf(T.rows.filter(r => r.grp === 'Profil').reduce((a, r) => a + r.qty, 0))} boy</span><b>Levha</b><span>${nf(T.rows.filter(r => r.grp === 'Levha').reduce((a, r) => a + r.qty, 0))} adet (${S.sheetW}×${S.sheetH})</span><b>Kaplama yüzeyi</b><span>${nf(T.cladArea, 1)} m²</span><b>Malzeme bedeli</b><span>${nf(T.total, 2)} ${S.currency} (KDV hariç)</span></div>
    </div><div>${shots[models[0].el.id] ? `<img src="${shots[models[0].el.id]}" alt="">` : ''}<p class="hint" style="margin-top:3mm">SAGG Drywall+ ile hazırlanmıştır. Tüm ölçüler mm'dir. İmalattan önce yerinde ölçü kontrolü yapınız.</p></div></div>`);
  for (const m of models) {
    const nm = `${m.el.code} · ${m.el.name}`;
    const sh = elementSheets(m);
    page('draw', m, 'Genel görünüş', `<h2>${esc(nm)} — genel görünüş ve bilgiler</h2><div class="cover"><div>${shots[m.el.id] ? `<img src="${shots[m.el.id]}" alt="">` : ''}</div><div><div class="el-info">${m.info.map(s => `<div>${esc(s)}</div>`).join('')}${m.notes.map(s => `<div class="warn">⚠ ${esc(s)}</div>`).join('')}</div>
      ${m.extras.length ? `<h3>Ek kalemler</h3><ul style="padding-left:5mm">${m.extras.map(x => `<li>${esc(x.name)} — ${x.qty} ${x.unit}${x.note ? ` (${esc(x.note)})` : ''}</li>`).join('')}</ul>` : ''}
      <h3>Renk anahtarı</h3><div class="legend" style="position:static;display:inline-flex"><i style="background:#2d8fa3"></i>C dikme <i style="background:#7a8a99"></i>U ray <i style="background:#d4692a"></i>Kasa / takviye</div></div></div>`);
    for (const s of sh.filter(s => !s.detail)) page('draw', m, s.title, `<h2>${esc(nm)} — ${esc(s.title)}</h2><div class="draw">${s.S.svg()}</div>`);
    const det = sh.filter(s => s.detail);
    if (det.length) page('draw', m, 'Detaylar', `<h2>${esc(nm)} — detaylar</h2><div class="draw2">${det.map(s => `<div>${s.S.svg()}</div>`).join('')}</div>`);
    for (const s of cladSheets(m)) page('clad', m, s.title, `<h2>${esc(nm)} — ${esc(s.title)}</h2><div class="draw">${s.S.svg()}</div>`);
    // kesim listeleri: uzun tablolar sayfalara bölünür
    const cut = cutTablesHTML(m);
    page('cut', m, 'Kesim listesi', `<h2>${esc(nm)} — kesim listesi</h2>${cut.replace(/<h3>[^<]*— profil kesim listesi<\/h3>/, '<h3>Profil kesim listesi</h3>')}`);
    page('steps', m, 'İmalat aşamaları', `<h2>${esc(nm)} — imalat aşamaları</h2><div class="cols2">${stepsHTML(m, false)}</div>`);
  }
  // kesim planı
  for (const k of Object.keys(T.bars).sort()) {
    const d = T.bars[k], per = 14;
    for (let i = 0; i < d.bars.length; i += per) {
      const part = { ...d, bars: d.bars.slice(i, i + per) };
      page('plan', null, `Profil kesim planı ${k}`, `<h2>Profil kesim planı — ${k} (${i + 1}–${Math.min(d.bars.length, i + per)} / ${d.bars.length} boy)</h2><div class="draw" style="height:auto;max-height:160mm">${barsView(k, part).svg()}</div>`);
    }
  }
  for (const t of Object.keys(T.sheetNest)) {
    const n = T.sheetNest[t], per = 8;
    for (let i = 0; i < n.sheets.length; i += per)
      page('plan', null, 'Levha kesim planı', `<h2>Levha kesim planı — ${esc(BOARDS[t].label)} (${i + 1}–${Math.min(n.sheets.length, i + per)} / ${n.sheets.length})</h2><div class="nest-grid">${n.sheets.slice(i, i + per).map((s, j) => sheetView(s, S.sheetW, S.sheetH, t, i + j + 1, n.sheets.length).svg()).join('')}</div><p class="hint">↻ döndürülmüş parça · ✂ çentikli parça (kesim listesindeki çentik ölçülerine bakın) · kesim payı ${S.kerfSheet} mm</p>`);
  }
  page('bom', null, 'Malzeme listesi', `<h2>Malzeme listesi ve maliyet</h2>${bomHTML()}`);

  const date = P.date;
  const body = pages.map((p, i) => `<section class="page${p.cat === 'cut' || p.cat === 'steps' || p.cat === 'bom' ? ' flow' : ''}" data-cat="${p.cat}">${p.body}<div class="tb"><div><small>Proje</small>${esc(P.name)}</div><div><small>Eleman</small>${p.el ? esc(p.el.el.code + ' · ' + p.el.el.name) : 'Proje geneli'}</div><div><small>Pafta</small>${esc(p.title)}</div><div><small>Tarih</small>${esc(date)}</div><div><small>Sayfa</small>${i + 1} / ${pages.length}</div></div></section>`).join('');
  $('#reportBody').innerHTML = body;
  $('#repSel').innerHTML = REP_CATS.map(([k, l]) => `<label><input type="checkbox" data-rc="${k}" checked> ${l}</label>`).join('');
  $('#report').hidden = false;
}
$('#repSel').addEventListener('change', e => {
  const k = e.target.dataset.rc;
  document.querySelectorAll(`.page[data-cat="${k}"]`).forEach(p => (p.style.display = e.target.checked ? '' : 'none'));
});
$('#repPrint').addEventListener('click', () => window.print());
$('#repClose').addEventListener('click', () => { $('#report').hidden = true; $('#reportBody').innerHTML = ''; });

refresh();
