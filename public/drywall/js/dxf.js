/* SAGG Drywall+ — DXF (R12 ASCII) dışa aktarımı. Çizim ilkelleri mm, y ekseni yukarı çevrilir. */
const LAYER_BY_COLOR = c => !c ? 'CIZIM' : /c2410c/i.test(c) ? 'OLCU' : 'CIZIM';

export function toDXF(sheets) {
  const out = ['0', 'SECTION', '2', 'ENTITIES'];
  const ent = (type, layer, pairs) => { out.push('0', type, '8', layer); for (const [k, v] of pairs) out.push(String(k), String(v)); };
  const ln = (x0, y0, x1, y1, layer) => ent('LINE', layer, [[10, x0], [20, -y0], [30, 0], [11, x1], [21, -y1], [31, 0]]);
  let ox = 0;
  for (const S of sheets) {
    const bb = S.bbox();
    const dx = ox - bb[0];
    for (const p of S.prims) {
      const layer = p.t === 'text' ? (/c2410c/i.test(p.color || '') ? 'OLCU' : 'YAZI') : p.fill === '#2d8fa3' ? 'PROFIL_C' : p.fill === '#7a8a99' ? 'PROFIL_U' : p.fill === '#d4692a' ? 'PROFIL_TAKVIYE' : LAYER_BY_COLOR(p.stroke);
      if (p.t === 'rect') { ln(p.x0 + dx, p.y0, p.x1 + dx, p.y0, layer); ln(p.x1 + dx, p.y0, p.x1 + dx, p.y1, layer); ln(p.x1 + dx, p.y1, p.x0 + dx, p.y1, layer); ln(p.x0 + dx, p.y1, p.x0 + dx, p.y0, layer); }
      else if (p.t === 'line') ln(p.x0 + dx, p.y0, p.x1 + dx, p.y1, layer);
      else if (p.t === 'circle') ent('CIRCLE', 'SPOT', [[10, p.x + dx], [20, -p.y], [30, 0], [40, p.r]]);
      else if (p.t === 'path') {
        // yalnız M/h/v/z içeren yollar (levha parçaları) çizgiye çevrilir
        let x = 0, y = 0, sx = 0, sy = 0;
        for (const [, c, a] of p.d.matchAll(/([MhvzHVL])\s*([-\d.]*(?:\s+[-\d.]+)?)/g)) {
          const n = a.trim().split(/\s+/).map(Number);
          if (c === 'M') { x = sx = n[0]; y = sy = n[1]; }
          else if (c === 'h') { ln(x + dx, y, x + n[0] + dx, y, layer); x += n[0]; }
          else if (c === 'v') { ln(x + dx, y, x + dx, y + n[0], layer); y += n[0]; }
          else if (c === 'z') { ln(x + dx, y, sx + dx, sy, layer); x = sx; y = sy; }
        }
      } else if (p.t === 'text') {
        const s = String(p.s).replace(/[çÇğĞıİöÖşŞüÜ]/g, ch => ({ ç: 'c', Ç: 'C', ğ: 'g', Ğ: 'G', ı: 'i', İ: 'I', ö: 'o', Ö: 'O', ş: 's', Ş: 'S', ü: 'u', Ü: 'U' }[ch])).replace(/[^\x20-\x7e]/g, '');
        const al = p.anchor === 'start' ? 0 : p.anchor === 'end' ? 2 : 1;
        ent('TEXT', layer, [[10, p.x + dx], [20, -p.y], [30, 0], [40, p.fs * 0.8], [1, s], [50, -(p.rot || 0)], [72, al], [11, p.x + dx], [21, -p.y], [31, 0]]);
      }
    }
    ox += bb[2] - bb[0] + 600;
  }
  out.push('0', 'ENDSEC', '0', 'EOF');
  return out.join('\n');
}
