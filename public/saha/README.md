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

### Çizimden aktarma (DXF / PDF)
Rölöve ekranında **DXF / PDF aktar**: mevcut projenin AutoCAD DXF'i veya plan PDF'i otomatik olarak çizime dönüşür.
- **Duvarlar** paralel çift çizgilerden kalınlığıyla, **kapılar** açılım yayından, **pencereler** boşluktaki cam çizgilerinden,
  **odalar** duvarlarla kapalı alanlardan tanınır; oda adları çizimdeki yazılardan alınır.
- DXF birimi dosyadan okunur (mm/cm/m); PDF ölçeği duvar kalınlıklarından tahmin edilir, gerekirse değiştirilir.
  Ölçek şüpheliyse **Ölçekle** aracıyla bilinen bir ölçünün iki ucu işaretlenip gerçek değeri girilir.
- Katman seçimi (DXF), önizleme, orijinal çizimi altlık olarak ekleme, mevcut planın yerine koyma / yanına ekleme.
- **Taranmış PDF** (görüntü): otomatik dönüşüm yapılamaz; sayfa altlık olarak eklenip ölçeklenir, üzerinden çizilir.
- **DWG**: kapalı format — AutoCAD'de *Farklı Kaydet → DXF* (veya ücretsiz ODA File Converter) ile DXF'e çevirip yükleyin.

### Mutfak ve giysi dolabı tasarlayıcı
Rölövede bir duvar seçip **Mutfak / dolap** (ya da duvar panelindeki *Bu duvara mutfak diz / Giysi dolabı diz*):
- Dizi duvarın oda tarafındaki iç yüzüne, köşelerdeki duvar kalınlıkları düşülerek yerleşir; pencere ve kapılar duvardan okunur.
- **Otomatik diz:** evye pencere altına, bulaşık makinesi evye yanına, ocak evyeden ve pencereden uzağa (üstüne davlumbaz),
  buzdolabı / fırın kolonu köşeye; kalan boşluk standart 60-45-40-30 modüllerle, artık dolgu paneliyle tamamlanır.
- **Modüller:** alt (kapaklı, çekmeceli, evye, ocak, ocak + fırın, bulaşık / çamaşır makinesi, köşe, dolgu, boşluk),
  boy (kiler, fırın + mikrodalga kolonu, ankastre / solo buzdolabı), üst (kapaklı, camlı, yukarı açılır, açık raf, davlumbaz);
  giysi dolabında askılık, çift askı, uzun askı, raflı, çekmece + askı, ayakkabılık; menteşeli veya sürgülü kapak.
- Her modülün türü, genişliği, kapak sayısı ve menteşe yönü değiştirilir; sola/sağa taşıma, çoğaltma, ikiye bölme.
- **Ölçüler:** baza, gövde, tezgah kalınlığı/derinliği, üst dolap kotu ve yüksekliği, boy dolap yüksekliği, gövde kalınlığı.
- **Malzeme:** kapak rengi, gövde, tezgah, kulp tipi (çubuk, gola, düğme, tak-aç) ve rengi.
- **Ön görünüş** (kotlu; kapak açılım işaretli), giysi dolabında **iç düzen**, **3D önizleme**.
- **Kesim listesi** (parça, malzeme, boy × en mm, adet, kenar bandı) ve donanım listesi (menteşe, ray, kulp, ayak…).
- Çıktılar: çizim + kesim listesi **PDF**, ön görünüş **DXF** (AutoCAD), kesim listesi **CSV** (Excel), **teklife ekle**
  (alt/üst dolap mtül, boy dolap adet, tezgah mtül; birim fiyatlar Ayarlar → fiyat kütüphanesinden).
- Planda üstten sembol (tezgah, evye, ocak, üst dolaplar kesik çizgi), 3D görünümde ve render'da tam model.

### 3D ve render
- Plan otomatik olarak 3D'ye çevrilir (duvar açıklıkları, kapı kanadı, cam, zemin dokuları, mobilya).
- Kuşbakışı / üstten / **iç mekan** (zemine dokunarak yürüme), kesit görünümü, güneş yönü ve yüksekliği.
- **Render:** *Hızlı* (gölge + ortam kapatma) veya *Fotogerçekçi* (GPU path tracing, ilerlemeli örnekleme).
  Çıktı indirilebilir veya projeye kaydedilir; teklife görsel olarak eklenebilir.

## Teknik
Derleme adımı yok — saf ES modülleri. three.js ve three-gpu-pathtracer `vendor/` altında gömülüdür
(çevrimdışı çalışır). Service worker uygulama kabuğunu önbelleğe alır.
Lisanslar: `vendor/three/LICENSE`, `vendor/LICENSE-pathtracer`, `vendor/LICENSE-bvh`, `vendor/LICENSE-dxf-parser`, `vendor/LICENSE-html2canvas`, `vendor/LICENSE-jspdf` (MIT), `vendor/pdfjs/LICENSE` (Apache-2.0).
