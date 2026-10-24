/* TadilatBodrum Saha — çevrimdışı kabuk önbelleği (stale-while-revalidate) */
const CACHE = 'tb-saha-v45';
const CORE = ['./', 'index.html', 'css/app.css', 'manifest.webmanifest', 'assets/logo.png', 'assets/icon-192.png',
  'js/app.js', 'js/store.js', 'js/ui.js', 'js/catalog.js', 'js/survey.js', 'js/quote.js', 'js/plan2d.js', 'js/plan-geom.js', 'js/plan3d.js', 'js/textures.js', 'js/docview.js', 'js/merge.js', 'js/importer.js', 'js/importui.js', 'js/cabinet.js', 'js/cabdesign.js', 'js/exporters.js', 'js/fixtures.js', 'js/openings.js', 'js/video.js', 'js/brand.js', 'js/share.js', 'js/mappick.js', 'js/feedbackq.js', 'js/exec.js', 'js/joinery.js', 'js/cnc.js', 'js/demo.js', 'js/labels.js', 'js/assembly.js', 'vendor/mp4-muxer.mjs',
  'vendor/three/three.module.js', 'vendor/three/three.core.js', 'vendor/three/addons/controls/OrbitControls.js', 'vendor/three/addons/environments/RoomEnvironment.js'];

self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  // yalnızca kendi dosyalarımız + Google Fonts + Firebase SDK
  const ok = u.origin === location.origin || /fonts\.(googleapis|gstatic)\.com$/.test(u.hostname) || (u.hostname === 'www.gstatic.com' && u.pathname.startsWith('/firebasejs/'));
  if (!ok) return;
  // Kendi dosyalarımız: önce ağ (yeni sürüm hemen gelsin), çevrimdışıysa önbellek.
  // Harici kütüphaneler (font, Firebase SDK): önce önbellek.
  const networkFirst = u.origin === location.origin;
  e.respondWith(caches.open(CACHE).then(async c => {
    if (networkFirst) {
      try { const r = await fetch(e.request, { cache: 'no-cache' }); if (r.ok) c.put(e.request, r.clone()); return r; }
      catch { return (await c.match(e.request)) || Response.error(); }
    }
    const hit = await c.match(e.request);
    const net = fetch(e.request).then(r => { if (r.ok || r.type === 'opaque') c.put(e.request, r.clone()); return r; }).catch(() => hit);
    return hit || net;
  }));
});
