# TadilatBodrum.com — Yeni Web Sitesi + Admin Paneli

Saf Python (stdlib) ile çalışır — **hiçbir bağımlılık gerektirmez** (Python 3.8+).

## Çalıştırma

```bash
python3 server.py          # http://localhost:8000
python3 server.py 8080     # farklı port
```

- **Site:** http://localhost:8000
- **Admin paneli:** http://localhost:8000/admin
- **Varsayılan admin şifresi:** `tadilat2026` → İlk girişte *Genel Ayarlar → Şifre Değiştir* ile değiştirin!

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
