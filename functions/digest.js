/**
 * Telegram günlük keşif özeti (saha uygulaması işleri: sites/tadilatbodrum/jobs).
 *   • Akşam 19:00 (İstanbul): yarınki keşifler — müşteriye "1 gün önce hatırlatma" mesajı hazır WhatsApp düğmesi
 *   • Sabah 08:00 (İstanbul): bugünkü keşifler — müşteriye "keşif günü" mesajı
 * Her keşif ayrı mesaj: saat, müşteri, telefon, adres, keşfe gidecek kişi, onay mesajının durumu; düğmeler:
 * müşteriye hatırlatma (WhatsApp, metni dolu), keşfe gidecek kişiye iş bilgisi, yol tarifi.
 * Mesaj şablonları ve ekip uygulamadaki Ayarlar'dan (sites/tadilatbodrum/saha/settings) okunur;
 * varsayılanlar public/saha/js/remind.js ile aynıdır.
 */
const SITE = "tadilatbodrum";
const TZ = "Europe/Istanbul";

const REMIND_DEFAULTS = {
  confirm: "Merhaba {musteri},\n{firma} keşif randevunuz oluşturuldu.\n📅 {tarih}, saat {saat}\n📍 {adres}\nKeşfe gelecek: {personel} ({unvan}) · {personel_tel}\nRandevuyu değiştirmek isterseniz bu mesaja yanıt verebilirsiniz. Teşekkür ederiz.",
  day: "Merhaba {musteri},\nYarın ({tarih}) saat {saat} keşif randevunuzu hatırlatmak isteriz.\n📍 {adres}\nSizi ziyaret edecek: {personel} ({unvan}) · {personel_tel}\nGörüşmek üzere — {firma}",
  same: "Merhaba {musteri},\nBugün saat {saat} keşif randevunuz için ekibimiz yola çıkıyor.\nSizi ziyaret edecek: {personel} ({unvan})\nUlaşmak için: {personel_tel}\n{firma}",
  team: "Keşif — {is_kodu}\n📅 {tarih}, saat {saat}\nMüşteri: {musteri} · {musteri_tel}\n📍 {adres}\nKonum: {konum}\nNot: {ozet}",
};

/** İstanbul saatine göre bugünden n gün sonrası: "YYYY-MM-DD" */
function istDay(n = 0, now = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(now).map((x) => [x.type, x.value]));
  const d = new Date(Date.UTC(+p.year, +p.month - 1, +p.day + n));
  return d.toISOString().slice(0, 10);
}

/** "2026-10-28T14:30" → { day, time: "14:30" | "", label: "28 Ekim Çarşamba" } */
function parseKesif(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(s || "");
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return {
    day: `${m[1]}-${m[2]}-${m[3]}`,
    time: m[4] ? `${m[4]}:${m[5]}` : "",
    label: d.toLocaleDateString("tr-TR", { timeZone: "UTC", day: "numeric", month: "long", weekday: "long" }),
  };
}

/** "0532…" / "+90 532…" → "90532…" */
function normalizePhone(p) {
  const d = String(p || "").replace(/\D/g, "");
  if (d.length === 10 && d[0] === "5") return "90" + d;
  if (d.length === 11 && d[0] === "0") return "9" + d;
  return d;
}
const waUrl = (tel, text) => `https://wa.me/${normalizePhone(tel)}${text ? "?text=" + encodeURIComponent(text) : ""}`;
const dirLink = (g) => `https://www.google.com/maps/dir/?api=1&destination=${(+g.lat).toFixed(6)},${(+g.lng).toFixed(6)}`;

const team = (st) => (st.team || []).filter((m) => m && m.name && m.name.trim());
const personOf = (st, j) => team(st).find((m) => m.id === j.kesifBy) || null;

function vars(j, st) {
  const k = parseKesif(j.kesifDate), p = personOf(st, j), c = j.customer || {};
  return {
    musteri: (c.name || "").trim(), musteri_tel: c.phone || "",
    tarih: k ? k.label : "", saat: k ? k.time : "",
    adres: [c.address, c.district].map((x) => (x || "").trim()).filter(Boolean).join(", "),
    konum: c.geo && c.geo.lat ? dirLink(c.geo) : (c.mapsUrl || ""),
    personel: p ? p.name : "", unvan: p ? p.title || "" : "", personel_tel: p ? p.phone || "" : "",
    firma: (st.company && st.company.name) || "", firma_tel: (st.company && (st.company.phone || st.company.whatsapp)) || "",
    is_kodu: j.code || "", ozet: (j.summary || "").trim(),
  };
}

/** uygulamadaki fillTpl ile aynı kurallar: yer tutucularının hepsi boş satır atılır */
function fillTpl(tpl, v) {
  if (!v.saat) tpl = tpl.replace(/,?[ \t]*saat[ \t]*\{saat\}/gi, "");
  return tpl.split("\n").map((line) => {
    const keys = [...line.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
    if (keys.length && keys.every((k) => !v[k])) return null;
    return line.replace(/\{(\w+)\}/g, (m, k) => (k in v ? v[k] : m))
      .replace(/\s*\(\s*\)/g, "").replace(/\s*·\s*(?=$|·)/g, "").trimEnd();
  }).filter((x) => x !== null).join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
const tplOf = (st, k) => ((st.remind && st.remind[k]) || "").trim() || REMIND_DEFAULTS[k];
const sentOf = (j, k) => { const r = j.remind && j.remind[k]; return r && r.for === j.kesifDate ? r : null; };

const esc = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Özet mesajları: [{ html, rows }] — ilki başlık, sonra her keşif için bir mesaj.
 * when: "tomorrow" (akşam) | "today" (sabah)
 */
function buildDigest(jobs, st, when, now = new Date()) {
  const day = istDay(when === "today" ? 0 : 1, now);
  const list = jobs
    .filter((j) => j.kesifDate && j.kesifDate.slice(0, 10) === day && !["iptal", "teslim"].includes(j.status))
    .sort((a, b) => a.kesifDate.localeCompare(b.kesifDate));
  const label = parseKesif(day).label;
  const head = when === "today" ? `☀️ <b>Bugünkü keşifler</b> — ${esc(label)}` : `🌙 <b>Yarınki keşifler</b> — ${esc(label)}`;
  if (!list.length) return when === "today" ? [] : [{ html: `${head}\n\nKeşif randevusu yok.`, rows: [] }];
  const out = [{ html: `${head}\n\n${list.length} keşif. Her keşfin altındaki düğmelerle müşteriye hatırlatmayı ve ekibe iş bilgisini WhatsApp'tan gönderin; metinler hazır gelir.`, rows: [] }];
  const kind = when === "today" ? "same" : "day";
  list.forEach((j, i) => {
    const v = vars(j, st), c = j.customer || {}, p = personOf(st, j), tel = normalizePhone(c.phone);
    const lines = [
      `<b>${i + 1}) ${v.saat ? v.saat + " · " : ""}${esc(v.musteri || j.code || "İsimsiz")}</b>${c.district ? " — " + esc(c.district) : ""}`,
      tel ? `📞 +${tel}` : "📞 telefon yok",
      v.adres ? `📍 ${esc(v.adres)}` : "",
      p ? `👷 ${esc(p.name)}${p.title ? " · " + esc(p.title) : ""}` : "👷 <i>keşfe gidecek kişi seçilmedi</i>",
      v.ozet ? `📝 ${esc(v.ozet)}` : "",
      sentOf(j, "confirm") ? "✅ Randevu onayı gönderildi" : "⚠️ Randevu onayı gönderilmedi",
      sentOf(j, kind) ? `✅ ${kind === "day" ? "Hatırlatma" : "Keşif günü mesajı"} uygulamadan gönderildi` : "",
      `<code>${esc(j.code || "")}</code>`,
    ].filter(Boolean);
    const rows = [];
    if (tel) rows.push([{ text: `💬 ${kind === "day" ? "Müşteriye hatırlatma" : "Müşteriye: yola çıkıyoruz"}`, url: waUrl(c.phone, fillTpl(tplOf(st, kind), v)) }]);
    if (p && p.phone) rows.push([{ text: `👷 Ekibe iş bilgisi (${p.name.split(" ")[0]})`, url: waUrl(p.phone, fillTpl(tplOf(st, "team"), v)) }]);
    const nav = [];
    if (c.geo && c.geo.lat) nav.push({ text: "🧭 Yol tarifi", url: dirLink(c.geo) });
    if (nav.length) rows.push(nav);
    out.push({ html: lines.join("\n"), rows });
  });
  return out;
}

async function loadAndBuild(db, when, now) {
  const base = db.collection("sites").doc(SITE);
  const day = istDay(when === "today" ? 0 : 1, now);
  const [snap, sd] = await Promise.all([
    base.collection("jobs").where("kesifDate", ">=", day).where("kesifDate", "<", day + "").get(),
    base.collection("saha").doc("settings").get(),
  ]);
  return buildDigest(snap.docs.map((d) => d.data()), sd.exists ? sd.data() : {}, when, now);
}

module.exports = { buildDigest, loadAndBuild, fillTpl, istDay, parseKesif };
