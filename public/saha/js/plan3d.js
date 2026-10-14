/* ═══ 2D plan → 3D model, gezinme ve gerçekçi render ═══
 * three.js yalnızca 3D açıldığında yüklenir (vendor/ altında, çevrimdışı çalışır).
 * Render modları:
 *   • hızlı   — rasterize + yumuşak gölge + GTAO ortam kapatma + IBL
 *   • gerçekçi — GPU path tracing (three-gpu-pathtracer), ilerlemeli örnekleme
 */
import { V, wallLen, wallDir, polyCentroid, pointInPoly } from './plan-geom.js';
import { floorTexture } from './textures.js';

let THREE, OrbitControls, RoomEnvironment;
async function loadThree() {
  if (THREE) return;
  THREE = await import('three');
  ({ OrbitControls } = await import('three/addons/controls/OrbitControls.js'));
  ({ RoomEnvironment } = await import('three/addons/environments/RoomEnvironment.js'));
}

const M = v => v / 100; // cm → m

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
      if (this.controls.update() || this.dirty) { this.renderer.render(this.scene, this.camera); this.dirty = false; }
    };
    loop();
    return this;
  }

  resize() {
    const w = this.host.clientWidth, h = this.host.clientHeight;
    if (!w || !h) return;
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
    const P = this.plan; if (!P || !THREE) return;
    this.root.clear();
    this.floors = [];
    const g = this.root, meta = P.meta;
    const cutH = 110;

    // zemin (dış)
    const b = this.bounds();
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), this.std('#D9D2C3', 1));
    ground.rotation.x = -Math.PI / 2; ground.position.set(b.cx, -0.02, b.cz); ground.receiveShadow = true;
    g.add(ground);

    // odalar: zemin + tavan
    for (const r of P.rooms) {
      if (r.pts.length < 3) continue;
      const shape = new THREE.Shape(r.pts.map(p => new THREE.Vector2(M(p.x), -M(p.y))));
      const geo = new THREE.ShapeGeometry(shape);
      geo.rotateX(-Math.PI / 2);
      const tx = floorTexture(THREE, r.floor);
      const fm = this.mat('floor' + r.floor, () => new THREE.MeshStandardMaterial({ map: tx.map, roughness: tx.rough }));
      const fl = new THREE.Mesh(geo, fm);
      fl.position.y = 0.002; fl.receiveShadow = true; fl.userData.room = r.id;
      g.add(fl); this.floors.push(fl);
      if (this.opt.ceiling && !this.opt.cut) {
        const cg = new THREE.ShapeGeometry(shape); cg.rotateX(Math.PI / 2);
        const c = new THREE.Mesh(cg, this.std('#FAFAF8', 0.95));
        c.position.y = M(r.h || meta.wallH); c.receiveShadow = true;
        g.add(c);
        if (this.opt.lights) {
          const ctr = polyCentroid(r.pts);
          const L = new THREE.PointLight('#FFD9A8', 6, 9, 2);
          L.position.set(M(ctr.x), M(r.h || meta.wallH) - 0.25, M(ctr.y));
          g.add(L);
          const bulb = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.02, 24), new THREE.MeshStandardMaterial({ color: '#fff', emissive: '#FFE7C2', emissiveIntensity: 2.5 }));
          bulb.position.set(M(ctr.x), M(r.h || meta.wallH) - 0.012, M(ctr.y));
          g.add(bulb);
        }
      }
    }

    // duvarlar (açıklıklar kesilerek)
    const roomColorOf = w => P.rooms.find(r => (r.walls || []).includes(w.id) && r.wallColor)?.wallColor;
    for (const w of P.walls) {
      const L = wallLen(w); if (L < 1) continue;
      const t = w.t || meta.wallT, H0 = w.h || meta.wallH, H = this.opt.cut ? Math.min(cutH, H0) : H0;
      const color = w.color || roomColorOf(w) || meta.wallColor || '#F7F5F0';
      const mw = this.std(color, 0.92);
      const u = wallDir(w), ang = -Math.atan2(u.y, u.x);
      const ops = P.openings.filter(o => o.wallId === w.id).sort((a, b) => a.pos - b.pos);
      const piece = (s0, s1, y0, y1) => {
        if (s1 - s0 < 0.1 || y1 - y0 < 0.1) return;
        const m = new THREE.Mesh(new THREE.BoxGeometry(M(s1 - s0), M(y1 - y0), M(t)), mw);
        const c = V.add(w.a, V.mul(u, (s0 + s1) / 2));
        m.position.set(M(c.x), M((y0 + y1) / 2), M(c.y)); m.rotation.y = ang;
        m.castShadow = m.receiveShadow = true;
        g.add(m);
      };
      let s = -t / 2;
      for (const o of ops) {
        const o0 = o.pos - o.w / 2, o1 = o.pos + o.w / 2;
        piece(s, o0, 0, H);
        const sill = o.type === 'window' ? o.sill : 0, top = Math.min(H0, sill + o.h);
        piece(o0, o1, 0, Math.min(sill, H));
        if (top < H) piece(o0, o1, top, H);
        this.opening(o, w, u, ang, t, Math.min(top, H));
        s = o1;
      }
      piece(s, L + t / 2, 0, H);
    }

    // mobilya
    for (const it of P.items) g.add(this.furniture(it));

    this.placeSun();
    this.dirty = true;
  }

  opening(o, w, u, ang, t, topClip) {
    if (o.type === 'gap') return;
    const g = new THREE.Group();
    const c = V.add(w.a, V.mul(u, o.pos));
    g.position.set(M(c.x), 0, M(c.y)); g.rotation.y = ang;
    const fr = this.std('#F4F4F2', 0.5), W = M(o.w), T = M(t), f = 0.05;
    const box = (sx, sy, sz, x, y, z, m) => { const b = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), m); b.position.set(x, y, z); b.castShadow = b.receiveShadow = true; g.add(b); return b; };
    if (o.type === 'window') {
      const y0 = M(o.sill), y1 = Math.min(M(o.sill + o.h), M(topClip));
      if (y1 <= y0) return;
      const hgt = y1 - y0;
      box(W, f, T + 0.02, 0, y0 + f / 2, 0, fr); box(W, f, T * 0.6, 0, y1 - f / 2, 0, fr);
      box(f, hgt, T * 0.6, -W / 2 + f / 2, y0 + hgt / 2, 0, fr); box(f, hgt, T * 0.6, W / 2 - f / 2, y0 + hgt / 2, 0, fr);
      if (W > 0.9) box(f * 0.8, hgt, T * 0.5, 0, y0 + hgt / 2, 0, fr);
      const glass = this.mat('glass', () => new THREE.MeshPhysicalMaterial({ color: '#E8F6F8', metalness: 0, roughness: 0.02, transmission: 1, thickness: 0.01, ior: 1.5, transparent: true, opacity: 0.25 }));
      const gl = new THREE.Mesh(new THREE.BoxGeometry(W - f * 2, hgt - f * 2, 0.01), glass);
      gl.position.set(0, y0 + hgt / 2, 0); g.add(gl);
      box(W + 0.06, 0.03, T + 0.06, 0, y0 - 0.015, 0, this.std('#E5DFD3', 0.6)); // denizlik
    } else {
      const H = Math.min(M(o.h), M(topClip));
      const wood = this.std('#B08463', 0.55);
      box(f, H, T + 0.02, -W / 2 + f / 2, H / 2, 0, fr); box(f, H, T + 0.02, W / 2 - f / 2, H / 2, 0, fr);
      box(W, f, T + 0.02, 0, H - f / 2, 0, fr);
      if (!this.opt.cut) {
        const leaf = box(W - f * 2 - 0.01, H - f - 0.01, 0.04, 0, (H - f) / 2, 0, wood);
        const hd = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.12, 12), this.std('#9DA3A8', 0.3, 0.9));
        hd.rotation.z = Math.PI / 2; hd.position.set((o.flip ? -1 : 1) * (W / 2 - 0.12), H * 0.47, 0.04); g.add(hd);
        leaf.userData.door = true;
      }
    }
    this.root.add(g);
  }

  furniture(it) {
    const g = new THREE.Group();
    g.position.set(M(it.x), M(it.z || 0), M(it.y));
    g.rotation.y = -it.rot * Math.PI / 180;
    const W = M(it.w), D = M(it.d), H = M(it.h), col = it.color;
    const m = this.std(col, 0.8), dark = this.std('#3A3F45', 0.6), white = this.std('#FFFFFF', 0.25), leg = this.std('#5B4636', 0.6);
    const box = (sx, sy, sz, x, y, z, mm = m, r = 0) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(Math.max(sx, 0.005), Math.max(sy, 0.005), Math.max(sz, 0.005)), mm);
      b.position.set(x, y, z); b.rotation.y = r; b.castShadow = b.receiveShadow = true; g.add(b); return b;
    };
    const legs = (w, d, h, th = 0.04) => [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => box(th, h, th, a * (w / 2 - th), h / 2, b * (d / 2 - th), leg));
    switch (it.type) {
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
    const d = (b.r * 1.45 + 2.5) * Math.max(1, 1.4 / (this.camera.aspect || 1));
    this.camera.position.set(b.cx + d * 0.55, d * 0.75, b.cz + d * 0.85);
    this.controls.target.set(b.cx, 0.6, b.cz);
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

  /* ───────────── yüksek çözünürlüklü render ───────────── */
  async renderImage({ w = 1920, h = 1080, quality = 'fast', samples = 300, onProgress, signal } = {}) {
    const cam = this.camera.clone(); cam.aspect = w / h; cam.updateProjectionMatrix();
    const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
    const r = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    r.setPixelRatio(1); r.setSize(w, h, false);
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = this.opt.exposure;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    const prevMap = this.sun.shadow.mapSize.x;
    try {
      if (quality === 'pt') return await this.pathTrace(r, cam, canvas, samples, onProgress, signal);
      this.sun.shadow.mapSize.set(4096, 4096); this.sun.shadow.map?.dispose(); this.sun.shadow.map = null;
      const [{ EffectComposer }, { RenderPass }, { GTAOPass }, { OutputPass }] = await Promise.all([
        import('three/addons/postprocessing/EffectComposer.js'), import('three/addons/postprocessing/RenderPass.js'),
        import('three/addons/postprocessing/GTAOPass.js'), import('three/addons/postprocessing/OutputPass.js')]);
      const comp = new EffectComposer(r);
      comp.setSize(w, h);
      comp.addPass(new RenderPass(this.scene, cam));
      const ao = new GTAOPass(this.scene, cam, w, h);
      ao.updateGtaoMaterial({ radius: 0.35, distanceExponent: 1.5, thickness: 1, scale: 1.2 });
      ao.blendIntensity = 0.9;
      comp.addPass(ao);
      comp.addPass(new OutputPass());
      onProgress?.(0.3);
      for (let i = 0; i < 3; i++) { comp.render(); await new Promise(requestAnimationFrame); }
      onProgress?.(1);
      return await new Promise(res => canvas.toBlob(res, 'image/png'));
    } finally {
      this.sun.shadow.mapSize.set(prevMap, prevMap); this.sun.shadow.map?.dispose(); this.sun.shadow.map = null;
      r.dispose(); this.dirty = true;
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
      return await new Promise(res => canvas.toBlob(res, 'image/png'));
    } finally {
      pt.dispose?.();
      sc.environment = prevEnv; sc.background = prevBg; sc.environmentIntensity = prevEI;
    }
  }
}
