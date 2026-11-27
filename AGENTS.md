# WavixaCRM — Project Notes

## Message geo-origin feature (2026-11-27)

Sender location is derived in three tiers (WhatsApp/Messenger/Telegram never
transmit sender IP or GPS — nothing more precise is available automatically):

1. **`whatsapp_messages.sender_country`** — ISO alpha-2 inferred from the
   sender's international phone prefix via `App\Services\GeoLocator`.
   Set at ingest in `WhatsAppWebhookController::messageReceived` and
   `historySync`. LID senders (`@lid`) must NOT be inferred — their digits
   are not phone numbers and mis-map to countries (e.g. `40…` → RO). Only
   real PN sources are passed in.
2. **`whatsapp_messages.latitude/longitude`** — shared location pins. The
   engine forwards `latitude`/`longitude` fields on `message-received`
   payloads and history-sync messages (`type=location`); the body
   `lat,lng` text is the fallback parser input.
3. **`whatsapp_conversations.business_*`** — the contact's published
   WhatsApp Business profile (address + pin) via engine
   `POST /internal/business-profile` → `WaClient.getBusinessProfile()`
   (`w:biz` IQ). Only WhatsApp Business accounts return data; personal
   accounts return `profile: null`. Dispatched as
   `FetchBusinessProfileJob` per new 1:1 incoming message while
   `business_profile_attempts < 5`; `business_profile_checked_at` =
   "query completed". Manual re-pull:
   `POST /api/crm/conversations/{id}/refresh-business-profile`.

Stats: `GET /api/crm/message-origins?days=N` (by_country / located / pins).
Page: `/crm/locations` (`CrmLocations.vue`, owner-only).

Backfill: `php artisan crm:geo-backfill [--with-profiles] [--limit=N]` —
stamps existing rows and optionally queues profile pulls (2s-staggered).

## Queue worker must be restarted after code changes

`wavixa-crm-queue.service` is a LONG-RUNNING `queue:work` daemon — PHP keeps
every already-loaded class in memory forever. After adding a job OR new
model columns: `systemctl restart wavixa-crm-queue`, or the stale in-memory
model silently DROPS new `$fillable` keys in `update()` calls (jobs report
DONE, rows never change — no error anywhere). Burned once (2026-11-27):
~200 business-profile jobs completed "successfully" while writing nothing.

Same rule applies to `wavixa-queue.service` on the main platform.

## Engine location

`wavixa-engine.service` runs `/var/www/Wavixa/whatsapp-engine/dist/index.js`.
After engine changes: `npm run build` there, then
`systemctl restart wavixa-engine`. CRM webhooks arrive on
`http://127.0.0.1:8088/api` (loopback, `wavixa-internal` vhost).
