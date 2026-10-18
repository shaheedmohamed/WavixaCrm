# Wavixa CRM — New Server Setup

Standalone Laravel + Vue app living at `/var/www/WavixaCRM` with its own DB
(`wavixa_crm`). It shares the **same domain** (`wavixa.net`) and the **same
WhatsApp engine** as the main Wavixa app — deploy the main
`shaheedmohamed/Wavixa` repo first (its `SERVER_SETUP.md` contains the
`wavixa.net` nginx vhost that routes `/api/crm*` and `/crm/*` into this app).

## Production topology

| Piece | Source dir | Runs as | Path / port |
|---|---|---|---|
| CRM Laravel API | `backend/` | php8.5-fpm via nginx | `wavixa.net/api/crm*` (direct fastcgi) |
| CRM SPA | `frontend/` → `frontend/dist/` | static (served in place) | `wavixa.net/crm/*`, assets `/crm-static/*` |
| Internal vhost | `backend/public/` | nginx | `127.0.0.1:8088` (engine webhook fan-out) |
| Queue worker | `backend/` | `wavixa-crm-queue.service` | — |
| `whatsapp-engine/` | source reference — the LIVE instance runs from `/var/www/Wavixa/whatsapp-engine` | — | — |

## 1. Deploy code

```bash
cd /var/www && git clone git@github.com:shaheedmohamed/WavixaCrm.git WavixaCRM
```

## 2. MySQL

(same `wavixa_user` as the main app — DB created in the main repo's setup)

```sql
CREATE DATABASE IF NOT EXISTS wavixa_crm CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
GRANT ALL ON wavixa_crm.* TO 'wavixa_user'@'127.0.0.1';
GRANT ALL ON wavixa_crm.* TO 'wavixa_user'@'localhost';
FLUSH PRIVILEGES;
```

## 3. Laravel backend

```bash
cd /var/www/WavixaCRM/backend
composer install --no-dev --optimize-autoloader
cp .env.example .env            # real production values already inside
php artisan migrate --force
php artisan storage:link
php artisan config:cache
chown -R www-data:www-data storage bootstrap/cache public
```

## 4. Frontend

The CRM SPA is served **in place** from `frontend/dist/` by nginx
(`alias` under `/crm/` and `/crm-static/`) — do NOT copy it into
`backend/public/`.

```bash
cd /var/www/WavixaCRM/frontend
npm ci
cp .env.example .env.production
npm run build
chown -R www-data:www-data /var/www/WavixaCRM/frontend/dist
```

## 5. systemd — wavixa-crm-queue.service

```ini
[Unit]
Description=Wavixa CRM Queue Worker (separated CRM backend)
After=network.target mysql.service

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=/var/www/WavixaCRM/backend
ExecStart=/usr/bin/php /var/www/WavixaCRM/backend/artisan queue:work --sleep=3 --tries=3 --timeout=60
Restart=always
RestartSec=5
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
```

```bash
systemctl daemon-reload && systemctl enable --now wavixa-crm-queue
```

## 6. Nginx

Two pieces (both shown in full in the main repo's `SERVER_SETUP.md`):

1. **`wavixa.net` vhost** — routes `/api/crm*` to this app's
   `public/index.php` (direct fastcgi, bypassing the main Laravel app),
   `/crm/*` + `/crm-static/*` to `frontend/dist/`, and `/storage/crm_media/`
   to this app's public dir with fallback to the main one.
2. **`wavixa-crm-internal`** — `listen 127.0.0.1:8088`, root
   `/var/www/WavixaCRM/backend/public`. The WhatsApp engine posts a copy of
   every webhook here via `LARAVEL_API_URLS_EXTRA=http://127.0.0.1:8088/api`
   (set in `wavixa-engine.service`).

## 7. Things NOT in git — copy manually or redo

- `backend/public/storage/` uploaded media (`crm_media`, several GB) — rsync.
- WhatsApp sessions live on the shared engine — see the main repo's setup doc.

## 8. Verify

```bash
systemctl status wavixa-crm-queue
curl -s https://wavixa.net/crm/login -o /dev/null -w '%{http_code}\n'   # 200
curl -s http://127.0.0.1:8088/api/crm/conversations -o /dev/null -w '%{http_code}\n'  # 401/200, not 502
```
