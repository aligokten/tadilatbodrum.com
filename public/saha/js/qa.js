/* ═══ Müşteri soru–cevap: WhatsApp mesajından (kopyala / yapıştır) ya da elle sorular, yanıtlar, kayıt ve gönderim ═══
   İş kaydında j.qa = [{ id, title, t, src: 'wa' | 'el', raw, items: [{ id, q, a }], sent: [{ t, via }] }] */
import { icon, esc, $, $$, toast, modal, confirmDlg, waLink, fmtDate } from './ui.js';
import { uid } from './store.js';

/* ── WhatsApp metni çözümleme ── */
const D = '(\\d{1,2}[./-]\\d{1,2}[./-]\\d{2,4})', T = '(\\d{1,2}[:.]\\d{2}(?::\\d{2})?)';
const HEADS = [
  [new RegExp(`^\\[${D}[ ,]+${T}\\]\\s*([^:]{1,48}?):\\s?(.*)$`), m => ({ d: m[1], t: m[2], who: m[3], text: m[4] })],   // [29.10.2026 14:32:05] Ad: mesaj (iOS dışa aktarma)
  [new RegExp(`^\\[${T},\\s*${D}\\]\\s*([^:]{1,48}?):\\s?(.*)$`), m => ({ t: m[1], d: m[2], who: m[3], text: m[4] })],    // [14:32, 29.10.2026] Ad: mesaj (WhatsApp Web kopyalama)
  [new RegExp(`^${D},?\\s+${T}\\s*[-–]\\s*([^:]{1,48}?):\\s?(.*)$`), m => ({ d: m[1], t: m[2], who: m[3], text: m[4] })],  // 29.10.2026 14:32 - Ad: mesaj (Android dışa aktarma)
];
const SYSTEM = /^(<?(medya dahil edilmedi|media omitted|bu mesaj silindi|this message was deleted|mesajlar ve aramalar uçtan uca|messages and calls are end-to-end)[^>]*>?)$/i;

export function parseWhatsApp(raw) {
  const msgs = [];
  for (let line of String(raw || '').replace(/\r/g, '').replace(/[‎‏‪-‮]/g, '').split('\n')) {
    line = line.trimEnd(); if (!line.trim()) { if (msgs.length) msgs.at(-1).text += '\n'; continue; }
    let hit = null;
    for (const [re, f] of HEADS) { const m = re.exec(line); if (m) { hit = f(m); break; } }
    if (hit) msgs.push({ who: hit.who.trim(), when: `${hit.d} ${hit.t}`.trim(), text: hit.text });
    else if (msgs.length) msgs.at(-1).text += '\n' + line;
    else msgs.push({ who: '', when: '', text: line });
  }
  msgs.forEach(m => { m.text = m.text.trim(); });
  return msgs.filter(m => m.text && !SYSTEM.test(m.text));
}

/* soru mu? soru işareti ya da Türkçe soru eki / soru sözcüğü */
const QWORD = /(?<!\p{L})(m[ıiuü](s[ıiuü]n(ız|iz|uz|üz)?|y[ıiuü]m|y[ıiuü]z|d[ıiuü]r)?|ne\s?kadar|nas[ıi]l|ka[çc]|ne\s?zaman|neden|ni[çc]in|hangi(si)?|nerede|kim)(?!\p{L})/iu;
export const isQuestion = s => /\?\s*$/.test(s) || QWORD.test(s);

/* mesajlardan soru adayları: satır satır, cümle cümle; sorudan önceki açıklama cümlesi soruya eklenir */
export function extractQuestions(msgs, who = null) {
  const out = [];
  for (const m of msgs) {
    if (who && m.who && !who.has(m.who)) continue;
    for (let line of m.text.split('\n')) {
      line = line.replace(/^\s*(\d+\s*[.)\-:]|[-•*▪︎●])\s*/, '').trim(); if (!line || SYSTEM.test(line)) continue;
      const parts = line.match(/[^.!?…]+[?]+|[^.!?…]+[.!…]+|[^.!?…]+$/g) || [line];
      let ctx = '';
      for (let p of parts) {
        p = p.trim(); if (!p) continue;
        if (isQuestion(p)) { out.push({ q: (ctx ? ctx + ' ' : '') + p, isQ: true, who: m.who }); ctx = ''; }
        else ctx = ctx ? ctx + ' ' + p : p;
      }
      if (ctx && ctx.length > 2) out.push({ q: ctx, isQ: false, who: m.who });
    }
  }
  return out;
}

/* ── gönderim metni ve belge ── */
const answered = it => (it.a || '').trim();
export function qaText(s, job, settings) {
  const name = (job.customer?.name || '').trim(), firm = settings?.company?.name || '';
  const its = s.items.filter(it => it.q.trim() && answered(it));
  return [`Merhaba${name ? ' ' + name : ''},`, 'Sorularınızın yanıtlarını aşağıda bilgilerinize sunarız.', '',
    ...its.flatMap((it, i) => [`*${i + 1}) ${it.q.trim()}*`, it.a.trim(), '']),
    `${firm}${job.code ? ' · ' + job.code : ''}`].join('\n').trim();
}
export function qaDocHtml(s, job, settings, { docHeader, docFooter }) {
  const c = job.customer || {}, its = s.items.filter(it => it.q.trim());
  return `<div class="pdoc">${docHeader(settings, 'Sorularınız ve Yanıtlarımız', `<div class="p-meta"><span>İş kodu <b>${esc(job.code)}</b></span><span>Müşteri <b>${esc(c.name || '—')}</b></span><span>Tarih <b>${fmtDate(Date.now())}</b></span></div>`)}
    <section class="p-cust"><div><small>Konu</small><b>${esc(s.title)}</b>${s.src === 'wa' ? 'WhatsApp mesajınız' : 'Görüşme notu'} · ${fmtDate(s.t)}</div><div><small>Soru</small><b>${its.length} soru</b>${its.filter(answered).length} yanıtlandı</div></section>
    <section class="qa-doc">${its.map((it, i) => `<div class="qa-p"><div class="qa-pq"><span>${i + 1}</span><p>${esc(it.q.trim()).replace(/\n/g, '<br>')}</p></div><div class="qa-pa">${answered(it) ? esc(it.a.trim()).replace(/\n/g, '<br>') : '<i>Yanıt hazırlanıyor.</i>'}</div></div>`).join('')}</section>
    <p class="muted small" style="font-size:8.5pt">Bu belge, ${fmtDate(s.t)} tarihli ${s.src === 'wa' ? 'WhatsApp yazışmanızdaki' : 'görüşmemizdeki'} sorularınıza verdiğimiz yanıtları kayıt altına almak için hazırlanmıştır. Ek sorularınız için bize her zaman ulaşabilirsiniz.</p>
    ${docFooter()}</div>`;
}

/* ── sekme ── */
export function renderQA(tb, job, ctx) {
  job.qa ||= [];
  const L = job.qa, save = () => ctx.save();
  const draw = () => {
    const tot = L.reduce((n, s) => n + s.items.filter(it => it.q.trim()).length, 0), open = L.reduce((n, s) => n + s.items.filter(it => it.q.trim() && !answered(it)).length, 0);
    tb.innerHTML = `
      <div class="card qa-head">
        <div><h3>${icon('chat')}Müşteri soruları</h3><p class="muted small">Müşterinin WhatsApp mesajını kopyalayıp yapıştırın ya da soruları elle girin; her soruyu yanıtlayın, sonra yanıtları WhatsApp'tan gönderin ya da PDF olarak paylaşın. Hepsi bu işte kayıtlı kalır.</p>
          ${tot ? `<p class="small"><b>${tot}</b> soru · ${open ? `<b class="qa-open">${open} yanıt bekliyor</b>` : 'tümü yanıtlandı'}</p>` : ''}</div>
        <div class="row wrap"><button class="btn btn-primary btn-sm" data-qa="paste">${icon('paste')}WhatsApp mesajı yapıştır</button><button class="btn btn-ghost btn-sm" data-qa="manual">${icon('plus')}Elle soru-cevap</button></div>
      </div>
      ${L.length ? L.slice().sort((a, b) => b.t - a.t).map(s => sessHtml(s)).join('') : `<div class="empty card"><div class="empty-ic">${icon('chat')}</div><h3>Henüz soru yok</h3><p class="muted">WhatsApp'tan gelen mesajı yapıştırın; sorular tek tek ayrılır.</p></div>`}`;
  };
  const sessHtml = s => {
    const its = s.items, n = its.filter(it => it.q.trim()).length, ok = its.filter(it => it.q.trim() && answered(it)).length;
    return `<section class="card qa-s" data-s="${s.id}">
      <div class="qa-sh"><input class="inp qa-title" data-sf="title" value="${esc(s.title)}"><span class="pill ${ok === n && n ? 'pill-ok' : ''}">${ok}/${n} yanıtlandı</span>
        <button class="icon-btn sm danger" data-qa="sdel" title="Yazışmayı sil">${icon('trash')}</button></div>
      <p class="muted small">${s.src === 'wa' ? 'WhatsApp mesajı' : 'Elle girildi'} · ${fmtDate(s.t)}${s.sent?.length ? ` · <b>Gönderildi:</b> ${s.sent.map(x => `${fmtDate(x.t)} ${new Date(x.t).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })} (${({ wa: 'WhatsApp', pdf: 'PDF', kopya: 'metin kopyalandı' })[x.via] || x.via})`).join(', ')}` : ''}</p>
      <ol class="qa-list">${its.map((it, i) => `<li class="qa-it ${answered(it) ? 'ok' : ''}" data-i="${it.id}">
        <div class="qa-q"><span class="qa-n">${i + 1}</span><textarea class="inp" rows="1" data-f="q" placeholder="Soru">${esc(it.q)}</textarea>
          <div class="qa-ops"><button class="icon-btn sm" data-qa="up" title="Yukarı" ${i ? '' : 'disabled'}>↑</button><button class="icon-btn sm" data-qa="down" title="Aşağı" ${i < its.length - 1 ? '' : 'disabled'}>↓</button><button class="icon-btn sm danger" data-qa="idel" title="Soruyu sil">${icon('x')}</button></div></div>
        <textarea class="inp qa-a" rows="2" data-f="a" placeholder="Yanıtınız…">${esc(it.a || '')}</textarea></li>`).join('')}</ol>
      <div class="row wrap qa-act"><button class="btn btn-ghost btn-xs" data-qa="add">${icon('plus')}Soru ekle</button><span class="grow"></span>
        <button class="btn btn-ghost btn-sm" data-qa="copy">${icon('copy')}Metni kopyala</button>
        <button class="btn btn-ghost btn-sm" data-qa="pdf">${icon('print')}PDF / paylaş</button>
        <button class="btn btn-primary btn-sm" data-qa="wa">${icon('chat')}WhatsApp'ta gönder</button></div>
      ${s.raw ? `<details class="qa-raw"><summary>Orijinal mesaj</summary><pre>${esc(s.raw)}</pre></details>` : ''}
    </section>`;
  };
  const sOf = el => L.find(s => s.id === el.closest('[data-s]')?.dataset.s);
  const iOf = (s, el) => s?.items.find(it => it.id === el.closest('[data-i]')?.dataset.i);
  const grow = ta => { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 2 + 'px'; };
  const fit = () => $$('textarea', tb).forEach(grow);
  const unsent = s => { const n = s.items.filter(it => it.q.trim() && !answered(it)).length; return n ? confirmDlg(`${n} soru henüz yanıtlanmadı. Yanıtsız sorular PDF'te "Yanıt hazırlanıyor" olarak yer alır, WhatsApp metnine eklenmez. Devam edilsin mi?`, 'Devam', false) : true; };
  const mark = (s, via) => { (s.sent ||= []).push({ t: Date.now(), via }); ctx.logEvt?.(`Soru-cevap gönderildi (${({ wa: 'WhatsApp', pdf: 'PDF', kopya: 'metin' })[via]}): ${s.title}`); save(); };

  tb.oninput = e => {
    const t = e.target, s = sOf(t); if (!s) return;
    if (t.dataset.sf) s[t.dataset.sf] = t.value;
    else if (t.dataset.f) { const it = iOf(s, t); if (it) it[t.dataset.f] = t.value; grow(t); const li = t.closest('.qa-it'); li?.classList.toggle('ok', !!answered(it)); }
    save();
  };
  tb.onchange = e => { if (e.target.dataset.f === 'a' || e.target.dataset.f === 'q') { const sc = scrollY; draw(); fit(); scrollTo(0, sc); } };
  tb.onclick = async e => {
    const b = e.target.closest('[data-qa]'); if (!b) return;
    const a = b.dataset.qa, s = sOf(b);
    if (a === 'paste') return pasteDialog();
    if (a === 'manual') { const ns = { id: uid('qa'), title: 'Görüşme — ' + fmtDate(Date.now()), t: Date.now(), src: 'el', raw: '', items: [{ id: uid('qi'), q: '', a: '' }], sent: [] }; L.push(ns); save(); draw(); fit(); $(`[data-s="${ns.id}"] [data-f="q"]`, tb)?.focus(); return; }
    if (!s) return;
    const it = iOf(s, b), i = it ? s.items.indexOf(it) : -1;
    if (a === 'sdel') { if (await confirmDlg('Bu yazışma ve yanıtları silinsin mi?')) { L.splice(L.indexOf(s), 1); save(); draw(); fit(); } return; }
    if (a === 'add') { const ni = { id: uid('qi'), q: '', a: '' }; s.items.push(ni); save(); draw(); fit(); $(`[data-i="${ni.id}"] [data-f="q"]`, tb)?.focus(); return; }
    if (a === 'idel') { s.items.splice(i, 1); save(); draw(); fit(); return; }
    if (a === 'up' && i > 0) { [s.items[i - 1], s.items[i]] = [s.items[i], s.items[i - 1]]; save(); draw(); fit(); return; }
    if (a === 'down' && i < s.items.length - 1) { [s.items[i + 1], s.items[i]] = [s.items[i], s.items[i + 1]]; save(); draw(); fit(); return; }
    if (!s.items.some(x => x.q.trim() && answered(x))) return toast('Önce en az bir soruyu yanıtlayın', 'err');
    if (a === 'wa') {
      if (!await unsent(s)) return;
      const txt = qaText(s, job, ctx.settings);
      window.open(waLink(job.customer?.phone || '', txt), '_blank'); mark(s, 'wa'); draw(); fit();
      if (!job.customer?.phone) toast('Müşteri telefonu kayıtlı değil — WhatsApp\'ta kişiyi seçin');
    }
    if (a === 'copy') {
      const txt = qaText(s, job, ctx.settings);
      try { await navigator.clipboard.writeText(txt); toast('Yanıt metni kopyalandı'); mark(s, 'kopya'); draw(); fit(); }
      catch { await modal({ title: 'Yanıt metni', body: `<textarea class="inp" rows="14" style="width:100%">${esc(txt)}</textarea>`, actions: [{ k: 'ok', t: 'Kapat' }] }); }
    }
    if (a === 'pdf') {
      if (!await unsent(s)) return;
      ctx.printDoc(qaDocHtml(s, job, ctx.settings, ctx), `Soru-Cevap ${job.code}`); mark(s, 'pdf'); draw(); fit();
    }
  };

  /* yapıştırma: mesaj çözülür, gönderen seçilir, sorular işaretlenir */
  async function pasteDialog() {
    let msgs = [], who = new Set(), cands = [];
    const senders = () => [...new Set(msgs.map(m => m.who).filter(Boolean))];
    const pick = () => {   // varsayılan gönderen: müşteri adıyla eşleşen ya da en çok soru soran
      const ss = senders(); who = new Set();
      if (ss.length <= 1) { ss.forEach(x => who.add(x)); return; }
      const cn = (job.customer?.name || '').toLocaleLowerCase('tr').split(/\s+/).filter(x => x.length > 2);
      const byName = ss.filter(x => cn.some(w => x.toLocaleLowerCase('tr').includes(w)));
      if (byName.length) { byName.forEach(x => who.add(x)); return; }
      const qc = x => msgs.filter(m => m.who === x && isQuestion(m.text)).length;
      who.add(ss.slice().sort((a, b) => qc(b) - qc(a))[0]);
    };
    const preview = el => {
      cands = extractQuestions(msgs, senders().length ? who : null).map(c => ({ ...c, on: c.isQ }));
      const ss = senders();
      $('.qa-who', el).innerHTML = ss.length > 1 ? `<small class="muted">Soruları alınacak kişi:</small> ${ss.map(x => `<button type="button" class="chip sm ${who.has(x) ? 'on' : ''}" data-who="${esc(x)}">${esc(x)}</button>`).join('')}` : '';
      $('.qa-prev', el).innerHTML = cands.length ? `<p class="small muted">${cands.filter(c => c.on).length} soru seçili — soru olmayan satırları işaretleyerek ekleyebilirsiniz.</p>${cands.map((c, i) => `<label class="qa-cand ${c.isQ ? '' : 'nq'}"><input type="checkbox" data-c="${i}" ${c.on ? 'checked' : ''}><span>${esc(c.q)}</span></label>`).join('')}` : (msgs.length ? '<p class="muted small">Soru bulunamadı.</p>' : '');
    };
    const r = await modal({ title: 'WhatsApp mesajından sorular', wide: true, body: `
      <p class="muted small">WhatsApp'ta müşterinin mesajını (ya da sohbetin bir bölümünü) seçip kopyalayın, aşağıya yapıştırın. Saat / ad bilgili kopyalar ve "Sohbeti dışa aktar" metni de tanınır.</p>
      <div class="row wrap"><button type="button" class="btn btn-ghost btn-xs" data-clip>${icon('paste')}Panodan yapıştır</button></div>
      <textarea class="inp" id="qaRaw" rows="7" placeholder="Mesajı buraya yapıştırın…"></textarea>
      <label>Yazışma adı<input class="inp" id="qaTitle" value="WhatsApp — ${fmtDate(Date.now())}"></label>
      <div class="qa-who row wrap"></div><div class="qa-prev"></div>
      ${L.length ? `<label>Ekle<select class="inp" id="qaTo"><option value="">Yeni yazışma olarak</option>${L.slice().sort((a, b) => b.t - a.t).map(s => `<option value="${s.id}">Mevcut: ${esc(s.title)}</option>`).join('')}</select></label>` : ''}`,
      actions: [{ k: 'no', t: 'Vazgeç' }, { k: 'ok', t: 'Soruları ekle', cls: 'btn-primary', icon: 'check', validate: () => cands.some(c => c.on) || (toast('Eklenecek soru seçin', 'err'), false) }],
      onOpen: el => {
        const ta = $('#qaRaw', el);
        const run = () => { msgs = parseWhatsApp(ta.value); pick(); preview(el); };
        ta.oninput = run;
        $('[data-clip]', el).onclick = async () => { try { ta.value = await navigator.clipboard.readText(); run(); } catch { toast('Pano okunamadı — uzun basıp "Yapıştır" deyin', 'err'); } };
        el.addEventListener('click', e => { const w = e.target.closest('[data-who]'); if (!w) return; const x = w.dataset.who; who.has(x) ? who.delete(x) : who.add(x); preview(el); });
        el.addEventListener('change', e => { const c = e.target.dataset.c; if (c !== undefined) cands[+c].on = e.target.checked; });
        setTimeout(() => ta.focus(), 50);
      } });
    if (r?.k !== 'ok') return;
    const raw = $('#qaRaw', r.el).value.trim(), to = $('#qaTo', r.el)?.value, items = cands.filter(c => c.on).map(c => ({ id: uid('qi'), q: c.q, a: '' }));
    let s = to && L.find(x => x.id === to);
    if (s) { s.items.push(...items); s.raw = [s.raw, raw].filter(Boolean).join('\n\n— — —\n\n'); }
    else { s = { id: uid('qa'), title: $('#qaTitle', r.el).value.trim() || 'WhatsApp mesajı', t: Date.now(), src: 'wa', raw, items, sent: [] }; L.push(s); }
    ctx.logEvt?.(`WhatsApp mesajından ${items.length} soru kaydedildi: ${s.title}`);
    save(); draw(); fit(); toast(`${items.length} soru eklendi — yanıtları yazın`);
  }

  draw(); fit();
}

/* sekme rozeti: yanıt bekleyen soru sayısı */
export const qaOpen = job => (job.qa || []).reduce((n, s) => n + s.items.filter(it => it.q.trim() && !answered(it)).length, 0);
