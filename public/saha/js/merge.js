/* ═══ İş kaydı için 3 yönlü birleştirme (cihazlar arası eşitleme) ═══
 * base   : bu cihazın en son buluttan aldığı / buluta yazdığı sürüm
 * local  : bu cihazdaki güncel sürüm (kaydedilmemiş değişiklikler dahil)
 * remote : buluttaki güncel sürüm (başka cihazların değişiklikleri dahil)
 * Kural: bu cihazda değişen alan bu cihazdan, değişmeyen alan buluttan gelir.
 * Kimlikli diziler (fotoğraf, talep, tespit, mahal) öğe öğe birleştirilir:
 * iki tarafın eklemeleri korunur, bir tarafta silinen öğe silinir.
 */
const J = v => JSON.stringify(v ?? null);
const clone = v => v === undefined ? undefined : JSON.parse(JSON.stringify(v));
const isObj = v => v && typeof v === 'object' && !Array.isArray(v);

/* kimlikli diziler; log kimliksiz olduğundan t+metin anahtar olarak kullanılır */
const KEYED = { photos: 'id', requests: 'id', findings: 'id', log: x => `${x.t}|${x.text}`, rooms: 'id' };
const keyFn = k => typeof KEYED[k] === 'function' ? KEYED[k] : x => x?.[KEYED[k]];

function mergeKeyed(base = [], local = [], remote = [], key) {
  const B = new Map(base.map(x => [key(x), x])), L = new Map(local.map(x => [key(x), x])), R = new Map(remote.map(x => [key(x), x]));
  const out = [];
  // yerel sıra korunur; öğe başka cihazda silindiyse ve burada değişmediyse düşer
  for (const [k, l] of L) {
    const b = B.get(k), r = R.get(k);
    if (!r && b) { if (J(l) !== J(b)) out.push(l); continue; }        // uzakta silinmiş (yerelde değiştiyse tut)
    if (!r) { out.push(l); continue; }                                  // yerelde yeni
    out.push(b && J(l) === J(b) ? r : l);                               // yerelde değişmediyse uzaktaki sürüm
  }
  // uzakta eklenenler (base'de yoktu, yerelde yok)
  for (const [k, r] of R) if (!L.has(k) && !B.has(k)) out.push(r);
  return out;
}

export function mergeJob(base, local, remote, path = '') {
  if (!base) base = {};
  const out = {};
  for (const k of new Set([...Object.keys(local || {}), ...Object.keys(remote || {})])) {
    const b = base[k], l = local?.[k], r = remote?.[k];
    if (Array.isArray(l) && Array.isArray(r) && KEYED[k]) out[k] = mergeKeyed(Array.isArray(b) ? b : [], l, r, keyFn(k));
    else if (isObj(l) && isObj(r) && (k === 'customer' || k === 'property' || k === 'survey' || k === 'answers' || k === 'inspection'))
      out[k] = mergeJob(isObj(b) ? b : {}, l, r, path + k + '.');       // alan alan birleştir
    else if (J(l) !== J(b)) out[k] = clone(l);                          // bu cihazda değişti → yerel
    else out[k] = clone(r);                                             // değişmedi → bulut
    if (out[k] === undefined) delete out[k];
  }
  return out;
}

/* nesneyi yerinde güncelle (ekranda tutulan referanslar geçerli kalsın) */
export function assignInPlace(target, src) {
  for (const k of Object.keys(target)) if (!(k in src)) delete target[k];
  for (const [k, v] of Object.entries(src)) {
    const t = target[k];
    if (isObj(t) && isObj(v)) assignInPlace(t, v);
    else if (Array.isArray(t) && Array.isArray(v)) { t.length = 0; t.push(...v); }
    else target[k] = v;
  }
  return target;
}
