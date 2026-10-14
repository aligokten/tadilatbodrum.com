/* ═══ Veri katmanı — iki arka uç, aynı arayüz ═══
 *  • cloud : Firebase (Firestore + Storage + Auth) — ekip ortak çalışır, çevrimdışı önbellekli
 *  • local : Bu cihazın IndexedDB'si — giriş gerektirmez, internet olmadan çalışır
 * İş kaydı tek bir JSON belgedir (bkz. newJob). Fotoğraflar ayrı saklanır.
 */
import { DEFAULT_SETTINGS } from './catalog.js';
import { mergeJob } from './merge.js';

const FB_VER = '10.12.2';
const FB = n => `https://www.gstatic.com/firebasejs/${FB_VER}/firebase-${n}.js`;

export const uid = (p = '') => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const clone = o => JSON.parse(JSON.stringify(o));

export function newJob(code) {
  const now = Date.now();
  return {
    id: uid('j'), code, createdAt: now, updatedAt: now,
    status: 'talep',
    customer: { name: '', phone: '', email: '', address: '', district: '', mapsUrl: '', source: '' },
    property: { type: '', area: '', floor: '', age: '', occupied: '', notes: '' },
    kesifDate: '', assigned: '', summary: '',
    requests: [], findings: [], photos: [],
    survey: { answers: {}, updatedAt: 0 },
    inspection: { rooms: [] },
    plan: null,
    quote: null,
    log: [{ t: now, text: 'İş kaydı oluşturuldu' }],
  };
}

/* ── görsel sıkıştırma: en uzun kenar 2048px, JPEG ── */
export async function compressImage(file, max = 2048, q = 0.85) {
  if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') return { blob: file, w: 0, h: 0 };
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * s), h = Math.round(bmp.height * s);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    c.getContext('2d').drawImage(bmp, 0, 0, w, h);
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', q));
    return { blob: blob || file, w, h };
  } catch { return { blob: file, w: 0, h: 0 }; }
}

/* ════════ Yerel (IndexedDB) ════════ */
class LocalBackend {
  kind = 'local';
  label = 'Bu cihaz (yerel)';
  #db; #urls = new Map();
  async init() {
    this.#db = await new Promise((res, rej) => {
      const r = indexedDB.open('tb-saha', 1);
      r.onupgradeneeded = () => {
        const d = r.result;
        d.createObjectStore('jobs', { keyPath: 'id' });
        d.createObjectStore('blobs');
        d.createObjectStore('meta');
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return this;
  }
  #tx(store, mode, fn) {
    return new Promise((res, rej) => {
      const t = this.#db.transaction(store, mode);
      const r = fn(t.objectStore(store));
      t.oncomplete = () => res(r && 'result' in r ? r.result : undefined);
      t.onerror = () => rej(t.error);
    });
  }
  async listJobs() {
    const all = await this.#tx('jobs', 'readonly', s => s.getAll());
    return all.sort((a, b) => b.updatedAt - a.updatedAt);
  }
  getJob(id) { return this.#tx('jobs', 'readonly', s => s.get(id)); }
  async saveJob(job) { await this.#tx('jobs', 'readwrite', s => s.put(clone(job))); return clone(job); }
  watchJob() { return () => {}; }
  async listPhotoFiles() { return []; }
  async deleteJob(job) {
    for (const p of job.photos || []) await this.deletePhoto(job, p).catch(() => {});
    return this.#tx('jobs', 'readwrite', s => s.delete(job.id));
  }
  async uploadPhoto(jobId, blob, id) {
    const key = `${jobId}/${id}`;
    await this.#tx('blobs', 'readwrite', s => s.put(blob, key));
    return { localKey: key };
  }
  async photoUrl(p) {
    if (p.url) return p.url;
    if (this.#urls.has(p.localKey)) return this.#urls.get(p.localKey);
    const b = await this.#tx('blobs', 'readonly', s => s.get(p.localKey));
    if (!b) return '';
    const u = URL.createObjectURL(b);
    this.#urls.set(p.localKey, u);
    return u;
  }
  async photoBlob(p) {
    if (p.localKey) return this.#tx('blobs', 'readonly', s => s.get(p.localKey));
    return (await fetch(p.url)).blob();
  }
  deletePhoto(job, p) {
    if (!p.localKey) return Promise.resolve();
    return this.#tx('blobs', 'readwrite', s => s.delete(p.localKey));
  }
  async getSettings() {
    const s = await this.#tx('meta', 'readonly', s => s.get('settings'));
    return { ...clone(DEFAULT_SETTINGS), ...(s || {}) };
  }
  saveSettings(v) { return this.#tx('meta', 'readwrite', s => s.put(clone(v), 'settings')); }
  async signOut() {}
}

/* ════════ Bulut (Firebase) ════════ */
class CloudBackend {
  kind = 'cloud';
  label = 'Bulut (Firebase)';
  user = null;
  async load() {
    const [cfg, app, fs, au, st] = await Promise.all([
      import('/js/firebase-config.js'), import(FB('app')), import(FB('firestore')), import(FB('auth')), import(FB('storage')),
    ]);
    this.cfg = cfg; this.fs = fs; this.au = au; this.st = st;
    const fapp = app.getApps().find(a => a.name === 'saha') || app.initializeApp(cfg.firebaseConfig, 'saha');
    try {
      this.db = fs.initializeFirestore(fapp, {
        ignoreUndefinedProperties: true,
        localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }),
      });
    } catch { this.db = fs.getFirestore(fapp); }
    this.auth = au.getAuth(fapp);
    this.storage = st.getStorage(fapp);
    // yalnızca geliştirme/test: localStorage 'tb-emu' açıksa yerel Firebase emülatörlerine bağlan
    if (localStorage.getItem('tb-emu')) {
      fs.connectFirestoreEmulator(this.db, 'localhost', 8080);
      au.connectAuthEmulator(this.auth, 'http://localhost:9099', { disableWarnings: true });
      st.connectStorageEmulator(this.storage, 'localhost', 9199);
    }
    this.user = await new Promise(res => { const u = au.onAuthStateChanged(this.auth, x => { u(); res(x); }); });
    return this;
  }
  async signIn(user, pass) {
    const email = user.includes('@') ? user : `${user}@${this.cfg.ADMIN_EMAIL_DOMAIN}`;
    const r = await this.au.signInWithEmailAndPassword(this.auth, email, pass);
    this.user = r.user;
  }
  signOut() { return this.au.signOut(this.auth); }
  #col(n) { return this.fs.collection(this.db, 'sites', this.cfg.SITE_ID, n); }
  #doc(n, id) { return this.fs.doc(this.db, 'sites', this.cfg.SITE_ID, n, id); }
  async listJobs() {
    const snap = await this.fs.getDocs(this.#col('jobs'));
    return snap.docs.map(d => d.data()).sort((a, b) => b.updatedAt - a.updatedAt);
  }
  async getJob(id) { const d = await this.fs.getDoc(this.#doc('jobs', id)); return d.exists() ? d.data() : null; }
  /* Buluttaki güncel sürümle birleştirerek yazar (başka cihazın eklemeleri korunur).
   * ASLA körlemesine üzerine yazmaz: birleştirme yapılamazsa hata fırlatır, uygulama tekrar dener.
   * Tek istisna: cihaz çevrimdışıysa (işlem yapılamaz) Firestore yazmayı kuyruğa alır. */
  async saveJob(job, base) {
    const ref = this.#doc('jobs', job.id);
    if (!base) {                                   // yeni iş: yalnızca henüz yoksa oluştur
      if (navigator.onLine === false) { await this.fs.setDoc(ref, clone(job), { merge: true }); return clone(job); }
      await this.fs.runTransaction(this.db, async tx => {
        const snap = await tx.get(ref);
        tx.set(ref, snap.exists() ? mergeJob({}, job, snap.data()) : clone(job));
      });
      return clone(job);
    }
    if (navigator.onLine === false) { await this.fs.setDoc(ref, mergeJob(base, job, base)); return clone(job); }
    return await Promise.race([
      this.fs.runTransaction(this.db, async tx => {
        const snap = await tx.get(ref);
        const merged = snap.exists() ? mergeJob(base, job, snap.data()) : clone(job);
        tx.set(ref, merged);
        return merged;
      }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('Bağlantı yavaş — kayıt tekrar denenecek')), 25000)),
    ]);
  }
  /* açık işi canlı dinle — yalnızca sunucudan gelen kesin veriler (önbellek ve kendi bekleyen yazmalarımız hariç) */
  watchJob(id, cb) {
    return this.fs.onSnapshot(this.#doc('jobs', id), s => {
      if (s.exists() && !s.metadata.hasPendingWrites && !s.metadata.fromCache) cb(s.data());
    }, e => console.warn('İş dinlenemiyor', e));
  }
  /* Storage'daki iş fotoğrafları (kayıtta referansı kaybolmuş fotoğrafları kurtarmak için) */
  async listPhotoFiles(jobId) {
    const res = await this.st.listAll(this.st.ref(this.storage, `tadilatbodrum/saha/${jobId}`));
    return Promise.all(res.items.map(async it => {
      const [url, meta] = await Promise.all([this.st.getDownloadURL(it), this.st.getMetadata(it).catch(() => ({}))]);
      return { path: it.fullPath, name: it.name, url, t: meta.timeCreated ? Date.parse(meta.timeCreated) : Date.now() };
    }));
  }
  async deleteJob(job) {
    for (const p of job.photos || []) await this.deletePhoto(job, p).catch(() => {});
    return this.fs.deleteDoc(this.#doc('jobs', job.id));
  }
  async uploadPhoto(jobId, blob, id) {
    const path = `tadilatbodrum/saha/${jobId}/${id}.${blob.type === 'image/png' ? 'png' : 'jpg'}`;
    const r = this.st.ref(this.storage, path);
    await this.st.uploadBytes(r, blob, { contentType: blob.type || 'image/jpeg' });
    return { url: await this.st.getDownloadURL(r), path };
  }
  async photoUrl(p) { return p.url || ''; }
  async photoBlob(p) { return (await fetch(p.url)).blob(); }
  deletePhoto(job, p) { return p.path ? this.st.deleteObject(this.st.ref(this.storage, p.path)) : Promise.resolve(); }
  async getSettings() {
    const d = await this.fs.getDoc(this.#doc('saha', 'settings'));
    return { ...clone(DEFAULT_SETTINGS), ...(d.exists() ? d.data() : {}) };
  }
  saveSettings(v) { return this.fs.setDoc(this.#doc('saha', 'settings'), clone(v)); }
}

export const MODE_KEY = 'tb-saha-mode';
export async function openLocal() { return new LocalBackend().init(); }
export async function openCloud() {
  return Promise.race([
    new CloudBackend().load(),
    new Promise((_, rej) => setTimeout(() => rej(new Error('Firebase\'e ulaşılamadı')), 12000)),
  ]);
}
