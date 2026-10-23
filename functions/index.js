/**
 * TadilatBodrum.com — bildirim fonksiyonları.
 *
 * sites/tadilatbodrum/appointments/{id} altına yeni bir keşif randevusu
 * kaydı yazıldığında, ntfy.sh üzerinden telefona anlık push bildirimi
 * gönderir. Bildirim konusu (topic) bir Secret Manager sırrıdır — repo
 * herkese açık olduğu için asla kaynak koduna veya Firestore'a yazılmaz.
 * Bildirimde "Ara", "WhatsApp" ve "Panel" düğmeleri bulunur; bildirime
 * dokunmak admin panelini açar.
 *
 * ntfy.sh anonim gönderimleri IP'ye göre sınırlar; Cloud Functions'ın çıkış
 * IP'leri paylaşımlı olduğundan kota başkalarınca dolabilir (HTTP 429). Bu
 * yüzden ntfy.sh hesabının erişim anahtarı (NTFY_TOKEN sırrı) ile gönderilir;
 * anahtar "none" ise anonim gönderilir. 429'da kısa aralıklarla yeniden denenir.
 *
 * Kurulum (tarayıcıdan): DEPLOY.md → 6). Yayın GitHub Actions ile yapılır
 * (.github/workflows/functions.yml); elle yayında yalnızca bu fonksiyonu seçin:
 *   firebase deploy --only functions:tbNotifyNewAppointment
 */
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { defineSecret } = require("firebase-functions/params");
const { setGlobalOptions } = require("firebase-functions/v2");
const https = require("https");

setGlobalOptions({ region: "europe-west1", maxInstances: 3 });

const NTFY_TOPIC = defineSecret("NTFY_TOPIC");
const NTFY_TOKEN = defineSecret("NTFY_TOKEN");

const ADMIN_URL = "https://tadilatbodrum.com/admin";

/** "0541 348 88 33" / "+90 541..." / "541..." → "905413488833" (bilinmeyen biçim → yalnız rakamlar) */
function normalizePhone(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.length === 10 && digits[0] === "5") return "90" + digits;
  if (digits.length === 11 && digits[0] === "0") return "9" + digits;
  return digits;
}

/**
 * ntfy'ye bildirim gönderir. Başlık ve aksiyonlar HTTP başlığı yerine sorgu
 * parametresiyle gönderilir: başlıklar yalnızca ASCII taşıyabildiği için
 * Türkçe karakterler bozulurdu.
 */
function sendNtfy(topic, token, { title, body, tags, click, actions }) {
  return new Promise((resolve, reject) => {
    const params = new URLSearchParams({ title, priority: "high", tags });
    if (click) params.set("click", click);
    if (actions && actions.length) params.set("actions", actions.join("; "));
    const path = "/" + encodeURIComponent(topic) + "?" + params.toString();
    const req = https.request(
      {
        hostname: "ntfy.sh",
        path,
        method: "POST",
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          ...(token ? { Authorization: "Bearer " + token } : {}),
        },
        timeout: 10000,
      },
      (res) => {
        res.on("data", () => {});
        res.on("end", () =>
          res.statusCode >= 200 && res.statusCode < 300
            ? resolve(res.statusCode)
            : reject(Object.assign(new Error("ntfy yanıtı: HTTP " + res.statusCode), { status: res.statusCode })));
      }
    );
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("ntfy isteği zaman aşımına uğradı")));
    req.write(body, "utf8");
    req.end();
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 429 (kota) ve ağ hatalarında 2 sn, 6 sn, 15 sn arayla yeniden dener. */
async function sendNtfyWithRetry(topic, token, msg) {
  const delays = [2000, 6000, 15000];
  for (let i = 0; ; i++) {
    try {
      return await sendNtfy(topic, token, msg);
    } catch (err) {
      const retryable = !err.status || err.status === 429 || err.status >= 500;
      if (!retryable || i >= delays.length) throw err;
      console.warn(`ntfy denemesi ${i + 1} başarısız (${err.message}), yeniden denenecek`);
      await sleep(delays[i]);
    }
  }
}

exports.tbNotifyNewAppointment = onDocumentCreated(
  { document: "sites/tadilatbodrum/appointments/{id}", secrets: [NTFY_TOPIC, NTFY_TOKEN] },
  async (event) => {
    const topic = NTFY_TOPIC.value();
    const rawToken = (NTFY_TOKEN.value() || "").trim();
    const token = rawToken && rawToken !== "none" ? rawToken : "";
    if (!topic) {
      console.error("NTFY_TOPIC sırrı tanımlı değil, bildirim gönderilemedi.");
      return;
    }

    const d = event.data ? event.data.data() : {};
    const lines = [
      d.name ? `Ad Soyad: ${d.name}` : null,
      d.phone ? `Telefon: ${d.phone}` : null,
      d.district ? `Bölge: ${d.district}` : null,
      d.date ? `Tercih edilen tarih: ${d.date}` : null,
      d.note ? `Not: ${d.note}` : null,
    ].filter(Boolean).join("\n") || "Detay bilgisi girilmemiş.";

    const tel = normalizePhone(d.phone);
    const actions = [];
    if (tel) {
      actions.push(`view, Ara, tel:+${tel}`);
      actions.push(`view, WhatsApp, https://wa.me/${tel}`);
    }
    actions.push(`view, Panel, ${ADMIN_URL}`);

    try {
      await sendNtfyWithRetry(topic, token, {
        title: "Yeni Keşif Randevusu — TadilatBodrum.com",
        body: lines,
        tags: "house,bell",
        click: ADMIN_URL,
        actions,
      });
      console.log("Bildirim gönderildi:", event.params.id);
    } catch (err) {
      console.error("Bildirim gönderilemedi:", err);
    }
  }
);
