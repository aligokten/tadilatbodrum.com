/* ═══ Dışa aktarma: 3D (STL, 3DS, Collada/SketchUp, DXF 3D) ve 2D plan (DXF) ═══
 * 3D: Plan3D sahnesindeki ağlar dünya koordinatına çevrilip üçgenler olarak yazılır (three.js: metre, Y yukarı).
 * 2D: plan verisi (cm, y aşağı) doğrudan DXF çizgilerine, yaylara ve yazılara çevrilir (mm, y yukarı).
 */
import { V, wallLen, wallDir, wallNormal, polyCentroid, roomMetrics, planBounds } from './plan-geom.js';
import { fixtureOf } from './fixtures.js';
import { doorModel, winModel, winUse, sashes, leaves } from './openings.js';

/* ───────────── 3D: sahneden üçgen toplama ───────────── */
const safe = s => String(s || 'Nesne').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i').replace(/İ/g, 'I').replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'Nesne';
const hex = c => c ? '#' + c.getHexString() : '#cccccc';

/* gruplar: her biri { name, color, tris: Float32Array (x,y,z ×3 / üçgen, metre, Y yukarı) } */
export function collectMeshes(root) {
  root.updateMatrixWorld(true);
  const groups = new Map();
  root.traverse(o => {
    if (!o.isMesh || !o.visible || !o.geometry?.attributes?.position) return;
    let hidden = false; for (let p = o.parent; p; p = p.parent) if (p.visible === false) hidden = true;
    if (hidden) return;
    const m = Array.isArray(o.material) ? o.material[0] : o.material;
    if (m?.opacity === 0) return;
    const color = hex(m?.color);
    // nesne adı: en yakın adlandırılmış ata, yoksa malzeme rengi
    let nm = ''; for (let p = o; p && !nm; p = p.parent) nm = p.name || p.userData?.label || '';
    const key = safe(nm || 'Nesne') + '|' + color;
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry;
    const pos = g.attributes.position, e = o.matrixWorld.elements, arr = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      arr[i * 3] = e[0] * x + e[4] * y + e[8] * z + e[12];
      arr[i * 3 + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
      arr[i * 3 + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
    }
    // ayna dönüşümünde (negatif ölçek) üçgen yönünü düzelt
    if (o.matrixWorld.determinant() < 0) for (let i = 0; i < arr.length; i += 9) for (let k = 0; k < 3; k++) { const t = arr[i + 3 + k]; arr[i + 3 + k] = arr[i + 6 + k]; arr[i + 6 + k] = t; }
    if (!groups.has(key)) groups.set(key, { name: safe(nm || 'Nesne'), color, parts: [] });
    groups.get(key).parts.push(arr);
  });
  return [...groups.values()].map(g => {
    const n = g.parts.reduce((a, p) => a + p.length, 0), tris = new Float32Array(n); let o = 0;
    for (const p of g.parts) { tris.set(p, o); o += p.length; }
    return { name: g.name, color: g.color, tris };
  }).filter(g => g.tris.length);
}

/* STL (ikili) — birim mm, Z yukarı (3D yazıcı / CAD alışkanlığı) */
export function toSTL(groups) {
  const nt = groups.reduce((a, g) => a + g.tris.length / 9, 0);
  const buf = new ArrayBuffer(84 + nt * 50), dv = new DataView(buf);
  const head = 'TadilatBodrum Saha - STL (mm, Z yukari)';
  for (let i = 0; i < 80; i++) dv.setUint8(i, i < head.length ? head.charCodeAt(i) : 32);
  dv.setUint32(80, nt, true);
  let o = 84;
  const P = (t, i) => [t[i] * 1000, -t[i + 2] * 1000, t[i + 1] * 1000];   // (x, y, z)m → (x, -z, y)mm
  for (const g of groups) for (let i = 0; i < g.tris.length; i += 9) {
    const a = P(g.tris, i), b = P(g.tris, i + 3), c = P(g.tris, i + 6);
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const l = Math.hypot(...n) || 1; n = n.map(x => x / l);
    for (const val of [...n, ...a, ...b, ...c]) { dv.setFloat32(o, val, true); o += 4; }
    dv.setUint16(o, 0, true); o += 2;
  }
  return new Blob([buf], { type: 'model/stl' });
}

/* 3DS (Autodesk 3D Studio) — nesne başına en fazla 65 535 köşe; birim cm, Z yukarı, malzeme rengi */
export function to3DS(groups) {
  const chunks = [];
  const chunk = (id, ...parts) => {   // parts: Uint8Array'ler
    const len = 6 + parts.reduce((a, p) => a + p.byteLength, 0), h = new Uint8Array(6), dv = new DataView(h.buffer);
    dv.setUint16(0, id, true); dv.setUint32(2, len, true);
    const out = new Uint8Array(len); out.set(h, 0); let o = 6; for (const p of parts) { out.set(p, o); o += p.byteLength; } return out;
  };
  const str = s => { const b = new Uint8Array(s.length + 1); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 0x7f; return b; };
  const rgb = h => { const n = parseInt(h.slice(1), 16); return chunk(0x0011, new Uint8Array([n >> 16, (n >> 8) & 255, n & 255])); };
  const mats = new Map();
  for (const g of groups) if (!mats.has(g.color)) mats.set(g.color, 'M_' + g.color.slice(1).toUpperCase());
  const matChunks = [...mats].map(([c, n]) => chunk(0xAFFF, chunk(0xA000, str(n)), chunk(0xA010, rgb(c)), chunk(0xA020, rgb(c)), chunk(0xA030, rgb('#202020'))));
  const objs = []; let k = 0;
  for (const g of groups) {
    const MAXV = 65535 - 2;
    for (let s = 0; s < g.tris.length; s += MAXV * 3 - (MAXV * 3) % 9) {
      const t = g.tris.subarray(s, Math.min(g.tris.length, s + MAXV * 3 - (MAXV * 3) % 9)), nv = t.length / 3, nf = nv / 3;
      const vb = new Uint8Array(2 + nv * 12), vd = new DataView(vb.buffer); vd.setUint16(0, nv, true);
      for (let i = 0; i < nv; i++) { vd.setFloat32(2 + i * 12, t[i * 3] * 100, true); vd.setFloat32(6 + i * 12, -t[i * 3 + 2] * 100, true); vd.setFloat32(10 + i * 12, t[i * 3 + 1] * 100, true); }
      const fb = new Uint8Array(2 + nf * 8), fd = new DataView(fb.buffer); fd.setUint16(0, nf, true);
      for (let i = 0; i < nf; i++) { fd.setUint16(2 + i * 8, i * 3, true); fd.setUint16(4 + i * 8, i * 3 + 1, true); fd.setUint16(6 + i * 8, i * 3 + 2, true); fd.setUint16(8 + i * 8, 7, true); }
      const mf = new Uint8Array(2 + nf * 2), md = new DataView(mf.buffer); md.setUint16(0, nf, true); for (let i = 0; i < nf; i++) md.setUint16(2 + i * 2, i, true);
      const faces = chunk(0x4120, fb, chunk(0x4130, str(mats.get(g.color)), mf));
      const name = (g.name.slice(0, 7) + '_' + (k++)).slice(0, 10);
      objs.push(chunk(0x4000, str(name), chunk(0x4100, chunk(0x4110, vb), faces)));
    }
  }
  const ver = new Uint8Array(4); new DataView(ver.buffer).setUint32(0, 3, true);
  const scale = new Uint8Array(4); new DataView(scale.buffer).setFloat32(0, 1, true);
  const edit = chunk(0x3D3D, chunk(0x3D3E, ver), ...matChunks, chunk(0x0100, scale), ...objs);
  return new Blob([chunk(0x4D4D, chunk(0x0002, ver), edit)], { type: 'application/x-3ds' });
}

/* Collada (.dae) — SketchUp'ın doğrudan içe aktardığı format; birim metre, Z yukarı */
export function toDAE(groups, title = 'TadilatBodrum') {
  const x = s => String(s).replace(/[<&>"]/g, c => ({ '<': '&lt;', '&': '&amp;', '>': '&gt;', '"': '&quot;' }[c]));
  const mats = new Map(); groups.forEach(g => { if (!mats.has(g.color)) mats.set(g.color, 'm' + mats.size); });
  const col = h => { const n = parseInt(h.slice(1), 16); return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255].map(v => v.toFixed(4)).join(' ') + ' 1'; };
  const f = v => +v.toFixed(5);
  let geo = '', nodes = '';
  groups.forEach((g, gi) => {
    const t = g.tris, nv = t.length / 3, id = `g${gi}`, mid = mats.get(g.color);
    const pos = []; for (let i = 0; i < nv; i++) pos.push(f(t[i * 3]), f(-t[i * 3 + 2]), f(t[i * 3 + 1]));
    const p = []; for (let i = 0; i < nv; i++) p.push(i);
    geo += `<geometry id="${id}" name="${x(g.name)}"><mesh><source id="${id}-p"><float_array id="${id}-pa" count="${pos.length}">${pos.join(' ')}</float_array><technique_common><accessor source="#${id}-pa" count="${nv}" stride="3"><param name="X" type="float"/><param name="Y" type="float"/><param name="Z" type="float"/></accessor></technique_common></source><vertices id="${id}-v"><input semantic="POSITION" source="#${id}-p"/></vertices><triangles material="${mid}" count="${nv / 3}"><input semantic="VERTEX" source="#${id}-v" offset="0"/><p>${p.join(' ')}</p></triangles></mesh></geometry>`;
    nodes += `<node id="n${gi}" name="${x(g.name)}"><instance_geometry url="#${id}"><bind_material><technique_common><instance_material symbol="${mid}" target="#${mid}"/></technique_common></bind_material></instance_geometry></node>`;
  });
  const effects = [...mats].map(([c, id]) => `<effect id="${id}-fx"><profile_COMMON><technique sid="common"><lambert><diffuse><color>${col(c)}</color></diffuse></lambert></technique></profile_COMMON></effect>`).join('');
  const materials = [...mats].map(([c, id]) => `<material id="${id}" name="${id}_${c.slice(1)}"><instance_effect url="#${id}-fx"/></material>`).join('');
  const now = new Date().toISOString();
  return new Blob([`<?xml version="1.0" encoding="utf-8"?>
<COLLADA xmlns="http://www.collada.org/2005/11/COLLADASchema" version="1.4.1">
<asset><contributor><authoring_tool>TadilatBodrum Saha (SAGG+ App)</authoring_tool></contributor><created>${now}</created><modified>${now}</modified><unit name="meter" meter="1"/><up_axis>Z_UP</up_axis><title>${x(title)}</title></asset>
<library_effects>${effects}</library_effects><library_materials>${materials}</library_materials>
<library_geometries>${geo}</library_geometries>
<library_visual_scenes><visual_scene id="scene" name="${x(title)}">${nodes}</visual_scene></library_visual_scenes>
<scene><instance_visual_scene url="#scene"/></scene>
</COLLADA>`], { type: 'model/vnd.collada+xml' });
}

/* DXF 3D — her üçgen 3DFACE; katman = nesne; birim mm, Z yukarı */
export function toDXF3D(groups) {
  const out = dxfHead(groups.map(g => g.name));
  const n = v => (v * 1000).toFixed(1);
  for (const g of groups) for (let i = 0; i < g.tris.length; i += 9) {
    const t = g.tris, P = k => [n(t[i + k]), n(-t[i + k + 2]), n(t[i + k + 1])];
    const a = P(0), b = P(3), c = P(6);
    out.push('0', '3DFACE', '8', g.name, '10', a[0], '20', a[1], '30', a[2], '11', b[0], '21', b[1], '31', b[2], '12', c[0], '22', c[1], '32', c[2], '13', c[0], '23', c[1], '33', c[2]);
  }
  out.push('0', 'ENDSEC', '0', 'EOF');
  return new Blob([out.join('\r\n')], { type: 'application/dxf' });
}

/* ───────────── DXF ortak ───────────── */
const LAYER_COLORS = { DUVAR: 7, ODA: 8, KAPI: 3, PENCERE: 5, MOBILYA: 30, MUTFAK: 1, OLCU: 2, YAZI: 7, ALAN: 4, ACIKLIK: 6, ELEKTRIK: 30, TESISAT: 150 };
function dxfHead(layers) {
  const L = [...new Set(['0', ...layers])];
  return ['0', 'SECTION', '2', 'HEADER', '9', '$ACADVER', '1', 'AC1009', '9', '$INSUNITS', '70', '4', '0', 'ENDSEC',
    '0', 'SECTION', '2', 'TABLES', '0', 'TABLE', '2', 'LAYER', '70', String(L.length),
    ...L.flatMap(n => ['0', 'LAYER', '2', n, '70', '0', '62', String(LAYER_COLORS[n] || 7), '6', 'CONTINUOUS']),
    '0', 'ENDTAB', '0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES'];
}

/* ───────────── 2D plan → DXF (mm, y yukarı) ───────────── */
export function planToDXF(plan) {
  const P = plan, T = P.meta?.wallT || 15;
  const k = 10, X = v => (v * k).toFixed(1), Y = v => (-v * k).toFixed(1);
  const tr = s => String(s).replace(/ğ/g, 'g').replace(/Ğ/g, 'G').replace(/ş/g, 's').replace(/Ş/g, 'S').replace(/ı/g, 'i').replace(/İ/g, 'I').replace(/ç/g, 'c').replace(/Ç/g, 'C').replace(/ö/g, 'o').replace(/Ö/g, 'O').replace(/ü/g, 'u').replace(/Ü/g, 'U');
  const out = dxfHead(['DUVAR', 'ODA', 'KAPI', 'PENCERE', 'MOBILYA', 'MUTFAK', 'ELEKTRIK', 'TESISAT', 'OLCU', 'YAZI', 'ALAN']);
  const line = (L, a, b) => out.push('0', 'LINE', '8', L, '10', X(a.x), '20', Y(a.y), '30', '0', '11', X(b.x), '21', Y(b.y), '31', '0');
  const poly = (L, pts, closed = true) => { out.push('0', 'POLYLINE', '8', L, '66', '1', '70', closed ? '1' : '0', '10', '0', '20', '0', '30', '0'); for (const p of pts) out.push('0', 'VERTEX', '8', L, '10', X(p.x), '20', Y(p.y), '30', '0'); out.push('0', 'SEQEND', '8', L); };
  const text = (L, p, s, h = 15, ang = 0) => out.push('0', 'TEXT', '8', L, '10', X(p.x), '20', Y(p.y), '30', '0', '40', (h * k).toFixed(1), '1', tr(s), '50', String(ang), '72', '1', '73', '2', '11', X(p.x), '21', Y(p.y), '31', '0');
  const arc = (L, c, r, a0, a1) => out.push('0', 'ARC', '8', L, '10', X(c.x), '20', Y(c.y), '30', '0', '40', (r * k).toFixed(1), '50', a0.toFixed(2), '51', a1.toFixed(2));

  // odalar: iç sınır + ad + alan
  for (const r of P.rooms) {
    poly('ODA', r.pts);
    const c = polyCentroid(r.pts), m = roomMetrics(P, r);
    text('YAZI', { x: c.x, y: c.y - 8 }, r.name || 'Oda', 14);
    text('ALAN', { x: c.x, y: c.y + 12 }, `${m.area.toFixed(2).replace('.', ',')} m2`, 10);
  }
  // duvarlar: açıklıklarla bölünmüş dış hatlar
  for (const w of P.walls) {
    const L = wallLen(w); if (L < 0.5) continue;
    const u = wallDir(w), n = wallNormal(w), t = (w.t || T) / 2;
    const ops = P.openings.filter(o => o.wallId === w.id).map(o => [Math.max(0, o.pos - o.w / 2), Math.min(L, o.pos + o.w / 2)]).sort((a, b) => a[0] - b[0]);
    const at = (s, side) => V.add(V.add(w.a, V.mul(u, s)), V.mul(n, side * t));
    let s0 = 0;
    const seg = (a, b) => { if (b - a < 0.1) return; line('DUVAR', at(a, 1), at(b, 1)); line('DUVAR', at(a, -1), at(b, -1)); };
    for (const [a, b] of ops) { seg(s0, a); line('DUVAR', at(a, 1), at(a, -1)); line('DUVAR', at(b, 1), at(b, -1)); s0 = b; }
    seg(s0, L);
    if (!ops.length || ops[0][0] > 0.1) line('DUVAR', at(0, 1), at(0, -1));
    if (!ops.length || ops.at(-1)[1] < L - 0.1) line('DUVAR', at(L, 1), at(L, -1));
  }
  // kapı ve pencereler
  for (const op of P.openings) {
    const w = P.walls.find(x => x.id === op.wallId); if (!w) continue;
    const t = (w.t || T), u = wallDir(w), n = wallNormal(w), c = V.add(w.a, V.mul(u, op.pos));
    const A = V.sub(c, V.mul(u, op.w / 2)), B = V.add(c, V.mul(u, op.w / 2));
    const sd = op.side || 1, PT = (f, kk) => V.add(V.lerp(A, B, f), V.mul(n, kk));
    if (op.type === 'window') {
      const wm = winModel(op), L = 'PENCERE';
      for (const f of [-t / 2, t / 2]) line(L, PT(0, f), PT(1, f));
      line(L, PT(0, -t / 2), PT(0, t / 2)); line(L, PT(1, -t / 2), PT(1, t / 2));
      if (wm === 'sabit') line(L, PT(0, 0), PT(1, 0));
      else if (wm === 'surme') { line(L, PT(0, t / 6), PT(0.54, t / 6)); line(L, PT(0.46, -t / 6), PT(1, -t / 6)); }
      else { line(L, PT(0, t / 6), PT(1, t / 6)); line(L, PT(0, -t / 6), PT(1, -t / 6)); sashes(op).forEach(([x0]) => { if (x0 > 0) line(L, PT(x0, t / 2), PT(x0, -t / 2)); }); }
      if (winUse(op).rail) line(L, PT(0, -sd * (t / 2 + 5)), PT(1, -sd * (t / 2 + 5)));
    } else if (op.type === 'door') {
      const dm = doorModel(op), L = 'KAPI';
      const ang = (H, p) => Math.atan2(-(p.y - H.y), p.x - H.x) * 180 / Math.PI;
      const swing = (H, O, lw) => {
        const Lf = V.add(H, V.mul(n, sd * lw)); line(L, H, Lf);
        let a0 = ang(H, O), a1 = ang(H, Lf); if (((a1 - a0) % 360 + 360) % 360 > 180) [a0, a1] = [a1, a0];
        arc(L, H, lw, (a0 + 360) % 360, (a1 + 360) % 360);   // DXF: y yukarı, saat yönü tersine
      };
      const rect = (f0, f1, k0, k1) => poly(L, [PT(f0, k0), PT(f1, k0), PT(f1, k1), PT(f0, k1)]);
      if (dm === 'surgu') { rect(-0.03, 1.03, sd * (t / 2 + 1), sd * (t / 2 + 5)); const dir = op.flip ? -1 : 1; line(L, PT(dir > 0 ? 1.03 : -0.03, sd * (t / 2 + 7)), PT(dir > 0 ? 2.03 : -1.03, sd * (t / 2 + 7))); }
      else if (dm === 'gomme') { rect(0, 1, -2, 2); const f0 = op.flip ? -1 : 1, f1 = op.flip ? 0 : 2; rect(Math.min(f0, f1), Math.max(f0, f1), -t / 4, t / 4); }
      else if (dm === 'katlanir') {
        const h0 = op.flip ? 1 : 0, dir = op.flip ? -1 : 1, pts = [PT(h0, sd * t / 2)];
        for (let i = 1; i <= 4; i++) pts.push(PT(h0 + dir * i * 0.125, sd * (t / 2 + (i % 2 ? op.w * 0.215 : 0))));
        poly(L, pts, false);
      } else for (const [s0, s1, hk] of leaves(op)) swing(PT(hk === 'a' ? s0 : s1, sd * t / 2), PT(hk === 'a' ? s1 : s0, sd * t / 2), (s1 - s0) * op.w);
      line(L, PT(0, -t / 2), PT(0, t / 2)); line(L, PT(1, -t / 2), PT(1, t / 2));
    }
  }
  // mobilya / mutfak: dış hat + etiket
  const used = new Map();
  for (const it of P.items) {
    const a = it.rot * Math.PI / 180, cs = Math.cos(a), sn = Math.sin(a);
    const pt = (lx, ly) => ({ x: it.x + lx * cs - ly * sn, y: it.y + lx * sn + ly * cs });
    const fx = fixtureOf(it.type), r0 = ((it.rot % 360) + 360) % 360, upright = r0 > 90 && r0 <= 270 ? 180 - r0 : -r0;
    if (fx) {   // elektrik / tesisat: sembol kutusu + kısa kod (tam liste lejantta)
      const L = fx.g === 'elektrik' ? 'ELEKTRIK' : 'TESISAT';
      poly(L, [pt(-it.w / 2, -it.d / 2), pt(it.w / 2, -it.d / 2), pt(it.w / 2, it.d / 2), pt(-it.w / 2, it.d / 2)]);
      text(L, pt(0, 0), fx.ab, Math.min(it.w, it.d) * 0.45, upright);
      used.set(fx.ab, fx.t);
      continue;
    }
    const L = it.type === 'cabinet' ? 'MUTFAK' : 'MOBILYA';
    poly(L, [pt(-it.w / 2, -it.d / 2), pt(it.w / 2, -it.d / 2), pt(it.w / 2, it.d / 2), pt(-it.w / 2, it.d / 2)]);
    if (it.type === 'cabinet' && it.cab) {   // modül bölmeleri
      let x = -it.w / 2;
      for (const m of (it.cab.kind === 'wardrobe' ? it.cab.ward : it.cab.base) || []) { x += m.w; if (x < it.w / 2 - 0.5) line(L, pt(x, -it.d / 2), pt(x, it.d / 2)); }
    }
    text('YAZI', pt(0, 0), it.label || it.type, Math.min(10, it.w / 6), upright);   // yazı ters okunmasın
  }
  // ölçü çizgileri
  for (const d of P.dims) {
    const u = V.norm(V.sub(d.b, d.a)), n = { x: -u.y, y: u.x }, off = V.mul(n, d.off || 0);
    const a = V.add(d.a, off), b = V.add(d.b, off);
    line('OLCU', d.a, a); line('OLCU', d.b, b); line('OLCU', a, b);
    const m = V.lerp(a, b, 0.5); let ang = -Math.atan2(u.y, u.x) * 180 / Math.PI; if (ang > 90 || ang < -90) ang += 180;
    text('OLCU', V.add(m, V.mul(n, 8)), V.dist(d.a, d.b).toFixed(1).replace('.', ','), 9, ang);
  }
  for (const l of P.labels) text('YAZI', l, l.text, (l.size || 25) * 0.6);
  // donatı lejantı: çizimin altına
  if (used.size) {
    const b = planBounds(P) || { x0: 0, y1: 0 };
    let y = b.y1 + 60; text('YAZI', { x: b.x0 + 60, y }, 'ELEKTRIK / TESISAT LEJANTI', 12);
    for (const [ab, t] of used) { y += 22; text('YAZI', { x: b.x0 + 30, y }, ab, 10); text('YAZI', { x: b.x0 + 140, y }, t, 10); }
  }
  out.push('0', 'ENDSEC', '0', 'EOF');
  return new Blob([out.join('\r\n')], { type: 'application/dxf' });
}
