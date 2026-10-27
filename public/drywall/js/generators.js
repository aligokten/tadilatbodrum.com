/* SAGG Drywall+ — parametrik üreteçler.
 * Her eleman tipi parametrelerden bir "model" üretir:
 *   members  profil parçaları (U / C, eksene paralel kutular)
 *   boards   alçıpan parçaları (yüz, kat, kesim ölçüsü, çentikler)
 *   faces    kaplama yüzleri (levha yerleşim çizimi için)
 *   qty      sarf malzeme miktarları
 *   extras   imalat dışı kalemler (tezgah, kapı kasası…)        */
import { SYSTEMS, BOARDS } from './catalog.js';
import { face, faceBox, axisOfVec, shiftBox, studGrid, tileFace, tileRows, screwCount, jointLength, pieceArea, ov } from './geom.js';

export const TYPES = {
  duvar: { label: 'Bölme duvar', code: 'BD', icon: '▥' },
  ada:   { label: 'Mutfak adası', code: 'MA', icon: '▭' },
  tv:    { label: 'TV ünitesi', code: 'TV', icon: '▣' },
  raf:   { label: 'Niş raf duvarı', code: 'NR', icon: '▦' },
  kutu:  { label: 'Özel kutu / tezgah', code: 'OK', icon: '◫' },
  tavan: { label: 'Asma tavan', code: 'AT', icon: '▤' },
};

export function defaults(type) {
  switch (type) {
    case 'duvar': return {
      L: 4000, H: 2800, sys: 75, s: 600,
      A: { layers: 1, board: 'std' }, B: { layers: 1, board: 'std' },
      insul: 'tasyunu', insulT: 50, endA: 'wall', endB: 'wall',
      openings: [{ type: 'door', x: 700, w: 900, h: 2100, sill: 0 }],
    };
    case 'ada': return {
      W: 2000, D: 900, H: 860, sys: 50, s: 400, board: 'h2', layers: 1,
      ctT: 40, ovF: 20, ovB: 300, ovL: 20, ovR: 20, topClad: false,
      niches: [
        { face: 'left', u: 150, v: 120, w: 600, h: 280, d: 350 },
        { face: 'left', u: 150, v: 480, w: 600, h: 280, d: 350 },
      ],
    };
    case 'tv': return {
      W: 3000, H: 2700, sys: 50, s: 400, board: 'std', layers: 1, toCeiling: true,
      consoleH: 450, consoleD: 450, panelD: 220, consoleNiches: 3, consoleNicheH: 220, consoleNicheD: 300,
      tvW: 1500, tvH: 900, tvV: 1050, tvD: 150,
      sideRows: 3, sideW: 350, sideH: 300, sideD: 150,
    };
    case 'raf': return {
      W: 2400, H: 2700, D: 350, sys: 50, s: 400, board: 'std', layers: 1, toCeiling: true,
      rows: 4, cols: 3, margin: 150, gap: 150, bottom: 300, nicheD: 250,
    };
    case 'tavan': return {
      L: 5000, W: 4000, Hc: 2600, Hs: 2900, car: 1000, sec: 400, hang: 900, board: 'std', layers: 1,
      cove: true, coveW: 350, coveDrop: 150, coveSlot: 80,
      spotRows: 2, spotCols: 3, spotD: 75, hatch: false, hatchX: 600, hatchY: 600, hatchS: 600,
    };
    case 'kutu': return {
      W: 1200, D: 600, H: 1000, sys: 50, s: 400, board: 'std', layers: 1,
      cladF: true, cladB: true, cladL: true, cladR: true, cladT: true, wallBack: false, topLoad: false,
      niches: [{ face: 'front', u: 200, v: 300, w: 800, h: 400, d: 300 }],
    };
  }
}

/* ───────────── ortak yardımcılar ───────────── */
function ctx(S) {
  return { members: [], boards: [], faces: [], qty: { dowel: 0, LN9: 0, TN25: 0, TN35: 0, tape_seal: 0, tape_joint: 0, filler: 0, insul: 0, corner: 0, hanger: 0, hangRod: 0, cross: 0, cdjoin: 0 }, extras: [], notes: [], S };
}

function addMember(C, kind, sys, box, axis, role, o = {}) {
  const i = { x: 0, y: 1, z: 2 }[axis];
  const raw = box[i + 3] - box[i];
  const len = Math.round(o.len ?? raw);
  if (len < 30) return null;
  const m = { kind, sys, box, axis, len, role, strong: !!o.strong, note: o.note || '', group: o.group || '' };
  C.members.push(m);
  return m;
}

// yüz-yerel eksen adı ('u' | 'v' | 'n') → dünya ekseni
function wAxis(f, a) { return axisOfVec(a === 'u' ? f.U : a === 'v' ? f.V : f.N); }

// rect − çentikler → dikdörtgenler (3D gösterim için)
export function rectsMinus(p) {
  if (!p.notches.length) return [[0, 0, p.w, p.h]];
  const us = [...new Set([0, p.w, ...p.notches.flatMap(n => [n.u, n.u + n.w])])].sort((a, b) => a - b);
  const vs = [...new Set([0, p.h, ...p.notches.flatMap(n => [n.v, n.v + n.h])])].sort((a, b) => a - b);
  const out = [];
  for (let j = 0; j < vs.length - 1; j++) {
    let run = null;
    for (let i = 0; i < us.length - 1; i++) {
      const cu = (us[i] + us[i + 1]) / 2, cv = (vs[j] + vs[j + 1]) / 2;
      const inside = p.notches.some(n => cu > n.u && cu < n.u + n.w && cv > n.v && cv < n.v + n.h);
      if (!inside) { if (run) run[2] = us[i + 1]; else run = [us[i], vs[j], us[i + 1], vs[j + 1]]; }
      else if (run) { out.push([run[0], run[1], run[2] - run[0], run[3] - run[1]]); run = null; }
    }
    if (run) out.push([run[0], run[1], run[2] - run[0], run[3] - run[1]]);
  }
  return out;
}

/* Bir yüzü kaplar: her kat için döşeme, vida, derz; levhaları C.boards'a ekler. */
function cladFace(C, f, opt) {
  const { region, holes, layers, board, uLines, vLines, offsets, label, mirrorFlip } = opt;
  const S = C.S, t = S.boardT;
  const faceRec = { name: f.name, label, region, holes, layers: [], uLines, vLines, board };
  for (let k = 1; k <= layers; k++) {
    const outer = k === layers;
    const pieces = tileFace(region, holes, offsets[k - 1] || 0, S.sheetW, S.sheetH, (k % 2 === 0) !== !!mirrorFlip, opt.step || 0);
    const pitch = outer ? S.screwPitchOuter : S.screwPitchInner;
    const screwKey = layers === 1 ? 'TN25' : (outer ? 'TN35' : 'TN25');
    for (const p of pieces) {
      const n = screwCount(p, uLines, vLines, pitch);
      C.qty[screwKey] += n;
      const boxes = rectsMinus(p).map(([a, b, w, h]) => faceBox(f, p.u + a, p.u + a + w, p.v + b, p.v + b + h, -k * t, -(k - 1) * t));
      C.boards.push({ type: board, layer: k, outer, face: label, w: Math.round(p.w), h: Math.round(p.h), notches: p.notches.map(q => ({ u: Math.round(q.u), v: Math.round(q.v), w: Math.round(q.w), h: Math.round(q.h) })), boxes, screws: n, area: pieceArea(p), pos: { u: p.u, v: p.v } });
    }
    const area = pieces.reduce((s, p) => s + pieceArea(p), 0);
    if (outer) {
      C.qty.tape_joint += jointLength(pieces, region, holes);
      C.qty.filler += area * 0.35;
    } else C.qty.filler += area * 0.15;
    faceRec.layers.push({ k, pieces });
  }
  C.faces.push(faceRec);
}

/* ───────────── BÖLME DUVAR ───────────── */
function genWall(p, S) {
  const C = ctx(S);
  const sy = SYSTEMS[p.sys], W = sy.web, uF = sy.uFl, t = S.boardT;
  const L = +p.L, H = +p.H, s = +p.s;
  const A = face('A', [0, 0, 0], [1, 0, 0], [0, 0, 1], [0, -1, 0]);
  const ops = (p.openings || []).map(o => ({ ...o, x: +o.x, w: +o.w, h: +o.h, sill: o.type === 'window' ? +o.sill : 0 }))
    .filter(o => o.w > 0 && o.h > 0 && o.x >= 0 && o.x + o.w <= L && o.sill + o.h <= H).sort((a, b) => a.x - b.x);
  const holes = ops.map(o => ({ u0: o.x, u1: o.x + o.w, v0: o.sill, v1: o.sill + o.h }));
  const M = (kind, u0, u1, v0, v1, ax, role, o) => addMember(C, kind, p.sys, faceBox(A, u0, u1, v0, v1, 0, W), wAxis(A, ax), role, o);

  // taban / tavan U — kapı ve geçit boşluklarında taban rayı kesilir
  let segs = [[0, L]];
  for (const o of ops.filter(o => o.sill === 0)) segs = segs.flatMap(([a, b]) => b <= o.x || a >= o.x + o.w ? [[a, b]] : [[a, o.x], [o.x + o.w, b]].filter(([c, d]) => d - c > 30));
  for (const [a, b] of segs) {
    M('U', a, b, 0, uF, 'u', 'Taban rayı (U)');
    C.qty.dowel += Math.ceil((b - a) / S.dowelPitch) + 1;
    C.qty.tape_seal += (b - a) / 1000;
  }
  M('U', 0, L, H - uF, H, 'u', 'Tavan rayı (U)');
  C.qty.dowel += Math.ceil(L / S.dowelPitch) + 1;
  C.qty.tape_seal += L / 1000;

  // dikmeler
  const kingZones = ops.map(o => [Math.max(0, o.x - 50), Math.min(L, o.x + o.w + 50)]);
  const studs = studGrid(0, L, s, 50, true);
  const lnStud = S.studToTrackScrew ? 4 : 0;
  for (const u0 of studs) {
    const u1 = u0 + 50, c = u0 + 25;
    const op = ops.find(o => c > o.x && c < o.x + o.w);
    if (op) {
      const top = op.sill + op.h + uF;
      if (H - top > 60) { M('C', u0, u1, top, H, 'v', 'Kısa dikme (lento üstü)', { len: H - top - 5 }); C.qty.LN9 += 4; }
      if (op.sill > uF + 60) { M('C', u0, u1, 0, op.sill - uF, 'v', 'Kısa dikme (denizlik altı)', { len: op.sill - uF - 5 }); C.qty.LN9 += 4; }
      continue;
    }
    if (kingZones.some(([a, b]) => ov(u0, u1, a, b) > 0)) continue;
    const isEnd = u0 === 0 || u1 === L;
    M('C', u0, u1, 0, H, 'v', isEnd ? 'Duvar başı dikmesi' : 'Dikme', { len: H - 10 });
    C.qty.LN9 += lnStud;
  }
  // duvar başları
  for (const [end, x0] of [['endA', 0], ['endB', L - 50]]) {
    const hasKing = kingZones.some(([a, b]) => ov(x0, x0 + 50, a, b) > 0);
    if (hasKing) M('C', x0, x0 + 50, 0, H, 'v', 'Duvar başı dikmesi', { len: H - 10 });
    if (p[end] === 'wall') { C.qty.dowel += Math.ceil(H / 800) + 1; C.qty.tape_seal += H / 1000; }
  }
  // boşluk kasaları
  const lbl = { door: 'Kapı', window: 'Pencere', pass: 'Geçit' };
  for (const o of ops) {
    const nm = lbl[o.type] || 'Boşluk';
    for (const x0 of [o.x - 50, o.x + o.w]) {
      if (x0 < 0 || x0 + 50 > L) continue;
      M('C', x0, x0 + 50, 0, H, 'v', `${nm} kasa dikmesi`, { len: H - 10, strong: true });
      M('U', x0, x0 + 50, 0, H, 'v', `${nm} kasa takviyesi (C içine U)`, { len: H - 10, strong: true, note: 'C ile kutu yapılır' });
      C.qty.LN9 += 12;
      if (o.sill === 0) C.qty.dowel += 2; // kasa dikmesi tabana köşebentle sabitlenir
    }
    const top = o.sill + o.h;
    if (H - top > uF) { M('U', o.x, o.x + o.w, top, top + uF, 'u', `${nm} lentosu (U)`, { len: o.w + 300, strong: true, note: 'uçlar 150 mm kesilip kıvrılır' }); C.qty.LN9 += 8; }
    if (o.sill > uF) { M('U', o.x, o.x + o.w, o.sill - uF, o.sill, 'u', `${nm} denizliği (U)`, { len: o.w + 300, strong: true, note: 'uçlar 150 mm kesilip kıvrılır' }); C.qty.LN9 += 8; }
    if (o.type === 'door') C.extras.push({ name: `Kapı kasası / pervaz — kaba boşluk ${o.w}×${o.h} mm`, qty: 1, unit: 'takım' });
    // köşe profili: pencere ve geçit kenarları (her iki yüz)
    if (o.type !== 'door') C.qty.corner += ((o.sill > 0 ? 2 * o.w : o.w) + 2 * o.h) * ((p.A.layers > 0) + (p.B.layers > 0)) / 1000;
  }
  for (const end of ['endA', 'endB']) if (p[end] === 'free') C.qty.corner += 2 * H / 1000;

  // kaplama
  const studLinesA = C.members.filter(m => m.axis === 'z' && m.kind === 'C').map(m => m.box[0] + 25);
  const vLines = [uF / 2, H - uF / 2, ...C.members.filter(m => m.axis === 'x' && m.strong).map(m => m.box[2] + uF / 2)];
  const offA = [0, s], offB = [((L - s) % 1200 + 1200) % 1200, ((L % 1200) + 1200) % 1200];
  if (p.A.layers > 0) cladFace(C, A, { label: 'A yüzü', region: { u0: 0, u1: L, v0: 0, v1: H }, holes, layers: +p.A.layers, board: p.A.board, uLines: studLinesA, vLines, offsets: offA, step: s });
  const B = face('B', [L, W, 0], [-1, 0, 0], [0, 0, 1], [0, 1, 0]);
  if (p.B.layers > 0) cladFace(C, B, {
    label: 'B yüzü', region: { u0: 0, u1: L, v0: 0, v1: H },
    holes: holes.map(h => ({ u0: L - h.u1, u1: L - h.u0, v0: h.v0, v1: h.v1 })), layers: +p.B.layers, board: p.B.board,
    uLines: studLinesA.map(x => L - x), vLines, offsets: offB, mirrorFlip: true, step: s,
  });
  if (p.insul !== 'none') {
    C.qty.insul += (L * H - holes.reduce((s, h) => s + (h.u1 - h.u0) * (h.v1 - h.v0), 0)) / 1e6;
    C.notes.push(`Yalıtım: ${p.insulT} mm ${p.insul === 'tasyunu' ? 'taşyünü' : 'camyünü'} (dikme arasına, ${W} mm boşlukta).`);
  }
  const tot = W + t * (+p.A.layers + +p.B.layers);
  C.info = [`Duvar: ${L} × ${H} mm, toplam kalınlık ${tot} mm`, `Sistem: ${sy.label}, dikme aralığı ${s} mm`, `Kaplama: A ${p.A.layers} kat ${BOARDS[p.A.board].short} · B ${p.B.layers} kat ${BOARDS[p.B.board].short}`];
  C.bounds = [0, -t * p.A.layers, 0, L, W + t * p.B.layers, H];
  C.dims = { W: L, D: tot, H };
  C.openings = ops;
  return C;
}

/* ───────────── KUTU (mobilya gövdesi) ───────────── */
function boxFaces(W, D, H) {
  return {
    front: face('front', [0, 0, 0], [1, 0, 0], [0, 0, 1], [0, -1, 0]),
    back:  face('back', [W, D, 0], [-1, 0, 0], [0, 0, 1], [0, 1, 0]),
    left:  face('left', [0, D, 0], [0, -1, 0], [0, 0, 1], [-1, 0, 0]),
    right: face('right', [W, 0, 0], [0, 1, 0], [0, 0, 1], [1, 0, 0]),
    top:   face('top', [0, 0, H], [1, 0, 0], [0, 1, 0], [0, 0, 1]),
  };
}
const FACE_TR = { front: 'Ön yüz', back: 'Arka yüz', left: 'Sol yan', right: 'Sağ yan', top: 'Üst yüz' };

function shiftFace(f, o) { return { ...f, O: [f.O[0] + o[0], f.O[1] + o[1], f.O[2] + o[2]] }; }

/* b: { name, o:[x,y,z], W, D, H, sys, s, layers, board, clad:{front,back,left,right,top}, niches, wallBack, onFloor, topLoad } */
function genBox(C, b) {
  const S = C.S, t = S.boardT, sy = SYSTEMS[b.sys], web = sy.web, uF = sy.uFl;
  const { W, D, H, s } = b;
  const F = boxFaces(W, D, H);
  const pre = b.name ? b.name + ' · ' : '';
  const Lt = k => (b.clad[k] ? b.layers * t : 0);
  const voids = []; // niş hacimleri: traversler ve üst kirişler bunlardan geçmez
  const hitsVoid = bx => voids.some(v => [0, 1, 2].every(i => Math.min(bx[i + 3], v[i + 3]) - Math.max(bx[i], v[i]) > 1));

  for (const fk of ['front', 'back', 'left', 'right']) {
    const f = shiftFace(F[fk], b.o);
    const span = fk === 'front' || fk === 'back' ? W : D;
    const depth = fk === 'front' || fk === 'back' ? D : W;
    const side = fk === 'left' || fk === 'right';
    const ua = side ? web : 0, ub = side ? D - web : W;
    const M = (kind, u0, u1, v0, v1, n0, n1, ax, role, o) => addMember(C, kind, b.sys, faceBox(f, u0, u1, v0, v1, n0, n1), wAxis(f, ax), pre + role, o);
    const niches = (b.niches || []).filter(n => n.face === fk).map(n => {
      const w = Math.min(+n.w, span), h = Math.min(+n.h, H);
      const u = Math.max(side ? web + 50 : 50, Math.min(+n.u, span - w - (side ? web + 50 : 50)));
      return { u, v: Math.max(0, Math.min(+n.v, H - h)), w, h, d: Math.max(web + 20, Math.min(+n.d, depth - web - 10)) };
    });

    // raylar
    for (const [v0, v1, nm, cutTest] of [[0, uF, 'Taban rayı (U)', n => n.v < uF], [H - uF, H, 'Üst ray (U)', n => n.v + n.h > H - uF]]) {
      let segs = [[ua, ub]];
      for (const n of niches.filter(cutTest)) segs = segs.flatMap(([a, c]) => c <= n.u || a >= n.u + n.w ? [[a, c]] : [[a, n.u], [n.u + n.w, c]].filter(([x, y]) => y - x > 30));
      for (const [a, c] of segs) {
        if (c - a < 60) continue;
        M('U', a, c, v0, v1, 0, web, 'u', nm);
        if (v0 === 0 && b.onFloor) { C.qty.dowel += Math.ceil((c - a) / S.dowelPitch) + 1; C.qty.tape_seal += (c - a) / 1000; }
        if (v0 === 0 && !b.onFloor) C.qty.LN9 += Math.ceil((c - a) / 300) + 1;
        if (fk === 'back' && b.wallBack) C.qty.tape_seal += (c - a) / 1000 / 2;
      }
    }
    // dikmeler
    let studs = studGrid(ua, ub, s, 50, !side);
    if (side && !studs.length && ub - ua > 350) studs = [(ua + ub) / 2 - 25];
    const jamb = niches.map(n => [n.u - 50, n.u + n.w + 50]);
    for (const u0 of studs) {
      const c = u0 + 25;
      const n = niches.find(n => c > n.u && c < n.u + n.w);
      if (n) {
        const top = n.v + n.h + uF;
        if (H - top > 60) { M('C', u0, u0 + 50, top, H, 0, web, 'v', 'Kısa dikme (niş üstü)', { len: H - top - 5 }); C.qty.LN9 += 4; }
        if (n.v - uF > 60) { M('C', u0, u0 + 50, 0, n.v - uF, 0, web, 'v', 'Kısa dikme (niş altı)', { len: n.v - uF - 5 }); C.qty.LN9 += 4; }
        continue;
      }
      if (jamb.some(([a, z]) => ov(u0, u0 + 50, a, z) > 0)) continue;
      M('C', u0, u0 + 50, 0, H, 0, web, 'v', 'Dikme', { len: H - 10 });
      C.qty.LN9 += S.studToTrackScrew ? 4 : 2;
      if (fk === 'back' && b.wallBack) C.qty.dowel += Math.ceil(H / S.dowelPitch) + 1;
    }
    // nişler
    niches.forEach((n, i) => {
      const nm = `Niş ${i + 1}`;
      voids.push(faceBox(f, n.u - 50, n.u + n.w + 50, n.v, n.v + n.h, 0, n.d));
      for (const x0 of [n.u - 50, n.u + n.w]) { M('C', x0, x0 + 50, 0, H, 0, web, 'v', `${nm} kasa dikmesi`, { len: H - 10, strong: true }); C.qty.LN9 += 6; }
      if (H - (n.v + n.h) > uF) M('U', n.u, n.u + n.w, n.v + n.h, n.v + n.h + uF, 0, web, 'u', `${nm} lentosu (U)`, { len: n.w + 2 * web, strong: true, note: `uçlar ${web} mm kıvrılır` });
      if (n.v > uF) M('U', n.u, n.u + n.w, n.v - uF, n.v, 0, web, 'u', `${nm} taban kirişi (U)`, { len: n.w + 2 * web, strong: true, note: `uçlar ${web} mm kıvrılır` });
      C.qty.LN9 += 8;
      // niş arka düzlemi (n = d − web … d) ve derinlik bağlantıları
      const nb = n.d;
      M('U', n.u, n.u + n.w, n.v, n.v + uF, nb - web, nb, 'u', `${nm} arka alt ray (U)`);
      M('U', n.u, n.u + n.w, n.v + n.h - uF, n.v + n.h, nb - web, nb, 'u', `${nm} arka üst ray (U)`);
      for (const x0 of [n.u, n.u + n.w - 50]) M('C', x0, x0 + 50, n.v, n.v + n.h, nb - web, nb, 'v', `${nm} arka dikmesi`, { len: n.h - 10 });
      C.qty.LN9 += 8;
      const r0 = web, r1 = nb - web;
      if (r1 - r0 > 30) {
        for (const [x0, y0] of [[n.u, n.v], [n.u + n.w - 50, n.v], [n.u, n.v + n.h - 50], [n.u + n.w - 50, n.v + n.h - 50]])
          M('C', x0, x0 + 50, y0, y0 + 50, r0, r1, 'n', `${nm} derinlik bağlantısı`);
        C.qty.LN9 += 16;
      }
      // niş iç kaplaması (tek kat)
      const Lf = b.layers * t;
      const dl = Math.round(n.d - t + Lf);
      const lin = (lbl, w, h, bx) => C.boards.push({ type: b.board, layer: 1, outer: true, lining: true, face: `${pre}${FACE_TR[fk]} · ${nm} ${lbl}`, w: Math.round(w), h: Math.round(h), notches: [], boxes: [bx], screws: Math.ceil(w * h / 1e6 * 25) + 4, area: w * h / 1e6 });
      const nIn = n.d - t;
      lin('arka', n.w, n.h, faceBox(f, n.u, n.u + n.w, n.v, n.v + n.h, n.d - t, n.d));
      lin('sol yanak', dl, n.h, faceBox(f, n.u, n.u + t, n.v, n.v + n.h, -Lf, nIn));
      lin('sağ yanak', dl, n.h, faceBox(f, n.u + n.w - t, n.u + n.w, n.v, n.v + n.h, -Lf, nIn));
      lin('taban', n.w - 2 * t, dl, faceBox(f, n.u + t, n.u + n.w - t, n.v, n.v + t, -Lf, nIn));
      lin('tavan', n.w - 2 * t, dl, faceBox(f, n.u + t, n.u + n.w - t, n.v + n.h - t, n.v + n.h, -Lf, nIn));
      const la = (2 * dl * n.h + 2 * (n.w - 2 * t) * dl + n.w * n.h) / 1e6;
      C.qty.TN25 += Math.ceil(la * 25) + 20;
      C.qty.filler += la * 0.35;
      C.qty.tape_joint += 4 * dl / 1000 + 2 * (n.w + n.h) / 1000;
      C.qty.corner += 2 * (n.w + n.h) / 1000;
      C.nicheInfo.push(`${pre}${FACE_TR[fk]} ${nm}: kaba ${n.w}×${n.h}×${n.d} mm → net ${n.w - 2 * t}×${n.h - 2 * t}×${dl} mm, tabandan ${n.v} mm`);
      n.dl = dl;
    });

    // kaplama
    if (b.clad[fk]) {
      const ext = fk === 'front' ? [Lt('left'), Lt('right')] : fk === 'back' ? [Lt('right'), Lt('left')] : [0, 0];
      const vTop = H + Lt('top');
      const fm = C.members.filter(m => m.group === '' && m.axis === 'z');
      // dikme hatları: yüzün n=0..web bandındaki düşey elemanların merkezleri (yüz u koordinatında)
      const uLines = [];
      for (const m of fm) {
        const a = faceBox(f, -1e6, 1e6, -1e6, 1e6, 0, web);
        const inBand = m.box[0] >= a[0] - 1 && m.box[3] <= a[3] + 1 && m.box[1] >= a[1] - 1 && m.box[4] <= a[4] + 1;
        if (!inBand) continue;
        const cx = (m.box[0] + m.box[3]) / 2, cy = (m.box[1] + m.box[4]) / 2;
        const rel = [cx - f.O[0], cy - f.O[1]];
        uLines.push(rel[0] * f.U[0] + rel[1] * f.U[1]);
      }
      cladFace(C, f, {
        label: pre + FACE_TR[fk], region: { u0: -ext[0], u1: span + ext[1], v0: 0, v1: vTop },
        holes: niches.map(n => ({ u0: n.u, u1: n.u + n.w, v0: n.v, v1: n.v + n.h })),
        layers: b.layers, board: b.board, uLines: [...uLines, 0, span], vLines: [uF / 2, H - uF / 2, ...niches.flatMap(n => [n.v - uF / 2, n.v + n.h + uF / 2])],
        offsets: [0, s], step: s,
      });
    }
  }

  // üst kirişler / bağlantı traversleri
  const xs = studGrid(0, W, s, 50, true);
  if (b.clad.top || b.topLoad) {
    for (const x0 of xs) {
      const bx = shiftBox([x0, web, H - web, x0 + 50, D - web, H], b.o);
      if (!hitsVoid(bx)) { addMember(C, 'C', b.sys, bx, 'y', pre + 'Üst kiriş (C)', { len: D - 2 * web - 5 }); C.qty.LN9 += 4; }
    }
  }
  if (H > 1300 && D - 2 * web > 40) {
    for (let z = 1000; z < H - 500; z += 1000)
      for (const x0 of xs) {
        const bx = shiftBox([x0, web, z, x0 + 50, D - web, z + 40], b.o);
        if (!hitsVoid(bx)) { addMember(C, 'C', b.sys, bx, 'y', pre + 'Bağlantı traversi (C)', { len: D - 2 * web - 5 }); C.qty.LN9 += 4; }
      }
  }
  if (b.clad.top) {
    const f = shiftFace(F.top, b.o);
    cladFace(C, f, {
      label: pre + FACE_TR.top, region: { u0: -Lt('left'), u1: W + Lt('right'), v0: -Lt('front'), v1: D + Lt('back') }, holes: [],
      layers: b.layers, board: b.board, uLines: [...xs.map(x => x + 25)], vLines: [web / 2, D - web / 2], offsets: [0, s], step: s,
    });
  }
  // köşe profilleri
  const cl = b.clad;
  const vEdges = [['front', 'left'], ['front', 'right'], ['back', 'left'], ['back', 'right']].filter(([a, c]) => cl[a] && cl[c]).length;
  C.qty.corner += vEdges * H / 1000;
  if (cl.top) C.qty.corner += ((cl.front ? W : 0) + (cl.back ? W : 0) + (cl.left ? D : 0) + (cl.right ? D : 0)) / 1000;
  if (b.wallBack) C.qty.tape_seal += 2 * H / 1000;
}

function genFurniture(type, p, S) {
  const C = ctx(S);
  C.nicheInfo = [];
  const t = S.boardT;
  const base = { sys: +p.sys, s: +p.s, layers: +p.layers, board: p.board };
  const boxes = [];
  if (type === 'ada') {
    boxes.push({ ...base, name: '', o: [0, 0, 0], W: +p.W, D: +p.D, H: +p.H, clad: { front: true, back: true, left: true, right: true, top: !!p.topClad }, niches: p.niches, onFloor: true, topLoad: true });
    const lt = p.layers * t;
    const cw = +p.W + 2 * lt + +p.ovL + +p.ovR, cd = +p.D + 2 * lt + +p.ovF + +p.ovB;
    C.extras.push({ name: `Tezgah (granit / kuvars / ahşap) ${cw} × ${cd} × ${p.ctT} mm`, qty: 1, unit: 'adet', note: `Ön ${p.ovF}, arka ${p.ovB}, sol ${p.ovL}, sağ ${p.ovR} mm taşma` });
    if (+p.ovB >= 250) C.extras.push({ name: 'Tezgah taşma konsolu / gizli L destek (bar oturma tarafı)', qty: Math.max(2, Math.ceil(+p.W / 600)), unit: 'adet' });
    C.countertop = { w: cw, d: cd, t: +p.ctT, x: -lt - +p.ovL, y: -lt - +p.ovF, z: +p.H };
    C.dims = { W: +p.W + 2 * lt, D: +p.D + 2 * lt, H: +p.H + +p.ctT };
  } else if (type === 'tv') {
    const W = +p.W, H = +p.H, cH = +p.consoleH, cD = +p.consoleD, pD = +p.panelD;
    const lt = p.layers * t;
    if (cH > 0) {
      const n = Math.max(0, +p.consoleNiches | 0), g = 150;
      const nw = n ? (W - (n + 1) * g) / n : 0;
      const niches = [];
      for (let i = 0; i < n; i++) niches.push({ face: 'front', u: Math.round(g + i * (nw + g)), v: Math.round((cH - p.consoleNicheH) / 2), w: Math.round(nw), h: +p.consoleNicheH, d: +p.consoleNicheD });
      boxes.push({ ...base, name: 'Alt konsol', o: [0, 0, 0], W, D: cD, H: cH, clad: { front: true, back: false, left: true, right: true, top: true }, niches, onFloor: true, wallBack: true, topLoad: true });
    }
    const pH = H - cH - (cH > 0 ? lt : 0);
    const nichesP = [{ face: 'front', u: Math.round((W - p.tvW) / 2), v: Math.round(+p.tvV - cH - (cH > 0 ? lt : 0)), w: +p.tvW, h: +p.tvH, d: +p.tvD }];
    const rows = +p.sideRows | 0;
    const sideSpace = (W - p.tvW) / 2;
    if (rows > 0 && sideSpace < +p.sideW + 250) C.notes.push('Yan nişler için TV nişinin iki yanında yeterli genişlik yok — yan nişler eklenmedi.');
    else if (rows > 0) {
      const su = Math.round((sideSpace - p.sideW) / 2);
      const top = pH - 250, gap = 120;
      for (let r = 0; r < rows; r++) {
        const v = Math.round(top - (r + 1) * +p.sideH - r * gap);
        if (v < 150) break;
        nichesP.push({ face: 'front', u: su, v, w: +p.sideW, h: +p.sideH, d: +p.sideD });
        nichesP.push({ face: 'front', u: Math.round(W - su - p.sideW), v, w: +p.sideW, h: +p.sideH, d: +p.sideD });
      }
    }
    boxes.push({ ...base, name: 'Duvar paneli', o: [0, cH > 0 ? cD - pD : 0, cH > 0 ? cH + lt : 0], W, D: pD, H: pH, clad: { front: true, back: false, left: true, right: true, top: !p.toCeiling }, niches: nichesP, onFloor: cH === 0, wallBack: true });
    if (p.toCeiling) C.notes.push('Panel tavana kadar: üst ray tavana dübelle sabitlenir, tavan birleşimine akrilik mastik / derz bandı uygulanır.');
    C.extras.push({ name: 'TV askı aparatı için kontrplak / OSB takviye (niş arkası)', qty: 1, unit: 'adet', note: `${p.tvW - 100} × 400 mm, 18 mm` });
    C.extras.push({ name: 'Gizli LED şerit + profil (opsiyonel)', qty: Math.round((+p.tvW + 2 * p.tvH) / 100) / 10, unit: 'm' });
    C.dims = { W: W + 2 * lt, D: Math.max(cD, pD) + lt, H };
  } else if (type === 'raf') {
    const W = +p.W, H = +p.H, D = +p.D, rows = +p.rows | 0, cols = +p.cols | 0, m = +p.margin, g = +p.gap;
    const nw = (W - 2 * m - (cols - 1) * g) / cols, nh = (H - +p.bottom - m - (rows - 1) * g) / rows;
    const niches = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++)
      niches.push({ face: 'front', u: Math.round(m + c * (nw + g)), v: Math.round(+p.bottom + r * (nh + g)), w: Math.round(nw), h: Math.round(nh), d: +p.nicheD });
    boxes.push({ ...base, name: '', o: [0, 0, 0], W, D, H, clad: { front: true, back: false, left: true, right: true, top: !p.toCeiling }, niches, onFloor: true, wallBack: true });
    C.extras.push({ name: 'Niş içi gizli LED (opsiyonel)', qty: Math.round(rows * cols * nw / 100) / 10, unit: 'm' });
    const lt = p.layers * t; C.dims = { W: W + 2 * lt, D: D + lt, H };
  } else {
    boxes.push({ ...base, name: '', o: [0, 0, 0], W: +p.W, D: +p.D, H: +p.H, clad: { front: !!p.cladF, back: !!p.cladB && !p.wallBack, left: !!p.cladL, right: !!p.cladR, top: !!p.cladT }, niches: p.niches, onFloor: true, wallBack: !!p.wallBack, topLoad: !!p.topLoad });
    const lt = p.layers * t; C.dims = { W: +p.W + 2 * lt, D: +p.D + lt * 2, H: +p.H + (p.cladT ? lt : 0) };
  }
  for (const b of boxes) { b.W = Math.max(200, b.W); b.D = Math.max(SYSTEMS[b.sys].web * 2 + 20, b.D); b.H = Math.max(200, b.H); genBox(C, b); }
  C.boxes = boxes;
  const bb = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9];
  for (const it of [...C.members.map(m => m.box), ...C.boards.flatMap(b => b.boxes)]) for (let i = 0; i < 3; i++) { bb[i] = Math.min(bb[i], it[i]); bb[i + 3] = Math.max(bb[i + 3], it[i + 3]); }
  C.bounds = bb;
  C.info = [
    `Dış ölçü: ${Math.round(C.dims.W)} × ${Math.round(C.dims.D)} × ${Math.round(C.dims.H)} mm (G × D × Y)`,
    `Sistem: ${SYSTEMS[p.sys].label}, dikme aralığı ${p.s} mm, ${p.layers} kat ${BOARDS[p.board].short}`,
    ...C.nicheInfo,
  ];
  return C;
}

/* ───────────── ASMA TAVAN (iki kademeli CD60 / UD28 sistemi) ─────────────
 * Taşıyıcı CD (üst kademe) x yönünde, askılarla tavana asılır; montaj CD (alt kademe) y yönünde,
 * çapraz bağlantı ile taşıyıcıların altına bağlanır, uçları duvardaki UD28 içine oturur.
 * Levha uzun kenarı montaj profillerine diktir (x yönü); baş derzleri montaj profili üzerine gelir.
 * İsteğe bağlı çevre gizli ışık bandı: ana tavanın coveDrop altında, coveW genişliğinde, iç kenarında alın (fascia). */
function genCeiling(p, S) {
  const C = ctx(S);
  C.aux = []; C.marks = [];
  const t = S.boardT, L = +p.L, W = +p.W, Hc = +p.Hc, Hs = Math.max(+p.Hs, Hc + 100);
  const s = +p.sec, cs = +p.car, hs = +p.hang, Lb = +p.layers;
  const UD = (box, axis, role, o) => addMember(C, 'UD', 28, box, axis, role, o);
  const CD = (box, axis, role, o) => addMember(C, 'CD', 60, box, axis, role, o);
  const hanger = (x, y, z0, z1) => {
    C.aux.push({ box: [x - 4, y - 4, z0, x + 4, y + 4, z1], color: '#334155', label: 'askı' });
    C.qty.hanger++; C.qty.dowel++; C.qty.hangRod += (z1 - z0) / 1000;
  };
  const ring = (z, role) => {
    for (const [b, ax, len] of [[[0, 0, z, L, 27, z + 28], 'x', L], [[0, W - 27, z, L, W, z + 28], 'x', L], [[0, 27, z, 27, W - 27, z + 28], 'y', W], [[L - 27, 27, z, L, W - 27, z + 28], 'y', W]]) {
      UD(b, ax, role, { len });
      C.qty.dowel += Math.ceil(len / S.dowelPitch) + 1;
      C.qty.tape_seal += len / 1000;
    }
  };
  // ana tavan
  ring(Hc, 'Duvar UD28 (ana tavan)');
  const secX = [];
  for (let x = s; x < L - 100; x += s) secX.push(x);
  for (const x of secX) CD([x - 30, 5, Hc, x + 30, W - 5, Hc + 27], 'y', 'Montaj profili CD60 (alt kademe)', { len: W - 10 });
  const nCar = Math.max(2, Math.ceil((W - 300) / cs) + 1);
  const carY = Array.from({ length: nCar }, (_, i) => 150 + i * (W - 300) / (nCar - 1));
  for (const y of carY) CD([10, y - 30, Hc + 27, L - 10, y + 30, Hc + 54], 'x', 'Taşıyıcı profil CD60 (üst kademe)', { len: L - 20 });
  C.qty.cross += nCar * secX.length;
  const nH = Math.max(2, Math.ceil((L - 300) / hs) + 1);
  for (const y of carY) for (let j = 0; j < nH; j++) hanger(150 + j * (L - 300) / (nH - 1), y, Hc + 54, Hs);
  C.aux.push({ box: [-100, -100, Hs, L + 100, W + 100, Hs + 150], color: '#cbd5e1', label: 'döşeme', slab: true });

  // gizli ışık bandı
  const cove = !!p.cove && +p.coveW > 100;
  const cw = +p.coveW, Hb = Hc - +p.coveDrop, fH = Math.max(60, +p.coveDrop - +p.coveSlot);
  if (cove) {
    ring(Hb, 'Duvar UD28 (ışık bandı)');
    const sides = [ // [eksen, sabit koordinat, iç yön]
      ['x', cw, 1], ['x', W - cw, -1], ['y', cw, 1], ['y', L - cw, -1],
    ];
    for (const [ax, c, dir] of sides) {
      const span = ax === 'x' ? [cw, L - cw] : [cw, W - cw];
      const len = span[1] - span[0];
      // alın altı CD ve alın üstü UD
      if (ax === 'x') {
        CD([span[0], dir > 0 ? c - 60 : c, Hb, span[1], dir > 0 ? c : c + 60, Hb + 27], 'x', 'Işık bandı alın alt profili CD60', { len });
        UD([span[0], dir > 0 ? c - 27 : c, Hb + fH - 28, span[1], dir > 0 ? c : c + 27, Hb + fH], 'x', 'Işık bandı alın üst profili UD28', { len });
      } else {
        CD([dir > 0 ? c - 60 : c, span[0], Hb, dir > 0 ? c : c + 60, span[1], Hb + 27], 'y', 'Işık bandı alın alt profili CD60', { len });
        UD([dir > 0 ? c - 27 : c, span[0], Hb + fH - 28, dir > 0 ? c : c + 27, span[1], Hb + fH], 'y', 'Işık bandı alın üst profili UD28', { len });
      }
      // konsollar (duvardan alına) ve alın dikmeleri, askılar
      for (let q = span[0] + s / 2; q < span[1] - 20; q += s) {
        if (ax === 'x') CD([q - 30, dir > 0 ? 27 : W - cw, Hb, q + 30, dir > 0 ? cw - 60 : W - 27, Hb + 27], 'y', 'Işık bandı konsolu CD60', { len: cw - 87 });
        else CD([dir > 0 ? 27 : L - cw, q - 30, Hb, dir > 0 ? cw - 60 : L - 27, q + 30, Hb + 27], 'x', 'Işık bandı konsolu CD60', { len: cw - 87 });
        C.qty.LN9 += 4;
      }
      for (let q = span[0] + 300; q < span[1] - 100; q += 600) {
        if (ax === 'x') CD([q - 30, dir > 0 ? c - 27 : c, Hb + 27, q + 30, dir > 0 ? c : c + 27, Hb + fH - 28], 'z', 'Işık bandı alın dikmesi CD60', { len: fH - 55 });
        else CD([dir > 0 ? c - 27 : c, q - 30, Hb + 27, dir > 0 ? c : c + 27, q + 30, Hb + fH - 28], 'z', 'Işık bandı alın dikmesi CD60', { len: fH - 55 });
        C.qty.LN9 += 4;
        const [hx, hy] = ax === 'x' ? [q, c - dir * 30] : [c - dir * 30, q];
        C.aux.push({ box: [hx - 4, hy - 4, Hb + fH, hx + 4, hy + 4, Hc], color: '#334155', label: 'askı' });
        C.qty.hanger++;
      }
    }
    const ringLen = 2 * (L - 2 * cw) + 2 * (W - 2 * cw);
    C.qty.corner += 2 * ringLen / 1000;
    C.extras.push({ name: 'Gizli ışık: LED şerit + alüminyum profil', qty: Math.ceil(ringLen / 100) / 10, unit: 'm', note: `Işık bandı içinde, alın arkasına (yarık ${p.coveSlot} mm)` });
    C.extras.push({ name: 'LED trafosu / sürücü', qty: Math.max(1, Math.ceil(ringLen / 1000 / 10)), unit: 'adet', note: '≈ 10 m LED / sürücü; ana tavana erişilebilir yere' });
  }

  // levhalar
  const sl = Math.max(s, Math.floor(S.sheetH / s) * s);
  const holes = [];
  if (p.hatch) {
    const hx = +p.hatchX, hy = +p.hatchY, hz = +p.hatchS;
    holes.push({ u0: hx, u1: hx + hz, v0: hy, v1: hy + hz });
    C.extras.push({ name: `Müdahale (servis) kapağı ${hz} × ${hz} mm, alçıpan dolgulu`, qty: 1, unit: 'adet' });
    for (const [x0, x1] of [[hx - 30, hx], [hx + hz, hx + hz + 30]]) CD([x0, hy - 100, Hc, x1, hy + hz + 100, Hc + 27], 'y', 'Kapak çerçevesi CD60', { len: hz + 200, strong: true });
    C.qty.LN9 += 8;
  }
  const main = cove ? { u0: cw - 150, u1: L - cw + 150, v0: cw - 150, v1: W - cw + 150 } : { u0: 0, u1: L, v0: 0, v1: W };
  const fMain = face('ceil', [0, 0, Hc], [1, 0, 0], [0, 1, 0], [0, 0, -1]);
  const clad = (f, label, region, hl, uLines, vLines, layers) => {
    const rec = { name: f.name, label, region, holes: hl, layers: [], uLines, vLines, board: p.board };
    for (let k = 1; k <= layers; k++) {
      const outer = k === layers;
      // 2. kat: baş derzleri yarım levha boyu kaydırılır
      const pieces = tileRows(region, hl, sl, S.sheetW, s, k % 2 === 0);
      for (const q of pieces) {
        const n = screwCount(q, uLines, vLines, outer ? S.screwPitchCeil : S.screwPitchInner);
        C.qty[layers > 1 && outer ? 'TN35' : 'TN25'] += n;
        const boxes = rectsMinus(q).map(([a, b, w, h]) => faceBox(f, q.u + a, q.u + a + w, q.v + b, q.v + b + h, -k * t, -(k - 1) * t));
        C.boards.push({ type: p.board, layer: k, outer, face: label, w: Math.round(q.w), h: Math.round(q.h), notches: q.notches.map(z => ({ u: Math.round(z.u), v: Math.round(z.v), w: Math.round(z.w), h: Math.round(z.h) })), boxes, screws: n, area: pieceArea(q), pos: { u: q.u, v: q.v } });
      }
      const area = pieces.reduce((a, q) => a + pieceArea(q), 0);
      if (outer) { C.qty.tape_joint += jointLength(pieces, region, hl); C.qty.filler += area * 0.35; } else C.qty.filler += area * 0.15;
      rec.layers.push({ k, pieces });
    }
    C.faces.push(rec);
  };
  clad(fMain, 'Ana tavan', main, holes, [0, L, ...secX], [14, W - 14], Lb);
  if (cove) {
    const fB = face('band', [0, 0, Hb], [1, 0, 0], [0, 1, 0], [0, 0, -1]);
    // bant alt yüzü: 4 şerit (ön / arka tam boy, yanlar arada)
    const strips = [
      ['Işık bandı alt · ön', { u0: 0, u1: L, v0: 0, v1: cw }], ['Işık bandı alt · arka', { u0: 0, u1: L, v0: W - cw, v1: W }],
      ['Işık bandı alt · sol', { u0: 0, u1: cw, v0: cw, v1: W - cw }], ['Işık bandı alt · sağ', { u0: L - cw, u1: L, v0: cw, v1: W - cw }],
    ];
    for (const [lb, r] of strips) {
      const along = r.u1 - r.u0 >= r.v1 - r.v0;
      const pcs = [];
      const len = along ? r.u1 - r.u0 : r.v1 - r.v0;
      for (let a = 0; a < len - 1; a += sl) {
        const e = Math.min(len, a + sl);
        pcs.push(along ? { u: r.u0 + a, v: r.v0, w: e - a, h: r.v1 - r.v0, notches: [] } : { u: r.u0, v: r.v0 + a, w: r.u1 - r.u0, h: e - a, notches: [] });
      }
      pushPieces(C, fB, lb, p.board, pcs, Lb, t, S);
      C.faces.push({ name: 'band', label: lb, region: r, holes: [], layers: [{ k: 1, pieces: pcs }], board: p.board });
    }
    // alın (fascia) — iç yüzler, levha düşey şerit
    const fasc = [
      ['Işık bandı alın · ön', face('f1', [L - cw, cw, Hb - Lb * t], [-1, 0, 0], [0, 0, 1], [0, 1, 0]), L - 2 * cw],
      ['Işık bandı alın · arka', face('f2', [cw, W - cw, Hb - Lb * t], [1, 0, 0], [0, 0, 1], [0, -1, 0]), L - 2 * cw],
      ['Işık bandı alın · sol', face('f3', [cw, cw, Hb - Lb * t], [0, 1, 0], [0, 0, 1], [1, 0, 0]), W - 2 * cw],
      ['Işık bandı alın · sağ', face('f4', [L - cw, W - cw, Hb - Lb * t], [0, -1, 0], [0, 0, 1], [-1, 0, 0]), W - 2 * cw],
    ];
    for (const [lb, f, len] of fasc) {
      const r = { u0: 0, u1: len, v0: 0, v1: fH + Lb * t };
      const pcs = [];
      for (let a = 0; a < len - 1; a += S.sheetH) pcs.push({ u: a, v: 0, w: Math.min(len, a + S.sheetH) - a, h: r.v1, notches: [] });
      pushPieces(C, f, lb, p.board, pcs, 1, t, S);
      C.faces.push({ name: f.name, label: lb, region: r, holes: [], layers: [{ k: 1, pieces: pcs }], board: p.board });
    }
  }
  // spotlar
  const R = cove ? { x0: cw, x1: L - cw, y0: cw, y1: W - cw } : { x0: 0, x1: L, y0: 0, y1: W };
  const sr = +p.spotRows | 0, sc = +p.spotCols | 0;
  if (sr > 0 && sc > 0) {
    for (let i = 0; i < sr; i++) for (let j = 0; j < sc; j++)
      C.marks.push({ x: R.x0 + (j + 0.5) * (R.x1 - R.x0) / sc, y: R.y0 + (i + 0.5) * (R.y1 - R.y0) / sr, r: +p.spotD / 2, z: Hc });
    C.extras.push({ name: `Spot armatür Ø${p.spotD} mm (delik: panç / delik testeresi)`, qty: sr * sc, unit: 'adet', note: 'Delik yerleri plan çiziminde; profile denk gelirse 30–50 mm kaydırın' });
  }
  for (const m of C.members) if (m.kind === 'CD' && m.len > S.barCD) C.qty.cdjoin += Math.ceil(m.len / S.barCD) - 1;
  C.bounds = [-100, -100, Math.min(Hb || Hc, Hc) - Lb * t - 20, L + 100, W + 100, Hs + 150];
  C.dims = { W: L, D: W, H: Hc };
  const net = (L * W - holes.reduce((a, h) => a + (h.u1 - h.u0) * (h.v1 - h.v0), 0)) / 1e6;
  C.info = [
    `Oda: ${L} × ${W} mm (${(L * W / 1e6).toFixed(2)} m²), tavan kotu ${Hc} mm, döşeme altı ${Hs} mm (plenum ${Hs - Hc} mm)`,
    `Taşıyıcı CD60 ${nCar} sıra (≤ ${cs} mm), montaj CD60 ${secX.length} adet @ ${s} mm, askı aralığı ≤ ${hs} mm`,
    `Kaplama: ${Lb} kat ${BOARDS[p.board].short}, levha baş derzleri ${sl} mm modülde (montaj profili üzerinde)`,
    cove ? `Gizli ışık bandı: genişlik ${cw} mm, ana tavandan ${p.coveDrop} mm aşağıda, ışık yarığı ${p.coveSlot} mm, alın yüksekliği ${fH} mm` : 'Gizli ışık bandı yok',
    `Net tavan alanı ≈ ${net.toFixed(2)} m²`,
  ];
  if (Hs - Hc < 100) C.notes.push('Plenum (döşeme ile tavan arası) 100 mm altında: iki kademeli sistem sığmaz, doğrudan askılı tek kademe düşünün.');
  if (cove && Hs - Hc - 54 < 0) C.notes.push('Işık bandı askıları için yeterli yükseklik yok.');
  return C;
}

function pushPieces(C, f, label, board, pcs, layers, t, S) {
  for (let k = 1; k <= layers; k++) for (const q of pcs) {
    const n = Math.ceil(q.w * q.h / 1e6 * 25) + 4;
    C.qty.TN25 += n;
    C.boards.push({ type: board, layer: k, outer: k === layers, face: label, w: Math.round(q.w), h: Math.round(q.h), notches: [], boxes: [faceBox(f, q.u, q.u + q.w, q.v, q.v + q.h, -k * t, -(k - 1) * t)], screws: n, area: q.w * q.h / 1e6, pos: { u: q.u, v: q.v } });
    if (k === layers) C.qty.filler += q.w * q.h / 1e6 * 0.35;
  }
}

export function generate(el, S) {
  const model = el.type === 'duvar' ? genWall(el.params, S) : el.type === 'tavan' ? genCeiling(el.params, S) : genFurniture(el.type, el.params, S);
  model.el = el;
  return model;
}
