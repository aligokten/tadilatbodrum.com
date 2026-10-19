/* ═══ Müşteriyle paylaşım bağlantısı ═══
 * Çizim (yalnızca geometri) sıkıştırılıp bağlantının # kısmına gömülür: sunucuya hiçbir şey yüklenmez,
 * # kısmı sunucuya gönderilmediği için veri yalnızca bağlantıya sahip kişide kalır.
 * Görüntüleyici: goster.html (3D kuşbakışı + 2D plan, yalnızca okuma).
 */
const b64u = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const unb64u = s => { const b = atob(s.replace(/-/g, '+').replace(/_/g, '/')); const u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; };
const pipe = async (u8, stream) => new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(stream)).arrayBuffer());

/* paylaşılacak plan: altlık görseli ve iç kullanım alanları çıkarılır, koordinatlar 0,1 cm'e yuvarlanır */
export function slimPlan(plan) {
  const p = JSON.parse(JSON.stringify(plan || {}));
  if (p.meta) { delete p.meta.bg; delete p.meta.bgUrl; delete p.meta.bgPhoto; delete p.meta.calib; }
  delete p.bg;
  const r = v => typeof v === 'number' ? Math.round(v * 10) / 10 : v;
  const walk = o => { if (Array.isArray(o)) return o.map(walk); if (o && typeof o === 'object') { for (const k of Object.keys(o)) o[k] = walk(o[k]); return o; } return r(o); };
  return walk(p);
}

export async function encodeShare(payload) {
  const raw = new TextEncoder().encode(JSON.stringify(payload));
  if (typeof CompressionStream === 'undefined') return 'j' + b64u(raw);
  return 'z' + b64u(await pipe(raw, new CompressionStream('deflate-raw')));
}
export async function decodeShare(s) {
  const kind = s[0], u8 = unb64u(s.slice(1));
  const raw = kind === 'z' ? await pipe(u8, new DecompressionStream('deflate-raw')) : u8;
  return JSON.parse(new TextDecoder().decode(raw));
}
/* kısa bağlantı kimliği: 9 karakter, karışabilen harfler (0/O, 1/l/I) yok — 57^9 ≈ 6·10^15 olasılık; belgeler listelenemediği için tahmin edilemez */
export function newShareId(n = 9) {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789', r = crypto.getRandomValues(new Uint8Array(n));
  return [...r].map(x => A[x % A.length]).join('');
}
export const shortUrl = id => `${location.origin}/p/${id}`;

/* görüntüleyici adresi: uygulamanın çalıştığı yerdeki goster.html (uzun bağlantı: veri # içinde) */
export const viewerBase = () => location.origin + '/saha/goster.html';
