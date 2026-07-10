# Yayınlama & Önizleme

Bu repo iki şeyi bir arada barındırır:

1. **Tam uygulama** — `server.py` + `public/` (Python backend: admin paneli, formlar, API)
2. **Statik önizleme** — `docs/` klasörü (yalnızca vitrin; GitHub Pages ile ücretsiz yayınlanır)

---

## A) Hızlı önizleme — GitHub Pages (backend YOK)

`docs/` klasörü, backend'e ulaşamadığında gömülü örnek verilerle **dolu** görünecek
şekilde hazırlanmıştır. Böylece tasarımı tarayıcıda anında görebilirsiniz.

**Kurulum (bir kez):**
1. Repo → **Settings → Pages**
2. **Source:** *Deploy from a branch*
3. **Branch:** `main`  •  **Folder:** `/docs` → **Save**
4. 1–2 dakika içinde şu adres yayına girer:

   **https://aligokten.github.io/tadilatbodrum.com/**

> ⚠️ Statik önizlemede admin paneli, iletişim formu ve keşif randevusu **canlıya
> kaydetmez** — form gönderiminde "(Önizleme)" mesajı gösterilir. Tam işlevsellik
> için aşağıdaki (B) gerçek sunucu kurulumu gerekir.

`public/` içeriğini değiştirdiğinizde statik önizlemeyi tazelemek için:

```bash
python3 build_docs.py   # docs/ klasörünü public/'ten yeniden üretir
git add docs && git commit -m "docs güncelle" && git push
```

---

## B) Tam yayın — gerçek sunucu (admin + formlar çalışır)

`saggplus.com` ile aynı mantık: bir VPS üzerinde Python sunucusu + Nginx (HTTPS).

```bash
# sunucuda
git clone https://github.com/aligokten/tadilatbodrum.com.git
cd tadilatbodrum.com
python3 server.py 8000        # ya da systemd servisi olarak
```

Nginx reverse proxy örneği (`/etc/nginx/sites-available/tadilatbodrum`):

```nginx
server {
    server_name tadilatbodrum.com www.tadilatbodrum.com;
    client_max_body_size 20M;              # görsel yüklemeleri için
    location / { proxy_pass http://127.0.0.1:8000; proxy_set_header Host $host; }
}
```

Sonra `certbot --nginx -d tadilatbodrum.com -d www.tadilatbodrum.com` ile HTTPS.
Alan adının DNS'ini bu sunucunun IP'sine yönlendirmeyi unutmayın (şu an Wix'te).

- İlk girişte admin şifresini (`exalmc11`) mutlaka değiştirin.
- `data/` ve `uploads/` klasörlerini yedekleyin — tüm içerik oradadır.
