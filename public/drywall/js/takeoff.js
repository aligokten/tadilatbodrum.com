/* SAGG Drywall+ — metraj: poz numaraları, kesim listeleri, profil boy / levha yerleşim optimizasyonu,
 * malzeme listesi, maliyet ve imalat aşamaları. */
import { SYSTEMS, BOARDS, CONSUMABLES } from './catalog.js';

const pad = n => String(n).padStart(2, '0');
export const barFor = (kind, S) => (kind === 'UD' || kind === 'CD' ? S.barCD : kind === 'U' ? S.barU : S.barC);

/* Poz: aynı tip + sistem + boydaki profiller tek poz; aynı ölçü + çentikteki levhalar tek poz. */
export function assignPoz(model) {
  const mg = new Map();
  for (const m of model.members) {
    const k = `${m.kind}|${m.sys}|${m.len}|${m.strong ? 1 : 0}|${m.extra ? 1 : 0}`;
    if (!mg.has(k)) mg.set(k, { kind: m.kind, sys: m.sys, len: m.len, strong: m.strong, extra: m.extra, items: [], roles: new Set(), notes: new Set() });
    const g = mg.get(k); g.items.push(m); g.roles.add(m.role.replace(/^.* · /, '').replace(/^Niş \d+ /, 'Niş ')); if (m.note) g.notes.add(m.note);
  }
  const groups = [...mg.values()].sort((a, b) => a.kind.localeCompare(b.kind) || b.sys - a.sys || b.len - a.len);
  const cnt = { C: 0, U: 0, CD: 0, UD: 0 };
  for (const g of groups) { g.poz = `${g.kind}${pad(++cnt[g.kind])}`; g.items.forEach(m => (m.poz = g.poz)); }
  model.memberGroups = groups;

  const bg = new Map();
  for (const b of model.boards) {
    const nk = b.notches.map(n => `${n.u},${n.v},${n.w},${n.h}`).join(';');
    const k = `${b.type}|${b.w}|${b.h}|${nk}`;
    if (!bg.has(k)) bg.set(k, { type: b.type, w: b.w, h: b.h, notches: b.notches, items: [], faces: new Set() });
    const g = bg.get(k); g.items.push(b); g.faces.add(b.face + (b.lining ? '' : ` (${b.layer}. kat)`));
  }
  const bgroups = [...bg.values()].sort((a, b) => a.type.localeCompare(b.type) || b.w * b.h - a.w * a.h);
  bgroups.forEach((g, i) => { g.poz = `L${pad(i + 1)}`; g.items.forEach(b => (b.poz = g.poz)); });
  model.boardGroups = bgroups;
  return model;
}

/* ───── 1B kesim optimizasyonu (ilk uyan, azalan) ───── */
export function nestBars(pieces, barLen, kerf, lap) {
  const list = [];
  for (const p of pieces) {
    if (p.len <= barLen) { list.push(p); continue; }
    // boydan uzun parça: ek bindirmeli bölünür
    let rest = p.len, i = 1;
    const n = Math.ceil((p.len - lap) / (barLen - lap));
    while (rest > barLen) { list.push({ ...p, len: barLen, tag: `${p.tag} ek ${i++}/${n}` }); rest -= barLen - lap; }
    list.push({ ...p, len: Math.ceil(rest), tag: `${p.tag} ek ${i}/${n}` });
  }
  list.sort((a, b) => b.len - a.len);
  const bars = [];
  for (const p of list) {
    let bar = bars.find(b => b.rem >= p.len + (b.cuts.length ? kerf : 0));
    if (!bar) { bar = { cuts: [], rem: barLen }; bars.push(bar); }
    bar.rem -= p.len + (bar.cuts.length ? kerf : 0);
    bar.cuts.push(p);
  }
  return bars;
}

/* ───── 2B levha yerleşimi (MaxRects, en kısa kenar uyumu, 90° döndürme serbest) ───── */
export function nestSheets(pieces, SW, SH, kerf) {
  const W = SW + kerf, H = SH + kerf;
  const sheets = [];
  const items = pieces.map(p => ({ ...p, pw: p.w + kerf, ph: p.h + kerf })).sort((a, b) => Math.max(b.pw, b.ph) - Math.max(a.pw, a.ph) || b.pw * b.ph - a.pw * a.ph);
  const newSheet = () => { const s = { free: [{ x: 0, y: 0, w: W, h: H }], placed: [] }; sheets.push(s); return s; };
  const fit = (s, it) => {
    let best = null;
    for (const f of s.free) for (const rot of [false, true]) {
      const w = rot ? it.ph : it.pw, h = rot ? it.pw : it.ph;
      if (w <= f.w + 0.01 && h <= f.h + 0.01) {
        const sc = Math.min(f.w - w, f.h - h), lc = Math.max(f.w - w, f.h - h);
        if (!best || sc < best.sc || (sc === best.sc && lc < best.lc)) best = { x: f.x, y: f.y, w, h, rot, sc, lc };
      }
    }
    return best;
  };
  const place = (s, r) => {
    const nf = [];
    for (const f of s.free) {
      if (r.x >= f.x + f.w || r.x + r.w <= f.x || r.y >= f.y + f.h || r.y + r.h <= f.y) { nf.push(f); continue; }
      if (r.x > f.x) nf.push({ x: f.x, y: f.y, w: r.x - f.x, h: f.h });
      if (r.x + r.w < f.x + f.w) nf.push({ x: r.x + r.w, y: f.y, w: f.x + f.w - r.x - r.w, h: f.h });
      if (r.y > f.y) nf.push({ x: f.x, y: f.y, w: f.w, h: r.y - f.y });
      if (r.y + r.h < f.y + f.h) nf.push({ x: f.x, y: r.y + r.h, w: f.w, h: f.y + f.h - r.y - r.h });
    }
    s.free = nf.filter((a, i) => !nf.some((b, j) => j !== i && a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h && (j < i || a.w !== b.w || a.h !== b.h || a.x !== b.x || a.y !== b.y)));
  };
  const oversize = [];
  for (const it of items) {
    if (!((it.pw <= W && it.ph <= H) || (it.ph <= W && it.pw <= H))) { oversize.push(it); continue; }
    let best = null, bs = null;
    for (const s of sheets) { const f = fit(s, it); if (f && (!best || f.sc < best.sc)) { best = f; bs = s; } }
    if (!best) { bs = newSheet(); best = fit(bs, it); }
    place(bs, best);
    bs.placed.push({ ...it, x: best.x, y: best.y, rot: best.rot, w: it.w, h: it.h });
  }
  for (const s of sheets) s.used = s.placed.reduce((a, p) => a + p.w * p.h, 0) / (SW * SH);
  return { sheets, oversize };
}

/* ───── Proje malzeme listesi ───── */
export function projectTakeoff(models, S) {
  const prof = {};   // 'C75' → { pieces, total }
  const boards = {}; // type → pieces
  const q = Object.fromEntries(CONSUMABLES.map(c => [c.k, 0]));
  let corner = 0, cladArea = 0;
  const extras = [];
  for (const md of models) {
    const code = md.el.code;
    for (const g of md.memberGroups) {
      const k = `${g.kind}${g.sys}`;
      prof[k] ??= { kind: g.kind, sys: g.sys, pieces: [], total: 0 };
      for (let i = 0; i < g.items.length; i++) prof[k].pieces.push({ len: g.len, tag: `${code}-${g.poz}` });
      prof[k].total += g.len * g.items.length;
    }
    for (const g of md.boardGroups) {
      boards[g.type] ??= [];
      for (let i = 0; i < g.items.length; i++) boards[g.type].push({ w: g.w, h: g.h, tag: `${code}-${g.poz}`, notched: g.notches.length > 0 });
    }
    for (const k in q) q[k] += md.qty[k] || 0;
    corner += md.qty.corner || 0;
    cladArea += md.boards.filter(b => b.outer).reduce((s, b) => s + b.area, 0);
    for (const x of md.extras) extras.push({ ...x, el: code });
  }
  const bars = {}, sheetNest = {};
  for (const k in prof) {
    const p = prof[k];
    const L = barFor(p.kind, S);
    bars[k] = { barLen: L, bars: nestBars(p.pieces, L, S.kerfBar, S.spliceLap) };
  }
  for (const t in boards) sheetNest[t] = nestSheets(boards[t], S.sheetW, S.sheetH, S.kerfSheet);

  const rows = [];
  const P = S.prices, wf = 1 + S.wastePct / 100;
  const add = (grp, name, qty, unit, price, note = '') => rows.push({ grp, name, qty, unit, price, total: price ? qty * price : 0, note });
  for (const k of Object.keys(prof).sort()) {
    const p = prof[k], b = bars[k];
    const waste = b.bars.reduce((s, x) => s + x.rem, 0);
    add('Profil', `${p.kind}${p.sys} profil (${b.barLen} mm boy)`, b.bars.length, 'boy', P[k] || 0,
      `Net ${(p.total / 1000).toFixed(1)} m · ${p.pieces.length} parça · fire %${(waste / (b.bars.length * b.barLen) * 100).toFixed(0)}`);
  }
  if (corner > 0) add('Profil', 'Köşe profili (3000 mm)', Math.ceil(corner * wf / 3), 'boy', P.corner, `${corner.toFixed(1)} m`);
  for (const t of Object.keys(sheetNest)) {
    const n = sheetNest[t];
    const net = boards[t].reduce((s, p) => s + p.w * p.h, 0) / 1e6;
    add('Levha', `${BOARDS[t].label} ${S.boardT} × ${S.sheetW} × ${S.sheetH} mm`, n.sheets.length + n.oversize.length, 'adet', P['sheet_' + t] || 0,
      `Net ${net.toFixed(1)} m² · ${boards[t].length} parça · ort. kullanım %${(n.sheets.reduce((s, x) => s + x.used, 0) / Math.max(1, n.sheets.length) * 100).toFixed(0)}`);
  }
  for (const c of CONSUMABLES) {
    const v = q[c.k];
    if (!v) continue;
    const qty = c.unit === 'adet' ? Math.ceil(v * wf / 10) * 10 : Math.ceil(v * wf * 10) / 10;
    add('Sarf', c.name, qty, c.unit, P[c.k] || 0, c.pack ? `≈ ${Math.ceil(qty / c.pack)} paket (${c.pack} ${c.unit})` : '');
  }
  if (P.labor_m2) add('İşçilik', 'Kaplama işçiliği (dış yüzey)', Math.round(cladArea * 10) / 10, 'm²', P.labor_m2);
  for (const x of extras) add('Ek kalem', `[${x.el}] ${x.name}`, x.qty, x.unit, 0, x.note || 'Fiyatı ayrıca belirlenir');
  const total = rows.reduce((s, r) => s + r.total, 0);
  return { rows, total, bars, sheetNest, cladArea };
}

/* ───── İmalat aşamaları ───── */
export function steps(md, S) {
  const el = md.el, p = el.params, sy = SYSTEMS[p.sys];
  const g = md.memberGroups, find = re => g.filter(x => [...x.roles].some(r => re.test(r)));
  const pz = arr => arr.map(x => `${x.poz} (${x.len} mm × ${x.items.length})`).join(', ') || '—';
  const out = [];
  const st = (title, items) => out.push({ title, items: items.filter(Boolean) });
  if (el.type === 'tavan') {
    const cove = p.cove && +p.coveW > 100;
    st('Hazırlık ve aplikasyon', [
      'Tavandaki elektrik, klima, havalandırma ve yangın tesisatı tamamlanmış; duvar sıvası / boyası bitmiş olmalıdır.',
      `Lazer ile tavan kotunu (${p.Hc} mm) tüm duvarlara çizin${cove ? `; ışık bandı alt kotu ${p.Hc - p.coveDrop} mm ikinci çizgi olarak işaretlenir` : ''}.`,
      `Taşıyıcı profil aksları ≤ ${p.car} mm, askı noktaları ≤ ${p.hang} mm aralıkla döşemeye işaretlenir (plan çizimindeki noktalar).`,
    ]);
    st('Duvar profilleri (UD28)', [
      `UD28 profillerini (${pz(find(/Duvar UD28/))}) sızdırmazlık bandı ile kot çizgisine ${S.dowelPitch} mm aralıkla dübelleyin; uçlarda 50 mm'de dübel.`,
    ]);
    st('Askılar ve taşıyıcı profiller', [
      `Askıları (${md.qty.hanger} adet) çelik çivi dübel ile döşemeye sabitleyin; tij / askı teli boyu ≈ ${Math.round((p.Hs - p.Hc - 54))} mm.`,
      `Taşıyıcı CD60 profilleri (${pz(find(/Taşıyıcı/))}) askılara takın; uzun profillerde CD ek parçası kullanın, ekleri şaşırtın ve ek askı ekleyin.`,
      'Taşıyıcıları lazer kotuna göre askı ayarından terazileyin.',
    ]);
    st('Montaj profilleri', [
      `Montaj CD60 profillerini (${pz(find(/Montaj profili/))}) ${p.sec} mm aralıkla, uçları UD28 içine oturacak şekilde yerleştirin.`,
      `Her kesişimde çapraz bağlantı parçası (${md.qty.cross} adet) ile taşıyıcıya bağlayın.`,
      p.hatch && `Müdahale kapağı çevresine takviye CD profilleri (${pz(find(/Kapak çerçevesi/))}) ekleyin.`,
    ]);
    if (cove) st('Gizli ışık bandı iskeleti', [
      `Bant UD28 profillerini alt kota dübelleyin; konsol CD60 (${pz(find(/konsolu/))}) ile alın alt profiline (${pz(find(/alın alt/))}) bağlayın.`,
      `Alın dikmeleri (${pz(find(/alın dikmesi/))}) 600 mm aralıkla, üstte alın üst UD28 profili (${pz(find(/alın üst/))}); alın hattı ana tavana askı ile asılır.`,
      `Işık yarığı ${p.coveSlot} mm: alın üstü ile ana tavan arası; LED şerit alının arkasına, ana tavana bakacak şekilde konur.`,
    ]);
    st('Tesisat', [
      'Spot, LED sürücü ve buat kablolarını levha öncesi çekin; sürücüleri müdahale kapağından erişilebilir yerde bırakın.',
      'Klima menfezi / armatür gibi ağır yükler profile değil ayrı askıya asılmalıdır.',
    ]);
    st(`Levha kaplama (${p.layers} kat)`, [
      `Levhaları uzun kenarı montaj profillerine dik gelecek şekilde vidalayın; baş derzleri montaj profili üzerinde ve satırlar arasında şaşırtmalı ("Kaplama — Ana tavan" paftası).`,
      `Vida aralığı ${S.screwPitchCeil} mm, kenardan 10–15 mm; levhayı ortadan kenarlara doğru vidalayın.`,
      cove && 'Işık bandı alt şeritlerini ve alın şeritlerini kaplayın; alt şeridin kenarı alın levhası ile örtülür.',
      +p.spotRows > 0 && `Spot deliklerini (Ø${p.spotD} mm) plan ölçülerine göre delin.`,
    ]);
  } else if (el.type === 'duvar') {
    const ops = md.openings || [];
    st('Hazırlık ve aplikasyon', [
      'Zemin ve tavan düzlüğünü kontrol edin; şap / seramik bitmiş olmalı, tavanda tesisat geçişleri tamamlanmış olmalıdır.',
      `Lazer ile duvar aksını zemine, tavana ve yan duvarlara çizin. Duvar uzunluğu ${p.L} mm, yükseklik ${p.H} mm, iskelet genişliği ${sy.web} mm.`,
      ops.length && `Boşlukları zemine işaretleyin: ${ops.map(o => `${({ door: 'kapı', window: 'pencere', pass: 'geçit' })[o.type]} x = ${o.x} mm, kaba genişlik ${o.w} mm, yükseklik ${o.h} mm${o.sill ? `, denizlik ${o.sill} mm` : ''}`).join('; ')}.`,
      `Dikme aksları ${p.s} mm aralıklı, A yüzü levha derzleri 1200 mm modülde dikme ortasına gelecek şekilde başlangıç ucundan ölçülür.`,
    ]);
    st('Raylar (U profil)', [
      `Taban ve tavan raylarının (${pz(find(/Taban rayı|Tavan rayı/))}) altına sızdırmazlık bandı yapıştırın.`,
      `Rayları çakma dübel ile ${S.dowelPitch} mm aralıkla sabitleyin; ray uçlarına 50 mm mesafede mutlaka dübel atın.`,
      ops.some(o => !o.sill) && 'Kapı / geçit boşluklarında taban rayı kesilir; boşluk içinde ray bırakmayın.',
    ]);
    st('Duvar başları ve kasa dikmeleri', [
      `Duvar başı dikmelerini ${p.endA === 'wall' || p.endB === 'wall' ? 'yan duvara sızdırmazlık bandı + dübel (≈ 800 mm aralık) ile' : 'raylara LN vida ile'} sabitleyin.`,
      find(/kasa dikmesi/).length && `Kasa dikmeleri: ${pz(find(/kasa dikmesi/))}. Her birinin içine U profil (${pz(find(/kasa takviyesi/))}) geçirip 300 mm aralıkla LN vidalayarak kutu (takviyeli) dikme yapın.`,
      find(/kasa dikmesi/).length && 'Kasa dikmelerini şakülünde, boşluk net ölçüsünü üstte ve altta kontrol ederek raylara her iki kanattan LN vida ile bağlayın.',
    ]);
    st('Ara dikmeler', [
      `Dikmeleri (${pz(find(/^Dikme$|Duvar başı/))}) raylara yerleştirin; boy = kat yüksekliği − 10 mm.`,
      'Dikmelerin açık tarafları aynı yöne bakmalı (montaj yönünde), tesisat delikleri aynı hizada olmalıdır.',
      S.studToTrackScrew ? 'Dikmeleri taban ve tavan rayına her iki kanattan LN 3,5×9,5 vida ile bağlayın.' : 'Dikmeler raylara gevşek oturtulur, levha vidaları ile sabitlenir.',
      p.H > S.barC && `Kat yüksekliği profil boyundan büyük: dikmeleri ${S.spliceLap} mm bindirmeyle ekleyip LN vida ile birleştirin; ekleri şaşırtmalı yapın.`,
    ]);
    if (ops.length) st('Lento, denizlik ve kısa dikmeler', [
      `Lento / denizlik U profillerini (${pz(find(/lentosu|denizliği/))}) boşluk genişliği + 300 mm kesin; uçlarda 150 mm kanatları kesip gövdeyi 90° kıvırın ve kasa dikmelerine LN ile vidalayın.`,
      find(/Kısa dikme/).length && `Kısa dikmeler: ${pz(find(/Kısa dikme/))} — dikme aksına göre lento üstüne / denizlik altına yerleştirin.`,
    ]);
    st('Tesisat ve takviyeler', [
      'Elektrik buatları ve boru geçişlerini dikme deliklerinden geçirin; buat yerlerini A yüzü levhalarına aktarmak için ölçün.',
      'Asma dolap, TV, lavabo gibi yükler için dikmeler arasına 18 mm OSB / kontrplak takviye veya U profil kuşak ekleyin.',
    ]);
    st(`A yüzü kaplama (${p.A.layers} kat)`, [
      `Levhaları düşey yerleştirin, zeminden 10 mm boşluk bırakın. Poz ve yerleşim için "Kaplama — A yüzü" çizimine bakın.`,
      `Vidalama: dış katta ${S.screwPitchOuter} mm, iç katta ${S.screwPitchInner} mm aralık; kenardan 10–15 mm içeriden, vida başı levha yüzeyinin hafif altında.`,
      'Yatay derzler komşu levhalarda en az 400 mm kaydırılır; kapı / pencere köşelerine derz getirilmez (L kesim parçalar çentikli olarak listelenmiştir).',
      +p.A.layers > 1 && '2. kat levhalar 1. katın derzlerini bir dikme aralığı kaydırarak örter; 2. katta TN 3,5×35 vida kullanılır.',
    ]);
    if (p.insul !== 'none') st('Yalıtım', [`Dikme aralarına ${p.insulT} mm ${p.insul === 'tasyunu' ? 'taşyünü' : 'camyünü'} yerleştirin; boşluk kalmayacak şekilde sıkıca oturtun (${md.qty.insul.toFixed(1)} m²).`]);
    if (+p.B.layers > 0) st(`B yüzü kaplama (${p.B.layers} kat)`, ['Levha derzleri A yüzüne göre bir dikme aralığı kaydırılmıştır ("Kaplama — B yüzü" çizimi).', 'A yüzündeki vida ve kesim kurallarını uygulayın.']);
  } else {
    const isAda = el.type === 'ada', isTv = el.type === 'tv';
    st('Hazırlık ve aplikasyon', [
      `Gövde dış ölçüsü ${Math.round(md.dims.W)} × ${Math.round(md.dims.D)} × ${Math.round(md.dims.H)} mm. İskelet ölçüleri levha kalınlığı (${p.layers} × ${S.boardT} mm) düşülerek çizimlerde verilmiştir.`,
      'Konumu lazer ile zemine (ve duvara dayalıysa duvara) çizin; köşelerin gönyesini 3-4-5 yöntemi ya da çapraz ölçü ile kontrol edin.',
      isAda && 'Ada içine gelecek elektrik (priz / ocak), su ve gider hatlarının çıkış noktalarını önceden işaretleyin.',
      isTv && 'TV, priz, HDMI / anten boruları ve LED trafosu yerlerini işaretleyin; TV askı yüksekliği nişe göre kontrol edilir.',
    ]);
    st('Taban ve arka çerçeve', [
      `Taban raylarını (${pz(find(/Taban rayı/))}) sızdırmazlık bandı ile zemine yerleştirip ${S.dowelPitch} mm aralıkla dübelleyin.`,
      md.boxes?.some(b => b.wallBack) && 'Duvara dayalı arka çerçevenin ray ve dikmelerini duvara dübelle sabitleyin (≈ 600 mm aralık).',
      md.boxes?.length > 1 && 'Üst modül alt konsolun üst levhası üzerine oturur; taban rayını konsol üst kirişlerine vidalayın.',
    ]);
    st('Dikmeler ve üst ray', [
      `Dikmeler (${pz(find(/^Dikme$/))}) ${p.s} mm aralıkla; köşelerde iki yüzün dikmeleri birbirine LN vida ile bağlanır.`,
      `Üst rayları (${pz(find(/Üst ray/))}) dikmelere geçirip her iki kanattan vidalayın; çaprazları ölçerek gönye kontrolü yapın.`,
      find(/Bağlantı traversi/).length && `Ön ve arka çerçeveyi bağlantı traversleri (${pz(find(/Bağlantı traversi/))}) ile 1000 mm'de bir birbirine bağlayın.`,
    ]);
    if (find(/Niş/).length) st('Niş kasaları', [
      `Niş kasa dikmeleri (${pz(find(/kasa dikmesi/))}) tam boy; lento ve taban kirişi (${pz(find(/lentosu|taban kirişi/))}) uçları kıvrılarak bağlanır.`,
      `Niş arka çerçevesi (${pz(find(/arka (alt|üst) ray|arka dikmesi/))}) niş derinliğinde kurulur, derinlik bağlantıları (${pz(find(/derinlik bağlantısı/))}) ile ön kasaya bağlanır.`,
      'Niş net ölçüleri levha kalınlıkları düşülerek bilgi bölümünde verilmiştir — kurulumdan sonra kaba ölçüleri tekrar kontrol edin.',
    ]);
    if (find(/Üst kiriş/).length) st('Üst çerçeve', [
      `Üst kirişleri (${pz(find(/Üst kiriş/))}) ${p.s} mm aralıkla ön ve arka üst raylara bağlayın.`,
      isAda && 'Tezgah taşma tarafında gizli L konsollar ya da çelik lama ile destek yapın; taşma 250 mm üzerindeyse zorunludur.',
    ]);
    st('Tesisat ve takviyeler', [
      isTv && 'TV nişi arkasına askı aparatı için 18 mm kontrplak / OSB takviye vidalayın.',
      'Priz kutusu, buat ve kablo geçişlerini kaplamadan önce yerleştirin; LED kanalları için niş üst kenarında gölge boşluğu bırakın.',
      'Islak hacim / tezgah altı için yeşil (suya dayanıklı) levha kullanın.',
    ]);
    st('Kaplama', [
      'Önce yan yüzleri, sonra ön / arka yüzleri kaplayın: ön ve arka levhalar yan levhaların kenarını örter. Üst yüz en son kaplanır (kenar yüz levhaları üst levhayı taşır).',
      'Niş iç kaplama sırası: arka → sol / sağ yanak → taban → tavan. Ölçüler kesim listesindedir.',
      `Vida aralığı ${S.screwPitchOuter} mm (mobilyada 200 mm önerilir), kenardan 10–15 mm içeriden.`,
    ]);
    if (isAda) st('Tezgah', [`${md.extras[0]?.name}. Tezgahı silikon / montaj yapıştırıcısı ile üst kirişlere oturtun; ağır taş tezgahta üst kiriş aralığını 300 mm'ye düşürün.`]);
  }
  st('Derz ve yüzey', [
    `Dış köşelere köşe profili (${(md.qty.corner || 0).toFixed(1)} m) takın, alçı ile sabitleyin.`,
    `Derzlere derz bandı (${md.qty.tape_joint.toFixed(1)} m) uygulayıp derz dolgu alçısı ile 2 kat doldurun; vida başlarını kapatın.`,
    'Kuruduktan sonra zımparalayın; boya öncesi astar uygulayın (Q2 / Q3 yüzey kalitesi).',
  ]);
  st('Kontrol ve teslim', [
    '2 m mastar ile düzlem kontrolü (en fazla 3 mm sapma), şakül ve gönye kontrolü.',
    'Niş, boşluk ve tezgah ölçülerini çizimle karşılaştırın; imalat fotoğraflarını kaydedin.',
  ]);
  return out;
}
