/* ═══ 2D plan → 3D model, gezinme ve gerçekçi render ═══
 * three.js yalnızca 3D açıldığında yüklenir (vendor/ altında, çevrimdışı çalışır).
 * Render modları:
 *   • hızlı   — rasterize + yumuşak gölge + GTAO ortam kapatma + IBL
 *   • gerçekçi — GPU path tracing (three-gpu-pathtracer), ilerlemeli örnekleme
 */
import { V, wallLen, wallDir, polyCentroid, pointInPoly, wallExt, planLevels } from './plan-geom.js';
import { roofFaces, coverOf, outlineOf } from './roof.js';
import { floorTexture } from './textures.js';
import { stairWorld, stairBuild, stairXf } from './stairs.js';
import { build3D } from './cabinet.js';
import { fixtureOf, fixture3D } from './fixtures.js';
import { frameColor, leafColor, doorUse, doorModel, winUse, winModel, winRail, railKind, sashes, leaves, winHingeAtStart } from './openings.js';

let THREE, OrbitControls, RoomEnvironment;
async function loadThree() {
  if (THREE) return;
  THREE = await import('three');
  ({ OrbitControls } = await import('three/addons/controls/OrbitControls.js'));
  ({ RoomEnvironment } = await import('three/addons/environments/RoomEnvironment.js'));
}

const M = v => v / 100; // cm → m

/* ── render yardımcıları ── */
const isMobile = () => matchMedia('(pointer: coarse)').matches || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.platform));
// path tracing float doku ve float render hedefi ister; yoksa çıktı siyah olur
function ptSupported(r) {
  const gl = r.getContext();
  return r.capabilities.isWebGL2 && !!gl.getExtension('EXT_color_buffer_float') && !!gl.getExtension('OES_texture_float_linear') && !isMobile();
}
async function canvasBlob(canvas) {
  const b = await new Promise(res => canvas.toBlob(res, 'image/png'));
  if (b) return b;
  // bazı mobil tarayıcılarda büyük tuvalde toBlob null döner
  const d = canvas.toDataURL('image/jpeg', 0.92);
  return (await fetch(d)).blob();
}
// görüntü (neredeyse) tamamen siyah mı? — küçük örnekte ortalama parlaklık
async function isBlack(blob) {
  if (!blob || blob.size < 100) return true;
  try {
    const bmp = await createImageBitmap(blob);
    const c = document.createElement('canvas'); c.width = 32; c.height = 32;
    const x = c.getContext('2d'); x.drawImage(bmp, 0, 0, 32, 32);
    const d = x.getImageData(0, 0, 32, 32).data;
    let s = 0; for (let i = 0; i < d.length; i += 4) s += d[i] + d[i + 1] + d[i + 2];
    return s / (32 * 32 * 3) < 4;
  } catch { return false; }
}

export class Plan3D {
  constructor(host) {
    this.host = host;
    this.opt = { sunAz: 220, sunEl: 48, ceiling: false, cut: true, mode: 'orbit', roomId: null, lights: true, exposure: 1 };
    this.dirty = true;
  }

  async init() {
    await loadThree();
    const r = this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    r.setPixelRatio(Math.min(devicePixelRatio, 2));
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1;
    r.outputColorSpace = THREE.SRGBColorSpace;
    this.host.append(r.domElement);
    r.domElement.className = 'p3-canvas';

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#E9F1F2');
    const pm = new THREE.PMREMGenerator(r);
    this.envTex = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = this.envTex;
    this.scene.environmentIntensity = 0.55;

    this.camera = new THREE.PerspectiveCamera(50, 1, 0.05, 500);
    this.controls = new OrbitControls(this.camera, r.domElement);
    this.controls.enableDamping = true;
    this.controls.addEventListener('change', () => { this.dirty = true; });

    this.sun = new THREE.DirectionalLight('#FFF4E5', 2.6);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.02;
    this.sun.shadow.radius = 4;
    this.scene.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight('#DDEEFF', '#C8B89A', 0.35);
    this.scene.add(this.hemi);

    this.root = new THREE.Group(); this.scene.add(this.root);
    this.mats = new Map();

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(this.host);
    this.resize();

    // iç mekan modunda zemine dokunarak yürü
    let down = null;
    r.domElement.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY }; });
    r.domElement.addEventListener('pointerup', e => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5 || this.opt.mode !== 'interior') return;
      const rect = r.domElement.getBoundingClientRect();
      const ray = new THREE.Raycaster();
      ray.setFromCamera({ x: (e.clientX - rect.left) / rect.width * 2 - 1, y: -(e.clientY - rect.top) / rect.height * 2 + 1 }, this.camera);
      const hit = ray.intersectObjects(this.floors || [], false)[0];
      if (hit) this.walkTo(hit.point);
    });

    const loop = () => {
      if (this.disposed) return;
      this.raf = requestAnimationFrame(loop);
      if (this.busy) return;   // render alınırken görüntüleyici tuvali kullanılıyor
      if (this.controls.update() || this.dirty) { this.renderer.render(this.scene, this.camera); this.dirty = false; }
    };
    loop();
    return this;
  }

  resize() {
    const w = this.host.clientWidth, h = this.host.clientHeight;
    if (!w || !h || this.busy) return;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.dirty = true;
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.ro?.disconnect();
    this.controls?.dispose();
    this.renderer?.dispose();
    this.renderer?.domElement.remove();
  }

  mat(key, make) {
    if (!this.mats.has(key)) this.mats.set(key, make());
    return this.mats.get(key);
  }
  std(color, rough = 0.85, metal = 0) { return this.mat(`s${color}${rough}${metal}`, () => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal })); }

  /* ───────────── sahne kurulumu ───────────── */
  setPlan(plan) {
    this.plan = plan;
    this.build();
    if (!this.framed) { this.frame(); this.framed = true; }
  }

  build() {
    const ROOT = this.plan; if (!ROOT || !THREE) return;
    this.root.clear();
    this.floors = [];
    // zemin (dış)
    const b = this.bounds();
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), this.std('#D9D2C3', 1));
    ground.rotation.x = -Math.PI / 2; ground.position.set(b.cx, -0.02, b.cz); ground.receiveShadow = true; ground.userData.noExport = true;
    this.root.add(ground);
    // katlar: her kat kendi kotunda; kesitte etkin kata kadar (etkin kat kesik)
    const L = planLevels(ROOT), act = Math.min(this.opt.level ?? 0, L.length - 1);
    this.hTop = M(L.at(-1).z + L.at(-1).h) + ((L.some(l => l.plan.roofs?.length)) ? 1.5 : 0);   // bina yüksekliği (m), kadraj için
    for (const lv of L) {
      if (this.opt.cut && lv.idx > act) continue;
      const lg = new THREE.Group(); lg.position.y = M(lv.z); lg.name = lv.name; this.root.add(lg);
      const meta = { ...ROOT.meta, ...(lv.plan.meta || {}) };
      if (lv.idx > 0 && lv.slab > 0) this.slab(lv.kind === 'roof' ? L[lv.idx - 1].plan : lv.plan, meta, lv.slab, lg);
      if (lv.kind !== 'roof') this.buildLevel(lv.plan, lg, meta, this.opt.cut && lv.idx === act, lv.idx === 0);
      // çatı: kesitte yalnızca çatı planı katı etkinken (alt katın içi görünsün diye)
      if (!this.opt.cut || (lv.kind === 'roof' && lv.idx === act)) for (const rf of lv.plan.roofs || []) this.roof(rf, (lv.kind === 'roof' ? 0 : lv.h) + (+rf.base || 0), meta, lg);
    }
    this.placeSun();
    this.dirty = true;
  }

  /* kat döşemesi: katın dış hattı, kat kotunun altında */
  slab(P, meta, t, g) {
    const pts = outlineOf({ ...P, meta }); if (!pts) return;
    const geo = new THREE.ExtrudeGeometry(new THREE.Shape(pts.map(p => new THREE.Vector2(M(p.x), -M(p.y)))), { depth: M(t), bevelEnabled: false });
    geo.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(geo, this.std('#C9C6C0', 0.95)); m.position.y = -M(t); m.castShadow = m.receiveShadow = true; m.name = 'Döşeme';
    g.add(m);
  }
  /* çok kenarlı düzlemsel yüzey (cm; z yukarı) → üçgenlenmiş ağ */
  polyMesh(P3, mat) {
    const Q = P3.map(p => new THREE.Vector3(M(p.x), M(p.z), M(p.y))), n = Q.length; if (n < 3) return null;
    let nx = 0, ny = 0, nz = 0;
    for (let i = 0; i < n; i++) { const a = Q[i], c = Q[(i + 1) % n]; nx += (a.y - c.y) * (a.z + c.z); ny += (a.z - c.z) * (a.x + c.x); nz += (a.x - c.x) * (a.y + c.y); }
    const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
    const P2 = Q.map(v => ax >= ay && ax >= az ? new THREE.Vector2(v.y, v.z) : ay >= az ? new THREE.Vector2(v.x, v.z) : new THREE.Vector2(v.x, v.y));
    const tris = THREE.ShapeUtils.triangulateShape(P2, []); if (!tris.length) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(Q.flatMap(v => [v.x, v.y, v.z]), 3));
    geo.setIndex(tris.flat()); geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, mat); m.castShadow = m.receiveShadow = true;
    return m;
  }
  roof(rf, base, meta, g) {
    const cv = coverOf(rf);
    const rm = this.mat('roof' + cv.c, () => new THREE.MeshStandardMaterial({ color: cv.c, roughness: 0.8, side: THREE.DoubleSide }));
    const wm = this.mat('gable' + (meta.wallColor || '#F7F5F0'), () => new THREE.MeshStandardMaterial({ color: meta.wallColor || '#F7F5F0', roughness: 0.92, side: THREE.DoubleSide }));
    for (const f of roofFaces(rf, base)) {
      if (f.kind === 'parapet') {
        const L = V.dist(f.a, f.b); if (L < 1) continue;
        const u = V.norm(V.sub(f.b, f.a)), c = V.lerp(f.a, f.b, 0.5), t = 20;
        const m = new THREE.Mesh(new THREE.BoxGeometry(M(L + t), M(f.h), M(t)), wm);
        m.position.set(M(c.x), M(f.z0 + f.h / 2), M(c.y)); m.rotation.y = -Math.atan2(u.y, u.x); m.castShadow = m.receiveShadow = true; m.name = 'Parapet';
        g.add(m); continue;
      }
      const m = this.polyMesh(f.pts, f.kind === 'gable' ? wm : rm); if (!m) continue;
      m.name = f.kind === 'gable' ? 'Kalkan duvarı' : 'Çatı';
      g.add(m);
    }
    // düz çatı yüzeyi parapetin içinde biraz yukarıda değil; eğimli çatıya saçak kalınlığı: alın tahtası çizgisi yok sayılır
  }

  /* merdiven: betonarmede basamaklar dolu, ahşap / metalde basamak plakası + taşıyıcı; döner merdivende orta kolon */
  stair(st, g) {
    const W = stairWorld(st), b = stairBuild(st.build), solid = b.k === 'beton';
    const mat = this.mat('stair' + b.c, () => new THREE.MeshStandardMaterial({ color: b.c, roughness: b.k === 'metal' ? 0.45 : 0.85, metalness: b.k === 'metal' ? 0.4 : 0 }));
    for (const s of W.steps) {
      const th = solid ? s.z : s.land ? 10 : 5;
      const geo = new THREE.ExtrudeGeometry(new THREE.Shape(s.pts.map(p => new THREE.Vector2(M(p.x), -M(p.y)))), { depth: M(th), bevelEnabled: false });
      geo.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(geo, mat); m.position.y = M(s.z - th); m.castShadow = m.receiveShadow = true; m.name = 'Merdiven';
      g.add(m);
    }
    if (st.type === 'spiral') {
      const c = stairXf(st)(W.P.C), r = Math.max(4, W.P.r0);
      const m = new THREE.Mesh(new THREE.CylinderGeometry(M(r), M(r), M(st.H), 20), this.mat('stcol', () => new THREE.MeshStandardMaterial({ color: '#7C8187', roughness: 0.5, metalness: 0.3 })));
      m.position.set(M(c.x), M(st.H / 2), M(c.y)); m.castShadow = true; m.name = 'Merdiven kolonu';
      g.add(m);
    } else if (!solid) {   // açık basamaklarda yürüme çizgisi boyunca orta taşıyıcı (kiriş)
      const pts = W.steps.map(s => ({ ...polyCentroid(s.pts), z: s.z }));
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], c = pts[i], L3 = Math.hypot(c.x - a.x, c.y - a.y, c.z - a.z); if (L3 < 1) continue;
        const m = new THREE.Mesh(new THREE.BoxGeometry(M(12), M(16), M(L3)), mat);
        m.position.set(M((a.x + c.x) / 2), M((a.z + c.z) / 2 - 12), M((a.y + c.y) / 2));
        m.rotation.order = 'YXZ'; m.rotation.y = Math.atan2(c.x - a.x, c.y - a.y); m.rotation.x = -Math.atan2(c.z - a.z, Math.hypot(c.x - a.x, c.y - a.y));
        m.castShadow = true; g.add(m);
      }
    }
  }

  buildLevel(P, g, meta, cut, ground0) {
    const cutH = 110;
    this.curMeta = meta;

    // odalar: zemin + tavan
    for (const r of P.rooms) {
      if (r.pts.length < 3) continue;
      const shape = new THREE.Shape(r.pts.map(p => new THREE.Vector2(M(p.x), -M(p.y))));
      const geo = new THREE.ShapeGeometry(shape);
      geo.rotateX(-Math.PI / 2);
      const tx = floorTexture(THREE, r.floor);
      const fm = this.mat('floor' + r.floor, () => new THREE.MeshStandardMaterial({ map: tx.map, roughness: tx.rough }));
      const fl = new THREE.Mesh(geo, fm);
      fl.position.y = 0.002; fl.receiveShadow = true; fl.userData.room = r.id; fl.name = 'Zemin ' + (r.name || '');
      g.add(fl); if (ground0) this.floors.push(fl);
      if (this.opt.ceiling && !cut) {
        // tavan aşağı bakmalı: +90° döndürmede şeklin y'si doğrudan z olur, bu yüzden plan y'si ters çevrilmeden verilir
        // (zemindeki -y şekliyle döndürülünce tavan plan üzerinde aynalanıp kayıyordu)
        const cg = new THREE.ShapeGeometry(new THREE.Shape(r.pts.map(p => new THREE.Vector2(M(p.x), M(p.y))))); cg.rotateX(Math.PI / 2);
        const c = new THREE.Mesh(cg, this.std('#FAFAF8', 0.95));
        c.position.y = M(r.h || meta.wallH); c.receiveShadow = true; c.name = 'Tavan';
        g.add(c);
        if (this.opt.lights) {
          const ctr = polyCentroid(r.pts);
          const L = new THREE.PointLight('#FFD9A8', 6, 9, 2);
          L.position.set(M(ctr.x), M(r.h || meta.wallH) - 0.25, M(ctr.y));
          g.add(L);
          const bulb = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.02, 24), new THREE.MeshStandardMaterial({ color: '#fff', emissive: '#FFE7C2', emissiveIntensity: 2.5 }));
          bulb.position.set(M(ctr.x), M(r.h || meta.wallH) - 0.012, M(ctr.y)); bulb.userData.noExport = true;
          g.add(bulb);
        }
      }
    }

    // duvarlar (açıklıklar kesilerek)
    const roomColorOf = w => P.rooms.find(r => (r.walls || []).includes(w.id) && r.wallColor)?.wallColor;
    for (const w of P.walls) {
      const L = wallLen(w); if (L < 1) continue;
      const t = w.t || meta.wallT, H0 = w.h || meta.wallH, H = cut ? Math.min(cutH, H0) : H0;
      const color = w.color || roomColorOf(w) || meta.wallColor || '#F7F5F0';
      const mw = this.std(color, 0.92);
      const u = wallDir(w), ang = -Math.atan2(u.y, u.x);
      const ops = P.openings.filter(o => o.wallId === w.id).sort((a, b) => a.pos - b.pos);
      const piece = (s0, s1, y0, y1) => {
        if (s1 - s0 < 0.1 || y1 - y0 < 0.1) return;
        const m = new THREE.Mesh(new THREE.BoxGeometry(M(s1 - s0), M(y1 - y0), M(t)), mw);
        const c = V.add(w.a, V.mul(u, (s0 + s1) / 2));
        m.position.set(M(c.x), M((y0 + y1) / 2), M(c.y)); m.rotation.y = ang;
        m.castShadow = m.receiveShadow = true; m.name = 'Duvar';
        g.add(m);
      };
      const ex = wallExt(P, w);   // serbest uçta duvar işaretlenen noktada biter
      let s = -ex.a;
      for (const o of ops) {
        const o0 = o.pos - o.w / 2, o1 = o.pos + o.w / 2;
        piece(s, o0, 0, H);
        const sill = o.type === 'window' ? o.sill : 0, top = Math.min(H0, sill + o.h);
        piece(o0, o1, 0, Math.min(sill, H));
        if (top < H) piece(o0, o1, top, H);
        this.opening(o, w, u, ang, t, Math.min(top, H));
        s = o1;
      }
      piece(s, L + ex.b, 0, H);
    }

    // korkuluklar
    for (const r of P.rails || []) g.add(this.railing(r));

    // mobilya
    for (const it of P.items) g.add(this.furniture(it));
    for (const st of P.stairs || []) this.stair(st, g);
  }

  opening(o, w, u, ang, t, topClip) {
    if (o.type === 'gap') return;
    const g = new THREE.Group(); g.name = o.type === 'window' ? 'Pencere' : 'Kapi';
    const c = V.add(w.a, V.mul(u, o.pos));
    g.position.set(M(c.x), 0, M(c.y)); g.rotation.y = ang;
    const fr = this.std(frameColor(o), 0.5), W = M(o.w), T = M(t), f = 0.05, sd = o.side || 1;
    const box = (sx, sy, sz, x, y, z, m) => { const b = new THREE.Mesh(new THREE.BoxGeometry(Math.max(sx, 0.002), Math.max(sy, 0.002), Math.max(sz, 0.002)), m); b.position.set(x, y, z); b.castShadow = b.receiveShadow = true; g.add(b); return b; };
    const glassM = (frost) => this.mat(frost ? 'frost' : 'glass', () => frost
      ? new THREE.MeshPhysicalMaterial({ color: '#F4F8F9', roughness: 0.55, transmission: 0.6, thickness: 0.01, transparent: true, opacity: 0.8 })
      : new THREE.MeshPhysicalMaterial({ color: '#E8F6F8', metalness: 0, roughness: 0.02, transmission: 1, thickness: 0.01, ior: 1.5, transparent: true, opacity: 0.25 }));
    const handle = (x, y, z, vertical = false) => { const hd = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.12, 12), this.std('#9DA3A8', 0.3, 0.9)); if (!vertical) hd.rotation.z = Math.PI / 2; hd.position.set(x, y, z); g.add(hd); };
    // çerçeveli cam panel (pencere kanadı / camlı kapı kanadı)
    const glazed = (x0, x1, y0, y1, z, prof, depth, m, frost) => {
      const ww = x1 - x0, hh = y1 - y0, cx = (x0 + x1) / 2;
      box(ww, prof, depth, cx, y0 + prof / 2, z, m); box(ww, prof, depth, cx, y1 - prof / 2, z, m);
      box(prof, hh, depth, x0 + prof / 2, (y0 + y1) / 2, z, m); box(prof, hh, depth, x1 - prof / 2, (y0 + y1) / 2, z, m);
      const gl = new THREE.Mesh(new THREE.BoxGeometry(Math.max(ww - prof * 2, 0.01), Math.max(hh - prof * 2, 0.01), 0.008), glassM(frost)); gl.position.set(cx, (y0 + y1) / 2, z); g.add(gl);
    };
    if (o.type === 'window') {
      const y0 = M(o.sill), y1 = Math.min(M(o.sill + o.h), M(topClip));
      if (y1 <= y0) return;
      const hgt = y1 - y0, wu = winUse(o), wm = winModel(o), D = T * 0.6;
      box(W, f, D, 0, y0 + f / 2, 0, fr); box(W, f, D, 0, y1 - f / 2, 0, fr);
      box(f, hgt, D, -W / 2 + f / 2, y0 + hgt / 2, 0, fr); box(f, hgt, D, W / 2 - f / 2, y0 + hgt / 2, 0, fr);
      const S = sashes(o), X = r => -W / 2 + f + r * (W - 2 * f), sy0 = y0 + f, sy1 = y1 - f;
      if (!S.length) { const gl = new THREE.Mesh(new THREE.BoxGeometry(W - f * 2, hgt - f * 2, 0.01), glassM(wu.frost)); gl.position.set(0, y0 + hgt / 2, 0); g.add(gl); }
      S.forEach(([a, b, open], i) => {
        const z = wm === 'surme' ? (i ? -0.02 : 0.02) : 0;
        glazed(X(a), X(b), sy0, sy1, z, open ? 0.055 : 0.03, open ? 0.06 : 0.04, fr, wu.frost);
        if (wm !== 'surme' && a > 0) box(0.02, hgt, D, X(a), y0 + hgt / 2, 0, fr);
        if (open && wm !== 'sabit') {
          const hx = wm === 'vasistas' ? (X(a) + X(b)) / 2 : (winHingeAtStart(o, a) ? X(b) - 0.06 : X(a) + 0.06);
          handle(hx, wm === 'vasistas' ? sy1 - 0.08 : sy0 + (sy1 - sy0) * 0.5, sd * 0.05, wm !== 'vasistas');
        }
      });
      if (y0 > 0.02) box(W + 0.06, 0.03, T + 0.06, 0, y0 - 0.015, 0, this.std('#E5DFD3', 0.6)); // denizlik
      if (winRail(o)) {   // fransız balkon korkuluğu: dış tarafta
        const rz = -sd * (T / 2 + 0.06), rail = this.std('#3A3F45', 0.4, 0.6);
        box(W, 0.04, 0.04, 0, 1.0, rz, rail); box(W, 0.02, 0.02, 0, 0.12, rz, rail);
        for (let x = -W / 2 + 0.02; x <= W / 2 - 0.01; x += 0.11) box(0.014, 0.88, 0.014, x, 0.56, rz, rail);
      }
    } else {
      const H = Math.min(M(o.h), M(topClip)), du = doorUse(o), dm = doorModel(o);
      const leafM = this.std(leafColor(o), du.k === 'giris' ? 0.35 : 0.55, du.k === 'giris' ? 0.3 : 0);
      const fw = du.k === 'giris' ? 0.07 : f, fd = du.k === 'giris' ? T + 0.04 : T + 0.02;
      box(fw, H, fd, -W / 2 + fw / 2, H / 2, 0, fr); box(fw, H, fd, W / 2 - fw / 2, H / 2, 0, fr);
      box(W, fw, fd, 0, H - fw / 2, 0, fr);
      if (!this.opt.cut) {
        const lh = H - fw - 0.01, th = du.k === 'giris' ? 0.065 : 0.04;
        // tek kanat paneli: x0..x1, z; kullanım alanına göre dolu / camlı
        const leaf = (x0, x1, z, hx) => {
          const cx = (x0 + x1) / 2, ww = x1 - x0;
          if (du.glass === 'full') glazed(x0, x1, 0.01, lh, z, 0.035, th, leafM, false);
          else if (du.glass === 'low') { glazed(x0, x1, 0.45, lh, z, 0.06, th, leafM, false); box(ww, 0.45, th, cx, 0.225 + 0.005, z, leafM); }
          else {
            const lf = box(ww, lh, th, cx, lh / 2 + 0.005, z, leafM); lf.userData.door = true;
            if (du.k === 'banyo') for (let i = 0; i < 5; i++) box(ww * 0.5, 0.008, th + 0.004, cx, 0.08 + i * 0.022, z, this.std('#3A3F45', 0.6));   // alt menfez
            if (du.k === 'giris') { box(ww * 0.7, lh * 0.7, 0.004, cx, lh / 2, z + sd * (th / 2 + 0.002), this.std(leafColor(o), 0.5)); box(0.06, 0.25, 0.01, hx, H * 0.47, z + sd * (th / 2 + 0.005), this.std('#9DA3A8', 0.3, 0.9)); }
          }
          if (hx !== null) handle(hx, H * 0.47, z + sd * (th / 2 + 0.02));
        };
        const iw = W - fw * 2 - 0.01, X = r => -iw / 2 + r * iw;
        if (dm === 'surgu') {
          const z = sd * (T / 2 + 0.03), ext = 0.05;
          box(iw + 0.25, 0.05, 0.05, 0, H + 0.03, z, this.std('#9DA3A8', 0.3, 0.8));   // ray
          leaf(-iw / 2 - ext, iw / 2 + ext, z, (o.flip ? 1 : -1) * (iw / 2 - 0.05));
        } else if (dm === 'gomme') leaf(X(0), X(1), 0, (o.flip ? 1 : -1) * (iw / 2 - 0.04));
        else if (dm === 'katlanir') {
          for (let i = 0; i < 4; i++) leaf(X(i / 4) + 0.003, X((i + 1) / 4) - 0.003, 0, i === (o.flip ? 0 : 3) ? X(o.flip ? 0.06 : 0.94) : null);
        } else for (const [a, b, hk] of leaves(o)) {
          const x0 = X(a) + 0.002, x1 = X(b) - 0.002;
          leaf(x0, x1, 0, hk === 'a' ? x1 - 0.08 : x0 + 0.08);
        }
      }
    }
    this.root.add(g);
  }

  /* çizilen korkuluk: dikmeler + küpeşte; dolgu türe göre (dikey / yatay çubuk, cam panel, dolu parapet) */
  railing(r) {
    const g = new THREE.Group(); g.name = 'Korkuluk';
    const L = M(V.dist(r.a, r.b)); if (L < 0.02) return g;
    const u = V.norm(V.sub(r.b, r.a)), c = V.lerp(r.a, r.b, 0.5), kd = railKind(r), Hh = M(r.h || 110);
    g.position.set(M(c.x), 0, M(c.y)); g.rotation.y = -Math.atan2(u.y, u.x);
    const box = (sx, sy, sz, x, y, z, m) => { const b = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), m); b.position.set(x, y, z); b.castShadow = b.receiveShadow = true; g.add(b); return b; };
    if (kd.k === 'dolu') {
      box(L, Hh, 0.12, 0, Hh / 2, 0, this.std(this.plan.meta.wallColor || '#F7F5F0', 0.9));
      box(L + 0.03, 0.04, 0.17, 0, Hh + 0.02, 0, this.std('#E5DFD3', 0.6));
      return g;
    }
    const metal = kd.k === 'cam' ? this.std('#C9CDD2', 0.25, 0.85) : this.std(kd.c, 0.45, 0.5);
    const np = Math.max(1, Math.ceil(L / 1.2));
    for (let i = 0; i <= np; i++) box(0.045, Hh, 0.045, -L / 2 + i * L / np, Hh / 2, 0, metal);
    box(L + 0.05, 0.05, 0.07, 0, Hh, 0, metal);                           // küpeşte
    if (kd.k === 'dikey') { box(L, 0.03, 0.03, 0, 0.08, 0, metal); for (let x = -L / 2 + 0.11; x < L / 2 - 0.05; x += 0.11) box(0.016, Hh - 0.12, 0.016, x, 0.08 + (Hh - 0.12) / 2, 0, metal); }
    else if (kd.k === 'yatay') for (let y = 0.12; y < Hh - 0.08; y += 0.12) box(L, 0.018, 0.018, 0, y, 0, metal);
    else {
      const glass = this.mat('railglass', () => new THREE.MeshStandardMaterial({ color: '#BFE3EA', roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.38 }));
      const gl = new THREE.Mesh(new THREE.BoxGeometry(Math.max(0.02, L - 0.06), Hh - 0.12, 0.012), glass); gl.position.set(0, 0.06 + (Hh - 0.12) / 2, 0); g.add(gl);
    }
    return g;
  }

  furniture(it) {
    const g = new THREE.Group(); g.name = it.label || it.type;
    g.position.set(M(it.x), M(it.z || 0), M(it.y));
    g.rotation.y = -it.rot * Math.PI / 180;
    const W = M(it.w), D = M(it.d), H = M(it.h), col = it.color;
    const m = this.std(col, 0.8), dark = this.std('#3A3F45', 0.6), white = this.std('#FFFFFF', 0.25), leg = this.std('#5B4636', 0.6);
    const box = (sx, sy, sz, x, y, z, mm = m, r = 0) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(Math.max(sx, 0.005), Math.max(sy, 0.005), Math.max(sz, 0.005)), mm);
      b.position.set(x, y, z); b.rotation.y = r; b.castShadow = b.receiveShadow = true; g.add(b); return b;
    };
    const legs = (w, d, h, th = 0.04) => [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => box(th, h, th, a * (w / 2 - th), h / 2, b * (d / 2 - th), leg));
    const cyl = (r1, r2, h, x, y, z, mm = m, seg = 24) => { const c = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, seg), mm); c.position.set(x, y, z); c.castShadow = c.receiveShadow = true; g.add(c); return c; };
    const ball = (r, x, y, z, mm = m) => { const b = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14), mm); b.position.set(x, y, z); b.castShadow = true; g.add(b); return b; };
    const metal = this.std('#9DA3A8', 0.3, 0.9), glass = this.std('#DCEFF2', 0.05), steel = this.std('#C9CDD2', 0.25, 0.8);
    // ön yüzde kapak / çekmece derzleri: n parçaya böl
    const fronts = (w, h, d, y0, n, vertical = true) => { for (let i = 1; i < n; i++) vertical ? box(0.004, h - 0.02, 0.004, -w / 2 + i * w / n, y0 + h / 2, d / 2, dark) : box(w - 0.02, 0.004, 0.004, 0, y0 + i * h / n, d / 2, dark); };
    const sofa = (w, d) => {   // yaslanma arkada (-z), oturma önde
      const arm = Math.min(0.18, w * 0.15);
      box(w, H * 0.45, d, 0, H * 0.225 + 0.06, 0); legs(w, d, 0.06, 0.05);
      box(w, H * 0.55, d * 0.22, 0, H * 0.725, -d / 2 + d * 0.11);
      box(arm, H * 0.3, d, -w / 2 + arm / 2, H * 0.6, 0); box(arm, H * 0.3, d, w / 2 - arm / 2, H * 0.6, 0);
      const cush = this.std(col, 0.95), n = Math.max(1, Math.round((w - 2 * arm) / 0.7)), cw = (w - 2 * arm) / n;
      for (let i = 0; i < n; i++) box(cw - 0.02, 0.12, d * 0.7, -w / 2 + arm + cw * (i + 0.5), H * 0.45 + 0.12, d * 0.08, cush);
    };
    const fx = fixtureOf(it.type);
    if (fx) {
      if (fx.mount === 'ceil') { if (this.opt.cut) return g; g.position.y = M((this.curMeta || this.plan.meta).wallH); }
      fixture3D(THREE, g, it, (c, r, mt) => this.std(c, r, mt));
      return g;
    }
    switch (it.type) {
      case 'cabinet': build3D(THREE, g, it, (c, r, mt) => this.std(c, r, mt)); break;
      case 'ikili': sofa(W, D); break;
      case 'lkanepe': {
        const sd = Math.min(0.95, D * 0.45);
        // uzun kol arkada, köşe uzantısı sağda öne doğru
        const g0 = g; sofa(W, sd); g.children.forEach(c => { c.position.z += -D / 2 + sd / 2; });
        const ext = new THREE.Group(); ext.position.set(W / 2 - sd / 2, 0, sd / 2); g0.add(ext);
        const b2 = (sx, sy, sz, x, y, z) => { const b = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), m); b.position.set(x, y, z); b.castShadow = b.receiveShadow = true; ext.add(b); };
        const L2 = D - sd;
        b2(sd, H * 0.45, L2, 0, H * 0.225 + 0.06, 0); b2(sd * 0.22, H * 0.55, L2, sd / 2 - sd * 0.11, H * 0.725, 0);
        b2(sd, H * 0.3, 0.16, 0, H * 0.6, L2 / 2 - 0.08);
        break;
      }
      case 'ukanepe': {
        const sd = Math.min(0.95, D * 0.45, W * 0.32);
        // arka kol boydan boya, iki yanda öne doğru uzantı
        sofa(W, sd); g.children.forEach(c => { c.position.z += -D / 2 + sd / 2; });
        const L2 = D - sd;
        for (const sx of [-1, 1]) {
          const ext = new THREE.Group(); ext.position.set(sx * (W / 2 - sd / 2), 0, sd / 2); g.add(ext);
          const b2 = (bx, by, bz, x, y, z) => { const b = new THREE.Mesh(new THREE.BoxGeometry(bx, by, bz), m); b.position.set(x, y, z); b.castShadow = b.receiveShadow = true; ext.add(b); };
          b2(sd, H * 0.45, L2, 0, H * 0.225 + 0.06, 0); b2(sd * 0.22, H * 0.55, L2, sx * (sd / 2 - sd * 0.11), H * 0.725, 0);
          b2(sd, H * 0.3, 0.16, 0, H * 0.6, L2 / 2 - 0.08);
        }
        break;
      }
      case 'dondurucu': {   // tezgah altı ankastre derin dondurucu: dolap kapağı arkasında, 3 çekmece
        box(W, 0.08, D - 0.05, 0, 0.04, -0.025, dark);
        box(W, H - 0.08, D, 0, 0.08 + (H - 0.08) / 2, 0);
        fronts(W, H - 0.08, D, 0.08, 3, false);
        for (let i = 0; i < 3; i++) box(W * 0.4, 0.015, 0.025, 0, 0.08 + (H - 0.08) * (i + 1) / 3 - 0.05, D / 2 + 0.012, metal);
        break;
      }
      case 'kasetklima': {  // çift yönlü kaset klima: gövde asma tavan içinde, panel tavanda; iki uzun kenarda üfleme
        if (this.opt.cut) return g;
        g.position.y = M((this.curMeta || this.plan.meta).wallH);
        box(W * 0.84, H - 0.02, D * 0.8, 0, -(H - 0.02) / 2 - 0.02, 0, this.std('#D9DCDF', 0.5));
        box(W, 0.02, D, 0, -0.01, 0, white);
        const slot = this.std('#2E3135', 0.5);
        for (const sz of [-1, 1]) box(W * 0.78, 0.004, D * 0.12, 0, -0.022, sz * D * 0.36, slot);
        box(W * 0.5, 0.003, D * 0.36, 0, -0.022, 0, this.std('#EEF0F2', 0.7));
        break;
      }
      case 'puf': cyl(W / 2, W / 2, H, 0, H / 2, 0, this.std(col, 0.95), 28); break;
      case 'yansehpa': cyl(W / 2, W / 2, 0.03, 0, H - 0.015, 0, m, 28); cyl(0.02, 0.02, H - 0.03, 0, (H - 0.03) / 2, 0, dark, 10); cyl(W * 0.3, W * 0.3, 0.02, 0, 0.01, 0, dark, 24); break;
      case 'kitaplik': {
        const t = 0.02, n = Math.max(3, Math.round(H / 0.38));
        box(t, H, D, -W / 2 + t / 2, H / 2, 0); box(t, H, D, W / 2 - t / 2, H / 2, 0); box(W, H, t, 0, H / 2, -D / 2 + t / 2);
        for (let i = 0; i <= n; i++) box(W - 2 * t, t, D, 0, Math.min(H - t / 2, i * H / n + t / 2), 0);
        const bk = ['#B5503A', '#2F6F8F', '#D9B44A', '#4F7A4B', '#7B5A8E'];
        for (let i = 0; i < n; i++) for (let j = 0; j < Math.floor((W - 0.06) / 0.05); j += 1 + (j % 3 === 0)) {
          const bh = H / n * (0.55 + ((i * 7 + j * 3) % 5) * 0.07);
          box(0.035, bh, D * 0.75, -W / 2 + 0.04 + j * 0.05, i * H / n + t + bh / 2, 0.02, this.std(bk[(i + j) % bk.length], 0.8));
        }
        break;
      }
      case 'konsol': case 'vitrin': case 'sifonyer': case 'komodin': case 'dosyadolap': {
        const lg = it.type === 'konsol' ? 0.1 : 0.04;
        box(W, H - lg, D, 0, lg + (H - lg) / 2, 0); legs(W, D, lg, 0.04);
        if (it.type === 'vitrin') { fronts(W, H - lg, D, lg, Math.max(2, Math.round(W / 0.5))); }
        else fronts(W, H - lg - 0.02, D, lg, it.type === 'konsol' ? 2 : Math.max(2, Math.round(H / 0.25)), false);
        break;
      }
      case 'hali': box(W, 0.012, D, 0, 0.006, 0, this.std(col, 1)); box(W - 0.2, 0.013, D - 0.2, 0, 0.0065, 0, this.std('#D8CBB6', 1)); break;
      case 'lambader': cyl(0.15, 0.15, 0.02, 0, 0.01, 0, dark); cyl(0.012, 0.012, H - 0.3, 0, (H - 0.3) / 2, 0, dark, 8); cyl(0.13, 0.2, 0.3, 0, H - 0.15, 0, this.std('#F4EEE4', 0.9), 24); break;
      case 'avize': cyl(0.005, 0.005, 0.6, 0, H + 0.3, 0, dark, 6); cyl(W * 0.1, W / 2, H, 0, H / 2, 0, this.std(col, 0.4, 0.3), 32); break;
      case 'somine':
        box(W, H, D, 0, H / 2, 0); box(W + 0.1, 0.06, D + 0.08, 0, H + 0.03, 0.02, this.std('#BFB6A8', 0.5));
        box(W * 0.5, H * 0.5, 0.02, 0, H * 0.35, D / 2, this.std('#16171A', 0.6)); break;
      case 'yuvarlakmasa': case 'bahcemasa':
        cyl(W / 2, W / 2, 0.04, 0, H - 0.02, 0, it.type === 'bahcemasa' ? m : this.std(col, 0.5), 40);
        cyl(0.05, 0.05, H - 0.04, 0, (H - 0.04) / 2, 0, dark, 12); cyl(W * 0.25, W * 0.28, 0.03, 0, 0.015, 0, dark, 24); break;
      case 'tabure': cyl(W / 2, W / 2, 0.05, 0, H - 0.025, 0, m, 24); cyl(0.025, 0.025, H - 0.05, 0, (H - 0.05) / 2, 0, metal, 10); cyl(W * 0.4, W * 0.4, 0.02, 0, 0.01, 0, metal, 24); cyl(W * 0.35, W * 0.35, 0.015, 0, H * 0.35, 0, metal, 24); break;
      case 'kingyatak':
        box(W, 0.3, D, 0, 0.15, 0, this.std('#8A6A4F', 0.6)); box(W - 0.04, 0.22, D - 0.06, 0, 0.41, 0.02, this.std('#F4F2EE', 0.95));
        box(W, 0.9, 0.08, 0, 0.45, -D / 2 + 0.04, this.std('#8A6A4F', 0.6));
        for (const sx of [-1, 1]) box(W / 2 - 0.12, 0.12, 0.38, sx * W / 4, 0.58, -D / 2 + 0.32, this.std('#FFFFFF', 1));
        box(W - 0.02, 0.05, D * 0.55, 0, 0.535, D * 0.2, this.std('#00AFB0', 0.95)); break;
      case 'ranza':
        for (const y of [0.25, 1.25]) { box(W, 0.06, D, 0, y, 0, m); box(W - 0.04, 0.16, D - 0.04, 0, y + 0.11, 0, this.std('#F4F2EE', 0.95)); }
        for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(0.06, H, 0.06, a * (W / 2 - 0.03), H / 2, b * (D / 2 - 0.03), m);
        for (let i = 0; i < 4; i++) box(0.04, 0.03, 0.4, W / 2 - 0.02, 0.4 + i * 0.25, D / 2 - 0.3, m); break;
      case 'bebek':
        box(W, 0.05, D, 0, 0.35, 0, m); box(W - 0.04, 0.1, D - 0.04, 0, 0.42, 0, this.std('#F4F2EE', 0.95));
        for (const sx of [-1, 1]) { box(W, 0.06, 0.04, 0, H - 0.03, sx * (D / 2 - 0.02), m); box(0.04, 0.06, D, sx * (W / 2 - 0.02), H - 0.03, 0, m); }
        for (let i = 0; i <= Math.round(D / 0.08); i++) for (const sx of [-1, 1]) box(0.015, H - 0.35, 0.015, sx * (W / 2 - 0.02), 0.35 + (H - 0.35) / 2, -D / 2 + i * D / Math.round(D / 0.08), m);
        legs(W, D, 0.35, 0.04); break;
      case 'makyaj': case 'calismamasa':
        box(W, 0.035, D, 0, H - 0.0175, 0, m); box(0.4, H * 0.45, D - 0.04, W / 2 - 0.21, H - 0.035 - H * 0.225, 0); legs(W, D, H - 0.035, 0.04);
        if (it.type === 'makyaj') box(W * 0.6, 0.6, 0.02, 0, H + 0.4, -D / 2 + 0.03, glass);
        break;
      case 'ofiskoltuk':
        cyl(0.3, 0.3, 0.03, 0, 0.06, 0, dark, 5); cyl(0.03, 0.03, 0.4, 0, 0.26, 0, metal, 10);
        box(0.5, 0.08, 0.48, 0, 0.48, 0, m); box(0.46, 0.55, 0.06, 0, 0.8, -0.22, m); break;
      case 'boydolap': box(W, H, D, 0, H / 2, 0); fronts(W, H, D, 0, 3, false); break;
      case 'gardrobbuz': box(W, H, D, 0, H / 2, 0, steel); box(0.004, H - 0.02, 0.004, 0, H / 2, D / 2, dark);
        for (const sx of [-1, 1]) box(0.015, 0.5, 0.03, sx * 0.04, H * 0.6, D / 2 + 0.02, metal); break;
      case 'bulasik': case 'kurutma':
        box(W, H, D, 0, H / 2, 0, this.std('#E9EBED', 0.4, 0.3)); box(W - 0.02, 0.1, 0.01, 0, H - 0.07, D / 2, dark);
        if (it.type === 'kurutma') { const d = cyl(0.17, 0.17, 0.02, 0, H * 0.45, D / 2 + 0.01, this.std('#2E3135', 0.2), 32); d.rotation.x = Math.PI / 2; }
        break;
      case 'firin': box(W, H, D, 0, H / 2, 0, dark); box(W * 0.8, H * 0.55, 0.01, 0, H * 0.42, D / 2, this.std('#111214', 0.1)); box(W * 0.7, 0.02, 0.03, 0, H * 0.8, D / 2 + 0.02, metal); break;
      case 'ocak':
        box(W, 0.01, D, 0, 0.005, 0, this.std('#111214', 0.1));
        for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) cyl(0.08, 0.08, 0.004, a * W / 4, 0.012, b * D / 4, this.std('#3A3F45', 0.4), 24);
        break;
      case 'evye':
        box(W, 0.01, D, 0, H, 0, steel); box(W * 0.45, H - 0.02, D - 0.1, -W * 0.2, H / 2, 0, steel);
        cyl(0.012, 0.012, 0.3, W * 0.3, H + 0.15, -D / 2 + 0.07, metal, 10); break;
      case 'davlumbaz': box(W, 0.08, D, 0, 0.04, 0, steel); box(0.3, H - 0.08, 0.25, 0, 0.08 + (H - 0.08) / 2, -D / 2 + 0.125, steel); break;
      case 'asmaklozet':
        box(W, H, 0.12, 0, H / 2, -D / 2 + 0.06, this.std('#E9EBED', 0.6));
        box(0.2, 0.14, 0.01, 0, H * 0.8, -D / 2 + 0.125, white);
        { const bowl = cyl(0.19, 0.16, 0.34, 0, 0.4, 0.04, white, 32); bowl.scale.z = 1.35; }
        break;
      case 'ayna': box(W, H, D, 0, H / 2, 0, this.std('#F2F0EC', 0.6)); box(W - 0.02, H - 0.02, 0.005, 0, H / 2, D / 2, glass); break;
      case 'duskabin':
        box(W, 0.05, D, 0, 0.025, 0, white);
        box(W, H - 0.05, 0.008, 0, 0.05 + (H - 0.05) / 2, D / 2, glass); box(0.008, H - 0.05, D, W / 2, 0.05 + (H - 0.05) / 2, 0, glass);
        cyl(0.1, 0.1, 0.01, -W / 4, H - 0.1, -D / 4, metal, 20); break;
      case 'havlupan': for (let i = 0; i < Math.round(H / 0.08); i++) box(W, 0.02, 0.02, 0, 0.04 + i * 0.08, 0, this.std(col, 0.3, 0.6));
        for (const sx of [-1, 1]) box(0.03, H, 0.03, sx * W / 2, H / 2, 0, this.std(col, 0.3, 0.6)); break;
      case 'radyator': for (let i = 0; i < Math.round(W / 0.05); i++) box(0.04, H, D, -W / 2 + 0.025 + i * 0.05, H / 2, 0, white); break;
      case 'kombi': case 'termosifon': case 'klima':
        if (it.type === 'termosifon') { const c = cyl(Math.min(W, D) / 2, Math.min(W, D) / 2, H, 0, H / 2, 0, white, 28); }
        else { box(W, H, D, 0, H / 2, 0, white); box(W * 0.8, 0.01, 0.005, 0, H * (it.type === 'klima' ? 0.2 : 0.15), D / 2, dark); }
        break;
      case 'kolon': case 'nis': box(W, H, D, 0, H / 2, 0, this.std(col, 0.95)); break;
      case 'merdiven': {
        const n = Math.max(2, Math.round(H / 0.175)), rh = H / n, td = D / n;
        for (let i = 0; i < n; i++) box(W, rh * (i + 1), td, 0, rh * (i + 1) / 2, D / 2 - td * (i + 0.5), this.std(col, 0.9));
        break;
      }
      case 'basamak': box(W, H, D, 0, H / 2, 0, this.std(col, 0.9)); break;
      case 'sezlong':
        box(W, 0.06, D * 0.7, 0, 0.3, D * 0.15, m); legs(W, D * 0.7, 0.27, 0.04);
        { const back = box(W, 0.06, D * 0.32, 0, 0.45, -D / 2 + D * 0.14, m); back.rotation.x = 0.7; }
        break;
      case 'semsiye':
        cyl(0.02, 0.02, H, 0, H / 2, 0, this.std('#D9D6D0', 0.5), 8); cyl(0.25, 0.25, 0.05, 0, 0.025, 0, dark, 20);
        { const c = new THREE.Mesh(new THREE.ConeGeometry(W / 2, 0.45, 8, 1, true), this.std(col, 0.95)); c.position.y = H - 0.2; c.castShadow = true; c.material.side = THREE.DoubleSide; g.add(c); }
        break;
      case 'barbeku':
        box(W, H * 0.75, D, 0, H * 0.375, 0, this.std('#B5503A', 0.9)); box(W * 0.6, 0.02, D * 0.8, 0, H * 0.76, 0, dark);
        box(0.4, 0.8, 0.4, 0, H * 0.75 + 0.4, -D / 2 + 0.2, this.std('#B5503A', 0.9)); break;
      case 'agac':
        cyl(0.08, 0.14, H * 0.45, 0, H * 0.225, 0, this.std('#6B4F3A', 0.9), 12);
        { const lf = this.std(col, 0.9); for (let i = 0; i < 6; i++) ball(W * (0.22 + ((i * 37) % 10) / 80), Math.cos(i * 1.7) * W * 0.18, H * (0.55 + (i % 3) * 0.12), Math.sin(i * 1.7) * W * 0.18, lf); }
        break;
      case 'kanepe': case 'koltuk': {
        const arm = Math.min(0.18, W * 0.15);
        box(W, H * 0.45, D, 0, H * 0.225 + 0.06, 0); legs(W, D, 0.06, 0.05);
        box(W, H * 0.55, D * 0.22, 0, H * 0.45 + H * 0.275, -D / 2 + D * 0.11);
        box(arm, H * 0.3, D, -W / 2 + arm / 2, H * 0.6, 0); box(arm, H * 0.3, D, W / 2 - arm / 2, H * 0.6, 0);
        const cush = this.std(col, 0.95);
        const n = it.type === 'kanepe' ? Math.max(2, Math.round((W - 2 * arm) / 0.7)) : 1, cw = (W - 2 * arm) / n;
        for (let i = 0; i < n; i++) box(cw - 0.02, 0.12, D * 0.7, -W / 2 + arm + cw * (i + 0.5), H * 0.45 + 0.12, D * 0.08, cush);
        break;
      }
      case 'yatak': case 'tekyatak':
        box(W, 0.3, D, 0, 0.15, 0, this.std('#8A6A4F', 0.6));
        box(W - 0.04, 0.22, D - 0.06, 0, 0.41, 0.02, this.std('#F4F2EE', 0.95));
        box(W, 0.9, 0.08, 0, 0.45, -D / 2 + 0.04, this.std('#8A6A4F', 0.6));
        for (let i = 0; i < (it.type === 'yatak' ? 2 : 1); i++) box(it.type === 'yatak' ? W / 2 - 0.12 : W - 0.2, 0.12, 0.38, it.type === 'yatak' ? (i ? 1 : -1) * W / 4 : 0, 0.58, -D / 2 + 0.32, this.std('#FFFFFF', 1));
        box(W - 0.02, 0.05, D * 0.55, 0, 0.535, D * 0.2, this.std(col === '#ECE8E1' ? '#00AFB0' : col, 0.95));
        break;
      case 'masa': case 'sehpa':
        box(W, 0.04, D, 0, H - 0.02, 0, it.type === 'sehpa' ? m : this.std(col, 0.5)); legs(W, D, H - 0.04, 0.05); break;
      case 'sandalye':
        box(W, 0.05, D, 0, 0.46, 0); legs(W, D, 0.44, 0.03); box(W, H - 0.48, 0.04, 0, 0.48 + (H - 0.48) / 2, -D / 2 + 0.02); break;
      case 'tezgah': case 'lavabo':
        box(W, H - 0.04, D - 0.02, 0, (H - 0.04) / 2, 0.01);
        box(W + 0.01, 0.04, D + 0.02, 0, H - 0.02, 0.01, this.std(it.type === 'lavabo' ? '#FFFFFF' : '#D9D6D0', 0.25));
        if (it.type === 'lavabo') { const s = new THREE.Mesh(new THREE.CylinderGeometry(Math.min(W, D) * 0.3, Math.min(W, D) * 0.25, 0.1, 32), white); s.position.set(0, H + 0.02, 0.03); s.castShadow = true; g.add(s); }
        for (let i = 1; i < Math.round(W / 0.6); i++) box(0.005, H - 0.12, 0.005, -W / 2 + i * W / Math.round(W / 0.6), (H - 0.04) / 2, D / 2, dark);
        break;
      case 'klozet': {
        box(W * 0.9, 0.38, D * 0.35, 0, 0.19 + 0.0, -D / 2 + D * 0.17, white);
        const bowl = new THREE.Mesh(new THREE.CylinderGeometry(W / 2, W * 0.38, 0.4, 32), white);
        bowl.scale.z = 1.3; bowl.position.set(0, 0.2, D * 0.12); bowl.castShadow = true; g.add(bowl); break;
      }
      case 'kuvet':
        box(W, H, D, 0, H / 2, 0, white); box(W - 0.12, 0.02, D - 0.12, 0, H - 0.005, 0, this.std('#DCEFF2', 0.1)); break;
      case 'dus':
        box(W, 0.05, D, 0, 0.025, 0, white); break;
      case 'bitki': {
        const pot = new THREE.Mesh(new THREE.CylinderGeometry(W * 0.32, W * 0.25, H * 0.3, 24), this.std('#C9A27E', 0.8));
        pot.position.y = H * 0.15; pot.castShadow = true; g.add(pot);
        const leaf = this.std(col, 0.9);
        for (let i = 0; i < 5; i++) { const s = new THREE.Mesh(new THREE.IcosahedronGeometry(W * (0.25 + Math.random() * 0.12), 1), leaf); s.position.set((Math.random() - .5) * W * 0.4, H * (0.55 + i * 0.09), (Math.random() - .5) * W * 0.4); s.castShadow = true; g.add(s); }
        break;
      }
      case 'tv':
        box(W, H, D, 0, H / 2, 0); box(W * 0.75, W * 0.75 * 0.56, 0.03, 0, H + 0.05 + W * 0.21, -D / 4, this.std('#111214', 0.2)); break;
      case 'gardirop': case 'ustdolap': case 'buzdolabi': case 'camasir':
        box(W, H, D, 0, H / 2, 0);
        for (let i = 1; i < Math.max(1, Math.round(W / 0.5)); i++) box(0.004, H - 0.02, 0.004, -W / 2 + i * W / Math.round(W / 0.5), H / 2, D / 2, dark);
        if (it.type === 'camasir') { const d = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.02, 32), this.std('#2E3135', 0.2)); d.rotation.x = Math.PI / 2; d.position.set(0, H * 0.45, D / 2 + 0.01); g.add(d); }
        break;
      case 'ada':
        box(W, H - 0.04, D, 0, (H - 0.04) / 2, 0); box(W + 0.06, 0.04, D + 0.06, 0, H - 0.02, 0, this.std('#F2F0EC', 0.2)); break;
      default:
        box(W, H, D, 0, H / 2, 0);
    }
    return g;
  }

  bounds() {
    const P = this.plan; const pts = [];
    P.walls.forEach(w => pts.push(w.a, w.b)); P.rooms.forEach(r => pts.push(...r.pts)); P.items.forEach(i => pts.push(i));
    if (!pts.length) return { cx: 0, cz: 0, r: 5, x0: -5, x1: 5, z0: -5, z1: 5 };
    const xs = pts.map(p => M(p.x)), zs = pts.map(p => M(p.y));
    const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
    return { cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, r: Math.max(2, Math.hypot(x1 - x0, z1 - z0) / 2), x0, x1, z0, z1 };
  }

  placeSun(sun = this.sun) {
    const b = this.bounds(), az = this.opt.sunAz * Math.PI / 180, el = this.opt.sunEl * Math.PI / 180, R = b.r * 3 + 10;
    sun.position.set(b.cx + R * Math.cos(el) * Math.sin(az), R * Math.sin(el), b.cz + R * Math.cos(el) * Math.cos(az));
    sun.target.position.set(b.cx, 0, b.cz); sun.target.updateMatrixWorld();
    const sc = sun.shadow.camera, e = b.r + 2;
    sc.left = -e; sc.right = e; sc.top = e; sc.bottom = -e; sc.near = 0.5; sc.far = R * 2 + e; sc.updateProjectionMatrix();
    const k = Math.max(0.15, Math.sin(el));
    sun.intensity = 2.8 * k;
    sun.color.set(el < 0.35 ? '#FFC58A' : '#FFF4E5');
    this.dirty = true;
  }

  frame() {
    const b = this.bounds();
    this.opt.mode = 'orbit';
    this.camera.fov = 45; this.camera.updateProjectionMatrix();
    const H = this.hTop || 3, d = (Math.max(b.r, H * 0.9) * 1.45 + 2.5) * Math.max(1, 1.4 / (this.camera.aspect || 1));
    this.camera.position.set(b.cx + d * 0.55, d * 0.75 + H * 0.3, b.cz + d * 0.85);
    this.controls.target.set(b.cx, Math.max(0.6, H * 0.42), b.cz);
    this.controls.enableZoom = true; this.controls.enablePan = true;
    this.controls.minDistance = 0.5; this.controls.maxDistance = 200;
    this.controls.maxPolarAngle = Math.PI * 0.49;
    this.controls.update(); this.dirty = true;
  }
  top() {
    const b = this.bounds();
    this.opt.mode = 'orbit';
    this.camera.fov = 40; this.camera.updateProjectionMatrix();
    this.camera.position.set(b.cx, b.r * 3 + 4, b.cz + 0.01);
    this.controls.target.set(b.cx, 0, b.cz);
    this.controls.update(); this.dirty = true;
  }
  interior(roomId) {
    const P = this.plan, r = P.rooms.find(x => x.id === roomId) || P.rooms[0];
    if (!r) return false;
    this.opt.mode = 'interior'; this.opt.roomId = r.id;
    const c = polyCentroid(r.pts);
    // en uzak köşeye doğru bak
    const far = r.pts.reduce((a, p) => V.dist(p, c) > V.dist(a, c) ? p : a, r.pts[0]);
    const start = V.lerp(c, far, -0.55);
    const eye = pointInPoly(start, r.pts) ? start : c;
    this.camera.fov = 68; this.camera.updateProjectionMatrix();
    this.camera.position.set(M(eye.x), 1.55, M(eye.y));
    const dir = V.norm(V.sub(far, eye));
    this.controls.target.set(M(eye.x) + dir.x * 0.1, 1.53, M(eye.y) + dir.y * 0.1);
    this.controls.enableZoom = false; this.controls.enablePan = false;
    this.controls.minDistance = 0; this.controls.maxPolarAngle = Math.PI * 0.85;
    this.controls.update(); this.dirty = true;
    return true;
  }
  walkTo(p) {
    const d = new THREE.Vector3().subVectors(this.controls.target, this.camera.position);
    this.camera.position.set(p.x, 1.55, p.z);
    this.controls.target.copy(this.camera.position).add(d);
    this.controls.update(); this.dirty = true;
  }
  set(k, v) {
    this.opt[k] = v;
    if (k === 'sunAz' || k === 'sunEl') this.placeSun();
    else if (k === 'exposure') { this.renderer.toneMappingExposure = v; this.dirty = true; }
    else this.build();
  }

  async exportGLB() {
    const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js');
    const prev = { cut: this.opt.cut, ceiling: this.opt.ceiling };
    this.opt.cut = false; this.opt.ceiling = false; this.build();
    const hide = []; this.root.traverse(o => { if (o.userData?.noExport && o.visible) { o.visible = false; hide.push(o); } });
    try { const r = await new GLTFExporter().parseAsync(this.root, { binary: true, onlyVisible: true }); return new Blob([r], { type: 'model/gltf-binary' }); }
    finally { hide.forEach(o => { o.visible = true; }); Object.assign(this.opt, prev); this.build(); this.dirty = true; }
  }

  /* dışa aktarma için tam model: kesit ve tavan kapalı, tam duvar yüksekliği */
  async exportGroups() {
    const { collectMeshes } = await import('./exporters.js');
    const prev = { cut: this.opt.cut, ceiling: this.opt.ceiling };
    this.opt.cut = false; this.opt.ceiling = false; this.build();
    const hide = []; this.root.traverse(o => { if (o.userData?.noExport && o.visible) { o.visible = false; hide.push(o); } });
    try { return collectMeshes(this.root); }
    finally { hide.forEach(o => { o.visible = true; }); Object.assign(this.opt, prev); this.build(); this.dirty = true; }
  }

  /* ───────────── yüksek çözünürlüklü render ─────────────
   * Mobil cihazlarda ikinci bir WebGL bağlamı, büyük gölge haritası ve path tracing'in istediği
   * float dokular çoğu zaman bağlamı düşürür ve siyah görüntü verir. Bu yüzden:
   *  • mobilde görüntüleyicinin kendi renderer'ı kullanılır (yeni bağlam açılmaz),
   *  • çözünürlük ve gölge haritası cihaz sınırına indirilir,
   *  • çıktı siyahsa otomatik olarak daha hafif ayarla yeniden denenir.
   */
  async renderImage({ w = 1920, h = 1080, quality = 'fast', samples = 300, onProgress, signal, onNote } = {}) {
    const mobile = isMobile();
    const gl = this.renderer.getContext(), caps = this.renderer.capabilities;
    const maxSide = Math.min(caps.maxTextureSize || 4096, gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) || 4096, mobile ? 2048 : 4096);
    const k = Math.min(1, maxSide / Math.max(w, h));
    if (k < 1) { w = Math.round(w * k); h = Math.round(h * k); onNote?.(`Bu cihaz için çözünürlük ${w} × ${h} olarak ayarlandı.`); }
    if (quality === 'pt' && !ptSupported(this.renderer)) {
      onNote?.('Bu cihazın grafik birimi fotogerçekçi render\'ı desteklemiyor — hızlı render alınıyor.');
      quality = 'fast';
    }
    let blob = await this.renderOnce({ w, h, quality, samples, onProgress, signal, shared: mobile });
    if (signal?.aborted) return blob;
    if (await isBlack(blob)) {
      // ikinci deneme: görüntüleyicinin renderer'ı, hızlı kalite, daha düşük çözünürlük
      onNote?.(quality === 'pt' ? 'Fotogerçekçi render bu cihazda siyah çıktı — hızlı render alınıyor.' : 'Render daha düşük çözünürlükle yeniden deneniyor.');
      const k2 = Math.min(1, 1280 / Math.max(w, h));
      blob = await this.renderOnce({ w: Math.round(w * k2), h: Math.round(h * k2), quality: 'fast', samples, onProgress, signal, shared: true, light: true });
      if (await isBlack(blob)) throw new Error('Bu cihaz render görüntüsünü oluşturamadı. Bilgisayardan deneyin ya da 3D görünümün ekran görüntüsünü kullanın.');
    }
    return blob;
  }

  async renderOnce({ w, h, quality, samples, onProgress, signal, shared, light = false }) {
    const cam = this.camera.clone(); cam.aspect = w / h; cam.updateProjectionMatrix();
    let r, canvas, restore;
    if (shared) {
      // görüntüleyicinin renderer'ını geçici olarak render boyutuna getir
      r = this.renderer; canvas = r.domElement;
      const pr = r.getPixelRatio(), size = r.getSize(new THREE.Vector2());
      this.busy = true;
      r.setPixelRatio(1); r.setSize(w, h, false);
      restore = () => { r.setPixelRatio(pr); r.setSize(size.x, size.y, false); this.busy = false; this.resize(); };
    } else {
      canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
      r = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
      r.setPixelRatio(1); r.setSize(w, h, false);
      r.toneMapping = THREE.ACESFilmicToneMapping; r.outputColorSpace = THREE.SRGBColorSpace;
      r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
      restore = () => r.dispose();
    }
    r.toneMappingExposure = this.opt.exposure;
    const prevMap = this.sun.shadow.mapSize.x;
    try {
      if (quality === 'pt') return await this.pathTrace(r, cam, canvas, samples, onProgress, signal);
      const sm = light ? 1024 : shared ? 2048 : 4096;
      this.sun.shadow.mapSize.set(sm, sm); this.sun.shadow.map?.dispose(); this.sun.shadow.map = null;
      onProgress?.(0.2);
      if (light) {
        // en hafif yol: son işlem yok, doğrudan çizim
        for (let i = 0; i < 2; i++) { r.render(this.scene, cam); await new Promise(requestAnimationFrame); }
      } else {
        const [{ EffectComposer }, { RenderPass }, { GTAOPass }, { OutputPass }] = await Promise.all([
          import('three/addons/postprocessing/EffectComposer.js'), import('three/addons/postprocessing/RenderPass.js'),
          import('three/addons/postprocessing/GTAOPass.js'), import('three/addons/postprocessing/OutputPass.js')]);
        const comp = new EffectComposer(r);
        comp.setPixelRatio(1); comp.setSize(w, h);
        comp.addPass(new RenderPass(this.scene, cam));
        const ao = new GTAOPass(this.scene, cam, w, h);
        ao.updateGtaoMaterial({ radius: 0.35, distanceExponent: 1.5, thickness: 1, scale: 1.2 });
        ao.blendIntensity = 0.9;
        comp.addPass(ao);
        comp.addPass(new OutputPass());
        onProgress?.(0.4);
        for (let i = 0; i < 3; i++) { comp.render(); await new Promise(requestAnimationFrame); }
        comp.renderTarget1?.dispose(); comp.renderTarget2?.dispose(); ao.dispose?.();
      }
      onProgress?.(1);
      return await canvasBlob(canvas);
    } finally {
      this.sun.shadow.mapSize.set(prevMap, prevMap); this.sun.shadow.map?.dispose(); this.sun.shadow.map = null;
      restore(); this.dirty = true;
    }
  }

  async pathTrace(r, cam, canvas, samples, onProgress, signal) {
    const { WebGLPathTracer, GradientEquirectTexture } = await import('../vendor/pathtracer.js');
    const sky = new GradientEquirectTexture();
    sky.topColor.set('#BFD9F2'); sky.bottomColor.set('#F4EEE4'); sky.exponent = 2; sky.update();
    const sc = this.scene, prevEnv = sc.environment, prevBg = sc.background, prevEI = sc.environmentIntensity;
    sc.environment = sky; sc.background = sky; sc.environmentIntensity = this.opt.mode === 'interior' ? 1.4 : 1;
    const pt = new WebGLPathTracer(r);
    pt.tiles.set(2, 2);
    pt.bounces = this.opt.mode === 'interior' ? 8 : 5;
    pt.transmissiveBounces = 6;
    pt.filterGlossyFactor = 0.5;
    pt.minSamples = 1; pt.renderDelay = 0; pt.fadeDuration = 0;
    pt.dynamicLowRes = false;
    try {
      onProgress?.(0.02);
      await new Promise(requestAnimationFrame);
      pt.setScene(sc, cam);
      while (pt.samples < samples) {
        if (signal?.aborted) break;
        pt.renderSample();
        onProgress?.(0.1 + 0.9 * pt.samples / samples, Math.floor(pt.samples));
        await new Promise(requestAnimationFrame);
      }
      return await canvasBlob(canvas);
    } finally {
      pt.dispose?.();
      sc.environment = prevEnv; sc.background = prevBg; sc.environmentIntensity = prevEI;
    }
  }
}
