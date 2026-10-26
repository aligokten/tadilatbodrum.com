/**
 * TadilatBodrum.com — bildirim fonksiyonları.
 *
 * sites/tadilatbodrum/appointments/{id} altına yeni bir keşif randevusu
 * kaydı yazıldığında telefona anlık bildirim gönderir:
 *   • Telegram botu (ana kanal): mesajda telefon numarası (dokununca arar),
 *     altında "WhatsApp" ve "Panel" düğmeleri.
 *   • ntfy.sh (yedek): ntfy.sh, Cloud Run'ın paylaşımlı çıkış IP'lerini
 *     erişim anahtarına rağmen sınırlayabildiği (HTTP 429) için ikincildir.
 * Kanallar birbirinden bağımsızdır; değeri "none" olan kanal atlanır.
 * Bot anahtarı, sohbet kimliği ve ntfy konusu Secret Manager sırrıdır — repo
 * herkese açık olduğu için asla kaynak koduna veya Firestore'a yazılmaz.
 *
 * Ayrıca (digest.js) her akşam yarınki, her sabah bugünkü keşiflerin özetini Telegram'a gönderir:
 * müşteriye hatırlatma ve ekibe iş bilgisi için metni hazır WhatsApp düğmeleriyle.
 *
 * Kurulum (tarayıcıdan): DEPLOY.md → 6). Yayın GitHub Actions ile yapılır
 * (.github/workflows/functions.yml); elle yayında yalnızca bu fonksiyonu seçin:
 *   firebase deploy --only functions:tbNotifyNewAppointment
 */
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { setGlobalOptions } = require("firebase-functions/v2");
const https = require("https");

setGlobalOptions({ region: "europe-west1", maxInstances: 3 });

const NTFY_TOPIC = defineSecret("NTFY_TOPIC");
const NTFY_TOKEN = defineSecret("NTFY_TOKEN");
const TELEGRAM_BOT_TOKEN = defineSecret("TELEGRAM_BOT_TOKEN");
const TELEGRAM_CHAT_ID = defineSecret("TELEGRAM_CHAT_ID");

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

/** Sır değeri; boş ya da "none" ise "" (kanal kapalı). */
function secretValue(secret) {
  const v = (secret.value() || "").trim();
  return v && v !== "none" ? v : "";
}

const escapeHtml = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Telegram Bot API sendMessage (HTML biçimli, satır içi URL düğmeleriyle). */
function sendTelegram(botToken, chatId, html, buttons) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      chat_id: chatId,
      text: html,
      parse_mode: "HTML",
      disable_web_page_preview: true,
      reply_markup: { inline_keyboard: [buttons] },
    });
    const req = https.request(
      {
        hostname: "api.telegram.org",
        path: "/bot" + botToken + "/sendMessage",
        method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) },
        timeout: 10000,
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          if (res.statusCode >= 200 && res.statusCode < 300) return resolve(res.statusCode);
          let desc = "";
          try { desc = JSON.parse(data).description || ""; } catch (_) { /* yanıt JSON değil */ }
          reject(new Error(`Telegram yanıtı: HTTP ${res.statusCode} ${desc}`.trim()));
        });
      }
    );
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("Telegram isteği zaman aşımına uğradı")));
    req.write(payload);
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
  {
    document: "sites/tadilatbodrum/appointments/{id}",
    secrets: [NTFY_TOPIC, NTFY_TOKEN, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID],
  },
  async (event) => {
    const id = event.params.id;
    const d = event.data ? event.data.data() : {};
    const tel = normalizePhone(d.phone);
    const fields = [
      ["Ad Soyad", d.name],
      ["Telefon", d.phone],
      ["Bölge", d.district],
      ["Tercih edilen tarih", d.date],
      ["Not", d.note],
    ].filter(([, v]) => v);

    const jobs = [];

    const botToken = secretValue(TELEGRAM_BOT_TOKEN);
    const chatId = secretValue(TELEGRAM_CHAT_ID);
    if (botToken && chatId) {
      const icons = { "Ad Soyad": "👤", "Telefon": "📞", "Bölge": "📍", "Tercih edilen tarih": "📅", "Not": "📝" };
      const rows = fields.map(([k, v]) =>
        // Telegram "+90…" biçimindeki numarayı dokunulabilir (arama) bağlantıya çevirir
        `${icons[k]} <b>${k}:</b> ${escapeHtml(k === "Telefon" && tel ? "+" + tel : v)}`);
      const html = ["🏠 <b>Yeni Keşif Randevusu</b>", "", ...(rows.length ? rows : ["Detay bilgisi girilmemiş."])].join("\n");
      const buttons = [];
      if (tel) buttons.push({ text: "💬 WhatsApp", url: `https://wa.me/${tel}` });
      buttons.push({ text: "🗂 Panel", url: ADMIN_URL });
      jobs.push(["Telegram", sendTelegram(botToken, chatId, html, buttons)]);
    }

    const topic = secretValue(NTFY_TOPIC);
    if (topic) {
      const actions = [];
      if (tel) {
        actions.push(`view, Ara, tel:+${tel}`);
        actions.push(`view, WhatsApp, https://wa.me/${tel}`);
      }
      actions.push(`view, Panel, ${ADMIN_URL}`);
      jobs.push(["ntfy", sendNtfyWithRetry(topic, secretValue(NTFY_TOKEN), {
        title: "Yeni Keşif Randevusu — TadilatBodrum.com",
        body: fields.map(([k, v]) => `${k}: ${v}`).join("\n") || "Detay bilgisi girilmemiş.",
        tags: "house,bell",
        click: ADMIN_URL,
        actions,
      })]);
    }

    if (!jobs.length) {
      console.error("Hiçbir bildirim kanalı tanımlı değil (TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID ya da NTFY_TOPIC).");
      return;
    }
    const results = await Promise.allSettled(jobs.map(([, p]) => p));
    results.forEach((r, i) => {
      const name = jobs[i][0];
      if (r.status === "fulfilled") console.log(`Bildirim gönderildi (${name}):`, id);
      else console.error(`Bildirim gönderilemedi (${name}):`, r.reason && r.reason.message);
    });
  }
);

/* ───────── Telegram günlük keşif özeti ───────── */
const { loadAndBuild } = require("./digest");
let _db = null;
function db() {
  if (!_db) {
    const admin = require("firebase-admin");
    if (!admin.apps.length) admin.initializeApp();
    _db = admin.firestore();
  }
  return _db;
}

/** Telegram sendMessage, birden çok düğme satırıyla */
function sendTelegramRows(botToken, chatId, html, rows) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      chat_id: chatId, text: html, parse_mode: "HTML", disable_web_page_preview: true,
      ...(rows && rows.length ? { reply_markup: { inline_keyboard: rows } } : {}),
    });
    const req = https.request(
      { hostname: "api.telegram.org", path: "/bot" + botToken + "/sendMessage", method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) }, timeout: 10000 },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          if (res.statusCode >= 200 && res.statusCode < 300) return resolve(res.statusCode);
          let desc = "";
          try { desc = JSON.parse(data).description || ""; } catch (_) { /* JSON değil */ }
          reject(new Error(`Telegram yanıtı: HTTP ${res.statusCode} ${desc}`.trim()));
        });
      }
    );
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("Telegram isteği zaman aşımına uğradı")));
    req.write(payload);
    req.end();
  });
}

async function runDigest(when) {
  const botToken = secretValue(TELEGRAM_BOT_TOKEN), chatId = secretValue(TELEGRAM_CHAT_ID);
  if (!botToken || !chatId) throw new Error("Telegram tanımlı değil (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID)");
  const msgs = await loadAndBuild(db(), when);
  if (!msgs.length) { console.log(`Keşif özeti (${when}): keşif yok, mesaj gönderilmedi`); return 0; }
  for (const m of msgs.slice(0, 25)) {             // sıra korunsun diye tek tek
    await sendTelegramRows(botToken, chatId, m.html, m.rows);
    await sleep(350);
  }
  console.log(`Keşif özeti gönderildi (${when}): ${Math.max(0, msgs.length - 1)} keşif`);
  return Math.max(0, msgs.length - 1);
}

/* GitHub Actions (.github/workflows/digest.yml) her akşam 19:00 ve sabah 08:00'de çağırır.
 * Herkese açık değildir: yalnızca GitHub'ın yayın hizmet hesabı (kimlik jetonuyla) çağırabilir. */
exports.tbDigest = onRequest(
  { secrets: [TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID], invoker: "github-deploy@saggplus.iam.gserviceaccount.com", timeoutSeconds: 60 },
  async (req, res) => {
    const when = req.query.when === "today" ? "today" : "tomorrow";
    try {
      const count = await runDigest(when);
      res.json({ ok: true, when, count });
    } catch (err) {
      console.error("Keşif özeti gönderilemedi:", err.message);
      res.status(500).json({ ok: false, error: err.message });
    }
  }
);
