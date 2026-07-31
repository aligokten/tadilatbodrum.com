/**
 * TadilatBodrum.com — bildirim fonksiyonları.
 *
 * sites/tadilatbodrum/appointments/{id} altına yeni bir keşif randevusu
 * kaydı yazıldığında, ntfy.sh üzerinden telefona anlık push bildirimi
 * gönderir. Bildirim konusu (topic) bir Secret Manager sırrıdır — repo
 * herkese açık olduğu için asla kaynak koduna veya Firestore'a yazılmaz.
 *
 * Kurulum:
 *   firebase functions:secrets:set NTFY_TOPIC
 *   firebase deploy --only functions
 */
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { defineSecret } = require("firebase-functions/params");
const { setGlobalOptions } = require("firebase-functions/v2");
const https = require("https");

setGlobalOptions({ region: "europe-west1", maxInstances: 3 });

const NTFY_TOPIC = defineSecret("NTFY_TOPIC");

function sendNtfy(topic, title, body, tags) {
  return new Promise((resolve, reject) => {
    const path =
      "/" + encodeURIComponent(topic) +
      "?title=" + encodeURIComponent(title) +
      "&priority=high&tags=" + encodeURIComponent(tags);
    const req = https.request(
      {
        hostname: "ntfy.sh",
        path,
        method: "POST",
        headers: { "Content-Type": "text/plain; charset=utf-8" },
        timeout: 10000,
      },
      (res) => {
        res.on("data", () => {});
        res.on("end", () => resolve(res.statusCode));
      }
    );
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("ntfy isteği zaman aşımına uğradı")));
    req.write(body, "utf8");
    req.end();
  });
}

exports.tbNotifyNewAppointment = onDocumentCreated(
  { document: "sites/tadilatbodrum/appointments/{id}", secrets: [NTFY_TOPIC] },
  async (event) => {
    const topic = NTFY_TOPIC.value();
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

    try {
      await sendNtfy(topic, "Yeni Keşif Randevusu — TadilatBodrum.com", lines, "house,bell");
      console.log("Bildirim gönderildi:", event.params.id);
    } catch (err) {
      console.error("Bildirim gönderilemedi:", err);
    }
  }
);
