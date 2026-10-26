/* ═══ Randevu hatırlatma: müşteriye keşif onayı / hatırlatma mesajları, keşfe gelecek kişinin bilgisiyle ═══
   Mesajlar şablondan doldurulur, WhatsApp / SMS ile tek dokunuşla gönderilir; hangi mesajın ne zaman
   gönderildiği iş kaydında tutulur (j.remind), sırası gelen hatırlatmalar panelde listelenir. */
import { icon, esc, $, $$, modal, toast, waLink } from './ui.js';
import { dirLink } from './mappick.js';

export const REMIND_KINDS = [
  { k: 'confirm', t: 'Randevu onayı', d: 'Randevu verildiğinde', to: 'customer' },
  { k: 'day',     t: '1 gün önce hatırlatma', d: 'Keşiften bir gün önce', to: 'customer' },
  { k: 'same',    t: 'Keşif günü', d: 'Yola çıkarken', to: 'customer' },
  { k: 'team',    t: 'Keşfe gidecek kişiye iş bilgisi', d: 'Müşteri, adres, konum', to: 'team' },
];
export const REMIND_DEFAULTS = {
  confirm: 'Merhaba {musteri},\n{firma} keşif randevunuz oluşturuldu.\n📅 {tarih}, saat {saat}\n📍 {adres}\nKeşfe gelecek: {personel} ({unvan}) · {personel_tel}\nRandevuyu değiştirmek isterseniz bu mesaja yanıt verebilirsiniz. Teşekkür ederiz.',
  day: 'Merhaba {musteri},\nYarın ({tarih}) saat {saat} keşif randevunuzu hatırlatmak isteriz.\n📍 {adres}\nSizi ziyaret edecek: {personel} ({unvan}) · {personel_tel}\nGörüşmek üzere — {firma}',
  same: 'Merhaba {musteri},\nBugün saat {saat} keşif randevunuz için ekibimiz yola çıkıyor.\nSizi ziyaret edecek: {personel} ({unvan})\nUlaşmak için: {personel_tel}\n{firma}',
  team: 'Keşif — {is_kodu}\n📅 {tarih}, saat {saat}\nMüşteri: {musteri} · {musteri_tel}\n📍 {adres}\nKonum: {konum}\nNot: {ozet}',
};
export const REMIND_VARS = [
  ['musteri', 'Müşteri adı'], ['tarih', 'Keşif tarihi'], ['saat', 'Saat'], ['adres', 'Adres'], ['konum', 'Konum linki'],
  ['personel', 'Keşfe gelecek kişi'], ['unvan', 'Unvanı'], ['personel_tel', 'Telefonu'],
  ['firma', 'Firma adı'], ['firma_tel', 'Firma telefonu'], ['is_kodu', 'İş kodu'], ['musteri_tel', 'Müşteri telefonu'], ['ozet', 'İş özeti'],
];

export const remindTpl = (st, k) => (st.remind?.[k] ?? '').trim() || REMIND_DEFAULTS[k];
export const team = st => (st.team || []).filter(m => m.name?.trim());
export const kesifPerson = (st, j) => team(st).find(m => m.id === j.kesifBy) || null;

/* "2026-10-28T14:30" ya da "2026-10-28" → yerel saatle Date; saat girilmemişse hasTime=false */
export function kesifAt(j) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(j.kesifDate || ''); if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0));
  return { d, hasTime: !!m[4], day: `${m[1]}-${m[2]}-${m[3]}` };
}
const dayKey = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export function dayWord(j, now = new Date()) {
  const a = kesifAt(j); if (!a) return '';
  if (a.day === dayKey(now)) return 'bugün';
  if (a.day === dayKey(addDays(now, 1))) return 'yarın';
  return a.d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' });
}

export function remindVars(j, st) {
  const a = kesifAt(j), p = kesifPerson(st, j), c = j.customer || {};
  return {
    musteri: (c.name || '').trim(), musteri_tel: c.phone || '',
    tarih: a ? a.d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' }) : '',
    saat: a?.hasTime ? a.d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : '',
    gun: dayWord(j),
    adres: [c.address, c.district].map(x => (x || '').trim()).filter(Boolean).join(', '),
    konum: c.geo?.lat ? dirLink(c.geo) : (c.mapsUrl || ''),
    personel: p?.name || '', unvan: p?.title || '', personel_tel: p?.phone || '',
    firma: st.company?.name || '', firma_tel: st.company?.phone || st.company?.whatsapp || '',
    is_kodu: j.code || '', ozet: (j.summary || '').trim(),
  };
}

/* şablonu doldurur; yer tutucularının hepsi boş kalan satır atılır, boş kalan parantez / ayraç temizlenir */
export function fillTpl(tpl, v) {
  if (!v.saat) tpl = tpl.replace(/,?[ \t]*saat[ \t]*\{saat\}/gi, '');
  return tpl.split('\n').map(line => {
    const keys = [...line.matchAll(/\{(\w+)\}/g)].map(m => m[1]);
    if (keys.length && keys.every(k => !v[k])) return null;
    let s = line.replace(/\{(\w+)\}/g, (m, k) => (k in v ? v[k] : m));
    s = s.replace(/\s*\(\s*\)/g, '').replace(/\s*·\s*(?=$|·)/g, '').trimEnd();
    return s;
  }).filter(x => x !== null).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
export const remindText = (j, st, k) => fillTpl(remindTpl(st, k), remindVars(j, st));

/* gönderim durumu: tarih değiştiyse eski gönderim sayılmaz */
export const sentOf = (j, k) => { const r = j.remind?.[k]; return r && r.for === j.kesifDate ? r : null; };
export function dueKinds(j, st, now = new Date()) {
  const a = kesifAt(j); if (!a || ['iptal', 'teslim'].includes(j.status)) return [];
  if (a.hasTime ? a.d < now : a.day < dayKey(now)) return [];
  const today = a.day === dayKey(now), tomorrow = a.day === dayKey(addDays(now, 1));
  const out = [];
  if (!sentOf(j, 'confirm') && !today) out.push('confirm');
  if (tomorrow && !sentOf(j, 'day')) out.push('day');
  if (today && !sentOf(j, 'same')) out.push('same');
  if ((today || tomorrow) && kesifPerson(st, j)?.phone && !sentOf(j, 'team')) out.push('team');
  return j.customer?.phone ? out : out.filter(k => k === 'team');
}
export const dueAll = (jobs, st) => jobs.map(j => ({ j, ks: dueKinds(j, st) })).filter(x => x.ks.length)
  .sort((a, b) => (a.j.kesifDate || '').localeCompare(b.j.kesifDate || ''));

const kindOf = k => REMIND_KINDS.find(x => x.k === k);
const fmtSent = r => `${new Date(r.t).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })} ${new Date(r.t).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })} · ${({ wa: 'WhatsApp', sms: 'SMS', copy: 'kopyalandı' })[r.via] || r.via}`;

/* gönderim penceresi: alıcı, düzenlenebilir mesaj, WhatsApp / SMS / kopyala */
export async function remindDialog(j, st, k, { onSent } = {}) {
  const K = kindOf(k), p = kesifPerson(st, j);
  const to = K.to === 'team' ? { name: p?.name || '', phone: p?.phone || '' } : { name: j.customer?.name || '', phone: j.customer?.phone || '' };
  const miss = [];
  if (!j.kesifDate) miss.push('keşif tarihi');
  else if (!kesifAt(j)?.hasTime && k !== 'team') miss.push('keşif saati');
  if (K.to === 'customer' && !p) miss.push('keşfe gelecek kişi');
  if (!to.phone) miss.push(K.to === 'team' ? 'kişinin telefonu' : 'müşteri telefonu');
  const sent = sentOf(j, k);
  const r = await modal({ title: K.t, body: `
    <div class="rm-to">${icon(K.to === 'team' ? 'user' : 'phone')}<span><b>${esc(to.name || (K.to === 'team' ? 'Keşfe gidecek kişi seçilmedi' : 'Müşteri'))}</b><small>${esc(to.phone || 'telefon yok')}</small></span></div>
    ${miss.length ? `<p class="warn small">Eksik: ${miss.join(', ')}. Mesajda ilgili satırlar çıkarıldı.</p>` : ''}
    ${sent ? `<p class="muted small">Bu mesaj daha önce gönderildi: ${fmtSent(sent)}</p>` : ''}
    <label>Mesaj<textarea class="inp rm-txt" rows="9">${esc(remindText(j, st, k))}</textarea></label>
    <p class="muted small">Mesajı burada değiştirebilirsiniz; kalıcı değişiklik için Ayarlar → Randevu hatırlatma şablonlarını düzenleyin.</p>`,
    actions: [{ k: 'no', t: 'Vazgeç' }, { k: 'copy', t: 'Kopyala', icon: 'copy' }, { k: 'sms', t: 'SMS', icon: 'chat' }, { k: 'wa', t: 'WhatsApp', cls: 'btn-primary', icon: 'share' }] });
  if (!r || r.k === 'no') return false;
  const text = $('.rm-txt', r.el).value.trim(); if (!text) return false;
  const tel = String(to.phone || '').replace(/[^\d+]/g, '');
  if (r.k === 'wa') window.open(waLink(to.phone, text), '_blank');
  else if (r.k === 'sms') location.href = `sms:${tel}?&body=${encodeURIComponent(text)}`;
  else { try { await navigator.clipboard.writeText(text); toast('Mesaj kopyalandı'); } catch { toast('Kopyalanamadı', 'err'); } }
  (j.remind ||= {})[k] = { t: Date.now(), for: j.kesifDate, via: r.k };
  onSent?.(`${K.t} gönderildi (${({ wa: 'WhatsApp', sms: 'SMS', copy: 'kopyalandı' })[r.k]}${K.to === 'team' && to.name ? ' → ' + to.name : ''})`);
  return true;
}

/* iş sayfasındaki kart */
export function renderRemindCard(el, j, st, { onSent } = {}) {
  const a = kesifAt(j), p = kesifPerson(st, j), due = dueKinds(j, st);
  el.innerHTML = `
    <div class="row-between"><h3>${icon('bell')}Randevu hatırlatma</h3>${a ? `<span class="rm-when">${esc(dayWord(j))}${a.hasTime ? ' · ' + a.d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : ''}</span>` : ''}</div>
    ${!a ? '<p class="muted small">Keşif tarihi ve saati girildiğinde müşteriye randevu onayı ve hatırlatma mesajları buradan gönderilir.</p>' : `
    ${p ? `<div class="rm-person">${icon('user')}<span><b>${esc(p.name)}</b><small>${esc([p.title, p.phone].filter(Boolean).join(' · '))}</small></span></div>` : `<p class="warn small">Keşfe gelecek kişi seçilmedi — mesajda kişi bilgisi yer almaz. ${team(st).length ? 'Yukarıdan seçin.' : 'Ayarlar → Keşif ekibi bölümünden ekibi ekleyin.'}</p>`}
    <div class="rm-list">${REMIND_KINDS.map(K => { const s = sentOf(j, K.k), d = due.includes(K.k); return `
      <div class="rm-row ${s ? 'sent' : d ? 'due' : ''}"><span class="rm-ic">${icon(s ? 'check' : d ? 'bell' : 'clock')}</span>
        <span class="rm-t"><b>${K.t}</b><small>${s ? 'Gönderildi · ' + fmtSent(s) : d ? 'Gönderme zamanı geldi' : K.d}</small></span>
        <button class="btn btn-${d ? 'primary' : 'ghost'} btn-xs" data-rm="${K.k}">${s ? 'Tekrar' : 'Gönder'}</button></div>`; }).join('')}</div>`}`;
  $$('[data-rm]', el).forEach(b => b.onclick = async () => { if (await remindDialog(j, st, b.dataset.rm, { onSent })) renderRemindCard(el, j, st, { onSent }); });
}

/* ayarlar: keşif ekibi + şablonlar */
export function renderRemindSettings(el, st, persist) {
  st.team ||= []; st.remind ||= {};
  const draw = () => {
    el.innerHTML = `
      <h3>${icon('bell')}Keşif ekibi ve randevu hatırlatma</h3>
      <p class="muted small">Keşfe gidecek kişileri ekleyin; iş sayfasında "Keşfe gelecek kişi" seçilince adı, unvanı ve telefonu müşteriye giden mesaja eklenir.</p>
      <div class="tm-list">${st.team.map(m => `<div class="tm-row" data-id="${m.id}">
        <input class="inp sm" data-t="name" value="${esc(m.name || '')}" placeholder="Ad soyad">
        <input class="inp sm" data-t="title" value="${esc(m.title || '')}" placeholder="Unvan (ör. Keşif uzmanı)">
        <input class="inp sm" type="tel" inputmode="tel" data-t="phone" value="${esc(m.phone || '')}" placeholder="Telefon">
        <button class="icon-btn sm danger" data-tdel title="Sil">${icon('trash')}</button></div>`).join('') || '<p class="muted small">Henüz kişi eklenmedi.</p>'}</div>
      <button class="btn btn-ghost btn-sm" data-tadd>${icon('plus')}Kişi ekle</button>
      <h4>Mesaj şablonları</h4>
      <p class="muted small">Kullanılabilir alanlar (dokununca imlecin olduğu yere eklenir): ${REMIND_VARS.map(([k, t]) => `<button class="chip xs" data-var="${k}" title="${t}">{${k}}</button>`).join(' ')}. Değeri boş kalan alanların satırı mesajdan çıkarılır.</p>
      ${REMIND_KINDS.map(K => `<label>${K.t} <small class="muted">— ${K.d}</small><textarea class="inp rm-tpl" rows="7" data-tpl="${K.k}">${esc(remindTpl(st, K.k))}</textarea></label>`).join('')}
      <button class="btn btn-ghost btn-sm" data-treset>Şablonları varsayılana döndür</button>
      <p class="muted small">Telegram günlük özeti: bildirim botu her akşam 19:00'da yarınki, sabah 08:00'de bugünkü keşifleri bu şablonlarla hazırlanmış WhatsApp düğmeleriyle gönderir (bulut modunda).</p>`;
    let last = null;
    $$('[data-tpl]', el).forEach(t => { t.onfocus = () => { last = t; }; t.oninput = () => { st.remind[t.dataset.tpl] = t.value; persist(); }; });
    $$('[data-var]', el).forEach(b => b.onclick = e => {
      e.preventDefault(); const t = last || $('[data-tpl]', el), v = `{${b.dataset.var}}`, i = t.selectionStart ?? t.value.length;
      t.value = t.value.slice(0, i) + v + t.value.slice(t.selectionEnd ?? i); t.focus(); t.selectionStart = t.selectionEnd = i + v.length; t.oninput();
    });
    $('.tm-list', el).oninput = e => { const r = e.target.closest('.tm-row'), k = e.target.dataset.t; if (!r || !k) return; st.team.find(m => m.id === r.dataset.id)[k] = e.target.value; persist(); };
    $('.tm-list', el).onclick = e => { const b = e.target.closest('[data-tdel]'); if (!b) return; st.team = st.team.filter(m => m.id !== b.closest('.tm-row').dataset.id); persist(); draw(); };
    $('[data-tadd]', el).onclick = () => { st.team.push({ id: 'tm' + Math.random().toString(36).slice(2, 9), name: '', title: 'Keşif uzmanı', phone: '' }); persist(); draw(); $$('.tm-row [data-t="name"]', el).at(-1)?.focus(); };
    $('[data-treset]', el).onclick = () => { st.remind = {}; persist(); draw(); };
  };
  draw();
}
