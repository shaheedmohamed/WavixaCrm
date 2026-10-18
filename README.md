# Wavixa CRM — Standalone Bundle

Separated customer-service CRM extracted from the Wavixa platform. Runs as a
self-contained stack with its own database (`wavixa_crm`).

## Layout

```
WavixaCRM/
├── backend/          Laravel 12 — serves all /api/crm/* endpoints
│                     (conversations, devices, agents, groups, performance)
├── frontend/         Vue 3 SPA — the CRM pages (login, chat, devices,
│                     agents, performance) — built with base=/crm-static/
├── whatsapp-engine/  TypeScript WhatsApp engine source (build with
│                     `npm ci && npm run build`; needs Node, Redis, MySQL env)
├── crm_data.sql      Data export imported into wavixa_crm
└── README.md
```

## How it is wired on this server

- `https://wavixa.net/crm/*`        → `frontend/dist` (SPA)
- `https://wavixa.net/crm-static/*` → built JS/CSS assets
- `https://wavixa.net/api/crm/*`    → `backend/public/index.php` (wavixa_crm)
- `http://127.0.0.1:8088`           → internal vhost → same backend, used by
  the engine as a *secondary* webhook target (`LARAVEL_API_URLS_EXTRA` in
  `wavixa-engine.service`). Every WhatsApp event is POSTed to BOTH the main
  platform DB and `wavixa_crm`.
- `/storage/crm_media/*`            → `backend/public/storage/crm_media`
- Queue worker: `wavixa-crm-queue.service` (`artisan queue:work`)
- Realtime: shared Reverb (`/reverb/app`); channel auth hits
  `POST /api/crm/broadcasting/auth` on the CRM backend.

## Moving to another server

1. Copy this whole folder to the new server.
2. `cd backend && composer install` (vendor is included; reinstall if PHP
   versions differ), create DB, edit `.env` (`DB_*`, `APP_URL`,
   `WHATSAPP_SERVICE_URL`, `REVERB_*`), `php artisan migrate --force`,
   `php artisan config:cache`, import `crm_data.sql` (optional).
3. `cd frontend && npm ci && npm run build`, deploy `dist/`.
4. `cd whatsapp-engine && npm ci && npm run build`, configure env
   (`LARAVEL_API_URL=http(s)://<crm-host>/api` — single target now; the
   `LARAVEL_API_URLS_EXTRA` fan-out is only needed while it stays shared
   with the main platform).
5. Serve `backend/public` for `/api/*` (or the whole vhost) + `frontend/dist`
   for the SPA. Keep base paths or adjust `vite.config.js` base + nginx.
6. Re-pair WhatsApp numbers in the CRM UI — sessions cannot be cloned.
7. Services to run: php-fpm, `artisan queue:work` (systemd unit in
   `wavixa-crm-queue.service`), `php artisan reverb:start` if you need
   realtime on the new host, engine under systemd/pm2.

## Admin dashboard pages

Owner-only admin pages (`meta.requiresOwner` in `frontend/src/router/index.js`,
backed by `CrmAdminController` under `/api/crm/admin/*` — all real DB rows):

- `/crm/dashboard` — KPIs + 7-day message series + recent team activity
  (`admin/overview`)
- `/crm/monitor` — full conversation table, filters, reopen/delete
  (`admin/conversations`, `POST .../reopen`, `DELETE .../{id}`)
- `/crm/contacts` — customers deduplicated by phone (`admin/contacts`)
- `/crm/audit` — team activity/audit trail (`admin/activity`)
- `/crm/security` — login attempts for owner + agents (`admin/logins`)
- `/crm/settings` — profile + password, owner and agents
  (`PUT admin/profile`, `PUT admin/password`)
