/* ═══ Plan geometrisi — birim: cm, 2D'de y aşağı ═══ */
import { uid } from './store.js';

export function emptyPlan() {
  return { v: 1, walls: [], openings: [], rooms: [], items: [], dims: [], labels: [],
    meta: { wallH: 280, wallT: 15, wallColor: '#F7F5F0', bg: null } };
}

export const V = {
  add: (a, b) => ({ x: a.x + b.x, y: a.y + b.y }),
  sub: (a, b) => ({ x: a.x - b.x, y: a.y - b.y }),
  mul: (a, k) => ({ x: a.x * k, y: a.y * k }),
  dot: (a, b) => a.x * b.x + a.y * b.y,
  cross: (a, b) => a.x * b.y - a.y * b.x,
  len: a => Math.hypot(a.x, a.y),
  dist: (a, b) => Math.hypot(a.x - b.x, a.y - b.y),
  norm: a => { const l = Math.hypot(a.x, a.y) || 1; return { x: a.x / l, y: a.y / l }; },
  eq: (a, b, e = 0.5) => Math.abs(a.x - b.x) < e && Math.abs(a.y - b.y) < e,
  lerp: (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }),
};

export const wallLen = w => V.dist(w.a, w.b);
export const wallDir = w => V.norm(V.sub(w.b, w.a));
export const wallNormal = w => { const u = wallDir(w); return { x: -u.y, y: u.x }; };

/* noktanın doğru parçasına izdüşümü: { p, t (0..1), d (uzaklık) } */
export function projSeg(p, a, b) {
  const ab = V.sub(b, a), l2 = V.dot(ab, ab) || 1;
  const t = Math.max(0, Math.min(1, V.dot(V.sub(p, a), ab) / l2));
  const q = V.add(a, V.mul(ab, t));
  return { p: q, t, d: V.dist(p, q) };
}

export function polyArea(pts) {
  let s = 0;
  for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; s += a.x * b.y - b.x * a.y; }
  return s / 2;
}
export function polyPerim(pts) {
  let s = 0;
  for (let i = 0; i < pts.length; i++) s += V.dist(pts[i], pts[(i + 1) % pts.length]);
  return s;
}
export function polyCentroid(pts) {
  const A = polyArea(pts);
  if (Math.abs(A) < 1e-6) return pts.reduce((c, p) => ({ x: c.x + p.x / pts.length, y: c.y + p.y / pts.length }), { x: 0, y: 0 });
  let cx = 0, cy = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length], f = a.x * b.y - b.x * a.y;
    cx += (a.x + b.x) * f; cy += (a.y + b.y) * f;
  }
  return { x: cx / (6 * A), y: cy / (6 * A) };
}
export function pointInPoly(p, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], b = pts[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/* çokgeni d kadar içe (d>0) / dışa (d<0) öteler — basit (kendini kesmeyen) çokgenler için */
export function offsetPoly(pts, d) {
  const n = pts.length, ccw = polyArea(pts) > 0 ? 1 : -1;
  const lines = pts.map((a, i) => {
    const b = pts[(i + 1) % n], u = V.norm(V.sub(b, a));
    const nrm = { x: -u.y * ccw, y: u.x * ccw }; // içe doğru normal (y-aşağı ekran sisteminde)
    return { p: V.add(a, V.mul(nrm, d)), u };
  });
  return lines.map((L, i) => {
    const P = lines[(i - 1 + n) % n];
    const den = V.cross(P.u, L.u);
    if (Math.abs(den) < 1e-9) return L.p;
    const t = V.cross(V.sub(L.p, P.p), L.u) / den;
    return V.add(P.p, V.mul(P.u, t));
  });
}

/* oda için metraj: zemin alanı, çevre, net duvar alanı (açıklıklar düşülür) */
export function roomMetrics(plan, room) {
  const area = Math.abs(polyArea(room.pts)) / 1e4;
  const perim = polyPerim(room.pts) / 100;
  const h = (room.h || plan.meta.wallH) / 100;
  let openA = 0;
  for (const o of plan.openings) {
    const w = plan.walls.find(x => x.id === o.wallId); if (!w) continue;
    const c = V.add(w.a, V.mul(wallDir(w), o.pos));
    let near = false;
    for (let i = 0; i < room.pts.length && !near; i++)
      near = projSeg(c, room.pts[i], room.pts[(i + 1) % room.pts.length]).d <= (w.t || plan.meta.wallT) * 0.75 + 2;
    if (near) openA += (o.w / 100) * Math.min(h, (o.h || 0) / 100);
  }
  return { area, perim, h, wallArea: Math.max(0, perim * h - openA), ceil: area };
}

export function planMetrics(plan) {
  if (!plan) return { rooms: [], floor: 0, wall: 0, ceil: 0, perim: 0 };
  const rooms = plan.rooms.map(r => ({ id: r.id, name: r.name, floor: r.floor, ...roomMetrics(plan, r) }));
  const sum = k => rooms.reduce((s, r) => s + r[k], 0);
  return { rooms, floor: sum('area'), wall: sum('wallArea'), ceil: sum('ceil'), perim: sum('perim') };
}

export function planBounds(plan) {
  const pts = [];
  plan.walls.forEach(w => { pts.push(w.a, w.b); });
  plan.rooms.forEach(r => pts.push(...r.pts));
  plan.items.forEach(i => { const R = Math.hypot(i.w, i.d) / 2; pts.push({ x: i.x - R, y: i.y - R }, { x: i.x + R, y: i.y + R }); });
  plan.labels.forEach(l => pts.push({ x: l.x, y: l.y }));
  if (!pts.length) return null;
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

/* dikdörtgen oda + (iç yüzü odaya hizalı) 4 duvar */
export function rectRoom(plan, x0, y0, w, l, name = 'Oda') {
  const t = plan.meta.wallT;
  const room = { id: uid('r'), name, rect: true, pts: rectPts(x0, y0, w, l), floor: 'parke', wallColor: '', h: 0, walls: [] };
  room.walls = rectWallSegs(x0, y0, w, l, t).map(([a, b]) => {
    if (plan.walls.some(ex => covers(ex, a, b))) return null; // ortak duvarı tekrar oluşturma
    const wl = { id: uid('w'), a, b, t, h: 0 };
    plan.walls.push(wl);
    return wl.id;
  });
  plan.rooms.push(room);
  return room;
}
export const rectPts = (x0, y0, w, l) => [{ x: x0, y: y0 }, { x: x0 + w, y: y0 }, { x: x0 + w, y: y0 + l }, { x: x0, y: y0 + l }];
export function rectWallSegs(x0, y0, w, l, t) {
  const X0 = x0 - t / 2, Y0 = y0 - t / 2, X1 = x0 + w + t / 2, Y1 = y0 + l + t / 2;
  return [[{ x: X0, y: Y0 }, { x: X1, y: Y0 }], [{ x: X1, y: Y0 }, { x: X1, y: Y1 }], [{ x: X1, y: Y1 }, { x: X0, y: Y1 }], [{ x: X0, y: Y1 }, { x: X0, y: Y0 }]];
}
/* var olan duvar a-b parçasını (aynı doğru üzerinde) tamamen kapsıyor mu? */
function covers(w, a, b) {
  const pa = projSeg(a, w.a, w.b), pb = projSeg(b, w.a, w.b);
  return pa.d < 1.5 && pb.d < 1.5 && Math.abs(V.dot(wallDir(w), V.norm(V.sub(b, a)))) > 0.999;
}

/* çokgen oda + dış yüzünde duvarlar */
export function polyRoom(plan, pts, name = 'Oda', withWalls = true) {
  const t = plan.meta.wallT;
  const room = { id: uid('r'), name, pts: pts.map(p => ({ ...p })), floor: 'parke', wallColor: '', h: 0, walls: [] };
  if (withWalls && pts.length >= 3) {
    const out = offsetPoly(pts, -t / 2);
    room.walls = out.map((a, i) => {
      const b = out[(i + 1) % out.length];
      if (plan.walls.some(ex => covers(ex, a, b))) return null;
      const wl = { id: uid('w'), a: { ...a }, b: { ...b }, t, h: 0 };
      plan.walls.push(wl); return wl.id;
    });
  }
  plan.rooms.push(room);
  return room;
}
