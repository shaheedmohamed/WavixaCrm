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

    public static function notifyIncoming(int $userId, string $title, string $body, array $data = []): void
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

            foreach ($tokens as $token) {
                Http::timeout(10)
                    ->withToken($accessToken)
                    ->post("https://fcm.googleapis.com/v1/projects/{$projectId}/messages:send", [
                        'message' => [
                            'token' => $token,
                            'notification' => [
                                'title' => $title,
                                'body' => mb_substr($body, 0, 180),
                            ],
                            'android' => [
                                'priority' => 'HIGH',
                                'notification' => [
                                    'channel_id' => 'wavixa_messages',
                                    'sound' => 'notify_ding',
                                    'notification_priority' => 'PRIORITY_HIGH',
                                    'default_vibrate_timings' => true,
                                    'default_light_settings' => true,
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
