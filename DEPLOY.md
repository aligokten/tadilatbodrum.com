# Yayınlama — Firebase (Hosting + Firestore + Auth + Storage)

Site artık **tam serverless Firebase** mimarisiyle çalışır:

| Katman | Firebase servisi |
|---|---|
| Statik site (HTML/CSS/JS) | **Hosting** |
| İçerik, yorumlar, form kayıtları | **Cloud Firestore** |
| Admin girişi | **Authentication** (E-posta/Şifre) |
| Yüklenen görseller | **Storage** |

Ayrı bir sunucu **gerekmez**; admin paneli, formlar ve yorumlar canlıda çalışır.

---

## 1) Firebase Console'da kurulum (saggplus projesi)

[console.firebase.google.com](https://console.firebase.google.com) → **saggplus** projesi:

1. **Firestore Database** → *Veritabanı oluştur* → *production mode* → bölge: `eur3 (europe-west)`.
2. **Authentication** → *Başla* → *Sign-in method* → **E-posta/Şifre**'yi etkinleştir.
   Sonra **Users → Add user**:
   - E-posta: `admin@tadilatbodrum.com`
   - Şifre: `exalmc11`
   - Oluşan kullanıcının **UID**'sini kopyala (kurallarda lazım olacak).
3. **Storage** → *Başla* → aynı bölge.
4. **Hosting** → *Add another site* → Site ID: `tadilatbodrum` (alınmışsa `tadilatbodrum-web` vb.).
   Yayın adresi: `https://tadilatbodrum.web.app`.
5. **Proje Ayarları (⚙️) → Genel → Uygulamalarınız** → Web uygulaması yoksa **Web ekle** →
   çıkan `firebaseConfig` nesnesini kopyala.

---

## 2) Yer tutucuları doldur

Aşağıdaki 4 dosyadaki `..._BURAYA` alanlarını doldurun:

| Dosya | Ne yazılacak |
|---|---|
| `public/js/firebase-config.js` | Console'dan kopyaladığın `firebaseConfig` değerleri |
| `.firebaserc` | `"default"` → saggplus **proje ID**'si (config'teki `projectId`) |
| `firebase.json` | `"site"` → oluşturduğun **hosting site ID**'si (örn. `tadilatbodrum`) |
| `firestore.rules` **ve** `storage.rules` | `ADMIN_UID_BURAYA` → admin kullanıcısının **UID**'si |

> İstersen bu değerleri (config + proje ID + site ID + admin UID) bana ver, ben dolduray
> repoya işleyeyim; sen yalnızca `firebase deploy` çalıştırırsın.

---

## 3) Dağıt (Windows / terminal — Firebase CLI kurulu)

Proje klasöründe:

```bash
firebase login                 # gerekiyorsa
firebase deploy --only firestore:rules,storage,hosting
```

Bittiğinde site `https://<site-id>.web.app` adresinde yayında olur.

---

## 4) İçeriği başlat

1. `https://<site-id>.web.app/admin` → **admin / exalmc11** ile giriş yap.
2. **Genel Ayarlar → Örnek İçeriği Yükle** ile hizmet/proje/yorumları tek tıkla ekle.
3. Artık hero görselini, kayan yazıyı, projeleri, hizmetleri, yorumları panelden yönet;
   formdan/keşif randevusundan gelen kayıtlar **Randevular** ve **Mesajlar** kutularına düşer.

---

## 5) Alan adı (tadilatbodrum.com)

Firebase Console → **Hosting → Add custom domain** → `tadilatbodrum.com` →
gösterilen DNS kayıtlarını alan adı sağlayıcında (şu an Wix) güncelle. HTTPS otomatik gelir.

---

## Notlar

- **Güvenlik:** İçeriği yalnızca admin UID'li oturum yazabilir; herkes okuyabilir.
  Formlar herkes tarafından oluşturulabilir ama yalnızca admin görür. Şifreyi panelden değiştirebilirsin.
- `public/` klasörünün tamamı Hosting'e gider. `server.py`, `docs/`, `data/` dağıtılmaz.
- **GitHub Pages** (`docs/`) yalnızca tasarım önizlemesidir; canlı/yönetilebilir site Firebase'dedir.
- `server.py` (saf Python) artık isteğe bağlı bir *self-host* alternatifidir; güncel frontend
  Firebase'e bağlı olduğundan onu kullanmak istemezseniz gerekmez.
