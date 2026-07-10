#!/usr/bin/env python3
"""
TadilatBodrum.com — web sitesi + admin paneli sunucusu
Saf Python (stdlib), harici bağımlılık yok.

Çalıştırma:  python3 server.py  [port]   (varsayılan 8000)
Admin panel: http://localhost:8000/admin  (varsayılan şifre: tadilat2026 — admin panelinden değiştirin)
"""
import base64
import hashlib
import json
import mimetypes
import os
import re
import secrets
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, unquote

ROOT = os.path.dirname(os.path.abspath(__file__))
PUBLIC = os.path.join(ROOT, "public")
UPLOADS = os.path.join(ROOT, "uploads")
DATA_FILE = os.path.join(ROOT, "data", "db.json")

DEFAULT_PASSWORD = "tadilat2026"

_lock = threading.Lock()
_tokens = {}  # token -> expiry epoch

# ---------------------------------------------------------------- veritabanı

def _seed_db():
    return {
        "adminPasswordHash": hashlib.sha256(DEFAULT_PASSWORD.encode()).hexdigest(),
        "ticker": "🏗️ Bodrum ve Milas genelinde ücretsiz keşif! Hemen arayın: 0 541 348 88 33  •  Yaz sezonu öncesi tadilat randevularınızı bugünden planlayın.",
        "heroImage": "/assets/hero.jpg",
        "services": [
            {"id": "s1", "icon": "villa",   "title": "Villa Tadilatı",     "desc": "Villalarınız için kapsamlı tadilat ve renovasyon çözümleri."},
            {"id": "s2", "icon": "sun",     "title": "Yazlık Yenileme",    "desc": "Yazlıklarınıza modern, konforlu ve estetik dokunuşlar."},
            {"id": "s3", "icon": "sofa",    "title": "İç Mekan Tasarımı",  "desc": "Fonksiyonel, şık ve size özel iç mekan tasarım çözümleri."},
            {"id": "s4", "icon": "bath",    "title": "Banyo & Mutfak",     "desc": "Banyo ve mutfak alanlarınızı yenileyerek değer katıyoruz."},
            {"id": "s5", "icon": "paint",   "title": "Boya & Uygulama",    "desc": "İç ve dış boya, dekoratif uygulama ve yüzey çözümleri."},
            {"id": "s6", "icon": "key",     "title": "Anahtar Teslim",     "desc": "Tasarım, uygulama ve teslimat dahil anahtar teslim hizmet."},
        ],
        "projects": [
            {"id": "p1", "title": "Bitez Villa Yenileme", "location": "Bitez, Bodrum",
             "desc": "Havuzlu villanın iç ve dış mekanlarının komple yenilenmesi; mutfak, banyolar, zemin kaplamaları ve dış cephe boyası anahtar teslim tamamlandı.",
             "images": ["/uploads/seed-bitez.svg", "/assets/hero.jpg"]},
            {"id": "p2", "title": "Ören Villa Yenileme", "location": "Ören, Milas",
             "desc": "Deniz manzaralı villada iç mekan tasarımı, banyo & mutfak yenileme ve dekoratif boya uygulamaları gerçekleştirildi.",
             "images": ["/uploads/seed-oren.svg"]},
            {"id": "p3", "title": "Güllük Daire Yenileme", "location": "Güllük, Milas",
             "desc": "Yazlık dairenin komple renovasyonu; zemin, elektrik-su tesisatı, mutfak dolapları ve boya işleri şeffaf süreç yönetimiyle teslim edildi.",
             "images": ["/uploads/seed-gulluk.svg"]},
        ],
        "appointments": [],
        "messages": [],
    }


def load_db():
    with _lock:
        if not os.path.exists(DATA_FILE):
            db = _seed_db()
            _write(db)
            return db
        with open(DATA_FILE, encoding="utf-8") as f:
            return json.load(f)


def _write(db):
    os.makedirs(os.path.dirname(DATA_FILE), exist_ok=True)
    tmp = DATA_FILE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(db, f, ensure_ascii=False, indent=2)
    os.replace(tmp, DATA_FILE)


def save_db(db):
    with _lock:
        _write(db)


def new_id(prefix):
    return prefix + secrets.token_hex(5)


# ---------------------------------------------------------------- yardımcılar

EXT_BY_MIME = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp",
               "image/gif": ".gif", "image/svg+xml": ".svg", "image/avif": ".avif"}


def save_data_url(data_url, name_hint="img"):
    """data:image/...;base64,xxx  →  /uploads/<dosya> yolu döndürür."""
    m = re.match(r"data:([\w/+.-]+);base64,(.+)$", data_url, re.S)
    if not m:
        raise ValueError("Geçersiz görsel verisi")
    mime, b64 = m.group(1), m.group(2)
    ext = EXT_BY_MIME.get(mime, ".bin")
    raw = base64.b64decode(b64)
    if len(raw) > 15 * 1024 * 1024:
        raise ValueError("Görsel 15 MB'den büyük olamaz")
    fname = f"{name_hint}-{int(time.time())}-{secrets.token_hex(4)}{ext}"
    os.makedirs(UPLOADS, exist_ok=True)
    with open(os.path.join(UPLOADS, fname), "wb") as f:
        f.write(raw)
    return "/uploads/" + fname


def resolve_images(images):
    """Admin'den gelen görsel listesi: data-url'ler kaydedilir, mevcut yollar korunur."""
    out = []
    for im in images or []:
        if isinstance(im, str) and im.startswith("data:"):
            out.append(save_data_url(im, "proje"))
        elif isinstance(im, str) and (im.startswith("/uploads/") or im.startswith("/assets/")):
            out.append(im)
    return out


# ---------------------------------------------------------------- HTTP handler

class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "TadilatBodrum/1.0"

    # ---- düşük seviye cevaplar
    def _send(self, code, body=b"", ctype="text/plain; charset=utf-8", extra=None):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store" if ctype.startswith("application/json") else "public, max-age=300")
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def _json(self, obj, code=200):
        self._send(code, json.dumps(obj, ensure_ascii=False).encode(), "application/json; charset=utf-8")

    def _err(self, code, msg):
        self._json({"error": msg}, code)

    def _body(self):
        n = int(self.headers.get("Content-Length") or 0)
        if n > 80 * 1024 * 1024:
            raise ValueError("İstek çok büyük")
        raw = self.rfile.read(n) if n else b""
        return json.loads(raw.decode("utf-8")) if raw else {}

    def _auth_ok(self):
        tok = self.headers.get("X-Auth-Token", "")
        exp = _tokens.get(tok)
        if not exp or exp < time.time():
            return False
        _tokens[tok] = time.time() + 8 * 3600  # kullanıldıkça uzat
        return True

    def log_message(self, fmt, *args):
        sys.stderr.write("[%s] %s\n" % (time.strftime("%H:%M:%S"), fmt % args))

    # ---- statik dosyalar
    def _serve_static(self, path):
        path = unquote(path)
        if path == "/":
            path = "/index.html"
        if path == "/admin" or path == "/admin/":
            path = "/admin/index.html"
        if path.startswith("/uploads/"):
            base, rel = ROOT, path.lstrip("/")
        else:
            base, rel = PUBLIC, path.lstrip("/")
        full = os.path.realpath(os.path.join(base, rel))
        if not full.startswith(os.path.realpath(base) + os.sep):
            return self._err(403, "Yasak")
        if not os.path.isfile(full):
            return self._err(404, "Bulunamadı")
        ctype = mimetypes.guess_type(full)[0] or "application/octet-stream"
        with open(full, "rb") as f:
            self._send(200, f.read(), ctype)

    # ---- GET
    def do_GET(self):
        p = urlparse(self.path).path
        try:
            if p == "/api/site":
                db = load_db()
                return self._json({"ticker": db["ticker"], "heroImage": db["heroImage"],
                                   "services": db["services"], "projects": db["projects"]})
            if p == "/api/admin/data":
                if not self._auth_ok():
                    return self._err(401, "Yetkisiz")
                db = load_db()
                return self._json({k: db[k] for k in
                                   ("ticker", "heroImage", "services", "projects", "appointments", "messages")})
            return self._serve_static(p)
        except Exception as e:
            self._err(500, str(e))

    do_HEAD = do_GET

    # ---- POST
    def do_POST(self):
        p = urlparse(self.path).path
        try:
            body = self._body()

            # -- herkese açık uçlar
            if p == "/api/appointment":
                return self._add_inbox("appointments", body,
                                       ["name", "phone", "district", "date", "note"], need=["name", "phone"])
            if p == "/api/message":
                return self._add_inbox("messages", body,
                                       ["name", "phone", "email", "message"], need=["name", "message"])
            if p == "/api/admin/login":
                db = load_db()
                pw = (body.get("password") or "").encode()
                if hashlib.sha256(pw).hexdigest() != db["adminPasswordHash"]:
                    time.sleep(0.7)  # kaba kuvvet yavaşlatma
                    return self._err(401, "Şifre hatalı")
                tok = secrets.token_urlsafe(32)
                _tokens[tok] = time.time() + 8 * 3600
                return self._json({"token": tok})

            # -- admin uçları
            if not self._auth_ok():
                return self._err(401, "Yetkisiz")
            db = load_db()

            if p == "/api/admin/ticker":
                db["ticker"] = str(body.get("ticker", ""))[:500]
                save_db(db); return self._json({"ok": True})

            if p == "/api/admin/hero":
                db["heroImage"] = save_data_url(body["image"], "hero")
                save_db(db); return self._json({"ok": True, "heroImage": db["heroImage"]})

            if p == "/api/admin/password":
                new = body.get("password") or ""
                if len(new) < 6:
                    return self._err(400, "Şifre en az 6 karakter olmalı")
                db["adminPasswordHash"] = hashlib.sha256(new.encode()).hexdigest()
                save_db(db); return self._json({"ok": True})

            if p == "/api/admin/projects":
                proj = {"id": new_id("p"), "title": str(body.get("title", ""))[:120],
                        "location": str(body.get("location", ""))[:120],
                        "desc": str(body.get("desc", ""))[:2000],
                        "images": resolve_images(body.get("images"))}
                if not proj["title"]:
                    return self._err(400, "Başlık gerekli")
                db["projects"].insert(0, proj)
                save_db(db); return self._json(proj)

            if p == "/api/admin/services":
                svc = {"id": new_id("s"), "icon": str(body.get("icon", "tools"))[:30],
                       "title": str(body.get("title", ""))[:120],
                       "desc": str(body.get("desc", ""))[:500]}
                if not svc["title"]:
                    return self._err(400, "Başlık gerekli")
                db["services"].append(svc)
                save_db(db); return self._json(svc)

            return self._err(404, "Bulunamadı")
        except Exception as e:
            self._err(500, str(e))

    def _add_inbox(self, key, body, fields, need):
        rec = {f: str(body.get(f, "")).strip()[:1000] for f in fields}
        for f in need:
            if not rec[f]:
                return self._err(400, f"'{f}' alanı gerekli")
        rec.update(id=new_id("m"), createdAt=time.strftime("%Y-%m-%d %H:%M"), read=False)
        db = load_db()
        db[key].insert(0, rec)
        db[key] = db[key][:500]
        save_db(db)
        return self._json({"ok": True})

    # ---- PUT (güncelleme)
    def do_PUT(self):
        p = urlparse(self.path).path
        try:
            if not self._auth_ok():
                return self._err(401, "Yetkisiz")
            body = self._body()
            db = load_db()

            m = re.match(r"^/api/admin/projects/([\w-]+)$", p)
            if m:
                for proj in db["projects"]:
                    if proj["id"] == m.group(1):
                        proj["title"] = str(body.get("title", proj["title"]))[:120]
                        proj["location"] = str(body.get("location", proj["location"]))[:120]
                        proj["desc"] = str(body.get("desc", proj["desc"]))[:2000]
                        if "images" in body:
                            proj["images"] = resolve_images(body["images"])
                        save_db(db); return self._json(proj)
                return self._err(404, "Proje bulunamadı")

            m = re.match(r"^/api/admin/services/([\w-]+)$", p)
            if m:
                for svc in db["services"]:
                    if svc["id"] == m.group(1):
                        svc["title"] = str(body.get("title", svc["title"]))[:120]
                        svc["desc"] = str(body.get("desc", svc["desc"]))[:500]
                        svc["icon"] = str(body.get("icon", svc["icon"]))[:30]
                        save_db(db); return self._json(svc)
                return self._err(404, "Hizmet bulunamadı")

            m = re.match(r"^/api/admin/(appointments|messages)/([\w-]+)/read$", p)
            if m:
                for rec in db[m.group(1)]:
                    if rec["id"] == m.group(2):
                        rec["read"] = bool(body.get("read", True))
                        save_db(db); return self._json({"ok": True})
                return self._err(404, "Kayıt bulunamadı")

            return self._err(404, "Bulunamadı")
        except Exception as e:
            self._err(500, str(e))

    # ---- DELETE
    def do_DELETE(self):
        p = urlparse(self.path).path
        try:
            if not self._auth_ok():
                return self._err(401, "Yetkisiz")
            db = load_db()
            m = re.match(r"^/api/admin/(projects|services|appointments|messages)/([\w-]+)$", p)
            if m:
                key, rid = m.group(1), m.group(2)
                before = len(db[key])
                db[key] = [r for r in db[key] if r["id"] != rid]
                if len(db[key]) == before:
                    return self._err(404, "Kayıt bulunamadı")
                save_db(db); return self._json({"ok": True})
            return self._err(404, "Bulunamadı")
        except Exception as e:
            self._err(500, str(e))


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    load_db()  # ilk çalıştırmada seed
    srv = ThreadingHTTPServer(("0.0.0.0", port), Handler)
    print(f"TadilatBodrum sitesi çalışıyor →  http://localhost:{port}")
    print(f"Admin paneli               →  http://localhost:{port}/admin  (varsayılan şifre: {DEFAULT_PASSWORD})")
    srv.serve_forever()


if __name__ == "__main__":
    main()
