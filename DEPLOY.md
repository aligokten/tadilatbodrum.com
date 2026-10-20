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

## 0) Otomatik yayın (GitHub Actions) — önerilen

`main` dalına her birleştirmede site **otomatik yayınlanır** (`.github/workflows/deploy.yml`);
Windows'ta `firebase deploy` çalıştırmaya gerek kalmaz. Kimlik doğrulama anahtarsızdır
(Workload Identity Federation): repoda gizli anahtar tutulmaz, yalnızca bu depodaki iş akışları yetkilidir.

**Bir kerelik kurulum (telefondan da olur):**
1. https://shell.cloud.google.com adresini Firebase projesinin sahibi olan Google hesabıyla açın.
2. Şu komutu yapıştırıp çalıştırın:
   ```bash
   curl -sL https://raw.githubusercontent.com/aligokten/tadilatbodrum.com/main/scripts/github-deploy-setup.sh | bash
   ```
3. En sonda yazan `projects/…/providers/github` satırını Claude'a gönderin (gizli bilgi değildir);
   iş akışına işlenir ve ilk yayın başlatılır.

Sonrası: her değişiklik main'e birleşince birkaç dakika içinde yayında olur. Elle yayın için
GitHub → **Actions → Siteyi yayınla → Run workflow**. Yayınlanan sürüm iş akışı özetinde yazar.

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

> **Saha uygulaması (/saha) için:** `firestore.rules` içindeki `jobs` ve `saha` eşleşmelerini,
> `storage.rules` içindeki `tadilatbodrum/saha/...` bloğunu ve genel bloktaki
> `allow read: if !allPaths.matches('saha/.*')` değişikliğini de birleştirin — müşteri
> verileri ve keşif fotoğrafları yalnızca admin oturumuyla okunur.

## 3) Hosting'i elle dağıt (Windows / Firebase CLI — otomatik yayın kuruluysa gerekmez)

Proje klasöründe:

```bash
firebase login              # gerekiyorsa
firebase deploy --only hosting
```

Bittiğinde site `https://<site-id>.web.app` adresinde yayında; saha uygulaması
`https://<site-id>.web.app/saha` adresindedir (admin hesabıyla giriş).

## 4) İçeriği başlat

1. `https://<site-id>.web.app/admin` → **admin / exalmc11** ile giriş yap.
2. **Genel Ayarlar → Örnek İçeriği Yükle** → hizmet/proje/yorumlar Firestore'a yazılır.
3. Artık hero görseli, kayan yazı, projeler, hizmetler, yorumlar panelden yönetilir;
   formlar ve keşif randevuları **Randevular / Mesajlar** kutularına gerçek zamanlı düşer.

## 5) Alan adı (tadilatbodrum.com)

Console → **Hosting → Add custom domain** → `tadilatbodrum.com` → gösterilen DNS kayıtlarını
alan adı sağlayıcında (şu an Wix) güncelle. HTTPS otomatik gelir.

## 5b) Saha uygulaması — kesif.tadilatbodrum.com

Saha uygulaması ayrı bir Hosting sitesinden (`tadilatbodrum-kesif`) **kök adreste** yayınlanır.
`firebase.json` iki hedef içerir: `main` (ana site) ve `kesif` (yalnızca saha uygulaması;
ana sitenin sayfaları bu sitede yayınlanmaz, her adres uygulamayı açar).

İlk kurulum (bir kez):
```powershell
firebase hosting:sites:create tadilatbodrum-kesif --project saggplus
firebase deploy --only hosting:kesif --project saggplus
```
Ardından Console → **Hosting → tadilatbodrum-kesif → Add custom domain** → `kesif.tadilatbodrum.com`
ve gösterilen DNS kayıtlarını alan adı sağlayıcısında girin. Alan adı başka bir Firebase
projesine bağlıysa önce oradan kaldırın (Firebase bir alan adını tek siteye bağlar).

Sonraki güncellemeler: `firebase deploy --only hosting --project saggplus` iki siteyi birlikte yayınlar.

## 5c) PDF'lerde bulut fotoğrafları (Storage CORS — bir kez)

Saha uygulaması teklif/rapor PDF'ini cihazda üretir; bulut fotoğraflarının PDF'e girebilmesi
için Storage'ın tarayıcıdan okunmasına izin verilmelidir. Google Cloud Shell'de
(https://console.cloud.google.com → sağ üstte `>_`, ali@saggplus.com ile) repo içindeki
`storage-cors.json` dosyasını yükleyip:
```bash
gsutil cors set storage-cors.json gs://saggplus.firebasestorage.app
```
Bu ayar yalnızca belirtilen sitelerden okuma (GET) izni verir; dosya erişim kuralları değişmez.
Yapılmazsa PDF yine oluşur, sadece bulut fotoğrafları PDF'te boş görünür (Yazdır seçeneğinde görünür).

## 5d) Müşteri paylaşım bağlantıları — kısa link (bir kez)

Saha uygulamasında **Müşteriyle paylaş** kısa bağlantı üretir (`kesif.tadilatbodrum.com/p/Ab3kX9mQz`).
Çizim Firestore'da `sites/tadilatbodrum/shares/{kimlik}` belgesinde durur. Bunun için kurala tek satır eklenmeli
(Firestore saggplus ile paylaşımlı olduğundan dosya deploy edilmez, Console'dan eklenir):

1. Firebase Console → **saggplus** → Firestore Database → **Rules**
2. `match /sites/tadilatbodrum { … }` bloğunun içinde, `match /saha/{id} …` satırının hemen altına ekleyin:
   ```
   match /shares/{id}       { allow get: if true; allow list: if false; allow write: if isTBAdmin(); }
   ```
3. **Publish**.

Kural eklenene kadar uygulama otomatik olarak uzun bağlantıya (çizim bağlantının içinde) döner; paylaşım yine çalışır.
Kimse bağlantıları listeleyemez; yalnızca kimliği bilen tek belgeyi okuyabilir. Bağlantı "Müşteriyle paylaş" penceresinden
güncellenebilir (aynı link, yeni çizim) ya da kapatılabilir.

## 5e) İş sonu müşteri değerlendirmesi (bir kez)

İş ekranındaki **Değerlendirme linki gönder** müşteriye `kesif.tadilatbodrum.com/d/KİMLİK` bağlantısı gönderir; yanıtlar
`sites/tadilatbodrum/feedback/{kimlik}` belgesine yazılır ve uygulama açıldığında işe kaydedilir. Firestore → Rules'ta,
`match /sites/tadilatbodrum { … }` bloğunun içine (5d'deki `shares` satırının altına) ekleyip **Publish** edin:

```
match /feedback/{id} {
  allow get: if true;
  allow list, create, delete: if isTBAdmin();
  allow update: if isTBAdmin() || (
    resource.data.status == 'pending' && request.resource.data.status == 'done'
    && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['status', 'answers', 'doneAt'])
    && request.resource.data.answers is map && request.resource.data.answers.size() <= 20
    && request.resource.data.doneAt is int);
}
```

Müşteri yalnızca kendisine gönderilen kaydı, yalnızca bir kez doldurabilir. Ayarlar → Firma'ya **Google yorum bağlantısı**
girilirse 4 ve üzeri puan veren müşteriye teşekkür ekranında "Google'da da değerlendirin" düğmesi gösterilir.

## 6) Keşif randevusu bildirimi (telefona anlık push)

Yeni bir keşif randevusu formu gönderildiğinde, `functions/` klasöründeki Cloud Function
otomatik tetiklenip **ntfy.sh** üzerinden telefonunuza anlık push bildirimi gönderir.
Bildirim konusu (topic) bir Secret Manager sırrıdır — repo herkese açık olduğu için
koda veya Firestore'a asla yazılmaz.

> **Gereksinim:** saggplus projesi **Blaze (kullandıkça öde)** planında olmalı — Cloud
> Functions'ın dışarıya (ntfy.sh'e) istek atabilmesi için şart. Günlük birkaç bildirim
> için maliyet pratikte $0'dır.

**a) Telefonunuza ntfy uygulamasını kurun**
- [Android (Play Store)](https://play.google.com/store/apps/details?id=io.heckel.ntfy)
- [iOS (App Store)](https://apps.apple.com/us/app/ntfy/id1625396347)
- Uygulamayı açın → **"+" (Subscribe to topic)** → aşağıdaki gibi **uzun ve tahmin edilemez**
  bir konu adı girin (herkes bu adı bilirse bildirimlerinizi görebilir/sahte bildirim
  gönderebilir, bu yüzden gizli tutun):
  ```
  tbodrum-kesif-zsszz0ksq2zcl0
  ```
  (İsterseniz kendi konu adınızı da seçebilirsiniz — önemli olan aşağıdaki adımda
  **aynı** metni kullanmak.)

**b) Konu adını Firebase'e sır (secret) olarak kaydedin** — Windows terminalinde, repo
klasöründe:
```powershell
firebase functions:secrets:set NTFY_TOPIC
```
İstendiğinde (a) adımındaki konu adını yapıştırıp Enter'a basın.

**c) Fonksiyonu dağıtın:**
```powershell
cd functions
npm install
cd ..
firebase deploy --only functions
```

**d) Test edin:** Sitedeki "Ücretsiz Keşif Al" formunu kendiniz doldurup gönderin —
birkaç saniye içinde telefonunuza push bildirimi gelmeli. Gelmezse:
- Firebase Console → **Functions** → `tbNotifyNewAppointment` → **Logs** sekmesinden
  hata mesajına bakın (genelde "secret tanımlı değil" veya ntfy'ye ulaşamama olur).
- ntfy uygulamasında doğru konuya abone olduğunuzdan emin olun.

Konu adını daha sonra değiştirmek isterseniz, (a) ve (b) adımlarını yeni bir adla
tekrarlayıp `firebase deploy --only functions` ile yeniden dağıtmanız yeterli.

---

## 7) Windows uygulaması (TadilatBodrum Saha .exe)

Windows uygulaması `desktop/` klasöründedir. İçeriği canlı siteden (`kesif.tadilatbodrum.com`)
açtığı için **web'e yaptığınız her `firebase deploy` Windows uygulamasında da hemen geçerlidir**;
açık pencerede "Yeni sürüm hazır — Yenile" bildirimi çıkar.

Uygulamanın kendisi (pencere, menü, kurulum) değiştiğinde yeni Windows sürümü yayımlanır.
Kurulu uygulamalar bunu açılışta ve 4 saatte bir denetler, arka planda indirir ve kurar.

**Yeni Windows sürümü yayımlama:**
1. `desktop/package.json` içindeki `"version"` değerini artırın (ör. `1.0.0` → `1.0.1`) ve main'e gönderin.
2. GitHub → **Actions** → **Windows uygulaması** → **Run workflow** (main) ile çalıştırın.
   Ya da etiketle: `git tag desktop-v1.0.1` ve `git push origin desktop-v1.0.1`.
3. Birkaç dakika sonra kurulum dosyası **Releases** sayfasında yayımlanır:
   https://github.com/aligokten/tadilatbodrum.com/releases/latest

**Kurulum:** Releases sayfasından `TadilatBodrum-Saha-Kurulum-<sürüm>.exe` indirilir.
Dosya kod imzalı olmadığı için Windows ilk çalıştırmada "Windows bilgisayarınızı korudu"
uyarısı verebilir: **Ek bilgi → Yine de çalıştır**.

**Yerelde derleme (isteğe bağlı, Windows'ta):**
```powershell
cd $HOME\Desktop\tadilatbodrum-guncel\desktop
npm ci
npm run dist        # dist\TadilatBodrum-Saha-Kurulum-<sürüm>.exe
```

---

## Notlar

- **Hosting site ID** (`.web.app` adresi) ile **SITE_ID** (Firestore namespace, `tadilatbodrum`)
  birbirinden bağımsızdır. Hosting adını değiştirsen bile SITE_ID aynı kalır.
- Yalnızca admin UID'li oturum tadilatbodrum verilerini yazabilir; içerik herkese açık okunur.
  Formlar herkesçe oluşturulabilir ama yalnızca admin görür.
- `server.py` / `docs/` dağıtılmaz; `server.py` yalnızca isteğe bağlı yerel self-host alternatifidir.
