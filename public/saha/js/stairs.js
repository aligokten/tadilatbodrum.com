/* ═══ Merdiven modülü: tipler, basamak geometrisi (plan + 3D), konfor hesabı ═══
   Yerel eksen: başlangıç kenarı (0,0)–(w,0), çıkış yönü +y. Dünya = döndür(rot) + öteleme(x, y).
   N rıht → N−1 basamak (son rıhtla üst kata çıkılır); sahanlık bir basamak sayılır. */
import { V, polyCentroid, pointInPoly } from './plan-geom.js';

export const STAIR_TYPES = [
  { k: 'duz', t: 'Düz (tek kollu)' },
  { k: 'sahanlik', t: 'Düz, ara sahanlıklı' },
  { k: 'L', t: 'L dönüşlü (sahanlıklı)' },
  { k: 'Lbal', t: 'L dönüşlü, balanslı (sahanlıksız)' },
  { k: 'U', t: 'U dönüşlü (sahanlıklı)' },
  { k: 'spiral', t: 'Döner (helezon)' },
];
export const STAIR_BUILD = [
  { k: 'beton', t: 'Betonarme (dolu)', c: '#CFCAC0' },
  { k: 'ahsap', t: 'Ahşap basamak', c: '#B98B5E' },
  { k: 'metal', t: 'Metal / açık basamak', c: '#8C9196' },
];
export const stairType = k => STAIR_TYPES.find(t => t.k === k) || STAIR_TYPES[0];
export const stairBuild = k => STAIR_BUILD.find(t => t.k === k) || STAIR_BUILD[0];

const hasLanding = t => t === 'sahanlik' || t === 'L' || t === 'U';
/* rıht sayısı: kat yüksekliğinden ~17,5 cm rıhtla */
export const autoRisers = H => Math.max(3, Math.round(H / 17.5));

export function newStair(id, p, o = {}) {
  const H = o.H || 295, N = autoRisers(H);
  return { id, type: 'duz', x: p.x, y: p.y, rot: 0, w: 100, H, N, g: 28, n1: 0, turn: 'R', land: 0, col: 20, sweep: 0, build: 'beton', ...o };
}

/* parametreler: rıht yüksekliği, basamak sayıları, kol uzunlukları */
export function stairParams(st) {
  const N = Math.max(3, Math.round(st.N) || autoRisers(st.H)), T = N - 1, h = st.H / N;
  const w = Math.max(50, +st.w || 100), g = Math.max(15, +st.g || 28);
  const extra = st.type === 'Lbal' ? 3 : hasLanding(st.type) ? 1 : 0;   // dönüş / sahanlık basamakları
  const run = Math.max(0, T - extra);
  const n1 = st.type === 'duz' || st.type === 'spiral' ? T : Math.max(1, Math.min(run - 1, Math.round(st.n1) || Math.ceil(run / 2)));
  const n2 = st.type === 'duz' || st.type === 'spiral' ? 0 : run - n1;
  const land = Math.max(w, +st.land || 0);   // sahanlık derinliği (en az kol genişliği)
  const blondel = 2 * h + g;
  return { N, T, h, w, g, n1, n2, land, blondel, slope: Math.atan2(h, g) * 180 / Math.PI };
}

/* basamaklar: [{ pts (yerel), z (üst yüz kotu), land? }] + yürüme çizgisi */
export function stairLocal(st) {
  const P = stairParams(st), { w, g, h, n1, n2, land } = P, steps = [];
  const R = (x0, y0, x1, y1) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
  const push = (pts, k, wk) => steps.push({ pts, z: (steps.length + 1) * h, land: !!k, wk });   // wk: yürüme çizgisi noktaları (yoksa ağırlık merkezi)
  const t = st.type;
  if (t === 'spiral') {
    const r0 = Math.max(5, (+st.col || 20) / 2), r1 = r0 + w, sweep = +st.sweep > 0 ? +st.sweep : Math.min(400, Math.max(270, P.T * 22));
    const da = sweep / P.T * Math.PI / 180, dir = st.turn === 'L' ? -1 : 1;
    const C = { x: r1, y: r1 };   // tıklanan nokta dış çemberi saran karenin köşesi; başlangıç kenarı merkezin solunda
    for (let i = 0; i < P.T; i++) {
      const A = i * da, B = (i + 1) * da, arc = [];
      const k = Math.max(2, Math.ceil((B - A) / 0.12));
      for (let j = 0; j <= k; j++) arc.push(rot2(C, r1, A + (B - A) * j / k, dir));
      const inner = []; for (let j = k; j >= 0; j--) inner.push(rot2(C, r0, A + (B - A) * j / k, dir));
      push([...arc, ...inner]);
    }
    const rm = (r0 + r1) / 2, walk = [];
    for (let j = 0; j <= 48; j++) walk.push(rot2(C, rm, sweep * Math.PI / 180 * j / 48, dir));
    return { steps, walk, P: { ...P, sweep, r0, r1, C } };
  }
  // 1. kol (+y yönünde)
  for (let i = 0; i < n1; i++) push(R(0, i * g, w, (i + 1) * g));
  const Y0 = n1 * g;
  if (t === 'sahanlik') {
    push(R(0, Y0, w, Y0 + land), 1);
    for (let i = 0; i < n2; i++) push(R(0, Y0 + land + i * g, w, Y0 + land + (i + 1) * g));
  } else if (t === 'L') {
    push(R(0, Y0, w, Y0 + w), 1);
    for (let i = 0; i < n2; i++) push(R(w + i * g, Y0, w + (i + 1) * g, Y0 + w));
  } else if (t === 'Lbal') {
    const k = w * Math.tan(Math.PI / 6), C = { x: w, y: Y0 }, on = a => [V.add(C, V.mul({ x: Math.cos(a * Math.PI / 180), y: Math.sin(a * Math.PI / 180) }, w / 2))];
    push([C, { x: 0, y: Y0 }, { x: 0, y: Y0 + k }], 0, on(165));
    push([C, { x: 0, y: Y0 + k }, { x: 0, y: Y0 + w }, { x: w - k, y: Y0 + w }], 0, on(135));
    push([C, { x: w - k, y: Y0 + w }, { x: w, y: Y0 + w }], 0, on(105));
    for (let i = 0; i < n2; i++) push(R(w + i * g, Y0, w + (i + 1) * g, Y0 + w));
  } else if (t === 'U') {
    const gap = 10;
    push(R(0, Y0, 2 * w + gap, Y0 + land), 1, [{ x: w / 2, y: Y0 + w / 2 }, { x: 1.5 * w + gap, y: Y0 + w / 2 }]);
    for (let i = 0; i < n2; i++) push(R(w + gap, Y0 - (i + 1) * g, 2 * w + gap, Y0 - i * g));
  } else {
    for (let i = n1; i < P.T; i++) push(R(0, i * g, w, (i + 1) * g));
  }
  // sola dönüşte x aynalanır (başlangıç kenarı yerinde kalır)
  steps.forEach(s => { s.wk ||= [polyCentroid(s.pts)]; });
  if (st.turn === 'L' && t !== 'duz' && t !== 'sahanlik') steps.forEach(s => { s.pts = s.pts.map(p => ({ x: w - p.x, y: p.y })).reverse(); s.wk = s.wk.map(p => ({ x: w - p.x, y: p.y })); });
  // yürüme çizgisi: başlangıç kenarının ortası → basamak ağırlık merkezleri → son basamağın ötesi
  const cs = steps.flatMap(s => s.wk);
  const first = { x: w / 2, y: 0 };
  const last = cs.at(-1), prev = cs.at(-2) || first, u = V.norm(V.sub(last, prev));
  const walk = [first, ...cs, V.add(last, V.mul(u, g / 2))];
  return { steps, walk, P };
}
function rot2(C, r, a, dir) { return { x: C.x - r * Math.cos(a), y: C.y + r * Math.sin(a) * dir }; }

/* yerel → dünya */
export function stairXf(st) {
  const a = (st.rot || 0) * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  return p => ({ x: st.x + p.x * c - p.y * s, y: st.y + p.x * s + p.y * c });
}
export function stairWorld(st) {
  const L = stairLocal(st), f = stairXf(st);
  return { ...L, steps: L.steps.map(s => ({ ...s, pts: s.pts.map(f) })), walk: L.walk.map(f) };
}
export function stairHit(st, p) { return stairWorld(st).steps.some(s => pointInPoly(p, s.pts)); }
export function stairBounds(st) { return stairWorld(st).steps.flatMap(s => s.pts); }

/* plan çizimi (dünya koordinatı); px: ekran pikselini çizim birimine çevirir */
export function stairSvg(st, px, sel = false) {
  const W = stairWorld(st), b = stairBuild(st.build);
  let o = `<g class="stair${sel ? ' sel' : ''}">`;
  for (const s of W.steps) o += `<polygon points="${s.pts.map(p => `${p.x},${p.y}`).join(' ')}" fill="${s.land ? '#EFEBE4' : '#F7F4EE'}" stroke="#4A4F57" stroke-width="${px(1.1)}"/>`;
  if (st.type === 'spiral') { const P = W.P, c = stairXf(st)(P.C); o += `<circle cx="${c.x}" cy="${c.y}" r="${P.r0}" fill="${b.c}" stroke="#4A4F57" stroke-width="${px(1.1)}"/>`; }
  // yürüme çizgisi + çıkış oku
  const w = W.walk, e = w.at(-1), q = w.at(-2), u = V.norm(V.sub(e, q)), n = { x: -u.y, y: u.x }, ah = Math.min(18, stairParams(st).w * 0.18);
  o += `<polyline points="${w.map(p => `${p.x},${p.y}`).join(' ')}" fill="none" stroke="#EB591F" stroke-width="${px(1.6)}"/>`;
  o += `<circle cx="${w[0].x}" cy="${w[0].y}" r="${px(4)}" fill="#fff" stroke="#EB591F" stroke-width="${px(1.6)}"/>`;
  const A = V.sub(e, V.mul(u, ah)), B = V.add(A, V.mul(n, ah * 0.5)), C = V.sub(A, V.mul(n, ah * 0.5));
  o += `<polygon points="${e.x},${e.y} ${B.x},${B.y} ${C.x},${C.y}" fill="#EB591F"/>`;
  // bilgi: rıht sayısı × yükseklik / basamak genişliği
  const P = stairParams(st), mid = W.steps[Math.floor(W.steps.length / 2)], c = polyCentroid(mid.pts);
  o += `<text x="${c.x}" y="${c.y}" font-size="${px(11)}" text-anchor="middle" dominant-baseline="middle" fill="#2B2F35" font-family="Inter,Arial,sans-serif" font-weight="700" paint-order="stroke" stroke="#fff" stroke-width="${px(3)}">${P.N}R ${fmt(P.h)}/${fmt(P.g)}</text>`;
  return o + '</g>';
}
const fmt = n => (Math.round(n * 10) / 10).toLocaleString('tr-TR');

/* konfor değerlendirmesi (Blondel: 2h + g ≈ 60–65 cm; rıht 15–19 cm; eğim) */
export function stairCheck(st) {
  const P = stairParams(st), out = [];
  if (P.h > 19) out.push(['err', `Rıht yüksekliği ${fmt(P.h)} cm — konut merdiveninde en fazla 18–19 cm önerilir; rıht sayısını artırın.`]);
  else if (P.h < 14) out.push(['warn', `Rıht yüksekliği ${fmt(P.h)} cm çok düşük; rıht sayısını azaltın.`]);
  if (P.blondel < 59 || P.blondel > 66) out.push(['warn', `2h + g = ${fmt(P.blondel)} cm — rahat adım için 60–65 cm aralığı önerilir.`]);
  if (P.w < 90 && st.type !== 'spiral') out.push(['warn', `Kol genişliği ${fmt(P.w)} cm — konut iç merdiveninde en az 90–100 cm önerilir.`]);
  if (st.type === 'spiral' && P.w < 70) out.push(['warn', 'Döner merdivende basamak boyu en az 70 cm önerilir.']);
  if (!out.length) out.push(['ok', 'Ölçüler konforlu aralıkta.']);
  return out;
}

/* tip seçicisi için küçük önizleme */
export function stairSvgIcon(k) {
  const L = stairLocal(newStair('i', { x: 0, y: 0 }, { type: k, H: 280, N: 16 }));
  const xs = L.steps.flatMap(s => s.pts.map(p => p.x)), ys = L.steps.flatMap(s => s.pts.map(p => p.y));
  const x0 = Math.min(...xs), y0 = Math.min(...ys), W = Math.max(...xs) - x0, H = Math.max(...ys) - y0, pad = Math.max(W, H) * 0.06;
  const sw = Math.max(W, H) / 40;
  // ekranda çıkış yukarı doğru görünsün: y ters çevrilir
  const T = p => `${p.x},${-p.y}`;
  return `<svg viewBox="${x0 - pad} ${-(y0 + H) - pad} ${W + 2 * pad} ${H + 2 * pad}" width="44" height="44">${L.steps.map(s => `<polygon points="${s.pts.map(T).join(' ')}" fill="${s.land ? '#E6E1D8' : '#fff'}" stroke="currentColor" stroke-width="${sw}"/>`).join('')}<polyline points="${L.walk.map(T).join(' ')}" fill="none" stroke="#EB591F" stroke-width="${sw * 1.6}"/></svg>`;
}
