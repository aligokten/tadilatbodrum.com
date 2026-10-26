/* ═══ Zemin kaplaması sipariş listesi: çizimdeki mahaller malzemeye göre gruplanır, sipariş miktarları (PDF) ═══
   Karo (seramik, mermer, traverten, dış mekan taş): yerleşim simülasyonundan adet / kutu, yapıştırıcı, derz dolgu.
   Diğerleri (parke, laminat, halı, mikro beton): alan + fire, paket / rulo / kg, şilte ve süpürgelik. */
import { roomMetrics, polyCentroid } from './plan-geom.js';
import { floorOf } from './catalog.js';
import { tileable, tileOf, tileLayout, TILE_PATTERNS } from './tiles.js';

const num = (n, d = 2) => (Number(n) || 0).toLocaleString('tr-TR', { maximumFractionDigits: d });
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/* karo dışı kaplamalar: fire %, paket m² (0 = paket yok), süpürgelik / şilte, kg/m² */
export const FLOOR_MAT = {
  parke:   { fire: 8,  pack: 1.9,  packT: 'paket', skirt: true, under: true },
  laminat: { fire: 7,  pack: 2.22, packT: 'paket', skirt: true, under: true },
  hali:    { fire: 10, pack: 0,    packT: 'rulo',  skirt: false },
  beton:   { fire: 5,  pack: 0,    kgm2: 2.5, bag: 20 },
};
export const matCfg = (k, cfg = {}) => ({ name: '', ...(FLOOR_MAT[k] || { fire: 5, pack: 0 }), ...(cfg[k] || {}) });
const SKIRT_L = 2.4, UNDER_ROLL = 10;   // süpürgelik boyu (m), şilte rulosu (m²)

/* gruplar: karo → malzeme + boyut + ürün adı; diğerleri → malzeme */
export function floorOrderData(plan, { only = null, cfg = {} } = {}) {
  const groups = new Map();
  for (const r of plan.rooms) {
    if (only && !only.has(r.id)) continue;
    const m = roomMetrics(plan, r), perimNet = Math.max(0, m.perim - m.doorW);
    if (tileable(r)) {
      const t = tileOf(r), L = tileLayout(r, { perimNet, geom: false });
      const key = `${r.floor}|${L.a < L.b ? L.a : L.b}x${L.a < L.b ? L.b : L.a}|${t.th}|${(t.name || '').trim().toLocaleLowerCase('tr')}`;
      if (!groups.has(key)) groups.set(key, { tile: true, floor: r.floor, w: Math.min(L.a, L.b), l: Math.max(L.a, L.b), th: t.th, box: t.box, name: (t.name || '').trim(), rooms: [] });
      groups.get(key).rooms.push({ r, m, t, L });
    } else {
      const key = r.floor || 'parke';
      if (!groups.has(key)) groups.set(key, { tile: false, floor: key, rooms: [] });
      groups.get(key).rooms.push({ r, m, perimNet });
    }
  }
  const out = [...groups.values()].sort((a, b) => (b.tile - a.tile) || floorOf(a.floor).t.localeCompare(floorOf(b.floor).t, 'tr') || (a.w * a.l || 0) - (b.w * b.l || 0));
  out.forEach((g, i) => {
    g.code = 'Z' + (i + 1);
    g.area = g.rooms.reduce((s, x) => s + x.m.area, 0);
    if (g.tile) {
      const S = k => g.rooms.reduce((s, x) => s + (x.L[k] || 0), 0);
      g.full = S('full'); g.cut = S('cut'); g.used = S('used'); g.order = S('order'); g.total = S('total');
      g.skirt = g.rooms.reduce((s, x) => s + (x.L.skirt?.tiles || 0), 0);
      g.box = g.rooms[0].t.box; g.boxes = g.box > 0 ? Math.ceil(g.total / g.box) : 0;
      g.m2 = g.total * g.w * g.l / 1e4;
      g.glueKg = S('glueKg'); g.groutKg = S('groutKg');
      g.glueBags = Math.ceil(g.glueKg / 25); g.groutBags = Math.ceil(g.groutKg / 5);
      g.joints = [...new Set(g.rooms.map(x => num(x.t.g, 1) + ' mm'))].join(', ');
    } else {
      const c = matCfg(g.floor, cfg);
      g.cfg = c; g.name = c.name || '';
      g.m2 = g.area * (1 + c.fire / 100);
      g.packs = c.pack > 0 ? Math.ceil(g.m2 / c.pack) : 0;
      g.kg = c.kgm2 ? g.m2 * c.kgm2 : 0; g.bags = c.kgm2 && c.bag ? Math.ceil(g.kg / c.bag) : 0;
      g.skirtM = c.skirt ? g.rooms.reduce((s, x) => s + x.perimNet, 0) : 0;
      g.skirtN = g.skirtM ? Math.ceil(g.skirtM * 1.05 / SKIRT_L) : 0;
      g.underM2 = c.under ? g.area * 1.05 : 0; g.underN = g.underM2 ? Math.ceil(g.underM2 / UNDER_ROLL) : 0;
    }
  });
  return out;
}

const matName = k => floorOf(k).t.replace(/\s*\(.*\)$/, '');
export const groupTitle = g => `${matName(g.floor)}${g.tile ? ` ${num(g.w, 1)} × ${num(g.l, 1)} cm` : ''}`;
const patName = k => TILE_PATTERNS.find(p => p.k === k)?.t || k;

/* sipariş özeti satırları: [malzeme, ürün, miktar, sipariş] */
export function orderLines(groups) {
  const L = [];
  for (const g of groups) {
    if (g.tile) {
      L.push([g.code, groupTitle(g) + ` · ${num(g.th, 1)} mm`, g.name, `${num(g.m2)} m²`, `<b>${g.total} adet</b>${g.boxes ? ` · ${g.boxes} kutu (${g.box}'lü)` : ''}`]);
      if (g.glueKg) L.push(['', 'Seramik yapıştırıcısı', '', `≈ ${num(g.glueKg, 0)} kg`, `<b>${g.glueBags} torba</b> (25 kg)`]);
      if (g.groutKg) L.push(['', `Derz dolgu (${g.joints})`, '', `≈ ${num(g.groutKg, 1)} kg`, `<b>${g.groutBags} torba</b> (5 kg)`]);
    } else {
      const c = g.cfg;
      L.push([g.code, groupTitle(g), g.name, `${num(g.m2)} m²`, c.pack > 0 ? `<b>${g.packs} ${c.packT}</b> (${num(c.pack)} m²)` : g.bags ? `<b>${g.bags} torba</b> (${c.bag} kg, ≈ ${num(g.kg, 0)} kg)` : `<b>${num(g.m2)} m²</b>`]);
      if (g.underN) L.push(['', `${matName(g.floor)} altı şilte`, '', `${num(g.underM2)} m²`, `<b>${g.underN} rulo</b> (${UNDER_ROLL} m²)`]);
      if (g.skirtN) L.push(['', `Süpürgelik (${num(SKIRT_L, 1)} m boy)`, '', `${num(g.skirtM)} m`, `<b>${g.skirtN} adet</b>`]);
    }
  }
  return L;
}

/* rapor gövdesi (docHeader / docFooter app tarafında eklenir) */
export function floorOrderHtml(plan, groups, { keyPlan = null, note = '' } = {}) {
  if (!groups.length) return '';
  const tot = groups.reduce((s, g) => s + g.area, 0), nR = groups.reduce((s, g) => s + g.rooms.length, 0);
  const tiles = groups.filter(g => g.tile);
  return `
    <section class="p-cust">
      <div><small>Mahal</small><b>${nR} mahal</b>${num(tot)} m² net zemin</div>
      <div><small>Malzeme</small><b>${groups.length} kalem</b>${[...new Set(groups.map(g => matName(g.floor)))].join(', ')}</div>
      ${tiles.length ? `<div><small>Karo</small><b>${tiles.reduce((s, g) => s + g.total, 0)} adet</b>${tiles.reduce((s, g) => s + g.boxes, 0)} kutu · ${num(tiles.reduce((s, g) => s + g.m2, 0))} m²</div>` : ''}
    </section>
    <section><h3>Sipariş özeti</h3>
      <table class="p-table sm"><thead><tr><th>Kod</th><th>Malzeme</th><th>Ürün / seri</th><th class="r">Miktar</th><th class="r">Sipariş</th></tr></thead><tbody>
      ${orderLines(groups).map(([c, t, n, q, o]) => `<tr${c ? '' : ' class="sub"'}><td><b>${c}</b></td><td>${esc(t)}</td><td>${esc(n) || (c ? '<span class="muted">—</span>' : '')}</td><td class="r">${q}</td><td class="r">${o}</td></tr>`).join('')}
      </tbody></table>
      ${note ? `<p class="small">${esc(note)}</p>` : ''}
    </section>
    ${keyPlan ? `<section><h3>Anahtar plan <small>— mahallerdeki malzeme kodları</small></h3><div class="p-plan"><img src="${keyPlan(keyOverlay(plan, groups))}" alt="Anahtar plan"></div></section>` : ''}
    <section class="${keyPlan ? 'p-break' : ''}"><h3>Mahal bazında döküm</h3>
      ${groups.map(g => g.tile ? `
      <table class="p-table sm"><thead><tr><th colspan="8">${g.code} · ${esc(groupTitle(g))} · ${num(g.th, 1)} mm${g.name ? ' · ' + esc(g.name) : ''}</th></tr>
        <tr class="grp"><td>Mahal</td><td class="r">Alan</td><td>Döşeme</td><td class="r">Derz</td><td class="r">Tam</td><td class="r">Kesik</td><td class="r">Giren + yedek</td><td class="r">Süpürgelik</td></tr></thead><tbody>
        ${g.rooms.map(x => `<tr><td>${esc(x.r.name)}</td><td class="r">${num(x.m.area)} m²</td><td>${esc(patName(x.L.t.pat))}${x.t.start === 'kose' ? ' <small class="muted">(köşeden)</small>' : ''}</td><td class="r">${num(x.t.g, 1)} mm</td><td class="r">${x.L.full}</td><td class="r">${x.L.cut}</td><td class="r">${x.L.used} + ${x.L.order - x.L.used}</td><td class="r">${x.L.skirt ? `${x.L.skirt.tiles} <small class="muted">(${num(x.L.skirt.len, 1)} m)</small>` : '—'}</td></tr>`).join('')}
        <tr class="grp"><td>Toplam</td><td class="r">${num(g.area)} m²</td><td></td><td></td><td class="r">${g.full}</td><td class="r">${g.cut}</td><td class="r">${g.order}</td><td class="r">${g.skirt || '—'}</td></tr>
        <tr><td colspan="6"><b>Sipariş</b></td><td class="r" colspan="2"><b>${g.total} adet${g.boxes ? ` · ${g.boxes} kutu` : ''}</b> · ${num(g.m2)} m²</td></tr>
      </tbody></table>` : `
      <table class="p-table sm"><thead><tr><th colspan="4">${g.code} · ${esc(groupTitle(g))}${g.name ? ' · ' + esc(g.name) : ''}</th></tr>
        <tr class="grp"><td>Mahal</td><td class="r">Net alan</td><td class="r">Fireli alan (%${num(g.cfg.fire, 1)})</td><td class="r">Süpürgelik</td></tr></thead><tbody>
        ${g.rooms.map(x => `<tr><td>${esc(x.r.name)}</td><td class="r">${num(x.m.area)} m²</td><td class="r">${num(x.m.area * (1 + g.cfg.fire / 100))} m²</td><td class="r">${g.cfg.skirt ? num(x.perimNet) + ' m' : '—'}</td></tr>`).join('')}
        <tr class="grp"><td>Toplam</td><td class="r">${num(g.area)} m²</td><td class="r">${num(g.m2)} m²</td><td class="r">${g.skirtM ? num(g.skirtM) + ' m' : '—'}</td></tr>
      </tbody></table>`).join('')}
      <p class="muted small" style="font-size:8.5pt">Karo adetleri her mahalde karoların çizim üzerine yerleştirilmesiyle hesaplanmıştır: kesilen her karo bir karo sayılır, yarımdan küçük iki parça aynı karodan çıkarılır; yedek payı mahal bazında eklenir. Süpürgelik kapı genişlikleri düşülerek hesaplanır. Yapıştırıcı ve derz dolgu miktarları yaklaşıktır; ürünün teknik föyündeki sarfiyata göre kontrol edilmelidir. Siparişten önce ölçüler yerinde doğrulanmalıdır.</p>
    </section>`;
}

/* anahtar plan: her mahalin ortasında malzeme kodu */
function keyOverlay(plan, groups) {
  const code = new Map(); groups.forEach(g => g.rooms.forEach(x => code.set(x.r.id, g.code)));
  return s => plan.rooms.filter(r => code.has(r.id)).map(r => {
    const c = polyCentroid(r.pts), w = 34 / s, h = 18 / s, y = c.y + 22 / s;
    return `<g><rect x="${c.x - w / 2}" y="${y}" width="${w}" height="${h}" rx="${4 / s}" fill="#EB591F"/><text x="${c.x}" y="${y + 13 / s}" font-size="${12 / s}" font-weight="800" fill="#fff" text-anchor="middle" font-family="Inter,Arial,sans-serif">${code.get(r.id)}</text></g>`;
  }).join('');
}
