/* ═══ Haritadan konum işaretleme (Leaflet + OpenStreetMap / uydu) ═══
 * Kullanıcı adresi arar ya da haritaya dokunur / işaretçiyi sürükler; seçilen nokta işe kaydedilir:
 *   customer.geo = { lat, lng, t }  ve yol tarifi için customer.mapsUrl
 * Adres arama ve ters arama: Nominatim (OpenStreetMap) — az sayıda istek, kullanım koşullarına uygun.
 */
import { $, esc, icon, modal, toast } from './ui.js';

const BODRUM = [37.0378, 27.4241];
let leafletP = null;
function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  return leafletP ||= new Promise((res, rej) => {
    const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = 'vendor/leaflet/leaflet.css'; document.head.append(css);
    const s = document.createElement('script'); s.src = 'vendor/leaflet/leaflet.js';
    s.onload = () => res(window.L); s.onerror = () => { leafletP = null; rej(new Error('Harita kütüphanesi yüklenemedi')); };
    document.head.append(s);
  });
}

export const mapsLink = g => `https://www.google.com/maps/search/?api=1&query=${g.lat.toFixed(6)},${g.lng.toFixed(6)}`;
export const dirLink = g => `https://www.google.com/maps/dir/?api=1&destination=${g.lat.toFixed(6)},${g.lng.toFixed(6)}`;

async function nominatim(path) {
  const r = await fetch(`https://nominatim.openstreetmap.org/${path}${path.includes('?') ? '&' : '?'}format=json&accept-language=tr&countrycodes=tr`, { headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error('Adres servisi yanıt vermedi');
  return r.json();
}

/* modal: { lat, lng, address? } döner ya da null */
export async function pickLocation({ geo, query = '' } = {}) {
  let L;
  try { L = await loadLeaflet(); } catch (e) { toast(e.message, 'err'); return null; }
  let pos = geo?.lat ? [geo.lat, geo.lng] : null, map, marker, addr = null;
  const r = await modal({ title: 'Haritadan konum işaretle', wide: true, body: `
    <div class="mp-bar"><div class="search">${icon('search')}<input class="inp" id="mpQ" placeholder="Adres, site, mahalle ara…" value="${esc(query)}"></div>
      <button class="btn btn-ghost btn-sm" id="mpGo">Ara</button><button class="btn btn-ghost btn-sm" id="mpMe" title="Şu anki konumum">${icon('map')}Konumum</button></div>
    <div class="mp-res" id="mpRes" hidden></div>
    <div class="mp-map" id="mpMap"></div>
    <div class="mp-foot"><span class="muted small" id="mpInfo">${pos ? 'İşaretçiyi sürükleyerek konumu düzeltebilirsiniz.' : 'Haritada evin / binanın üzerine dokunun.'}</span>
      <div class="seg" id="mpLay"><button data-l="map" class="on">Harita</button><button data-l="sat">Uydu</button></div></div>`,
    actions: [{ k: 'no', t: 'Vazgeç' }, { k: 'ok', t: 'Bu konumu kaydet', cls: 'btn-primary', icon: 'check', validate: () => { if (!pos) { toast('Önce haritada bir nokta seçin', 'err'); return false; } return true; } }],
    onOpen: el => {
      const street = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' });
      const sat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Esri, Maxar, Earthstar Geographics' });
      map = L.map($('#mpMap', el), { zoomControl: true }).setView(pos || BODRUM, pos ? 18 : 11);
      street.addTo(map);
      const icon0 = L.icon({ iconUrl: 'vendor/leaflet/images/marker-icon.png', iconRetinaUrl: 'vendor/leaflet/images/marker-icon-2x.png', shadowUrl: 'vendor/leaflet/images/marker-shadow.png', iconSize: [25, 41], iconAnchor: [12, 41], shadowSize: [41, 41] });
      const info = $('#mpInfo', el);
      const place = (ll, zoom) => {
        pos = [ll.lat ?? ll[0], ll.lng ?? ll[1]]; addr = null;
        if (!marker) { marker = L.marker(pos, { draggable: true, icon: icon0 }).addTo(map); marker.on('dragend', () => place(marker.getLatLng())); }
        else marker.setLatLng(pos);
        if (zoom) map.setView(pos, zoom);
        info.textContent = `${pos[0].toFixed(6)}, ${pos[1].toFixed(6)} — işaretçiyi sürükleyerek düzeltebilirsiniz.`;
      };
      if (pos) place(pos);
      map.on('click', e => place(e.latlng));
      setTimeout(() => map.invalidateSize(), 250);
      $('#mpLay', el).onclick = e => {
        const b = e.target.closest('[data-l]'); if (!b) return;
        $$l(el).forEach(x => x.classList.toggle('on', x === b));
        if (b.dataset.l === 'sat') { map.removeLayer(street); sat.addTo(map); } else { map.removeLayer(sat); street.addTo(map); }
      };
      const res = $('#mpRes', el);
      const search = async () => {
        const q = $('#mpQ', el).value.trim(); if (!q) return;
        res.hidden = false; res.innerHTML = '<p class="muted small">Aranıyor…</p>';
        try {
          const list = await nominatim(`search?q=${encodeURIComponent(q)}&limit=5&viewbox=26.9,37.4,28.2,36.7`);
          res.innerHTML = list.length ? list.map((x, i) => `<button data-i="${i}">${esc(x.display_name)}</button>`).join('') : '<p class="muted small">Sonuç bulunamadı — haritada elle işaretleyin.</p>';
          res.onclick = e => { const b = e.target.closest('[data-i]'); if (!b) return; const x = list[+b.dataset.i]; place({ lat: +x.lat, lng: +x.lon }, 18); res.hidden = true; };
        } catch (e) { res.innerHTML = `<p class="muted small">${esc(e.message)} — haritada elle işaretleyin.</p>`; }
      };
      $('#mpGo', el).onclick = search;
      $('#mpQ', el).onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); search(); } };
      $('#mpMe', el).onclick = () => {
        if (!navigator.geolocation) return toast('Bu cihaz konum vermiyor', 'err');
        info.textContent = 'Konum alınıyor…';
        navigator.geolocation.getCurrentPosition(p => place({ lat: p.coords.latitude, lng: p.coords.longitude }, 18), () => { info.textContent = 'Konum alınamadı — haritada elle işaretleyin.'; }, { enableHighAccuracy: true, timeout: 10000 });
      };
    } });
  map?.remove();
  if (r?.k !== 'ok' || !pos) return null;
  // ters arama: adres önerisi (başarısız olursa yalnızca koordinat kaydedilir)
  try {
    const x = await nominatim(`reverse?lat=${pos[0]}&lon=${pos[1]}&zoom=18&addressdetails=1`);
    const a = x.address || {};
    addr = { text: x.display_name || '', district: a.town || a.city_district || a.suburb || a.village || a.city || '', street: [a.road, a.house_number].filter(Boolean).join(' No: '), neighbourhood: a.neighbourhood || a.quarter || '' };
  } catch { /* çevrimdışı vb. */ }
  return { lat: +pos[0].toFixed(7), lng: +pos[1].toFixed(7), address: addr };
}
const $$l = el => [...el.querySelectorAll('#mpLay [data-l]')];
