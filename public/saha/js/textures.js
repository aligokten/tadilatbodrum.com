/* ═══ Prosedürel zemin dokuları (canvas) — harici görsel gerekmez ═══
 * Her doku "m" metre × "m" metre alanı temsil eder; zemin UV'leri metre cinsindendir.
 */
const rnd = (a, b) => a + Math.random() * (b - a);
function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const f = c => Math.max(0, Math.min(255, Math.round(c * k)));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}
function noise(ctx, S, amt, alpha = 0.06) {
  const d = ctx.getImageData(0, 0, S, S), p = d.data;
  for (let i = 0; i < p.length; i += 4) { const n = (Math.random() - 0.5) * amt; p[i] += n; p[i + 1] += n; p[i + 2] += n; }
  ctx.putImageData(d, 0, 0);
}

function planks(ctx, S, base, rows, light) {
  const rh = S / rows;
  for (let r = 0; r < rows; r++) {
    let x = -rnd(0, S * 0.6);
    while (x < S) {
      const L = rnd(S * 0.45, S * 0.9);
      ctx.fillStyle = shade(base, rnd(0.86, 1.12));
      ctx.fillRect(x, r * rh, L, rh);
      ctx.strokeStyle = `rgba(60,35,15,${light ? 0.08 : 0.14})`;
      for (let g = 0; g < 9; g++) {
        ctx.lineWidth = rnd(0.6, 1.8);
        ctx.beginPath();
        const y = r * rh + rnd(2, rh - 2);
        ctx.moveTo(x, y);
        ctx.bezierCurveTo(x + L * 0.3, y + rnd(-4, 4), x + L * 0.7, y + rnd(-4, 4), x + L, y + rnd(-3, 3));
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(40,25,10,0.35)';
      ctx.fillRect(x, r * rh, 2, rh);
      x += L;
    }
    ctx.fillStyle = 'rgba(40,25,10,0.3)';
    ctx.fillRect(0, r * rh, S, 1.5);
  }
}

function tiles(ctx, S, base, nx, ny, grout, vary = 0.04, marble = false) {
  ctx.fillStyle = grout; ctx.fillRect(0, 0, S, S);
  const tw = S / nx, th = S / ny, g = 3;
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
    ctx.fillStyle = shade(base, rnd(1 - vary, 1 + vary));
    ctx.fillRect(i * tw + g / 2, j * th + g / 2, tw - g, th - g);
    if (marble) veins(ctx, i * tw, j * th, tw, th, 4);
  }
}

function veins(ctx, x0, y0, w, h, n) {
  ctx.save();
  ctx.beginPath(); ctx.rect(x0, y0, w, h); ctx.clip();
  ctx.filter = 'blur(1.2px)';
  for (let i = 0; i < n; i++) {
    ctx.strokeStyle = `rgba(120,120,125,${rnd(0.12, 0.35)})`;
    ctx.lineWidth = rnd(0.6, 2.5);
    ctx.beginPath();
    let x = x0 + rnd(0, w), y = y0;
    ctx.moveTo(x, y);
    for (let k = 0; k < 6; k++) { x += rnd(-w * 0.25, w * 0.25); y += h / 6; ctx.lineTo(x, y); }
    ctx.stroke();
  }
  ctx.restore();
}

const GEN = {
  parke:    { m: 1.2, f: (c, S) => planks(c, S, '#B98A5E', 7) },
  laminat:  { m: 1.4, f: (c, S) => planks(c, S, '#D6B994', 7, true) },
  seramik:  { m: 1.2, f: (c, S) => tiles(c, S, '#E6E2DB', 2, 2, '#C9C4BC', 0.02) },
  mermer:   { m: 1.6, f: (c, S) => tiles(c, S, '#F3F1EC', 2, 2, '#DAD6CF', 0.02, true) },
  traverten: { m: 1.2, f: (c, S) => { tiles(c, S, '#DCCBB0', 2, 3, '#C8B494', 0.06); c.globalAlpha = 0.25; for (let i = 0; i < 160; i++) { c.fillStyle = shade('#B89E78', rnd(0.8, 1.1)); c.fillRect(rnd(0, S), rnd(0, S), rnd(10, 60), rnd(1, 3)); } c.globalAlpha = 1; } },
  beton:    { m: 2, f: (c, S) => { c.fillStyle = '#A9A7A3'; c.fillRect(0, 0, S, S); for (let i = 0; i < 90; i++) { const g = c.createRadialGradient(rnd(0, S), rnd(0, S), 0, rnd(0, S), rnd(0, S), rnd(40, 160)); g.addColorStop(0, `rgba(${Math.random() > .5 ? '255,255,255' : '60,60,60'},0.06)`); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(0, 0, S, S); } } },
  hali:     { m: 1, f: (c, S) => { c.fillStyle = '#8C8F99'; c.fillRect(0, 0, S, S); } , n: 30 },
  dis:      { m: 1.5, f: (c, S) => { c.fillStyle = '#A99A80'; c.fillRect(0, 0, S, S); let y = 0; while (y < S) { const hh = rnd(S / 7, S / 4); let x = -rnd(0, 80); while (x < S) { const ww = rnd(S / 6, S / 3); c.fillStyle = shade('#C9B79A', rnd(0.85, 1.12)); c.fillRect(x + 3, y + 3, ww - 6, hh - 6); x += ww; } y += hh; } } },
};

const cache = new Map();
export function floorTexture(THREE, k) {
  if (cache.has(k)) return cache.get(k);
  const g = GEN[k] || GEN.parke, S = 1024;
  const cv = document.createElement('canvas'); cv.width = cv.height = S;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  g.f(ctx, S);
  noise(ctx, S, g.n || 10);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1 / g.m, 1 / g.m);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  const r = { map: t, rough: { parke: 0.55, laminat: 0.6, seramik: 0.35, mermer: 0.18, traverten: 0.7, beton: 0.8, hali: 1, dis: 0.9 }[k] ?? 0.6 };
  cache.set(k, r);
  return r;
}
