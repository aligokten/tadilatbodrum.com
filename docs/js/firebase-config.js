/* ═══ Firebase Web Yapılandırması (saggplus projesi) ═══
 * Bu anahtarlar herkese açıktır ve paylaşılması güvenlidir; asıl koruma
 * Firestore/Storage güvenlik kurallarında sağlanır.
 */
export const firebaseConfig = {
  apiKey:            "AIzaSyBF5tRelmpnKaWtlZBeqvmYITapH0kyqw0",
  authDomain:        "saggplus.firebaseapp.com",
  projectId:         "saggplus",
  storageBucket:     "saggplus.firebasestorage.app",
  messagingSenderId: "808666491811",
  appId:             "1:808666491811:web:11de4983c6f7516cf70816",
  measurementId:     "G-ZZ59ZX0GKH",
};

/* Bu sitenin tüm verileri Firestore'da sites/{SITE_ID}/... altında izole tutulur,
 * böylece saggplus'ın kendi koleksiyonlarıyla karışmaz. */
export const SITE_ID = "tadilatbodrum";

/* Admin girişinde kullanıcı adının tamamlanacağı alan adı:
 * "admin" → "admin@tadilatbodrum.com" (Firebase Auth'ta bu kullanıcıyı oluşturun). */
export const ADMIN_EMAIL_DOMAIN = "tadilatbodrum.com";
