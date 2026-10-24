/* ═══ Teklif formu oluşturma aracı ═══ */
import { uid } from './store.js';
import { CATEGORIES, catOf, UNITS, PHOTO_TAGS } from './catalog.js';
import { icon, esc, h, $, $$, fmtMoney, fmtNum, fmtDate, modal, toast, waLink } from './ui.js';
import { planMetrics } from './plan-geom.js';

export function newQuote(job, settings) {
  const d = new Date();
  return {
    no: `${job.code}-T1`, date: d.toISOString().slice(0, 10), validDays: settings.validDays || 15,
    vatPct: settings.vat ?? 20, discountPct: 0, profitPct: settings.profit ?? 0, profitMode: 'line', items: [], intro: '', notes: '', terms: settings.terms || '',
    showVat: true, attach: [], rev: 1,
  };
}

/* kalem fiyatları maliyettir; yüklenici kârı üstüne eklenir, iskonto kâr dahil tutara uygulanır */
export function quoteTotals(q) {
  const cost = q.items.reduce((s, i) => s + (+i.qty || 0) * (+i.price || 0), 0);
  const profit = cost * (+q.profitPct || 0) / 100;
  const sub = cost + profit;
  // iskonto: oran (%) ya da tutar (₺, kâr dahil ara toplamdan düşülür, ara toplamı aşamaz)
  const disc = q.discMode === 'amt' ? Math.min(sub, Math.max(0, +q.discountAmt || 0)) : sub * (+q.discountPct || 0) / 100;
  const net = sub - disc;
  const vat = q.showVat ? net * (+q.vatPct || 0) / 100 : 0;
  return { cost, profit, sub, disc, net, vat, total: net + vat };
}
const discLabel = q => q.discMode === 'amt' ? 'İskonto' : `İskonto (%${fmtNum(q.discountPct)})`;
/* "birim fiyatlara dağıt" modunda müşteriye giden birim fiyat çarpanı */
const priceK = q => q.profitMode === 'spread' ? 1 + (+q.profitPct || 0) / 100 : 1;

/* metraj kaynağı: önce plan, yoksa keşif mahalleri */
export function jobMetrics(job) {
  const pm = planMetrics(job.plan);
  if (pm.rooms.length) return { src: 'Rölöve planı', ...pm };
  const rooms = (job.inspection?.rooms || []).filter(r => r.w && r.l).map(r => {
    const area = r.w * r.l / 1e4, perim = 2 * (r.w + r.l) / 100, hh = (r.h || 280) / 100;
    return { id: r.id, name: r.name, area, perim, h: hh, wallArea: perim * hh, ceil: area };
  });
  const sum = k => rooms.reduce((s, r) => s + r[k], 0);
  return { src: 'Keşif ölçüleri', rooms, floor: sum('area'), wall: sum('wallArea'), ceil: sum('ceil'), perim: sum('perim') };
}

/* teklif ekleri: işin çizimleri (plan) ve fotoğrafları; seçilenler q.attach'te 'plan:<id>' / 'photo:<id>' */
const tagT = k => PHOTO_TAGS.find(t => t.k === k)?.t || 'Fotoğraf';
const tagRank = k => ({ render: 0, rolove: 1, once: 2, kesif: 3 }[k] ?? 4);
function attachCands(job, ctx) {
  const plans = (ctx?.drawings?.() || []).map(d => ({ key: 'plan:' + d.id, kind: 'plan', id: d.id, title: d.name, sub: d.main ? 'Rölöve planı' : 'Proje / tasarım planı' }));
  const photos = (job.photos || []).slice().sort((a, b) => tagRank(a.tag) - tagRank(b.tag) || (a.t || 0) - (b.t || 0))
    .map(p => ({ key: 'photo:' + p.id, kind: 'photo', p, title: p.caption || (p.tag === 'render' ? 'Görselleştirme' : tagT(p.tag)), sub: [tagT(p.tag), p.room].filter(Boolean).join(' · ') }));
  return [...plans, ...photos];
}
/* eski teklifler: "render / plan görsellerini ekle" açıksa ilk dört render / rölöve fotoğrafı */
function ensureAttach(q, job) {
  if (Array.isArray(q.attach)) return;
  q.attach = q.includeRenders ? (job.photos || []).filter(p => p.tag === 'render' || p.tag === 'rolove').slice(0, 4).map(p => 'photo:' + p.id) : [];
}
/* seçili ekler, listedeki sırayla (Ek-1, Ek-2…) */
const attachOrdered = (job, q, ctx) => attachCands(job, ctx).filter(c => q.attach.includes(c.key));

export function renderQuote(root, job, settings, save, ctx) {
  if (!job.quote) {
    root.innerHTML = `<div class="empty card">
      <div class="empty-ic">${icon('file')}</div><h3>Teklif henüz oluşturulmadı</h3>
      <p class="muted">Fiyat kütüphanesinden kalem ekleyin; metrajlar rölöve planından otomatik gelir.</p>
      <button class="btn btn-primary" data-newq>${icon('plus')}Teklif oluştur</button></div>`;
    $('[data-newq]', root).onclick = () => {
      job.quote = newQuote(job, settings);
      // anket kapsamındaki işler için başlangıç kalemleri öner
      save(); renderQuote(root, job, settings, save, ctx);
    };
    return;
  }
  const q = job.quote, met = jobMetrics(job);
  ensureAttach(q, job);
  const attHtml = () => {
    const cands = attachCands(job, ctx), order = attachOrdered(job, q, ctx).map(c => c.key);
    return `<div class="q-att">
      <div class="row-between"><b>${icon('image')}Teklif ekleri</b><span class="muted small">${order.length ? `${order.length} ek seçili` : 'Ek seçilmedi'}</span></div>
      <p class="muted small">Seçilen plan ve görseller teklifin sonuna her biri tam sayfa olarak "Ek-1, Ek-2…" adıyla eklenir; teklifte ekler listesi yer alır.</p>
      ${cands.length ? `<div class="att-grid">${cands.map(c => { const n = order.indexOf(c.key); return `<label class="att${n >= 0 ? ' on' : ''}">
        <input type="checkbox" data-att="${c.key}" ${n >= 0 ? 'checked' : ''}>
        <span class="att-img">${c.kind === 'plan' ? `<img src="${ctx.planImg(c.id, 240, 160)}" alt="">` : `<img data-ph="${c.p.id}" alt="">`}${n >= 0 ? `<em>Ek-${n + 1}</em>` : ''}</span>
        <b>${esc(c.title)}</b><small>${esc(c.sub)}</small></label>`; }).join('')}</div>
        <div class="row wrap"><button class="btn btn-ghost btn-xs" data-act="attpr">${icon('check')}Plan ve renderları seç</button><button class="btn btn-ghost btn-xs" data-act="attnone">Seçimi temizle</button></div>`
        : '<p class="muted small">Eklenecek çizim ya da fotoğraf yok — Rölöve & 3D sekmesinde çizim yapın ya da Fotoğraflar sekmesinden render / plan görseli ekleyin.</p>'}
    </div>`;
  };
  const loadThumbs = () => $$('img[data-ph]', root).forEach(async im => { const p = (job.photos || []).find(x => x.id === im.dataset.ph); if (p && ctx?.photoUrl) try { im.src = await ctx.photoUrl(p); } catch { /* fotoğraf yüklenemedi */ } });
  const draw = () => {
    const T = quoteTotals(q);
    const groups = CATEGORIES.map(c => ({ c, items: q.items.filter(i => i.cat === c.k) })).filter(g => g.items.length);
    root.innerHTML = `
      <div class="card q-head">
        <div class="grid4">
          <label>Teklif no<input class="inp" data-q="no" value="${esc(q.no)}"></label>
          <label>Tarih<input class="inp" type="date" data-q="date" value="${esc(q.date)}"></label>
          <label>Geçerlilik<div class="inp-unit"><input class="inp" type="number" data-q="validDays" value="${q.validDays}"><span>gün</span></div></label>
          <label>Revizyon<input class="inp" type="number" data-q="rev" value="${q.rev || 1}"></label>
        </div>
        <label>Giriş metni (isteğe bağlı)<textarea class="inp" rows="2" data-q="intro" placeholder="Sayın ${esc(job.customer.name || 'Müşterimiz')}, keşif sonucu hazırlanan teklifimiz aşağıdadır.">${esc(q.intro)}</textarea></label>
      </div>

      <div class="card met-card">
        <div class="met-h"><b>${icon('ruler')}Metraj özeti</b><span class="muted small">${esc(met.src)}</span></div>
        ${met.rooms.length ? `<div class="met-chips">
          <span><small>Zemin</small><b>${fmtNum(met.floor)} m²</b></span>
          <span><small>Net duvar</small><b>${fmtNum(met.wall)} m²</b></span>
          <span><small>Tavan</small><b>${fmtNum(met.ceil)} m²</b></span>
          <span><small>Çevre</small><b>${fmtNum(met.perim)} m</b></span></div>`
          : `<p class="muted small">Rölöve planı veya keşif mahal ölçüleri girildiğinde metrajlar burada görünür ve kalemlere otomatik aktarılır.</p>`}
      </div>

      <div class="card">
        <div class="q-toolbar">
          <h3>Kalemler</h3>
          <div class="row">
            <button class="btn btn-primary btn-sm" data-act="lib">${icon('list')}Kütüphaneden ekle</button>
            <button class="btn btn-ghost btn-sm" data-act="add">${icon('plus')}Serbest kalem</button>
          </div>
        </div>
        ${groups.length ? groups.map(g => `
          <div class="q-group">
            <div class="q-gh"><span class="ic-badge sm">${icon(g.c.ic)}</span>${esc(g.c.t)}<span class="muted">${fmtMoney(g.items.reduce((s, i) => s + i.qty * i.price, 0))}</span></div>
            ${g.items.map(i => `<div class="q-row" data-id="${i.id}">
              <textarea class="inp q-desc" rows="1" data-i="desc">${esc(i.desc)}</textarea>
              <div class="q-nums">
                <label><small>Miktar</small><input class="inp" type="number" inputmode="decimal" step="0.01" data-i="qty" value="${i.qty}"></label>
                <label><small>Birim</small><select class="inp" data-i="unit">${UNITS.map(u => `<option ${u === i.unit ? 'selected' : ''}>${u}</option>`).join('')}</select></label>
                <label><small>Birim fiyat ₺</small><input class="inp" type="number" inputmode="decimal" step="0.01" data-i="price" value="${i.price}"></label>
                <div class="q-line"><small>Tutar</small><b>${fmtMoney(i.qty * i.price)}</b></div>
                <div class="q-ops">
                  <select class="inp mini" data-i="cat" title="Kategori">${CATEGORIES.map(c => `<option value="${c.k}" ${c.k === i.cat ? 'selected' : ''}>${c.t}</option>`).join('')}</select>
                  ${i.qtyKey && met.rooms.length ? `<button class="icon-btn sm" data-op="met" title="Metrajdan güncelle">${icon('ruler')}</button>` : ''}
                  <button class="icon-btn sm" data-op="dup" title="Çoğalt">${icon('copy')}</button>
                  <button class="icon-btn sm danger" data-op="del" title="Sil">${icon('trash')}</button>
                </div>
              </div>
            </div>`).join('')}
          </div>`).join('') : `<p class="muted center pad">Henüz kalem yok. Kütüphaneden ekleyerek başlayın.</p>`}
      </div>

      <div class="q-bottom">
        <div class="card">
          <label>Notlar<textarea class="inp" rows="3" data-q="notes" placeholder="Malzeme markaları, kapsam dışı işler…">${esc(q.notes)}</textarea></label>
          <label>Şartlar ve koşullar<textarea class="inp" rows="6" data-q="terms">${esc(q.terms)}</textarea></label>
          ${attHtml()}
        </div>
        <div class="card totals">
          <div class="grid2">
            <label>Yüklenici kârı<div class="inp-unit"><input class="inp" type="number" step="0.5" data-q="profitPct" value="${q.profitPct || 0}"><span>%</span></div></label>
            <label>Teklifte<select class="inp" data-q="profitMode"><option value="line" ${q.profitMode !== 'spread' ? 'selected' : ''}>Ayrı satır göster</option><option value="spread" ${q.profitMode === 'spread' ? 'selected' : ''}>Birim fiyatlara dağıt</option></select></label>
            <label>İskonto<div class="inp-unit disc-unit">${q.discMode === 'amt'
              ? `<input class="inp" type="number" min="0" step="0.01" data-q="discountAmt" value="${+q.discountAmt || 0}">`
              : `<input class="inp" type="number" min="0" step="0.5" data-q="discountPct" value="${q.discountPct}">`}
              <select data-q="discMode" aria-label="İskonto türü"><option value="pct" ${q.discMode !== 'amt' ? 'selected' : ''}>%</option><option value="amt" ${q.discMode === 'amt' ? 'selected' : ''}>₺</option></select></div></label>
            <label>KDV<div class="inp-unit"><input class="inp" type="number" data-q="vatPct" value="${q.vatPct}"><span>%</span></div></label>
          </div>
          <label class="check"><input type="checkbox" data-q="showVat" ${q.showVat ? 'checked' : ''}> KDV ekle</label>
          ${settings.company?.stamp ? `<label class="check"><input type="checkbox" data-q="stamp" ${q.stamp !== false ? 'checked' : ''}> Kaşeyi teklife ekle</label>` : `<p class="muted small">Teklife kaşe basmak için Ayarlar → Firma bilgileri'nden kaşe görseli yükleyin.</p>`}
          ${T.profit ? `<div class="tline"><span>Maliyet (kalemler)</span><b>${fmtMoney(T.cost)}</b></div><div class="tline"><span>Yüklenici kârı (%${fmtNum(q.profitPct)})</span><b>+ ${fmtMoney(T.profit)}</b></div>` : ''}
          <div class="tline"><span>Ara toplam${T.profit ? ' (kâr dahil)' : ''}</span><b>${fmtMoney(T.sub)}</b></div>
          ${T.disc ? `<div class="tline"><span>${discLabel(q)}</span><b>− ${fmtMoney(T.disc)}</b></div>` : ''}
          ${q.showVat ? `<div class="tline"><span>KDV (%${q.vatPct})</span><b>${fmtMoney(T.vat)}</b></div>` : ''}
          <div class="tline grand"><span>Genel toplam</span><b>${fmtMoney(T.total)}</b></div>
          ${T.profit ? `<p class="muted small">Kalem fiyatları maliyet olarak girilir. ${q.profitMode === 'spread' ? 'Teklif çıktısında kâr birim fiyatlara dağıtılır; müşteri ayrı kâr satırı görmez.' : 'Teklif çıktısında "Genel giderler ve yüklenici kârı" ayrı satır olarak görünür.'} Net kâr (iskonto sonrası): <b>${fmtMoney(T.profit - T.disc)}</b></p>` : ''}
          <div class="col">
            <label>Müşteriye gidecek teklif formu<select class="inp" data-q="format">
              <option value="detayli" ${q.format !== 'ozet' ? 'selected' : ''}>Ayrıntılı — her kalemin birim fiyatı ve tutarı</option>
              <option value="ozet" ${q.format === 'ozet' ? 'selected' : ''}>Özet — kalemler ve miktarlar, yalnızca toplam fiyat</option></select></label>
            <button class="btn btn-primary" data-act="print">${icon('print')}Teklifi yazdır / PDF</button>
            <button class="btn btn-ghost" data-act="wa">${icon('chat')}WhatsApp ile gönder</button>
            <button class="btn btn-ghost btn-sm danger-t" data-act="reset">${icon('trash')}Teklifi sil</button>
          </div>
        </div>
      </div>`;
    $$('textarea.q-desc', root).forEach(autoGrow);
    loadThumbs();
  };
  draw();

  const redrawTotals = () => { const y = scrollY; draw(); scrollTo(0, y); };
  root.oninput = e => {
    const k = e.target.dataset.q, ik = e.target.dataset.i;
    if (k === 'discMode') return;   // tür değişimi 'change'te işlenir (mevcut iskonto korunarak)
    if (k) { q[k] = e.target.type === 'checkbox' ? e.target.checked : e.target.type === 'number' ? +e.target.value : e.target.value; save(); return; }
    if (ik) {
      const it = q.items.find(i => i.id === e.target.closest('.q-row').dataset.id);
      it[ik] = e.target.type === 'number' ? +e.target.value : e.target.value;
      if (ik === 'desc') autoGrow(e.target);
      else { const line = $('.q-line b', e.target.closest('.q-row')); line.textContent = fmtMoney(it.qty * it.price); }
      save();
    }
  };
  root.onchange = e => {
    const k = e.target.dataset.q, ik = e.target.dataset.i;
    if (k === 'format') { q.format = e.target.value; save(); return; }
    const ak = e.target.dataset.att;
    if (ak) { q.attach = q.attach.filter(x => x !== ak); if (e.target.checked) q.attach.push(ak); save(); redrawTotals(); return; }
    if (k === 'discMode') {   // tür değişince mevcut iskonto aynı tutarda kalsın
      const cur = quoteTotals(q).disc, sub = quoteTotals(q).sub;
      q.discMode = e.target.value;
      if (q.discMode === 'amt') q.discountAmt = Math.round(cur * 100) / 100; else q.discountPct = sub ? Math.round(cur / sub * 10000) / 100 : 0;
      save(); redrawTotals(); return;
    }
    if (k && ['discountPct', 'discountAmt', 'vatPct', 'profitPct', 'profitMode', 'showVat', 'includeRenders', 'stamp'].includes(k)) { q[k] = e.target.type === 'checkbox' ? e.target.checked : k === 'profitMode' ? e.target.value : +e.target.value; save(); redrawTotals(); }
    if (ik === 'cat' || ik === 'qty' || ik === 'price') redrawTotals();
  };
  root.onclick = async e => {
    const a = e.target.closest('[data-act]')?.dataset.act, op = e.target.closest('[data-op]')?.dataset.op;
    if (op) {
      const id = e.target.closest('.q-row').dataset.id, i = q.items.findIndex(x => x.id === id), it = q.items[i];
      if (op === 'del') q.items.splice(i, 1);
      if (op === 'dup') q.items.splice(i + 1, 0, { ...it, id: uid('q') });
      if (op === 'met') it.qty = +(met[it.qtyKey] || 0).toFixed(2);
      save(); redrawTotals(); return;
    }
    if (a === 'add') { q.items.push({ id: uid('q'), cat: 'diger', desc: '', unit: 'adet', qty: 1, price: 0 }); save(); draw(); $$('.q-desc', root).at(-1)?.focus(); }
    if (a === 'lib') { const added = await libraryPicker(settings.catalog, met, job); if (added?.length) { q.items.push(...added); save(); draw(); toast(`${added.length} kalem eklendi`); } }
    if (a === 'attpr') { q.attach = attachCands(job, ctx).filter(c => c.kind === 'plan' || c.p.tag === 'render' || c.p.tag === 'rolove').map(c => c.key); save(); redrawTotals(); }
    if (a === 'attnone') { q.attach = []; save(); redrawTotals(); }
    if (a === 'print') printQuote(job, settings, ctx);
    if (a === 'wa') {
      const T = quoteTotals(q);
      const txt = `Merhaba ${job.customer.name || ''},\nTadilatBodrum.com olarak ${job.customer.address || 'mülkünüz'} için hazırladığımız teklif özeti:\n\n` +
        CATEGORIES.map(c => { const its = q.items.filter(i => i.cat === c.k); return its.length ? `• ${c.t}: ${fmtMoney(its.reduce((s, i) => s + i.qty * i.price, 0))}` : ''; }).filter(Boolean).join('\n') +
        `\n\nGenel toplam: ${fmtMoney(T.total)}${q.showVat ? ' (KDV dahil)' : ' + KDV'}\nTeklif no: ${q.no} · Geçerlilik: ${q.validDays} gün\n\nDetaylı PDF teklifimizi ayrıca iletiyoruz. Sorularınız için buradayız.`;
      window.open(waLink(job.customer.phone, txt), '_blank');
    }
    if (a === 'reset') {
      const r = await modal({ title: 'Teklifi sil', body: '<p>Tüm kalemler silinecek. Emin misiniz?</p>', actions: [{ k: 'no', t: 'Vazgeç' }, { k: 'ok', t: 'Sil', cls: 'btn-danger' }] });
      if (r?.k === 'ok') { job.quote = null; save(); renderQuote(root, job, settings, save, ctx); }
    }
  };
}

function autoGrow(t) { t.style.height = 'auto'; t.style.height = t.scrollHeight + 2 + 'px'; }

async function libraryPicker(catalog, met, job) {
  const scope = job.survey?.answers?.kapsam || [];
  let cat = scope[0] && catalog.some(c => c.cat === scope[0]) ? scope[0] : '';
  const sel = new Set();
  const body = h(`<div class="lib">
    <input class="inp" placeholder="Ara…" data-s>
    <div class="chips scroll" data-c><button class="chip ${!cat ? 'on' : ''}" data-v="">Tümü</button>${CATEGORIES.filter(c => catalog.some(x => x.cat === c.k)).map(c => `<button class="chip ${cat === c.k ? 'on' : ''}" data-v="${c.k}">${scope.includes(c.k) ? '★ ' : ''}${c.t}</button>`).join('')}</div>
    <div class="lib-list"></div></div>`);
  const list = $('.lib-list', body);
  const draw = () => {
    const s = $('[data-s]', body).value.toLocaleLowerCase('tr');
    list.innerHTML = catalog.filter(c => (!cat || c.cat === cat) && (!s || c.desc.toLocaleLowerCase('tr').includes(s))).map(c => `
      <label class="lib-item ${sel.has(c.id) ? 'on' : ''}"><input type="checkbox" value="${c.id}" ${sel.has(c.id) ? 'checked' : ''}>
        <span><b>${esc(c.desc)}</b><small>${esc(catOf(c.cat).t)} · ${fmtMoney(c.price)} / ${esc(c.unit)}${c.qty && met.rooms.length ? ` · metraj: ${fmtNum(met[c.qty])} ${c.unit}` : ''}</small></span></label>`).join('') || '<p class="muted">Sonuç yok</p>';
  };
  draw();
  $('[data-s]', body).oninput = draw;
  $('[data-c]', body).onclick = e => { const b = e.target.closest('.chip'); if (!b) return; cat = b.dataset.v; $$('.chip', b.parentElement).forEach(x => x.classList.toggle('on', x === b)); draw(); };
  list.onchange = e => { e.target.checked ? sel.add(e.target.value) : sel.delete(e.target.value); e.target.closest('.lib-item').classList.toggle('on', e.target.checked); };
  const r = await modal({ title: 'Fiyat kütüphanesi', body, wide: true, actions: [{ k: 'no', t: 'Vazgeç' }, { k: 'ok', t: 'Seçilenleri ekle', cls: 'btn-primary' }] });
  if (r?.k !== 'ok') return [];
  return catalog.filter(c => sel.has(c.id)).map(c => ({
    id: uid('q'), cat: c.cat, desc: c.desc, unit: c.unit, price: c.price, qtyKey: c.qty || '',
    qty: c.qty && met.rooms.length ? +(met[c.qty] || 0).toFixed(2) : 1,
  }));
}

/* ═══ yazdırma ═══ */
/* belge önizleme (Yazdır + PDF) — mobilde de çalışır, bkz. docview.js */
export function printDoc(html, title = 'TadilatBodrum') {
  import('./docview.js').then(m => m.openDocument(html, title));
}

/* belgelerde ikonlar harici CSS'e bağlı olmasın (PDF çiziminde de doğru görünsün) */
const docIcon = (k, c) => icon(k).replace('<svg class="ic "', `<svg width="20" height="20" fill="none" stroke="${c}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"`);

export function docHeader(settings, title, sub = '') {
  const c = settings.company;
  return `<header class="p-head">
    <img src="assets/logo.png" class="p-logo" alt="">
    <div class="p-co"><b>${esc(c.name)}</b>${[c.address, c.phone, c.email, c.web].filter(Boolean).map(esc).join('<br>')}</div>
  </header>
  <div class="p-title"><h1>${esc(title)}</h1>${sub}</div>`;
}
export const docFooter = () => `<footer class="p-foot">
  <div class="p-badges"><span>${docIcon('shield', '#00AFB0')}Güvenilir Ustalar</span><span>${docIcon('award', '#EB591F')}Kaliteli Malzeme</span><span>${docIcon('clock', '#00AFB0')}Zamanında Teslim</span></div>
  <div class="p-bar"></div></footer>`;

async function printQuote(job, settings, ctx) {
  const q = job.quote, T = quoteTotals(q), c = job.customer, stamp = q.stamp !== false && settings.company?.stamp;
  const valid = new Date(q.date); valid.setDate(valid.getDate() + (+q.validDays || 0));
  // ekler: liste teklifte, her biri ayrı tam sayfa (plan yüksek çözünürlüklü, sayfa oranında)
  ensureAttach(q, job);
  const att = await Promise.all(attachOrdered(job, q, ctx).map(async c => ({ ...c, src: c.kind === 'plan' ? ctx.planImg(c.id, 1300, 1700) : await Promise.resolve().then(() => ctx.photoUrl(c.p)).catch(() => '') })));
  const annexList = att.length ? `<section class="p-notes p-annexlist"><h4>Ekler</h4><ol>${att.map((a, i) => `<li><b>Ek-${i + 1}:</b> ${esc(a.title)} <span>(${esc(a.sub)})</span></li>`).join('')}</ol><p class="p-annex-note">Ekler bu teklifin ayrılmaz parçasıdır.</p></section>` : '';
  const annexPages = att.map((a, i) => `<section class="p-break p-annex"><div class="p-annex-h"><b>EK-${i + 1}</b><span>${esc(a.title)}</span><small>${esc(q.no)} no'lu teklifin ekidir</small></div><figure class="p-annex-f">${a.src ? `<img src="${a.src}" alt="">` : '<span>Görsel yüklenemedi</span>'}</figure></section>`).join('');
  let n = 0;
  const k = priceK(q), spread = k !== 1, brief = q.format === 'ozet';   // özet: kalem ve miktarlar, fiyat yok — yalnızca toplam
  const rows = CATEGORIES.map(cat => {
    const its = q.items.filter(i => i.cat === cat.k); if (!its.length) return '';
    const st = its.reduce((s, i) => s + i.qty * i.price * k, 0);
    if (brief) return `<tr class="grp"><td colspan="4">${esc(cat.t)}</td></tr>` +
      its.map(i => `<tr><td class="c">${++n}</td><td>${esc(i.desc).replace(/\n/g, '<br>')}</td><td class="r">${fmtNum(i.qty)}</td><td>${esc(i.unit)}</td></tr>`).join('');
    return `<tr class="grp"><td colspan="5">${esc(cat.t)}</td><td class="r">${fmtMoney(st)}</td></tr>` +
      its.map(i => `<tr><td class="c">${++n}</td><td>${esc(i.desc).replace(/\n/g, '<br>')}</td><td class="r">${fmtNum(i.qty)}</td><td>${esc(i.unit)}</td><td class="r">${fmtMoney(i.price * k)}</td><td class="r">${fmtMoney(i.qty * i.price * k)}</td></tr>`).join('');
  }).join('');
  const html = `<div class="pdoc">
    ${docHeader(settings, 'Fiyat Teklifi', `<div class="p-meta"><span>Teklif no <b>${esc(q.no)}${q.rev > 1 ? ' / Rev.' + q.rev : ''}</b></span><span>Tarih <b>${fmtDate(q.date)}</b></span><span>Geçerlilik <b>${fmtDate(valid)}</b></span></div>`)}
    <section class="p-cust">
      <div><small>Müşteri</small><b>${esc(c.name || '—')}</b>${esc(c.phone || '')}${c.email ? '<br>' + esc(c.email) : ''}</div>
      <div><small>Proje adresi</small><b>${esc(c.district || '')}</b>${esc(c.address || '')}</div>
      <div><small>İş kodu</small><b>${esc(job.code)}</b>${esc(job.property?.type || '')}</div>
    </section>
    ${q.intro ? `<p class="p-intro">${esc(q.intro).replace(/\n/g, '<br>')}</p>` : ''}
    <table class="p-table"><thead><tr><th>#</th><th>Açıklama</th><th class="r">Miktar</th><th>Birim</th>${brief ? '' : '<th class="r">Birim fiyat</th><th class="r">Tutar</th>'}</tr></thead><tbody>${rows}</tbody></table>
    ${brief ? `<section class="p-totals">
      <div class="tline grand"><span>Toplam teklif bedeli</span><b>${fmtMoney(T.total)}</b></div>
      <div class="tline"><span>${q.showVat ? `KDV (%${q.vatPct}) dahildir` : 'KDV hariçtir'}${T.disc ? (q.discMode === 'amt' ? ` · ${fmtMoney(T.disc)} iskonto uygulanmıştır` : ` · %${fmtNum(q.discountPct)} iskonto uygulanmıştır`) : ''}</span><b></b></div>
    </section>` : `<section class="p-totals">
      ${T.profit && !spread ? `<div class="tline"><span>İş kalemleri toplamı</span><b>${fmtMoney(T.cost)}</b></div><div class="tline"><span>Genel giderler ve yüklenici kârı (%${fmtNum(q.profitPct)})</span><b>${fmtMoney(T.profit)}</b></div>` : ''}
      <div class="tline"><span>Ara toplam</span><b>${fmtMoney(T.sub)}</b></div>
      ${T.disc ? `<div class="tline"><span>${discLabel(q)}</span><b>− ${fmtMoney(T.disc)}</b></div>` : ''}
      ${q.showVat ? `<div class="tline"><span>KDV (%${q.vatPct})</span><b>${fmtMoney(T.vat)}</b></div>` : '<div class="tline"><span>KDV</span><b>Hariç</b></div>'}
      <div class="tline grand"><span>Genel toplam</span><b>${fmtMoney(T.total)}</b></div>
    </section>`}
    ${q.notes ? `<section class="p-notes"><h4>Notlar</h4><p>${esc(q.notes).replace(/\n/g, '<br>')}</p></section>` : ''}
    ${q.terms ? `<section class="p-notes"><h4>Şartlar ve koşullar</h4><ul>${q.terms.split('\n').filter(Boolean).map(t => `<li>${esc(t)}</li>`).join('')}</ul></section>` : ''}
    ${annexList}
    ${settings.company.iban ? `<p class="p-iban">IBAN: <b>${esc(settings.company.iban)}</b>${settings.company.taxNo ? ' · VKN: ' + esc(settings.company.taxNo) : ''}</p>` : ''}
    <section class="p-sign${stamp ? ' has-stamp' : ''}"><div>TadilatBodrum.com<span>Kaşe / İmza</span>${stamp ? `<img class="p-stamp" src="${stamp}" alt="Kaşe">` : ''}</div><div>Müşteri onayı<span>Ad Soyad / İmza / Tarih</span></div></section>
    ${annexPages}
    ${docFooter()}
  </div>`;
  printDoc(html, `Teklif ${q.no} - ${c.name || ''}`);
}
