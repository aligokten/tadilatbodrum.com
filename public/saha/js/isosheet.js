/* ═══ Mahal izometrik açıklama paftaları ═══
 * Her oda için yatay A4 pafta: odanın kesitli izometrik görünüşü (arka duvarlar tam boy, ön duvarlar
 * kesik), kapı / pencere / mobilya, yapılacak işlerin numaralı açıklamaları ve çizim üzerinde işin
 * yapılacağı yeri gösteren işaretler; iş türüne göre renkli yüzeyler + lejant; antet (pafta bilgileri).
 * İşler talepler ve tespitlerden (mahal adına göre) önerilir; pafta penceresinde düzenlenir, iş kaydında saklanır.
 */
import { V, planLevels, wallPolys, pointInPoly, polyArea, roomMetrics, wallDir } from './plan-geom.js';
import { CATEGORIES, catOf } from './catalog.js';
import { icon, esc, $, $$, modal, fmtNum, fmtDate } from './ui.js';
import { uid } from './store.js';

/* iş türü → çizimdeki yeri */
const TARGETS = {
  floor: { t: 'Zemin işleri', c: '#F4C99B', s: '#C9874A' },
  wall: { t: 'Duvar işleri', c: '#A9DCDC', s: '#2E9A9B' },
  ceil: { t: 'Tavan işleri', c: 'rgba(142,107,191,.10)', s: '#8E6BBF' },
  open: { t: 'Kapı / pencere', c: '#BFD9F2', s: '#1F6FB5' },
  item: { t: 'Mobilya / donatı', c: '#B9DDB3', s: '#4E9A47' },
};
export function targetOf(w) {
  const t = (w.text || '').toLocaleLowerCase('tr');
  if (w.target && TARGETS[w.target]) return w.target;
  switch (w.cat) {
    case 'zemin': case 'temizlik': case 'peyzaj': return 'floor';
    case 'seramik': return /duvar|fayans|tezgah arası|ıslak hacim duvar/.test(t) ? 'wall' : 'floor';
    case 'alcipan': return /tavan|asma|kartonpiyer|stropiyer|gizli ışık/.test(t) ? 'ceil' : 'wall';
    case 'aydinlatma': return 'ceil';
    case 'kapi': case 'perde': return 'open';
    case 'mutfak': case 'vitrifiye': case 'sabitmob': case 'mobilya': case 'beyazesya': return 'item';
    case 'diger': return /zemin|parke|döşeme/.test(t) ? 'floor' : /tavan/.test(t) ? 'ceil' : /kapı|pencere/.test(t) ? 'open' : 'wall';
    default: return 'wall';   // boya, elektrik, tesisat, iklim, yalıtım, yıkım, inşaat, banyo, dış cephe
  }
}

const norm = s => (s || '').toLocaleLowerCase('tr').replace(/\s+/g, ' ').trim();
const sameRoom = (a, b) => { a = norm(a); b = norm(b); return !!a && !!b && (a === b || (a.length >= 3 && b.includes(a)) || (b.length >= 3 && a.includes(b))); };
/* talep ve tespitlerden oda için iş önerileri */
export function autoWorks(job, roomName, lvName) {
  const out = [], names = [roomName, lvName ? `${lvName} · ${roomName}` : ''].filter(Boolean);
  const hit = r => names.some(n => sameRoom(r, n));
  for (const r of job.requests || []) if (r.status !== 'kapsamdisi' && hit(r.room)) out.push({ id: uid('w'), cat: r.category || 'diger', text: r.text, src: 'talep:' + r.id });
  for (const f of job.findings || []) if (hit(f.room)) out.push({ id: uid('w'), cat: f.category || 'diger', text: f.action ? `${f.title} — ${f.action}` : f.title, src: 'tespit:' + f.id });
  return out;
}

/* ── izometrik sahne ── */
const C30 = Math.cos(Math.PI / 6);
const proj = p => ({ X: (p.x - p.y) * C30, Y: (p.x + p.y) * 0.5 - p.z });
const centroid = pts => ({ x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length });
function clipHalf(poly, f) {   // f(p) >= 0 tarafı
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], fa = f(a), fb = f(b);
    if (fa >= 0) out.push(a);
    if ((fa >= 0) !== (fb >= 0)) { const t = fa / (fa - fb); out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }); }
  }
  return out;
}
const clipBox = (poly, x0, y0, x1, y1) => [p => p.x - x0, p => x1 - p.x, p => p.y - y0, p => y1 - p.y].reduce((P, f) => P.length ? clipHalf(P, f) : P, poly);
const shade = (hex, k) => { if (!hex.startsWith('#')) return hex; const n = parseInt(hex.slice(1), 16), f = c => Math.max(0, Math.min(255, Math.round(c * k))); return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`; };

/* oda sahnesi: view 0..3 (90° adımlarla döndürme) */
function scene(L, room, view, opt) {
  const P = L.plan, meta = { wallH: 280, wallT: 15, ...(P.meta || {}) };
  const H = room.h || meta.wallH, fz = +room.fz || 0, CUT = 24;
  const c0 = centroid(room.pts), th = view * Math.PI / 2, cs = Math.round(Math.cos(th)), sn = Math.round(Math.sin(th));
  const R = p => ({ x: c0.x + (p.x - c0.x) * cs - (p.y - c0.y) * sn, y: c0.y + (p.x - c0.x) * sn + (p.y - c0.y) * cs });
  const rpts = room.pts.map(R), rc = centroid(rpts), depth = p => p.x + p.y;
  const xs = room.pts.map(p => p.x), ys = room.pts.map(p => p.y), Tm = Math.max(meta.wallT, ...(P.walls || []).map(w => w.t || 0)) + 3;
  const box = [Math.min(...xs) - Tm, Math.min(...ys) - Tm, Math.max(...xs) + Tm, Math.max(...ys) + Tm];
  const distRoom = p => Math.min(...room.pts.map((a, i) => { const b = room.pts[(i + 1) % room.pts.length], ab = V.sub(b, a), t = Math.max(0, Math.min(1, V.dot(V.sub(p, a), ab) / (V.dot(ab, ab) || 1))); return V.dist(p, V.add(a, V.mul(ab, t))); }));
  // odanın duvarları: köşe birleşimli duvar çokgenleri, oda kutusuna kırpılmış
  const walls = [];
  for (const { w, pts } of wallPolys(P)) {
    const cp = clipBox(pts, ...box);
    if (cp.length < 3 || Math.abs(polyArea(cp)) < 30) continue;
    const t = w.t || meta.wallT;
    if (distRoom(centroid(cp)) > t + 4 && !pointInPoly(centroid(cp), room.pts)) continue;
    const rp = cp.map(R), cc = centroid(rp), back = depth(cc) <= depth(rc) + 1;
    const h = back ? (w.h || H) : Math.min(CUT, w.h || H);
    walls.push({ w, pts: rp, back, h, A: R(w.a), u: (() => { const d = wallDir(w); return { x: d.x * cs - d.y * sn, y: d.x * sn + d.y * cs }; })() });
  }
  const wIds = new Set(walls.map(x => x.w.id));
  const opens = (P.openings || []).filter(o => wIds.has(o.wallId) && o.type !== undefined).map(o => {
    const W = walls.find(x => x.w.id === o.wallId), cpt = V.add(W.w.a, V.mul(wallDir(W.w), o.pos));
    return { o, W, inBox: cpt.x >= box[0] && cpt.x <= box[2] && cpt.y >= box[1] && cpt.y <= box[3] };
  }).filter(x => x.inBox);
  const items = opt.items === false ? [] : (P.items || []).filter(it => pointInPoly(it, room.pts)).map(it => {
    const a = (it.rot || 0) * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    const pts = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => { const lx = sx * it.w / 2, ly = sy * it.d / 2; return R({ x: it.x + lx * c - ly * s, y: it.y + lx * s + ly * c }); });
    const z0 = fz + (+it.z || 0);
    return { it, pts, z0, z1: z0 + (+it.h || 80) };
  });
  return { H, fz, rpts, walls, opens, items, depth };
}

/* görünüş: kapı / pencereler en çok arka duvarlarda kalan yön */
export function bestView(L, room) {
  let best = 0, bs = -1;
  for (let v = 0; v < 4; v++) {
    const S = scene(L, room, v, { items: false });
    const sc = S.opens.filter(x => x.W.back).length * 3 + S.walls.filter(w => w.back).length;
    if (sc > bs) { bs = sc; best = v; }
  }
  return best;
}

/* izometrik SVG; works: [{n, cat, text}] → işaretler + çağrı çizgileri */
export function isoSvg(L, room, works, { view = 0, items = true, W = 700, H = 560, labels = true } = {}) {
  const S = scene(L, room, view, { items });
  const used = new Set(works.map(w => targetOf(w)));
  const faces = [];   // { p3: [], fill, stroke, sw, key, dash }
  const outward = (pts, i) => {
    const a = pts[i], b = pts[(i + 1) % pts.length], n = V.norm({ x: b.y - a.y, y: -(b.x - a.x) }), m = V.lerp(a, b, 0.5), c = centroid(pts);
    return V.dot(n, V.sub(m, c)) < 0 ? V.mul(n, -1) : n;
  };
  // zemin
  faces.push({ p3: S.rpts.map(p => ({ ...p, z: S.fz })), fill: used.has('floor') ? TARGETS.floor.c : '#F7F4EF', stroke: used.has('floor') ? TARGETS.floor.s : '#9CA3AF', sw: 1.2, key: -1e9 });
  if (used.has('floor')) {   // zemin deseni (derz çizgileri)
    const xs = S.rpts.map(p => p.x), ys = S.rpts.map(p => p.y), st = 60;
    for (let x = Math.ceil(Math.min(...xs) / st) * st; x < Math.max(...xs); x += st) {
      const seg = clipLine(S.rpts, { x, y: Math.min(...ys) - 1 }, { x, y: Math.max(...ys) + 1 });
      if (seg) faces.push({ line: true, p3: seg.map(p => ({ ...p, z: S.fz })), stroke: 'rgba(201,135,74,.35)', sw: 0.7, key: -1e9 + 1 });
    }
  }
  // prizmalar (duvar, mobilya): uzaktan yakına
  const prisms = [];
  for (const w of S.walls) prisms.push({ kind: 'wall', w, pts: w.pts, z0: 0, z1: w.h, key: S.depth(centroid(w.pts)) });
  for (const it of S.items) prisms.push({ kind: 'item', it, pts: it.pts, z0: it.z0, z1: it.z1, key: S.depth(centroid(it.pts)) + 0.5 });
  prisms.sort((a, b) => a.key - b.key);
  for (const pr of prisms) {
    const pts = pr.pts, isW = pr.kind === 'wall', tintW = isW && pr.w.back && used.has('wall'), tintI = !isW && used.has('item');
    for (let i = 0; i < pts.length; i++) {
      const n = outward(pts, i); if (n.x + n.y <= 0.01) continue;
      const a = pts[i], b = pts[(i + 1) % pts.length], k = n.x > n.y ? 0.92 : 1;
      const long = isW && Math.abs(V.cross(V.norm(V.sub(b, a)), pr.w.u)) < 0.2 && V.dist(a, b) > 12;
      let fill = isW ? (tintW && long ? TARGETS.wall.c : '#EEEDEA') : (tintI ? TARGETS.item.c : '#E6E1D8');
      faces.push({ p3: [{ ...a, z: pr.z0 }, { ...b, z: pr.z0 }, { ...b, z: pr.z1 }, { ...a, z: pr.z1 }], fill: shade(fill, k), stroke: isW ? '#4B5563' : (tintI ? TARGETS.item.s : '#8B8478'), sw: isW ? 0.9 : 0.8 });
      // açıklıklar: bu yüzün üzerinde
      if (long) for (const op of S.opens.filter(x => x.W === pr.w)) {
        const o = op.o, sa = V.dot(V.sub(a, pr.w.A), pr.w.u), sb = V.dot(V.sub(b, pr.w.A), pr.w.u);
        const lo = Math.max(Math.min(sa, sb), o.pos - o.w / 2), hi = Math.min(Math.max(sa, sb), o.pos + o.w / 2);
        if (hi - lo < 4) continue;
        const at = s => V.add(a, V.mul(V.sub(b, a), (s - sa) / (sb - sa || 1)));
        const zb = o.type === 'window' ? +o.sill || 0 : 0, zt = Math.min(pr.z1, zb + (+o.h || 210));
        if (zt - zb < 3) continue;
        const p0 = at(lo), p1 = at(hi), hiOpen = used.has('open');
        const fillO = o.type === 'window' ? (hiOpen ? '#9CC7EE' : '#DCEBF7') : o.type === 'gap' ? '#F7F4EF' : (hiOpen ? TARGETS.open.c : '#FFFFFF');
        faces.push({ p3: [{ ...p0, z: zb }, { ...p1, z: zb }, { ...p1, z: zt }, { ...p0, z: zt }], fill: fillO, stroke: hiOpen ? TARGETS.open.s : '#6B7280', sw: hiOpen ? 1.6 : 1 });
        if (o.type === 'window' && zt - zb > 20) {   // kayıt (orta dikme)
          const m = V.lerp(p0, p1, 0.5);
          faces.push({ line: true, p3: [{ ...m, z: zb }, { ...m, z: zt }], stroke: hiOpen ? TARGETS.open.s : '#6B7280', sw: 0.8 });
        }
      }
    }
    // üst yüz: duvarlarda kesit (koyu), mobilyada açık
    faces.push({ p3: pts.map(p => ({ ...p, z: pr.z1 })), fill: isW ? '#262A31' : (tintI ? shade(TARGETS.item.c, 1.06) : '#F1ECE3'), stroke: isW ? '#111' : (tintI ? TARGETS.item.s : '#8B8478'), sw: isW ? 0.8 : 0.8 });
  }
  if (used.has('ceil')) faces.push({ p3: S.rpts.map(p => ({ ...p, z: S.fz + S.H })), fill: TARGETS.ceil.c, stroke: TARGETS.ceil.s, sw: 1.3, dash: '6 4' });

  // işaret noktaları
  const backW = S.walls.filter(w => w.back && w.h > 100).map(w => {
    let best = null;
    for (let i = 0; i < w.pts.length; i++) {
      const a = w.pts[i], b = w.pts[(i + 1) % w.pts.length], n = outward(w.pts, i);
      if (n.x + n.y <= 0.01 || Math.abs(V.cross(V.norm(V.sub(b, a)), w.u)) > 0.2) continue;
      if (!best || V.dist(a, b) > V.dist(best.a, best.b)) best = { a, b };
    }
    return best && { ...best, h: w.h, w };
  }).filter(Boolean).sort((x, y) => V.dist(y.a, y.b) - V.dist(x.a, x.b));
  const rc = centroid(S.rpts), cnt = {};
  const anchor = w => {
    const t = targetOf(w), k = cnt[t] = (cnt[t] || 0) + 1, j = k - 1;
    const jitter = () => { const ang = j * 2.4, r = j ? 35 + 12 * j : 0; const p = { x: rc.x + Math.cos(ang) * r, y: rc.y + Math.sin(ang) * r }; return pointInPoly(p, S.rpts) ? p : rc; };
    if (t === 'floor') return { ...jitter(), z: S.fz };
    if (t === 'ceil') return { ...jitter(), z: S.fz + S.H };
    if (t === 'item' && S.items.length) { const it = S.items[j % S.items.length]; return { ...centroid(it.pts), z: it.z1 }; }
    if (t === 'open' && S.opens.length) {
      const list = [...S.opens.filter(x => x.W.back), ...S.opens.filter(x => !x.W.back)], op = list[j % list.length], o = op.o;
      const p = V.add(op.W.A, V.mul(op.W.u, o.pos)), zb = o.type === 'window' ? +o.sill || 0 : 0;
      return { ...p, z: Math.min(op.W.h, zb + (+o.h || 200) / 2) };
    }
    if (backW.length) { const bw = backW[j % backW.length], f = 0.3 + 0.4 * ((Math.floor(j / backW.length) * 0.37) % 1); return { ...V.lerp(bw.a, bw.b, f), z: bw.h * (0.62 - 0.12 * (Math.floor(j / backW.length) % 3)) }; }
    return { ...rc, z: S.fz };
  };
  const anchors = works.map((w, i) => ({ n: w.n ?? i + 1, w, p3: anchor(w) }));

  // ölçek: çizim alanına sığdır (sağda etiket sütunu)
  const all = faces.flatMap(f => f.p3).concat(anchors.map(a => a.p3)).map(proj);
  const labW = labels && anchors.length ? 190 : 0, pad = 14;
  const X0 = Math.min(...all.map(p => p.X)), X1 = Math.max(...all.map(p => p.X)), Y0 = Math.min(...all.map(p => p.Y)), Y1 = Math.max(...all.map(p => p.Y));
  const s = Math.min((W - labW - 2 * pad) / (X1 - X0 || 1), (H - 2 * pad) / (Y1 - Y0 || 1));
  const ox = pad + ((W - labW - 2 * pad) - (X1 - X0) * s) / 2 - X0 * s, oy = pad + ((H - 2 * pad) - (Y1 - Y0) * s) / 2 - Y0 * s;
  const sp = p => { const q = proj(p); return [+(ox + q.X * s).toFixed(1), +(oy + q.Y * s).toFixed(1)]; };
  const pts2 = f => f.p3.map(sp).map(q => q.join(',')).join(' ');
  let g = faces.map(f => f.line
    ? `<polyline points="${pts2(f)}" fill="none" stroke="${f.stroke}" stroke-width="${f.sw}"/>`
    : `<polygon points="${pts2(f)}" fill="${f.fill}" stroke="${f.stroke}" stroke-width="${f.sw}" stroke-linejoin="round"${f.dash ? ` stroke-dasharray="${f.dash}"` : ''}/>`).join('');
  // çağrılar
  if (labels && anchors.length) {
    const lx = W - labW + 14, gap = Math.min(30, (H - 2 * pad) / anchors.length);
    const L2 = anchors.map(a => ({ ...a, s: sp(a.p3) })).sort((a, b) => a.s[1] - b.s[1]);
    let y = pad + 10; L2.forEach(a => { a.ly = Math.max(y, Math.min(H - pad - 10, a.s[1])); y = a.ly + gap; });
    for (let i = L2.length - 1, lim = H - pad - 10; i >= 0; i--) { L2[i].ly = Math.min(L2[i].ly, lim); lim = L2[i].ly - gap; }
    g += L2.map(a => {
      const col = TARGETS[targetOf(a.w)].s, [x, yy] = a.s, kx = lx - 26;
      return `<polyline points="${x},${yy} ${kx},${a.ly} ${lx - 11},${a.ly}" fill="none" stroke="${col}" stroke-width="1"/>
        <circle cx="${x}" cy="${yy}" r="3.4" fill="${col}" stroke="#fff" stroke-width="1"/>
        <circle cx="${lx}" cy="${a.ly}" r="10" fill="${col}"/><text x="${lx}" y="${a.ly + 3.8}" text-anchor="middle" font-size="10.5" font-weight="800" fill="#fff">${a.n}</text>
        <text x="${lx + 15}" y="${a.ly + 4}" font-size="10.5" font-weight="700" fill="#1F2937">${esc(trim(catOf(a.w.cat).t, 24))}</text>`;
    }).join('');
  }
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="Inter, Arial, sans-serif">${g}</svg>`, used };
}
/* numara dairesi (SVG: PDF çiziminde metin kaymaz) */
const numSvg = (n, c, d = 20) => `<svg class="iso-ns" width="${d}" height="${d}" viewBox="0 0 20 20"><circle cx="10" cy="10" r="10" fill="${c}"/><text x="10" y="14" text-anchor="middle" font-size="11" font-weight="800" fill="#fff" font-family="Inter, Arial, sans-serif">${n}</text></svg>`;
const trim = (s, n) => s.length > n ? s.slice(0, n - 1) + '…' : s;
/* doğru parçasını çokgenin içinde kalan parçaya kırp (dışbükey olmayanlarda ilk-son kesişim) */
function clipLine(poly, a, b) {
  const ts = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length], r = V.sub(b, a), s = V.sub(q, p), d = V.cross(r, s);
    if (Math.abs(d) < 1e-9) continue;
    const t = V.cross(V.sub(p, a), s) / d, u = V.cross(V.sub(p, a), r) / d;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) ts.push(t);
  }
  if (ts.length < 2) return null;
  ts.sort((x, y) => x - y);
  return [V.lerp(a, b, ts[0]), V.lerp(a, b, ts[ts.length - 1])];
}

/* ── pafta ── */
function sheetHtml({ job, settings, L, room, cfg, works, idx, total, multi }) {
  const P = L.plan, m = roomMetrics({ ...P, meta: { wallH: 280, wallT: 15, ...(P.meta || {}) } }, room);
  const W = works.filter(w => (w.text || '').trim()).map((w, i) => ({ ...w, n: i + 1 }));
  const view = cfg.view === 'auto' || cfg.view == null ? bestView(L, room) : +cfg.view;
  const { svg, used } = isoSvg(L, room, W, { view, items: cfg.items !== false, W: 700, H: 560 });
  const name = multi ? `${L.name} · ${room.name}` : room.name;
  const c = job.customer || {}, no = `İZ-${String(idx + 1).padStart(2, '0')}`;
  return `<section class="iso-sheet p-break">
    <div class="iso-main">
      <div class="iso-text${W.length > 12 ? ' dense' : ''}">
        <h2>Mahal açıklaması</h2>
        <div class="iso-room">${esc(name)}</div>
        <div class="iso-met"><span>Alan <b>${fmtNum(m.area)} m²</b></span><span>Çevre <b>${fmtNum(m.perim)} m</b></span><span>Yükseklik <b>${fmtNum(m.h)} m</b></span>${+room.fz ? `<span>Döşeme kotu <b>${+room.fz > 0 ? '+' : ''}${fmtNum(room.fz / 100)}</b></span>` : ''}</div>
        <h4>Yapılacak işler</h4>
        ${W.length ? `<ol class="iso-works">${W.map(w => { const t = TARGETS[targetOf(w)]; return `<li>${numSvg(w.n, t.s, W.length > 12 ? 17 : 20)}<div><b>${esc(catOf(w.cat).t)}</b><p>${esc(w.text)}</p></div></li>`; }).join('')}</ol>` : '<p class="muted">Bu mahal için iş tanımlanmadı.</p>'}
        ${cfg.note ? `<p class="iso-note">${esc(cfg.note)}</p>` : ''}
      </div>
      <div class="iso-draw">
        ${svg}
        ${used.size ? `<div class="iso-leg"><b>LEJANT</b>${[...used].map(k => `<span><i style="background:${TARGETS[k].c};border-color:${TARGETS[k].s}${k === 'ceil' ? ';border-style:dashed' : ''}"></i>${TARGETS[k].t}</span>`).join('')}<span><i style="background:#262A31;border-color:#111"></i>Kesilen duvar</span></div>` : ''}
      </div>
    </div>
    <div class="iso-tb">
      <div class="iso-tb-logo"><img src="assets/logo.png" alt=""></div>
      <div><small>Proje</small><b>${esc(c.name || '—')}</b><span>${esc(job.code)}</span></div>
      <div><small>Adres</small><span>${esc([c.district, c.address].filter(Boolean).join(' · ') || '—')}</span></div>
      <div><small>Konu</small><span>Mahal izometrik açıklama — ${esc(name)}</span></div>
      <div><small>Ölçek</small><span>Ölçeksiz (izometrik)</span></div>
      <div><small>Sorumlu</small><span>${esc(job.assigned || settings.company?.name || '—')}</span></div>
      <div><small>Tarih</small><span>${fmtDate(Date.now())}</span></div>
      <div class="iso-tb-no"><small>Pafta</small><b>${no}</b><span>${idx + 1} / ${total}</span></div>
    </div>
  </section>`;
}

/* odalar (tüm katlar) */
function roomsOf(plan) {
  const Ls = planLevels(plan).filter(l => l.kind !== 'roof' && (l.plan.rooms || []).length), multi = Ls.length > 1;
  return Ls.flatMap(L => L.plan.rooms.filter(r => (r.pts || []).length >= 3).map(r => ({ key: `${L.idx}:${r.id}`, L, room: r, name: multi ? `${L.name} · ${r.name}` : r.name, multi })));
}

/* pafta penceresi: odalar, işler (düzenlenebilir), görünüş; PDF */
export async function isoSheetsDialog(job, dw, settings, save, printDoc) {
  const rooms = roomsOf(dw.plan);
  if (!rooms.length) return;
  const st = ((job.isoSheets ||= {})[dw.id] ||= { items: true, rooms: {} });
  const cfgOf = R => { const c = st.rooms[R.key] ||= { on: true }; if (!c.works) c.works = autoWorks(job, R.room.name, R.multi ? R.L.name : ''); if (c.view == null) c.view = 'auto'; return c; };
  rooms.forEach(cfgOf);
  let cur = rooms[0].key;
  const R0 = () => rooms.find(r => r.key === cur);
  const catOpts = k => CATEGORIES.map(c => `<option value="${c.k}" ${c.k === k ? 'selected' : ''}>${esc(c.t)}</option>`).join('');
  const list = () => rooms.map(R => { const c = cfgOf(R), n = c.works.filter(w => (w.text || '').trim()).length; return `<label class="iso-ri${R.key === cur ? ' on' : ''}" data-rk="${R.key}"><input type="checkbox" data-ron ${c.on ? 'checked' : ''}><span>${esc(R.name)}</span><small>${n} iş</small></label>`; }).join('');
  const preview = () => { const R = R0(), c = cfgOf(R); const W = c.works.filter(w => (w.text || '').trim()).map((w, i) => ({ ...w, n: i + 1 })); return isoSvg(R.L, R.room, W, { view: c.view === 'auto' ? bestView(R.L, R.room) : +c.view, items: st.items !== false, W: 520, H: 360 }).svg; };
  const editor = () => {
    const R = R0(), c = cfgOf(R);
    return `<div class="iso-ed-h"><b>${esc(R.name)}</b>
        <label class="iso-view">Görünüş<select class="inp sm" data-view>${[['auto', 'Otomatik'], ['0', 'Yön 1'], ['1', 'Yön 2'], ['2', 'Yön 3'], ['3', 'Yön 4']].map(([v, t]) => `<option value="${v}" ${String(c.view) === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label></div>
      <div class="iso-prev">${preview()}</div>
      <div class="iso-wl">${c.works.map((w, i) => `<div class="iso-w" data-w="${w.id}"><span class="iso-n" style="background:${TARGETS[targetOf(w)].s}">${i + 1}</span>
          <select class="inp sm" data-wk="cat">${catOpts(w.cat)}</select>
          <select class="inp sm" data-wk="target" title="Çizimde gösterileceği yer"><option value="">Yer: otomatik (${TARGETS[targetOf({ ...w, target: '' })].t})</option>${Object.entries(TARGETS).map(([k, t]) => `<option value="${k}" ${w.target === k ? 'selected' : ''}>${t.t}</option>`).join('')}</select>
          <textarea class="inp sm" rows="1" data-wk="text" placeholder="Yapılacak işin açıklaması">${esc(w.text || '')}</textarea>
          <button class="icon-btn sm danger" data-wdel title="Sil">${icon('trash')}</button></div>`).join('') || '<p class="muted small">Bu mahalde iş yok — ekleyin ya da talep / tespitlerden doldurun.</p>'}</div>
      <div class="row wrap"><button class="btn btn-ghost btn-sm" data-wadd>${icon('plus')}İş ekle</button><button class="btn btn-ghost btn-sm" data-wauto>${icon('rotate')}Talep ve tespitlerden ekle</button></div>
      <label>Mahal notu (paftada işlerin altında, isteğe bağlı)<textarea class="inp" rows="2" data-note>${esc(c.note || '')}</textarea></label>`;
  };
  const r = await modal({ title: 'Mahal izometrik açıklama paftaları', wide: true, body: `
    <p class="muted small">Her mahal için yatay A4 pafta: izometrik görünüş, yapılacak işler (numaralı) ve çizimde işin yeri, iş türüne göre renkli yüzeyler, antet. İşler mahal adına göre talep ve tespitlerden önerilir; düzenledikleriniz bu işte saklanır.</p>
    <div class="iso-dlg"><div class="iso-rl">${list()}<label class="check small"><input type="checkbox" data-items ${st.items !== false ? 'checked' : ''}> Mobilya / donatıları çiz</label></div><div class="iso-ed">${editor()}</div></div>`,
    actions: [{ k: 'no', t: 'Kapat' }, { k: 'ok', t: 'Paftaları hazırla (PDF)', cls: 'btn-primary', icon: 'print' }],
    onOpen: el => {
      const redrawEd = () => { $('.iso-ed', el).innerHTML = editor(); $$('.iso-ed textarea', el).forEach(t => { t.style.height = 'auto'; t.style.height = t.scrollHeight + 2 + 'px'; }); };
      const redrawList = () => { $('.iso-rl', el).firstChild && ($$('.iso-ri', el).forEach(x => x.remove())); $('.iso-rl', el).insertAdjacentHTML('afterbegin', list()); };
      const refreshPrev = () => { $('.iso-prev', el).innerHTML = preview(); };
      el.addEventListener('click', e => {
        const ri = e.target.closest('.iso-ri');
        if (ri && !e.target.matches('[data-ron]')) { e.preventDefault(); cur = ri.dataset.rk; redrawList(); redrawEd(); return; }
        const c = cfgOf(R0());
        if (e.target.closest('[data-wadd]')) { c.works.push({ id: uid('w'), cat: 'diger', text: '' }); save(); redrawEd(); $$('.iso-w textarea', el).at(-1)?.focus(); }
        if (e.target.closest('[data-wauto]')) { const have = new Set(c.works.map(w => w.src).filter(Boolean)); const add = autoWorks(job, R0().room.name, R0().multi ? R0().L.name : '').filter(w => !have.has(w.src)); c.works.push(...add); save(); redrawEd(); redrawList(); }
        const del = e.target.closest('[data-wdel]');
        if (del) { const id = del.closest('[data-w]').dataset.w; c.works = c.works.filter(w => w.id !== id); save(); redrawEd(); redrawList(); }
      });
      el.addEventListener('input', e => {
        const c = cfgOf(R0());
        if (e.target.matches('[data-note]')) { c.note = e.target.value; save(); return; }
        if (e.target.dataset.wk === 'text') { const w = c.works.find(x => x.id === e.target.closest('[data-w]').dataset.w); w.text = e.target.value; e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 2 + 'px'; save(); }
      });
      el.addEventListener('change', e => {
        if (e.target.matches('[data-ron]')) { const R = rooms.find(x => x.key === e.target.closest('.iso-ri').dataset.rk); cfgOf(R).on = e.target.checked; save(); return; }
        if (e.target.matches('[data-items]')) { st.items = e.target.checked; save(); refreshPrev(); return; }
        const c = cfgOf(R0());
        if (e.target.matches('[data-view]')) { c.view = e.target.value; save(); refreshPrev(); return; }
        const k = e.target.dataset.wk;
        if (k === 'cat' || k === 'target') { const w = c.works.find(x => x.id === e.target.closest('[data-w]').dataset.w); w[k] = e.target.value || undefined; save(); redrawEd(); redrawList(); }
        if (k === 'text') { refreshPrev(); redrawList(); }
      });
      $$('.iso-ed textarea', el).forEach(t => { t.style.height = 'auto'; t.style.height = t.scrollHeight + 2 + 'px'; });
    } });
  if (r?.k !== 'ok') return;
  const sel = rooms.filter(R => cfgOf(R).on);
  if (!sel.length) return;
  const html = `<div class="pdoc p-land">${sel.map((R, i) => sheetHtml({ job, settings, L: R.L, room: R.room, cfg: { ...cfgOf(R), items: st.items }, works: cfgOf(R).works, idx: i, total: sel.length, multi: R.multi })).join('')}</div>`;
  printDoc(html, `Mahal paftaları ${job.code}`);
}
