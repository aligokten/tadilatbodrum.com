#!/usr/bin/env python3
"""
docs/ statik önizleme derleyicisi.

public/ içeriğinden GitHub Pages için statik bir kopya üretir:
- kök-mutlak varlık yolları (/assets, /css, /js) göreli hale getirilir
  (böylece proje alt-yolu altında da çalışır: /kullanici.github.io/repo/)
- yalnızca seed görselleri kopyalanır
- API'ye ulaşılamadığında main.js gömülü örnek veriyle siteyi doldurur

Çalıştırma:  python3 build_docs.py
"""
import os
import re
import shutil

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, "public")
DST = os.path.join(ROOT, "docs")


def main():
    if os.path.exists(DST):
        shutil.rmtree(DST)
    os.makedirs(DST)

    for d in ("css", "js", "assets"):
        shutil.copytree(os.path.join(SRC, d), os.path.join(DST, d))

    os.makedirs(os.path.join(DST, "uploads"))
    for f in os.listdir(os.path.join(ROOT, "uploads")):
        if f.startswith("seed-"):
            shutil.copy(os.path.join(ROOT, "uploads", f), os.path.join(DST, "uploads", f))

    html = open(os.path.join(SRC, "index.html"), encoding="utf-8").read()
    # statik önizlemede backend yok → footer yönetim paneli linkini çıkar
    html = re.sub(r'\s*<span class="footer-sep">.*?</a>\s*', '\n      ', html, flags=re.S)
    for a, b in (('"/assets/', '"assets/'), ('"/css/', '"css/'), ('"/js/', '"js/')):
        html = html.replace(a, b)
    open(os.path.join(DST, "index.html"), "w", encoding="utf-8").write(html)

    open(os.path.join(DST, ".nojekyll"), "w").write("")
    print("docs/ yeniden üretildi.")


if __name__ == "__main__":
    main()
