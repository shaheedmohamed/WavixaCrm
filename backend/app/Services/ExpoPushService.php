<?php

namespace App\Services;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Direct FCM HTTP v1 push sender — no Expo relay. The mobile app registers
 * its native FCM token via POST /api/crm/push-token; tokens land on
 * users.expo_push_tokens as JSON {token, platform, device_name}.
 * OAuth: sign a JWT with the service-account RSA key → swap for an access
 * token at googleapis → POST messages:send.
 */
class ExpoPushService
{
    private const SA_PATH = 'firebase/service-account.json';

    // First versionCode whose build renders msg.incoming data pushes itself
    // (headless Notifee with reply/read actions). Older builds still need
    // the OS-posted `notification` payload or they'd see nothing at all.
    private const ACTIONABLE_PUSH_MIN_VC = 7;

    public static function notifyIncoming(int $userId, string $title, string $body, array $data = []): void
    {
        try {
            $user = \App\Models\User::find($userId);
            $tokenRows = collect($user?->expo_push_tokens ?? [])
                ->filter(fn ($t) => ! empty($t['token'] ?? null))
                ->unique('token')->values();
            if ($tokenRows->isEmpty()) return;

            $accessToken = self::accessToken();
            if (!$accessToken) return;

            $sa = self::serviceAccount();
            $projectId = $sa['project_id'];

            // WhatsApp-style bundling: every message of one conversation
            // carries the same notification tag + collapse key, so Android
            // keeps a single tray entry per chat that updates in place. The
            // recent lines accumulate here so the updated notification shows
            // the whole unread burst, expanded.
            $convId = (int) ($data['conversation_id'] ?? 0);
            $data['user_id'] = (string) $userId;
            $tag = null;
            $count = 1;
            if ($convId > 0) {
                $tag = 'conv_' . $convId;
                $key = self::bufferKey($userId, $convId);
                $lines = Cache::get($key, []);
                if (!in_array($body, $lines, true)) {
                    $lines[] = $body;
                }
                $lines = array_slice($lines, -6);
                Cache::put($key, $lines, now()->addMinutes(30));
                $count = count($lines);
                $body = implode("\n", $lines);
                if ($count > 1) {
                    $title = "{$title} ({$count})";
                }
            }

            foreach ($tokenRows as $row) {
                $token = $row['token'];
                $actionable = (int) ($row['version_code'] ?? 0) >= self::ACTIONABLE_PUSH_MIN_VC;
                if ($actionable) {
                    // Data-only → the app's headless task renders Notifee
                    // with رد/مقروء actions and its own tag bundling.
                    self::sendDataPushToToken($accessToken, $projectId, $token, [
                        'type' => 'msg.incoming',
                        'user_id' => (string) $userId,
                        'conversation_id' => (string) ($data['conversation_id'] ?? ''),
                        'title' => $title,
                        'body' => $body,
                        'tag' => (string) ($tag ?? ''),
                        'count' => (string) $count,
                    ]);
                    continue;
                }
                Http::timeout(10)
                    ->withToken($accessToken)
                    ->post("https://fcm.googleapis.com/v1/projects/{$projectId}/messages:send", [
                        'message' => [
                            'token' => $token,
                            'notification' => [
                                'title' => $title,
                                'body' => mb_substr($body, 0, 500),
                            ],
                            'android' => array_filter([
                                'collapse_key' => $tag,
                                'priority' => 'HIGH',
                                'notification' => array_filter([
                                    'tag' => $tag,
                                    // v2 channel: channel sound is immutable —
                                    // must match CHANNEL_ID in the app's
                                    // services/notifications.ts.
                                    'channel_id' => 'wavixa_messages_v2',
                                    'sound' => 'notify_tone',
                                    'notification_priority' => 'PRIORITY_HIGH',
                                    'notification_count' => $count,
                                    'default_vibrate_timings' => true,
                                    'default_light_settings' => true,
                                ], fn ($v) => $v !== null),
                            ], fn ($v) => $v !== null),
                            'apns' => [
                                'payload' => [
                                    'aps' => ['sound' => 'notify_tone.wav'],
                                ],
                            ],
                            'data' => array_map('strval', $data),
                        ],
                    ]);
            }
        } catch (\Throwable $e) {
            Log::debug('FCM send failed: ' . $e->getMessage());
        }
    }

    /**
     * Data-only high-priority FCM — wakes the app process even when killed so
     * it can render its own UI (incoming-call full-screen, call cancellation).
     * No `notification` block on purpose: Android delivers data payloads to the
     * app's background task rather than posting a tray entry itself.
     */
    public static function sendDataPush(int $userId, array $data): void
    {
        try {
            $user = \App\Models\User::find($userId);
            $tokens = collect($user?->expo_push_tokens ?? [])
                ->pluck('token')->filter()->unique()->values();
            if ($tokens->isEmpty()) return;

            $accessToken = self::accessToken();
            if (!$accessToken) return;

            $sa = self::serviceAccount();
            $projectId = $sa['project_id'];
            $data['user_id'] = (string) $userId;

            foreach ($tokens as $token) {
                Http::timeout(10)
                    ->withToken($accessToken)
                    ->post("https://fcm.googleapis.com/v1/projects/{$projectId}/messages:send", [
                        'message' => [
                            'token' => $token,
                            'android' => [
                                'priority' => 'HIGH',
                                'direct_boot_ok' => true,
                            ],
                            'data' => array_map('strval', array_filter(
                                $data,
                                fn ($v) => $v !== null && $v !== ''
                            )),
                        ],
                    ]);
            }
        } catch (\Throwable $e) {
            Log::debug('FCM data push failed: ' . $e->getMessage());
        }
    }

    /** Single-token data-only send — used when notifyIncoming picks the
     *  actionable push for a build new enough to render it. */
    private static function sendDataPushToToken(string $accessToken, string $projectId, string $token, array $data): void
    {
        try {
            Http::timeout(10)
                ->withToken($accessToken)
                ->post("https://fcm.googleapis.com/v1/projects/{$projectId}/messages:send", [
                    'message' => [
                        'token' => $token,
                        'android' => [
                            'priority' => 'HIGH',
                            'direct_boot_ok' => true,
                        ],
                        'data' => array_map('strval', array_filter(
                            $data,
                            fn ($v) => $v !== null && $v !== ''
                        )),
                    ],
                ]);
        } catch (\Throwable $e) {
            Log::debug('FCM data push (token) failed: ' . $e->getMessage());
        }
    }

    /**
     * Drop the buffered lines once the conversation is read — the next push
     * starts a fresh burst instead of re-listing stale messages.
     */
    public static function clearConversation(int $userId, int $conversationId): void
    {
        try {
            Cache::forget(self::bufferKey($userId, $conversationId));
        } catch (\Throwable $e) {
            // Buffer cleanup must never break a request.
        }
    }

    private static function bufferKey(int $userId, int $conversationId): string
    {
        return "push_msgs_{$userId}_{$conversationId}";
    }

    private static function serviceAccount(): ?array
    {
        $path = storage_path('app/' . self::SA_PATH);
        if (!is_file($path)) {
            Log::debug('FCM service account file missing: ' . $path);
            return null;
        }
        return json_decode(file_get_contents($path), true);
    }

    /** Service-account JWT → Google OAuth2 access token (cached ~50 min). */
    private static function accessToken(): ?string
    {
        return Cache::remember('fcm_oauth_token', 3000, function () {
            $sa = self::serviceAccount();
            if (!$sa || empty($sa['private_key']) || empty($sa['client_email'])) return null;

            $now = time();
            $jwt = self::b64(json_encode(['alg' => 'RS256', 'typ' => 'JWT']))
                . '.' . self::b64(json_encode([
                    'iss' => $sa['client_email'],
                    'scope' => 'https://www.googleapis.com/auth/firebase.messaging',
                    'aud' => 'https://oauth2.googleapis.com/token',
                    'iat' => $now,
                    'exp' => $now + 3600,
                ]));
            openssl_sign($jwt, $sig, $sa['private_key'], OPENSSL_ALGO_SHA256);
            $jwt .= '.' . self::b64($sig);

            $res = Http::asForm()->timeout(10)->post('https://oauth2.googleapis.com/token', [
                'grant_type' => 'urn:ietf:params:oauth:grant-type:jwt-bearer',
                'assertion' => $jwt,
            ]);
            return $res->json('access_token');
        });
    }

    private static function b64(string $data): string
    {
        return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
    }
}
