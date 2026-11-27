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

## Mobile app self-update (2026-11-27) — no more manual APK sideloads

In-app force-update for the employee app (Android). NOT expo-updates — that
module stays disabled (`expo.modules.updates.ENABLED=false` in the manifest).

- **Release (the normal flow):** `bash mobile/scripts/release-apk.sh
  [--notes="…"] [--name X.Y.Z] [--optional]`. Builds
  `android/app/build/outputs/apk/release/app-release.apk` with gradle
  (JAVA_HOME=/opt/jdk-17.0.21.1+2 — not on PATH by default), stages it as
  `apk/wavixa-v<vc>-<name>.apk`, publishes, then auto-bumps
  `android/version.properties` (VERSION_CODE +1, patch +1) which
  `app/build.gradle` reads — versions never collide and need no manual edits.
- **Publish (standalone, when the APK is already on the server):**
  `php artisan crm:apk-publish <path-to.apk> [--notes="…"] [--optional] [--force]`
  in `backend/`. Reads package/versionCode/versionName from the APK binary via
  `aapt dump badging` (`/opt/android-sdk/build-tools/37.0.0/aapt`), copies the
  file into `/var/www/WavixaCRM/apk/` (nginx `location ^~ /apk/` → direct
  `https://crm.wavixa.net/apk/<file>` downloads), refreshes the
  `wavixa-latest.apk`/`carebot-latest.apk` pointers, inserts an `app_releases`
  row, then broadcasts `app.update` on `private-crm.{ownerId}` for every owner
  → signed-in phones wall themselves within a second.
- **Check:** public `GET /api/app-release/latest` (`AppReleaseController`,
  `throttle:public` — must work pre-login). App compares its
  `Application.nativeBuildVersion` (versionCode) — never versionName.
- **App side:** `UpdateGate` (`mobile/src/components/UpdateGate.tsx`, mounted
  in `_layout.tsx`) checks on launch / AppState-active / 5-min timer /
  `app.update` realtime event. `services/appUpdate.ts` downloads via
  `File.createDownloadTask` to `Paths.cache`, verifies size+sha256, then fires
  `ACTION_VIEW` on `file.contentUri` (expo-file-system's own FileProvider) →
  system installer. Requires `REQUEST_INSTALL_PACKAGES` (in AndroidManifest +
  app.json android.permissions). If "install unknown apps" is off, the flow
  deep-links to `MANAGE_UNKNOWN_APP_SOURCES` and resumes on return.
- Android cannot fully silently self-update (needs device-owner/root/Play
  Store) — the user taps "update" once in the system dialog; everything else
  is automatic, no browser involved.
- Old builds without the gate (≤ vc6) ignore the system — the first gated
  build still ships manually once; every release after that self-installs.

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
