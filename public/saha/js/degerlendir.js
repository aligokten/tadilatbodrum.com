/* ═══ Müşteri değerlendirme sayfası (/d/KİMLİK) ═══
 * Kayıt Firestore REST ile okunur ve bir kez güncellenir (SDK yüklenmez). Kural: yalnızca 'pending' durumundaki
 * kayıt, yalnızca status / answers / doneAt alanları değişecek şekilde 'done' yapılabilir.
 */
import { FEEDBACK_Q } from './feedbackq.js';

const app = document.getElementById('app');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const LOGO = '<img class="logo" src="assets/logo.png" alt="TadilatBodrum.com">';
const STAR = '<svg viewBox="0 0 24 24"><path d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z"/></svg>';
const CHECK = '<svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>';
const msg = (t, d) => { app.innerHTML = `${LOGO}<div class="done"><h1>${t}</h1><p>${d}</p></div>`; };

const id = (location.pathname.match(/\/d\/([A-Za-z0-9]{6,20})\/?$/) || [])[1] || new URLSearchParams(location.search).get('k');
const { firebaseConfig: C, SITE_ID } = await import('/js/firebase-config.js');
const URL0 = `https://firestore.googleapis.com/v1/projects/${C.projectId}/databases/(default)/documents/sites/${SITE_ID}/feedback/${encodeURIComponent(id || '')}`;

// Firestore REST değerleri ↔ JS
const fromV = v => v == null ? null : 'stringValue' in v ? v.stringValue : 'integerValue' in v ? +v.integerValue : 'doubleValue' in v ? v.doubleValue : 'booleanValue' in v ? v.booleanValue
  : 'mapValue' in v ? Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, fromV(x)])) : null;
const toV = x => typeof x === 'boolean' ? { booleanValue: x } : Number.isInteger(x) ? { integerValue: String(x) } : typeof x === 'number' ? { doubleValue: x }
  : x && typeof x === 'object' ? { mapValue: { fields: Object.fromEntries(Object.entries(x).map(([k, y]) => [k, toV(y)])) } } : { stringValue: String(x ?? '') };

let rec;
try {
  if (!id) throw Object.assign(new Error(), { gone: true });
  const r = await fetch(`${URL0}?key=${C.apiKey}`);
  if (r.status === 404 || r.status === 403) throw Object.assign(new Error(), { gone: true });
  if (!r.ok) throw new Error('http ' + r.status);
  const j = await r.json(); rec = Object.fromEntries(Object.entries(j.fields || {}).map(([k, v]) => [k, fromV(v)]));
} catch (e) {
  if (e.gone) msg('Bağlantı geçersiz', 'Bu değerlendirme bağlantısı bulunamadı. Size gönderilen bağlantıyı tam olarak açtığınızdan emin olun.');
  else msg('Bağlantı kurulamadı', 'İnternet bağlantınızı kontrol edip sayfayı yenileyin.');
  throw e;
}

const thanks = score => {
  const g = rec.reviewUrl && score >= 4 ? `<a class="gbtn" href="${esc(rec.reviewUrl)}" target="_blank" rel="noopener">${STAR.replace('<svg', '<svg width="20" height="20" fill="#F7A21B"')}Google'da da değerlendirin</a>` : '';
  app.innerHTML = `${LOGO}<div class="done"><div class="ok">${CHECK}</div><h1>Teşekkür ederiz${rec.name ? ', ' + esc(rec.name) : ''}!</h1>
    <p>Değerlendirmeniz bize ulaştı. Görüşleriniz hizmetimizi geliştirmemize yardımcı oluyor.</p>${g}</div>`;
};
if (rec.status === 'done') thanks(0);
else {
  const A = {};
  app.innerHTML = `${LOGO}
    <h1>${rec.name ? esc(rec.name) + ', ' : ''}tadilatınızı <em>değerlendirin</em></h1>
    <p class="lead">${rec.title ? esc(rec.title) + ' · ' : ''}Bir dakikanızı ayırıp deneyiminizi puanlar mısınız? Yanıtlarınız yalnızca TadilatBodrum.com ekibiyle paylaşılır.</p>
    ${FEEDBACK_Q.map(q => `<div class="q ${q.main ? 'main' : ''}" data-q="${q.id}">
      ${q.type === 'check' ? '' : `<b>${esc(q.t)}</b>`}
      ${q.type === 'stars' ? `<div class="stars">${[1, 2, 3, 4, 5].map(n => `<button type="button" data-v="${n}" aria-label="${n} yıldız">${STAR}</button>`).join('')}</div>` : ''}
      ${q.type === 'nps' ? `<div class="nps">${Array.from({ length: 11 }, (_, n) => `<button type="button" data-v="${n}">${n}</button>`).join('')}</div><div class="nps-l"><span>Hiç olası değil</span><span>Kesinlikle</span></div>` : ''}
      ${q.type === 'text' ? `<textarea maxlength="2000" placeholder="Beğendikleriniz, geliştirebileceğimiz noktalar…"></textarea>` : ''}
      ${q.type === 'check' ? `<label class="chk"><input type="checkbox"> ${esc(q.t)}</label>` : ''}
    </div>`).join('')}
    <button class="send" id="send" disabled>Değerlendirmeyi gönder</button><p class="err" id="err"></p>`;
  const send = document.getElementById('send'), err = document.getElementById('err');
  const ready = () => { send.disabled = !(A.genel >= 1); };
  app.addEventListener('click', e => {
    const b = e.target.closest('[data-v]'); if (!b) return;
    const q = b.closest('[data-q]'), k = q.dataset.q, v = +b.dataset.v; A[k] = v;
    q.querySelectorAll('[data-v]').forEach(x => x.classList.toggle('on', q.querySelector('.stars') ? +x.dataset.v <= v : +x.dataset.v === v));
    ready();
  });
  send.onclick = async () => {
    send.disabled = true; err.textContent = '';
    const answers = { ...A, yorum: (app.querySelector('[data-q="yorum"] textarea')?.value || '').trim().slice(0, 2000), izin: !!app.querySelector('[data-q="izin"] input')?.checked };
    const qs = ['status', 'answers', 'doneAt'].map(f => `updateMask.fieldPaths=${f}`).join('&');
    try {
      const r = await fetch(`${URL0}?key=${C.apiKey}&${qs}&currentDocument.exists=true`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: { status: toV('done'), answers: toV(answers), doneAt: toV(Date.now()) } }),
      });
      if (!r.ok) throw new Error(r.status === 403 ? 'Bu değerlendirme daha önce gönderilmiş olabilir.' : 'Gönderilemedi, lütfen tekrar deneyin.');
      thanks(A.genel);
    } catch (e) { err.textContent = e instanceof TypeError ? 'İnternet bağlantınızı kontrol edip tekrar deneyin.' : e.message; send.disabled = false; }
  };
}
