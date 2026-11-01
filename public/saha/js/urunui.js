/* ═══ Ürün standartlaştırma arayüzü: Ürünler sayfası (program · katalog · malzeme · simülatör),
   ürün dosyası düzenleyici, işteki "Ürün" sekmesi (proje sınıfı, paket, metraj, maliyet, teklif,
   kalite kontrol K1–K6, değişiklik talepleri, dijital tadilat karnesi) ═══ */
import { icon, gicon, esc, $, $$, toast, modal, confirmDlg, fmtMoney, fmtNum, fmtDate } from './ui.js';
import { uid } from './store.js';
import { CATEGORIES, catOf } from './catalog.js';
import {
  PKS, pkOf, PROJECT_CLASS, SURFACE_CLASS, STATUS, statusOf, BASES, baseOf, LINE_KINDS, COMPONENTS, PHASES, WEEKS, PILOT_KPI,
  ensureUrun, productCode, readiness, canSell, quantities, calcSel, simPrice, today,
} from './urun.js';

const U_ = st => st.urun;
const opt = (v, cur, t) => `<option value="${esc(v)}" ${String(cur) === String(v) ? 'selected' : ''}>${esc(t)}</option>`;
const pill = s => `<span class="pill" style="--c:${statusOf(s).c}">${statusOf(s).t}</span>`;
const lines = a => (a || []).join('\n');
const unlines = s => String(s || '').split('\n').map(x => x.trim()).filter(Boolean);

/* ═════════ Ürünler sayfası ═════════ */
export function urunPage(root, ctx, sub = 'program', code = '') {
  const st = ctx.settings; if (ensureUrun(st)) ctx.saveSettings();
  const U = U_(st), persist = () => ctx.saveSettings();
  if (code) return productEditor(root, ctx, U.products.find(p => p.code === code), persist);
  const tabs = [['program', 'Dönüşüm programı', 'calendar'], ['katalog', 'Ürün kataloğu', 'box'], ['malzeme', 'Malzeme ve tedarikçi', 'layers'], ['simulator', 'Maliyet simülatörü', 'chart']];
  root.innerHTML = `<header class="page-head ur-head"><h1>Ürünler</h1><p class="muted">Usta ve işçilik değil, standartlaştırılmış yenileme çözümleri: fiyatı, kapsamı, süreci, kalitesi ve teslim koşulları önceden tanımlı ürünler.</p></header>
    <nav class="seg ur-tabs">${tabs.map(([k, t, ic]) => `<a href="#/urunler/${k}" class="${k === sub ? 'on' : ''}">${icon(ic === 'chart' ? 'sparkle' : ic)}<span>${t}</span></a>`).join('')}</nav>
    <section id="urb"></section>`;
  const b = $('#urb', root);
  ({ program: programTab, katalog: katalogTab, malzeme: malzemeTab, simulator: simTab }[sub] || programTab)(b, U, persist, ctx);
}

/* ── dönüşüm programı ── */
function programTab(b, U, persist) {
  const done = U.road.done ||= {};
  const all = WEEKS.flatMap((w, i) => w[2].map((t, j) => `w${i}-${j}`));
  const draw = () => {
    const n = all.filter(k => done[k]).length;
    b.innerHTML = `
      <div class="card ur-model"><small>YENİ İŞ MODELİMİZ</small><h2>Usta ve işçilik satmıyoruz. Standartlaştırılmış yenileme çözümleri satıyoruz.</h2>
        <p class="muted">Müşterinin satın aldığı şey; fiyatı, kapsamı, süreci, kalitesi ve teslim koşulları önceden tanımlanmış bir ürün.</p></div>
      <div class="card"><h3>${gicon('layers')}Yeniden yapılanmanın altı aşaması</h3>
        <div class="ur-phases">${PHASES.map(([no, t, w, d], i) => `<div class="ur-ph ${i === 0 ? 'on' : ''}"><b>${no}</b><div><h4>${t} ${i === 0 ? '<span class="pill pill-ok">Aktif aşama</span>' : ''}</h4><small>${w}</small><p>${d}</p></div></div>`).join('')}</div>
        <p class="muted small">İlk aşama tamamlanmadan geniş çaplı pazarlamaya veya yeni ekiplerle büyümeye geçilmez.</p></div>
      <div class="card"><div class="row-between"><h3>${gicon('check')}İlk 30 günün iş programı</h3><b>${n} / ${all.length} · %${Math.round(n / all.length * 100)}</b></div>
        <div class="ur-bar"><i style="width:${n / all.length * 100}%"></i></div>
        ${WEEKS.map(([t, d, ts], i) => `<div class="ur-week"><h4>${t} <small class="muted">${d}</small></h4>${ts.map((x, j) => `<label class="check"><input type="checkbox" data-t="w${i}-${j}" ${done[`w${i}-${j}`] ? 'checked' : ''}> ${esc(x)}</label>`).join('')}</div>`).join('')}
        <button class="btn btn-ghost btn-sm" data-copy>${icon('copy')}Listeyi kopyala</button></div>
      <div class="grid-2"><div class="card"><h3>${gicon('star')}Ürün durumları</h3>
        <div class="mtable">${U.products.filter(p => p.level === 'B').map(p => { const r = readiness(p, U); return `<div><span><a href="#/urunler/p/${esc(p.code)}">${esc(p.code)} ${esc(p.name)}</a></span><b>${r.n}/8 · ${statusOf(p.status).t}${p.status === 'pilot' ? ` · ${p.pilots || 0}/2 pilot` : ''}</b></div>`; }).join('')}</div></div>
        <div class="card"><h3>${gicon('award')}Pilot kabul göstergeleri</h3><div class="mtable">${PILOT_KPI.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('')}</div>
          <p class="muted small">Bir ürün en az iki farklı gerçek uygulamada test edilip teknik ve maliyet açısından kabul edilmeden satışa açılmaz.</p></div></div>
      <div class="card ur-quote"><p>“Aynı nitelikteki bir tadilat talebi yarın farklı bir ekip tarafından alındığında, aynı teknik standarda, benzer maliyete ve aynı müşteri deneyimine ulaşabiliyor muyuz?”</p></div>`;
  };
  draw();
  b.onchange = e => { const k = e.target.dataset.t; if (!k) return; if (e.target.checked) done[k] = today(); else delete done[k]; persist(); draw(); };
  b.onclick = async e => {
    if (!e.target.closest('[data-copy]')) return;
    const txt = WEEKS.map(([t, d, ts], i) => `${t} (${d})\n${ts.map((x, j) => `${done[`w${i}-${j}`] ? '☑' : '☐'} ${x}`).join('\n')}`).join('\n\n');
    try { await navigator.clipboard.writeText(txt); toast('Liste kopyalandı'); } catch { toast('Kopyalanamadı', 'err'); }
  };
}

/* ── ürün kataloğu ── */
function katalogTab(b, U, persist) {
  const card = p => { const r = readiness(p, U); return `<a class="card ur-pc" href="#/urunler/p/${esc(p.code)}">
    <div class="row-between"><b class="ur-code">${esc(p.code)}</b>${pill(p.status)}</div><h4>${esc(p.name)}</h4>
    <small class="muted">${esc(catOf(p.cat).t)} · ${esc(p.unit)} · ${esc(p.ver)}</small>
    <div class="ur-dots" title="${r.n}/8 bileşen">${COMPONENTS.map(([k, t]) => `<i class="${r.r[k] ? 'ok' : ''}" title="${t}"></i>`).join('')}<span>${r.n}/8</span></div></a>`; };
  const A = U.products.filter(p => p.level === 'A'), B = U.products.filter(p => p.level === 'B');
  b.innerHTML = `
    <div class="card"><div class="row-between"><h3>${gicon('box')}Seviye B — Birleşik yenileme paketleri</h3><button class="btn btn-primary btn-sm" data-add="B">${icon('plus')}Ürün ekle</button></div>
      <div class="ur-grid">${B.map(card).join('')}</div></div>
    <div class="card"><div class="row-between"><h3>${gicon('list')}Seviye A — Tekil uygulama ürünleri</h3><button class="btn btn-ghost btn-sm" data-add="A">${icon('plus')}Ürün ekle</button></div>
      <div class="ur-grid">${A.map(card).join('')}</div></div>
    <div class="card"><h3>${gicon('star')}Seviye C — Paket seçenekleri</h3><div class="ur-pks">${PKS.map(k => `<div><b>${k.t}</b><p class="muted small">${k.d}</p></div>`).join('')}</div>
      <p class="muted small">Essential düşük kalite anlamına gelmez: elektrik güvenliği, tesisat güvenilirliği, su yalıtımı, mevzuat uyumu ve işçilik kabul kriterleri üç pakette de aynıdır. Değişen; kaplama kalitesi, vitrifiye tasarımı, armatür serisi, özel işçilik ve estetik seçeneklerdir.</p></div>
    <div class="card"><h3>${gicon('clipboard')}Standart ürünün sekiz bileşeni</h3><div class="ur-comp">${COMPONENTS.map(([k, t, d], i) => `<div><b>${String(i + 1).padStart(2, '0')}</b><span>${t}<small>${d}</small></span></div>`).join('')}</div>
      <p class="muted small">Bir hizmet bu sekiz bileşen tamamlanmadan standart ürün olarak satışa açılmaz.</p></div>`;
  b.onclick = async e => {
    const a = e.target.closest('[data-add]'); if (!a) return;
    const r = await modal({ title: 'Yeni ürün', body: `<div class="grid2"><label>Ürün kodu<input class="inp" id="nc" placeholder="TB-XX-01"></label><label>Ürün adı<input class="inp" id="nn"></label></div>
      <label>Kategori<select class="inp" id="nk">${CATEGORIES.map(c => opt(c.k, '', c.t)).join('')}</select></label>`,
      actions: [{ k: 'no', t: 'Vazgeç' }, { k: 'ok', t: 'Oluştur', cls: 'btn-primary' }] });
    if (r?.k !== 'ok') return;
    const code = $('#nc', r.el).value.trim().toUpperCase(), name = $('#nn', r.el).value.trim();
    if (!code || !name) return toast('Kod ve ad gerekli', 'err');
    if (U.products.some(p => p.code === code)) return toast('Bu kod zaten var', 'err');
    U.products.push({ code, name, level: a.dataset.add, cat: $('#nk', r.el).value, unit: a.dataset.add === 'A' ? 'm²' : 'götürü', base: a.dataset.add === 'A' ? 'floor' : 'unit', status: 'taslak', ver: 'V1.0', def: '', incl: [], excl: [], tech: '', metraj: '', recipe: [], prog: [], qc: [], subs: [], pk: a.dataset.add === 'B' ? { ess: '', cmf: '', sig: '' } : {}, pilots: 0 });
    persist(); location.hash = `#/urunler/p/${encodeURIComponent(code)}`;
  };
}

/* ── malzeme ve tedarikçi kütüphanesi ── */
function malzemeTab(b, U, persist) {
  const stale = m => !m.upd || (Date.now() - new Date(m.upd).getTime()) / 864e5 > (+U.cfg.staleDays || 45);
  const draw = () => {
    const L = U.materials;
    b.innerHTML = `<div class="card"><div class="row-between"><h3>${gicon('layers')}Onaylı malzeme kütüphanesi <small class="muted">${L.length}</small></h3>
      <div class="row"><label class="mini-l">Fiyat geçerliliği <input class="inp sm" type="number" data-cfg="staleDays" value="${U.cfg.staleDays}" style="width:70px"> gün</label><button class="btn btn-primary btn-sm" data-madd>${icon('plus')}Malzeme ekle</button></div></div>
      <p class="muted small">Her satın alma fiyatının tedarikçisi, son güncellenme tarihi ve geçerlilik durumu tutulur. Fiyatı tarihsiz ya da geçerlilik süresini aşmış malzemeyle hesaplanan teklif otomatik onaylanmaz. Kritik malzeme gruplarında en az iki tedarikçi (A: ilk tercih, B: onaylı alternatif) hedeflenir.</p>
      <div class="ur-mlist">${L.map((m, i) => `<div class="ur-m ${stale(m) ? 'stale' : ''}" data-i="${i}">
        <div class="ur-mh"><b>${esc(m.code)}</b><input class="inp sm" data-f="name" value="${esc(m.name)}"><select class="inp sm" data-f="level">${[['all', 'Tüm paketler'], ...PKS.map(p => [p.k, p.t])].map(([k, t]) => opt(k, m.level, t)).join('')}</select><button class="icon-btn sm danger" data-mdel title="Sil">${icon('trash')}</button></div>
        <div class="ur-mg">
          <label>Kategori<input class="inp sm" data-f="cat" value="${esc(m.cat)}"></label><label>Kullanım alanı<input class="inp sm" data-f="use" value="${esc(m.use)}"></label>
          <label>Marka / seri<input class="inp sm" data-f="brand" value="${esc(m.brand)}"></label><label>Ebat<input class="inp sm" data-f="size" value="${esc(m.size)}"></label>
          <label>Birim<input class="inp sm" data-f="unit" value="${esc(m.unit)}"></label><label>Alış fiyatı (₺)<input class="inp sm" type="number" data-f="price" value="${m.price || ''}"></label>
          <label>Fire %<input class="inp sm" type="number" data-f="fire" value="${m.fire || 0}"></label><label>Tedarik süresi (gün)<input class="inp sm" type="number" data-f="lead" value="${m.lead || ''}"></label>
          <label>Tedarikçi A<input class="inp sm" data-f="supA" value="${esc(m.supA)}"></label><label>Tedarikçi B<input class="inp sm" data-f="supB" value="${esc(m.supB)}"></label>
          <label>Alternatif ürün<input class="inp sm" data-f="alt" value="${esc(m.alt)}"></label><label>Son güncelleme<input class="inp sm" type="date" data-f="upd" value="${esc(m.upd)}"></label></div>
        <div class="ur-mf"><span class="${stale(m) ? 'ur-warn' : 'ur-ok'}">${!m.price ? 'Fiyat girilmemiş' : stale(m) ? (m.upd ? 'Fiyat süresi dolmuş — tedarikçiden teyit alın' : 'Tahmini fiyat — tedarikçi teyidi gerekli') : 'Fiyat geçerli'}</span><button class="btn btn-xs btn-ghost" data-today>Fiyatı bugün teyit ettim</button></div>
      </div>`).join('')}</div></div>`;
  };
  draw();
  b.onchange = e => {
    const t = e.target;
    if (t.dataset.cfg) { U.cfg[t.dataset.cfg] = +t.value || 0; persist(); return draw(); }
    const i = t.closest('[data-i]')?.dataset.i, k = t.dataset.f; if (i == null || !k) return;
    const m = U.materials[+i]; m[k] = t.type === 'number' ? +t.value || 0 : t.value;
    if (k === 'price') m.upd = today();   // fiyat değişince tarih güncellenir
    persist(); draw();
  };
  b.onclick = async e => {
    const i = e.target.closest('[data-i]')?.dataset.i;
    if (e.target.closest('[data-madd]')) {
      const n = U.materials.length + 1, code = `ML-YN-${String(n).padStart(3, '0')}`;
      U.materials.unshift({ code, name: 'Yeni malzeme', cat: '', use: '', level: 'all', unit: 'm²', price: 0, fire: 0, size: '', brand: '', alt: '', supA: '', supB: '', lead: 0, upd: '' });
      persist(); return draw();
    }
    if (i == null) return;
    const m = U.materials[+i];
    if (e.target.closest('[data-today]')) { m.upd = today(); persist(); draw(); toast(`${m.code} fiyatı teyit edildi`); }
    if (e.target.closest('[data-mdel]') && await confirmDlg(`${m.code} silinsin mi? Reçetelerde kullanılıyorsa hesap uyarı verir.`)) { U.materials.splice(+i, 1); persist(); draw(); }
  };
}

/* ── maliyet simülatörü ── */
function simTab(b, U) {
  const s = { mat: 50000, lab: 25000, oth: 5000, risk: 5, margin: 30 };
  const draw = () => {
    const d = s.mat + s.lab + s.oth, r = simPrice(d, s.risk, s.margin);
    $('.ur-simr', b).innerHTML = `<div><span>Doğrudan maliyet</span><b>${fmtMoney(d)}</b></div><div><span>Risk karşılığı (%${s.risk})</span><b>${fmtMoney(r.risk)}</b></div><div><span>Toplam maliyet</span><b>${fmtMoney(r.cost)}</b></div><div class="big"><span>Hedef satış fiyatı</span><b>${fmtMoney(r.price)}</b></div><div><span>Brüt kâr tutarı</span><b>${fmtMoney(r.gross)}</b></div>`;
    $('#smv', b).textContent = `%${s.margin}`;
  };
  b.innerHTML = `<div class="card ur-sim"><h3>${gicon('sparkle')}Ürün maliyet simülatörü</h3>
    <div class="grid2"><label>Malzeme gideri (₺)<input class="inp" type="number" data-s="mat" value="${s.mat}"></label><label>İşçilik gideri (₺)<input class="inp" type="number" data-s="lab" value="${s.lab}"></label>
    <label>Diğer doğrudan giderler (₺)<input class="inp" type="number" data-s="oth" value="${s.oth}"></label><label>Risk karşılığı (%)<input class="inp" type="number" data-s="risk" value="${s.risk}"></label></div>
    <label>Hedef brüt kâr marjı <b id="smv"></b><input type="range" min="0" max="60" step="1" data-s="margin" value="${s.margin}"></label>
    <div class="mtable ur-simr"></div>
    <p class="ur-formula">Satış fiyatı = (Doğrudan maliyet + Risk karşılığı) ÷ (1 − Hedef brüt marj)</p>
    <p class="muted small">KDV hariç temsili değerler. Brüt kâr; genel yönetim, finansman giderleri ve vergiler sonrası net kâr değildir. Risk karşılığı gerçekleşmeyen gider olarak ayrıca izlenmelidir. Varsayılan risk %${U.cfg.risk}, hedef marj %${U.cfg.margin} (ürün kataloğu hesaplarında kullanılır; ürün dosyasından değiştirilebilir).</p></div>`;
  b.oninput = e => { const k = e.target.dataset.s; if (!k) return; s[k] = +e.target.value || 0; draw(); };
  draw();
}

/* ═════════ ürün dosyası düzenleyici ═════════ */
function productEditor(root, ctx, p, persist) {
  const U = U_(ctx.settings);
  if (!p) { root.innerHTML = `<div class="empty card"><h3>Ürün bulunamadı</h3><a class="btn" href="#/urunler/katalog">Kataloğa dön</a></div>`; return; }
  const ex = { floor: 5, wall: 22, ceil: 5, tile: 27, wallceil: 27, perim: 9, plumb: 5, elec: 4, unit: 1 };   // örnek: 5 m² zemin, 22 m² duvar
  const draw = () => {
    const r = readiness(p, U), sell = canSell(p, U), pkKeys = p.pk && Object.keys(p.pk).length ? PKS.map(x => x.k) : ['ess'];
    const exCalc = pkKeys.map(k => [k, calcSel({ pk: k, surf: 'A' }, p, U, ex)]);
    root.innerHTML = `<header class="page-head ur-head"><a href="#/urunler/katalog" class="muted small">${icon('back')} Ürün kataloğu</a>
      <div class="row-between"><h1>${esc(p.code)} — ${esc(p.name)}</h1><div class="row">${pill(p.status)}<button class="btn btn-ghost btn-sm" data-pdf>${icon('print')}Ürün dosyası (PDF)</button></div></div></header>
      <div class="grid-2">
        <div class="card"><h3>${gicon('clipboard')}Hazırlık <small class="muted">${r.n}/8 bileşen</small></h3>
          <div class="ur-comp sm">${COMPONENTS.map(([k, t, d]) => `<div class="${r.r[k] ? 'ok' : ''}"><b>${r.r[k] ? '✓' : '·'}</b><span>${t}<small>${d}</small></span></div>`).join('')}</div>
          <div class="grid2"><label>Durum<select class="inp sm" data-p="status">${STATUS.map(s => `<option value="${s.k}" ${p.status === s.k ? 'selected' : ''} ${s.k === 'satista' && !sell ? 'disabled' : ''}>${s.t}${s.k === 'satista' && !sell ? ' (koşullar sağlanmadı)' : ''}</option>`).join('')}</select></label>
            <label>Tamamlanan pilot uygulama<input class="inp sm" type="number" min="0" data-p="pilots" value="${p.pilots || 0}"></label>
            <label>Sürüm<input class="inp sm" data-p="ver" value="${esc(p.ver)}"></label><label>Onaylayan / tarih<input class="inp sm" data-p="appr" value="${esc(p.appr || '')}" placeholder="Ad · gg.aa.yyyy"></label></div>
          <p class="muted small">Satışa açılma: 8/8 bileşen + en az iki gerçek pilot uygulama + teknik onay. Sözleşmesi yapılmış projelerin kapsamı yeni sürüm yayımlandı diye değişmez.</p></div>
        <div class="card"><h3>${gicon('home')}Tanım</h3>
          <div class="grid2"><label>Ürün adı<input class="inp sm" data-p="name" value="${esc(p.name)}"></label><label>Kategori<select class="inp sm" data-p="cat">${CATEGORIES.map(c => opt(c.k, p.cat, c.t)).join('')}</select></label>
            <label>Satış birimi<input class="inp sm" data-p="unit" value="${esc(p.unit)}"></label><label>Ana ölçü (teklif miktarı)<select class="inp sm" data-p="base">${BASES.map(x => opt(x.k, p.base, `${x.t} (${x.u})`)).join('')}</select></label></div>
          <label>Müşteri ne satın alıyor?<textarea class="inp" rows="4" data-p="def">${esc(p.def)}</textarea></label>
          ${p.level === 'B' ? `<label>Alt ürünler (kodlar, virgülle)<input class="inp sm" data-p="subs" value="${esc((p.subs || []).join(', '))}"></label>` : ''}</div>
      </div>
      <div class="grid-2">
        <div class="card"><h3>${gicon('check')}Kapsam — dahil olan işler</h3><textarea class="inp" rows="9" data-p="incl" placeholder="Her satıra bir iş">${esc(lines(p.incl))}</textarea></div>
        <div class="card"><h3>${gicon('x')}Standart paket dışında kalan işler</h3><textarea class="inp" rows="9" data-p="excl" placeholder="Her satıra bir istisna">${esc(lines(p.excl))}</textarea><p class="muted small">Bu işler gerektiğinde ayrı değişiklik teklifiyle fiyatlandırılır.</p></div>
      </div>
      <div class="grid-2">
        <div class="card"><h3>${gicon('shield')}Teknik reçete / şartname</h3><textarea class="inp" rows="7" data-p="tech">${esc(p.tech)}</textarea></div>
        <div class="card"><h3>${gicon('ruler')}Metraj kuralı</h3><textarea class="inp" rows="4" data-p="metraj">${esc(p.metraj)}</textarea>
          ${p.level === 'B' ? `<h4>Paket farkları</h4>${PKS.map(k => `<label>${k.t}<input class="inp sm" data-pk="${k.k}" value="${esc(p.pk?.[k.k] || '')}"></label>`).join('')}` : ''}</div>
      </div>
      <div class="card"><div class="row-between"><h3>${gicon('list')}Maliyet reçetesi <small class="muted">miktar = taban ölçü × katsayı</small></h3><button class="btn btn-ghost btn-sm" data-ladd>${icon('plus')}Kalem ekle</button></div>
        <div class="ur-rec"><div class="ur-rh"><span>Tür</span><span>Kalem</span><span>Taban</span><span>Katsayı</span><span>Malzeme (paket) / birim fiyat</span><span>Fire %</span><span></span></div>
        ${p.recipe.map((l, i) => `<div class="ur-rl" data-l="${i}">
          <select class="inp sm" data-lf="k">${LINE_KINDS.map(([k, t]) => opt(k, l.k, t)).join('')}</select>
          <input class="inp sm" data-lf="d" value="${esc(l.d)}">
          <select class="inp sm" data-lf="base">${BASES.map(x => opt(x.k, l.base, x.t)).join('')}</select>
          <input class="inp sm" type="number" step="0.05" data-lf="f" value="${l.f ?? 1}">
          <div class="ur-rp">${l.k === 'mat' ? pkKeys.map(k => `<select class="inp sm" data-lm="${k}" title="${pkOf(k).t}"><option value="">${pkKeys.length > 1 ? pkOf(k).s + ': —' : '—'}</option>${U.materials.map(m => opt(m.code, l.m?.[k] || '', `${pkKeys.length > 1 ? pkOf(k).s + ': ' : ''}${m.code} ${m.name}`)).join('')}</select>`).join('')
            : `<div class="inp-unit sm"><input type="number" data-lf="p" value="${l.p || ''}"><span>₺/${esc(l.u || baseOf(l.base).u)}</span></div>`}
            ${l.cls ? `<small class="ur-cls">Yüzey sınıfı ${l.cls}</small>` : ''}</div>
          <input class="inp sm" type="number" data-lf="fire" value="${l.fire ?? ''}" placeholder="—">
          <button class="icon-btn sm danger" data-ldel title="Sil">${icon('trash')}</button></div>`).join('')}</div>
        <h4>Örnek hesap <small class="muted">${p.level === 'B' && p.cat === 'banyo' ? '5 m² zemin, 22 m² duvar' : '5 m² zemin, 22 m² duvar, 5 m² tavan'} · risk %${U.cfg.risk} · marj %${U.cfg.margin}</small></h4>
        <div class="ur-ex">${exCalc.map(([k, c]) => `<div><b>${pkKeys.length > 1 ? pkOf(k).t : 'Standart'}</b><span>Malzeme ${fmtMoney(c.mat)} · İşçilik ${fmtMoney(c.lab + c.sub)} · Diğer ${fmtMoney(c.oth)}</span><span>Maliyet ${fmtMoney(c.direct + c.risk)}</span><b class="ur-price">${fmtMoney(c.price)}</b></div>`).join('')}</div>
        ${exCalc[0][1].warn.length ? `<p class="ur-warn small">${exCalc[0][1].warn.length} fiyat uyarısı: ${esc(exCalc[0][1].warn.slice(0, 3).join(' · '))}${exCalc[0][1].warn.length > 3 ? '…' : ''}</p>` : ''}</div>
      <div class="grid-2">
        <div class="card"><div class="row-between"><h3>${gicon('calendar')}İş programı şablonu</h3><button class="btn btn-ghost btn-xs" data-gadd>${icon('plus')}Adım</button></div>
          ${(p.prog || []).map((g, i) => `<div class="ur-row" data-g="${i}"><span>${i + 1}</span><input class="inp sm" data-gf="t" value="${esc(g.t)}"><div class="inp-unit sm"><input type="number" step="0.5" data-gf="d" value="${g.d}"><span>gün</span></div><button class="icon-btn sm danger" data-gdel>${icon('x')}</button></div>`).join('')}
          <p class="muted small">Toplam ${fmtNum((p.prog || []).reduce((s, g) => s + (+g.d || 0), 0), 1)} iş günü (kesin süre teknik keşif ve iş programından sonra).</p></div>
        <div class="card"><div class="row-between"><h3>${gicon('award')}Kalite kontrol noktaları</h3><button class="btn btn-ghost btn-xs" data-qadd>${icon('plus')}Kontrol</button></div>
          ${(p.qc || []).map((q, i) => `<div class="ur-row q" data-q="${i}"><b>${esc(q.k)}</b><input class="inp sm" data-qf="t" value="${esc(q.t)}"><input class="inp sm" data-qf="d" value="${esc(q.d)}"><button class="icon-btn sm danger" data-qdel>${icon('x')}</button></div>`).join('')}
          <p class="muted small">Her kontrolün sorumlusu, tarihi, fotoğrafı ve onay durumu işte kaydedilir; üzeri kapanacak imalat onaysız sonraki aşamaya geçemez.</p></div>
      </div>`;
  };
  draw();
  root.onchange = e => {
    const t = e.target, v = t.type === 'number' ? +t.value || 0 : t.value;
    if (t.dataset.p) {
      const k = t.dataset.p;
      if (k === 'incl' || k === 'excl') p[k] = unlines(v);
      else if (k === 'subs') p.subs = String(v).split(',').map(x => x.trim()).filter(Boolean);
      else if (k === 'status' && v === 'satista' && !canSell(p, U)) { toast('Satışa açmak için 8/8 bileşen ve en az iki pilot gerekli', 'err'); }
      else p[k] = v;
    } else if (t.dataset.pk) { (p.pk ||= {})[t.dataset.pk] = v; }
    else if (t.dataset.lf || t.dataset.lm) {
      const l = p.recipe[+t.closest('[data-l]').dataset.l];
      if (t.dataset.lm) { (l.m ||= {})[t.dataset.lm] = v; if (!v) delete l.m[t.dataset.lm]; }
      else if (t.dataset.lf === 'fire') { if (t.value === '') delete l.fire; else l.fire = +t.value; }
      else l[t.dataset.lf] = v;
      if (t.dataset.lf === 'k' && v === 'mat') { delete l.p; l.m ||= {}; }
    } else if (t.dataset.gf) p.prog[+t.closest('[data-g]').dataset.g][t.dataset.gf] = v;
    else if (t.dataset.qf) p.qc[+t.closest('[data-q]').dataset.q][t.dataset.qf] = v;
    else return;
    persist(); const y = scrollY; draw(); scrollTo(0, y);
  };
  root.onclick = e => {
    const c = s => e.target.closest(s); let ch = true;
    if (c('[data-ladd]')) p.recipe.push({ id: uid('rl'), k: 'lab', d: 'Yeni kalem', base: p.base || 'unit', f: 1, p: 0 });
    else if (c('[data-ldel]')) p.recipe.splice(+c('[data-l]').dataset.l, 1);
    else if (c('[data-gadd]')) (p.prog ||= []).push({ t: 'Yeni adım', d: 1 });
    else if (c('[data-gdel]')) p.prog.splice(+c('[data-g]').dataset.g, 1);
    else if (c('[data-qadd]')) (p.qc ||= []).push({ k: `K${(p.qc?.length || 0) + 1}`, t: 'Yeni kontrol', d: '' });
    else if (c('[data-qdel]')) p.qc.splice(+c('[data-q]').dataset.q, 1);
    else if (c('[data-pdf]')) { ch = false; ctx.printDoc(productDoc(p, U, ctx), `${p.code} ${p.ver} ürün dosyası`); }
    else ch = false;
    if (ch) { persist(); const y = scrollY; draw(); scrollTo(0, y); }
  };
}

/* ürün dosyası belgesi: PR-01 tanım · PR-02 kapsam / istisna · PR-03 teknik şartname · PR-05 malzeme · PR-06 maliyet · PR-07 iş programı · PR-09 kalite formu */
function productDoc(p, U, ctx) {
  const pkKeys = p.pk && Object.keys(p.pk).length ? PKS.map(x => x.k) : ['ess'];
  const ex = { floor: 5, wall: 22, ceil: 5, tile: 27, wallceil: 27, perim: 9, plumb: 5, elec: 4, unit: 1 }, c = calcSel({ pk: 'ess', surf: 'A' }, p, U, ex);
  const lib = U.materials, mats = [...new Set(p.recipe.filter(l => l.k === 'mat').flatMap(l => Object.values(l.m || {})))].map(code => lib.find(m => m.code === code)).filter(Boolean);
  return `<div class="pdoc">${ctx.docHeader(ctx.settings, 'Ürün Dosyası', `<div class="p-meta"><span>Ürün kodu <b>${esc(p.code)}</b></span><span>Sürüm <b>${esc(p.ver)}</b></span><span>Durum <b>${statusOf(p.status).t}</b></span></div>`)}
    <section><h3>PR-01 · ${esc(p.name)}</h3><p>${esc(p.def).replace(/\n/g, '<br>')}</p>${p.subs?.length ? `<p class="small"><b>Alt ürünler:</b> ${esc(p.subs.join(', '))}</p>` : ''}</section>
    ${p.level === 'B' && Object.values(p.pk || {}).some(Boolean) ? `<section><h3>Paket seçenekleri</h3><table class="p-table sm"><tbody>${PKS.map(k => `<tr><td><b>${k.t}</b><br><small>${productCode(p, k.k)}</small></td><td>${esc(p.pk[k.k] || '')}</td></tr>`).join('')}</tbody></table></section>` : ''}
    <section class="grid-2 p-two"><div><h3>PR-02 · Dahil olan işler</h3><ul class="p-list">${(p.incl || []).map(x => `<li>${esc(x)}</li>`).join('')}</ul></div><div><h3>Kapsam dışı</h3><ul class="p-list">${(p.excl || []).map(x => `<li>${esc(x)}</li>`).join('')}</ul></div></section>
    <section><h3>PR-03 · Teknik şartname</h3><p>${esc(p.tech).replace(/\n/g, '<br>')}</p><p class="small"><b>Metraj kuralı:</b> ${esc(p.metraj)}</p></section>
    ${mats.length ? `<section><h3>PR-05 · Malzeme reçetesi</h3><table class="p-table sm"><thead><tr><th>Kod</th><th>Malzeme</th><th>Paket</th><th>Birim</th><th class="r">Fire</th><th>Tedarikçi</th></tr></thead><tbody>${mats.map(m => `<tr><td>${esc(m.code)}</td><td>${esc(m.name)}${m.size ? ` <small>${esc(m.size)}</small>` : ''}</td><td>${m.level === 'all' ? 'Tümü' : pkOf(m.level).t}</td><td>${esc(m.unit)}</td><td class="r">%${m.fire || 0}</td><td>${esc([m.supA, m.supB].filter(Boolean).join(' / ') || '—')}</td></tr>`).join('')}</tbody></table></section>` : ''}
    <section><h3>PR-06 · Birim maliyet reçetesi <small>(örnek: 5 m² zemin, 22 m² duvar · Essential)</small></h3><table class="p-table sm"><thead><tr><th>Kalem</th><th class="r">Miktar</th><th class="r">Birim</th><th class="r">Tutar</th></tr></thead><tbody>
      ${c.rows.map(r => `<tr><td>${esc(r.name)}</td><td class="r">${fmtNum(r.qty, 2)} ${esc(r.u)}</td><td class="r">${fmtMoney(r.unit)}</td><td class="r">${fmtMoney(r.cost)}</td></tr>`).join('')}
      <tr class="grp"><td colspan="3">Doğrudan maliyet</td><td class="r">${fmtMoney(c.direct)}</td></tr><tr><td colspan="3">Risk karşılığı (%${U.cfg.risk})</td><td class="r">${fmtMoney(c.risk)}</td></tr>
      <tr class="grp"><td colspan="3">Hedef satış fiyatı (marj %${U.cfg.margin}, KDV hariç)</td><td class="r">${fmtMoney(c.price)}</td></tr></tbody></table></section>
    <section class="grid-2 p-two"><div><h3>PR-07 · İş programı</h3><ol class="p-list">${(p.prog || []).map(g => `<li>${esc(g.t)} — ${fmtNum(g.d, 1)} gün</li>`).join('')}</ol></div>
      <div><h3>PR-09 · Kalite kontrol</h3><ul class="p-list">${(p.qc || []).map(q => `<li><b>${esc(q.k)}</b> ${esc(q.t)} — ${esc(q.d)}</li>`).join('')}</ul></div></section>
    ${ctx.docFooter()}</div>`;
}

/* ═════════ işteki "Ürün" sekmesi ═════════ */
export function renderUrunTab(tb, j, ctx) {
  const st = ctx.settings; if (ensureUrun(st)) ctx.saveSettings();
  const U = U_(st); j.urun ||= { cls: 'A', sel: [], qc: {}, co: [] };
  const W = j.urun, met = ctx.jobMetrics(j), fx = { plumb: met.plumb || 0, elec: met.elec || 0 };
  const prodOf = s => U.products.find(p => p.code === s.code);
  const qOf = s => ({ ...quantities(met, s.rooms, fx), ...Object.fromEntries(Object.entries(s.q || {}).filter(([, v]) => v !== '' && v != null).map(([k, v]) => [k, +v])) });
  const autoRooms = p => { const kw = { banyo: /banyo|wc|duş|lavabo/i, mutfak: /mutfak/i }[p.cat]; return kw ? met.rooms.filter(r => kw.test(r.name)).map(r => r.id) : []; };
  const draw = () => {
    const cls = W.cls, blocked = cls === 'C';
    const calcs = W.sel.map(s => { const p = prodOf(s); return p ? { s, p, q: qOf(s), c: calcSel(s, p, U, qOf(s)) } : null; }).filter(Boolean);
    const tot = calcs.reduce((a, x) => a + (x.s.surf === 'C' ? 0 : x.c.price), 0), warns = calcs.flatMap(x => x.c.warn);
    const selCard = ({ s, p, q, c }) => {
      const pkKeys = p.pk && Object.keys(p.pk).length ? PKS : null, rd = readiness(p, U);
      const shown = BASES.filter(b => b.k !== 'unit' && (p.recipe.some(l => l.base === b.k) || p.base === b.k));
      return `<section class="card ur-sel" data-s="${s.id}">
        <div class="row-between"><div><b class="ur-code">${esc(productCode(p, s.pk))}</b> ${pill(p.status)}<h4>${esc(p.name)}</h4></div><button class="icon-btn sm danger" data-sdel title="Kaldır">${icon('trash')}</button></div>
        ${p.status === 'taslak' || rd.n < 8 ? `<p class="ur-warn small">Ürün dosyası ${rd.n}/8 bileşen — ${p.status === 'taslak' ? 'taslak ürün, standart satışa açık değil' : 'eksik bileşenler var'}.</p>` : ''}
        ${pkKeys ? `<div class="chips">${pkKeys.map(k => `<button class="chip ${s.pk === k.k ? 'on' : ''}" data-pk="${k.k}" title="${esc(p.pk[k.k] || k.d)}">${k.t}</button>`).join('')}</div>${p.pk[s.pk] ? `<p class="muted small">${esc(p.pk[s.pk])}</p>` : ''}` : ''}
        ${p.surf || p.recipe.some(l => l.cls) ? `<label class="lbl-s">Yüzey sınıfı</label><div class="chips">${SURFACE_CLASS.map(x => `<button class="chip ${s.surf === x.k ? 'on' : ''}" data-surf="${x.k}" title="${esc(x.d)}">${x.k} · ${x.t}</button>`).join('')}</div>${s.surf === 'C' ? `<p class="ur-warn small">C sınıfı yüzey: önce tespit ve özel teklif — bu ürün standart fiyatla teklife aktarılmaz.</p>` : ''}` : ''}
        ${met.rooms.length ? `<label class="lbl-s">Mahaller <small class="muted">(seçilmezse tümü)</small></label><div class="chips">${met.rooms.map(r => `<button class="chip sm ${s.rooms?.includes(r.id) ? 'on' : ''}" data-room="${r.id}">${esc(r.name)}</button>`).join('')}</div>` : '<p class="muted small">Plan / keşif ölçüsü yok — metrajı elle girin.</p>'}
        <div class="ur-q">${shown.map(b => `<label>${b.t}<div class="inp-unit sm"><input type="number" step="0.1" data-q="${b.k}" value="${s.q?.[b.k] ?? ''}" placeholder="${fmtNum(q[b.k], 2)}"><span>${b.u}</span></div></label>`).join('')}</div>
        <details class="ur-det"><summary>Maliyet dökümü · ${c.rows.length} kalem</summary><table class="ur-t"><tbody>${c.rows.map(r => `<tr><td>${esc(r.name)}</td><td class="r">${fmtNum(r.qty, 2)} ${esc(r.u)}${r.fire ? ` <small>+%${r.fire}</small>` : ''}</td><td class="r">${fmtMoney(r.unit)}</td><td class="r">${fmtMoney(r.cost)}</td></tr>`).join('')}</tbody></table></details>
        <div class="mtable ur-sum"><div><span>Malzeme</span><b>${fmtMoney(c.mat)}</b></div><div><span>İşçilik + taşeron</span><b>${fmtMoney(c.lab + c.sub)}</b></div><div><span>Diğer doğrudan</span><b>${fmtMoney(c.oth)}</b></div>
          <div><span>Risk karşılığı (%${U.cfg.risk})</span><b>${fmtMoney(c.risk)}</b></div><div><span>Toplam maliyet</span><b>${fmtMoney(c.direct + c.risk)}</b></div>
          <div class="big"><span>Satış fiyatı (marj %${Math.round(c.margin * 100)}, KDV hariç)</span><b>${s.surf === 'C' ? 'Özel teklif' : fmtMoney(c.price)}</b></div><div><span>Tahmini süre</span><b>${fmtNum(c.days, 1)} iş günü</b></div></div>
      </section>`;
    };
    const qcBlock = ({ s, p }) => {
      const R = (W.qc[s.id] ||= {});
      return `<div class="ur-qc" data-s="${s.id}"><h4>${esc(productCode(p, s.pk))} — ${esc(p.name)}</h4>${(p.qc || []).map((q, i) => {
        const r = R[q.k], prevOk = i === 0 || R[p.qc[i - 1].k]?.ok;
        return `<div class="ur-qr ${r?.ok ? 'ok' : ''}"><b>${esc(q.k)}</b><div><span>${esc(q.t)}</span><small class="muted">${esc(q.d)}</small>${r?.ok ? `<small class="ur-okt">✓ ${esc(r.by || '')} · ${fmtDate(r.date)}${r.ph?.length ? ` · ${r.ph.length} fotoğraf` : ''}${r.note ? ` · ${esc(r.note)}` : ''}</small>` : ''}</div>
          ${r?.ok ? `<button class="btn btn-xs btn-ghost" data-qundo="${q.k}">Geri al</button>` : `<button class="btn btn-xs ${prevOk ? 'btn-primary' : 'btn-ghost'}" data-qok="${q.k}" ${prevOk ? '' : 'disabled title="Önceki kontrol onaylanmadan geçilemez"'}>Onayla</button>`}</div>`;
      }).join('')}</div>`;
    };
    const coTot = W.co.filter(x => x.ok).reduce((a, x) => a + (+x.amt || 0), 0), coOpen = W.co.filter(x => !x.ok && +x.amt);
    tb.innerHTML = `
      <div class="card"><h3>${gicon('box')}Proje sınıfı</h3>
        <div class="ur-cls3">${PROJECT_CLASS.map(x => `<button class="${cls === x.k ? 'on' : ''}" data-cls="${x.k}" style="--c:${x.c}"><b>${x.k}</b><span>${x.t}</span><small>${x.d}</small></button>`).join('')}</div>
        ${blocked ? `<p class="ur-warn">Özel proje: standart paket satışı durduruldu. Teknik inceleme, projelendirme ve özel teklif süreci açılmalı. Ürün sınıflandırması ruhsat ve izin kontrolünün yerini almaz.</p>` : ''}</div>
      <div class="card"><div class="row-between"><h3>${gicon('list')}Seçilen ürünler</h3>
        <div class="row"><select class="inp sm" id="urAdd"><option value="">Ürün ekle…</option>${U.products.map(p => `<option value="${esc(p.code)}">${esc(p.code)} — ${esc(p.name)} (${statusOf(p.status).t})</option>`).join('')}</select></div></div>
        ${calcs.length ? '' : `<p class="muted">Ürün kataloğundan bir ürün seçin (örn. TB-BN Banyo Yenileme). Metraj rölöve planından gelir, maliyet reçeteden hesaplanır.</p>`}</div>
      ${calcs.map(selCard).join('')}
      ${calcs.length ? `<div class="card ur-tot"><div class="row-between"><h3>Toplam (KDV hariç)</h3><b class="ur-price">${fmtMoney(tot)}</b></div>
        ${warns.length ? `<div class="ur-warn"><b>Fiyat onayı gerekli:</b> ${warns.length} kalemde tarihsiz / süresi dolmuş ya da eksik fiyat var. Tedarikçinin güncel fiyatı ve ekip maliyeti bilinmeden fiyat otomatik onaylanmaz.<ul>${[...new Set(warns)].slice(0, 6).map(w => `<li>${esc(w)}</li>`).join('')}</ul></div>
          <label class="check"><input type="checkbox" id="urAck" ${W.ack ? 'checked' : ''}> Fiyatları kontrol ettim, bu teklif için onaylıyorum</label>` : ''}
        <div class="row wrap"><button class="btn btn-primary" data-quote ${blocked ? 'disabled' : ''}>${icon('file')}Teklife aktar</button><a class="btn btn-ghost" href="#/urunler/katalog">${icon('box')}Ürün kataloğu</a></div>
        <p class="muted small">Teklife ürün kodlu satırlar ve her ürünün kapsamı / kapsam dışı işleri eklenir; aynı ürünün eski satırları güncellenir.</p></div>` : ''}
      ${calcs.length ? `<div class="card"><div class="row-between"><h3>${gicon('award')}Kalite kontrol ve teslim</h3><button class="btn btn-ghost btn-sm" data-karne>${icon('print')}Dijital tadilat karnesi</button></div>
        <p class="muted small">Her kontrolün sorumlusu, tarihi, fotoğrafı ve onay durumu kaydedilir. Üzeri kapanacak imalat, önceki kontrol onaylanmadan sonraki aşamaya geçemez.</p>${calcs.map(qcBlock).join('')}</div>` : ''}
      <div class="card"><div class="row-between"><h3>${gicon('edit')}Değişiklik talepleri</h3><button class="btn btn-ghost btn-sm" data-coadd>${icon('plus')}Değişiklik ekle</button></div>
        <p class="muted small">Sözleşme sonrası kapsam ve bedel değişiklikleri; müşteri onayı olmadan ekstra maliyet oluşturulmaz.</p>
        ${W.co.map((x, i) => `<div class="ur-co" data-co="${i}"><input class="inp sm" data-cf="d" value="${esc(x.d)}" placeholder="Değişiklik / kapsam dışı iş"><div class="inp-unit sm"><input type="number" data-cf="amt" value="${x.amt || ''}"><span>₺</span></div><label class="check"><input type="checkbox" data-cf="ok" ${x.ok ? 'checked' : ''}> Müşteri onayladı</label><button class="icon-btn sm danger" data-codel>${icon('x')}</button></div>`).join('')}
        ${W.co.length ? `<div class="mtable"><div><span>Onaylı değişiklik toplamı</span><b>${fmtMoney(coTot)}</b></div>${coOpen.length ? `<div><span class="ur-warn">Onay bekleyen</span><b>${coOpen.length} kalem · ${fmtMoney(coOpen.reduce((a, x) => a + +x.amt, 0))}</b></div>` : ''}</div>` : ''}</div>`;
  };
  const save = () => ctx.save();
  const sOf = el => W.sel.find(s => s.id === el.closest('[data-s]')?.dataset.s);
  tb.onchange = e => {
    const t = e.target;
    if (t.id === 'urAdd' && t.value) {
      const p = U.products.find(x => x.code === t.value);
      W.sel.push({ id: uid('us'), code: p.code, pk: 'ess', surf: 'A', rooms: autoRooms(p), q: {} }); save(); return draw();
    }
    if (t.id === 'urAck') { W.ack = t.checked; return save(); }
    if (t.dataset.q) { const s = sOf(t); (s.q ||= {})[t.dataset.q] = t.value === '' ? '' : +t.value; save(); return draw(); }
    if (t.dataset.cf) { const x = W.co[+t.closest('[data-co]').dataset.co]; x[t.dataset.cf] = t.type === 'checkbox' ? t.checked : t.type === 'number' ? +t.value || 0 : t.value; if (t.dataset.cf === 'ok' && t.checked) x.okAt = Date.now(); save(); return draw(); }
  };
  tb.onclick = async e => {
    const c = s => e.target.closest(s), s = sOf(e.target);
    if (c('[data-cls]')) { W.cls = c('[data-cls]').dataset.cls; ctx.logEvt?.(`Proje sınıfı: ${W.cls} — ${PROJECT_CLASS.find(x => x.k === W.cls).t}`); save(); return draw(); }
    if (c('[data-pk]') && s) { s.pk = c('[data-pk]').dataset.pk; save(); return draw(); }
    if (c('[data-surf]') && s) { s.surf = c('[data-surf]').dataset.surf; save(); return draw(); }
    if (c('[data-room]') && s) { const id = c('[data-room]').dataset.room; s.rooms = s.rooms?.includes(id) ? s.rooms.filter(x => x !== id) : [...(s.rooms || []), id]; save(); return draw(); }
    if (c('[data-sdel]') && s) { if (await confirmDlg('Ürün seçimden kaldırılsın mı? (Kalite kayıtları da silinir)')) { W.sel = W.sel.filter(x => x !== s); delete W.qc[s.id]; save(); draw(); } return; }
    if (c('[data-coadd]')) { W.co.push({ id: uid('co'), d: '', amt: 0, ok: false, t: Date.now() }); save(); return draw(); }
    if (c('[data-codel]')) { W.co.splice(+c('[data-co]').dataset.co, 1); save(); return draw(); }
    if (c('[data-quote]')) return toQuote();
    if (c('[data-karne]')) return ctx.printDoc(await karneDoc(j, U, ctx), `Tadilat karnesi ${j.code}`);
    if (c('[data-qundo]') && s) { delete W.qc[s.id][c('[data-qundo]').dataset.qundo]; save(); return draw(); }
    if (c('[data-qok]') && s) return qcDialog(s, c('[data-qok]').dataset.qok);
  };
  async function qcDialog(s, k) {
    const p = prodOf(s), q = p.qc.find(x => x.k === k), team = ctx.team || [];
    let ph = [];
    const r = await modal({ title: `${k} — ${q.t}`, body: `<p class="muted small">${esc(q.d)}</p>
      <div class="grid2"><label>Sorumlu<input class="inp" id="qby" list="qteam" value="${esc(team[0]?.name || '')}"><datalist id="qteam">${team.map(m => `<option value="${esc(m.name)}">`).join('')}</datalist></label><label>Tarih<input class="inp" type="date" id="qdt" value="${today()}"></label></div>
      <label>Not<textarea class="inp" rows="2" id="qnt" placeholder="Ölçüm, test sonucu, eksikler…"></textarea></label>
      <label class="btn btn-ghost btn-sm">${icon('camera')}Fotoğraf ekle<input type="file" accept="image/*" multiple hidden id="qph"></label><p class="small muted" id="qphn"></p>`,
      actions: [{ k: 'no', t: 'Vazgeç' }, { k: 'ok', t: 'Kontrolü onayla', cls: 'btn-primary', icon: 'check' }],
      onOpen: el => { $('#qph', el).onchange = async ev => { const add = await ctx.addPhotos(ev.target.files, { tag: 'uygulama', caption: `${productCode(p, s.pk)} ${k} ${q.t}` }); ph.push(...add.map(x => x.id)); $('#qphn', el).textContent = `${ph.length} fotoğraf eklendi`; }; } });
    if (r?.k !== 'ok') return;
    W.qc[s.id][k] = { ok: true, by: $('#qby', r.el).value.trim(), date: $('#qdt', r.el).value, note: $('#qnt', r.el).value.trim(), ph, t: Date.now() };
    ctx.logEvt?.(`Kalite kontrol onaylandı: ${productCode(p, s.pk)} ${k} ${q.t}`); save(); draw();
  }
  async function toQuote() {
    const calcs = W.sel.map(s => ({ s, p: prodOf(s) })).filter(x => x.p && x.s.surf !== 'C');
    if (!calcs.length) return toast('Teklife aktarılacak ürün yok', 'err');
    const warns = calcs.flatMap(({ s, p }) => calcSel(s, p, U, qOf(s)).warn);
    if (warns.length && !W.ack) return toast('Önce fiyatları kontrol edip onay kutusunu işaretleyin', 'err');
    j.quote ||= ctx.newQuote(j, st);
    const q = j.quote;
    for (const { s, p } of calcs) {
      const c = calcSel(s, p, U, qOf(s)), base = p.base || 'unit', qty = base === 'unit' ? 1 : +(qOf(s)[base] || 0).toFixed(2) || 1;
      const desc = `${productCode(p, s.pk)} · ${p.name}${p.pk?.[s.pk] ? ` (${pkOf(s.pk).t})` : ''}${s.surf && (p.surf || p.recipe.some(l => l.cls)) ? ` · yüzey sınıfı ${s.surf}` : ''}`;
      const item = { id: uid('q'), cat: p.cat, desc, unit: base === 'unit' ? p.unit : baseOf(base).u, qty, price: Math.round(c.price / qty * 100) / 100, urun: s.id };
      const i = q.items.findIndex(x => x.urun === s.id);
      if (i >= 0) q.items[i] = { ...item, id: q.items[i].id }; else q.items.push(item);
    }
    q.urunScope = calcs.map(({ s, p }) => ({ code: productCode(p, s.pk), name: p.name, pk: p.pk?.[s.pk] ? pkOf(s.pk).t : '', pkd: p.pk?.[s.pk] || '', incl: p.incl || [], excl: p.excl || [], ver: p.ver }));
    q.urunCls = W.cls;
    ctx.logEvt?.(`Ürün teklifi hazırlandı: ${calcs.map(x => productCode(x.p, x.s.pk)).join(', ')}`);
    save(); toast('Ürünler teklife aktarıldı'); location.hash = `#/is/${j.id}/teklif`;
  }
  draw();
}

/* teklif belgesine ürün kapsamı eki */
export function quoteScopeHtml(q) {
  if (!q.urunScope?.length) return '';
  return `<section class="p-notes p-urun"><h4>Ürün kapsamı</h4>${q.urunScope.map(u => `<div class="p-urun-i"><b>${esc(u.code)} · ${esc(u.name)}${u.pk ? ` — ${esc(u.pk)}` : ''}</b>${u.pkd ? `<p>${esc(u.pkd)}</p>` : ''}
    <div class="p-two"><div><small>Dahil olan işler</small><ul>${u.incl.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div><div><small>Kapsam dışı (gerekirse ayrı değişiklik teklifiyle)</small><ul>${u.excl.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div></div></div>`).join('')}
    <p class="small">Teklif, ürün dosyası ${q.urunScope.map(u => `${u.code} ${u.ver}`).join(', ')} esas alınarak hazırlanmıştır; sözleşme sonrası yayımlanan yeni sürümler bu teklifin kapsamını değiştirmez.</p></section>`;
}

/* dijital tadilat karnesi: ürünler, kalite kontrol kayıtları (fotoğraflı), değişiklik talepleri */
async function karneDoc(j, U, ctx) {
  const W = j.urun, urls = {};
  const allPh = Object.values(W.qc || {}).flatMap(R => Object.values(R).flatMap(r => r.ph || []));
  await Promise.all(allPh.map(async id => { const p = j.photos.find(x => x.id === id); if (p) urls[id] = await ctx.photoUrl(p).catch(() => ''); }));
  const rows = W.sel.map(s => ({ s, p: U.products.find(x => x.code === s.code) })).filter(x => x.p);
  return `<div class="pdoc">${ctx.docHeader(ctx.settings, 'Dijital Tadilat Karnesi', `<div class="p-meta"><span>İş kodu <b>${esc(j.code)}</b></span><span>Müşteri <b>${esc(j.customer.name || '—')}</b></span><span>Tarih <b>${fmtDate(Date.now())}</b></span></div>`)}
    <section class="p-cust"><div><small>Proje sınıfı</small><b>${W.cls} · ${PROJECT_CLASS.find(x => x.k === W.cls).t}</b></div><div><small>Ürünler</small><b>${rows.map(({ s, p }) => esc(productCode(p, s.pk))).join(', ')}</b></div><div><small>Adres</small><b>${esc(j.customer.district || '')}</b>${esc(j.customer.address || '')}</div></section>
    ${rows.map(({ s, p }) => `<section><h3>${esc(productCode(p, s.pk))} — ${esc(p.name)} <small>${esc(p.ver)}</small></h3><table class="p-table sm"><thead><tr><th>Kontrol</th><th>Durum</th><th>Sorumlu / tarih</th><th>Not</th></tr></thead><tbody>
      ${(p.qc || []).map(q => { const r = W.qc?.[s.id]?.[q.k]; return `<tr><td><b>${esc(q.k)}</b> ${esc(q.t)}</td><td style="color:${r?.ok ? '#1E8A4C' : '#B5341F'};font-weight:700">${r?.ok ? 'Onaylandı' : 'Bekliyor'}</td><td>${r?.ok ? `${esc(r.by || '')} · ${fmtDate(r.date)}` : ''}</td><td>${esc(r?.note || '')}</td></tr>`; }).join('')}</tbody></table>
      ${(() => { const ph = (p.qc || []).flatMap(q => (W.qc?.[s.id]?.[q.k]?.ph || []).map(id => ({ id, k: q.k }))).filter(x => urls[x.id]); return ph.length ? `<div class="p-grid">${ph.map(x => `<figure><img src="${urls[x.id]}"><figcaption>${esc(x.k)}</figcaption></figure>`).join('')}</div>` : ''; })()}</section>`).join('')}
    ${W.co?.length ? `<section><h3>Değişiklik talepleri</h3><table class="p-table sm"><tbody>${W.co.map(x => `<tr><td>${esc(x.d)}</td><td class="r">${fmtMoney(+x.amt || 0)}</td><td>${x.ok ? 'Müşteri onaylı' : 'Onay bekliyor'}</td></tr>`).join('')}</tbody></table></section>` : ''}
    ${ctx.docFooter()}</div>`;
}
