<?php

namespace App\Jobs;

use App\Models\WhatsAppConversation;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Pull a contact's WhatsApp Business profile (published address + pin) via
 * the engine's w:biz query — the only sender location WhatsApp exposes
 * without the customer sharing it. Personal accounts return null and only
 * the checked stamp moves forward.
 */
class FetchBusinessProfileJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public $tries = 2;

    public function __construct(
        public int $conversationId,
    ) {}

    public function handle(): void
    {
        $conversation = WhatsAppConversation::find($this->conversationId);
        $session = $conversation?->session;
        if (!$conversation || !$session || !$session->session_token || $session->status !== 'connected') {
            return;
        }

        $jid = $conversation->contact_jid;
        if (!$jid || str_contains($jid, '@g.us') || str_contains($jid, '@broadcast')) {
            return;
        }

        try {
            $engineUrl = rtrim(config('services.whatsapp.url', 'http://127.0.0.1:3005'), '/');
            $apiKey = config('services.whatsapp.api_key', 'wavixa-local-api-key-2026');

            $res = Http::withHeaders(['Authorization' => 'Bearer ' . $apiKey])
                ->timeout(20)
                ->post("{$engineUrl}/internal/business-profile", [
                    'sessionId' => $session->session_token,
                    'jid' => $jid,
                ]);

            if (!$res->ok()) {
                return;
            }

            $profile = $res->json('profile');
            $updates = ['business_profile_checked_at' => now()];
            if (is_array($profile)) {
                $lat = isset($profile['latitude']) && is_numeric($profile['latitude']) ? (float) $profile['latitude'] : null;
                $lng = isset($profile['longitude']) && is_numeric($profile['longitude']) ? (float) $profile['longitude'] : null;
                $updates = array_merge($updates, array_filter([
                    'business_address' => !empty($profile['address']) ? mb_substr((string) $profile['address'], 0, 250) : null,
                    'business_latitude' => ($lat !== null && $lat >= -90 && $lat <= 90) ? $lat : null,
                    'business_longitude' => ($lng !== null && $lng >= -180 && $lng <= 180) ? $lng : null,
                ], fn ($v) => $v !== null));

                // A real phone-number JID in the reply also fixes a missing
                // country on contacts reached through a LID address.
                if (empty($conversation->contact_country) && !empty($profile['jid'])) {
                    $cc = \App\Services\GeoLocator::countryFromJid((string) $profile['jid']);
                    if ($cc) {
                        $updates['contact_country'] = $cc;
                    }
                }
            }
            $conversation->update($updates);
        } catch (\Throwable $e) {
            Log::warning("Business profile fetch failed for conversation {$this->conversationId}: " . $e->getMessage());
        }
    }
}
