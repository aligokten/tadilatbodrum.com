/* ═══ Elektrik ve sıhhi tesisat donatıları ═══
 * Mobilya gibi eklenir; planda gerçek boyut yerine okunaklı mimari sembol (w × d sembol kutusu) çizilir,
 * 3D'de gerçek boyutlu küçük model oluşturulur.
 * Yerel eksen: arka yüz (duvar) y = -d/2, ön yüz +y. mount: wall = duvara yaslanır ve döner,
 * floor = döşemede, ceil = tavanda (yükseklik plandan alınır).
 * cnt: teklif metrajı — elec (priz/anahtar noktası), light (aydınlatma), plumb (tesisat noktası).
 */

const E = '#EB591F', P = '#1E7FD8', HOT = '#E5484D', COLD = '#1E7FD8';

export const FIXTURE_GROUPS = [['elektrik', 'Elektrik'], ['sihhi', 'Sıhhi tesisat']];

export const FIXTURES = [
  { g: 'elektrik', k: 'priz', ab: 'P',      t: 'Priz (topraklı)',            w: 22, d: 14, h: 8,  z: 40,  mount: 'wall', cnt: 'elec' },
  { g: 'elektrik', k: 'ciftpriz', ab: 'P2',  t: 'İkili priz',                 w: 32, d: 14, h: 8,  z: 40,  mount: 'wall', cnt: 'elec' },
  { g: 'elektrik', k: 'etanjpriz', ab: 'PE', t: 'Etanj priz (ıslak hacim)',   w: 22, d: 14, h: 8,  z: 120, mount: 'wall', cnt: 'elec' },
  { g: 'elektrik', k: 'tezgahpriz', ab: 'PT', t: 'Tezgah üstü priz',          w: 22, d: 14, h: 8,  z: 110, mount: 'wall', cnt: 'elec' },
  { g: 'elektrik', k: 'kuvvet', ab: 'K',    t: 'Kuvvet hattı (fırın / ocak / klima)', w: 24, d: 14, h: 8, z: 40, mount: 'wall', cnt: 'elec' },
  { g: 'elektrik', k: 'datapriz', ab: 'RJ',  t: 'Data / telefon prizi (RJ45)', w: 22, d: 14, h: 8, z: 40,  mount: 'wall', cnt: 'elec' },
  { g: 'elektrik', k: 'tvpriz', ab: 'TV',    t: 'TV / uydu prizi',            w: 22, d: 14, h: 8,  z: 40,  mount: 'wall', cnt: 'elec' },
  { g: 'elektrik', k: 'anahtar', ab: 'A',   t: 'Anahtar (tekli)',            w: 20, d: 14, h: 8,  z: 110, mount: 'wall', cnt: 'elec' },
  { g: 'elektrik', k: 'komutator', ab: 'AK', t: 'Komütatör (ikili anahtar)',  w: 20, d: 14, h: 8,  z: 110, mount: 'wall', cnt: 'elec' },
  { g: 'elektrik', k: 'vavien', ab: 'AV',    t: 'Vaviyen anahtar',            w: 20, d: 14, h: 8,  z: 110, mount: 'wall', cnt: 'elec' },
  { g: 'elektrik', k: 'dimmer', ab: 'AD',    t: 'Dimmer',                     w: 20, d: 14, h: 8,  z: 110, mount: 'wall', cnt: 'elec' },
  { g: 'elektrik', k: 'sigorta', ab: 'SB',   t: 'Sigorta kutusu (dağıtım panosu)', w: 40, d: 14, h: 45, z: 150, mount: 'wall' },
  { g: 'elektrik', k: 'buat', ab: 'B',      t: 'Buat (ek kutusu)',           w: 14, d: 14, h: 8,  z: 230, mount: 'wall' },
  { g: 'elektrik', k: 'diafon', ab: 'DF',    t: 'Diafon / görüntülü diafon',  w: 20, d: 14, h: 22, z: 140, mount: 'wall', cnt: 'elec' },
  { g: 'elektrik', k: 'termostat', ab: 'TS', t: 'Oda termostatı',             w: 18, d: 14, h: 10, z: 150, mount: 'wall', cnt: 'elec' },
  { g: 'elektrik', k: 'aplik', ab: 'AP',     t: 'Aplik',                      w: 26, d: 16, h: 22, z: 190, mount: 'wall', cnt: 'light' },
  { g: 'elektrik', k: 'tavanlamba', ab: 'L', t: 'Tavan armatürü',            w: 34, d: 34, h: 8,  mount: 'ceil', cnt: 'light' },
  { g: 'elektrik', k: 'avizenokta', ab: 'AZ', t: 'Avize çıkışı',              w: 30, d: 30, h: 4,  mount: 'ceil', cnt: 'light' },
  { g: 'elektrik', k: 'spot', ab: 'S',      t: 'Spot (gömme)',               w: 16, d: 16, h: 2,  mount: 'ceil', cnt: 'light' },
  { g: 'elektrik', k: 'ledserit', ab: 'LED',  t: 'LED şerit (gizli ışık)',     w: 120, d: 8, h: 2,  mount: 'ceil', cnt: 'light' },
  { g: 'elektrik', k: 'duman', ab: 'DD',     t: 'Duman / gaz dedektörü',      w: 18, d: 18, h: 4,  mount: 'ceil' },
  { g: 'sihhi', k: 'yersifonu', ab: 'YS',  t: 'Yer sifonu',                   w: 20, d: 20, h: 1,  mount: 'floor', cnt: 'plumb' },
  { g: 'sihhi', k: 'lineer', ab: 'LS',     t: 'Lineer (kanal) sifon',         w: 80, d: 10, h: 1,  mount: 'floor', cnt: 'plumb' },
  { g: 'sihhi', k: 'pissu50', ab: 'G50',    t: 'Pis su gideri Ø50 (lavabo / evye / makine)', w: 14, d: 14, h: 5, mount: 'floor', cnt: 'plumb' },
  { g: 'sihhi', k: 'pissu100', ab: 'G100',   t: 'Pis su gideri Ø100 (klozet)',  w: 20, d: 20, h: 5,  mount: 'floor', cnt: 'plumb' },
  { g: 'sihhi', k: 'temizsu', ab: 'SK',    t: 'Temiz su çıkışı (sıcak + soğuk)', w: 26, d: 14, h: 6, z: 55, mount: 'wall', cnt: 'plumb' },
  { g: 'sihhi', k: 'soguksu', ab: 'SS',    t: 'Soğuk su çıkışı (rezervuar / makine)', w: 16, d: 14, h: 6, z: 25, mount: 'wall', cnt: 'plumb' },
  { g: 'sihhi', k: 'musluk', ab: 'M',     t: 'Musluk (ara / duvar musluğu)', w: 18, d: 16, h: 8,  z: 60, mount: 'wall', cnt: 'plumb' },
  { g: 'sihhi', k: 'batarya', ab: 'BT',    t: 'Batarya (sıva üstü, banyo / duş)', w: 30, d: 16, h: 10, z: 100, mount: 'wall', cnt: 'plumb' },
  { g: 'sihhi', k: 'ankastre', ab: 'DB',   t: 'Ankastre duş bataryası + tepe duşu', w: 30, d: 16, h: 110, z: 100, mount: 'wall', cnt: 'plumb' },
  { g: 'sihhi', k: 'bahcemusluk', ab: 'BM', t: 'Bahçe / balkon musluğu',      w: 18, d: 16, h: 8,  z: 60, mount: 'wall', cnt: 'plumb' },
  { g: 'sihhi', k: 'makinebag', ab: 'MB',  t: 'Makine bağlantısı (vana + gider)', w: 32, d: 14, h: 10, z: 60, mount: 'wall', cnt: 'plumb' },
  { g: 'sihhi', k: 'vana', ab: 'V',       t: 'Kesme vanası',                 w: 18, d: 14, h: 8,  z: 30, mount: 'wall' },
  { g: 'sihhi', k: 'sayac', ab: 'SY',      t: 'Su sayacı',                    w: 26, d: 16, h: 12, z: 40, mount: 'wall' },
  { g: 'sihhi', k: 'kolektor', ab: 'KL',   t: 'Kolektör (dağıtıcı)',          w: 50, d: 14, h: 30, z: 30, mount: 'wall' },
  { g: 'sihhi', k: 'piskolon', ab: 'PK',   t: 'Pis su kolonu (dikey Ø100)',   w: 18, d: 18, h: 280, mount: 'wall' },
  { g: 'sihhi', k: 'yagmur', ab: 'YB',     t: 'Yağmur iniş borusu',           w: 16, d: 16, h: 280, mount: 'wall' },
  { g: 'sihhi', k: 'rogar', ab: 'R',      t: 'Rögar / muayene bacası',       w: 60, d: 60, h: 2,  mount: 'floor' },
].map(f => ({ ...f, c: f.g === 'elektrik' ? E : P, fx: true }));

export const fixtureOf = k => FIXTURES.find(f => f.k === k);
export const isFixture = it => !!fixtureOf(it?.type);

/* planda kaç nokta var — teklif metrajı */
export function fixtureCounts(plan) {
  const r = { elec: 0, light: 0, plumb: 0 };
  for (const it of plan?.items || []) { const f = fixtureOf(it.type); if (f?.cnt) r[f.cnt]++; }
  return r;
}

/* ── 2D sembol (yerel koordinatlar, cm) ── */
export function fixtureSvg(it, px) {
  const w = it.w, d = it.d, c = it.color || fixtureOf(it.type)?.c || E;
  const sw = px(1.3), y0 = -d / 2, m = Math.min(w, d);
  // extra içinde stroke / stroke-width verilirse varsayılanı yazma (yinelenen öznitelik geçersiz SVG olur → raporda plan görünmez)
  const S = (s, extra = '') => `<path d="${s}" fill="none"${/(^|\s)stroke=/.test(extra) ? '' : ` stroke="${c}"`}${/stroke-width=/.test(extra) ? '' : ` stroke-width="${sw}"`} stroke-linecap="round" stroke-linejoin="round" ${extra}/>`;
  const circ = (x, y, r, fill = '#fff', col = c) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" stroke="${col}" stroke-width="${sw}"/>`;
  const txt = (s, x = 0, y = 0, fs = m * 0.42, col = c) => `<text x="${x}" y="${y}" font-size="${fs}" fill="${col}" text-anchor="middle" dominant-baseline="central" font-weight="700" font-family="Inter,system-ui,sans-serif"${it.rot > 90 && it.rot <= 270 ? ` transform="rotate(180 ${x} ${y})"` : ''}>${s}</text>`;
  const rect = (x, y, ww, hh, fill = '#fff') => `<rect x="${x}" y="${y}" width="${ww}" height="${hh}" rx="${Math.min(ww, hh) * 0.12}" fill="${fill}" stroke="${c}" stroke-width="${sw}"/>`;
  // priz: duvardan çıkan sap + duvara bakan yarım daire, topraklıda ön çizgi
  const socket = (cx, r, { fill = '#fff', earth = true } = {}) => {
    const yc = y0 + d * 0.32;
    return S(`M${cx} ${y0}V${yc}`) + `<path d="M${cx - r} ${yc}A${r} ${r} 0 0 0 ${cx + r} ${yc}Z" fill="${fill}" stroke="${c}" stroke-width="${sw}"/>` +
      (earth ? S(`M${cx - r * 0.8} ${yc + r + px(2.5)}H${cx + r * 0.8}`) : '');
  };
  // anahtar: duvara yakın daire + eğik kol(lar)
  const sw1 = (dirs, tick = true) => {
    const r = m * 0.17, cy = y0 + d * 0.4;
    let o = S(`M0 ${y0}V${cy - r}`) + circ(0, cy, r, c);
    for (const a of dirs) {
      const ang = a * Math.PI / 180, L = m * 0.55, ex = Math.sin(ang) * L, ey = cy + Math.cos(ang) * L;
      o += S(`M${Math.sin(ang) * r} ${cy + Math.cos(ang) * r}L${ex} ${ey}`);
      if (tick) { const tx = Math.cos(ang) * m * 0.14, ty = -Math.sin(ang) * m * 0.14; o += S(`M${ex} ${ey}L${ex + tx} ${ey + ty}`); }
    }
    return o;
  };
  switch (it.type) {
    case 'priz': return socket(0, w * 0.32);
    case 'ciftpriz': return socket(-w * 0.22, w * 0.2) + socket(w * 0.22, w * 0.2);
    case 'etanjpriz': return socket(0, w * 0.32, { fill: c });
    case 'tezgahpriz': return socket(0, w * 0.32) + txt('T', w * 0.36, y0 + d * 0.2, m * 0.38);
    case 'kuvvet': return socket(0, w * 0.32, { fill: c }) + S(`M${-w * 0.2} ${y0 + d * 0.32 + w * 0.12}L${w * 0.2} ${y0 + d * 0.32 + w * 0.2}`, `stroke="#fff"`) + txt('K', w * 0.38, y0 + d * 0.2, m * 0.38);
    case 'datapriz': { const yc = y0 + d * 0.3, r = w * 0.3; return S(`M0 ${y0}V${yc}`) + `<path d="M${-r} ${yc}L${r} ${yc}L0 ${yc + r * 1.3}Z" fill="#fff" stroke="${c}" stroke-width="${sw}"/>`; }
    case 'tvpriz': return S(`M0 ${y0}V${y0 + d * 0.2}`) + circ(0, y0 + d * 0.2 + w * 0.3, w * 0.3) + txt('TV', 0, y0 + d * 0.2 + w * 0.3, w * 0.22);
    case 'anahtar': return sw1([35]);
    case 'komutator': return sw1([25, 55]);
    case 'vavien': return sw1([40, -40]);
    case 'dimmer': return sw1([35], false) + S(`M${-m * 0.3} ${y0 + d * 0.9}L${m * 0.3} ${y0 + d * 0.62}M${m * 0.3} ${y0 + d * 0.62}l${-m * 0.14} ${m * 0.01}M${m * 0.3} ${y0 + d * 0.62}l${-m * 0.06} ${m * 0.12}`);
    case 'sigorta': return rect(-w / 2, y0, w, d) + `<path d="M${-w / 2} ${y0}L${w / 2} ${y0}L${w / 2} ${-y0}Z" fill="${c}"/>`;
    case 'buat': return circ(0, 0, m * 0.32) + S(`M${-m * 0.22} ${-m * 0.22}L${m * 0.22} ${m * 0.22}`);
    case 'diafon': return rect(-w * 0.38, y0, w * 0.76, d * 0.85) + txt('D', 0, y0 + d * 0.43, m * 0.45);
    case 'termostat': return rect(-w * 0.36, y0, w * 0.72, d * 0.85) + txt('T°', 0, y0 + d * 0.43, m * 0.42);
    case 'aplik': { const r = w * 0.3, cy = y0 + r * 0.9; return S(`M${-w * 0.42} ${y0}H${w * 0.42}`) + circ(0, cy, r) + S(`M${-r * 0.7} ${cy - r * 0.7}L${r * 0.7} ${cy + r * 0.7}M${r * 0.7} ${cy - r * 0.7}L${-r * 0.7} ${cy + r * 0.7}`); }
    case 'tavanlamba': { const r = m * 0.42; return circ(0, 0, r) + S(`M${-r * 0.7} ${-r * 0.7}L${r * 0.7} ${r * 0.7}M${r * 0.7} ${-r * 0.7}L${-r * 0.7} ${r * 0.7}`); }
    case 'avizenokta': { const r = m * 0.42; return circ(0, 0, r) + S(`M${-r * 0.7} ${-r * 0.7}L${r * 0.7} ${r * 0.7}M${r * 0.7} ${-r * 0.7}L${-r * 0.7} ${r * 0.7}`) + circ(0, 0, r * 0.28, c); }
    case 'spot': return circ(0, 0, m * 0.4) + circ(0, 0, m * 0.14, c);
    case 'ledserit': return S(`M${-w / 2} 0H${w / 2}`, `stroke-dasharray="${px(6)} ${px(3)}" stroke-width="${px(2.4)}"`);
    case 'duman': return circ(0, 0, m * 0.42) + txt('D', 0, 0, m * 0.42);
    // sıhhi tesisat
    case 'yersifonu': { const a = w * 0.46; return rect(-a, -a, a * 2, a * 2) + circ(0, 0, a * 0.62) + S(`M${-a * 0.62} 0H${a * 0.62}M0 ${-a * 0.62}V${a * 0.62}`); }
    case 'lineer': { let o = rect(-w / 2, -d / 2, w, d); for (let x = -w / 2 + d * 0.8; x < w / 2 - d * 0.5; x += d * 0.8) o += S(`M${x} ${-d * 0.22}V${d * 0.22}`); return o; }
    case 'pissu50': case 'pissu100': { const r = m * 0.42; return circ(0, 0, r) + circ(0, 0, r * 0.45, c) + txt(it.type === 'pissu50' ? 'Ø50' : 'Ø100', 0, r + m * 0.4, m * 0.36); }
    case 'temizsu': return S(`M${-w * 0.22} ${y0}V${y0 + d * 0.3}M${w * 0.22} ${y0}V${y0 + d * 0.3}`) + circ(-w * 0.22, y0 + d * 0.3 + w * 0.15, w * 0.15, HOT, HOT) + circ(w * 0.22, y0 + d * 0.3 + w * 0.15, w * 0.15, COLD, COLD);
    case 'soguksu': return S(`M0 ${y0}V${y0 + d * 0.3}`) + circ(0, y0 + d * 0.3 + w * 0.22, w * 0.22, COLD, COLD);
    case 'musluk': case 'bahcemusluk': {
      const yb = y0 + d * 0.45;
      return S(`M0 ${y0}V${yb}M${-w * 0.32} ${yb}H${w * 0.32}M0 ${yb}V${y0 + d * 0.9}`) + circ(0, y0 + d * 0.9, m * 0.08, c) + (it.type === 'bahcemusluk' ? txt('B', w * 0.36, y0 + d * 0.78, m * 0.34) : '');
    }
    case 'batarya': { const yb = y0 + d * 0.38; return S(`M${-w * 0.3} ${y0}V${yb}M${w * 0.3} ${y0}V${yb}`) + rect(-w * 0.42, yb - d * 0.12, w * 0.84, d * 0.24) + S(`M0 ${yb + d * 0.12}V${y0 + d * 0.92}`) + circ(-w * 0.42, yb, m * 0.1, HOT, HOT) + circ(w * 0.42, yb, m * 0.1, COLD, COLD); }
    case 'ankastre': return rect(-w * 0.36, y0, w * 0.72, d * 0.4) + circ(0, y0 + d * 0.2, m * 0.1, c) + S(`M0 ${y0 + d * 0.4}V${y0 + d * 0.62}`) + `<ellipse cx="0" cy="${y0 + d * 0.8}" rx="${w * 0.3}" ry="${d * 0.17}" fill="#fff" stroke="${c}" stroke-width="${sw}" stroke-dasharray="${px(3)} ${px(2)}"/>`;
    case 'makinebag': { const yb = y0 + d * 0.5, a = w * 0.11; return S(`M${-w * 0.22} ${y0}V${yb}`) + `<path d="M${-w * 0.22 - a} ${yb - a}L${-w * 0.22 + a} ${yb + a}L${-w * 0.22 + a} ${yb - a}L${-w * 0.22 - a} ${yb + a}Z" fill="${COLD}" stroke="${COLD}" stroke-width="${sw}"/>` + S(`M${w * 0.22} ${y0}V${yb - w * 0.12}`) + circ(w * 0.22, yb, w * 0.12, '#fff') + circ(w * 0.22, yb, w * 0.05, c); }
    case 'vana': { const yb = y0 + d * 0.55, a = w * 0.26; return S(`M0 ${y0}V${yb - a * 0.9}`) + `<path d="M${-a} ${yb - a * 0.7}L${a} ${yb + a * 0.7}L${a} ${yb - a * 0.7}L${-a} ${yb + a * 0.7}Z" fill="${c}" stroke="${c}" stroke-width="${sw}"/>`; }
    case 'sayac': return S(`M0 ${y0}V${y0 + d * 0.15}`) + circ(0, y0 + d * 0.15 + m * 0.36, m * 0.36) + txt('M', 0, y0 + d * 0.15 + m * 0.36, m * 0.36);
    case 'kolektor': { let o = rect(-w / 2, y0, w, d * 0.5); for (let i = 0; i < 4; i++) o += circ(-w * 0.36 + i * w * 0.24, y0 + d * 0.72, m * 0.13, i % 2 ? COLD : HOT, i % 2 ? COLD : HOT); return o; }
    case 'piskolon': { const r = m * 0.42; return circ(0, 0, r) + circ(0, 0, r * 0.62) + txt('PK', 0, 0, m * 0.3); }
    case 'yagmur': { const r = m * 0.42; return circ(0, 0, r) + txt('YB', 0, 0, m * 0.32); }
    case 'rogar': { const a = Math.min(w, d) / 2; return rect(-a, -a, a * 2, a * 2) + S(`M${-a} ${-a}L${a} ${a}M${a} ${-a}L${-a} ${a}`) + circ(0, 0, a * 0.45) + txt('R', 0, 0, a * 0.5); }
  }
  return rect(-w / 2, -d / 2, w, d);
}

/* ── 3D model: g grubu öğenin merkezinde (ceil ise tavan seviyesinde), birim metre ── */
export function fixture3D(THREE, g, it, std) {
  const f = fixtureOf(it.type); if (!f) return false;
  const W = it.w / 100, D = it.d / 100, back = -D / 2;
  const white = std('#F7F7F5', 0.35), grey = std('#8F959C', 0.5), dark = std('#2E3135', 0.5);
  const chrome = std('#D6DADF', 0.15, 0.95), steel = std('#BFC4C9', 0.3, 0.8), pvc = std('#9AA0A6', 0.6);
  const hot = std(HOT, 0.4), cold = std(COLD, 0.4), brass = std('#C9A24A', 0.3, 0.9);
  const add = m => { m.castShadow = m.receiveShadow = true; g.add(m); return m; };
  const box = (sx, sy, sz, x, y, z, m) => { const b = add(new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), m)); b.position.set(x, y, z); return b; };
  const cyl = (r, h, x, y, z, m, axis = 'y', seg = 20) => {
    const c = add(new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), m)); c.position.set(x, y, z);
    if (axis === 'z') c.rotation.x = Math.PI / 2; else if (axis === 'x') c.rotation.z = Math.PI / 2; return c;
  };
  // duvar plakası: arka yüzde, merkez yüksekliği 0 (grup z montaj yüksekliğinde)
  const plate = (w, h, x = 0, m = white, t = 0.012) => box(w, h, t, x, h / 2, back + t / 2, m);
  const socketHoles = x => { cyl(0.004, 0.004, x - 0.012, 0.04, back + 0.013, dark, 'z', 8); cyl(0.004, 0.004, x + 0.012, 0.04, back + 0.013, dark, 'z', 8); };
  switch (it.type) {
    case 'priz': case 'tezgahpriz': plate(0.082, 0.082); cyl(0.024, 0.006, 0, 0.041, back + 0.014, std('#EDEDEA', 0.4), 'z'); socketHoles(0); break;
    case 'ciftpriz': plate(0.152, 0.082); [-0.036, 0.036].forEach(x => { cyl(0.024, 0.006, x, 0.041, back + 0.014, std('#EDEDEA', 0.4), 'z'); socketHoles(x); }); break;
    case 'etanjpriz': plate(0.09, 0.09, 0, std('#B9BEC4', 0.5), 0.03); box(0.07, 0.06, 0.012, 0, 0.05, back + 0.036, std('#CDD2D7', 0.3)); break;
    case 'kuvvet': plate(0.09, 0.09, 0, std('#E9E2D3', 0.4)); cyl(0.028, 0.008, 0, 0.045, back + 0.016, std('#D4572A', 0.5), 'z'); break;
    case 'datapriz': case 'tvpriz': plate(0.082, 0.082); box(0.02, 0.016, 0.004, 0, 0.041, back + 0.013, dark); break;
    case 'anahtar': case 'vavien': case 'dimmer': plate(0.082, 0.082); box(0.05, 0.05, 0.008, 0, 0.041, back + 0.016, std('#FFFFFF', 0.25)); break;
    case 'komutator': plate(0.082, 0.082); box(0.024, 0.05, 0.008, -0.013, 0.041, back + 0.016, std('#FFFFFF', 0.25)); box(0.024, 0.05, 0.008, 0.013, 0.041, back + 0.016, std('#FFFFFF', 0.25)); break;
    case 'sigorta': box(0.36, 0.45, 0.1, 0, 0.225, back + 0.05, std('#E8EAEC', 0.4)); box(0.3, 0.004, 0.004, 0, 0.3, back + 0.101, grey); box(0.04, 0.012, 0.006, 0.13, 0.22, back + 0.103, dark); break;
    case 'buat': cyl(0.04, 0.01, 0, 0.04, back + 0.005, white, 'z'); break;
    case 'diafon': plate(0.11, 0.2, 0, dark, 0.025); box(0.07, 0.06, 0.004, 0, 0.14, back + 0.026, std('#111214', 0.1)); break;
    case 'termostat': plate(0.09, 0.09, 0, white, 0.022); cyl(0.022, 0.006, 0, 0.045, back + 0.025, grey, 'z'); break;
    case 'aplik': box(0.06, 0.12, 0.02, 0, 0.06, back + 0.01, dark); { const s = add(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.05, 0.18, 24, 1, true, 0, Math.PI), std('#F4EEE4', 0.9))); s.material.side = THREE.DoubleSide; s.position.set(0, 0.1, back + 0.01); s.rotation.y = -Math.PI / 2; } break;
    case 'tavanlamba': cyl(0.17, 0.06, 0, -0.03, 0, std('#FBFBF8', 0.6)); break;
    case 'avizenokta': cyl(0.06, 0.03, 0, -0.015, 0, white); break;
    case 'spot': cyl(0.045, 0.008, 0, -0.004, 0, std('#FFFFFF', 0.1)); cyl(0.03, 0.009, 0, -0.005, 0, std('#FFF6DA', 0.05)); break;
    case 'ledserit': box(W, 0.01, 0.012, 0, -0.005, 0, std('#FFF6DA', 0.1)); break;
    case 'duman': cyl(0.055, 0.035, 0, -0.018, 0, white); break;
    case 'yersifonu': box(0.15, 0.006, 0.15, 0, 0.003, 0, steel); for (let i = -2; i <= 2; i++) box(0.11, 0.002, 0.006, 0, 0.007, i * 0.022, dark); break;
    case 'lineer': box(W, 0.006, 0.07, 0, 0.003, 0, steel); for (let x = -W / 2 + 0.05; x < W / 2 - 0.03; x += 0.04) box(0.012, 0.002, 0.04, x, 0.007, 0, dark); break;
    case 'pissu50': cyl(0.025, 0.06, 0, 0.03, 0, pvc); cyl(0.02, 0.002, 0, 0.061, 0, dark); break;
    case 'pissu100': cyl(0.055, 0.06, 0, 0.03, 0, pvc); cyl(0.048, 0.002, 0, 0.061, 0, dark); break;
    case 'temizsu': [[-0.075, hot], [0.075, cold]].forEach(([x, m]) => { cyl(0.012, 0.04, x, 0, back + 0.02, m, 'z', 12); cyl(0.018, 0.012, x, 0, back + 0.045, chrome, 'z', 6); }); break;
    case 'soguksu': cyl(0.012, 0.04, 0, 0, back + 0.02, cold, 'z', 12); cyl(0.018, 0.012, 0, 0, back + 0.045, chrome, 'z', 6); break;
    case 'musluk': case 'bahcemusluk': cyl(0.012, 0.06, 0, 0, back + 0.03, chrome, 'z', 12); cyl(0.01, 0.06, 0, -0.03, back + 0.055, chrome, 'y', 12); box(0.06, 0.008, 0.012, 0, 0.02, back + 0.055, it.type === 'bahcemusluk' ? std('#C0392B', 0.5) : chrome); break;
    case 'batarya': cyl(0.01, 0.05, -0.075, 0, back + 0.025, chrome, 'z', 10); cyl(0.01, 0.05, 0.075, 0, back + 0.025, chrome, 'z', 10); cyl(0.022, 0.2, 0, 0, back + 0.055, chrome, 'x'); cyl(0.01, 0.1, 0, -0.04, back + 0.06, chrome, 'y', 10); box(0.012, 0.06, 0.02, 0, 0.04, back + 0.07, chrome); break;
    case 'ankastre': plate(0.16, 0.16, 0, chrome, 0.008); cyl(0.025, 0.03, 0, 0.08, back + 0.023, chrome, 'z'); cyl(0.009, 0.4, 0, 1.0, back + 0.02, chrome, 'y', 10); cyl(0.009, 0.3, 0, 1.19, back + 0.16, chrome, 'z', 10); cyl(0.1, 0.012, 0, 1.18, back + 0.3, chrome, 'y', 32); break;
    case 'makinebag': cyl(0.012, 0.05, -0.08, 0, back + 0.025, cold, 'z', 12); box(0.02, 0.05, 0.02, -0.08, 0.02, back + 0.05, std('#1E7FD8', 0.5)); cyl(0.025, 0.05, 0.08, -0.02, back + 0.025, pvc, 'z'); break;
    case 'vana': cyl(0.012, 0.06, 0, 0, back + 0.03, brass, 'z', 12); box(0.07, 0.012, 0.012, 0.02, 0.02, back + 0.045, std('#C0392B', 0.5)); break;
    case 'sayac': cyl(0.012, 0.18, 0, 0, back + 0.03, brass, 'x', 12); cyl(0.045, 0.05, 0, 0, back + 0.04, std('#1F5FA8', 0.4), 'y'); cyl(0.04, 0.004, 0, 0.026, back + 0.04, std('#DDEFF6', 0.1), 'y'); break;
    case 'kolektor': cyl(0.016, 0.46, 0, 0.18, back + 0.06, brass, 'x'); cyl(0.016, 0.46, 0, 0.08, back + 0.06, brass, 'x');
      for (let i = 0; i < 4; i++) { const x = -0.165 + i * 0.11; cyl(0.008, 0.08, x, 0.22, back + 0.06, hot, 'y', 8); cyl(0.008, 0.08, x, 0.04, back + 0.06, cold, 'y', 8); } break;
    case 'piskolon': case 'yagmur': {
      const r = it.type === 'piskolon' ? 0.055 : 0.045, H = (it.h || 280) / 100;
      cyl(r, H, 0, H / 2, back + r + 0.01, it.type === 'piskolon' ? pvc : std('#7A7F86', 0.5)); break;
    }
    case 'rogar': box(Math.min(W, D), 0.03, Math.min(W, D), 0, 0.015, 0, std('#9C9A94', 0.9)); cyl(Math.min(W, D) * 0.3, 0.005, 0, 0.032, 0, std('#4A4D52', 0.6, 0.4)); break;
    default: box(W, (it.h || 10) / 100, D, 0, (it.h || 10) / 200, 0, white);
  }
  return true;
}
