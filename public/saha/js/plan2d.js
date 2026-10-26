/* ═══ 2D Rölöve Editörü — SVG tabanlı, fare + dokunmatik ═══
 * Dünya birimi: cm. Ekran = dünya * s + (ox, oy).
 */
import { uid } from './store.js';
import { icon, esc, h, $, $$, fmtNum, promptDlg, modal, confirmDlg, toast } from './ui.js';
import { FLOORS, FURNITURE, FURN_GROUPS, furnOf, floorOf, ROOM_TYPES, WALL_COLORS } from './catalog.js';
import { fixtureOf, fixtureSvg } from './fixtures.js';
import { TILE_SIZES, TILE_PATTERNS, TILE_JOINTS, tileable, tileOf, tileDefaults, applySize, tileLayout, tilePreviewSvg, tilePlanPath } from './tiles.js';
import { DOOR_MODELS, DOOR_USES, WIN_MODELS, WIN_USES, FRAME_COLORS, LEAF_COLORS, RAIL_KINDS, doorModel, doorUse, winModel, winUse, winRail, railKind, frameColor, leafColor, applyUse, sashes, leaves, winTilt, winHingeAtStart } from './openings.js';
import { newCabinet, autoFill, itemDims, planSymbol, runLength, FRONTS, pick as cabPick, MT as CAB_MT } from './cabinet.js';

/* mobilya seçim listesi: kategorilere göre gruplu */
const furnOptions = (cur, dims = true) => FURN_GROUPS.map(([g, t]) => `<optgroup label="${t}">${FURNITURE.filter(f => f.g === g).map(f => `<option value="${f.k}" ${f.k === cur ? 'selected' : ''}>${f.t}${dims ? ` (${f.w}×${f.d})` : ''}</option>`).join('')}</optgroup>`).join('');
import {
  emptyPlan, V, wallLen, wallDir, wallNormal, projSeg, polyArea, polyCentroid, pointInPoly,
  offsetPoly, roomMetrics, planBounds, rectRoom, rectPts, rectWallSegs, polyRoom, itemOutline, wallExt, wallRef,
} from './plan-geom.js';

const PLAN_CSS = `.wall{stroke:#24272B;stroke-linecap:butt}.room{stroke:none}.win{fill:#fff;stroke:#24272B}.door,.jamb{fill:none;stroke:#24272B}.winarc{fill:none;stroke:#24272B;opacity:.65}.rail{fill:#24272B;stroke:#24272B}.railp{stroke:#24272B}
  .item{stroke:#555}.itemback{stroke:#555}.itemtxt,.rname,.rarea,.wlen,.lbl{font-family:Inter,Arial,sans-serif;text-anchor:middle;fill:#24272B}
  .rname{font-weight:700}.rarea{fill:#00989A}.wlen{fill:#EB591F;font-weight:600}.dimg path{fill:none;stroke:#00989A}.dimg text{fill:#00989A;text-anchor:middle;font-family:Inter,Arial}`;

const TOOLS = [
  { k: 'select', t: 'Seç / Taşı', ic: 'pointer', key: 'v' },
  { k: 'pan', t: 'Kaydır', ic: 'hand', key: 'h' },
  { k: 'wall', t: 'Duvar', ic: 'wallT', key: 'w' },
  { k: 'rect', t: 'Dikdörtgen oda', ic: 'room', key: 'r' },
  { k: 'poly', t: 'Çokgen oda', ic: 'poly', key: 'g' },
  { k: 'door', t: 'Kapı', ic: 'door', key: 'd' },
  { k: 'window', t: 'Pencere', ic: 'window', key: 'p' },
  { k: 'rail', t: 'Korkuluk', ic: 'rail', key: 'k' },
  { k: 'item', t: 'Mobilya / donatı', ic: 'sofa', key: 'm' },
  { k: 'dim', t: 'Ölçü çizgisi', ic: 'dim', key: 'o' },
  { k: 'text', t: 'Yazı', ic: 'text', key: 't' },
];
/* kullanıcının araç seçimleri cihazda hatırlanır */
function pref(k, def) { try { const v = localStorage.getItem(k); return v === null ? def : v === '1'; } catch { return def; } }
function setPref(k, v) { try { localStorage.setItem(k, v ? '1' : '0'); } catch { /* yok say */ } }

/* açık çoklu çizgiyi d kadar öteler (d>0: kapanış yönüne göre içe); köşeler birleşik */
function offsetOpen(pts, d, ccw) {
  const n = pts.length;
  const segs = pts.slice(0, -1).map((a, i) => { const u = V.norm(V.sub(pts[i + 1], a)); return { u, nrm: { x: -u.y * ccw, y: u.x * ccw } }; });
  return pts.map((p, i) => {
    if (i === 0) return V.add(p, V.mul(segs[0].nrm, d));
    if (i === n - 1) return V.add(p, V.mul(segs[n - 2].nrm, d));
    const A = segs[i - 1], B = segs[i];
    const pa = V.add(p, V.mul(A.nrm, d)), pb = V.add(p, V.mul(B.nrm, d));
    const den = V.cross(A.u, B.u);
    if (Math.abs(den) < 1e-9) return pa;
    return V.add(pa, V.mul(A.u, V.cross(V.sub(pb, pa), B.u) / den));
  });
}
const chainSide = (pts, flip) => (Math.sign(polyArea(pts)) || 1) * (flip ? -1 : 1);

const HINTS = {
  select: 'Nesneye dokunup sürükleyin. Boş alanı sürükleyerek kaydırın, iki parmakla yakınlaştırın.',
  pan: 'Sürükleyerek görünümü kaydırın.',
  wall: 'Noktaları sırayla işaretleyin. Uzunluğu yazıp Enter / yön oku ile tam ölçü girin. Başlangıca dönünce oda kapanır (iç ölçüyle).',
  rect: 'Köşeden köşeye sürükleyin (iç ölçü). Ya da "Ölçüyle oda" ile en/boy girin.',
  poly: 'Köşeleri sırayla işaretleyin, ilk noktaya dokunarak ya da Bitir ile kapatın.',
  door: 'Bir duvara dokunun — kapı o konuma yerleşir.',
  window: 'Bir duvara dokunun — pencere o konuma yerleşir.',
  rail: 'Korkuluk hattının noktalarını duvar çizer gibi sırayla işaretleyin; Enter / Bitir ile tamamlayın. Uzunluğu yazıp Enter ile tam ölçü girin.',
  item: 'Listeden seçip plana dokunun.',
  dim: 'İki noktayı işaretleyin.',
  text: 'Yazı eklemek için plana dokunun.',
  calib: 'Altlık görselde bilinen bir mesafenin iki ucunu işaretleyin.',
  scale: 'Ölçüsünü bildiğiniz bir mesafenin (ör. bir duvar) iki ucunu işaretleyin; tüm plan gerçek ölçüye göre ölçeklenir.',
};
const OPEN_DEF = { door: { w: 90, h: 210, sill: 0 }, window: { w: 120, h: 140, sill: 90 }, gap: { w: 90, h: 220, sill: 0 } };

export class PlanEditor {
  constructor(host, plan, { onChange, resolvePhoto, pickBackground, addImage, cab, ghost } = {}) {
    this.addImage = addImage;
    this.ghost = ghost || null;   // proje çiziminde rölöve (mevcut durum) altlığı
    this.cabCtx = cab || {};      // mutfak/dolap tasarlayıcı: teklife ekleme, PDF, fiyatlar
    this.host = host;
    this.plan = plan || emptyPlan();
    this.plan.rails ||= [];
    this.onChange = onChange || (() => {});
    this.resolvePhoto = resolvePhoto;
    this.pickBackground = pickBackground;
    this.s = 0.5; this.ox = 40; this.oy = 40;
    this.tool = 'select';
    this.sel = null;              // { kind, id } — tek seçim (özellik paneli)
    this.msel = [];               // çoklu seçim [{ kind, id }] (2+ nesne)
    this.inst = uid('ed');        // bu editör örneği (yapıştırmada kaydırma için)
    this.pasteN = 0;
    this.chain = null;            // duvar/çokgen çizimi: { pts: [] , start }
    this.polyWalls = pref('tb-pe-polywalls', true);   // çokgen oda: duvarları da oluştur
    this.wallFace = pref('tb-pe-wallface', true);     // duvar aracı: çizgi = iç yüz, kalınlık dışa
    this.preview = null;          // imleç önizleme noktası
    this.snapInd = null;
    this.ptrs = new Map();
    this.g = null;                // aktif hareket
    this.undoS = []; this.redoS = [];
    this.opt = JSON.parse(localStorage.getItem('tb-plan-opt') || '{"snap":true,"ortho":true,"dims":true,"step":5}');
    this.itemType = 'kanepe';
    this.railPick = { kind: 'dikey', h: 110 };   // çizilecek korkuluk
    this.opPick = { door: { model: 'tek', use: 'ic' }, window: { model: 'cift', use: 'oda' } };   // yerleştirilecek kapı / pencere
    this.dir = null;              // klavye/HUD ile sabitlenen yön
    this.bgUrl = '';
    this.build();
    this.loadBg();
    requestAnimationFrame(() => this.fit());
  }

  /* ───────────── DOM ───────────── */
  build() {
    this.host.innerHTML = '';
    this.el = h(`<div class="pe">
      <div class="pe-tools">${TOOLS.map(t => `<button class="tool ${t.k === this.tool ? 'on' : ''}" data-tool="${t.k}" title="${t.t} (${t.key.toUpperCase()})">${icon(t.ic)}<span>${t.t}</span></button>`).join('')}</div>
      <div class="pe-stage">
        <div class="pe-bar">
          <button class="icon-btn" data-a="undo" title="Geri al (Ctrl+Z)">${icon('undo')}</button>
          <button class="icon-btn" data-a="redo" title="Yinele (Ctrl+Y)">${icon('redo')}</button>
          <span class="sep"></span>
          <button class="tgl ${this.opt.snap ? 'on' : ''}" data-o="snap" title="Izgaraya yasla">${icon('magnet')}<span>Yasla</span></button>
          <button class="tgl ${this.opt.ortho ? 'on' : ''}" data-o="ortho" title="Açı yakalama (0/45/90°)">${icon('grid')}<span>Orto</span></button>
          <button class="tgl ${this.opt.dims ? 'on' : ''}" data-o="dims" title="Duvar ölçülerini göster">${icon('ruler')}<span>Ölçüler</span></button>
          ${this.ghost ? `<button class="tgl ${this.opt.ghost !== false ? 'on' : ''}" data-o="ghost" title="Rölöveyi (mevcut durumu) soluk altlık olarak göster">${icon('layers')}<span>Rölöve altlığı</span></button>` : ''}
          <select class="mini" data-o="step" title="Yaslama adımı">${[1, 5, 10, 25, 50].map(n => `<option value="${n}" ${n === this.opt.step ? 'selected' : ''}>${n} cm</option>`).join('')}</select>
          <span class="sep"></span>
          <button class="icon-btn" data-a="fit" title="Sığdır">${icon('fit')}</button>
          <button class="icon-btn info-m" data-a="info" title="Plan bilgisi / metraj">${icon('layers')}</button>
          <button class="btn btn-xs btn-ghost" data-a="addRoom">${icon('plus')}Ölçüyle oda</button>
          <button class="btn btn-xs btn-ghost" data-a="bg">${icon('image')}Altlık</button>
          <button class="btn btn-xs btn-ghost" data-a="import">${icon('upload')}DXF / PDF aktar</button>
          <button class="btn btn-xs btn-ghost" data-a="scale">${icon('ruler')}Ölçekle</button>
          <button class="btn btn-xs btn-ghost" data-a="cab" title="Seçili duvara mutfak ya da giysi dolabı diz">${icon('kitchen')}Mutfak / dolap</button>
          <span class="sep"></span>
          <button class="tgl ${this.opt.box ? 'on' : ''}" data-o="box" title="Çoklu seçim: boş alanda sürükleyerek alan seçin, dokunarak ekleyin/çıkarın (Shift ile de olur)">${icon('layers')}<span>Çoklu seç</span></button>
          <button class="icon-btn" data-a="copy" title="Kopyala (Ctrl+C)">${icon('copy')}</button>
          <button class="icon-btn" data-a="cut" title="Kes (Ctrl+X)">${icon('cut')}</button>
          <button class="icon-btn" data-a="paste" title="Yapıştır (Ctrl+V)">${icon('paste')}</button>
          <button class="btn btn-xs btn-ghost danger-t" data-a="clear" title="Tüm çizimi temizle">${icon('trash')}Tümünü temizle</button>
        </div>
        <div class="pe-canvas">
          <svg class="pe-svg" tabindex="0"><g class="w"></g><g class="ui"></g></svg>
          <div class="pe-hud"></div>
          <div class="pe-zoom"></div>
        </div>
      </div>
      <aside class="pe-insp"></aside>
    </div>`);
    this.host.append(this.el);
    this.svg = $('.pe-svg', this.el);
    this.gW = $('g.w', this.svg); this.gUI = $('g.ui', this.svg);
    this.hud = $('.pe-hud', this.el);
    this.insp = $('.pe-insp', this.el);

    $('.pe-tools', this.el).onclick = e => { const b = e.target.closest('[data-tool]'); if (b) this.setTool(b.dataset.tool); };
    $('.pe-bar', this.el).onclick = e => {
      const a = e.target.closest('[data-a]')?.dataset.a, o = e.target.closest('button[data-o]')?.dataset.o;
      if (a === 'undo') this.undo(); else if (a === 'redo') this.redo(); else if (a === 'fit') this.fit();
      else if (a === 'cab') this.cabFromSelection();
      else if (a === 'copy') this.copySel(); else if (a === 'cut') this.cutSel(); else if (a === 'paste') this.paste(); else if (a === 'clear') this.clearAll();
      else if (a === 'addRoom') this.addRoomDialog(); else if (a === 'import') this.importDialog(); else if (a === 'scale') this.setTool('scale'); else if (a === 'info') this.el.classList.toggle('show-insp'); else if (a === 'bg') this.bgDialog();
      if (o) { this.opt[o] = o === 'ghost' ? this.opt.ghost === false : !this.opt[o]; e.target.closest('button').classList.toggle('on', this.opt[o]); this.saveOpt(); this.render(); }
    };
    $('select[data-o="step"]', this.el).onchange = e => { this.opt.step = +e.target.value; this.saveOpt(); };

    const sv = this.svg;
    sv.addEventListener('pointerdown', e => this.pDown(e));
    sv.addEventListener('pointermove', e => this.pMove(e));
    sv.addEventListener('pointerup', e => this.pUp(e));
    sv.addEventListener('pointercancel', e => this.pUp(e, true));
    sv.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse' && !this.g) { this.preview = null; this.renderUI(); } });
    sv.addEventListener('wheel', e => { e.preventDefault(); const r = sv.getBoundingClientRect(); this.zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
    sv.addEventListener('dblclick', e => {
      if (this.chain) return this.finishChain();
      if (this.tool !== 'select') return;
      const r = sv.getBoundingClientRect(), ht = this.hit(this.toW(e.clientX - r.left, e.clientY - r.top));
      const o = ht && ht.kind === 'item' && this.obj(ht);
      if (o?.type === 'cabinet') this.openCab(o);
    });
    sv.addEventListener('contextmenu', e => e.preventDefault());
    this.onKey = e => this.key(e);
    this.onKeyUp = e => { if (e.key === ' ') this.space = false; };
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('keyup', this.onKeyUp);
    this.ro = new ResizeObserver(() => this.render());
    this.ro.observe(this.svg);
    this.renderHud(); this.renderInsp();
  }
  destroy() {
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('keyup', this.onKeyUp);
    this.ro.disconnect();
  }
  saveOpt() { localStorage.setItem('tb-plan-opt', JSON.stringify(this.opt)); }

  setTool(t) {
    if (this.chain && this.tool !== t) this.finishChain();
    this.tool = t; this.dir = null; this.preview = null;
    if (t !== 'select') { this.sel = null; this.msel = []; }
    $$('.pe-tools .tool', this.el).forEach(b => b.classList.toggle('on', b.dataset.tool === t));
    this.svg.dataset.tool = t;
    this.renderHud(); this.renderInsp(); this.render();
  }

  /* ───────────── geçmiş ───────────── */
  snap() { this.undoS.push(JSON.stringify(this.plan)); if (this.undoS.length > 120) this.undoS.shift(); this.redoS = []; }
  changed() { this.onChange(this.plan); this.render(); this.renderInsp(); }
  undo() {
    if (!this.undoS.length) return;
    this.redoS.push(JSON.stringify(this.plan));
    this.plan = JSON.parse(this.undoS.pop());
    this.validateSel(); this.changed();
  }
  redo() {
    if (!this.redoS.length) return;
    this.undoS.push(JSON.stringify(this.plan));
    this.plan = JSON.parse(this.redoS.pop());
    this.validateSel(); this.changed();
  }
  validateSel() { if (this.sel && !this.obj(this.sel)) this.sel = null; }
  setPlan(p) { this.plan = p; p.rails ||= []; this.sel = null; this.undoS = []; this.redoS = []; this.loadBg(); this.changed(); this.fit(); }

  /* ───────────── koordinat ───────────── */
  toW(sx, sy) { return { x: (sx - this.ox) / this.s, y: (sy - this.oy) / this.s }; }
  evPt(e) { const r = this.svg.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  zoomAt(sx, sy, k) {
    const ns = Math.min(8, Math.max(0.03, this.s * k));
    const w = this.toW(sx, sy);
    this.s = ns; this.ox = sx - w.x * ns; this.oy = sy - w.y * ns;
    this.render();
  }
  fit() {
    const b = planBounds(this.plan), r = this.svg.getBoundingClientRect();
    if (!r.width) return;
    if (!b) { this.s = Math.min(r.width, r.height) / 1200; this.ox = r.width / 2 - 500 * this.s; this.oy = r.height / 2 - 400 * this.s; this.render(); return; }
    const pad = 70, bw = Math.max(100, b.x1 - b.x0), bh = Math.max(100, b.y1 - b.y0);
    this.s = Math.min((r.width - pad * 2) / bw, (r.height - pad * 2) / bh, 3);
    this.ox = (r.width - bw * this.s) / 2 - b.x0 * this.s;
    this.oy = (r.height - bh * this.s) / 2 - b.y0 * this.s;
    this.render();
  }

  /* ───────────── nesne erişimi ───────────── */
  coll(kind) { return { wall: 'walls', opening: 'openings', room: 'rooms', item: 'items', dim: 'dims', label: 'labels', rail: 'rails' }[kind]; }
  obj(sel) { return sel && this.plan[this.coll(sel.kind)]?.find(o => o.id === sel.id); }
  wall(id) { return this.plan.walls.find(w => w.id === id); }
  T(w) { return w.t || this.plan.meta.wallT; }

  /* duvar uç noktası p'ye denk gelen tüm (duvar, uç) çiftleri */
  endsAt(p) {
    const r = [];
    this.plan.walls.forEach(w => { if (V.eq(w.a, p)) r.push([w, 'a']); if (V.eq(w.b, p)) r.push([w, 'b']); });
    return r;
  }

  /* ───────────── yaslama ─────────────
   * Öncelik: köşe noktaları (duvar iç/dış yüz köşeleri, duvar uçları, oda köşeleri) →
   * duvar iç/dış yüzeyi (ortogonal çizimde yüzeyle kesişim) → yön/uzunluk → duvar ekseni → ızgara.
   */
  wallFaces() {
    const W = this.plan.walls;
    const sig = W.length + ':' + W.reduce((a, w) => a + w.a.x + w.a.y * 3 + w.b.x * 7 + w.b.y * 11 + (w.t || 0) * 13, 0);
    if (this._faces?.sig === sig) return this._faces;
    const faces = [], corners = [];
    const key = q => `${Math.round(q.x)}|${Math.round(q.y)}`, ends = new Map();
    for (const w of W) {
      const L = wallLen(w); if (L < 0.5) continue;
      const u = wallDir(w), n = wallNormal(w), t = this.T(w) / 2;
      const f = [1, -1].map(sg => ({ w, a: V.add(w.a, V.mul(n, t * sg)), b: V.add(w.b, V.mul(n, t * sg)), u }));
      faces.push(...f);
      for (const k of ['a', 'b']) { const kk = key(w[k]); if (!ends.has(kk)) ends.set(kk, []); ends.get(kk).push({ w, k, f }); }
    }
    // birleşim noktalarında yüz çizgilerinin kesişimleri = gerçek iç / dış köşeler
    const lineX = (A, B) => { const den = V.cross(A.u, B.u); if (Math.abs(den) < 1e-6) return null; return V.add(A.a, V.mul(A.u, V.cross(V.sub(B.a, A.a), B.u) / den)); };
    for (const list of ends.values()) {
      const P = list[0].w[list[0].k];
      if (list.length === 1) { const { f, k } = list[0]; corners.push(f[0][k], f[1][k]); continue; }   // serbest uç: duvar başının iki köşesi
      const tMax = Math.max(...list.map(e => this.T(e.w)));
      for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++)
        for (const A of list[i].f) for (const B of list[j].f) { const x = lineX(A, B); if (x && V.dist(x, P) <= tMax * 1.5) corners.push(x); }
    }
    return (this._faces = { sig, faces, corners });
  }

  snapPt(p, from = null, skip = null) {
    const thr = 14 / this.s;
    this.snapInd = null;
    const F = this.wallFaces();
    // 1) köşe noktaları: duvar yüz köşeleri, duvar uçları, oda köşeleri, çizilen zincir
    let best = null, bd = thr, bk = 'end';
    const cand = (q, k = 'end', wt = 1) => { const d = V.dist(p, q) * wt; if (d < bd) { bd = d; best = q; bk = k; } };
    F.corners.forEach(q => cand(q, 'corner'));
    // duvar ekseni uçları duvarın içinde kalır: yüz köşeleri yakınsa onlar tercih edilsin
    this.plan.walls.forEach(w => { if (w.id !== skip) { cand(w.a, 'end', 1.8); cand(w.b, 'end', 1.8); } });
    this.plan.rooms.forEach(r => r.pts.forEach(q => cand(q, 'corner')));
    (this.plan.rails || []).forEach(r => { if (r.id !== skip) { cand(r.a); cand(r.b); } });
    if (this.chain) this.chain.pts.forEach(q => cand(q));
    if (best) { const q = { x: +best.x.toFixed(2), y: +best.y.toFixed(2) }; this.snapInd = { ...q, k: bk }; return q; }
    // 2) duvar iç / dış yüzeyi
    let fb = null, fd = thr * 0.8;
    for (const f of F.faces) { if (f.w.id === skip) continue; const pr = projSeg(p, f.a, f.b); if (pr.d < fd) { fd = pr.d; fb = { f, q: pr.p }; } }
    if (fb) {
      let q = fb.q;
      if (from && (this.opt.ortho || this.dir)) {
        // ortogonal / sabit yönlü çizimde: yönün yüzeyle kesiştiği nokta (dik ölçü)
        let d = this.dir || V.sub(p, from);
        if (!this.dir) { const ang = Math.atan2(d.y, d.x), st = Math.PI / 4, sa = Math.round(ang / st) * st; d = Math.abs(ang - sa) < 0.14 ? { x: Math.cos(sa), y: Math.sin(sa) } : null; }
        if (d) {
          const den = V.cross(d, fb.f.u);
          if (Math.abs(den) > 1e-6) { const x = V.add(from, V.mul(d, V.cross(V.sub(fb.f.a, from), fb.f.u) / den)); if (V.dist(x, p) < thr * 2) q = x; }
        }
      }
      q = { x: +q.x.toFixed(2), y: +q.y.toFixed(2) };
      this.snapInd = { ...q, k: 'face', u: fb.f.u };
      return q;
    }
    // 2) yön sabit / ortogonal + uzunluk yaslama
    if (from) {
      let d = V.sub(p, from), L = V.len(d);
      if (this.dir) { d = this.dir; L = Math.max(0, V.dot(V.sub(p, from), d)); }
      else if (this.opt.ortho && L > 0) {
        const ang = Math.atan2(d.y, d.x), st = Math.PI / 4;
        const sa = Math.round(ang / st) * st;
        if (Math.abs(ang - sa) < 0.14) d = { x: Math.cos(sa), y: Math.sin(sa) };
        else d = V.norm(d);
      } else d = V.norm(d);
      if (this.opt.snap) L = Math.round(L / this.opt.step) * this.opt.step;
      const q = V.add(from, V.mul(d, L));
      // aynı eksende başka bir noktaya hizalama (ör. kapanış)
      return { x: +q.x.toFixed(2), y: +q.y.toFixed(2) };
    }
    // 3) duvar üzerine
    for (const w of this.plan.walls) {
      if (w.id === skip) continue;
      const pr = projSeg(p, w.a, w.b);
      if (pr.d < 10 / this.s && pr.t > 0.02 && pr.t < 0.98) { this.snapInd = { ...pr.p, k: 'on' }; return { ...pr.p }; }
    }
    // 4) ızgara
    if (this.opt.snap) { const st = this.opt.step; return { x: Math.round(p.x / st) * st, y: Math.round(p.y / st) * st }; }
    return p;
  }
  snapLen(v) { return this.opt.snap ? Math.round(v / this.opt.step) * this.opt.step : v; }

  /* ───────────── isabet testi ───────────── */
  hit(p) {
    const tol = 9 / this.s;
    // seçili nesnenin tutamaçları
    const so = this.obj(this.sel);
    if (so && this.sel.kind === 'wall') {
      const rf = wallRef(so, this.plan.meta.wallT, this.plan);
      for (const k of ['a', 'b']) if (V.dist(p, rf[k]) < 12 / this.s) return { kind: 'wall', id: so.id, handle: k };
    }
    if (so && this.sel.kind === 'rail') {
      for (const k of ['a', 'b']) if (V.dist(p, so[k]) < 12 / this.s) return { kind: 'rail', id: so.id, handle: k };
    }
    if (so && this.sel.kind === 'room') {
      const i = so.pts.findIndex(q => V.dist(p, q) < 12 / this.s);
      if (i >= 0) return { kind: 'room', id: so.id, handle: i };
    }
    if (so && this.sel.kind === 'item') {
      const hp = this.itemRotHandle(so);
      if (V.dist(p, hp) < 12 / this.s) return { kind: 'item', id: so.id, handle: 'rot' };
    }
    for (const o of this.plan.openings) {
      const w = this.wall(o.wallId); if (!w) continue;
      const u = wallDir(w), c = V.add(w.a, V.mul(u, o.pos));
      const pr = projSeg(p, V.sub(c, V.mul(u, o.w / 2)), V.add(c, V.mul(u, o.w / 2)));
      if (pr.d < Math.max(this.T(w) / 2, tol)) return { kind: 'opening', id: o.id };
    }
    for (const it of [...this.plan.items].reverse()) {
      const a = -it.rot * Math.PI / 180, d = V.sub(p, it);
      const lx = d.x * Math.cos(a) - d.y * Math.sin(a), ly = d.x * Math.sin(a) + d.y * Math.cos(a);
      if (Math.abs(lx) <= it.w / 2 + tol / 2 && Math.abs(ly) <= it.d / 2 + tol / 2) return { kind: 'item', id: it.id };
    }
    for (const r of this.plan.rails) if (projSeg(p, r.a, r.b).d < Math.max(6, tol)) return { kind: 'rail', id: r.id };
    for (const l of this.plan.labels) if (V.dist(p, l) < Math.max(l.size || 25, tol * 2)) return { kind: 'label', id: l.id };
    for (const d of this.plan.dims) { const [a, b] = this.dimPts(d); if (projSeg(p, a, b).d < tol) return { kind: 'dim', id: d.id }; }
    for (const w of this.plan.walls) if (projSeg(p, w.a, w.b).d < this.T(w) / 2 + tol / 2) return { kind: 'wall', id: w.id };
    for (const r of [...this.plan.rooms].reverse()) if (pointInPoly(p, r.pts)) return { kind: 'room', id: r.id };
    return null;
  }
  nearestWall(p, maxPx = 40) {
    let best = null, bd = maxPx / this.s;
    for (const w of this.plan.walls) { const pr = projSeg(p, w.a, w.b); if (pr.d < bd) { bd = pr.d; best = { w, pr }; } }
    return best;
  }
  /* araç seçimine göre yeni kapı / pencere (model + kullanım varsayılanları) */
  newOpening(t, wallId, pos, L) {
    const o = { id: uid('o'), wallId, type: t, pos, w: OPEN_DEF[t].w, h: OPEN_DEF[t].h, sill: OPEN_DEF[t].sill, flip: false, side: 1 };
    if (t === 'gap') return o;
    o.model = this.opPick[t].model;
    applyUse(o, this.opPick[t].use, L);
    o.model = this.opPick[t].model;
    return o;
  }
  opWidth(t) { return t === 'gap' ? OPEN_DEF.gap.w : ((t === 'door' ? DOOR_USES : WIN_USES).find(u => u.k === this.opPick[t].use) || OPEN_DEF[t]).w; }

  /* duvara monte donatı (priz, anahtar, batarya…): en yakın duvar yüzüne arkası dayalı konum + dönüş */
  wallMount(p, d, maxPx = 60) {
    let best = null, bd = Math.max(maxPx / this.s, 40);
    for (const f of this.wallFaces().faces) { const pr = projSeg(p, f.a, f.b); if (pr.d < bd) { bd = pr.d; best = { f, q: pr.p }; } }
    if (!best) return null;
    const m = V.norm(V.sub(best.f.a, best.f.w.a)), c = V.add(best.q, V.mul(m, d / 2));   // m: duvar ekseninden yüze, odaya doğru
    return { x: +c.x.toFixed(2), y: +c.y.toFixed(2), rot: (Math.round(Math.atan2(-m.x, m.y) * 180 / Math.PI) + 360) % 360 };
  }
  dimPts(d) {
    const u = V.norm(V.sub(d.b, d.a)), n = { x: -u.y, y: u.x };
    return [V.add(d.a, V.mul(n, d.off)), V.add(d.b, V.mul(n, d.off))];
  }
  itemRotHandle(it) {
    const a = it.rot * Math.PI / 180, r = it.d / 2 + 22 / this.s;
    return { x: it.x + Math.sin(a) * r, y: it.y - Math.cos(a) * r };
  }

  /* ───────────── işaretçi olayları ───────────── */
  pDown(e) {
    this.svg.focus({ preventScroll: true });
    this.svg.setPointerCapture(e.pointerId);
    const sp = this.evPt(e);
    this.ptrs.set(e.pointerId, sp);
    if (this.ptrs.size === 2) {
      if (this.g?.before && this.g.moved) { this.plan = JSON.parse(this.g.before); this.render(); }
      const [a, b] = [...this.ptrs.values()];
      this.g = { type: 'pinch', d: V.dist(a, b), m: V.lerp(a, b, 0.5), s: this.s, ox: this.ox, oy: this.oy };
      return;
    }
    if (this.ptrs.size > 2 || e.button === 2) return;
    const wp = this.toW(sp.x, sp.y);
    if (e.button === 1 || this.space || this.tool === 'pan') { this.g = { type: 'pan', sp, ox: this.ox, oy: this.oy }; return; }

    if (this.tool === 'select') {
      const ht = this.hit(wp);
      const multi = e.shiftKey || this.opt.box;
      // çoklu seçimdeki bir nesneyi tutup sürükleme → hepsini taşı
      if (ht && !ht.handle && this.msel.length && this.isSel(ht) && !e.shiftKey) {
        this.g = { type: 'mmove', sp, w0: wp, before: JSON.stringify(this.plan), moved: false, ht };
        return;
      }
      if (multi) {
        if (ht && !ht.handle) { this.g = { type: 'tapsel', sp, ht, moved: false }; return; }
        if (!ht) { this.g = { type: 'box', sp, p0: wp, p1: wp, add: e.shiftKey || this.opt.box, moved: false }; return; }
      }
      if (ht) {
        this.msel = [];
        const same = this.sel && this.sel.kind === ht.kind && this.sel.id === ht.id;
        this.sel = { kind: ht.kind, id: ht.id };
        if (!same) this.renderInsp();
        this.g = { type: 'move', ht, sp, w0: wp, before: JSON.stringify(this.plan), moved: false };
        this.render();
      } else this.g = { type: 'pan', sp, ox: this.ox, oy: this.oy, tap: true };
      return;
    }
    if (this.tool === 'rect') { const p = this.snapPt(wp); this.g = { type: 'rect', sp, p0: p, p1: p }; this.render(); return; }
    // diğer araçlar: parmak/fare kalkınca yerleştir
    this.g = { type: 'aim', sp, moved: false };
    this.aim(wp);
  }

  pMove(e) {
    const sp = this.evPt(e);
    if (this.ptrs.has(e.pointerId)) this.ptrs.set(e.pointerId, sp);
    const g = this.g;
    if (g?.type === 'pinch' && this.ptrs.size >= 2) {
      const [a, b] = [...this.ptrs.values()];
      const m = V.lerp(a, b, 0.5), k = V.dist(a, b) / g.d;
      const ns = Math.min(8, Math.max(0.03, g.s * k));
      const w = { x: (g.m.x - g.ox) / g.s, y: (g.m.y - g.oy) / g.s };
      this.s = ns; this.ox = m.x - w.x * ns; this.oy = m.y - w.y * ns;
      this.render(); return;
    }
    const wp = this.toW(sp.x, sp.y);
    if (!g) { // fare ile gezinme önizlemesi
      if (e.pointerType === 'mouse' && this.tool !== 'select' && this.tool !== 'pan') this.aim(wp);
      return;
    }
    if (V.dist(sp, g.sp) > 5) g.moved = true;
    if (g.type === 'pan') { if (g.moved) { this.ox = g.ox + sp.x - g.sp.x; this.oy = g.oy + sp.y - g.sp.y; this.render(); } return; }
    if (g.type === 'rect') { g.p1 = this.snapPt(wp); this.render(); return; }
    if (g.type === 'aim') { this.aim(wp); return; }
    if (g.type === 'box') { g.p1 = wp; this.renderUI(); return; }
    if (g.type === 'mmove' && g.moved) { this.dragMulti(g, wp); return; }
    if (g.type === 'move' && g.moved) this.drag(g, wp);
  }

  pUp(e, cancel = false) {
    this.ptrs.delete(e.pointerId);
    const g = this.g;
    if (!g) return;
    if (g.type === 'pinch') { if (this.ptrs.size === 0) this.g = null; return; }
    if (this.ptrs.size) return;
    this.g = null;
    if (cancel) { if (g.before && g.moved) { this.plan = JSON.parse(g.before); this.render(); } return; }
    const wp = this.toW(...Object.values(this.evPt(e)));
    if (g.type === 'pan') { if (g.tap && !g.moved && (this.sel || this.msel.length)) this.setSel([]); return; }
    if (g.type === 'move') {
      if (g.moved) { this.undoS.push(g.before); this.redoS = []; this.changed(); }
      return;
    }
    if (g.type === 'mmove') {
      if (g.moved) { this.undoS.push(g.before); this.redoS = []; this.changed(); }
      else if (!this.opt.box) { this.setSel([g.ht]); }   // dokunup bırakınca yalnız onu seç
      return;
    }
    if (g.type === 'tapsel') { if (!g.moved) this.toggleSel(g.ht); return; }
    if (g.type === 'box') {
      if (!g.moved) { if (!this.opt.box) this.setSel([]); return; }
      this.boxSelect(g.p0, g.p1, g.add);
      return;
    }
    if (g.type === 'rect') {
      const w = Math.abs(g.p1.x - g.p0.x), l = Math.abs(g.p1.y - g.p0.y);
      if (w >= 30 && l >= 30) {
        this.snap();
        const r = rectRoom(this.plan, Math.min(g.p0.x, g.p1.x), Math.min(g.p0.y, g.p1.y), w, l, this.nextRoomName());
        this.sel = { kind: 'room', id: r.id };
        this.changed();
      } else this.render();
      return;
    }
    if (g.type === 'aim') this.place(wp, e);
  }

  /* önizleme noktası hesapla */
  aim(wp) {
    const t = this.tool;
    if (t === 'wall' || t === 'poly' || t === 'rail' || t === 'dim' || t === 'calib' || t === 'scale') {
      const from = this.chain?.pts.at(-1) || null;
      this.preview = this.snapPt(wp, from);
    } else if (t === 'door' || t === 'window') {
      const nw = this.nearestWall(wp);
      if (nw) {
        const L = wallLen(nw.w), dw = this.opWidth(t);
        let pos = this.snapLen(nw.pr.t * L);
        pos = Math.max(dw / 2 + 2, Math.min(L - dw / 2 - 2, pos));
        this.preview = { wallId: nw.w.id, pos, w: Math.min(dw, L - 4) };
      } else this.preview = null;
    } else this.preview = this.snapPt(wp);
    this.renderUI();
  }

  place(wp, e) {
    const t = this.tool, p = this.preview;
    if (t === 'wall' || t === 'poly' || t === 'rail' || t === 'dim' || t === 'calib' || t === 'scale') {
      if (!p) return;
      if (!this.chain) { this.chain = { pts: [p] }; this.renderHud(); this.renderUI(); return; }
      this.addChainPt(p);
      return;
    }
    if ((t === 'door' || t === 'window') && p?.wallId) {
      this.snap();
      const o = this.newOpening(t, p.wallId, p.pos, wallLen(this.wall(p.wallId)));
      o.w = p.w;
      this.plan.openings.push(o);
      this.sel = { kind: 'opening', id: o.id };
      this.setTool('select'); this.changed();
      return;
    }
    if (t === 'item' && p) {
      this.snap();
      const f = furnOf(this.itemType);
      const it = { id: uid('i'), type: f.k, label: f.t, x: p.x, y: p.y, w: f.w, d: f.d, h: f.h, z: f.z || 0, rot: 0, color: f.c };
      if (f.mount === 'wall') Object.assign(it, this.wallMount(p, f.d) || {});
      this.plan.items.push(it);
      this.sel = { kind: 'item', id: it.id };
      this.setTool('select'); this.changed();
      return;
    }
    if (t === 'text' && p) {
      promptDlg('Yazı', '', 'örn. Kolon, Şaft, Kuzey ↑').then(txt => {
        if (!txt) return;
        this.snap();
        const l = { id: uid('l'), x: p.x, y: p.y, text: txt, size: 25 };
        this.plan.labels.push(l); this.sel = { kind: 'label', id: l.id };
        this.setTool('select'); this.changed();
      });
    }
  }

  addChainPt(p) {
    const c = this.chain, t = this.tool, last = c.pts.at(-1);
    if (V.dist(p, last) < 1) return;
    if (t === 'dim') {
      this.snap();
      this.plan.dims.push({ id: uid('d'), a: last, b: p, off: 40 });
      this.chain = null; this.changed(); this.renderHud(); return;
    }
    if (t === 'calib') { this.chain = null; this.calibrate(last, p); return; }
    if (t === 'scale') { this.chain = null; this.scalePlan(last, p); return; }
    const closes = c.pts.length >= 3 && V.eq(p, c.pts[0], 1);
    if (t === 'wall') {
      if (!c.started) { this.snap(); c.started = true; c.wallIds = []; c.face = this.wallFace; }
      const w = { id: uid('w'), a: { ...last }, b: { ...p }, t: this.plan.meta.wallT, h: 0 };
      this.plan.walls.push(w); c.wallIds.push(w.id);
      if (closes) {
        c.closed = true; this.layoutChain(c);
        // kapalı duvar zinciri → oda: iç yüz çizildiyse çizilen çokgen zaten net iç ölçüdür
        const pts = c.face ? c.pts.map(q => ({ ...q })) : offsetPoly(c.pts, this.plan.meta.wallT / 2);
        const room = { id: uid('r'), name: this.nextRoomName(), pts, floor: 'parke', wallColor: '', h: 0, walls: [...c.wallIds] };
        if (Math.abs(polyArea(c.pts)) > 1e4) this.plan.rooms.push(room);
        this.chain = null; this.dir = null; this.changed(); this.renderHud(); return;
      }
      c.pts.push(p); this.layoutChain(c); this.dir = null; this.changed(); this.renderHud(); return;
    }
    if (t === 'rail') {
      if (!c.started) { this.snap(); c.started = true; }
      const r = { id: uid('k'), a: { ...last }, b: { ...p }, kind: this.railPick.kind, h: this.railPick.h };
      this.plan.rails.push(r); c.last = r.id;
      if (closes) { this.chain = null; this.sel = { kind: 'rail', id: r.id }; this.changed(); this.renderHud(); return; }
      c.pts.push(p); this.dir = null; this.changed(); this.renderHud(); return;
    }
    if (t === 'poly') {
      if (closes) { this.finishChain(); return; }
      c.pts.push(p); this.renderHud(); this.renderUI();
    }
  }

  /* çizilen zincirin duvar eksenlerini yerleştir: iç yüz modunda kalınlık dışa (kapanış yönünün tersine) */
  layoutChain(c) {
    if (!c.wallIds?.length) return;
    const walls = c.wallIds.map(id => this.wall(id)).filter(Boolean);
    if (!c.face) return;
    const off = -this.plan.meta.wallT / 2;
    if (c.closed) {
      const q = offsetPoly(c.pts, off);
      walls.forEach((w, i) => { w.a = q[i]; w.b = q[(i + 1) % q.length]; });
    } else {
      const q = offsetOpen(c.pts, off, chainSide(c.pts, c.flip));
      walls.forEach((w, i) => { w.a = q[i]; w.b = q[i + 1]; });
    }
    walls.forEach((w, i) => {
      w.t = this.plan.meta.wallT; ['a', 'b'].forEach(k => { w[k] = { x: +w[k].x.toFixed(2), y: +w[k].y.toFixed(2) }; });
      w.face = V.dot(V.sub(c.pts[i], w.a), wallNormal(w)) >= 0 ? 1 : -1;   // tutamaçlar işaretlenen yüz noktalarında kalsın
    });
  }

  finishChain() {
    const c = this.chain; if (!c) return;
    if (this.tool === 'poly' && c.pts.length >= 3) {
      this.snap();
      const r = polyRoom(this.plan, c.pts, this.nextRoomName(), this.polyWalls);
      this.sel = { kind: 'room', id: r.id };
      this.chain = null; this.setTool('select'); this.changed(); return;
    }
    if (this.tool === 'rail' && c.last) this.sel = { kind: 'rail', id: c.last };
    this.chain = null; this.dir = null; this.renderHud(); this.render(); if (this.sel) this.renderInsp();
  }

  /* sayısal giriş: mevcut yönde L cm ilerle */
  typedLen(L, dirKey) {
    if (!this.chain || !(L > 0)) return;
    const from = this.chain.pts.at(-1);
    const dirs = { r: { x: 1, y: 0 }, l: { x: -1, y: 0 }, u: { x: 0, y: -1 }, d: { x: 0, y: 1 } };
    let d = dirKey ? dirs[dirKey] : this.dir;
    if (!d) d = this.preview && V.dist(this.preview, from) > 0.5 ? V.norm(V.sub(this.preview, from)) : { x: 1, y: 0 };
    const p = V.add(from, V.mul(d, L));
    this.addChainPt({ x: +p.x.toFixed(2), y: +p.y.toFixed(2) });
    this.preview = null; this.renderUI();
  }

  /* sürükleme */
  drag(g, wp) {
    this.plan = JSON.parse(g.before);
    const { ht } = g, o = this.obj(ht);
    if (!o) return;
    const dRaw = V.sub(wp, g.w0);
    const sd = { x: this.snapLen(dRaw.x), y: this.snapLen(dRaw.y) };
    if (ht.kind === 'wall') {
      if (ht.handle) {
        // tutamaç çizim çizgisinde (yüz ya da eksen); eksen aynı ofsetle izler
        const rf = wallRef(o, this.plan.meta.wallT, this.plan), off = V.sub(o[ht.handle], rf[ht.handle]);
        const other = ht.handle === 'a' ? rf.b : rf.a;
        const np = V.add(this.snapPt(wp, other, o.id), off);
        this.endsAt(o[ht.handle]).forEach(([w, k]) => { w[k] = { x: +np.x.toFixed(2), y: +np.y.toFixed(2) }; });
        this.preview = null;
      } else {
        const n = wallNormal(o), k = this.snapLen(V.dot(dRaw, n)), sh = V.mul(n, k);
        const ea = this.endsAt(o.a), eb = this.endsAt(o.b), A = V.add(o.a, sh), B = V.add(o.b, sh);
        ea.forEach(([w, k2]) => { w[k2] = { ...A }; }); eb.forEach(([w, k2]) => { w[k2] = { ...B }; });
      }
    } else if (ht.kind === 'room') {
      if (typeof ht.handle === 'number') { o.pts[ht.handle] = this.snapPt(wp); o.rect = false; }
      else {
        o.pts = o.pts.map(p => V.add(p, sd));
        (o.walls || []).forEach(id => { const w = this.wall(id); if (w) { w.a = V.add(w.a, sd); w.b = V.add(w.b, sd); } });
        this.plan.items.forEach(it => { if (pointInPoly(V.sub(it, sd), o.pts)) Object.assign(it, V.add(it, sd)); });
      }
    } else if (ht.kind === 'opening') {
      const w = this.wall(o.wallId), L = wallLen(w);
      const pr = projSeg(wp, w.a, w.b);
      o.pos = Math.max(o.w / 2 + 1, Math.min(L - o.w / 2 - 1, this.snapLen(pr.t * L)));
    } else if (ht.kind === 'item') {
      if (ht.handle === 'rot') {
        const a = Math.atan2(wp.x - o.x, -(wp.y - o.y)) * 180 / Math.PI;
        o.rot = (Math.round(a / 15) * 15 + 360) % 360;
      } else {
        o.x += sd.x; o.y += sd.y;
        if (fixtureOf(o.type)?.mount === 'wall') Object.assign(o, this.wallMount(o, o.d, 30) || {});
      }
    } else if (ht.kind === 'rail') {
      if (ht.handle) o[ht.handle] = this.snapPt(wp, ht.handle === 'a' ? o.b : o.a, o.id);
      else { o.a = V.add(o.a, sd); o.b = V.add(o.b, sd); }
    } else if (ht.kind === 'label') { o.x += sd.x; o.y += sd.y; }
    else if (ht.kind === 'dim') {
      const u = V.norm(V.sub(o.b, o.a)), n = { x: -u.y, y: u.x };
      o.off = Math.round(o.off + V.dot(dRaw, n));
    }
    this.render();
  }

  /* ───────────── klavye ───────────── */
  key(e) {
    if (!this.el.isConnected || this.el.offsetParent === null) return;
    const tag = e.target.tagName, typing = (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') && !e.target.closest('.pe-hud');
    if (typing || document.querySelector('.modal-back')) return;
    const k = e.key, ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && k.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? this.redo() : this.undo(); return; }
    if (ctrl && k.toLowerCase() === 'y') { e.preventDefault(); this.redo(); return; }
    if (e.target.closest('.pe-hud')) return;
    if (k === ' ') { this.space = true; e.preventDefault(); return; }
    if (k === 'Escape') { if (this.chain) this.finishChain(); else if (this.sel || this.msel.length) this.setSel([]); else this.setTool('select'); return; }
    if (k === 'Enter' && this.chain) { this.finishChain(); return; }
    if (ctrl && !this.chain && ['c', 'x', 'v', 'a'].includes(k.toLowerCase())) {
      e.preventDefault();
      ({ c: () => this.copySel(), x: () => this.cutSel(), v: () => this.paste(), a: () => this.selectAll() })[k.toLowerCase()]();
      return;
    }
    if ((k === 'Delete' || k === 'Backspace') && (this.sel || this.msel.length)) { e.preventDefault(); this.del(); return; }
    if (this.chain && /^[0-9]$/.test(k)) { const i = $('#peLen', this.hud); if (i) { i.focus(); i.value = k; e.preventDefault(); } return; }
    if (this.chain && k.startsWith('Arrow')) {
      e.preventDefault();
      this.dir = { ArrowRight: { x: 1, y: 0 }, ArrowLeft: { x: -1, y: 0 }, ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 } }[k];
      $('#peLen', this.hud)?.focus(); this.renderUI(); return;
    }
    if (ctrl) return;
    const t = TOOLS.find(x => x.key === k.toLowerCase());
    if (t) this.setTool(t.k);
  }

  /* ───────────── düzenleme işlemleri ───────────── */
  del() {
    const list = this.selList(); if (!list.length) return;
    this.snap();
    this.removeObjs(list);
    this.sel = null; this.msel = []; this.changed();
  }
  removeObjs(list) {
    const P = this.plan, ids = k => new Set(list.filter(s => s.kind === k).map(s => s.id));
    const W = ids('wall');
    for (const k of ['wall', 'opening', 'room', 'item', 'dim', 'label', 'rail']) { const S = ids(k), c = this.coll(k); if (S.size) P[c] = P[c].filter(o => !S.has(o.id)); }
    if (W.size) {
      P.openings = P.openings.filter(o => !W.has(o.wallId));
      P.rooms.forEach(r => { if (r.walls) r.walls = r.walls.map(id => W.has(id) ? null : id); });
    }
  }

  /* ───────────── seçim (tek / çoklu) ───────────── */
  selList() { return this.msel.length ? this.msel : (this.sel ? [this.sel] : []); }
  isSel(ht) { return this.selList().some(s => s.kind === ht.kind && s.id === ht.id); }
  setSel(list) {
    list = list.filter(s => this.obj(s));
    if (list.length === 1) { this.sel = list[0]; this.msel = []; } else { this.sel = null; this.msel = list; }
    this.renderInsp(); this.render();
  }
  toggleSel(ht) {
    const cur = this.selList().map(s => ({ kind: s.kind, id: s.id }));
    const i = cur.findIndex(s => s.kind === ht.kind && s.id === ht.id);
    if (i >= 0) cur.splice(i, 1); else cur.push({ kind: ht.kind, id: ht.id });
    this.setSel(cur);
  }
  selectAll() {
    const P = this.plan, all = [];
    for (const k of ['wall', 'room', 'item', 'dim', 'label', 'rail']) P[this.coll(k)].forEach(o => all.push({ kind: k, id: o.id }));
    if (this.tool !== 'select') this.setTool('select');
    this.setSel(all);
  }
  /* alanın tamamen içinde kalan nesneleri seç */
  boxSelect(p0, p1, add) {
    const x0 = Math.min(p0.x, p1.x), x1 = Math.max(p0.x, p1.x), y0 = Math.min(p0.y, p1.y), y1 = Math.max(p0.y, p1.y);
    const inB = q => q.x >= x0 && q.x <= x1 && q.y >= y0 && q.y <= y1;
    const P = this.plan, found = [];
    P.walls.forEach(w => { if (inB(w.a) && inB(w.b)) found.push({ kind: 'wall', id: w.id }); });
    P.rooms.forEach(r => { if (r.pts.every(inB)) found.push({ kind: 'room', id: r.id }); });
    P.items.forEach(i => { if (inB(i)) found.push({ kind: 'item', id: i.id }); });
    P.labels.forEach(l => { if (inB(l)) found.push({ kind: 'label', id: l.id }); });
    P.dims.forEach(d => { if (inB(d.a) && inB(d.b)) found.push({ kind: 'dim', id: d.id }); });
    P.rails.forEach(r => { if (inB(r.a) && inB(r.b)) found.push({ kind: 'rail', id: r.id }); });
    const cur = add ? this.selList().slice() : [];
    for (const f of found) if (!cur.some(s => s.kind === f.kind && s.id === f.id)) cur.push(f);
    this.setSel(cur);
  }
  /* seçili nesnelerin taşınacak geometrisi: odaların duvarları da dahil */
  moveSet(list) {
    const W = new Set(list.filter(s => s.kind === 'wall').map(s => s.id));
    list.filter(s => s.kind === 'room').forEach(s => (this.obj(s)?.walls || []).forEach(id => id && W.add(id)));
    return W;
  }
  dragMulti(g, wp) {
    this.plan = JSON.parse(g.before);
    const d = V.sub(wp, g.w0), sd = { x: this.snapLen(d.x), y: this.snapLen(d.y) };
    this.translate(this.selList(), sd);
    this.render();
  }
  translate(list, sd) {
    const P = this.plan, W = this.moveSet(list), has = k => new Set(list.filter(s => s.kind === k).map(s => s.id));
    P.walls.forEach(w => { if (W.has(w.id)) { w.a = V.add(w.a, sd); w.b = V.add(w.b, sd); } });
    const R = has('room'), I = has('item'), L = has('label'), D = has('dim'), K = has('rail');
    P.rails.forEach(r => { if (K.has(r.id)) { r.a = V.add(r.a, sd); r.b = V.add(r.b, sd); } });
    P.rooms.forEach(r => { if (R.has(r.id)) r.pts = r.pts.map(q => V.add(q, sd)); });
    P.items.forEach(i => { if (I.has(i.id)) { i.x += sd.x; i.y += sd.y; } });
    P.labels.forEach(l => { if (L.has(l.id)) { l.x += sd.x; l.y += sd.y; } });
    P.dims.forEach(m => { if (D.has(m.id)) { m.a = V.add(m.a, sd); m.b = V.add(m.b, sd); } });
  }

  /* ───────────── kopyala / kes / yapıştır / temizle ───────────── */
  copySel(quiet = false) {
    const list = this.selList();
    if (!list.length) { toast('Önce kopyalanacak nesneleri seçin', 'err'); return false; }
    const P = this.plan, W = this.moveSet(list), has = k => new Set(list.filter(s => s.kind === k).map(s => s.id));
    const O = has('opening');
    const clip = {
      src: this.inst, at: Date.now(),
      walls: P.walls.filter(w => W.has(w.id)),
      openings: P.openings.filter(o => W.has(o.wallId)),
      rooms: P.rooms.filter(r => has('room').has(r.id)),
      items: P.items.filter(i => has('item').has(i.id)),
      dims: P.dims.filter(d => has('dim').has(d.id)),
      labels: P.labels.filter(l => has('label').has(l.id)),
      rails: P.rails.filter(r => has('rail').has(r.id)),
    };
    // yalnız kapı/pencere seçildiyse: kendi duvarlarıyla birlikte değil, ayrı kopyalanamaz → uyar
    if (O.size && !clip.walls.length && list.every(s => s.kind === 'opening')) { toast('Kapı / pencere duvarıyla birlikte kopyalanır — duvarı da seçin', 'err'); return false; }
    clip.n = clip.walls.length + clip.rooms.length + clip.items.length + clip.dims.length + clip.labels.length + clip.rails.length;
    const json = JSON.stringify(clip);
    this.clip = json; this.pasteN = 0;
    try { localStorage.setItem('tb-plan-clip', json); } catch { /* büyük olabilir; bellekte kalır */ }
    if (!quiet) toast(`${clip.n} nesne kopyalandı`);
    return true;
  }
  cutSel() {
    if (!this.copySel(true)) return;
    const n = JSON.parse(this.clip).n;
    this.del();
    toast(`${n} nesne kesildi — yapıştırmak için Ctrl+V`);
  }
  paste() {
    let json = null;
    try { json = localStorage.getItem('tb-plan-clip'); } catch { /* yok */ }
    json = json || this.clip;
    if (!json) { toast('Panoda çizim yok — önce kopyalayın', 'err'); return; }
    const c = JSON.parse(json), P = this.plan;
    // aynı çizimde her yapıştırmada biraz kaydır; başka işten geldiyse aynı konuma koy
    const k = c.src === this.inst ? ++this.pasteN * 50 : 0, sd = { x: k, y: k };
    const map = {}, nid = (p, old) => (map[old] = uid(p));
    this.snap();
    const sel = [];
    c.walls.forEach(w => { const n = { ...w, id: nid('w', w.id), a: V.add(w.a, sd), b: V.add(w.b, sd) }; P.walls.push(n); sel.push({ kind: 'wall', id: n.id }); });
    c.openings.forEach(o => { if (map[o.wallId]) P.openings.push({ ...o, id: uid('o'), wallId: map[o.wallId] }); });
    c.rooms.forEach(r => { const n = { ...r, id: uid('r'), pts: r.pts.map(q => V.add(q, sd)), walls: (r.walls || []).map(id => map[id] || null) }; P.rooms.push(n); sel.push({ kind: 'room', id: n.id }); });
    c.items.forEach(i => { const n = { ...i, id: uid('i'), x: i.x + sd.x, y: i.y + sd.y }; P.items.push(n); sel.push({ kind: 'item', id: n.id }); });
    c.dims.forEach(d => { const n = { ...d, id: uid('d'), a: V.add(d.a, sd), b: V.add(d.b, sd) }; P.dims.push(n); sel.push({ kind: 'dim', id: n.id }); });
    c.labels.forEach(l => { const n = { ...l, id: uid('l'), x: l.x + sd.x, y: l.y + sd.y }; P.labels.push(n); sel.push({ kind: 'label', id: n.id }); });
    (c.rails || []).forEach(r => { const n = { ...r, id: uid('k'), a: V.add(r.a, sd), b: V.add(r.b, sd) }; P.rails.push(n); sel.push({ kind: 'rail', id: n.id }); });
    if (this.tool !== 'select') this.setTool('select');
    this.onChange(this.plan);
    this.setSel(sel);
    toast(`${c.n} nesne yapıştırıldı — seçili; sürükleyerek yerleştirin`);
  }
  async clearAll() {
    const P = this.plan, n = P.walls.length + P.rooms.length + P.items.length + P.dims.length + P.labels.length + P.rails.length;
    if (!n) { toast('Çizim zaten boş'); return; }
    if (!await confirmDlg(`Tüm çizimi silmek istediğinize emin misiniz? ${P.walls.length} duvar, ${P.rooms.length} oda, ${P.openings.length} kapı/pencere, ${P.items.length} donatı, ${P.rails.length} korkuluk, ${P.dims.length + P.labels.length} ölçü/yazı silinecek. Altlık görseli ve plan ayarları korunur; "Geri al" ile geri getirebilirsiniz.`, 'Tümünü sil')) return;
    if (this.chain) { this.chain = null; this.renderHud(); }
    this.snap();
    Object.assign(P, { walls: [], openings: [], rooms: [], items: [], dims: [], labels: [], rails: [] });
    this.sel = null; this.msel = []; this.pasteN = 0;
    this.changed();
    toast('Çizim temizlendi');
  }
  nextRoomName() { return `Oda ${this.plan.rooms.length + 1}`; }

  /* ───────────── mutfak / giysi dolabı ───────────── */
  async cabFromSelection() {
    const w = this.sel?.kind === 'wall' ? this.obj(this.sel) : null;
    if (!w) { toast('Önce dolabın yerleşeceği duvarı seçin (Seç aracıyla duvara dokunun)', 'err'); if (this.tool !== 'select') this.setTool('select'); return; }
    const r = await modal({ title: 'Bu duvara ne dizilsin?', body: '<p class="muted">Dolaplar duvarın oda tarafındaki iç yüzüne, kapı ve pencereler gözetilerek otomatik dizilir; ardından tasarlayıcı açılır.</p>',
      actions: [{ k: 'no', t: 'Vazgeç' }, { k: 'vestiyer', t: 'Vestiyer' }, { k: 'wardrobe', t: 'Giysi dolabı' }, { k: 'kitchen', t: 'Mutfak', cls: 'btn-primary' }] });
    if (r?.k === 'kitchen' || r?.k === 'wardrobe') this.createCab(r.k, w);
    if (r?.k === 'vestiyer') this.vestiyerDialog(w);
  }
  /* vestiyer: çamaşır makinesi / kurutma / termosifon dolaba alınacak mı */
  async vestiyerDialog(w) {
    const r = await modal({ title: 'Vestiyer', body: `<p class="muted">Antre / koridor dolabı. Askılık, oturak, ayakkabılık ve ayna modülleriyle dizilir; aşağıdaki cihazlar için uygun derinlikte, havalandırmalı kapaklı modül eklenir.</p>
      <label class="check"><input type="checkbox" id="vW"> Çamaşır makinesi yeri <small>(60×85 cm, zemine oturur, su / gider bağlantısı)</small></label>
      <label class="check"><input type="checkbox" id="vD"> Kurutma makinesi <small>(çamaşır makinesinin üstüne, kolon)</small></label>
      <label class="check"><input type="checkbox" id="vB"> Termosifon <small>(Ø45 cm, dolabın üst bölümünde, duvara asılı)</small></label>`,
      actions: [{ k: 'no', t: 'Vazgeç' }, { k: 'ok', t: 'Diz ve tasarla', cls: 'btn-primary', icon: 'check' }],
      onOpen: el => { const W = $('#vW', el), Dr = $('#vD', el); Dr.onchange = () => { if (Dr.checked) W.checked = true; }; W.onchange = () => { if (!W.checked) Dr.checked = false; }; } });
    if (r?.k !== 'ok') return;
    this.createCab('wardrobe', w, 'vestiyer', { washer: $('#vW', r.el).checked, dryer: $('#vD', r.el).checked, boiler: $('#vB', r.el).checked });
  }
  /* duvarın oda tarafındaki iç yüzüne dolap dizisi oluştur */
  createCab(kind, w, style = '', opts = null) {
    const P = this.plan, t = this.T(w) / 2, u = wallDir(w), n = wallNormal(w), mid = V.lerp(w.a, w.b, 0.5);
    const inRoom = sg => P.rooms.some(r => pointInPoly(V.add(mid, V.mul(n, sg * (t + 40))), r.pts));
    const side = !inRoom(1) && inRoom(-1) ? -1 : 1, nin = V.mul(n, side);
    const trim = p => { const o = this.endsAt(p).filter(([x]) => x.id !== w.id); return o.length ? Math.max(...o.map(([x]) => this.T(x))) / 2 : 0; };
    let A = V.add(V.add(w.a, V.mul(nin, t)), V.mul(u, trim(w.a))), B = V.add(V.add(w.b, V.mul(nin, t)), V.mul(u, -trim(w.b))), dir = u;
    if (-dir.y * nin.x + dir.x * nin.y < 0) { [A, B] = [B, A]; dir = V.mul(u, -1); }
    const L = Math.round(V.dist(A, B) * 2) / 2;
    if (L < 30) { toast('Duvar dolap dizmek için çok kısa', 'err'); return; }
    const obstacles = P.openings.filter(o => o.wallId === w.id).map(o => {
      const c = V.add(w.a, V.mul(u, o.pos)), x = V.dot(V.sub(c, A), dir);
      return { x0: x - o.w / 2, x1: x + o.w / 2, type: o.type, sill: o.sill, h: o.h };
    });
    const cab = newCabinet(kind, L, style); if (opts) Object.assign(cab.opts, opts);
    autoFill(cab, L, obstacles); cab.avail = L;
    const d = itemDims(cab);
    const c = V.add(V.add(A, V.mul(dir, d.w / 2)), V.mul(nin, d.d / 2));
    const rot = ((Math.atan2(dir.y, dir.x) * 180 / Math.PI) % 360 + 360) % 360;
    const it = { id: uid('i'), type: 'cabinet', label: style === 'vestiyer' ? 'Vestiyer' : kind === 'wardrobe' ? 'Giysi dolabı' : 'Mutfak', x: +c.x.toFixed(2), y: +c.y.toFixed(2), w: d.w, d: d.d, h: d.h, z: 0, rot: +rot.toFixed(2), color: cabPick(FRONTS, cab.mat.front).c, cab };
    this.snap(); P.items.push(it);
    if (this.tool !== 'select') this.setTool('select');
    this.sel = { kind: 'item', id: it.id }; this.msel = [];
    this.changed();
    this.openCab(it);
  }
  /* nesnenin arkasındaki duvarda kalan kapı / pencereler (dizi koordinatında) */
  cabObstacles(it) {
    const a = it.rot * Math.PI / 180, cs = Math.cos(a), sn = Math.sin(a), out = [];
    for (const o of this.plan.openings) {
      const w = this.wall(o.wallId); if (!w) continue;
      const u = wallDir(w); if (Math.abs(u.x * cs + u.y * sn) < 0.95) continue;
      const c = V.add(w.a, V.mul(u, o.pos)), rx = c.x - it.x, ry = c.y - it.y;
      const lx = cs * rx + sn * ry, ly = -sn * rx + cs * ry, T = this.T(w);
      if (Math.abs(ly + it.d / 2 + T / 2) > T / 2 + 8) continue;
      const x = lx + it.w / 2;
      if (x + o.w / 2 < -5 || x - o.w / 2 > it.w + 5) continue;
      out.push({ x0: x - o.w / 2, x1: x + o.w / 2, type: o.type, sill: o.sill, h: o.h });
    }
    return out;
  }
  async openCab(it) {
    if (!it?.cab) return;
    const { openCabinetDesigner } = await import('./cabdesign.js');
    const r = await openCabinetDesigner(it, { obstacles: this.cabObstacles(it), wallH: this.plan.meta.wallH, avail: it.cab.avail || it.w, ...this.cabCtx });
    if (!r) return;
    const o = this.plan.items.find(x => x.id === it.id); if (!o) return;
    this.snap();
    // dizinin sol-arka köşesi sabit kalsın
    const a = o.rot * Math.PI / 180, u = { x: Math.cos(a), y: Math.sin(a) }, nf = { x: -u.y, y: u.x };
    const corner = V.sub(V.sub({ x: o.x, y: o.y }, V.mul(u, o.w / 2)), V.mul(nf, o.d / 2));
    const d = itemDims(r.cab);
    Object.assign(o, { cab: { ...r.cab, avail: it.cab.avail || it.w }, label: r.label, w: d.w, d: d.d, h: d.h, color: cabPick(FRONTS, r.cab.mat.front).c });
    const c = V.add(V.add(corner, V.mul(u, d.w / 2)), V.mul(nf, d.d / 2));
    o.x = +c.x.toFixed(2); o.y = +c.y.toFixed(2);
    this.changed();
  }

  async addRoomDialog() {
    const sr = this.sel?.kind === 'room' ? this.obj(this.sel) : null;
    const r = await modal({ title: 'Ölçüyle oda ekle', body: `
      <div class="grid2">
        <label>Oda adı<input class="inp" id="rn" list="roomTypes" value="${esc(this.nextRoomName())}"></label>
        <label>Konum<select class="inp" id="rp">
          ${sr ? `<option value="r">"${esc(sr.name)}" sağına</option><option value="d">"${esc(sr.name)}" altına</option><option value="l">"${esc(sr.name)}" soluna</option><option value="u">"${esc(sr.name)}" üstüne</option>` : ''}
          <option value="n">Ayrı (planın sağına)</option></select></label>
        <label>Genişlik (iç, cm)<input class="inp" id="rw" type="number" inputmode="decimal" value="400"></label>
        <label>Uzunluk (iç, cm)<input class="inp" id="rl" type="number" inputmode="decimal" value="350"></label>
      </div><datalist id="roomTypes">${ROOM_TYPES.map(t => `<option value="${t}">`).join('')}</datalist>
      <p class="muted small">Duvar kalınlığı: ${this.plan.meta.wallT} cm. Bitişik odalar arasındaki ortak duvar tekrar oluşturulmaz.</p>`,
      actions: [{ k: 'no', t: 'Vazgeç' }, { k: 'ok', t: 'Ekle', cls: 'btn-primary' }] });
    if (r?.k !== 'ok') return;
    const w = +$('#rw', r.el).value, l = +$('#rl', r.el).value, pos = $('#rp', r.el).value, name = $('#rn', r.el).value || 'Oda';
    if (!(w > 0 && l > 0)) return;
    const t = this.plan.meta.wallT;
    let x0 = 0, y0 = 0;
    if (sr && pos !== 'n') {
      const xs = sr.pts.map(p => p.x), ys = sr.pts.map(p => p.y);
      const X0 = Math.min(...xs), X1 = Math.max(...xs), Y0 = Math.min(...ys), Y1 = Math.max(...ys);
      ({ r: () => { x0 = X1 + t; y0 = Y0; }, l: () => { x0 = X0 - t - w; y0 = Y0; }, d: () => { x0 = X0; y0 = Y1 + t; }, u: () => { x0 = X0; y0 = Y0 - t - l; } })[pos]();
    } else {
      const b = planBounds(this.plan);
      if (b) { x0 = b.x1 + t + 100; y0 = b.y0 + t; }
    }
    this.snap();
    const room = rectRoom(this.plan, x0, y0, w, l, name);
    this.sel = { kind: 'room', id: room.id };
    this.setTool('select'); this.changed(); this.fit();
  }

  /* dikdörtgen odanın ölçüsünü değiştir (duvarlarıyla birlikte) */
  resizeRect(room, w, l) {
    const xs = room.pts.map(p => p.x), ys = room.pts.map(p => p.y), x0 = Math.min(...xs), y0 = Math.min(...ys);
    room.pts = rectPts(x0, y0, w, l);
    const segs = rectWallSegs(x0, y0, w, l, this.plan.meta.wallT);
    (room.walls || []).forEach((id, i) => {
      const wl = id && this.wall(id); if (!wl) return;
      const L0 = wallLen(wl);
      wl.a = segs[i][0]; wl.b = segs[i][1];
      const L1 = wallLen(wl);
      this.plan.openings.filter(o => o.wallId === id).forEach(o => { o.pos = Math.max(o.w / 2, Math.min(L1 - o.w / 2, o.pos * (L1 / L0))); });
    });
  }

  /* ───────────── altlık görsel (kroki fotoğrafı) ───────────── */
  async loadBg() {
    const bg = this.plan.meta.bg;
    this.bgUrl = bg && this.resolvePhoto ? await this.resolvePhoto(bg.photoId) : '';
    this.render();
  }
  async bgDialog() {
    const bg = this.plan.meta.bg;
    const r = await modal({ title: 'Altlık görsel (kroki / rölöve fotoğrafı)', body: `
      <p class="muted">Elle çizilmiş krokinin ya da mimari projenin fotoğrafını plana altlık yapın, üzerinden çizin.</p>
      ${bg ? `<label>Saydamlık <input type="range" id="bgo" min="0.1" max="1" step="0.05" value="${bg.opacity}"></label>
      <label>Genişlik (cm)<input class="inp" type="number" id="bgw" value="${Math.round(bg.w)}"></label>` : ''}`,
      actions: [
        ...(bg ? [{ k: 'del', t: 'Kaldır', cls: 'btn-danger' }, { k: 'cal', t: 'Ölçekle (2 nokta)', icon: 'ruler' }, { k: 'ok', t: 'Uygula', cls: 'btn-primary' }] : []),
        { k: 'pick', t: bg ? 'Görseli değiştir' : 'Görsel seç', cls: bg ? 'btn-ghost' : 'btn-primary', icon: 'image' },
      ] });
    if (!r) return;
    if (r.k === 'pick' && this.pickBackground) {
      const ph = await this.pickBackground(); if (!ph) return;
      const url = await this.resolvePhoto(ph.id);
      const img = new Image(); img.src = url; await img.decode().catch(() => {});
      const ar = img.naturalWidth ? img.naturalHeight / img.naturalWidth : 0.75;
      const b = planBounds(this.plan);
      this.snap();
      this.plan.meta.bg = { photoId: ph.id, x: b ? b.x0 : 0, y: b ? b.y0 : 0, w: b ? Math.max(500, b.x1 - b.x0) : 1000, ar, opacity: 0.5 };
      this.bgUrl = url; this.changed(); this.fit();
      this.setTool('calib');
    } else if (r.k === 'del') { this.snap(); this.plan.meta.bg = null; this.bgUrl = ''; this.changed(); }
    else if (r.k === 'ok' || r.k === 'cal') {
      this.snap();
      bg.opacity = +$('#bgo', r.el).value; bg.w = +$('#bgw', r.el).value || bg.w;
      this.changed();
      if (r.k === 'cal') this.setTool('calib');
    }
  }
  async importDialog() {
    const { openImportDialog } = await import('./importui.js');
    return openImportDialog(this, { addImage: this.addImage });
  }
  /* tüm planı iki nokta arasındaki gerçek ölçüye göre ölçekle (içe aktarılan PDF/DXF ölçeği için) */
  async scalePlan(a, b) {
    const d = V.dist(a, b);
    const v = await promptDlg(`İşaretlenen mesafe planda ${fmtNum(d, 1)} cm. Gerçek ölçü (cm)?`, Math.round(d));
    this.setTool('select');
    const real = parseFloat(String(v).replace(',', '.'));
    if (!(real > 0) || d < 1) return;
    const f = real / d, P = this.plan, sp = p => ({ x: +(a.x + (p.x - a.x) * f).toFixed(1), y: +(a.y + (p.y - a.y) * f).toFixed(1) });
    this.snap();
    P.walls.forEach(w => { w.a = sp(w.a); w.b = sp(w.b); });
    P.openings.forEach(o => { o.pos *= f; o.w = Math.round(o.w * f); });
    P.rooms.forEach(r => { r.pts = r.pts.map(sp); });
    P.items.forEach(i => Object.assign(i, sp(i)));
    P.dims.forEach(dm => { dm.a = sp(dm.a); dm.b = sp(dm.b); });
    P.labels.forEach(l => Object.assign(l, sp(l)));
    if (P.meta.bg) { const o = sp(P.meta.bg); P.meta.bg.x = o.x; P.meta.bg.y = o.y; P.meta.bg.w *= f; }
    this.changed(); this.fit();
  }
  async calibrate(a, b) {
    const d = V.dist(a, b);
    const v = await promptDlg(`İşaretlenen mesafe planda ${fmtNum(d, 0)} cm. Gerçek ölçü (cm)?`, Math.round(d));
    this.setTool('select');
    const real = parseFloat(String(v).replace(',', '.'));
    const bg = this.plan.meta.bg;
    if (!(real > 0) || !bg) return;
    const f = real / d;
    this.snap();
    bg.x = a.x + (bg.x - a.x) * f; bg.y = a.y + (bg.y - a.y) * f; bg.w *= f;
    this.changed(); this.fit();
  }

  /* ───────────── çizim ───────────── */
  render() {
    const r = this.svg.getBoundingClientRect();
    this.gW.setAttribute('transform', `matrix(${this.s} 0 0 ${this.s} ${this.ox} ${this.oy})`);
    this.gW.innerHTML = this.grid(r) + this.drawPlan(this.plan, this.s, true) + this.ghostSvg();
    this.renderUI();
    const z = $('.pe-zoom', this.el);
    if (z) z.innerHTML = this.scaleBar();
  }
  /* rölöve altlığı: mevcut duvarların dış hatları kesik çizgiyle (yıkılan / korunan duvarlar görünsün) */
  ghostSvg() {
    const G = this.ghost; if (!G || this.opt.ghost === false) return '';
    const px = n => n / this.s, T = G.meta?.wallT || 15;
    let o = '';
    for (const w of G.walls) {
      const n = wallNormal(w), t = (w.t || T) / 2, a1 = V.add(w.a, V.mul(n, t)), b1 = V.add(w.b, V.mul(n, t)), a2 = V.sub(w.a, V.mul(n, t)), b2 = V.sub(w.b, V.mul(n, t));
      o += `<path d="M${a1.x} ${a1.y}L${b1.x} ${b1.y}L${b2.x} ${b2.y}L${a2.x} ${a2.y}Z"/>`;
    }
    for (const op of G.openings || []) {
      const w = G.walls.find(x => x.id === op.wallId); if (!w) continue;
      const u = wallDir(w), c = V.add(w.a, V.mul(u, op.pos)), A = V.sub(c, V.mul(u, op.w / 2)), B = V.add(c, V.mul(u, op.w / 2));
      o += `<line x1="${A.x}" y1="${A.y}" x2="${B.x}" y2="${B.y}" stroke-width="${px(3)}" stroke-dasharray="none"/>`;
    }
    return `<g class="ghost" fill="none" stroke="#7B5CC4" stroke-opacity=".55" stroke-width="${px(1.4)}" stroke-dasharray="${px(6)} ${px(4)}" pointer-events="none">${o}</g>`;
  }
  scaleBar() {
    const target = 90 / this.s, steps = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000];
    const v = steps.find(x => x >= target) || 5000;
    return `<span class="sb" style="width:${v * this.s}px"></span><span>${v >= 100 ? v / 100 + ' m' : v + ' cm'}</span>`;
  }
  grid(r) {
    const a = this.toW(0, 0), b = this.toW(r.width, r.height);
    const minor = this.s * 10 >= 7 ? 10 : this.s * 50 >= 7 ? 50 : 100;
    const lines = (st, cls) => {
      let o = '';
      for (let x = Math.floor(a.x / st) * st; x <= b.x; x += st) o += `M${x} ${a.y}V${b.y}`;
      for (let y = Math.floor(a.y / st) * st; y <= b.y; y += st) o += `M${a.x} ${y}H${b.x}`;
      return `<path class="${cls}" d="${o}" stroke-width="${1 / this.s}"/>`;
    };
    return (minor < 100 ? lines(minor, 'gmin') : '') + lines(100, 'gmaj');
  }

  /* tüm plan → SVG metni (editör + dışa aktarma ortak) */
  drawPlan(P, s, live = false) {
    const px = n => n / s;
    const meta = P.meta;
    let o = '';
    if (meta.bg && (live ? this.bgUrl : meta.bg.href)) {
      const bg = meta.bg;
      o += `<image href="${esc(live ? this.bgUrl : bg.href)}" x="${bg.x}" y="${bg.y}" width="${bg.w}" height="${bg.w * bg.ar}" opacity="${bg.opacity}" preserveAspectRatio="none"/>`;
    }
    // odalar
    for (const r of P.rooms) {
      const f = floorOf(r.floor);
      o += `<polygon class="room ${live && this.sel?.id === r.id ? 'sel' : ''}" points="${r.pts.map(p => `${p.x},${p.y}`).join(' ')}" fill="${f.c}" fill-opacity="0.28"/>`;
      if (r.tile && tileable(r)) {   // karo derzleri, oda sınırına kırpılmış
        const cid = 'tclip-' + r.id;
        o += `<clipPath id="${cid}"><polygon points="${r.pts.map(p => `${p.x},${p.y}`).join(' ')}"/></clipPath><path class="tile-j" clip-path="url(#${cid})" d="${tilePlanPath(tileLayout(r))}" fill="none" stroke="#8E8778" stroke-opacity="0.45" stroke-width="${px(0.6)}"/>`;
      }
    }
    // duvarlar
    for (const w of P.walls) {   // uçlar: ortak köşede yarım kalınlık uzar, serbest uçta tam noktada biter
      const e = wallExt(P, w), u = wallDir(w), A = V.sub(w.a, V.mul(u, e.a)), B = V.add(w.b, V.mul(u, e.b));
      o += `<line class="wall" x1="${A.x}" y1="${A.y}" x2="${B.x}" y2="${B.y}" stroke-width="${w.t || meta.wallT}"/>`;
    }
    // açıklıklar
    for (const op of P.openings) {
      const w = P.walls.find(x => x.id === op.wallId); if (!w) continue;
      const t = w.t || meta.wallT, u = wallDir(w), n = wallNormal(w);
      const c = V.add(w.a, V.mul(u, op.pos)), A = V.sub(c, V.mul(u, op.w / 2)), B = V.add(c, V.mul(u, op.w / 2));
      const isSel = live && this.sel?.id === op.id;
      o += `<line x1="${A.x}" y1="${A.y}" x2="${B.x}" y2="${B.y}" stroke="#fff" stroke-width="${t + px(1.5)}"/>`;
      const sd = op.side || 1, PT = (f, k) => V.add(V.lerp(A, B, f), V.mul(n, k)), L2 = (p1, p2) => `M${p1.x} ${p1.y}L${p2.x} ${p2.y}`;
      if (op.type === 'window') {
        const wm = winModel(op), k1 = t / 2, k2 = t / 6;
        let d = L2(PT(0, k1), PT(1, k1)) + L2(PT(1, k1), PT(1, -k1)) + L2(PT(1, -k1), PT(0, -k1)) + L2(PT(0, -k1), PT(0, k1));
        if (wm === 'sabit') d += L2(PT(0, 0), PT(1, 0));
        else if (wm === 'surme') d += L2(PT(0, k2), PT(0.54, k2)) + L2(PT(0.46, -k2), PT(1, -k2));
        else d += L2(PT(0, k2), PT(1, k2)) + L2(PT(0, -k2), PT(1, -k2));
        const S = sashes(op);
        if (wm !== 'surme') S.forEach(([x0]) => { if (x0 > 0) d += L2(PT(x0, k1), PT(x0, -k1)); });
        o += `<path class="win" d="${d}" stroke-width="${px(1.3)}"/>`;
        // açılır kanat yayları (kesik çizgi, iç tarafa)
        if (['tek', 'tekacvas', 'cift', 'acvas', 'uclu'].includes(wm)) {
          let arcs = '';
          S.forEach(([x0, x1, open]) => {
            if (!open) return;
            const atStart = winHingeAtStart(op, x0), hf = atStart ? x0 : x1, of = atStart ? x1 : x0, Ls = (x1 - x0) * op.w;
            const H = PT(hf, sd * k1), O = PT(of, sd * k1), L = V.add(H, V.mul(n, sd * Ls));
            const sweep = V.cross(V.sub(L, H), V.sub(O, H)) > 0 ? 1 : 0;
            arcs += `M${H.x} ${H.y}L${L.x} ${L.y}A${Ls} ${Ls} 0 0 ${sweep} ${O.x} ${O.y}`;
          });
          o += `<path class="winarc" d="${arcs}" stroke-width="${px(0.9)}" stroke-dasharray="${px(4)} ${px(3)}"/>`;
        }
        if (winTilt(op)) { const c1 = PT(0.5, sd * (k1 + Math.min(op.w * 0.18, 18))); o += `<path class="winarc" d="${L2(PT(0.3, sd * k1), c1)}${L2(c1, PT(0.7, sd * k1))}" stroke-width="${px(0.9)}"/>`; }   // vasistas: üstten devrilme işareti
        if (winRail(op)) {
          const k = -sd * (k1 + 5); let r = L2(PT(0, k), PT(1, k));
          for (let f = 0; f <= 1.0001; f += 0.125) r += L2(PT(f, -sd * k1), PT(f, k));
          o += `<path class="win" d="${r}" stroke-width="${px(1)}"/>`;
        }
      } else if (op.type === 'door') {
        const dm = doorModel(op);
        if (dm === 'surgu') {
          const k0 = sd * (t / 2 + 1), k5 = sd * (t / 2 + 5), dir = op.flip ? -1 : 1;
          o += `<path class="door" d="${L2(PT(-0.03, k0), PT(1.03, k0))}${L2(PT(1.03, k0), PT(1.03, k5))}${L2(PT(1.03, k5), PT(-0.03, k5))}${L2(PT(-0.03, k5), PT(-0.03, k0))}" stroke-width="${px(1.3)}"/>`;
          const r0 = dir > 0 ? 1.03 : -0.03, r1 = dir > 0 ? 2.03 : -1.03, km = sd * (t / 2 + 7);
          o += `<path class="winarc" d="${L2(PT(r0, km), PT(r1, km))}" stroke-width="${px(0.9)}" stroke-dasharray="${px(4)} ${px(3)}"/>`;
          const ah = PT(0.5 + dir * 0.25, sd * (t / 2 + 14)), at = PT(0.5 - dir * 0.15, sd * (t / 2 + 14));
          o += `<path class="door" d="${L2(at, ah)}M${ah.x} ${ah.y}L${PT(0.5 + dir * 0.17, sd * (t / 2 + 10)).x} ${PT(0.5 + dir * 0.17, sd * (t / 2 + 10)).y}M${ah.x} ${ah.y}L${PT(0.5 + dir * 0.17, sd * (t / 2 + 18)).x} ${PT(0.5 + dir * 0.17, sd * (t / 2 + 18)).y}" stroke-width="${px(1)}"/>`;
        } else if (dm === 'gomme') {
          const f0 = op.flip ? -1 : 1, f1 = op.flip ? 0 : 2, kp = t / 4;
          o += `<path class="winarc" d="${L2(PT(f0, kp), PT(f1, kp))}${L2(PT(f1, kp), PT(f1, -kp))}${L2(PT(f1, -kp), PT(f0, -kp))}" stroke-width="${px(1)}" stroke-dasharray="${px(4)} ${px(3)}"/>`;
          o += `<path class="door" d="${L2(PT(0, 2), PT(1, 2))}${L2(PT(1, 2), PT(1, -2))}${L2(PT(1, -2), PT(0, -2))}${L2(PT(0, -2), PT(0, 2))}" stroke-width="${px(1.3)}"/>`;
        } else if (dm === 'katlanir') {
          const h0 = op.flip ? 1 : 0, dir = op.flip ? -1 : 1, pw = 1 / 4;
          const pts = [PT(h0, sd * t / 2)];
          for (let i = 1; i <= 4; i++) pts.push(PT(h0 + dir * i * pw * 0.5, sd * (t / 2 + (i % 2 ? op.w * pw * 0.86 : 0))));
          o += `<path class="door" d="M${pts.map(q => `${q.x} ${q.y}`).join('L')}" stroke-width="${px(1.3)}"/>`;
          o += `<path class="winarc" d="${L2(pts[4], PT(op.flip ? 0 : 1, sd * t / 2))}" stroke-width="${px(0.9)}" stroke-dasharray="${px(4)} ${px(3)}"/>`;
        } else {
          let d = '';
          for (const [s0, s1, hk] of leaves(op)) {
            const lw = (s1 - s0) * op.w, H = PT(hk === 'a' ? s0 : s1, sd * t / 2), O = PT(hk === 'a' ? s1 : s0, sd * t / 2), L = V.add(H, V.mul(n, sd * lw));
            const sweep = V.cross(V.sub(L, H), V.sub(O, H)) > 0 ? 1 : 0;
            d += `M${H.x} ${H.y}L${L.x} ${L.y}A${lw} ${lw} 0 0 ${sweep} ${O.x} ${O.y}`;
          }
          o += `<path class="door" d="${d}" stroke-width="${px(1.3)}"/>`;
        }
        o += `<line class="jamb" x1="${A.x - n.x * t / 2}" y1="${A.y - n.y * t / 2}" x2="${A.x + n.x * t / 2}" y2="${A.y + n.y * t / 2}" stroke-width="${px(1.5)}"/><line class="jamb" x1="${B.x - n.x * t / 2}" y1="${B.y - n.y * t / 2}" x2="${B.x + n.x * t / 2}" y2="${B.y + n.y * t / 2}" stroke-width="${px(1.5)}"/>`;
      }
      if (isSel) o += `<line class="selline" x1="${A.x}" y1="${A.y}" x2="${B.x}" y2="${B.y}" stroke-width="${t + px(6)}"/>`;
    }
    // korkuluklar: iki ince çizgi + dikmeler; dolu parapet taralı; cam panel orta çizgi
    for (const r of P.rails || []) {
      const L = V.dist(r.a, r.b); if (L < 1) continue;
      const u = V.norm(V.sub(r.b, r.a)), n = { x: -u.y, y: u.x }, kd = railKind(r), isSel = live && this.sel?.id === r.id;
      const Q = (f, k) => V.add(V.lerp(r.a, r.b, f), V.mul(n, k)), seg = (p1, p2) => `M${p1.x} ${p1.y}L${p2.x} ${p2.y}`;
      if (kd.k === 'dolu') {
        const c = [Q(0, 6), Q(1, 6), Q(1, -6), Q(0, -6)];
        o += `<polygon class="railp" points="${c.map(q => `${q.x},${q.y}`).join(' ')}" fill="${kd.c}" stroke-width="${px(1.2)}"/>`;
      } else {
        let d = seg(Q(0, 3), Q(1, 3)) + seg(Q(0, -3), Q(1, -3));
        const np = Math.max(1, Math.ceil(L / 120));
        for (let i = 0; i <= np; i++) { const f = i / np, c = V.lerp(r.a, r.b, f); d += `M${c.x - 3} ${c.y - 3}h6v6h-6Z`; }
        o += `<path class="rail" d="${d}" stroke-width="${px(1.2)}"/>`;
        if (kd.k === 'cam') o += `<line x1="${r.a.x}" y1="${r.a.y}" x2="${r.b.x}" y2="${r.b.y}" stroke="#6FB7C4" stroke-width="${Math.max(px(2), 2)}"/>`;
      }
      if (isSel) o += `<line class="selline" x1="${r.a.x}" y1="${r.a.y}" x2="${r.b.x}" y2="${r.b.y}" stroke-width="${px(12)}"/>`;
    }
    // mobilyalar
    for (const it of P.items) {
      const isSel = live && this.sel?.id === it.id;
      if (it.type === 'cabinet' && it.cab) {
        o += `<g transform="translate(${it.x} ${it.y}) rotate(${it.rot})">${planSymbol(it, px)}${isSel ? `<rect class="item sel" x="${-it.w / 2}" y="${-it.d / 2}" width="${it.w}" height="${it.d}" fill="none" stroke-width="${px(1.6)}"/>` : ''}</g>`;
        continue;
      }
      if (fixtureOf(it.type)) {
        o += `<g transform="translate(${it.x} ${it.y}) rotate(${it.rot})">${isSel ? `<rect class="item sel" x="${-it.w / 2 - px(3)}" y="${-it.d / 2 - px(3)}" width="${it.w + px(6)}" height="${it.d + px(6)}" fill="none" stroke-width="${px(1.4)}" stroke-dasharray="${px(4)} ${px(3)}"/>` : ''}${fixtureSvg(it, px)}</g>`;
        continue;
      }
      const fs = Math.min(px(11), it.w / 5, 22);
      o += `<g transform="translate(${it.x} ${it.y}) rotate(${it.rot})">${itemShape(it, isSel, px)}
        ${fs > px(6) ? `<text class="itemtxt" y="${(it.type === 'ukanepe' ? -it.d / 2 + Math.min(95, it.d * 0.45, it.w * 0.32) / 2 : 0) + fs * 0.35}" font-size="${fs}"${it.rot > 90 && it.rot <= 270 ? ' transform="rotate(180)"' : ''}>${esc(it.label)}</text>` : ''}</g>`;
    }
    // ölçü çizgileri
    for (const d of P.dims) {
      const [a, b] = this.dimPts(d), L = V.dist(d.a, d.b), u = V.norm(V.sub(b, a)), n = { x: -u.y, y: u.x }, tk = px(5);
      const m = V.lerp(a, b, 0.5); let ang = Math.atan2(u.y, u.x) * 180 / Math.PI; if (ang > 90 || ang < -90) ang += 180;
      const tp = V.add(m, V.mul(n, (d.off >= 0 ? 1 : -1) * px(9)));
      o += `<g class="dimg ${live && this.sel?.id === d.id ? 'sel' : ''}"><path d="M${d.a.x} ${d.a.y}L${a.x} ${a.y}M${d.b.x} ${d.b.y}L${b.x} ${b.y}M${a.x} ${a.y}L${b.x} ${b.y}M${a.x - (u.x + n.x) * tk} ${a.y - (u.y + n.y) * tk}L${a.x + (u.x + n.x) * tk} ${a.y + (u.y + n.y) * tk}M${b.x - (u.x + n.x) * tk} ${b.y - (u.y + n.y) * tk}L${b.x + (u.x + n.x) * tk} ${b.y + (u.y + n.y) * tk}" stroke-width="${px(1.2)}"/>
        <text x="${tp.x}" y="${tp.y}" font-size="${px(12)}" transform="rotate(${ang} ${tp.x} ${tp.y})" dy="${px(4)}">${fmtNum(L, 1)}</text></g>`;
    }
    // duvar ölçüleri
    if (this.opt.dims) for (const w of P.walls) {
      // yüzden çizilen duvarda çizilen (yüz) uzunluğu, yüz tarafında yazılır
      const rf = wallRef(w, meta.wallT, P), L = V.dist(rf.a, rf.b); if (L * s < 34) continue;
      const u = wallDir(w), n = wallNormal(w), m = V.lerp(w.a, w.b, 0.5), t = w.t || meta.wallT;
      const tp = V.add(m, V.mul(n, (w.face || -1) * (t / 2 + px(9))));
      let ang = Math.atan2(u.y, u.x) * 180 / Math.PI; if (ang > 90 || ang < -90) ang += 180;
      o += `<text class="wlen" x="${tp.x}" y="${tp.y}" font-size="${px(11)}" dy="${px(4)}" transform="rotate(${ang} ${tp.x} ${tp.y})">${fmtNum(L, 1)}</text>`;
    }
    // oda etiketleri
    for (const r of P.rooms) {
      const c = polyCentroid(r.pts), m = roomMetrics(P, r);
      o += `<text class="rname" x="${c.x}" y="${c.y}" font-size="${px(13)}">${esc(r.name)}</text><text class="rarea" x="${c.x}" y="${c.y + px(15)}" font-size="${px(11)}">${fmtNum(m.area)} m²</text>`;
    }
    // yazılar
    for (const l of P.labels) o += `<text class="lbl ${live && this.sel?.id === l.id ? 'sel' : ''}" x="${l.x}" y="${l.y}" font-size="${l.size || 25}">${esc(l.text)}</text>`;
    return o;
  }

  /* üst katman: seçim tutamaçları, önizleme */
  renderUI() {
    const s = this.s, px = n => n / s;
    let o = '';
    const so = this.obj(this.sel);
    if (so) {
      if (this.sel.kind === 'wall') {
        const rf = wallRef(so, this.plan.meta.wallT, this.plan);
        o += `<line class="selline" x1="${so.a.x}" y1="${so.a.y}" x2="${so.b.x}" y2="${so.b.y}" stroke-width="${this.T(so) + px(6)}"/>`;
        o += [rf.a, rf.b].map(p => `<circle class="hdl" cx="${p.x}" cy="${p.y}" r="${px(7)}" stroke-width="${px(2)}"/>`).join('');
      } else if (this.sel.kind === 'rail') {
        o += `<line class="selline" x1="${so.a.x}" y1="${so.a.y}" x2="${so.b.x}" y2="${so.b.y}" stroke-width="${px(12)}"/>`;
        o += [so.a, so.b].map(p => `<circle class="hdl" cx="${p.x}" cy="${p.y}" r="${px(7)}" stroke-width="${px(2)}"/>`).join('');
      } else if (this.sel.kind === 'room') {
        o += `<polygon class="selpoly" points="${so.pts.map(p => `${p.x},${p.y}`).join(' ')}" stroke-width="${px(2)}" stroke-dasharray="${px(6)} ${px(4)}"/>`;
        o += so.pts.map(p => `<circle class="hdl" cx="${p.x}" cy="${p.y}" r="${px(6)}" stroke-width="${px(2)}"/>`).join('');
      } else if (this.sel.kind === 'item') {
        const hp = this.itemRotHandle(so);
        o += `<line class="rotln" x1="${so.x}" y1="${so.y}" x2="${hp.x}" y2="${hp.y}" stroke-width="${px(1.5)}"/><circle class="hdl rot" cx="${hp.x}" cy="${hp.y}" r="${px(7)}" stroke-width="${px(2)}"/>`;
      }
    }
    for (const ms of this.msel) {
      const m = this.obj(ms); if (!m) continue;
      if (ms.kind === 'wall') o += `<line class="selline" x1="${m.a.x}" y1="${m.a.y}" x2="${m.b.x}" y2="${m.b.y}" stroke-width="${this.T(m) + px(6)}"/>`;
      else if (ms.kind === 'room') o += `<polygon class="selpoly" points="${m.pts.map(p => `${p.x},${p.y}`).join(' ')}" stroke-width="${px(2)}" stroke-dasharray="${px(6)} ${px(4)}"/>`;
      else if (ms.kind === 'item') o += `<rect class="selpoly" x="${m.x - m.w / 2}" y="${m.y - m.d / 2}" width="${m.w}" height="${m.d}" transform="rotate(${m.rot || 0} ${m.x} ${m.y})" stroke-width="${px(2)}" stroke-dasharray="${px(6)} ${px(4)}"/>`;
      else if (ms.kind === 'label') o += `<circle class="selpoly" cx="${m.x}" cy="${m.y}" r="${(m.size || 25) * 1.2}" stroke-width="${px(2)}" stroke-dasharray="${px(6)} ${px(4)}"/>`;
      else if (ms.kind === 'rail') o += `<line class="selline" x1="${m.a.x}" y1="${m.a.y}" x2="${m.b.x}" y2="${m.b.y}" stroke-width="${px(12)}"/>`;
      else if (ms.kind === 'dim') { const [a, b] = this.dimPts(m); o += `<line class="selline" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke-width="${px(8)}"/>`; }
    }
    const g = this.g;
    if (g?.type === 'box' && g.moved) {
      const x = Math.min(g.p0.x, g.p1.x), y = Math.min(g.p0.y, g.p1.y);
      o += `<rect class="boxsel" x="${x}" y="${y}" width="${Math.abs(g.p1.x - g.p0.x)}" height="${Math.abs(g.p1.y - g.p0.y)}" stroke-width="${px(1.5)}" stroke-dasharray="${px(5)} ${px(4)}"/>`;
    }
    if (g?.type === 'rect') {
      const x = Math.min(g.p0.x, g.p1.x), y = Math.min(g.p0.y, g.p1.y), w = Math.abs(g.p1.x - g.p0.x), l = Math.abs(g.p1.y - g.p0.y);
      o += `<rect class="prev" x="${x}" y="${y}" width="${w}" height="${l}" stroke-width="${px(2)}"/>`;
      o += `<text class="prevtxt" x="${x + w / 2}" y="${y + l / 2}" font-size="${px(14)}">${fmtNum(w, 0)} × ${fmtNum(l, 0)} cm</text>`;
    }
    const p = this.preview, c = this.chain;
    if (c) {
      if (c.pts.length > 1) o += `<polyline class="prev" points="${c.pts.map(q => `${q.x},${q.y}`).join(' ')}" stroke-width="${px(2)}"/>`;
      const last = c.pts.at(-1);
      if (p && !p.wallId) {
        const L = V.dist(last, p);
        const tw = this.tool === 'wall' ? this.plan.meta.wallT : px(2);
        let A = last, B = p;
        if (this.tool === 'wall' && (c.started ? c.face : this.wallFace) && L > 0.5) {   // kalınlık dışa: önizleme de kaydırılmış
          const pts = [...c.pts, p], q = offsetOpen(pts, -tw / 2, chainSide(pts, c.flip));
          A = q.at(-2); B = q.at(-1);
          o += `<line class="prevface" x1="${last.x}" y1="${last.y}" x2="${p.x}" y2="${p.y}" stroke-width="${px(1.5)}"/>`;
        }
        o += `<line class="prevwall" x1="${A.x}" y1="${A.y}" x2="${B.x}" y2="${B.y}" stroke-width="${tw}"/>`;
        const m = V.lerp(last, p, 0.5);
        o += `<text class="prevtxt" x="${m.x}" y="${m.y - px(14)}" font-size="${px(14)}">${fmtNum(L, 1)} cm</text>`;
      }
      o += c.pts.map((q, i) => `<circle class="${i === 0 ? 'hdl start' : 'vtx'}" cx="${q.x}" cy="${q.y}" r="${px(i === 0 ? 7 : 4)}" stroke-width="${px(2)}"/>`).join('');
    }
    if (p) {
      if (p.wallId) {
        const w = this.wall(p.wallId); const u = wallDir(w), cc = V.add(w.a, V.mul(u, p.pos));
        const A = V.sub(cc, V.mul(u, p.w / 2)), B = V.add(cc, V.mul(u, p.w / 2));
        o += `<line class="prevop" x1="${A.x}" y1="${A.y}" x2="${B.x}" y2="${B.y}" stroke-width="${this.T(w) + px(4)}"/>`;
        o += `<text class="prevtxt" x="${cc.x}" y="${cc.y - this.T(w) - px(10)}" font-size="${px(12)}">${fmtNum(p.pos - p.w / 2, 0)} cm</text>`;
      } else if (this.tool !== 'select') {
        o += `<path class="cross" d="M${p.x - px(9)} ${p.y}H${p.x + px(9)}M${p.x} ${p.y - px(9)}V${p.y + px(9)}" stroke-width="${px(1.5)}"/>`;
        if (this.tool === 'item') {
          const f = furnOf(this.itemType);
          if (f.fx) {
            const at = (f.mount === 'wall' && this.wallMount(p, f.d)) || { ...p, rot: 0 };
            o += `<g transform="translate(${at.x} ${at.y}) rotate(${at.rot})" opacity="0.75">${fixtureSvg({ ...f, type: f.k, color: f.c, rot: at.rot }, px)}</g>`;
          } else o += `<rect class="prev" x="${p.x - f.w / 2}" y="${p.y - f.d / 2}" width="${f.w}" height="${f.d}" stroke-width="${px(1.5)}"/>`;
        }
      }
    }
    const si = this.snapInd;
    if (si && (c || g || p) && this.tool !== 'select') {
      if (si.k === 'face') {
        const L = px(16);
        o += `<line class="snapface" x1="${si.x - si.u.x * L}" y1="${si.y - si.u.y * L}" x2="${si.x + si.u.x * L}" y2="${si.y + si.u.y * L}" stroke-width="${px(3)}"/><circle class="snapind" cx="${si.x}" cy="${si.y}" r="${px(5)}" stroke-width="${px(2)}"/>`;
      } else if (si.k === 'corner') o += `<path class="snapind" d="M${si.x} ${si.y - px(8)}L${si.x + px(8)} ${si.y}L${si.x} ${si.y + px(8)}L${si.x - px(8)} ${si.y}Z" stroke-width="${px(2)}"/>`;
      else o += `<rect class="snapind" x="${si.x - px(6)}" y="${si.y - px(6)}" width="${px(12)}" height="${px(12)}" stroke-width="${px(2)}"/>`;
    }
    this.gUI.setAttribute('transform', `matrix(${s} 0 0 ${s} ${this.ox} ${this.oy})`);
    this.gUI.innerHTML = o;
  }

  renderHud() {
    const t = this.tool;
    let extra = '';
    if (t === 'wall' || t === 'poly' || t === 'rail') {
      extra = `<div class="hud-row">
        <div class="inp-unit sm"><input id="peLen" type="number" inputmode="decimal" placeholder="Uzunluk" ${this.chain ? '' : 'disabled'}><span>cm</span></div>
        ${['l', 'u', 'd', 'r'].map(d => `<button class="icon-btn sm" data-dir="${d}" ${this.chain ? '' : 'disabled'} title="Bu yönde ilerle">${{ l: '←', u: '↑', d: '↓', r: '→' }[d]}</button>`).join('')}
        ${this.chain ? `<button class="btn btn-xs btn-primary" data-fin>${icon('check')}Bitir</button>` : ''}
      </div>
      ${t === 'wall' ? `<div class="hud-row"><label class="mini-l">Kalınlık <input id="peT" type="number" value="${this.plan.meta.wallT}"> cm</label>
          <label class="mini-l"><input type="checkbox" id="peFace" ${this.wallFace ? 'checked' : ''} ${this.chain?.started ? 'disabled' : ''}> Çizgi iç yüz, kalınlık dışa</label>
          ${this.chain?.started && this.chain.face && !this.chain.closed ? `<button class="btn btn-xs btn-ghost" data-flip title="Duvar kalınlığını çizginin diğer tarafına al">${icon('rotate')}Tarafı çevir</button>` : ''}</div>`
        : t === 'rail' ? `<div class="hud-row"><select class="inp sm" id="peRail">${RAIL_KINDS.map(k => `<option value="${k.k}" ${this.railPick.kind === k.k ? 'selected' : ''}>${k.t}</option>`).join('')}</select>
          <label class="mini-l">Yükseklik <input id="peRailH" type="number" value="${this.railPick.h}"> cm</label></div>`
        : `<label class="mini-l"><input type="checkbox" id="peWalls" ${this.polyWalls ? 'checked' : ''}> Duvarları da oluştur</label>`}`;
    } else if (t === 'item') {
      extra = `<div class="hud-row"><select class="inp sm" id="peItem">${furnOptions(this.itemType)}</select></div>`;
    } else if (t === 'door' || t === 'window') {
      const pk = this.opPick[t], U = t === 'door' ? DOOR_USES : WIN_USES, M = t === 'door' ? DOOR_MODELS : WIN_MODELS;
      extra = `<div class="hud-row"><select class="inp sm" id="peOpU" title="Kullanım">${U.map(u => `<option value="${u.k}" ${pk.use === u.k ? 'selected' : ''}>${u.t}</option>`).join('')}</select>
        <select class="inp sm" id="peOpM" title="Model">${M.map(m => `<option value="${m.k}" ${pk.model === m.k ? 'selected' : ''}>${m.t}</option>`).join('')}</select></div>`;
    }
    this.hud.innerHTML = t === 'select' && !this.sel ? '' : `<div class="hud-hint">${esc(HINTS[t] || '')}</div>${extra}`;
    this.hud.hidden = !this.hud.innerHTML;
    const len = $('#peLen', this.hud);
    if (len) len.onkeydown = e => {
      if (e.key === 'Enter') { e.preventDefault(); this.typedLen(parseFloat(len.value.replace(',', '.'))); setTimeout(() => $('#peLen', this.hud)?.focus(), 0); }
      else if (e.key.startsWith('Arrow')) {
        e.preventDefault();
        const dk = { ArrowRight: 'r', ArrowLeft: 'l', ArrowUp: 'u', ArrowDown: 'd' }[e.key];
        if (len.value) { this.typedLen(parseFloat(len.value.replace(',', '.')), dk); setTimeout(() => $('#peLen', this.hud)?.focus(), 0); }
        else { this.dir = { r: { x: 1, y: 0 }, l: { x: -1, y: 0 }, u: { x: 0, y: -1 }, d: { x: 0, y: 1 } }[dk]; this.renderUI(); }
      } else if (e.key === 'Escape') { len.blur(); this.finishChain(); }
    };
    $$('[data-dir]', this.hud).forEach(b => b.onclick = () => {
      const v = parseFloat(($('#peLen', this.hud).value || '').replace(',', '.'));
      if (v > 0) this.typedLen(v, b.dataset.dir);
      else { this.dir = { r: { x: 1, y: 0 }, l: { x: -1, y: 0 }, u: { x: 0, y: -1 }, d: { x: 0, y: 1 } }[b.dataset.dir]; $('#peLen', this.hud).focus(); }
    });
    const fin = $('[data-fin]', this.hud); if (fin) fin.onclick = () => this.finishChain();
    const th = $('#peT', this.hud); if (th) th.onchange = () => { this.plan.meta.wallT = Math.max(2, +th.value || 15); this.onChange(this.plan); };
    const it = $('#peItem', this.hud); if (it) it.onchange = () => { this.itemType = it.value; };
    const rk = $('#peRail', this.hud), rh = $('#peRailH', this.hud);
    if (rk) rk.onchange = () => { this.railPick.kind = rk.value; };
    if (rh) rh.onchange = () => { const v = parseFloat(rh.value); if (v > 0) this.railPick.h = v; };
    const ou = $('#peOpU', this.hud), om = $('#peOpM', this.hud);
    if (ou) ou.onchange = () => { const pk = this.opPick[t]; pk.use = ou.value; const m = WIN_USES.find(u => u.k === ou.value)?.model; if (t === 'window' && m) { pk.model = m; om.value = m; } };
    if (om) om.onchange = () => { this.opPick[t].model = om.value; };
    const pw = $('#peWalls', this.hud); if (pw) pw.onchange = () => { this.polyWalls = pw.checked; setPref('tb-pe-polywalls', pw.checked); };
    const pf = $('#peFace', this.hud); if (pf) pf.onchange = () => { this.wallFace = pf.checked; setPref('tb-pe-wallface', pf.checked); this.renderUI(); };
    const fl = $('[data-flip]', this.hud); if (fl) fl.onclick = () => { const c = this.chain; if (!c) return; c.flip = !c.flip; this.layoutChain(c); this.changed(); this.renderHud(); };
  }

  /* ───────────── özellik paneli ───────────── */
  renderInsp() {
    const s = this.sel, o = this.obj(s), P = this.plan;
    const num = (k, label, v, unit = 'cm', step = 1) => `<label>${label}<div class="inp-unit sm"><input type="number" inputmode="decimal" step="${step}" data-k="${k}" value="${v}"><span>${unit}</span></div></label>`;
    let body = '';
    if (this.msel.length) {
      const cnt = k => this.msel.filter(x => x.kind === k).length;
      const parts = [['wall', 'duvar'], ['room', 'oda'], ['item', 'donatı'], ['dim', 'ölçü'], ['label', 'yazı']].map(([k, t]) => cnt(k) ? `${cnt(k)} ${t}` : '').filter(Boolean).join(' · ');
      this.insp.innerHTML = `<h4>${this.msel.length} nesne seçili</h4><p class="muted small">${parts}</p>
        <div class="row wrap"><button class="btn btn-xs btn-ghost" data-m="copy">${icon('copy')}Kopyala</button><button class="btn btn-xs btn-ghost" data-m="cut">${icon('cut')}Kes</button><button class="btn btn-xs btn-ghost" data-m="paste">${icon('paste')}Yapıştır</button></div>
        <div class="row wrap"><button class="btn btn-xs btn-danger" data-m="del">${icon('trash')}Seçilenleri sil</button><button class="btn btn-xs btn-ghost" data-m="none">Seçimi kaldır</button></div>
        <p class="muted small">Seçili bir nesneyi tutup sürükleyerek hepsini birlikte taşıyın. Shift + tıklama ya da "Çoklu seç" açıkken dokunma ile ekleyin / çıkarın.</p>`;
      this.insp.onclick = e => {
        const m = e.target.closest('[data-m]')?.dataset.m; if (!m) return;
        if (m === 'copy') this.copySel(); else if (m === 'cut') this.cutSel(); else if (m === 'paste') this.paste(); else if (m === 'del') this.del(); else if (m === 'none') this.setSel([]);
      };
      return;
    }
    if (!o) {
      const m = P.rooms.map(r => ({ r, m: roomMetrics(P, r) }));
      const tot = m.reduce((a, x) => a + x.m.area, 0);
      body = `<h4>Plan</h4>
        ${num('meta.wallH', 'Duvar yüksekliği', P.meta.wallH)}
        ${num('meta.wallT', 'Varsayılan duvar kalınlığı', P.meta.wallT)}
        <label>Duvar rengi (3D)<div class="swatches" data-k="meta.wallColor">${WALL_COLORS.map(c => `<button style="background:${c}" data-c="${c}" class="${P.meta.wallColor === c ? 'on' : ''}"></button>`).join('')}</div></label>
        <h4>Metraj</h4>
        <div class="mtable">${m.map(x => `<div><span>${esc(x.r.name)}</span><b>${fmtNum(x.m.area)} m²</b></div>`).join('') || '<p class="muted small">Henüz oda yok.</p>'}
        ${m.length ? `<div class="tot"><span>Toplam net alan</span><b>${fmtNum(tot)} m²</b></div>` : ''}</div>
        <p class="muted small">${P.walls.length} duvar · ${P.openings.length} açıklık · ${P.items.length} donatı${P.rails.length ? ` · ${P.rails.length} korkuluk` : ''}</p>`;
    } else if (s.kind === 'wall') {
      const ops = P.openings.filter(x => x.wallId === o.id);
      body = `<h4>Duvar</h4>
        ${o.face ? num('len', 'Uzunluk (çizilen yüz)', +(() => { const r = wallRef(o, P.meta.wallT, P); return V.dist(r.a, r.b); })().toFixed(1), 'cm', 0.5) : num('len', 'Uzunluk (eksen)', +wallLen(o).toFixed(1), 'cm', 0.5)}
        ${num('t', 'Kalınlık', this.T(o))}
        ${num('h', 'Yükseklik', o.h || P.meta.wallH)}
        <label>Renk (3D)<div class="swatches" data-k="color">${['', ...WALL_COLORS].map(c => `<button style="background:${c || 'repeating-linear-gradient(45deg,#fff 0 4px,#ddd 4px 8px)'}" data-c="${c}" class="${(o.color || '') === c ? 'on' : ''}" title="${c ? c : 'Varsayılan'}"></button>`).join('')}</div></label>
        <p class="muted small">${ops.length} açıklık. Uç noktaları sürükleyerek uzatın; gövdeyi sürükleyince duvar paralel kayar.</p>
        <div class="row"><button class="btn btn-xs btn-ghost" data-act="split">Ortadan böl</button><button class="btn btn-xs btn-ghost" data-act="addDoor">+ Kapı</button><button class="btn btn-xs btn-ghost" data-act="addWin">+ Pencere</button></div>
        <div class="row"><button class="btn btn-xs btn-primary" data-act="cabK">${icon('kitchen')}Bu duvara mutfak diz</button><button class="btn btn-xs btn-ghost" data-act="cabW">Giysi dolabı diz</button><button class="btn btn-xs btn-ghost" data-act="cabV">Vestiyer diz</button></div>`;
    } else if (s.kind === 'opening') {
      const w = this.wall(o.wallId), L = wallLen(w);
      body = `<h4>${o.type === 'door' ? 'Kapı' : o.type === 'window' ? 'Pencere' : 'Boşluk'}</h4>
        <label>Tür<select class="inp sm" data-k="type"><option value="door" ${o.type === 'door' ? 'selected' : ''}>Kapı</option><option value="window" ${o.type === 'window' ? 'selected' : ''}>Pencere</option><option value="gap" ${o.type === 'gap' ? 'selected' : ''}>Boşluk / kemer</option></select></label>
        ${o.type === 'door' || o.type === 'window' ? `
        <label>Kullanım<select class="inp sm" data-k="use">${(o.type === 'door' ? DOOR_USES : WIN_USES).map(u => `<option value="${u.k}" ${(o.type === 'door' ? doorUse(o) : winUse(o)).k === u.k ? 'selected' : ''}>${u.t}</option>`).join('')}</select></label>
        <label>Model<select class="inp sm" data-k="model">${(o.type === 'door' ? DOOR_MODELS : WIN_MODELS).map(m => `<option value="${m.k}" ${(o.type === 'door' ? doorModel(o) : winModel(o)) === m.k ? 'selected' : ''}>${m.t}</option>`).join('')}</select></label>` : ''}
        ${num('w', 'Genişlik', o.w)}
        ${num('h', 'Yükseklik', o.h)}
        ${o.type === 'window' ? num('sill', 'Denizlik yüksekliği', o.sill) : ''}
        ${num('left', 'Duvar başından mesafe', +(o.pos - o.w / 2).toFixed(1), 'cm', 0.5)}
        <p class="muted small">Duvar uzunluğu ${fmtNum(L, 1)} cm · sağ kalan ${fmtNum(L - o.pos - o.w / 2, 1)} cm</p>
        ${o.type === 'door' ? `<div class="row"><button class="btn btn-xs btn-ghost" data-act="flip">${doorModel(o) === 'surgu' || doorModel(o) === 'gomme' ? 'Kayma yönü' : 'Menteşe yönü'}</button><button class="btn btn-xs btn-ghost" data-act="side">${doorModel(o) === 'surgu' ? 'Taraf' : 'Açılma yönü'}</button></div>` : ''}
        ${o.type === 'window' ? `<div class="row"><button class="btn btn-xs btn-ghost" data-act="flip">Menteşe yönü</button><button class="btn btn-xs btn-ghost" data-act="side">İç taraf</button></div>
        <label class="check"><input type="checkbox" data-k="rail" ${winRail(o) ? 'checked' : ''}> Dış korkuluk (fransız balkon)</label>` : ''}
        ${o.type === 'door' || o.type === 'window' ? `
        <label>Kasa rengi (3D)<div class="swatches" data-k="fc">${FRAME_COLORS.map(([c, n]) => `<button style="background:${c}" data-c="${c}" title="${n}" class="${frameColor(o) === c ? 'on' : ''}"></button>`).join('')}</div></label>
        ${o.type === 'door' && !doorUse(o).glass ? `<label>Kanat rengi (3D)<div class="swatches" data-k="lc">${LEAF_COLORS.map(([c, n]) => `<button style="background:${c}" data-c="${c}" title="${n}" class="${leafColor(o) === c ? 'on' : ''}"></button>`).join('')}</div></label>` : ''}` : ''}`;
    } else if (s.kind === 'room') {
      const m = roomMetrics(P, o);
      const xs = o.pts.map(p => p.x), ys = o.pts.map(p => p.y);
      body = `<h4>Oda / Mahal</h4>
        <label>Ad<input class="inp sm" list="peRooms" data-k="name" value="${esc(o.name)}"></label><datalist id="peRooms">${ROOM_TYPES.map(t => `<option value="${t}">`).join('')}</datalist>
        ${o.rect ? num('rw', 'Genişlik (iç)', +(Math.max(...xs) - Math.min(...xs)).toFixed(1), 'cm', 0.5) + num('rl', 'Uzunluk (iç)', +(Math.max(...ys) - Math.min(...ys)).toFixed(1), 'cm', 0.5) : ''}
        ${num('h', 'Tavan yüksekliği', o.h || P.meta.wallH)}
        <label>Zemin kaplaması<select class="inp sm" data-k="floor">${FLOORS.map(f => `<option value="${f.k}" ${o.floor === f.k ? 'selected' : ''}>${f.t}</option>`).join('')}</select></label>
        <label>Duvar rengi (3D)<div class="swatches" data-k="wallColor">${['', ...WALL_COLORS].map(c => `<button style="background:${c || 'repeating-linear-gradient(45deg,#fff 0 4px,#ddd 4px 8px)'}" data-c="${c}" class="${(o.wallColor || '') === c ? 'on' : ''}"></button>`).join('')}</div></label>
        <div class="mtable"><div><span>Zemin alanı</span><b>${fmtNum(m.area)} m²</b></div><div><span>Çevre</span><b>${fmtNum(m.perim)} m</b></div><div><span>Net duvar alanı</span><b>${fmtNum(m.wallArea)} m²</b></div></div>
        ${tileable(o) ? this.tileInsp(o, m) : ''}`;
    } else if (s.kind === 'item' && o.type === 'cabinet' && o.cab) {
      const c = o.cab, isW = c.kind === 'wardrobe';
      const nb = isW ? c.ward.filter(m => !CAB_MT[m.type].empty).length : c.base.filter(m => !CAB_MT[m.type].empty).length, nu = isW ? 0 : c.upper.filter(m => !CAB_MT[m.type].empty).length;
      body = `<h4>${isW ? (c.style === 'vestiyer' ? 'Vestiyer' : 'Giysi dolabı') : 'Mutfak'}</h4>
        <button class="btn btn-primary btn-sm cab-open" data-act="cabEdit">${icon('edit')}Tasarla</button>
        <label>Ad<input class="inp sm" data-k="label" value="${esc(o.label)}"></label>
        <div class="mtable"><div><span>Uzunluk</span><b>${fmtNum(runLength(c), 1)} cm</b></div><div><span>${isW ? 'Modül' : 'Alt / boy modül'}</span><b>${nb}</b></div>${isW ? '' : `<div><span>Üst modül</span><b>${nu}</b></div>`}<div><span>Kapak</span><b>${esc(cabPick(FRONTS, c.mat.front).t)}</b></div></div>
        ${num('rot', 'Dönüş', o.rot, '°', 15)}
        <div class="row"><button class="btn btn-xs btn-ghost" data-act="rot90">${icon('rotate')}90°</button><button class="btn btn-xs btn-ghost" data-act="dup">${icon('copy')}Çoğalt</button></div>
        <p class="muted small">Modülleri, ölçüleri, malzemeyi, kesim listesini ve teklif kalemlerini "Tasarla" ekranında düzenleyin (çift tıklama da açar).</p>`;
    } else if (s.kind === 'item' && fixtureOf(o.type)) {
      const f = fixtureOf(o.type);
      body = `<h4>${f.g === 'elektrik' ? 'Elektrik' : 'Sıhhi tesisat'}</h4>
        <label>Tür<select class="inp sm" data-k="type">${furnOptions(o.type, false)}</select></label>
        <label>Etiket<input class="inp sm" data-k="label" value="${esc(o.label)}"></label>
        <div class="grid2">${f.mount === 'ceil' ? '' : num('z', f.mount === 'floor' ? 'Döşemeden' : 'Montaj yük.', o.z || 0)}${['piskolon', 'yagmur', 'ledserit', 'lineer', 'rogar'].includes(o.type) ? num(o.type === 'piskolon' || o.type === 'yagmur' ? 'h' : 'w', o.type === 'piskolon' || o.type === 'yagmur' ? 'Boy' : 'Uzunluk', o.type === 'piskolon' || o.type === 'yagmur' ? o.h : o.w) : ''}</div>
        ${num('rot', 'Dönüş', o.rot, '°', 15)}
        <div class="row">${f.mount === 'wall' ? `<button class="btn btn-xs btn-ghost" data-act="mount">${icon('magnet')}Duvara yasla</button>` : ''}<button class="btn btn-xs btn-ghost" data-act="rot90">${icon('rotate')}90°</button><button class="btn btn-xs btn-ghost" data-act="dup">${icon('copy')}Çoğalt</button></div>
        <p class="muted small">${f.mount === 'wall' ? 'Duvara yakın bırakıldığında arkası duvar yüzüne yaslanır ve kendiliğinden döner. ' : f.mount === 'ceil' ? 'Tavana monte edilir; 3D görünümde tavan yüksekliğinden alınır. ' : ''}${f.cnt ? 'Teklifte "' + ({ elec: 'Priz / anahtar sayısı', light: 'Aydınlatma sayısı', plumb: 'Tesisat noktası sayısı' })[f.cnt] + '" metrajına sayılır.' : ''}</p>`;
    } else if (s.kind === 'item') {
      body = `<h4>Mobilya / Donatı</h4>
        <label>Tür<select class="inp sm" data-k="type">${furnOptions(o.type, false)}</select></label>
        <label>Etiket<input class="inp sm" data-k="label" value="${esc(o.label)}"></label>
        <div class="grid2">${num('w', 'En', o.w)}${num('d', 'Derinlik', o.d)}${num('h', 'Yükseklik', o.h)}${num('z', 'Yerden', o.z || 0)}</div>
        ${num('rot', 'Dönüş', o.rot, '°', 15)}
        <label>Renk<input type="color" data-k="color" value="${o.color}"></label>
        <div class="row"><button class="btn btn-xs btn-ghost" data-act="rot90">${icon('rotate')}90°</button><button class="btn btn-xs btn-ghost" data-act="dup">${icon('copy')}Çoğalt</button></div>`;
    } else if (s.kind === 'rail') {
      body = `<h4>Korkuluk</h4>
        <label>Tür<select class="inp sm" data-k="kind">${RAIL_KINDS.map(k => `<option value="${k.k}" ${railKind(o).k === k.k ? 'selected' : ''}>${k.t}</option>`).join('')}</select></label>
        <div class="grid2">${num('len', 'Uzunluk', +V.dist(o.a, o.b).toFixed(1), 'cm', 0.5)}${num('h', 'Yükseklik', o.h || 110)}</div>
        <p class="muted small">Uç noktaları sürükleyerek uzatın, gövdeyi sürükleyerek taşıyın. Balkon ve teraslarda korkuluk yüksekliği yönetmelikte en az 110 cm'dir.</p>`;
    } else if (s.kind === 'dim') {
      body = `<h4>Ölçü çizgisi</h4><p class="big">${fmtNum(V.dist(o.a, o.b), 1)} cm</p>${num('off', 'Kaydırma', o.off)}`;
    } else if (s.kind === 'label') {
      body = `<h4>Yazı</h4><label>Metin<input class="inp sm" data-k="text" value="${esc(o.text)}"></label>${num('size', 'Boyut', o.size || 25)}`;
    }
    this.insp.innerHTML = `<div class="insp-body">${body}</div>${o ? `<button class="btn btn-danger btn-xs del" data-act="del">${icon('trash')}Sil</button>` : ''}`;
    this.el.classList.toggle('has-sel', !!o);
    this.bindInsp(o);
  }

  /* seramik / karo döşeme: boyut, döşeme şekli, derz → adet bazlı sarfiyat */
  tileInsp(o, m) {
    const t = tileOf(o), sq = +t.w === +t.l;
    const L = tileLayout(o, { perimNet: Math.max(0, m.perim - m.doorW) });
    const opt = (v, cur, txt) => `<option value="${v}" ${String(cur) === String(v) ? 'selected' : ''}>${txt}</option>`;
    const isStd = TILE_SIZES.some(z => `${z[0]}x${z[1]}` === t.s);
    const row = (k, v, cls = '') => `<div class="${cls}"><span>${k}</span><b>${v}</b></div>`;
    return `<h4>${o.floor === 'seramik' ? 'Seramik' : 'Karo'} döşeme hesabı</h4>
      <label>Karo boyutu<select class="inp sm" data-k="tile.s">${TILE_SIZES.map(z => opt(`${z[0]}x${z[1]}`, t.s, `${z[0]} × ${z[1]} cm`)).join('')}${opt('ozel', isStd ? '' : 'ozel', 'Özel ölçü…')}</select></label>
      ${isStd ? '' : `<div class="grid2"><label>En<div class="inp-unit sm"><input type="number" inputmode="decimal" step="0.5" data-k="tile.w" value="${t.w}"><span>cm</span></div></label><label>Boy<div class="inp-unit sm"><input type="number" inputmode="decimal" step="0.5" data-k="tile.l" value="${t.l}"><span>cm</span></div></label></div>`}
      <label>Ürün / seri adı<input class="inp sm" data-k="tile.name" value="${esc(t.name || '')}" placeholder="sipariş listesinde gruplanır"></label>
      <label>Döşeme şekli<select class="inp sm" data-k="tile.pat">${TILE_PATTERNS.filter(p => !p.rect || !sq).map(p => opt(p.k, L.t.pat, p.t)).join('')}</select></label>
      <div class="grid2"><label>Derz boşluğu<select class="inp sm" data-k="tile.g">${TILE_JOINTS.map(g => opt(g, t.g, fmtNum(g, 1) + ' mm')).join('')}</select></label>
      <label>Başlangıç<select class="inp sm" data-k="tile.start">${opt('orta', t.start, 'Odanın ortası')}${opt('kose', t.start, 'Köşeden')}</select></label></div>
      ${sq ? '' : `<label class="check"><input type="checkbox" data-k="tile.rot" ${t.rot ? 'checked' : ''}> Karo yönünü 90° çevir</label>`}
      <div class="grid2"><label>Yedek payı<div class="inp-unit sm"><input type="number" inputmode="decimal" step="1" min="0" data-k="tile.fire" value="${t.fire}"><span>%</span></div></label>
      <label>Kutu içi<div class="inp-unit sm"><input type="number" inputmode="numeric" step="1" min="0" data-k="tile.box" value="${t.box}"><span>adet</span></div></label>
      <label>Karo kalınlığı<div class="inp-unit sm"><input type="number" inputmode="decimal" step="0.5" data-k="tile.th" value="${t.th}"><span>mm</span></div></label></div>
      <label class="check"><input type="checkbox" data-k="tile.skirt" ${t.skirt ? 'checked' : ''}> Süpürgelik aynı karodan kesilecek</label>
      ${t.skirt ? `<label>Süpürgelik yüksekliği<div class="inp-unit sm"><input type="number" inputmode="decimal" step="0.5" data-k="tile.skH" value="${t.skH}"><span>cm</span></div></label>` : ''}
      <div class="tile-prev-w">${tilePreviewSvg(o, L)}<div class="tile-leg"><i class="f"></i>Tam karo <i class="c"></i>Kesilen karo</div></div>
      <div class="mtable tile-mt">
        ${row('Tam karo', `${L.full} adet`)}
        ${row('Kesilen karo', `${L.cut} adet`)}
        ${L.small > 1 ? row('Küçük parçalar (2\'si 1 karodan)', `−${Math.floor(L.small / 2)} adet`) : ''}
        ${row('Döşemeye giren karo', `${L.used} adet`)}
        ${row(`Yedek / kırılma (%${fmtNum(t.fire, 1)})`, `+${L.order - L.used} adet`)}
        ${L.skirt ? row(`Süpürgelik (${fmtNum(L.skirt.len, 1)} m, karodan ${L.skirt.perTile} şerit)`, `+${L.skirt.tiles} adet`) : ''}
        ${row('Sipariş', `${L.total} adet${L.boxes ? ` · ${L.boxes} kutu` : ''}`, 'tot')}
        ${row('Sipariş alanı', `${fmtNum(L.m2)} m² <small class="muted">(zemin firesi %${fmtNum(L.wasteP, 1)})</small>`)}
        ${row('Yapıştırıcı', `≈ ${fmtNum(L.glueKg, 0)} kg · ${L.glueBags} torba (25 kg)`)}
        ${L.groutKg ? row('Derz dolgu', `≈ ${fmtNum(L.groutKg, 1)} kg · ${L.groutBags} torba (5 kg)`) : ''}
      </div>
      <p class="muted small">Karo yerleşimi oda çizimi üzerinde simüle edilir; her kesik karo bir karo sayılır, yarımdan küçük parçalar ikişer ikişer aynı karodan çıkarılır.</p>`;
  }

  bindInsp(o) {
    const P = this.plan;
    $$('[data-k]', this.insp).forEach(el => {
      if (el.classList.contains('swatches')) {
        el.onclick = e => {
          const b = e.target.closest('[data-c]'); if (!b) return;
          this.snap();
          const k = el.dataset.k;
          if (k.startsWith('meta.')) P.meta[k.slice(5)] = b.dataset.c; else this.obj(this.sel)[k] = b.dataset.c;
          this.changed();
        };
        return;
      }
      el.onchange = () => {
        const k = el.dataset.k, v = el.type === 'number' ? parseFloat(el.value) : el.type === 'checkbox' ? el.checked : el.value;
        if (el.type === 'number' && !Number.isFinite(v)) return;
        this.snap();
        const x = this.obj(this.sel);
        if (k.startsWith('meta.')) P.meta[k.slice(5)] = v;
        else if (k.startsWith('tile.')) {
          const t = x.tile = tileOf(x), q = k.slice(5);
          if (q === 's') { if (v === 'ozel') t.s = 'ozel'; else applySize(t, v); }
          else if (q === 'g' || q === 'w' || q === 'l' || q === 'fire' || q === 'box' || q === 'th' || q === 'skH') t[q] = Math.max(0, +v);
          else t[q] = v;
          if ((q === 'w' || q === 'l') && t.w === t.l && t.pat === 'balik') t.pat = 'duz';
        } else if (k === 'len' && this.sel.kind === 'rail') {
          const np = V.add(x.a, V.mul(V.norm(V.sub(x.b, x.a)), Math.max(1, v))); x.b = { x: +np.x.toFixed(2), y: +np.y.toFixed(2) };
        } else if (k === 'len') {
          const r = x.face ? wallRef(x, P.meta.wallT, P) : null;   // yüz uzunluğu girildiyse eksen aynı farkla uzar
          const L = Math.max(1, r ? wallLen(x) + v - V.dist(r.a, r.b) : v), np = V.add(x.a, V.mul(wallDir(x), L));
          this.endsAt(x.b).forEach(([w, kk]) => { w[kk] = { x: +np.x.toFixed(2), y: +np.y.toFixed(2) }; });
        } else if (k === 'left') x.pos = Math.max(x.w / 2, Math.min(wallLen(this.wall(x.wallId)) - x.w / 2, v + x.w / 2));
        else if (k === 'rw' || k === 'rl') {
          const xs = x.pts.map(p => p.x), ys = x.pts.map(p => p.y);
          this.resizeRect(x, k === 'rw' ? v : Math.max(...xs) - Math.min(...xs), k === 'rl' ? v : Math.max(...ys) - Math.min(...ys));
        } else if (k === 'type' && this.sel.kind === 'item') {
          const f = furnOf(v); Object.assign(x, { type: v, label: f.t, w: f.w, d: f.d, h: f.h, z: f.z || 0, color: f.c });
        } else if (k === 'type' && this.sel.kind === 'opening') {
          const d = OPEN_DEF[v], L = wallLen(this.wall(x.wallId));
          ['model', 'use', 'fc', 'lc'].forEach(q => delete x[q]);
          Object.assign(x, { type: v, h: d.h, sill: d.sill });
          if (v !== 'gap') { applyUse(x, this.opPick[v].use, L); x.model = this.opPick[v].model; }
          x.pos = Math.max(x.w / 2, Math.min(L - x.w / 2, x.pos));
        } else if (k === 'use' && this.sel.kind === 'opening') {
          const L = wallLen(this.wall(x.wallId)); applyUse(x, v, L); x.pos = Math.max(x.w / 2, Math.min(L - x.w / 2, x.pos));
          this.opPick[x.type].use = v; if (x.model) this.opPick[x.type].model = x.model;
        } else if (k === 'kind' && this.sel.kind === 'rail') {
          x.kind = v; this.railPick.kind = v;
        } else if (k === 'model' && this.sel.kind === 'opening') {
          x.model = v; this.opPick[x.type].model = v;
        } else if (k === 'w' && this.sel.kind === 'opening') {
          const L = wallLen(this.wall(x.wallId)); x.w = Math.min(v, L - 2); x.pos = Math.max(x.w / 2, Math.min(L - x.w / 2, x.pos));
        } else if (k === 't' && this.sel.kind === 'wall' && x.face) {
          // yüzden çizilmiş duvar: kalınlık değişince çizilen yüz yerinde kalır, eksen kayar
          const sh = V.mul(wallNormal(x), x.face * (this.T(x) - v) / 2);
          const ea = this.endsAt(x.a), eb = this.endsAt(x.b), A = V.add(x.a, sh), B = V.add(x.b, sh);
          ea.forEach(([w, kk]) => { w[kk] = { x: +A.x.toFixed(2), y: +A.y.toFixed(2) }; }); eb.forEach(([w, kk]) => { w[kk] = { x: +B.x.toFixed(2), y: +B.y.toFixed(2) }; });
          x.t = v;
        } else x[k] = v;
        if (k === 'floor' && this.sel.kind === 'room' && tileable(x) && !x.tile) x.tile = tileDefaults();
        this.changed();
        if (k === 'meta.wallT') this.renderHud();
      };
    });
    $$('[data-act]', this.insp).forEach(b => b.onclick = () => {
      const a = b.dataset.act, x = this.obj(this.sel);
      if (a === 'del') return this.del();
      if (a === 'cabEdit') return this.openCab(x);
      if (a === 'cabK' || a === 'cabW') return this.createCab(a === 'cabW' ? 'wardrobe' : 'kitchen', x);
      if (a === 'cabV') return this.vestiyerDialog(x);
      this.snap();
      if (a === 'flip') x.flip = !x.flip;
      if (a === 'side') x.side = -(x.side || 1);
      if (a === 'rot90') x.rot = (x.rot + 90) % 360;
      if (a === 'mount') { const m = this.wallMount(x, x.d, 400); if (m) Object.assign(x, m); else toast('Yakında duvar bulunamadı', 'err'); }
      if (a === 'dup') { const c = { ...x, id: uid('i'), x: x.x + 30, y: x.y + 30 }; P.items.push(c); this.sel = { kind: 'item', id: c.id }; }
      if (a === 'split') {
        const m = V.lerp(x.a, x.b, 0.5), L = wallLen(x);
        const nw = { ...x, id: uid('w'), a: { ...m }, b: { ...x.b } };
        x.b = { ...m }; P.walls.push(nw);
        P.openings.filter(o => o.wallId === x.id && o.pos > L / 2).forEach(o => { o.wallId = nw.id; o.pos -= L / 2; });
      }
      if (a === 'addDoor' || a === 'addWin') {
        const t = a === 'addDoor' ? 'door' : 'window', L = wallLen(x);
        const op = this.newOpening(t, x.id, L / 2, L);
        P.openings.push(op); this.sel = { kind: 'opening', id: op.id };
      }
      this.changed();
    });
  }

  /* ───────────── dışa aktarma (PNG) ───────────── */
  async exportPng({ title = '', width = 2400 } = {}) {
    const b = planBounds(this.plan); if (!b) return null;
    const pad = 120, bw = b.x1 - b.x0 + pad * 2, bh = b.y1 - b.y0 + pad * 2;
    const s = width / bw, H = Math.round(bh * s) + 90;
    const P = JSON.parse(JSON.stringify(this.plan));
    if (P.meta.bg) P.meta.bg = null;
    const body = this.drawPlan(P, s, false);
    const css = PLAN_CSS;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${H}" viewBox="0 0 ${width} ${H}">
      <style>${css}</style><rect width="100%" height="100%" fill="#fff"/>
      <g transform="matrix(${s} 0 0 ${s} ${(pad - b.x0) * s} ${(pad - b.y0) * s + 70})">${body}</g>
      <rect x="0" y="0" width="${width}" height="58" fill="#16171A"/>
      <text x="28" y="38" font-family="Inter,Arial" font-weight="800" font-size="24" fill="#EB591F">TadilatBodrum<tspan fill="#1EC3D3">.com</tspan></text>
      <text x="${width - 28}" y="38" font-family="Inter,Arial" font-size="18" fill="#fff" text-anchor="end">${esc(title)} · Rölöve · ${new Date().toLocaleDateString('tr-TR')} · ölçüler cm</text></svg>`;
    const img = new Image();
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    await img.decode();
    const c = document.createElement('canvas'); c.width = width; c.height = H;
    c.getContext('2d').drawImage(img, 0, 0);
    return new Promise(r => c.toBlob(r, 'image/png'));
  }
}

/* küçük önizleme (iş detayında) — editör örneği oluşturmadan */
/* mobilya plan sembolü: köşe koltuklar gerçek biçimiyle (itemOutline), tavan klimasında kesikli çerçeve + üfleme yönleri, diğerleri dikdörtgen */
function itemShape(it, isSel, px) {
  const w = it.w, d = it.d, x0 = -w / 2, y0 = -d / 2, cls = `item ${isSel ? 'sel' : ''}`, sw = px(1.2);
  const back = (x1, x2, y) => `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" class="itemback" stroke-width="${px(1)}"/>`;
  const poly = pts => `<polygon class="${cls}" points="${pts.map(p => p.join(',')).join(' ')}" fill="${it.color}" fill-opacity="0.55" stroke-width="${sw}"/>`;
  const bk = Math.min(10, d / 5);
  if (it.type === 'lkanepe' || it.type === 'ukanepe') return poly(itemOutline(it)) + back(x0, -x0, y0 + bk);
  if (it.type === 'kasetklima') {
    const a = Math.min(w, d) * 0.18;
    return `<rect class="${cls}" x="${x0}" y="${y0}" width="${w}" height="${d}" fill="${it.color}" fill-opacity="0.35" stroke-width="${sw}" stroke-dasharray="${px(5)} ${px(3)}"/>
      ${[-1, 1].map(s => `<line x1="${x0 + w * 0.12}" y1="${s * d * 0.36}" x2="${-x0 - w * 0.12}" y2="${s * d * 0.36}" class="itemback" stroke-width="${px(1.6)}"/>
        <path d="M${-a / 2} ${s * d * 0.5}l${a / 2} ${s * a * 0.8}l${a / 2} ${-s * a * 0.8}" fill="none" class="itemback" stroke-width="${px(1.2)}"/>`).join('')}`;
  }
  return `<rect class="${cls}" x="${x0}" y="${y0}" width="${w}" height="${d}" rx="${Math.min(6, w / 10)}" fill="${it.color}" fill-opacity="0.55" stroke-width="${sw}"/>${back(x0, -x0, y0 + bk)}`;
}

export function planThumbSvg(plan, W = 600, H = 380, standalone = false, dims = false, overlay = null) {
  const b = planBounds(plan); if (!b) return '';
  const pad = 40, bw = Math.max(100, b.x1 - b.x0), bh = Math.max(100, b.y1 - b.y0);
  const s = Math.min((W - pad * 2) / bw, (H - pad * 2) / bh);
  const fake = { opt: { dims }, sel: null, bgUrl: '', dimPts: PlanEditor.prototype.dimPts };
  const body = PlanEditor.prototype.drawPlan.call(fake, plan, s, false) + (overlay ? overlay(s) : '');
  const head = standalone ? `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><style>${PLAN_CSS}</style><rect width="100%" height="100%" fill="#fff"/>` : `<svg class="plan-thumb" viewBox="0 0 ${W} ${H}">`;
  return `${head}<g transform="matrix(${s} 0 0 ${s} ${(W - bw * s) / 2 - b.x0 * s} ${(H - bh * s) / 2 - b.y0 * s})">${body}</g></svg>`;
}

/* belgeler (rapor/PDF) için: stilleri gömülü, harici CSS'e bağlı olmayan plan görseli (data URI) */
export function planImageUrl(plan, W = 900, H = 520, overlay = null) {
  const svg = planThumbSvg(plan, W, H, true, false, overlay); if (!svg) return '';
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}
