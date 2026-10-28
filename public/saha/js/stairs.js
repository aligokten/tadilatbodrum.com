/* ═══ Merdiven modülü: tipler, basamak geometrisi (plan + 3D), konfor hesabı ═══
   Yerel eksen: başlangıç kenarı (0,0)–(w,0), çıkış yönü +y. Dünya = döndür(rot) + öteleme(x, y).
   N rıht → N−1 basamak (son rıhtla üst kata çıkılır); sahanlık bir basamak sayılır. */
import { V, polyCentroid, pointInPoly, polyArea } from './plan-geom.js';

export const STAIR_TYPES = [
  { k: 'duz', t: 'Düz (tek kollu)' },
  { k: 'sahanlik', t: 'Düz, ara sahanlıklı' },
  { k: 'L', t: 'L dönüşlü (sahanlıklı)' },
  { k: 'Lbal', t: 'L dönüşlü, balanslı (sahanlıksız)' },
  { k: 'U', t: 'U dönüşlü (sahanlıklı)' },
  { k: 'Ubal', t: 'U dönüşlü, balanslı (sahanlıksız)' },
  { k: 'Uyuv', t: 'U dönüşlü, döner (yarım daire, sahanlıksız)' },
  { k: 'spiral', t: 'Döner (helezon)' },
];
export const STAIR_BUILD = [
  { k: 'beton', t: 'Betonarme (dolu)', c: '#CFCAC0' },
  { k: 'plak', t: 'Betonarme plak (kalınlık girilir)', c: '#CFCAC0' },
  { k: 'ahsap', t: 'Ahşap basamak', c: '#B98B5E' },
  { k: 'metal', t: 'Metal / açık basamak', c: '#8C9196' },
];
export const stairType = k => STAIR_TYPES.find(t => t.k === k) || STAIR_TYPES[0];
export const stairBuild = k => STAIR_BUILD.find(t => t.k === k) || STAIR_BUILD[0];

const hasLanding = t => t === 'sahanlik' || t === 'L' || t === 'U';
/* dönüşteki balanslı basamak sayısı (her biri 30°) */
const WIND = { Lbal: 3, Ubal: 6, Uyuv: 6 };
export const isU = t => t === 'U' || t === 'Ubal' || t === 'Uyuv';
export const winders = t => WIND[t] || 0;
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
  const extra = WIND[st.type] || (hasLanding(st.type) ? 1 : 0);   // dönüş / sahanlık basamakları
  const run = Math.max(0, T - extra);
  const n1 = st.type === 'duz' || st.type === 'spiral' ? T : Math.max(1, Math.min(run - 1, Math.round(st.n1) || Math.ceil(run / 2)));
  const n2 = st.type === 'duz' || st.type === 'spiral' ? 0 : run - n1;
  const land = Math.max(w, +st.land || 0);   // sahanlık derinliği (en az kol genişliği)
  const blondel = 2 * h + g;
  const gap = Math.max(0, +(st.gap ?? (st.type === 'Uyuv' ? 30 : 10)));   // U: kollar arası boşluk (göz)
  // balanslı basamağın yürüme çizgisindeki derinliği (30° yay)
  const gw = st.type === 'Lbal' ? Math.PI / 6 * w / 2 : st.type === 'Ubal' || st.type === 'Uyuv' ? Math.PI / 6 * (gap / 2 + w / 2) : 0;
  return { N, T, h, w, g, n1, n2, land, gap, gw, blondel, slope: Math.atan2(h, g) * 180 / Math.PI };
}

/* basamaklar: [{ pts (yerel), z (üst yüz kotu), land? }] + yürüme çizgisi */
export function stairLocal(st) {
  const P = stairParams(st), { w, g, h, n1, n2, land, gap } = P, steps = [];
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
  } else if (t === 'Ubal' || t === 'Uyuv') {
    // 180° dönüş, 6 balanslı basamak; merkez kollar arası boşluğun ortasında
    const ri = gap / 2, C = { x: w + ri, y: Y0 }, X1 = 2 * w + gap, Rw = ri + w / 2;
    const dir = a => ({ x: Math.cos(a * Math.PI / 180), y: Math.sin(a * Math.PI / 180) });
    const on = a => V.add(C, V.mul(dir(a), Rw));
    for (let i = 0; i < 6; i++) {
      const a0 = 180 - i * 30, a1 = a0 - 30;
      let pts;
      if (t === 'Uyuv') {   // yarım daire: iç ve dış yay arası halka dilimi
        const arc = (r, A, B) => { const k = Math.max(2, Math.ceil(Math.abs(B - A) / 6)), o = []; for (let j = 0; j <= k; j++) o.push(V.add(C, V.mul(dir(A + (B - A) * j / k), r))); return o; };
        pts = [...arc(ri + w, a0, a1), ...(ri > 0.5 ? arc(ri, a1, a0) : [C])];
      } else {   // köşeli: merkezden çıkan ışınlar dikdörtgenin dış kenarlarına
        const hitR = a => { const d = dir(a), ts = []; if (d.x < -1e-9) ts.push(-C.x / d.x); if (d.x > 1e-9) ts.push((X1 - C.x) / d.x); if (d.y > 1e-9) ts.push(w / d.y); return V.add(C, V.mul(d, Math.min(...ts))); };
        const cornerA = [[Math.atan2(w, -C.x) * 180 / Math.PI, { x: 0, y: Y0 + w }], [Math.atan2(w, X1 - C.x) * 180 / Math.PI, { x: X1, y: Y0 + w }]];
        const mid = cornerA.filter(([a]) => a < a0 - 1e-6 && a > a1 + 1e-6).sort((p, q) => q[0] - p[0]).map(c => c[1]);
        const inner = ri > 0.5 ? [V.add(C, V.mul(dir(a1), ri)), V.add(C, V.mul(dir(a0), ri))] : [C];
        pts = [hitR(a0), ...mid, hitR(a1), ...inner];
      }
      push(pts, 0, [on(a0 - 15)]);
    }
    for (let i = 0; i < n2; i++) push(R(w + gap, Y0 - (i + 1) * g, 2 * w + gap, Y0 - i * g));
  } else if (t === 'U') {
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

/* betonarme gövde: her basamağın alt yüzü (köşe başına kot) ve beton hacmi.
   dolu: alt yüz döşemede; plak: alt yüz basamak çizgisine paralel, eğime dik ölçülen kalınlık kadar aşağıda */
export function stairSolid(st) {
  const W = stairWorld(st), P = W.P, plak = st.build === 'plak';
  const t = Math.max(5, +st.slab || 15), tv = t / Math.cos(Math.atan2(P.h, P.g));   // düşey kalınlık
  let k = 1, vol = 0;
  const steps = W.steps.map(s => {
    const n = s.wk?.length || 1, prev = W.walk[k - 1], next = W.walk[Math.min(W.walk.length - 1, k + n)]; k += n;
    let bot;
    if (!plak) bot = s.pts.map(() => 0);
    else if (s.land) bot = s.pts.map(() => Math.max(0, s.z - tv));
    else {   // giriş kenarında bir önceki basamak kotundan, çıkışta bu basamak kotundan tv aşağıda
      const u = V.norm(V.sub(next, prev)), d = s.pts.map(p => V.dot(p, u)), d0 = Math.min(...d), d1 = Math.max(...d);
      bot = d.map(x => Math.max(0, s.z - P.h - tv + P.h * (d1 > d0 ? (x - d0) / (d1 - d0) : 1)));
    }
    const area = Math.abs(polyArea(s.pts));
    vol += area * (s.z - bot.reduce((a, b) => a + b, 0) / bot.length);
    return { ...s, bot };
  });
  return { steps, vol: vol / 1e6, t };   // m³
}

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
  if (P.gw && P.gw < P.g - 4) out.push(['warn', `Balanslı basamakların yürüme çizgisindeki derinliği ${fmt(P.gw)} cm — düz basamaklardan (${fmt(P.g)} cm) kısa; kol genişliğini${isU(st.type) ? ' ya da kollar arası boşluğu' : ''} artırın.`]);
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
