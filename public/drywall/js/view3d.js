/* SAGG Drywall+ — 3B önizleme (three.js, z yukarı). */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { BOARDS, ROLE_COLORS } from './catalog.js';

export class View3D {
  constructor(host) {
    this.host = host;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.setClearColor(0xf3f5f7);
    host.appendChild(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, 1, 10, 100000);
    this.camera.up.set(0, 0, 1);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f96, 2.2));
    const dl = new THREE.DirectionalLight(0xffffff, 1.6); dl.position.set(-3000, -5000, 8000); this.scene.add(dl);
    this.group = new THREE.Group(); this.scene.add(this.group);
    this.grid = new THREE.GridHelper(20000, 40, 0xc5ccd4, 0xdde2e7); this.grid.rotation.x = Math.PI / 2; this.scene.add(this.grid);
    this.opts = { boards: 0.55, frame: true };
    this.mats = {};
    new ResizeObserver(() => this.resize()).observe(host);
    const loop = () => { this.raf = requestAnimationFrame(loop); this.controls.update(); this.renderer.render(this.scene, this.camera); };
    loop();
  }
  mat(key, color, opacity = 1) {
    const k = key + opacity;
    if (!this.mats[k]) this.mats[k] = new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: key.startsWith('m') ? 0.55 : 0, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 });
    return this.mats[k];
  }
  resize() {
    const w = this.host.clientWidth, h = this.host.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }
  addBox(b, mat, edges) {
    const g = new THREE.BoxGeometry(Math.max(0.5, b[3] - b[0]), Math.max(0.5, b[4] - b[1]), Math.max(0.5, b[5] - b[2]));
    const m = new THREE.Mesh(g, mat);
    m.position.set((b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2);
    this.group.add(m);
    if (edges) { const e = new THREE.LineSegments(new THREE.EdgesGeometry(g), edges); e.position.copy(m.position); this.group.add(e); }
  }
  show(md, fit = false) {
    this.md = md;
    for (const c of [...this.group.children]) { this.group.remove(c); c.geometry?.dispose(); }
    if (!md) return;
    const edge = new THREE.LineBasicMaterial({ color: 0x1b2a33, transparent: true, opacity: 0.35 });
    if (this.opts.frame) {
      for (const m of md.members) this.addBox(m.box, this.mat('m' + m.kind + m.strong, m.strong ? ROLE_COLORS.K : m.kind === 'U' || m.kind === 'UD' ? 0xa7b4bf : m.kind === 'CD' ? 0xb9d9c6 : 0xc8d3dc), edge);
      for (const a of md.aux || []) if (!a.slab) this.addBox(a.box, this.mat('maux', 0x475569));
    }
    for (const a of md.aux || []) if (a.slab) this.addBox(a.box, this.mat('slab', 0xd6d3d1, 0.25));
    for (const k of md.marks || []) {
      const g = new THREE.CylinderGeometry(k.r, k.r, 8, 24); g.rotateX(Math.PI / 2);
      const m = new THREE.Mesh(g, this.mat('spot', 0xfacc15)); m.position.set(k.x, k.y, k.z - 16); this.group.add(m);
    }
    if (this.opts.boards > 0) for (const b of md.boards) for (const bx of b.boxes) this.addBox(bx, this.mat('b' + b.type, BOARDS[b.type].color, this.opts.boards), this.opts.boards >= 1 ? edge : null);
    if (md.countertop && this.opts.boards > 0) {
      const c = md.countertop;
      this.addBox([c.x, c.y, c.z, c.x + c.w, c.y + c.d, c.z + c.t], this.mat('ct', 0x4b5563, Math.min(1, this.opts.boards + 0.2)), edge);
    }
    const b = md.bounds;
    this.grid.position.set((b[0] + b[3]) / 2, (b[1] + b[4]) / 2, 0);
    if (fit || !this.fitted) this.fit();
  }
  fit() {
    const b = this.md?.bounds; if (!b) return;
    const c = new THREE.Vector3((b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2);
    const r = Math.hypot(b[3] - b[0], b[4] - b[1], b[5] - b[2]) / 2;
    const d = r / Math.sin(THREE.MathUtils.degToRad(this.camera.fov / 2)) * 1.05;
    this.camera.position.set(c.x - d * 0.55, c.y - d * 0.75, c.z + d * 0.38);
    this.controls.target.copy(c); this.controls.update();
    this.fitted = true;
  }
  png() { this.renderer.render(this.scene, this.camera); return this.renderer.domElement.toDataURL('image/png'); }
}
