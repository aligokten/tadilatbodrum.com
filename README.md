# TadilatBodrum.com — Yeni Web Sitesi + Admin Paneli

> **Canlı yayın Firebase üzerindedir** (Hosting + Firestore + Auth + Storage) —
> kurulum ve dağıtım için **[DEPLOY.md](DEPLOY.md)**'ye bakın. Aşağıdaki saf Python
> sunucusu isteğe bağlı bir yerel/self-host alternatifidir.

Saf Python (stdlib) ile de çalışır — **hiçbir bağımlılık gerektirmez** (Python 3.8+).

## Çalıştırma

```bash
python3 server.py          # http://localhost:8000
python3 server.py 8080     # farklı port
```

- **Site:** http://localhost:8000
- **Admin paneli:** http://localhost:8000/admin
- **Giriş:** kullanıcı adı `admin` · şifre `exalmc11` → İlk girişte *Genel Ayarlar → Şifre Değiştir* ile değiştirin!

## Özellikler

### Site (landing page)
- En üstte **kayan duyuru satırı** (admin panelinden düzenlenir)
- **Hero** — dinamik açık gradient arkaplan, admin panelinden değiştirilebilir görsel
- **Hizmetlerimiz** — ikonlu widget kartları (admin'den eklenip çıkarılabilir)
- **Süreç** — 4 adımlı çalışma süreci
- **Projeler** — glassmorphism kart slider'ı; karta tıklayınca buzlu (blur) arkaplan üzerinde
  modal açılır, görseller slayt olarak kaydırılır, başlık/bilgiler animasyonla gelir, ✕ ile kapanır
- **Hakkımızda** — "Güvenilir, şeffaf ve kaliteli hizmet" sloganı + misyon/vizyon/değerler
- **İletişim** — "Ücretsiz keşif randevunuzu oluşturun" CTA'sı, WhatsApp butonu,
  "Ücretsiz Keşif Al" ile açılan randevu formu modalı + klasik iletişim formu
- **Footer** — düşük opasiteli Google Maps ofis konumu arkaplanı, SAGG Plus (çatı şirket) linki
- Yüzen WhatsApp butonu, tam responsive tasarım

### Admin paneli (`/admin`)
| Bölüm | İşlev |
|---|---|
| Genel Ayarlar | Kayan yazıyı düzenleme, hero görseli yükleme, şifre değiştirme |
| Projeler | Proje ekle/düzenle/sil; çoklu görsel yükleme, başlık, konum, açıklama |
| Hizmetler | Hizmet ekle/düzenle/sil; 12 ikonluk seçici |
| Keşif Randevuları | Randevu talepleri gelen kutusu (okundu işaretleme, WhatsApp'tan yanıt, silme) |
| Mesajlar | İletişim formu mesajları gelen kutusu |

Okunmamış kayıtlar kenar çubuğunda rozetle gösterilir; kutular 60 sn'de bir otomatik yenilenir.

**Keşif randevusu bildirimi:** yeni randevu talebi gelince **Telegram botu** (ana kanal) ve
isteğe bağlı **ntfy.sh** üzerinden telefona anlık bildirim gider (WhatsApp / Panel düğmeleriyle).
Firebase'de `functions/` Cloud Function'ı, self-host'ta `TELEGRAM_BOT_TOKEN=… TELEGRAM_CHAT_ID=… python3 server.py`
— kurulum: [DEPLOY.md](DEPLOY.md) §6.

### Saha koordinasyon uygulaması (`/saha`)

Keşif ekibi için mobil + masaüstü çalışan, kurulabilir (PWA) uygulama. Ayrıntılar: **[public/saha/README.md](public/saha/README.md)**.

- İş/müşteri kaydı, durum akışı (Talep → Keşif → Teklif → Onay → Uygulama → Teslim)
- Müşteri talepleri, 10 bölümlü koşullu **müşteri anketi**, mahal bazlı **keşif kontrol listesi**, tespitler
- Fotoğraf çekme/yükleme (mahal ve tespite bağlı), keşif raporu PDF'i
- **2D rölöve editörü** → otomatik **3D model** → **gerçekçi render** (path tracing)
- Elektrik (priz, anahtar, sigorta kutusu, aydınlatma…) ve sıhhi tesisat (yer sifonu, musluk, pis su gideri…) **sembol kütüphanesi**; duvara otomatik yaslanır, teklifte nokta sayısı olarak metrajlanır
- Kapı ve pencerelerde **model** (tek / çift / sürgü / gömme / katlanır kapı; açılır, çift açılım, vasistas, sürme, sabit pencere) ve **kullanım** (giriş, banyo, balkon, fransız balkon…) seçenekleri
- **Müşteriyle paylaş**: çizimin 3D kuşbakışı modelini ve ölçülü 2D planını müşterinin telefonundan açabileceği salt-okunur kısa bağlantı (`kesif.tadilatbodrum.com/p/KİMLİK` → `saha/goster.html`); bağlantı güncellenebilir / kapatılabilir; yerel modda ya da kural eklenmeden çizim bağlantının içine gömülür — WhatsApp ile tek dokunuşla gönderilir (kural: DEPLOY.md 5d)
- **Demo hesabı**: saha uygulamasında kullanıcı adı `DEMO` · şifre `demo2026` — Firebase'e bağlanmaz; gerçek kayıtlardan ayrı, yalnızca o cihazdaki demo veritabanında (`tb-saha-demo`) dört örnek işle (talep, keşif, teklif, uygulama) açılır; *Ayarlar → Demo verilerini sıfırla* ile baştan kurulur
- **Parça etiketleri**: dolap / mutfak parçaları (adet kadar) ve kapı / pencereler için 100 × 60 mm etiket PDF'i — benzersiz kimlik, QR kod (parça bilgisi, UTF-8) ve Code128 barkod; plan *Dışa aktar → Parça etiketleri* ya da dolap tasarlayıcıda *Etiket* (QR: vendor/qrcode.js, MIT); QR kod parçanın montaj şemasını açar (`kesif.tadilatbodrum.com/m/KİMLİK?p=D1-042` → `saha/montaj.html`): mobilya ön görünüşünde / iç düzeninde parça turuncu vurgulanır, montaj adımı ve modülün parça listesi gösterilir; doğramada anahtar planda yeri ve ölçülü görünüş (veri `shares` koleksiyonunda, iş / çizim başına tek bağlantı; yerel modda QR metin içerir)
- Balkon / teras / galeri boşluğu için duvar çizer gibi **korkuluk aracı** (metal dikey/yatay, cam panel, dolu parapet); fransız pencere korkuluklu ya da korkuluksuz
- Metrajı plandan alan **teklif aracı** + yazdırılabilir/PDF teklif
- **Uygulama / iş takibi** (onaylanan işler): teklif kalemlerinden otomatik iş programı ve zaman çizelgesi, ekip rehberi ve WhatsApp iş emri, malzeme tedarik kaydı (termin / durum / tedarikçiye sipariş), kategori bazlı kontrol föyü ve teslim tutanağı, şantiye günlüğü, hakediş / tahsilat; panoda ilerleme çubuğu
- Teklif formu iki seçenekli: **ayrıntılı** (birim fiyat + tutar) ya da **özet** (kalem ve miktarlar, yalnızca toplam)
- Müşteri konumu **haritadan işaretlenir** (Leaflet + OpenStreetMap / uydu, adres arama); yol tarifi ve raporda konum
- İş sonu **müşteri değerlendirme anketi** (`/d/KİMLİK`): yıldız puanları, tavsiye skoru, yorum, yayın izni; yanıtlar işe kaydedilir, panoda memnuniyet ortalaması ve CSV (kural: DEPLOY.md 5e)
- Müşteriye WhatsApp'tan gönderilecek **video rapor**: 1080×1920 dikey MP4, en çok 1 dk; logo açılışı, talepler, tespitler ve çözümler, özet, "Süreç bizde" güvence sahnesi ve iletişim (WebCodecs H.264 + mp4-muxer, sentez arka plan müziği); anket (beklentiler) ve mahal bazlı keşif sahneleri

### SAGG Drywall+ (`/drywall`)

Alçıpan profil ile bölme duvar, sabit mobilya (mutfak adası, TV ünitesi, niş raf) ve asma tavan (gizli ışık bandı, spot, müdahale kapağı) tasarımı; Shapr3D modelini (STEP / IGES / OBJ / STL) içe aktarıp profil karkasını ve montaj (birleşim) detaylarını otomatik çözümleme, otomatik sonuca ilave profil atama; iskelet / kaplama çizimleri, poz numaralı kesim listeleri, profil ve levha kesim optimizasyonu, malzeme + maliyet listesi, imalat aşamaları ve yazdırılabilir imalat dosyası (PDF), DXF dışa aktarım. Ayrıntılar: **[public/drywall/README.md](public/drywall/README.md)**.

## Dosya yapısı

```
server.py            # HTTP sunucu + JSON API (stdlib)
data/db.json         # tüm içerik ve mesajlar (ilk çalıştırmada otomatik oluşur)
uploads/             # admin'den yüklenen görseller
public/
  index.html         # landing page
  css/style.css      # tema (mevcut sitenin renk paleti: #112F5B, #42989C, #D87249)
  js/main.js
  admin/             # admin paneli (SPA)
  assets/            # logo, hero görseli
```

## Yayına alma notları

- Sunucu `0.0.0.0`'ı dinler; bir VPS'te `systemd` servisi + Nginx reverse proxy (HTTPS) önerilir.
- `data/` ve `uploads/` klasörlerini yedekleyin — tüm içerik burada.
- Varsayılan şifreyi mutlaka değiştirin.
