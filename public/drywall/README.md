# SAGG Drywall+

Alçıpan profil (C / U) ile **bölme duvar** ve **sabit mobilya** (mutfak adası, TV ünitesi, niş raf duvarı, özel kutu / tezgah)
tasarımı ve imalat dosyası hazırlama aracı. Tarayıcıda çalışır, kurulum / derleme gerektirmez.

**Adres:** https://tadilatbodrum.com/drywall/ (main dalına her birleştirmede GitHub Actions ile Firebase Hosting'e yayınlanır)
· Yerel: depo kökünde `cd public && python3 -m http.server` → http://localhost:8000/drywall/

## Akış
1. Soldan eleman ekleyin, sağdaki parametreleri girin (ölçüler, profil sistemi 50/75/100, dikme aralığı, levha tipi / kat, boşluklar, nişler).
2. Sekmeler: **3B** önizleme · **Çizimler** (ön / yan / üst iskelet görünüşleri, poz etiketleri, ölçü zincirleri, detaylar) ·
   **Kaplama** (levha yerleşimi, derzler dikme ortasında ve şaşırtmalı) · **Kesim listesi** (profil ve levha pozları, çentikler) ·
   **Kesim planı** (tüm proje için profil boy ve levha yerleşim optimizasyonu) · **Malzeme** (miktar + maliyet, CSV) · **Aşamalar** (imalat adımları).
3. **Çıktı al** → kapak, çizimler, kaplama paftaları, kesim listeleri, kesim planları, malzeme listesi ve imalat aşamalarını içeren
   antetli A4 yatay dosya; *Yazdır / PDF* ile kaydedilir. Çizimler ayrıca **DXF** (AutoCAD) ve **SVG** olarak indirilebilir.

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
| `js/app.js` | arayüz, kayıt, indirmeler, imalat dosyası |

three.js `../saha/vendor/three/` altından paylaşılır.

> Hesaplar ön imalat ve metraj içindir; statik yük taşıyan (asma dolap, ağır tezgah, TV) uygulamalarda takviyeler yerinde değerlendirilmelidir.
