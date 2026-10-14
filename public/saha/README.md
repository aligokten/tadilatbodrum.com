# TadilatBodrum Saha — tadilat koordinasyon uygulaması

Adres: **`/saha`** (ör. `https://tadilatbodrum.com/saha`). Telefonda tarayıcı menüsünden
**"Ana ekrana ekle"** ile uygulama gibi kurulur; bilgisayarda da aynı adres çalışır.

## Giriş ve veri
- **Bulut modu:** admin paneliyle aynı kullanıcı (`admin` / şifre). Veriler Firestore'da
  `sites/tadilatbodrum/jobs/{id}`, fotoğraflar Storage'da `tadilatbodrum/saha/{iş}/...` altında.
  İnternet kesilirse değişiklikler cihazda bekler, bağlantı gelince eşitlenir.
- **Yerel mod:** giriş gerekmez, veriler yalnızca o cihazın tarayıcısında (IndexedDB) durur.
  *Ayarlar → Buluta aktar* ile sonradan buluta taşınabilir. *Ayarlar → Yedek indir* ile JSON yedek.

## Modüller
| Sekme | İşlev |
|---|---|
| Genel | Müşteri, adres + konum, keşif tarihi, sorumlu, durum adımları, notlar/geçmiş, **keşif raporu PDF** |
| Talepler | Kategori, mahal ve öncelikle müşteri talepleri; kapsamda / kapsam dışı işaretleme |
| Anket | 10 bölüm, seçilen kapsama göre açılan detay bölümleri (banyo, mutfak, zemin, tesisat…), yazdırılabilir |
| Keşif | Mahal ölçüleri (en/boy/yükseklik → alan), 12 maddelik kontrol listesi, mahal fotoğrafları, önem dereceli tespitler |
| Rölöve & 3D | 2D çizim editörü, 3D model, render; kroki fotoğrafları |
| Fotoğraflar | Kamera/galeriden yükleme (otomatik küçültme), etiket, mahal, açıklama |
| Teklif | Fiyat kütüphanesinden kalem ekleme, metrajın plandan otomatik gelmesi, iskonto/KDV, PDF ve WhatsApp |

### 2D rölöve editörü
- **Duvar:** noktaları işaretleyin ya da uzunluğu yazıp yön okuna basın (→ ↓ ← ↑) — sahada ölçülen
  değerleri birebir girmek için. Başlangıç noktasına dönünce oda otomatik oluşur.
- **Ölçüyle oda:** en × boy (iç ölçü) girerek, seçili odanın sağına/altına bitişik oda ekler; ortak duvar tekrarlanmaz.
- Kapı / pencere / boşluk, mobilya ve donatı kütüphanesi, ölçü çizgisi, yazı.
- **Altlık:** elle çizilmiş krokinin fotoğrafını arkaya koyup iki nokta ile ölçekleyerek üzerinden çizin.
- Izgaraya/uçlara yaslama, 0-45-90° yakalama, geri al/yinele, PNG dışa aktarma, oda bazlı metraj.
- Kısayollar: V seç, W duvar, R oda, D kapı, P pencere, M mobilya, O ölçü, T yazı, Ctrl+Z / Ctrl+Y, Del, Esc.

### 3D ve render
- Plan otomatik olarak 3D'ye çevrilir (duvar açıklıkları, kapı kanadı, cam, zemin dokuları, mobilya).
- Kuşbakışı / üstten / **iç mekan** (zemine dokunarak yürüme), kesit görünümü, güneş yönü ve yüksekliği.
- **Render:** *Hızlı* (gölge + ortam kapatma) veya *Fotogerçekçi* (GPU path tracing, ilerlemeli örnekleme).
  Çıktı indirilebilir veya projeye kaydedilir; teklife görsel olarak eklenebilir.

## Teknik
Derleme adımı yok — saf ES modülleri. three.js ve three-gpu-pathtracer `vendor/` altında gömülüdür
(çevrimdışı çalışır). Service worker uygulama kabuğunu önbelleğe alır.
Lisanslar: `vendor/three/LICENSE`, `vendor/LICENSE-pathtracer`, `vendor/LICENSE-bvh` (MIT).
