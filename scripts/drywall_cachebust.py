#!/usr/bin/env python3
"""SAGG Drywall+ önbellek kırıcı.

public/drywall/index.html içindeki import map'e her JS modülü için ?v=SÜRÜM eşlemesi yazar,
CSS ve giriş betiğine aynı sürümü ekler. Böylece hosting'deki 1 saatlik önbellek
(firebase.json) yeni yayında eski modüllerin kullanılmasına yol açmaz.
Yayın iş akışı (deploy.yml) bunu commit kısaltmasıyla çalıştırır; yerelde gerek yoktur.

Kullanım:  python3 scripts/drywall_cachebust.py <sürüm>
"""
import json
import os
import re
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "public", "drywall")


def main():
    ver = re.sub(r"[^\w.-]", "", sys.argv[1] if len(sys.argv) > 1 else "dev") or "dev"
    path = os.path.join(ROOT, "index.html")
    html = open(path, encoding="utf-8").read()
    m = re.search(r'(<script type="importmap">)(.*?)(</script>)', html, re.S)
    imap = json.loads(m.group(2))
    imports = {k: v for k, v in imap["imports"].items() if not k.startswith("./js/")}
    for f in sorted(os.listdir(os.path.join(ROOT, "js"))):
        if f.endswith(".js"):
            imports[f"./js/{f}"] = f"./js/{f}?v={ver}"
    imap["imports"] = imports
    html = html[: m.start(2)] + "\n" + json.dumps(imap, indent=2) + "\n" + html[m.end(2):]
    html = re.sub(r'href="css/app\.css(\?v=[^"]*)?"', f'href="css/app.css?v={ver}"', html)
    html = re.sub(r'src="js/app\.js(\?v=[^"]*)?"', f'src="js/app.js?v={ver}"', html)
    open(path, "w", encoding="utf-8").write(html)
    print(f"drywall sürümü: {ver} ({sum(k.startswith('./js/') for k in imports)} modül)")


if __name__ == "__main__":
    main()
