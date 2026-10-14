/* ═══ 2D Rölöve Editörü — SVG tabanlı, fare + dokunmatik ═══
 * Dünya birimi: cm. Ekran = dünya * s + (ox, oy).
 */
import { uid } from './store.js';
import { icon, esc, h, $, $$, fmtNum, promptDlg, modal } from './ui.js';
import { FLOORS, FURNITURE, furnOf, floorOf, ROOM_TYPES, WALL_COLORS } from './catalog.js';
import {
  emptyPlan, V, wallLen, wallDir, wallNormal, projSeg, polyArea, polyCentroid, pointInPoly,
  offsetPoly, roomMetrics, planBounds, rectRoom, rectPts, rectWallSegs, polyRoom,
} from './plan-geom.js';

const TOOLS = [
  { k: 'select', t: 'Seç / Taşı', ic: 'pointer', key: 'v' },
  { k: 'pan', t: 'Kaydır', ic: 'hand', key: 'h' },
  { k: 'wall', t: 'Duvar', ic: 'wallT', key: 'w' },
  { k: 'rect', t: 'Dikdörtgen oda', ic: 'room', key: 'r' },
  { k: 'poly', t: 'Çokgen oda', ic: 'poly', key: 'g' },
  { k: 'door', t: 'Kapı', ic: 'door', key: 'd' },
  { k: 'window', t: 'Pencere', ic: 'window', key: 'p' },
  { k: 'item', t: 'Mobilya / donatı', ic: 'sofa', key: 'm' },
  { k: 'dim', t: 'Ölçü çizgisi', ic: 'dim', key: 'o' },
  { k: 'text', t: 'Yazı', ic: 'text', key: 't' },
];
const HINTS = {
  select: 'Nesneye dokunup sürükleyin. Boş alanı sürükleyerek kaydırın, iki parmakla yakınlaştırın.',
  pan: 'Sürükleyerek görünümü kaydırın.',
  wall: 'Noktaları sırayla işaretleyin. Uzunluğu yazıp Enter / yön oku ile tam ölçü girin. Başlangıca dönünce oda kapanır.',
  rect: 'Köşeden köşeye sürükleyin (iç ölçü). Ya da "Ölçüyle oda" ile en/boy girin.',
  poly: 'Köşeleri sırayla işaretleyin, ilk noktaya dokunarak ya da Bitir ile kapatın.',
  door: 'Bir duvara dokunun — kapı o konuma yerleşir.',
  window: 'Bir duvara dokunun — pencere o konuma yerleşir.',
  item: 'Listeden seçip plana dokunun.',
  dim: 'İki noktayı işaretleyin.',
  text: 'Yazı eklemek için plana dokunun.',
  calib: 'Altlık görselde bilinen bir mesafenin iki ucunu işaretleyin.',
};
const OPEN_DEF = { door: { w: 90, h: 210, sill: 0 }, window: { w: 120, h: 140, sill: 90 }, gap: { w: 90, h: 220, sill: 0 } };

export class PlanEditor {
  constructor(host, plan, { onChange, resolvePhoto, pickBackground } = {}) {
    this.host = host;
    this.plan = plan || emptyPlan();
    this.onChange = onChange || (() => {});
    this.resolvePhoto = resolvePhoto;
    this.pickBackground = pickBackground;
    this.s = 0.5; this.ox = 40; this.oy = 40;
    this.tool = 'select';
    this.sel = null;              // { kind, id }
    this.chain = null;            // duvar/çokgen çizimi: { pts: [] , start }
    this.preview = null;          // imleç önizleme noktası
    this.snapInd = null;
    this.ptrs = new Map();
    this.g = null;                // aktif hareket
    this.undoS = []; this.redoS = [];
    this.opt = JSON.parse(localStorage.getItem('tb-plan-opt') || '{"snap":true,"ortho":true,"dims":true,"step":5}');
    this.itemType = 'kanepe';
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
          <select class="mini" data-o="step" title="Yaslama adımı">${[1, 5, 10, 25, 50].map(n => `<option value="${n}" ${n === this.opt.step ? 'selected' : ''}>${n} cm</option>`).join('')}</select>
          <span class="sep"></span>
          <button class="icon-btn" data-a="fit" title="Sığdır">${icon('fit')}</button>
          <button class="icon-btn info-m" data-a="info" title="Plan bilgisi / metraj">${icon('layers')}</button>
          <button class="btn btn-xs btn-ghost" data-a="addRoom">${icon('plus')}Ölçüyle oda</button>
          <button class="btn btn-xs btn-ghost" data-a="bg">${icon('image')}Altlık</button>
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
      else if (a === 'addRoom') this.addRoomDialog(); else if (a === 'info') this.el.classList.toggle('show-insp'); else if (a === 'bg') this.bgDialog();
      if (o) { this.opt[o] = !this.opt[o]; e.target.closest('button').classList.toggle('on', this.opt[o]); this.saveOpt(); this.render(); }
    };
    $('select[data-o="step"]', this.el).onchange = e => { this.opt.step = +e.target.value; this.saveOpt(); };

    const sv = this.svg;
    sv.addEventListener('pointerdown', e => this.pDown(e));
    sv.addEventListener('pointermove', e => this.pMove(e));
    sv.addEventListener('pointerup', e => this.pUp(e));
    sv.addEventListener('pointercancel', e => this.pUp(e, true));
    sv.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse' && !this.g) { this.preview = null; this.renderUI(); } });
    sv.addEventListener('wheel', e => { e.preventDefault(); const r = sv.getBoundingClientRect(); this.zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
    sv.addEventListener('dblclick', () => { if (this.chain) this.finishChain(); });
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
    if (t !== 'select') this.sel = null;
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
  setPlan(p) { this.plan = p; this.sel = null; this.undoS = []; this.redoS = []; this.loadBg(); this.changed(); this.fit(); }

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
  coll(kind) { return { wall: 'walls', opening: 'openings', room: 'rooms', item: 'items', dim: 'dims', label: 'labels' }[kind]; }
  obj(sel) { return sel && this.plan[this.coll(sel.kind)]?.find(o => o.id === sel.id); }
  wall(id) { return this.plan.walls.find(w => w.id === id); }
  T(w) { return w.t || this.plan.meta.wallT; }

  /* duvar uç noktası p'ye denk gelen tüm (duvar, uç) çiftleri */
  endsAt(p) {
    const r = [];
    this.plan.walls.forEach(w => { if (V.eq(w.a, p)) r.push([w, 'a']); if (V.eq(w.b, p)) r.push([w, 'b']); });
    return r;
  }

  /* ───────────── yaslama ───────────── */
  snapPt(p, from = null, skip = null) {
    const thr = 14 / this.s;
    this.snapInd = null;
    // 1) uç noktalar / oda köşeleri
    let best = null, bd = thr;
    const cand = q => { const d = V.dist(p, q); if (d < bd) { bd = d; best = q; } };
    this.plan.walls.forEach(w => { if (w.id !== skip) { cand(w.a); cand(w.b); } });
    this.plan.rooms.forEach(r => r.pts.forEach(cand));
    if (this.chain) this.chain.pts.forEach(cand);
    if (best) { this.snapInd = { ...best, k: 'end' }; return { ...best }; }
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
      for (const k of ['a', 'b']) if (V.dist(p, so[k]) < 12 / this.s) return { kind: 'wall', id: so.id, handle: k };
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
      if (ht) {
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
    if (g.type === 'pan') { if (g.tap && !g.moved && this.sel) { this.sel = null; this.renderInsp(); this.render(); } return; }
    if (g.type === 'move') {
      if (g.moved) { this.undoS.push(g.before); this.redoS = []; this.changed(); }
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
    if (t === 'wall' || t === 'poly' || t === 'dim' || t === 'calib') {
      const from = this.chain?.pts.at(-1) || null;
      this.preview = this.snapPt(wp, from);
    } else if (t === 'door' || t === 'window') {
      const nw = this.nearestWall(wp);
      if (nw) {
        const L = wallLen(nw.w), def = OPEN_DEF[t];
        let pos = this.snapLen(nw.pr.t * L);
        pos = Math.max(def.w / 2 + 2, Math.min(L - def.w / 2 - 2, pos));
        this.preview = { wallId: nw.w.id, pos, w: Math.min(def.w, L - 4) };
      } else this.preview = null;
    } else this.preview = this.snapPt(wp);
    this.renderUI();
  }

  place(wp, e) {
    const t = this.tool, p = this.preview;
    if (t === 'wall' || t === 'poly' || t === 'dim' || t === 'calib') {
      if (!p) return;
      if (!this.chain) { this.chain = { pts: [p] }; this.renderHud(); this.renderUI(); return; }
      this.addChainPt(p);
      return;
    }
    if ((t === 'door' || t === 'window') && p?.wallId) {
      this.snap();
      const def = OPEN_DEF[t];
      const o = { id: uid('o'), wallId: p.wallId, type: t, pos: p.pos, w: p.w, h: def.h, sill: def.sill, flip: false, side: 1 };
      this.plan.openings.push(o);
      this.sel = { kind: 'opening', id: o.id };
      this.setTool('select'); this.changed();
      return;
    }
    if (t === 'item' && p) {
      this.snap();
      const f = furnOf(this.itemType);
      const it = { id: uid('i'), type: f.k, label: f.t, x: p.x, y: p.y, w: f.w, d: f.d, h: f.h, z: f.z || 0, rot: 0, color: f.c };
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
    const closes = c.pts.length >= 3 && V.eq(p, c.pts[0], 1);
    if (t === 'wall') {
      if (!c.started) { this.snap(); c.started = true; }
      this.plan.walls.push({ id: uid('w'), a: { ...last }, b: { ...p }, t: this.plan.meta.wallT, h: 0 });
      if (closes) {
        // kapalı duvar zinciri → içten oda oluştur
        const room = { id: uid('r'), name: this.nextRoomName(), pts: offsetPoly(c.pts, this.plan.meta.wallT / 2), floor: 'parke', wallColor: '', h: 0, walls: [] };
        if (Math.abs(polyArea(c.pts)) > 1e4) this.plan.rooms.push(room);
        this.chain = null; this.dir = null; this.changed(); this.renderHud(); return;
      }
      c.pts.push(p); this.dir = null; this.changed(); this.renderHud(); return;
    }
    if (t === 'poly') {
      if (closes) { this.finishChain(); return; }
      c.pts.push(p); this.renderHud(); this.renderUI();
    }
  }

  finishChain() {
    const c = this.chain; if (!c) return;
    if (this.tool === 'poly' && c.pts.length >= 3) {
      this.snap();
      const r = polyRoom(this.plan, c.pts, this.nextRoomName(), $('#peWalls', this.hud)?.checked ?? true);
      this.sel = { kind: 'room', id: r.id };
      this.chain = null; this.setTool('select'); this.changed(); return;
    }
    this.chain = null; this.dir = null; this.renderHud(); this.render();
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
        const other = ht.handle === 'a' ? o.b : o.a;
        const np = this.snapPt(wp, other, o.id);
        this.endsAt(o[ht.handle]).forEach(([w, k]) => { w[k] = { ...np }; });
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
      } else { o.x += sd.x; o.y += sd.y; }
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
    if (k === 'Escape') { if (this.chain) this.finishChain(); else if (this.sel) { this.sel = null; this.renderInsp(); this.render(); } else this.setTool('select'); return; }
    if (k === 'Enter' && this.chain) { this.finishChain(); return; }
    if ((k === 'Delete' || k === 'Backspace') && this.sel) { e.preventDefault(); this.del(); return; }
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
    const s = this.sel; if (!s) return;
    this.snap();
    const c = this.coll(s.kind);
    this.plan[c] = this.plan[c].filter(o => o.id !== s.id);
    if (s.kind === 'wall') {
      this.plan.openings = this.plan.openings.filter(o => o.wallId !== s.id);
      this.plan.rooms.forEach(r => { if (r.walls) r.walls = r.walls.map(id => id === s.id ? null : id); });
    }
    this.sel = null; this.changed();
  }
  nextRoomName() { return `Oda ${this.plan.rooms.length + 1}`; }

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
    this.gW.innerHTML = this.grid(r) + this.drawPlan(this.plan, this.s, true);
    this.renderUI();
    const z = $('.pe-zoom', this.el);
    if (z) z.innerHTML = this.scaleBar();
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
    }
    // duvarlar
    for (const w of P.walls) o += `<line class="wall" x1="${w.a.x}" y1="${w.a.y}" x2="${w.b.x}" y2="${w.b.y}" stroke-width="${w.t || meta.wallT}"/>`;
    // açıklıklar
    for (const op of P.openings) {
      const w = P.walls.find(x => x.id === op.wallId); if (!w) continue;
      const t = w.t || meta.wallT, u = wallDir(w), n = wallNormal(w);
      const c = V.add(w.a, V.mul(u, op.pos)), A = V.sub(c, V.mul(u, op.w / 2)), B = V.add(c, V.mul(u, op.w / 2));
      const isSel = live && this.sel?.id === op.id;
      o += `<line x1="${A.x}" y1="${A.y}" x2="${B.x}" y2="${B.y}" stroke="#fff" stroke-width="${t + px(1.5)}"/>`;
      if (op.type === 'window') {
        const n1 = V.mul(n, t / 2), n2 = V.mul(n, t / 6);
        o += `<path class="win" d="M${A.x + n1.x} ${A.y + n1.y}L${B.x + n1.x} ${B.y + n1.y}L${B.x - n1.x} ${B.y - n1.y}L${A.x - n1.x} ${A.y - n1.y}Z M${A.x + n2.x} ${A.y + n2.y}L${B.x + n2.x} ${B.y + n2.y}M${A.x - n2.x} ${A.y - n2.y}L${B.x - n2.x} ${B.y - n2.y}" stroke-width="${px(1.3)}"/>`;
      } else if (op.type === 'door') {
        const hinge = op.flip ? B : A, other = op.flip ? A : B, sd = op.side || 1;
        const off = V.mul(n, sd * t / 2);
        const H = V.add(hinge, off), O = V.add(other, off), L = V.add(H, V.mul(n, sd * op.w));
        const sweep = V.cross(V.sub(L, H), V.sub(O, H)) > 0 ? 1 : 0;
        o += `<path class="door" d="M${H.x} ${H.y}L${L.x} ${L.y}A${op.w} ${op.w} 0 0 ${sweep} ${O.x} ${O.y}" stroke-width="${px(1.3)}"/>`;
        o += `<line class="jamb" x1="${A.x - n.x * t / 2}" y1="${A.y - n.y * t / 2}" x2="${A.x + n.x * t / 2}" y2="${A.y + n.y * t / 2}" stroke-width="${px(1.5)}"/><line class="jamb" x1="${B.x - n.x * t / 2}" y1="${B.y - n.y * t / 2}" x2="${B.x + n.x * t / 2}" y2="${B.y + n.y * t / 2}" stroke-width="${px(1.5)}"/>`;
      }
      if (isSel) o += `<line class="selline" x1="${A.x}" y1="${A.y}" x2="${B.x}" y2="${B.y}" stroke-width="${t + px(6)}"/>`;
    }
    // mobilyalar
    for (const it of P.items) {
      const isSel = live && this.sel?.id === it.id;
      const fs = Math.min(px(11), it.w / 5, 22);
      o += `<g transform="translate(${it.x} ${it.y}) rotate(${it.rot})"><rect class="item ${isSel ? 'sel' : ''}" x="${-it.w / 2}" y="${-it.d / 2}" width="${it.w}" height="${it.d}" rx="${Math.min(6, it.w / 10)}" fill="${it.color}" fill-opacity="0.55" stroke-width="${px(1.2)}"/>
        <line x1="${-it.w / 2}" y1="${-it.d / 2 + Math.min(10, it.d / 5)}" x2="${it.w / 2}" y2="${-it.d / 2 + Math.min(10, it.d / 5)}" class="itemback" stroke-width="${px(1)}"/>
        ${fs > px(6) ? `<text class="itemtxt" y="${fs * 0.35}" font-size="${fs}"${it.rot > 90 && it.rot <= 270 ? ' transform="rotate(180)"' : ''}>${esc(it.label)}</text>` : ''}</g>`;
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
      const L = wallLen(w); if (L * s < 34) continue;
      const u = wallDir(w), n = wallNormal(w), m = V.lerp(w.a, w.b, 0.5), t = w.t || meta.wallT;
      const tp = V.add(m, V.mul(n, -(t / 2 + px(9))));
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
        o += `<line class="selline" x1="${so.a.x}" y1="${so.a.y}" x2="${so.b.x}" y2="${so.b.y}" stroke-width="${this.T(so) + px(6)}"/>`;
        o += [so.a, so.b].map(p => `<circle class="hdl" cx="${p.x}" cy="${p.y}" r="${px(7)}" stroke-width="${px(2)}"/>`).join('');
      } else if (this.sel.kind === 'room') {
        o += `<polygon class="selpoly" points="${so.pts.map(p => `${p.x},${p.y}`).join(' ')}" stroke-width="${px(2)}" stroke-dasharray="${px(6)} ${px(4)}"/>`;
        o += so.pts.map(p => `<circle class="hdl" cx="${p.x}" cy="${p.y}" r="${px(6)}" stroke-width="${px(2)}"/>`).join('');
      } else if (this.sel.kind === 'item') {
        const hp = this.itemRotHandle(so);
        o += `<line class="rotln" x1="${so.x}" y1="${so.y}" x2="${hp.x}" y2="${hp.y}" stroke-width="${px(1.5)}"/><circle class="hdl rot" cx="${hp.x}" cy="${hp.y}" r="${px(7)}" stroke-width="${px(2)}"/>`;
      }
    }
    const g = this.g;
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
        o += `<line class="prevwall" x1="${last.x}" y1="${last.y}" x2="${p.x}" y2="${p.y}" stroke-width="${tw}"/>`;
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
          o += `<rect class="prev" x="${p.x - f.w / 2}" y="${p.y - f.d / 2}" width="${f.w}" height="${f.d}" stroke-width="${px(1.5)}"/>`;
        }
      }
    }
    if (this.snapInd && (c || g)) o += `<rect class="snapind" x="${this.snapInd.x - px(6)}" y="${this.snapInd.y - px(6)}" width="${px(12)}" height="${px(12)}" stroke-width="${px(2)}"/>`;
    this.gUI.setAttribute('transform', `matrix(${s} 0 0 ${s} ${this.ox} ${this.oy})`);
    this.gUI.innerHTML = o;
  }

  renderHud() {
    const t = this.tool;
    let extra = '';
    if (t === 'wall' || t === 'poly') {
      extra = `<div class="hud-row">
        <div class="inp-unit sm"><input id="peLen" type="number" inputmode="decimal" placeholder="Uzunluk" ${this.chain ? '' : 'disabled'}><span>cm</span></div>
        ${['l', 'u', 'd', 'r'].map(d => `<button class="icon-btn sm" data-dir="${d}" ${this.chain ? '' : 'disabled'} title="Bu yönde ilerle">${{ l: '←', u: '↑', d: '↓', r: '→' }[d]}</button>`).join('')}
        ${this.chain ? `<button class="btn btn-xs btn-primary" data-fin>${icon('check')}Bitir</button>` : ''}
      </div>
      ${t === 'wall' ? `<div class="hud-row"><label class="mini-l">Kalınlık <input id="peT" type="number" value="${this.plan.meta.wallT}"> cm</label></div>` : `<label class="mini-l"><input type="checkbox" id="peWalls" checked> Duvarları da oluştur</label>`}`;
    } else if (t === 'item') {
      extra = `<div class="hud-row"><select class="inp sm" id="peItem">${FURNITURE.map(f => `<option value="${f.k}" ${f.k === this.itemType ? 'selected' : ''}>${f.t} (${f.w}×${f.d})</option>`).join('')}</select></div>`;
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
  }

  /* ───────────── özellik paneli ───────────── */
  renderInsp() {
    const s = this.sel, o = this.obj(s), P = this.plan;
    const num = (k, label, v, unit = 'cm', step = 1) => `<label>${label}<div class="inp-unit sm"><input type="number" inputmode="decimal" step="${step}" data-k="${k}" value="${v}"><span>${unit}</span></div></label>`;
    let body = '';
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
        <p class="muted small">${P.walls.length} duvar · ${P.openings.length} açıklık · ${P.items.length} donatı</p>`;
    } else if (s.kind === 'wall') {
      const ops = P.openings.filter(x => x.wallId === o.id);
      body = `<h4>Duvar</h4>
        ${num('len', 'Uzunluk (eksen)', +wallLen(o).toFixed(1), 'cm', 0.5)}
        ${num('t', 'Kalınlık', this.T(o))}
        ${num('h', 'Yükseklik', o.h || P.meta.wallH)}
        <label>Renk (3D)<div class="swatches" data-k="color">${['', ...WALL_COLORS].map(c => `<button style="background:${c || 'repeating-linear-gradient(45deg,#fff 0 4px,#ddd 4px 8px)'}" data-c="${c}" class="${(o.color || '') === c ? 'on' : ''}" title="${c ? c : 'Varsayılan'}"></button>`).join('')}</div></label>
        <p class="muted small">${ops.length} açıklık. Uç noktaları sürükleyerek uzatın; gövdeyi sürükleyince duvar paralel kayar.</p>
        <div class="row"><button class="btn btn-xs btn-ghost" data-act="split">Ortadan böl</button><button class="btn btn-xs btn-ghost" data-act="addDoor">+ Kapı</button><button class="btn btn-xs btn-ghost" data-act="addWin">+ Pencere</button></div>`;
    } else if (s.kind === 'opening') {
      const w = this.wall(o.wallId), L = wallLen(w);
      body = `<h4>${o.type === 'door' ? 'Kapı' : o.type === 'window' ? 'Pencere' : 'Boşluk'}</h4>
        <label>Tür<select class="inp sm" data-k="type"><option value="door" ${o.type === 'door' ? 'selected' : ''}>Kapı</option><option value="window" ${o.type === 'window' ? 'selected' : ''}>Pencere</option><option value="gap" ${o.type === 'gap' ? 'selected' : ''}>Boşluk / kemer</option></select></label>
        ${num('w', 'Genişlik', o.w)}
        ${num('h', 'Yükseklik', o.h)}
        ${o.type === 'window' ? num('sill', 'Denizlik yüksekliği', o.sill) : ''}
        ${num('left', 'Duvar başından mesafe', +(o.pos - o.w / 2).toFixed(1), 'cm', 0.5)}
        <p class="muted small">Duvar uzunluğu ${fmtNum(L, 1)} cm · sağ kalan ${fmtNum(L - o.pos - o.w / 2, 1)} cm</p>
        ${o.type === 'door' ? `<div class="row"><button class="btn btn-xs btn-ghost" data-act="flip">Menteşe yönü</button><button class="btn btn-xs btn-ghost" data-act="side">Açılma yönü</button></div>` : ''}`;
    } else if (s.kind === 'room') {
      const m = roomMetrics(P, o);
      const xs = o.pts.map(p => p.x), ys = o.pts.map(p => p.y);
      body = `<h4>Oda / Mahal</h4>
        <label>Ad<input class="inp sm" list="peRooms" data-k="name" value="${esc(o.name)}"></label><datalist id="peRooms">${ROOM_TYPES.map(t => `<option value="${t}">`).join('')}</datalist>
        ${o.rect ? num('rw', 'Genişlik (iç)', +(Math.max(...xs) - Math.min(...xs)).toFixed(1), 'cm', 0.5) + num('rl', 'Uzunluk (iç)', +(Math.max(...ys) - Math.min(...ys)).toFixed(1), 'cm', 0.5) : ''}
        ${num('h', 'Tavan yüksekliği', o.h || P.meta.wallH)}
        <label>Zemin kaplaması<select class="inp sm" data-k="floor">${FLOORS.map(f => `<option value="${f.k}" ${o.floor === f.k ? 'selected' : ''}>${f.t}</option>`).join('')}</select></label>
        <label>Duvar rengi (3D)<div class="swatches" data-k="wallColor">${['', ...WALL_COLORS].map(c => `<button style="background:${c || 'repeating-linear-gradient(45deg,#fff 0 4px,#ddd 4px 8px)'}" data-c="${c}" class="${(o.wallColor || '') === c ? 'on' : ''}"></button>`).join('')}</div></label>
        <div class="mtable"><div><span>Zemin alanı</span><b>${fmtNum(m.area)} m²</b></div><div><span>Çevre</span><b>${fmtNum(m.perim)} m</b></div><div><span>Net duvar alanı</span><b>${fmtNum(m.wallArea)} m²</b></div></div>`;
    } else if (s.kind === 'item') {
      body = `<h4>Mobilya / Donatı</h4>
        <label>Tür<select class="inp sm" data-k="type">${FURNITURE.map(f => `<option value="${f.k}" ${o.type === f.k ? 'selected' : ''}>${f.t}</option>`).join('')}</select></label>
        <label>Etiket<input class="inp sm" data-k="label" value="${esc(o.label)}"></label>
        <div class="grid2">${num('w', 'En', o.w)}${num('d', 'Derinlik', o.d)}${num('h', 'Yükseklik', o.h)}${num('z', 'Yerden', o.z || 0)}</div>
        ${num('rot', 'Dönüş', o.rot, '°', 15)}
        <label>Renk<input type="color" data-k="color" value="${o.color}"></label>
        <div class="row"><button class="btn btn-xs btn-ghost" data-act="rot90">${icon('rotate')}90°</button><button class="btn btn-xs btn-ghost" data-act="dup">${icon('copy')}Çoğalt</button></div>`;
    } else if (s.kind === 'dim') {
      body = `<h4>Ölçü çizgisi</h4><p class="big">${fmtNum(V.dist(o.a, o.b), 1)} cm</p>${num('off', 'Kaydırma', o.off)}`;
    } else if (s.kind === 'label') {
      body = `<h4>Yazı</h4><label>Metin<input class="inp sm" data-k="text" value="${esc(o.text)}"></label>${num('size', 'Boyut', o.size || 25)}`;
    }
    this.insp.innerHTML = `<div class="insp-body">${body}</div>${o ? `<button class="btn btn-danger btn-xs del" data-act="del">${icon('trash')}Sil</button>` : ''}`;
    this.el.classList.toggle('has-sel', !!o);
    this.bindInsp(o);
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
        const k = el.dataset.k, v = el.type === 'number' ? parseFloat(el.value) : el.value;
        if (el.type === 'number' && !Number.isFinite(v)) return;
        this.snap();
        const x = this.obj(this.sel);
        if (k.startsWith('meta.')) P.meta[k.slice(5)] = v;
        else if (k === 'len') {
          const L = Math.max(1, v), np = V.add(x.a, V.mul(wallDir(x), L));
          this.endsAt(x.b).forEach(([w, kk]) => { w[kk] = { x: +np.x.toFixed(2), y: +np.y.toFixed(2) }; });
        } else if (k === 'left') x.pos = Math.max(x.w / 2, Math.min(wallLen(this.wall(x.wallId)) - x.w / 2, v + x.w / 2));
        else if (k === 'rw' || k === 'rl') {
          const xs = x.pts.map(p => p.x), ys = x.pts.map(p => p.y);
          this.resizeRect(x, k === 'rw' ? v : Math.max(...xs) - Math.min(...xs), k === 'rl' ? v : Math.max(...ys) - Math.min(...ys));
        } else if (k === 'type' && this.sel.kind === 'item') {
          const f = furnOf(v); Object.assign(x, { type: v, label: f.t, w: f.w, d: f.d, h: f.h, z: f.z || 0, color: f.c });
        } else if (k === 'type' && this.sel.kind === 'opening') {
          const d = OPEN_DEF[v]; Object.assign(x, { type: v, h: d.h, sill: d.sill });
        } else if (k === 'w' && this.sel.kind === 'opening') {
          const L = wallLen(this.wall(x.wallId)); x.w = Math.min(v, L - 2); x.pos = Math.max(x.w / 2, Math.min(L - x.w / 2, x.pos));
        } else x[k] = v;
        this.changed();
        if (k === 'meta.wallT') this.renderHud();
      };
    });
    $$('[data-act]', this.insp).forEach(b => b.onclick = () => {
      const a = b.dataset.act, x = this.obj(this.sel);
      if (a === 'del') return this.del();
      this.snap();
      if (a === 'flip') x.flip = !x.flip;
      if (a === 'side') x.side = -(x.side || 1);
      if (a === 'rot90') x.rot = (x.rot + 90) % 360;
      if (a === 'dup') { const c = { ...x, id: uid('i'), x: x.x + 30, y: x.y + 30 }; P.items.push(c); this.sel = { kind: 'item', id: c.id }; }
      if (a === 'split') {
        const m = V.lerp(x.a, x.b, 0.5), L = wallLen(x);
        const nw = { ...x, id: uid('w'), a: { ...m }, b: { ...x.b } };
        x.b = { ...m }; P.walls.push(nw);
        P.openings.filter(o => o.wallId === x.id && o.pos > L / 2).forEach(o => { o.wallId = nw.id; o.pos -= L / 2; });
      }
      if (a === 'addDoor' || a === 'addWin') {
        const t = a === 'addDoor' ? 'door' : 'window', d = OPEN_DEF[t], L = wallLen(x);
        const op = { id: uid('o'), wallId: x.id, type: t, pos: L / 2, w: Math.min(d.w, L - 4), h: d.h, sill: d.sill, flip: false, side: 1 };
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
    const css = `.wall{stroke:#24272B;stroke-linecap:square}.room{stroke:none}.win{fill:#fff;stroke:#24272B}.door,.jamb{fill:none;stroke:#24272B}
      .item{stroke:#555}.itemback{stroke:#555}.itemtxt,.rname,.rarea,.wlen,.lbl{font-family:Inter,Arial,sans-serif;text-anchor:middle;fill:#24272B}
      .rname{font-weight:700}.rarea{fill:#00989A}.wlen{fill:#EB591F;font-weight:600}.dimg path{fill:none;stroke:#00989A}.dimg text{fill:#00989A;text-anchor:middle;font-family:Inter,Arial}`;
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
export function planThumbSvg(plan, W = 600, H = 380) {
  const b = planBounds(plan); if (!b) return '';
  const pad = 40, bw = Math.max(100, b.x1 - b.x0), bh = Math.max(100, b.y1 - b.y0);
  const s = Math.min((W - pad * 2) / bw, (H - pad * 2) / bh);
  const fake = { opt: { dims: false }, sel: null, bgUrl: '', dimPts: PlanEditor.prototype.dimPts };
  const body = PlanEditor.prototype.drawPlan.call(fake, plan, s, false);
  return `<svg class="plan-thumb" viewBox="0 0 ${W} ${H}"><g transform="matrix(${s} 0 0 ${s} ${(W - bw * s) / 2 - b.x0 * s} ${(H - bh * s) / 2 - b.y0 * s})">${body}</g></svg>`;
}
