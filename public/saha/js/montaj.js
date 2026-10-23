/* ═══ Montaj şeması görüntüleyici (/m/KİMLİK?p=PARÇA) ═══
 * Etiketteki QR kod buraya gelir. Veri 'shares' koleksiyonundan REST ile okunur (SDK yüklenmez, kimliği bilen okur).
 * p=D1-042 → dolap parçası: mobilya ön görünüşünde / iç düzeninde parçanın yeri turuncu yanıp söner;
 * p=K01-1 / P01-1 / B01-1 → doğrama: anahtar planda yeri ve ölçülü görünüşü.
 */
import { decodeShare } from './share.js';
import { elevation, elevationSvg, MT } from './cabinet.js';
import { partInstances, partRegion, STEPS, modOf } from './assembly.js';
import { joineryList, elevationSvg as jnSvg } from './joinery.js';
import { planThumbSvg } from './plan2d.js';
import { modelName, useName } from './openings.js';

const $ = s => document.querySelector(s), app = $('#app');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fail = (t, d) => { app.innerHTML = `<div class="msg"><b>${esc(t)}</b><p>${esc(d)}</p></div>`; };
const HL = 'rgba(235,89,31,.62)';
const link = k => `${location.pathname}?p=${encodeURIComponent(k)}${location.search.includes('k=') ? '&k=' + new URLSearchParams(location.search).get('k') : ''}`;   // <base href> nedeniyle tam yol

async function load() {
  const sid = (location.pathname.match(/\/m\/([A-Za-z0-9]{6,20})\/?$/) || [])[1] || new URLSearchParams(location.search).get('k');
  if (!sid) { const h = location.hash.slice(1); if (!h) throw new Error('empty'); return decodeShare(h); }
  const { firebaseConfig: c, SITE_ID } = await import('/js/firebase-config.js');
  const r = await fetch(`https://firestore.googleapis.com/v1/projects/${c.projectId}/databases/(default)/documents/sites/${SITE_ID}/shares/${encodeURIComponent(sid)}?key=${c.apiKey}`);
  if (r.status === 404 || r.status === 403) throw Object.assign(new Error('gone'), { gone: true });
  if (!r.ok) throw new Error('http ' + r.status);
  return decodeShare((await r.json()).fields?.d?.stringValue || '');
}

let data;
try { data = await load(); if (!data || (!data.cabs && !data.p)) throw new Error('bad'); }
catch (e) {
  if (e.gone) fail('Bağlantı geçersiz', 'Bu montaj şeması kaldırılmış olabilir.');
  else if (e instanceof TypeError) fail('Bağlantı açılamadı', 'İnternet bağlantınızı kontrol edip sayfayı yenileyin.');
  else fail('Bağlantı açılamadı', 'QR kod eksik ya da bozuk okunmuş olabilir.');
  throw e;
}
$('#st').textContent = data.job ? `${data.job.code}${data.job.name ? ' · ' + data.job.name : ''}` : '';
const cabs = data.cabs || [], all = partInstances(cabs);

/* ön görünüş + vurgulu parça (SVG metni) */
/* zoom: { x, y, w, h } (ön görünüş cm) verilirse yalnızca o bölge (modül) büyütülerek gösterilir */
function cabFig(cab, region, view, zoom = null) {
  const H = cab.kind === 'wardrobe' ? cab.s.H : Math.max(cab.s.tallH, cab.s.upZ + cab.s.upH);
  const E = elevation(cab, { interior: view === 'inside', wallH: H + 15 });
  E.P.push({ t: 'rect', x: -12, y: -2, w: E.L + 24, h: H + 18, s: 'none', f: 'rgba(255,255,255,.5)', sw: 0 });   // diğer parçalar soluk
  for (const r of region.rects) E.P.push({ t: 'rect', ...r, s: '#EB591F', f: HL, sw: 1.6 });
  let svg = elevationSvg(E, { standalone: true }).replace(new RegExp(`fill="${HL.replace(/[().]/g, '\\$&')}"`, 'g'), `fill="${HL}" class="hl"`);
  if (zoom) {   // bağımsız SVG'de nokta (x, y) → (x + 45, E.H + 30 - y)
    const pad = 18, vb = [zoom.x + 45 - pad, E.H + 30 - (zoom.y + zoom.h) - pad, zoom.w + 2 * pad, zoom.h + 2 * pad];
    svg = svg.replace(/viewBox="[^"]*"/, `viewBox="${vb.map(v => v.toFixed(1)).join(' ')}"`);
  }
  return svg;
}
function where(inst, region) {
  const { r, i } = inst;
  if (r.part === 'Yan dikme') return i % 2 ? 'sağ yan' : 'sol yan';
  if (r.part === 'Alt / üst tabla') return i % 2 ? 'üst tabla' : 'alt tabla';
  if (r.part === 'Raf') return `${i + 1}. raf (alttan)`;
  if (r.n > 1) return `${i + 1} / ${r.n}`;
  return '';
}

function showPart(key) {
  const inst = all.find(x => x.key === key);
  if (!inst) return showIndex(`"${key}" parçası bu tasarımda bulunamadı. Tasarım değiştirilmiş olabilir.`);
  const { cab, label } = cabs[inst.ci], r = inst.r, region = partRegion(cab, inst, all);
  const modNo = /^[AÜG]\d+$/.test(r.mod) ? r.mod : '', mt = modNo ? MT[(() => { const row = modNo[0] === 'A' ? 'base' : modNo[0] === 'Ü' ? 'upper' : 'ward'; return cab[row][+modNo.slice(1) - 1]?.type; })()] : null;
  document.title = `${r.part} — Montaj şeması`;
  $('#t').textContent = label;
  let view = region.view, zoomOn = true;
  const M = /^[AÜG]\d+$/.test(r.mod) ? modOf(cab, r.mod) : null;
  const zoom = M ? { x: M.x0, y: M.y0 - (M.row === 'base' ? cab.s.plinth : 0), w: M.w, h: M.y1 - M.y0 + (M.row === 'base' ? cab.s.plinth : 0) } : null;
  const siblings = all.filter(x => x.ci === inst.ci && x.r.mod === r.mod);
  app.innerHTML = `
    <section class="card"><div class="part"><span class="badge">${esc((data.job?.code ? data.job.code + '-' : '') + key)}</span>
      <div><h1>${esc(r.part)}${where(inst) ? ` <small style="font-weight:600;color:var(--muted);font-size:14px">· ${esc(where(inst))}</small>` : ''}</h1>
      <p>${esc(label)}${modNo ? ` · modül ${esc(modNo)}${mt ? ' — ' + esc(mt.t) : ''}` : ` · ${esc(r.mod)}`}</p></div></div>
      <div class="dims">${r.L} × ${r.W} <small>mm</small></div>
      <dl class="kv"><dt>Malzeme</dt><dd>${esc(r.mat)}</dd><dt>Kenar bandı</dt><dd>${esc(r.band || 'yok')}</dd>${r.ops?.hinge ? `<dt>Delik</dt><dd>${r.ops.hinge} menteşe kasesi (Ø35)</dd>` : ''}${r.ops?.pins ? '<dt>Delik</dt><dd>Raf pimi sıraları (Ø5)</dd>' : ''}</dl></section>
    <section class="card"><h2>Mobilyadaki yeri</h2>
      <div class="seg"><button data-v="front">Ön görünüş</button><button data-v="inside">İç düzen</button></div>
      ${zoom ? '<div class="seg" style="margin-left:6px"><button data-z="1">Modül</button><button data-z="0">Tüm mobilya</button></div>' : ''}
      <div class="fig" id="fig"></div>
      <div class="legend"><span><i style="background:#EB591F"></i>Bu parça</span><span><i style="background:#E9EAEC;border:1px solid #C9CDD2"></i>Diğer parçalar</span></div></section>
    <section class="card"><h2>Montaj sırası</h2><ol class="steps">${STEPS.filter(s => cab.kind === 'kitchen' || s.k !== 'tezgah').map(s => `<li class="${s.k === region.step ? 'on' : ''}"><div><b>${s.t}</b>${s.d}</div></li>`).join('')}</ol></section>
    ${siblings.length > 1 ? `<section class="card"><h2>${modNo ? `Modül ${esc(modNo)} parçaları` : 'Aynı gruptaki parçalar'}</h2><div class="plist">${siblings.map(x => `<a href="${link(x.key)}" data-k="${x.key}" class="${x.key === key ? 'on' : ''}"><span>${esc(x.r.part)}${where(x) ? ' · ' + esc(where(x)) : ''}</span><small>${x.r.L} × ${x.r.W} · ${x.key}</small></a>`).join('')}</div></section>` : ''}
    <footer>TadilatBodrum.com · montaj şeması</footer>`;
  const draw = () => {
    $('#fig').innerHTML = cabFig(cab, region, view, zoomOn ? zoom : null);
    app.querySelectorAll('[data-v]').forEach(b => b.classList.toggle('on', b.dataset.v === view));
    app.querySelectorAll('[data-z]').forEach(b => b.classList.toggle('on', (b.dataset.z === '1') === zoomOn));
  };
  app.querySelectorAll('.seg').forEach(sg => sg.onclick = e => { const b = e.target.closest('[data-v],[data-z]'); if (!b) return; if (b.dataset.v) view = b.dataset.v; else zoomOn = b.dataset.z === '1'; draw(); });
  draw();
}

function showJoinery(no) {
  const only = data.only ? new Set(data.only) : null, plan = data.p;
  plan.rails ||= []; plan.labels ||= []; plan.dims ||= []; plan.items ||= []; plan.openings ||= []; plan.rooms ||= [];
  const list = joineryList(plan, only), T = list.find(t => t.items.some(x => x.no === no)), x = T?.items.find(y => y.no === no);
  if (!x) return showIndex(`"${no}" doğraması bu çizimde bulunamadı.`);
  const o = x.o, kind = { door: 'Kapı', window: 'Pencere', opening: 'Boşluk' }[o.type], gap = data.gap ?? 1;
  const ms = o.type === 'opening' || !gap ? null : [o.w - 2 * gap, o.h - (o.type === 'window' ? 2 : 1) * gap];
  document.title = `${no} ${kind} — Montaj şeması`;
  $('#t').textContent = `${kind} ${no}`;
  const ov = s => { const r = (o.w / 2 + 25); return `<circle cx="${x.c.x}" cy="${x.c.y}" r="${r}" fill="${HL}" stroke="#EB591F" stroke-width="${3 / s}" class="hl"/><text x="${x.c.x}" y="${x.c.y - r - 8 / s}" font-size="${16 / s}" font-weight="800" fill="#EB591F" text-anchor="middle" font-family="Inter,Arial">${no}</text>`; };
  app.innerHTML = `
    <section class="card"><div class="part"><span class="badge">${esc((data.job?.code ? data.job.code + '-' : '') + no)}</span>
      <div><h1>${kind} ${esc(no)}</h1><p>${o.type === 'opening' ? 'Kapısız boşluk' : `${esc(useName(o))} · ${esc(modelName(o))}`}</p></div></div>
      <div class="dims">${o.w} × ${o.h} <small>cm kaba açıklık</small></div>
      <dl class="kv">${ms ? `<dt>İmalat ölçüsü</dt><dd>${ms[0]} × ${ms[1]} cm</dd>` : ''}${o.type === 'window' ? `<dt>Parapet</dt><dd>${o.sill || 0} cm</dd>` : ''}<dt>Duvar</dt><dd>${x.t} cm</dd><dt>Mahal</dt><dd>${esc(x.where)}</dd>${x.open && x.open !== '—' ? `<dt>Açılım</dt><dd>${esc(x.open)}</dd>` : ''}</dl></section>
    <section class="card"><h2>Plandaki yeri</h2><div class="fig">${planThumbSvg(plan, 900, 620, true, false, ov)}</div></section>
    <section class="card"><h2>Ölçülü görünüş <small style="font-weight:500;color:var(--muted)">${o.type === 'window' ? '(iç taraftan)' : '(açıldığı taraftan)'}</small></h2><div class="fig" style="max-width:360px;margin:0 auto">${jnSvg(o, { mir: x.mir, gap, code: T.code })}</div></section>
    <footer>TadilatBodrum.com · montaj şeması</footer>`;
}

function showIndex(note = '') {
  $('#t').textContent = data.t || 'Montaj şeması';
  app.innerHTML = `${note ? `<section class="card"><p>${esc(note)}</p></section>` : ''}
    ${cabs.map((c, ci) => `<section class="card"><h2>${esc(c.label)}</h2><div class="plist">${all.filter(x => x.ci === ci).map(x => `<a href="${link(x.key)}"><span>${esc(x.r.mod)} · ${esc(x.r.part)}</span><small>${x.r.L} × ${x.r.W} · ${x.key}</small></a>`).join('')}</div></section>`).join('')}
    <footer>TadilatBodrum.com · montaj şeması</footer>`;
}

const route = () => {
  const p = new URLSearchParams(location.search).get('p') || '';
  if (/^D\d+-\d+$/.test(p)) showPart(p);
  else if (p && data.p) showJoinery(p);
  else showIndex();
  scrollTo(0, 0);
};
app.addEventListener('click', e => {
  const a = e.target.closest('a[href*="?p="]'); if (!a) return;
  e.preventDefault(); history.pushState(null, '', a.getAttribute('href') + location.hash); route();
});
addEventListener('popstate', route);
route();
