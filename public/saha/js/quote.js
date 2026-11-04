/* ═══ Teklif formu oluşturma aracı ═══ */
import { uid } from './store.js';
import { CATEGORIES, catOf, UNITS, PHOTO_TAGS } from './catalog.js';
import { icon, esc, h, $, $$, fmtMoney, fmtNum, fmtDate, modal, toast, waLink } from './ui.js';
import { planMetrics } from './plan-geom.js';
import { quoteScopeHtml } from './urunui.js';

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
/* KDV ibaresi: KDV eklenmemişse '+ KDV' / 'KDV hariçtir' yazısı tercihe bağlı (q.vatNote, varsayılan açık) */
const vatNoteOn = q => !q.showVat && q.vatNote !== false;
const plusVat = q => vatNoteOn(q) ? ' <small class="p-pvat">+ KDV</small>' : '';
const vatTxt = q => q.showVat ? `KDV (%${q.vatPct}) dahildir` : vatNoteOn(q) ? 'KDV hariçtir' : '';
const discTxt = q => q.discMode === 'amt' ? `${fmtMoney(quoteTotals(q).disc)} iskonto uygulanmıştır` : `%${fmtNum(q.discountPct)} iskonto uygulanmıştır`;
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

/* ═══ teklif arşivi: mevcut teklif arşive alınır, yeni teklif açılır; arşivdeki teklif görüntülenir / geri yüklenir ═══ */
const FMT_T = { detayli: 'Ayrıntılı', ozet: 'Özet', mektup: 'Teklif mektubu' };
const qClone = q => JSON.parse(JSON.stringify(q));
const logQ = (job, text) => (job.log ||= []).unshift({ t: Date.now(), text });
function nextQuoteNo(job) {
  const ns = [job.quote, ...(job.quoteArchive || []).map(a => a.quote)].filter(Boolean).map(q => +(String(q.no || '').match(/-T(\d+)\s*$/)?.[1] || 0));
  return `${job.code}-T${Math.max(0, ...ns) + 1}`;
}
function archiveCurrent(job, note = '') {
  const q = job.quote; if (!q) return null;
  const T = quoteTotals(q);
  const a = { id: uid('qa'), at: Date.now(), note: note.trim(), no: q.no, rev: q.rev || 1, date: q.date, total: T.total, vat: !!q.showVat, format: q.format || 'detayli', n: q.items.length, quote: qClone(q) };
  (job.quoteArchive ||= []).unshift(a);
  return a;
}
/* yeni teklif: mevcutun kopyası (kalemler, şartlar, ayarlar) ya da boş; numara bir sonraki T, revizyon 1 */
function freshQuote(job, settings, base) {
  const q = base ? qClone(base) : newQuote(job, settings);
  q.no = nextQuoteNo(job); q.date = new Date().toISOString().slice(0, 10); q.rev = 1;
  delete q.revHist; delete q.firstDate; delete q.revNote; delete q.revCmp; delete q._revPrev;
  return q;
}
function archHtml(job) {
  const A = job.quoteArchive || [];
  if (!A.length) return '';
  return `<div class="card q-arch">
    <div class="row-between"><h3>${icon('clock')}Teklif arşivi <span class="muted small">${A.length} teklif</span></h3></div>
    <div class="q-arch-list">${A.map(a => `<div class="q-arch-it" data-qa="${a.id}">
      <div class="q-arch-t"><b>${esc(a.no)}${a.rev > 1 ? ' / Rev.' + a.rev : ''}</b><span class="muted small">${fmtDate(a.date)} · ${esc(FMT_T[a.format] || 'Ayrıntılı')} · ${a.n} kalem · arşiv: ${fmtDate(a.at)}</span>
        ${a.note ? `<span class="small q-arch-note">${esc(a.note)}</span>` : ''}</div>
      <b class="q-arch-sum">${fmtMoney(a.total)}<small>${a.vat ? 'KDV dahil' : 'KDV hariç'}</small></b>
      <div class="q-arch-op"><button class="btn btn-ghost btn-xs" data-qaop="view">${icon('print')}Görüntüle / PDF</button><button class="btn btn-ghost btn-xs" data-qaop="restore">${icon('rotate')}Geri yükle</button><button class="icon-btn sm danger" data-qaop="del" title="Arşivden sil">${icon('trash')}</button></div>
    </div>`).join('')}</div>
  </div>`;
}
/* arşiv düğmeleri (teklif ekranında ve teklif yokken) — işlendiyse true */
async function archClick(e, root, job, settings, save, ctx) {
  const op = e.target.closest('[data-qaop]')?.dataset.qaop; if (!op) return false;
  const A = job.quoteArchive || [], i = A.findIndex(x => x.id === e.target.closest('[data-qa]').dataset.qa), a = A[i];
  if (!a) return true;
  if (op === 'view') { printQuote(job, settings, ctx, qClone(a.quote), 'Arşiv'); return true; }
  if (op === 'del') {
    const r = await modal({ title: 'Arşivden sil', body: `<p><b>${esc(a.no)}</b> numaralı arşiv teklifi kalıcı olarak silinecek. Emin misiniz?</p>`, actions: [{ k: 'no', t: 'Vazgeç' }, { k: 'ok', t: 'Sil', cls: 'btn-danger' }] });
    if (r?.k !== 'ok') return true;
    A.splice(i, 1); logQ(job, `Arşivdeki teklif silindi: ${a.no}`);
  }
  if (op === 'restore') {
    const cur = job.quote;
    const r = await modal({ title: 'Arşivden geri yükle', body: `<p><b>${esc(a.no)}</b> (${fmtMoney(a.total)}) güncel teklif olarak açılacak.</p>${cur ? `<p class="muted small">Şu anki teklif (<b>${esc(cur.no)}</b>, ${fmtMoney(quoteTotals(cur).total)}) kaybolmaz; arşive alınır.</p>` : ''}`, actions: [{ k: 'no', t: 'Vazgeç' }, { k: 'ok', t: 'Geri yükle', cls: 'btn-primary' }] });
    if (r?.k !== 'ok') return true;
    A.splice(i, 1);
    if (cur) archiveCurrent(job, `${a.no} geri yüklenirken arşive alındı`);
    job.quote = qClone(a.quote);
    logQ(job, `Arşivden teklif geri yüklendi: ${a.no}`);
    toast(`${a.no} güncel teklif olarak açıldı`);
  }
  save(); renderQuote(root, job, settings, save, ctx);
  return true;
}

export function renderQuote(root, job, settings, save, ctx) {
  if (!job.quote) {
    root.innerHTML = `<div class="empty card">
      <div class="empty-ic">${icon('file')}</div><h3>Teklif henüz oluşturulmadı</h3>
      <p class="muted">Fiyat kütüphanesinden kalem ekleyin; metrajlar rölöve planından otomatik gelir.</p>
      <button class="btn btn-primary" data-newq>${icon('plus')}Teklif oluştur</button></div>${archHtml(job)}`;
    root.oninput = root.onchange = null;
    root.onclick = e => archClick(e, root, job, settings, save, ctx);
    $('[data-newq]', root).onclick = () => {
      job.quote = (job.quoteArchive || []).length ? freshQuote(job, settings) : newQuote(job, settings);
      // anket kapsamındaki işler için başlangıç kalemleri öner
      save(); renderQuote(root, job, settings, save, ctx);
    };
    return;
  }
  const q = job.quote, met = jobMetrics(job);
  q._revPrev = q.rev || 1;   // revizyon artışını yakalamak için (oninput q.rev’i önce günceller)
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
        ${(q.rev || 1) > 1 ? revBox(q) : ''}
        <label>${(q.rev || 1) > 1 ? 'Ek açıklama (isteğe bağlı, revizyon metninin altında)' : 'Giriş metni (isteğe bağlı)'}<textarea class="inp" rows="2" data-q="intro" placeholder="${(q.rev || 1) > 1 ? 'Örn. Talebiniz üzerine banyo seramiği bir üst seriye yükseltilmiştir.' : `Sayın ${esc(job.customer.name || 'Müşterimiz')}, keşif sonucu hazırlanan teklifimiz aşağıdadır.`}">${esc(q.intro)}</textarea></label>
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

      ${q.format === 'mektup' ? letterCard(q, job) : ''}

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
          ${q.showVat ? '' : `<label class="check"><input type="checkbox" data-q="vatNote" ${q.vatNote !== false ? 'checked' : ''}> Teklifte "+ KDV" ibaresi yazılsın <small class="muted">(KDV hariç olduğu belirtilir)</small></label>`}
          ${settings.company?.stamp ? `<label class="check"><input type="checkbox" data-q="stamp" ${q.stamp !== false ? 'checked' : ''}> Kaşeyi teklife ekle</label>` : `<p class="muted small">Teklife kaşe basmak için Ayarlar → Firma bilgileri'nden kaşe görseli yükleyin.</p>`}
          ${T.profit ? `<div class="tline"><span>Maliyet (kalemler)</span><b>${fmtMoney(T.cost)}</b></div><div class="tline"><span>Yüklenici kârı (%${fmtNum(q.profitPct)})</span><b>+ ${fmtMoney(T.profit)}</b></div>` : ''}
          <div class="tline"><span>Ara toplam${T.profit ? ' (kâr dahil)' : ''}</span><b>${fmtMoney(T.sub)}</b></div>
          ${T.disc ? `<div class="tline"><span>${discLabel(q)}</span><b>− ${fmtMoney(T.disc)}</b></div>` : ''}
          ${q.showVat ? `<div class="tline"><span>KDV (%${q.vatPct})</span><b>${fmtMoney(T.vat)}</b></div>` : ''}
          <div class="tline grand"><span>Genel toplam</span><b>${fmtMoney(T.total)}</b></div>
          ${T.profit ? `<p class="muted small">Kalem fiyatları maliyet olarak girilir. ${q.profitMode === 'spread' ? 'Teklif çıktısında kâr birim fiyatlara dağıtılır; müşteri ayrı kâr satırı görmez.' : 'Teklif çıktısında "Genel giderler ve yüklenici kârı" ayrı satır olarak görünür.'} Net kâr (iskonto sonrası): <b>${fmtMoney(T.profit - T.disc)}</b></p>` : ''}
          <div class="col">
            <label>Müşteriye gidecek teklif formu<select class="inp" data-q="format">
              <option value="detayli" ${!q.format || q.format === 'detayli' ? 'selected' : ''}>Ayrıntılı — her kalemin birim fiyatı ve tutarı</option>
              <option value="ozet" ${q.format === 'ozet' ? 'selected' : ''}>Özet — kalemler ve miktarlar, yalnızca toplam fiyat</option>
              <option value="mektup" ${q.format === 'mektup' ? 'selected' : ''}>Teklif mektubu — iş başlıkları ve teklif bedeli (metraj yok)</option></select></label>
            <button class="btn btn-primary" data-act="print">${icon('print')}Teklifi yazdır / PDF</button>
            <button class="btn btn-ghost" data-act="wa">${icon('chat')}WhatsApp ile gönder</button>
            <button class="btn btn-ghost" data-act="arch">${icon('clock')}Arşive al, yeni teklif oluştur</button>
            <button class="btn btn-ghost btn-sm danger-t" data-act="reset">${icon('trash')}Teklifi sil</button>
          </div>
        </div>
      </div>`;
    root.insertAdjacentHTML('beforeend', archHtml(job));
    $$('textarea.q-desc', root).forEach(autoGrow);
    loadThumbs();
  };
  draw();

  const redrawTotals = () => { const y = scrollY; draw(); scrollTo(0, y); };
  root.oninput = e => {
    const k = e.target.dataset.q, ik = e.target.dataset.i;
    const lt = e.target.dataset.lt, lh = e.target.dataset.lh;
    if (lt === 'intro' || lt === 'outro') { q.letter[lt] = e.target.value; save(); return; }
    if (lh) { const h = q.letter.heads.find(x => x.id === e.target.closest('.q-lh').dataset.h); if (h) { h.t = e.target.value; save(); } return; }
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
    if (k === 'format') { q.format = e.target.value; if (q.format === 'mektup' && !q.letter?.heads) { letterSync(q); letterRegen(q); } save(); redrawTotals(); return; }
    const lt = e.target.dataset.lt;
    if (lt === 'price' || lt === 'words') { q.letter[lt] = lt === 'words' ? e.target.checked : e.target.value; save(); return; }
    if (k === 'rev') {   // revizyon artınca önceki revizyonun tarihi ve tutarı kaydedilir (karşılaştırma için)
      const v = Math.max(1, Math.round(+e.target.value || 1)), old = q._revPrev ?? 1;
      q.revHist ||= [];
      if (v > old && !q.revHist.some(h => h.rev === old)) q.revHist.push({ rev: old, date: q.date, total: quoteTotals(q).total, t: Date.now() });
      if (old === 1 && v > 1) q.firstDate ||= q.date;
      q.rev = v; q._revPrev = v; save(); redrawTotals(); return;
    }
    if (k === 'revCmp') { q.revCmp = e.target.checked; save(); return; }
    const ak = e.target.dataset.att;
    if (ak) { q.attach = q.attach.filter(x => x !== ak); if (e.target.checked) q.attach.push(ak); save(); redrawTotals(); return; }
    if (k === 'discMode') {   // tür değişince mevcut iskonto aynı tutarda kalsın
      const cur = quoteTotals(q).disc, sub = quoteTotals(q).sub;
      q.discMode = e.target.value;
      if (q.discMode === 'amt') q.discountAmt = Math.round(cur * 100) / 100; else q.discountPct = sub ? Math.round(cur / sub * 10000) / 100 : 0;
      save(); redrawTotals(); return;
    }
    if (k && ['discountPct', 'discountAmt', 'vatPct', 'profitPct', 'profitMode', 'showVat', 'vatNote', 'includeRenders', 'stamp'].includes(k)) { q[k] = e.target.type === 'checkbox' ? e.target.checked : k === 'profitMode' ? e.target.value : +e.target.value; save(); redrawTotals(); }
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
    if (await archClick(e, root, job, settings, save, ctx)) return;
    if (a === 'arch') {
      const T = quoteTotals(q);
      const r = await modal({ title: 'Teklifi arşive al', body: `
        <p><b>${esc(q.no)}${q.rev > 1 ? ' / Rev.' + q.rev : ''}</b> · ${fmtDate(q.date)} · ${fmtMoney(T.total)} — bu teklif değiştirilmeden arşivde saklanır; istediğiniz zaman görüntüleyebilir, PDF alabilir ya da geri yükleyebilirsiniz.</p>
        <label>Arşiv notu (isteğe bağlı)<input class="inp" id="qaNote" placeholder="Örn. Müşteri bütçeyi yüksek buldu, kapsam daraltılacak"></label>
        <div class="col" style="gap:6px;margin-top:6px"><b class="small">Yeni teklif (${esc(nextQuoteNo(job))})</b>
          <label class="check"><input type="radio" name="qaNew" value="copy" checked> Bu teklifin kopyasıyla başla <small class="muted">(kalemler, fiyatlar, şartlar ve ayarlar)</small></label>
          <label class="check"><input type="radio" name="qaNew" value="blank"> Boş teklif</label></div>`,
        actions: [{ k: 'no', t: 'Vazgeç' }, { k: 'ok', t: 'Arşive al ve yeni teklif aç', cls: 'btn-primary' }] });
      if (r?.k !== 'ok') return;
      const copy = r.el.querySelector('[name="qaNew"]:checked')?.value !== 'blank';
      const arc = archiveCurrent(job, $('#qaNote', r.el).value || '');
      job.quote = freshQuote(job, settings, copy ? q : null);
      logQ(job, `Teklif arşivlendi: ${arc.no} (${fmtMoney(arc.total)}) · yeni teklif ${job.quote.no}`);
      save(); renderQuote(root, job, settings, save, ctx); scrollTo(0, 0);
      toast(`${arc.no} arşive alındı · ${job.quote.no} açıldı`);
      return;
    }
    const lop = e.target.closest('[data-lhop]')?.dataset.lhop;
    if (lop) {
      const H = q.letter.heads, i = H.findIndex(x => x.id === e.target.closest('.q-lh').dataset.h);
      if (lop === 'up' && i > 0) [H[i - 1], H[i]] = [H[i], H[i - 1]];
      if (lop === 'merge' && i > 0) { H[i - 1].items.push(...H[i].items); H.splice(i, 1); }
      if (lop === 'del') H.splice(i, 1);
      save(); redrawTotals(); return;
    }
    if (a === 'lhadd') { q.letter.heads.push({ id: uid('lh'), t: '', items: [] }); save(); redrawTotals(); $$('.q-lh input', root).at(-1)?.focus(); return; }
    if (a === 'lhgen') {
      const r = await modal({ title: 'İş başlıklarını yeniden oluştur', body: '<p>Başlıklarda yaptığınız değişiklikler (metin, sıra, birleştirme, eklenen başlıklar) silinip kalemlerden yeniden oluşturulacak.</p>', actions: [{ k: 'no', t: 'Vazgeç' }, { k: 'ok', t: 'Yeniden oluştur', cls: 'btn-primary' }] });
      if (r?.k === 'ok') { letterRegen(q); save(); redrawTotals(); }
      return;
    }
    if (a === 'add') { q.items.push({ id: uid('q'), cat: 'diger', desc: '', unit: 'adet', qty: 1, price: 0 }); save(); draw(); $$('.q-desc', root).at(-1)?.focus(); }
    if (a === 'lib') { const added = await libraryPicker(settings.catalog, met, job); if (added?.length) { q.items.push(...added); save(); draw(); toast(`${added.length} kalem eklendi`); } }
    if (a === 'attpr') { q.attach = attachCands(job, ctx).filter(c => c.kind === 'plan' || c.p.tag === 'render' || c.p.tag === 'rolove').map(c => c.key); save(); redrawTotals(); }
    if (a === 'attnone') { q.attach = []; save(); redrawTotals(); }
    if (a === 'print') printQuote(job, settings, ctx);
    if (a === 'wa') {
      const T = quoteTotals(q);
      const lines = q.format === 'mektup' ? letterSync(q).heads.filter(h => (h.t || '').trim()).map(h => `• ${h.t.trim()}${q.letter.price === 'heads' && h.items.length ? ': ' + fmtMoney(headAmt(q, h)) : ''}`) : null;
      const txt = `Merhaba ${job.customer.name || ''},\nTadilatBodrum.com olarak ${job.customer.address || 'mülkünüz'} için hazırladığımız teklif ${lines ? 'kapsamındaki işler' : 'özeti'}:\n\n` + (lines ? lines.join('\n') :
        CATEGORIES.map(c => { const its = q.items.filter(i => i.cat === c.k); return its.length ? `• ${c.t}: ${fmtMoney(its.reduce((s, i) => s + i.qty * i.price, 0))}` : ''; }).filter(Boolean).join('\n')) +
        `\n\n${lines ? 'Teklif bedeli' : 'Genel toplam'}: ${fmtMoney(T.total)}${q.showVat ? ' (KDV dahil)' : vatNoteOn(q) ? ' + KDV' : ''}\nTeklif no: ${q.no} · Geçerlilik: ${q.validDays} gün\n\nDetaylı PDF teklifimizi ayrıca iletiyoruz. Sorularınız için buradayız.`;
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

/* revizyon: editördeki bilgi kutusu */
function revBox(q) {
  const prev = revPrev(q);
  return `<div class="q-rev"><div class="q-rev-h">${icon('edit')}<b>Revizyon ${q.rev}</b><span class="muted small">${prev ? `önceki: Rev.${prev.rev} · ${fmtDate(prev.date)} · ${fmtMoney(prev.total)}` : 'önceki tutar kayıtlı değil'}</span></div>
    <p class="muted small">Teklif belgesinin başında revizyona özel giriş metni yer alır: ilk teklif tarihi ve numarası, bu revizyonun öncekilerin yerine geçtiği, aşağıdaki değişiklikler${prev ? ' ve önceki tutarla karşılaştırma' : ''}. İpucu: revizyon numarasını değişiklikleri yapmadan önce artırırsanız önceki tutar kaydedilir.</p>
    <label>Revizyonda yapılan değişiklikler (her satır bir madde)<textarea class="inp" rows="3" data-q="revNote" placeholder="Mutfak tezgahı kuvars yerine porselen olarak güncellendi&#10;Salon parkesi teklif kapsamından çıkarıldı">${esc(q.revNote || '')}</textarea></label>
    ${prev ? `<label class="check"><input type="checkbox" data-q="revCmp" ${q.revCmp !== false ? 'checked' : ''}> Belgede önceki tutarla karşılaştırma göster</label>` : ''}</div>`;
}
const revPrev = q => (q.revHist || []).filter(h => h.rev < (q.rev || 1)).sort((a, b) => b.rev - a.rev)[0] || null;
/* revizyon teklifinin giriş metni (belge) */
function revIntro(q, job, T) {
  const name = (job.customer?.name || '').trim(), prev = revPrev(q), first = q.firstDate || prev?.date || q.date;
  const notes = (q.revNote || '').split('\n').map(x => x.replace(/^\s*[-•*]\s*/, '').trim()).filter(Boolean);
  const diff = prev ? T.total - prev.total : 0;
  return `<section class="p-rev"><div class="p-rev-h"><span>REVİZYON ${q.rev}</span><small>${esc(q.no)} / Rev.${q.rev} · ${fmtDate(q.date)}</small></div>
    <p>Sayın ${esc(name || 'Müşterimiz')},</p>
    <p>${fmtDate(first)} tarihli ve <b>${esc(q.no)}</b> numaralı fiyat teklifimiz, görüşmelerimiz ve talepleriniz doğrultusunda revize edilmiştir. İşbu <b>Rev.${q.rev}</b> teklif, ${fmtDate(q.date)} tarihi itibarıyla geçerli olup önceki tüm revizyonların yerine geçer.</p>
    ${notes.length ? `<p class="p-rev-l">Bu revizyonda yapılan değişiklikler:</p><ul>${notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
    ${prev && q.revCmp !== false ? `<div class="p-rev-t"><div><small>Önceki teklif (Rev.${prev.rev} · ${fmtDate(prev.date)})</small><b>${fmtMoney(prev.total)}</b></div><div><small>Güncel teklif (Rev.${q.rev})</small><b>${fmtMoney(T.total)}</b></div><div><small>Fark</small><b class="${diff > 0 ? 'up' : diff < 0 ? 'down' : ''}">${diff > 0 ? '+' : diff < 0 ? '−' : ''}${fmtMoney(Math.abs(diff))}</b></div></div>` : ''}
  </section>`;
}

/* ═══ teklif mektubu: iş başlıkları + teklif bedeli (metraj / birim fiyat yok) ═══ */
/* kalem → iş başlığı kuralları (sırayla; ilk eşleşen); başlıklar teklifte düzenlenebilir */
const LH_RULES = [
  ['yikim', null, 'Söküm ve yıkım işleri ile moloz atımı'],
  ['insaat', /duvar|tuğla|tugla|gazbeton|bims|ytong|briket|bölme|bolme/i, 'Yeni oda bölme duvarlarının örülmesi işi'],
  ['insaat', /sıva|siva/i, 'Sıva işleri'],
  ['insaat', /betonarme|beton|kolon|kiriş|kiris|döşeme|doseme|lento/i, 'Betonarme imalat işleri'],
  ['insaat', null, 'İnşaat ve kaba imalat işleri'],
  ['alcipan', /sıva|siva|saten/i, 'Sıva ve alçı işleri'],
  ['alcipan', null, 'Alçıpan ve asma tavan işleri'],
  ['seramik', null, 'Seramik ve fayans döşeme işleri'],
  ['zemin', null, 'Zemin kaplama (parke) işleri'],
  ['boya', null, 'Boya ve badana işleri'],
  ['tesisat', null, 'Sıhhi tesisat hatlarının komple yenilenmesi'],
  ['elektrik', null, 'Elektrik tesisat hatlarının komple yenilenmesi'],
  ['banyo', null, 'Banyo yenileme işleri'],
  ['mutfak', null, 'Mutfak yenileme işleri'],
  ['vitrifiye', null, 'Vitrifiye ve armatürlerin temini ve montajı'],
  ['kapi', null, 'Kapı ve pencere (doğrama) işleri'],
  ['iklim', null, 'Isıtma ve klima tesisatı işleri'],
  ['yalitim', null, 'Yalıtım ve çatı işleri'],
  ['dis', null, 'Dış cephe, teras ve havuz işleri'],
  ['sabitmob', null, 'Sabit mobilya (dolap, vestiyer) imalatı ve montajı'],
  ['mobilya', null, 'Hareketli mobilya temini'],
  ['beyazesya', null, 'Beyaz eşya ve ankastre cihazların temini ve montajı'],
  ['aydinlatma', null, 'Aydınlatma armatürlerinin temini ve montajı'],
  ['perde', null, 'Perde ve stor uygulamaları'],
  ['peyzaj', null, 'Peyzaj ve bahçe düzenlemesi'],
  ['temizlik', null, 'İnşaat sonrası temizlik ve nakliye'],
];
const lhAuto = i => (LH_RULES.find(([c, re]) => c === i.cat && (!re || re.test(i.desc || ''))) || [0, 0, 'Diğer işler'])[2];
/* kalemlerin hepsi bir başlıkta olsun: yeni kalemler kural başlığına (yoksa yeni başlık) eklenir, silinen kalemler çıkarılır */
function letterSync(q) {
  q.letter ||= { price: 'total', words: true, intro: '', outro: '' };
  const L = q.letter, ids = new Set(q.items.map(i => i.id));
  L.heads ||= [];
  L.heads.forEach(h => { h.items = (h.items || []).filter(id => ids.has(id)); });
  const taken = new Set(L.heads.flatMap(h => h.items));
  for (const i of q.items) {
    if (taken.has(i.id)) continue;
    const t = lhAuto(i); let h = L.heads.find(x => x.auto === t);
    if (!h) { h = { id: uid('lh'), t, auto: t, items: [] }; L.heads.push(h); }
    h.items.push(i.id);
  }
  // otomatik başlıktan kalemleri boşalan (kalemleri silinmiş) başlıklar kalkar; elle eklenen başlıklar kalır
  L.heads = L.heads.filter(h => h.items.length || !h.auto);
  return L;
}
function letterRegen(q) {
  const L = q.letter; L.heads = [];
  letterSync(q);
  const ts = L.heads.find(h => h.auto === 'Sıhhi tesisat hatlarının komple yenilenmesi'), el = L.heads.find(h => h.auto === 'Elektrik tesisat hatlarının komple yenilenmesi');
  if (ts && el) { ts.t = 'Sıhhi tesisat ve elektrik tesisat hatlarının komple yenilenmesi'; ts.items.push(...el.items); L.heads = L.heads.filter(h => h !== el); }
  // kural sırası (iş akışı: söküm → kaba → ince → montaj)
  const rank = h => { const r = LH_RULES.findIndex(x => x[2] === h.auto); return r < 0 ? 99 : r; };
  L.heads.sort((a, b) => rank(a) - rank(b));
}
/* başlık bedeli: kalemler + yüklenici kârı (mektupta kâr ayrı satır olmaz) */
const headAmt = (q, h) => h.items.reduce((s, id) => { const i = q.items.find(x => x.id === id); return s + (i ? (+i.qty || 0) * (+i.price || 0) : 0); }, 0) * (1 + (+q.profitPct || 0) / 100);

/* tutarı yazıyla (Türk Lirası, kuruş) */
function trWords(v) {
  const B = ['', 'bir', 'iki', 'üç', 'dört', 'beş', 'altı', 'yedi', 'sekiz', 'dokuz'], O = ['', 'on', 'yirmi', 'otuz', 'kırk', 'elli', 'altmış', 'yetmiş', 'seksen', 'doksan'], G = ['', 'bin', 'milyon', 'milyar', 'trilyon'];
  const three = n => { const y = Math.floor(n / 100), r = n % 100; return [y ? (y > 1 ? B[y] + ' ' : '') + 'yüz' : '', O[Math.floor(r / 10)], B[r % 10]].filter(Boolean).join(' '); };
  const int = n => { if (!n) return 'sıfır'; const out = []; let g = 0; while (n > 0) { const p = n % 1000; if (p) out.unshift(g === 1 && p === 1 ? 'bin' : three(p) + (G[g] ? ' ' + G[g] : '')); n = Math.floor(n / 1000); g++; } return out.join(' '); };
  const r = Math.round(Math.abs(v) * 100), tl = Math.floor(r / 100), kr = r % 100;
  const s = `${int(tl)} Türk Lirası${kr ? ' ' + int(kr) + ' kuruş' : ''}`;
  return s.charAt(0).toLocaleUpperCase('tr') + s.slice(1);
}
const letterIntroDef = job => `Yaptığımız keşif ve görüşmelerimiz doğrultusunda, ${job.customer?.address ? job.customer.address + ' adresindeki' : ''} mülkünüzde yapılacak tadilat işleri için hazırladığımız fiyat teklifimizi bilgilerinize sunarız.`.replace(/\s+/g, ' ');
const letterOutroDef = valid => `Yapılacak işlere ait ayrıntılı iş tanımları, malzeme ve uygulama bilgileri tarafınıza ayrıca iletilecektir. Teklifimiz ${fmtDate(valid)} tarihine kadar geçerlidir. Teklifimizi uygun bulacağınızı umar, iyi çalışmalar dileriz.`;

/* teklif ekranında mektup kartı */
function letterCard(q, job) {
  const L = letterSync(q), valid = new Date(q.date); valid.setDate(valid.getDate() + (+q.validDays || 0));
  const heads = L.price === 'heads';
  return `<div class="card q-letter">
    <div class="q-toolbar"><h3>${icon('file')}Teklif mektubu — iş başlıkları</h3><button class="btn btn-ghost btn-sm" data-act="lhgen">${icon('rotate')}Kalemlerden yeniden oluştur</button></div>
    <p class="muted small">Müşteriye giden mektupta metraj, miktar ve birim fiyat yer almaz; yalnızca iş başlıkları ve teklif bedeli. Başlıklar kalemlerden otomatik oluşur; metni düzenleyebilir, başlıkları üsttekiyle birleştirebilir, kalemsiz başlık ekleyebilirsiniz. Yeni eklenen kalemler kendi başlığına otomatik girer.</p>
    <div class="q-lhs">${L.heads.map((h, n) => `<div class="q-lh" data-h="${h.id}">
      <span class="q-lh-n">${n + 1}</span>
      <input class="inp" data-lh="t" value="${esc(h.t)}" placeholder="İş başlığı">
      <span class="q-lh-a">${h.items.length ? `<small>${h.items.length} kalem</small><b>${fmtMoney(headAmt(q, h))}</b>` : '<small>kalemsiz</small>'}</span>
      <span class="q-lh-op">${n ? `<button class="icon-btn sm" data-lhop="up" title="Yukarı taşı">${icon('chevU')}</button><button class="icon-btn sm" data-lhop="merge" title="Üstteki başlıkla birleştir">${icon('layers')}</button>` : ''}${h.items.length ? '' : `<button class="icon-btn sm danger" data-lhop="del" title="Sil">${icon('trash')}</button>`}</span>
    </div>`).join('') || '<p class="muted small">Kalem ekleyince başlıklar oluşur.</p>'}</div>
    <button class="btn btn-ghost btn-sm" data-act="lhadd">${icon('plus')}Başlık ekle</button>
    <div class="grid2">
      <label>Fiyat gösterimi<select class="inp" data-lt="price"><option value="total" ${heads ? '' : 'selected'}>Yalnızca toplam teklif bedeli</option><option value="heads" ${heads ? 'selected' : ''}>Her iş başlığının bedeli ve toplam</option></select></label>
      <label class="check" style="align-self:end"><input type="checkbox" data-lt="words" ${L.words !== false ? 'checked' : ''}> Teklif bedelini yazıyla da yaz</label>
    </div>
    <label>Giriş metni<textarea class="inp" rows="3" data-lt="intro" placeholder="${esc(letterIntroDef(job))}">${esc(L.intro || '')}</textarea></label>
    <label>Kapanış metni<textarea class="inp" rows="3" data-lt="outro" placeholder="${esc(letterOutroDef(valid))}">${esc(L.outro || '')}</textarea></label>
    <p class="muted small">Boş bırakılan metin kutularında gri görünen varsayılan metin kullanılır. Notlar, şartlar ve ekler mektupta da yer alır.</p>
  </div>`;
}

/* mektup belgesi */
function letterBody(q, job, T, valid) {
  const L = letterSync(q), c = job.customer, name = (c.name || '').trim(), heads = L.price === 'heads';
  const list = L.heads.filter(h => (h.t || '').trim());
  return `${q.rev > 1 ? revIntro(q, job, T) + (q.intro ? `<p class="p-intro">${esc(q.intro).replace(/\n/g, '<br>')}</p>` : '')
      : `<p class="p-lt-to">Sayın ${esc(name || 'Müşterimiz')},</p><p class="p-intro">${esc((L.intro || '').trim() || letterIntroDef(job)).replace(/\n/g, '<br>')}</p>${q.intro ? `<p class="p-intro">${esc(q.intro).replace(/\n/g, '<br>')}</p>` : ''}`}
    <section class="p-lt"><h4>Teklif kapsamındaki işler</h4>
      <ol class="p-lt-list${heads ? ' priced' : ''}">${list.map(h => `<li><span>${esc(h.t)}</span>${heads ? `<i></i><b>${h.items.length ? fmtMoney(headAmt(q, h)) : 'dahil'}</b>` : ''}</li>`).join('')}</ol>
    </section>`;
}
/* mektubun son bloğu: teklif bedeli + kapanış (+ IBAN, imza printQuote'ta) — hep aynı sayfada kalır */
function letterEnd(q, T, valid) {
  const L = letterSync(q), heads = L.price === 'heads';
  return `<section class="p-lt-total">
      ${heads && (T.disc || q.showVat) ? `<div class="tline"><span>Ara toplam</span><b>${fmtMoney(T.sub)}</b></div>${T.disc ? `<div class="tline"><span>${discLabel(q)}</span><b>− ${fmtMoney(T.disc)}</b></div>` : ''}${q.showVat ? `<div class="tline"><span>KDV (%${q.vatPct})</span><b>${fmtMoney(T.vat)}</b></div>` : ''}` : ''}
      <div class="tline grand"><span>Teklif bedeli</span><b>${fmtMoney(T.total)}${plusVat(q)}</b></div>
      ${(() => { const t = [vatTxt(q), !heads && T.disc ? discTxt(q) : ''].filter(Boolean).join(' · '); return t || L.words !== false ? `<p class="p-lt-note">${t ? t + '.' : ''}${L.words !== false ? ` <span>Yalnız: ${trWords(T.total)}${vatNoteOn(q) ? ' + KDV' : ''}.</span>` : ''}</p>` : ''; })()}
    </section>
    <p class="p-intro">${esc((L.outro || '').trim() || letterOutroDef(valid)).replace(/\n/g, '<br>')}</p>`;
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

async function printQuote(job, settings, ctx, q = job.quote, tag = '') {
  const T = quoteTotals(q), c = job.customer, stamp = q.stamp !== false && settings.company?.stamp;
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
  const letter = q.format === 'mektup';
  const html = `<div class="pdoc${letter ? ' p-letter' : ''}">
    ${docHeader(settings, letter ? 'Teklif Mektubu' : 'Fiyat Teklifi', `<div class="p-meta"><span>Teklif no <b>${esc(q.no)}${q.rev > 1 ? ' / Rev.' + q.rev : ''}</b></span><span>Tarih <b>${fmtDate(q.date)}</b></span><span>Geçerlilik <b>${fmtDate(valid)}</b></span></div>`)}
    <section class="p-cust">
      <div><small>Müşteri</small><b>${esc(c.name || '—')}</b>${esc(c.phone || '')}${c.email ? '<br>' + esc(c.email) : ''}</div>
      <div><small>Proje adresi</small><b>${esc(c.district || '')}</b>${esc(c.address || '')}</div>
      <div><small>İş kodu</small><b>${esc(job.code)}</b>${esc(job.property?.type || '')}</div>
    </section>
    ${letter ? letterBody(q, job, T, valid) : `${q.rev > 1 ? revIntro(q, job, T) : ''}
    ${q.intro ? `<p class="p-intro">${esc(q.intro).replace(/\n/g, '<br>')}</p>` : ''}
    <table class="p-table"><thead><tr><th>#</th><th>Açıklama</th><th class="r">Miktar</th><th>Birim</th>${brief ? '' : '<th class="r">Birim fiyat</th><th class="r">Tutar</th>'}</tr></thead><tbody>${rows}</tbody></table>
    ${brief ? `<section class="p-totals">
      <div class="tline grand"><span>Toplam teklif bedeli</span><b>${fmtMoney(T.total)}${plusVat(q)}</b></div>
      ${[vatTxt(q), T.disc ? discTxt(q) : ''].filter(Boolean).length ? `<div class="tline"><span>${[vatTxt(q), T.disc ? discTxt(q) : ''].filter(Boolean).join(' · ')}</span><b></b></div>` : ''}
    </section>` : `<section class="p-totals">
      ${T.profit && !spread ? `<div class="tline"><span>İş kalemleri toplamı</span><b>${fmtMoney(T.cost)}</b></div><div class="tline"><span>Genel giderler ve yüklenici kârı (%${fmtNum(q.profitPct)})</span><b>${fmtMoney(T.profit)}</b></div>` : ''}
      <div class="tline"><span>Ara toplam</span><b>${fmtMoney(T.sub)}</b></div>
      ${T.disc ? `<div class="tline"><span>${discLabel(q)}</span><b>− ${fmtMoney(T.disc)}</b></div>` : ''}
      ${q.showVat ? `<div class="tline"><span>KDV (%${q.vatPct})</span><b>${fmtMoney(T.vat)}</b></div>` : vatNoteOn(q) ? '<div class="tline"><span>KDV</span><b>Hariç</b></div>' : ''}
      <div class="tline grand"><span>Genel toplam</span><b>${fmtMoney(T.total)}${plusVat(q)}</b></div>
    </section>`}`}
    ${q.notes ? `<section class="p-notes"><h4>Notlar</h4><p>${esc(q.notes).replace(/\n/g, '<br>')}</p></section>` : ''}
    ${letter ? '' : quoteScopeHtml(q)}
    ${q.terms ? `<section class="p-notes"><h4>Şartlar ve koşullar</h4><ul>${q.terms.split('\n').filter(Boolean).map(t => `<li>${esc(t)}</li>`).join('')}</ul></section>` : ''}
    ${annexList}
    ${letter ? `<section class="p-lt-end">${letterEnd(q, T, valid)}${settings.company.iban ? `<p class="p-iban">IBAN: <b>${esc(settings.company.iban)}</b>${settings.company.taxNo ? ' · VKN: ' + esc(settings.company.taxNo) : ''}</p>` : ''}<p class="p-lt-sal">Saygılarımızla,</p><section class="p-sign${stamp ? ' has-stamp' : ''}"><div>TadilatBodrum.com<span>Kaşe / İmza</span>${stamp ? `<img class="p-stamp" src="${stamp}" alt="Kaşe">` : ''}</div><div>Müşteri onayı<span>Ad Soyad / İmza / Tarih</span></div></section></section>` : `${settings.company.iban ? `<p class="p-iban">IBAN: <b>${esc(settings.company.iban)}</b>${settings.company.taxNo ? ' · VKN: ' + esc(settings.company.taxNo) : ''}</p>` : ''}
    <section class="p-sign${stamp ? ' has-stamp' : ''}"><div>TadilatBodrum.com<span>Kaşe / İmza</span>${stamp ? `<img class="p-stamp" src="${stamp}" alt="Kaşe">` : ''}</div><div>Müşteri onayı<span>Ad Soyad / İmza / Tarih</span></div></section>`}
    ${annexPages}
    ${docFooter()}
  </div>`;
  printDoc(html, `${tag ? tag + ' · ' : ''}Teklif ${q.no} - ${c.name || ''}`);
}
