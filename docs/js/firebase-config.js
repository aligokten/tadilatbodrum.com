/* ═══ Firebase Web Yapılandırması ═══
 * Bu değerler Firebase Console → Proje Ayarları → "Uygulamalarınız" (Web) → SDK kurulumu
 * bölümündeki config nesnesinden gelir. GÜVENLİDİR — bu anahtarlar herkese açıktır,
 * gerçek koruma Firestore/Storage güvenlik kurallarıyla sağlanır.
 *
 * saggplus Firebase projesindeki değerlerle DOLDURUN (ya da bana yapıştırın, ben dolduracağım).
 */
export const firebaseConfig = {
  apiKey:            "BURAYA_API_KEY",
  authDomain:        "BURAYA_PROJE.firebaseapp.com",
  projectId:         "BURAYA_PROJE_ID",
  storageBucket:     "BURAYA_PROJE.appspot.com",
  messagingSenderId: "BURAYA_SENDER_ID",
  appId:             "BURAYA_APP_ID",
};

/* Admin girişinde kullanıcı adının tamamlanacağı sabit alan adı.
 * "admin" yazınca Firebase Auth'a "admin@tadilatbodrum.com" olarak gider.
 * Firebase Auth'ta bu e-posta ile bir kullanıcı oluşturun (şifre: exalmc11). */
export const ADMIN_EMAIL_DOMAIN = "tadilatbodrum.com";
