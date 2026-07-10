# Yayınlama — Firebase (saggplus projesi paylaşımlı)

Mimari: **Hosting** (statik site) + **Firestore** (içerik/mesajlar) + **Authentication**
(admin girişi) + **Storage** (görseller). Ayrı sunucu gerekmez.

> **ÖNEMLİ — paylaşımlı proje:** Firestore ve Storage saggplus projesinde **tektir**.
> tadilatbodrum verileri, çakışmayı önlemek için Firestore'da **`sites/tadilatbodrum/...`**
> altına, Storage'da **`tadilatbodrum/...`** altına izole yazılır. Bu yüzden bu repodaki
> `firebase.json` **yalnızca hosting** dağıtır; kuralları **elle birleştirirsiniz** (aşağıda).
> Sakın `firebase deploy --only firestore:rules` / `--only storage` çalıştırmayın — saggplus'ın
> kurallarını silersiniz.

Yapılandırma değerleri (config, `projectId`, hosting site) repoda **dolduruldu**.
Geriye tek şey kalıyor: **admin kullanıcısı oluşturup UID'sini kurallara yazmak**.

---

## 1) Firebase Console — saggplus projesi

1. **Authentication → Sign-in method → E-posta/Şifre**'yi etkinleştir (kapalıysa).
   **Users → Add user**: `admin@tadilatbodrum.com` / `exalmc11` → oluşan **UID**'yi kopyala.
2. **Hosting → Add another site** → Site ID: `tadilatbodrum`
   (global olarak alınmışsa `tadilatbodrum-web` gibi başka bir ad seç ve `firebase.json`
   içindeki `"site"` değerini ona göre değiştir). Adres: `https://<site-id>.web.app`.
3. Firestore ve Storage saggplus'ta zaten etkin olmalı; değilse **Firestore Database** ve
   **Storage**'ı etkinleştir (bölge: `eur3 / europe-west`).

## 2) Güvenlik kurallarını saggplus kurallarına EKLE (ezme!)

**Firestore** → Console → *Firestore Database → Rules*: `firestore.rules` dosyasındaki
`isTBAdmin()`, `tbValidLead()` fonksiyonlarını ve `match /sites/tadilatbodrum { … }` bloğunu,
saggplus kurallarındaki `match /databases/{database}/documents {` bloğunun içine yapıştır.
`ADMIN_UID_BURAYA` yerine 1. adımdaki **UID**'yi yaz. **Yayınla.**

**Storage** → Console → *Storage → Rules*: `storage.rules` dosyasındaki
`match /tadilatbodrum/{allPaths=**} { … }` bloğunu, saggplus storage kurallarındaki
`match /b/{bucket}/o {` içine yapıştır, `ADMIN_UID_BURAYA` yerine UID'yi yaz. **Yayınla.**

## 3) Hosting'i dağıt (Windows / Firebase CLI)

Proje klasöründe:

```bash
firebase login              # gerekiyorsa
firebase deploy --only hosting
```

Bittiğinde site `https://<site-id>.web.app` adresinde yayında.

## 4) İçeriği başlat

1. `https://<site-id>.web.app/admin` → **admin / exalmc11** ile giriş yap.
2. **Genel Ayarlar → Örnek İçeriği Yükle** → hizmet/proje/yorumlar Firestore'a yazılır.
3. Artık hero görseli, kayan yazı, projeler, hizmetler, yorumlar panelden yönetilir;
   formlar ve keşif randevuları **Randevular / Mesajlar** kutularına gerçek zamanlı düşer.

## 5) Alan adı (tadilatbodrum.com)

Console → **Hosting → Add custom domain** → `tadilatbodrum.com` → gösterilen DNS kayıtlarını
alan adı sağlayıcında (şu an Wix) güncelle. HTTPS otomatik gelir.

---

## Notlar

- **Hosting site ID** (`.web.app` adresi) ile **SITE_ID** (Firestore namespace, `tadilatbodrum`)
  birbirinden bağımsızdır. Hosting adını değiştirsen bile SITE_ID aynı kalır.
- Yalnızca admin UID'li oturum tadilatbodrum verilerini yazabilir; içerik herkese açık okunur.
  Formlar herkesçe oluşturulabilir ama yalnızca admin görür.
- `server.py` / `docs/` dağıtılmaz; `server.py` yalnızca isteğe bağlı yerel self-host alternatifidir.
