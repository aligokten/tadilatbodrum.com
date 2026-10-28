# SAGG Drywall+

Alçıpan profil (C / U) ile **bölme duvar** ve **sabit mobilya** (mutfak adası, TV ünitesi, niş raf duvarı, özel kutu / tezgah)
tasarımı ile **asma tavan** (CD60 / UD28 iki kademeli sistem, gizli ışık bandı, spot, müdahale kapağı)
tasarımı ve imalat dosyası hazırlama aracı. Tarayıcıda çalışır, kurulum / derleme gerektirmez.

**Adres:** https://tadilatbodrum.com/drywall/ (main dalına her birleştirmede GitHub Actions ile Firebase Hosting'e yayınlanır)
· Yerel: depo kökünde `cd public && python3 -m http.server` → http://localhost:8000/drywall/

## Akış
1. Soldan eleman ekleyin, sağdaki parametreleri girin (ölçüler, profil sistemi 50/75/100, dikme aralığı, levha tipi / kat, boşluklar, nişler).
   Asma tavanda: oda ölçüsü, tavan ve döşeme kotu, taşıyıcı / montaj profili / askı aralıkları, ışık bandı (genişlik, düşüş, yarık), spot ızgarası, müdahale kapağı.
2. Sekmeler: **3B** önizleme · **Çizimler** (ön / yan / üst iskelet görünüşleri, poz etiketleri, ölçü zincirleri, detaylar) ·
   **Kaplama** (levha yerleşimi, derzler dikme ortasında ve şaşırtmalı) · **Kesim listesi** (profil ve levha pozları, çentikler) ·
   **Kesim planı** (tüm proje için profil boy ve levha yerleşim optimizasyonu) · **Malzeme** (miktar + maliyet, CSV) · **Aşamalar** (imalat adımları).
3. **Çıktı al** → kapak, çizimler, kaplama paftaları, kesim listeleri, kesim planları, malzeme listesi ve imalat aşamalarını içeren
   antetli A4 yatay dosya; *Yazdır / PDF* ile kaydedilir. Çizimler ayrıca **DXF** (AutoCAD) ve **SVG** olarak indirilebilir.

## Shapr3D'den içe aktarma
**İçe aktar** → Shapr3D'den alınan **STEP** (önerilen), IGES, OBJ ya da STL dosyası. Her gövde (body) ayrı çözümlenir:
- ana doğrultu ve ölçüler düşey yüzlerden bulunur (döndürülmüş gövdeler de olur); birim (mm / cm / m) ve yukarı ekseni (Z / Y) otomatik, değiştirilebilir
- dört yandan derinlik haritası çıkarılır: içinden geçen boşluklar **kapı / pencere**, girintiler **niş** (derinliğiyle) olarak alınır
- ince düşey gövde → **bölme duvar** (kalınlıktan profil sistemi + levha katı seçilir), kalın / nişli gövde → **mobilya kutusu**, yüksekteki ince yatay gövde → **asma tavan**; tür içe aktarma penceresinde değiştirilebilir
- gövdeler arası temaslardan **montaj detayları**: T birleşimi, L köşe, düz ek, serbest uç, duvar–asma tavan, mobilya–duvar; T ve L için bağlantı dikmesi, tavan için duvar içi U kuşak **ilave profil** olarak otomatik eklenir; duvara dayanan mobilya yüzü kaplanmaz
- **3B → Tüm model** içe aktarılan elemanları modeldeki yerlerinde gösterir; **Montaj** sekmesi ve imalat dosyasında birleşim detayları ve notları

Her gövde dikdörtgen prizma olarak çözümlenir; farklı derinlikteki kısımları (ör. TV ünitesinde alt konsol ve panel) Shapr3D'de ayrı gövde olarak modelleyin.
STEP / IGES okuyucu: `vendor/occt/` ([occt-import-js](https://github.com/kovacsv/occt-import-js), LGPL-2.1, değiştirilmeden), yalnızca STEP / IGES açılınca yüklenir.

## İlave profiller
Otomatik karkasa her elemanda **İlave profiller** listesinden profil eklenir: C, U, C+U takviyeli, CD60, UD28; yön (düşey / yatay / derinlik), başlangıç
konumu (x, y, z), boy, not ve dübel seçeneği. **Çizimler** sekmesinde *Tıklayarak ilave profil* açıkken ön görünüşe (tavanda plana) tıklamak o konuma
dikme / kuşak (tavanda CD60) ekler. İlave profiller mor gösterilir; poz, kesim listesi, kesim planı, malzeme ve 3B'ye dahildir.

Proje tarayıcıda otomatik saklanır; **Kaydet / Aç** ile `.drywall.json` dosyası olarak taşınır. Fiyatlar ve imalat kuralları
(levha ölçüsü, profil boyu, dübel / vida aralıkları, fire) **Ayarlar**'dan değiştirilir.

## Kod
| Dosya | İçerik |
|---|---|
| `js/catalog.js` | profil sistemleri, levha tipleri, varsayılan ayar ve fiyatlar |
| `js/geom.js` | yüz koordinatları, dikme ızgarası, levha döşeme, vida ve derz hesabı |
| `js/generators.js` | eleman tipleri → profil parçaları + levha parçaları + sarf miktarları |
| `js/takeoff.js` | poz numaraları, 1B profil / 2B levha kesim optimizasyonu, malzeme listesi, imalat aşamaları |
| `js/draw.js` | SVG teknik çizimler ve detaylar · `js/dxf.js` DXF dışa aktarım · `js/view3d.js` three.js önizleme |
| `js/importer.js` | STEP / IGES / OBJ / STL okuma, gövde çözümleme, boşluk / niş tespiti, sınıflandırma, birleşimler |
| `js/app.js` | arayüz, kayıt, içe aktarma, ilave profiller, montaj, indirmeler, imalat dosyası |

three.js `../saha/vendor/three/` altından paylaşılır.

> Hesaplar ön imalat ve metraj içindir; statik yük taşıyan (asma dolap, ağır tezgah, TV) uygulamalarda takviyeler yerinde değerlendirilmelidir.
