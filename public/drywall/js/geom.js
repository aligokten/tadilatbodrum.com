/* SAGG Drywall+ — geometri yardımcıları.
 * Dünya ekseni: x = genişlik (sağa), y = derinlik (önden arkaya), z = yükseklik. Birim mm.
 * Her yüz (face) yerel (u, v, n) koordinatı taşır: u yatay, v düşey, n yüzeyden içeri derinlik.
 * Tüm eleman ve levhalar eksene paralel kutulardır: box = [x0, y0, z0, x1, y1, z1]. */

export const AX = ['x', 'y', 'z'];

export function face(name, O, U, V, N) { return { name, O, U, V, N }; }

// Yerel (u, v, n) noktası → dünya noktası. n içeri (N'nin tersi) yönde pozitiftir.
export function P(f, u, v, n) {
  return [0, 1, 2].map(i => f.O[i] + u * f.U[i] + v * f.V[i] - n * f.N[i]);
}

export function faceBox(f, u0, u1, v0, v1, n0, n1) {
  const a = P(f, u0, v0, n0), b = P(f, u1, v1, n1);
  return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2]),
          Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.max(a[2], b[2])];
}

export function axisOfVec(v) { return v[0] ? 'x' : v[1] ? 'y' : 'z'; }

export function shiftBox(b, o) {
  return [b[0] + o[0], b[1] + o[1], b[2] + o[2], b[3] + o[0], b[4] + o[1], b[5] + o[2]];
}

export const r1 = v => Math.round(v * 10) / 10;
export const rnd = v => Math.round(v);

// İki aralığın kesişimi
export function ov(a0, a1, b0, b1) { return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0)); }

/* Dikme ızgarası: aks merkezleri 0, s, 2s… ; ilk ve son dikme kenara yaslanır.
 * Döner: kutu başlangıçları [u0] (dikme genişliği fw). */
export function studGrid(ua, ub, s, fw = 50, ends = true) {
  const out = [];
  const span = ub - ua;
  if (span < fw) return out;
  if (ends) out.push(ua);
  for (let c = ua + s; c + fw / 2 < ub - fw - 20; c += s) out.push(c - fw / 2);
  if (ends && span >= fw * 2 + 10) out.push(ub - fw);
  return out;
}

/* Bir yüz bölgesini levhalarla döşer.
 * region {u0,u1,v0,v1}, holes [{u0,u1,v0,v1}]
 * off: derz aksı (yüz başlangıcına göre; derzler off + k·sw üzerinde, dikme ortasına gelir)
 * step: dikme aralığı — dar kenar parçası oluşursa derz bir dikme aralığı kaydırılır.
 * Döner: [{u, v, w, h, notches:[{u,v,w,h}] (parçaya göre)}] */
export function tileFace(region, holes, off, sw, sh, flip = false, step = 0, minW = 150) {
  const { u0, u1, v0, v1 } = region;
  const cuts = [u0];
  if (u1 - u0 > sw + 0.5) {
    let c = off + Math.ceil((u0 + 1 - off) / sw) * sw;
    if (c - u0 > sw + 0.5) c = step ? c - step : u0 + sw;
    if (c - u0 < minW && step) c += step;
    for (; c < u1 - 1; c += sw) cuts.push(c);
    if (cuts.length > 2 && u1 - cuts[cuts.length - 1] < minW && step) cuts[cuts.length - 1] -= step;
  }
  cuts.push(u1);
  const H = v1 - v0;
  const pieces = [];
  for (let i = 0; i < cuts.length - 1; i++) {
    const a = cuts[i], b = cuts[i + 1];
    // düşey bölme: levha boyundan uzun yükseklikte yatay derzler kaydırılır
    let seq = [];
    if (H <= sh + 0.5) seq = [H];
    else {
      let rest = H; while (rest > sh + 0.5) { seq.push(sh); rest -= sh; } seq.push(rest);
      if (rest < 300) { const k = 300 - rest; seq[seq.length - 2] -= k; seq[seq.length - 1] += k; }
      if ((i % 2 === 1) !== flip) seq.reverse();
    }
    let v = v0;
    for (const h of seq) {
      const p = { u: a, v, w: b - a, h, notches: [] };
      v += h;
      let covered = false;
      for (const hl of holes) {
        const ow = ov(p.u, p.u + p.w, hl.u0, hl.u1), oh = ov(p.v, p.v + p.h, hl.v0, hl.v1);
        if (ow <= 0.5 || oh <= 0.5) continue;
        if (ow >= p.w - 0.5 && oh >= p.h - 0.5) { covered = true; break; }
        p.notches.push({ u: Math.max(p.u, hl.u0) - p.u, v: Math.max(p.v, hl.v0) - p.v, w: ow, h: oh });
      }
      if (!covered && p.w > 5 && p.h > 5) pieces.push(p);
    }
  }
  return pieces;
}

// Parça alanı (çentikler düşülmüş), m²
export function pieceArea(p) {
  return (p.w * p.h - p.notches.reduce((s, n) => s + n.w * n.h, 0)) / 1e6;
}

/* Vida sayısı: dikme hatları (u) ve yatay hatlar (v) boyunca aralıklı vida. */
export function screwCount(p, uLines, vLines, pitch) {
  let n = 0;
  const inNotch = (uu, vv) => p.notches.some(q => uu > p.u + q.u - 1 && uu < p.u + q.u + q.w + 1 && vv > p.v + q.v - 1 && vv < p.v + q.v + q.h + 1);
  const seenU = new Set();
  for (const ul of uLines) {
    if (ul < p.u - 30 || ul > p.u + p.w + 30) continue;
    const uu = Math.min(Math.max(ul, p.u + 10), p.u + p.w - 10);
    const key = Math.round(uu / 20); if (seenU.has(key)) continue; seenU.add(key);
    const k = Math.max(1, Math.floor((p.h - 20) / pitch));
    for (let i = 0; i <= k; i++) { const vv = p.v + 10 + i * (p.h - 20) / k; if (!inNotch(uu, vv)) n++; }
  }
  for (const vl of vLines) {
    if (vl < p.v - 30 || vl > p.v + p.h + 30) continue;
    const vv = Math.min(Math.max(vl, p.v + 10), p.v + p.h - 10);
    const k = Math.max(1, Math.floor((p.w - 20) / pitch));
    for (let i = 1; i < k; i++) { const uu = p.u + 10 + i * (p.w - 20) / k; if (!inNotch(uu, vv)) n++; }
  }
  return n;
}

/* Derz uzunluğu (dış kat): bölge kenarına ve boşluk kenarına denk gelmeyen kenarlar, yarıya bölünür. */
export function jointLength(pieces, region, holes) {
  let L = 0;
  const onHole = (u0, u1, v0, v1) => holes.reduce((s, h) => {
    // kenar boşluğun içinden ya da sınırından geçiyorsa o kısım derz değildir
    if (u0 === u1 && u0 >= h.u0 - 1 && u0 <= h.u1 + 1) return s + ov(v0, v1, h.v0, h.v1);
    if (v0 === v1 && v0 >= h.v0 - 1 && v0 <= h.v1 + 1) return s + ov(u0, u1, h.u0, h.u1);
    return s;
  }, 0);
  for (const p of pieces) {
    const E = [[p.u, p.u, p.v, p.v + p.h], [p.u + p.w, p.u + p.w, p.v, p.v + p.h], [p.u, p.u + p.w, p.v, p.v], [p.u, p.u + p.w, p.v + p.h, p.v + p.h]];
    for (const [a0, a1, b0, b1] of E) {
      const vert = a0 === a1;
      if (vert && (Math.abs(a0 - region.u0) < 1 || Math.abs(a0 - region.u1) < 1)) continue;
      if (!vert && (Math.abs(b0 - region.v0) < 1 || Math.abs(b0 - region.v1) < 1)) continue;
      const len = vert ? b1 - b0 : a1 - a0;
      L += Math.max(0, len - onHole(a0, a1, b0, b1));
    }
  }
  return L / 2 / 1000; // m
}
