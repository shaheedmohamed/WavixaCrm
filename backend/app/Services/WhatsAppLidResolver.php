<?php

namespace App\Services;

use App\Models\WhatsAppConversation;
use App\Models\WhatsAppMessage;
use App\Models\WhatsAppSession;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Unifies WhatsApp contact identities that surface under multiple JIDs —
 * a phone-number JID (2010..@s.whatsapp.net), a LID (4014..@lid), or
 * device-suffixed variants — into a single CRM conversation.
 */
class WhatsAppLidResolver
{
    /**
     * SQL matching stored WhatsApp CDN avatar URLs whose signature expired.
     * pps.whatsapp.net links carry `oe=<hex unix-ts>` — past that second the
     * URL answers 403 and the avatar renders blank forever unless re-fetched.
     */
    public const EXPIRED_AVATAR_SQL =
        "contact_avatar LIKE '%oe=%' AND CAST(CONV(SUBSTRING_INDEX(SUBSTRING_INDEX(contact_avatar, 'oe=', -1), '&', 1), 16, 10) AS UNSIGNED) <= ?";

    /**
     * Reassign $twin's messages to $keep, prefer the better contact name,
     * fold timestamps/unread counts, then delete the duplicate row.
     */
    public function mergeConversationInto(WhatsAppConversation $keep, WhatsAppConversation $twin): void
    {
        WhatsAppMessage::where('conversation_id', $twin->id)
            ->update(['conversation_id' => $keep->id]);

        $keepPlaceholder = !$keep->contact_name || preg_match('/^\+?\d+$/', (string) $keep->contact_name);
        $twinPlaceholder = !$twin->contact_name || preg_match('/^\+?\d+$/', (string) $twin->contact_name);
        if ($keepPlaceholder && !$twinPlaceholder) {
            $keep->contact_name = $twin->contact_name;
        }

        if (!$keep->contact_username && $twin->contact_username) {
            $keep->contact_username = $twin->contact_username;
        }

        if (
            $twin->last_message_at
            && (!$keep->last_message_at || $twin->last_message_at->gt($keep->last_message_at))
        ) {
            $keep->last_message_at = $twin->last_message_at;
            $keep->last_message = $twin->last_message;
            $keep->last_message_type = $twin->last_message_type;
            $keep->last_message_direction = $twin->last_message_direction;
            $keep->last_message_status = $twin->last_message_status;
        }

        $keep->unread_count = ($keep->unread_count ?? 0) + ($twin->unread_count ?? 0);
        $keep->save();
        $twin->delete();
    }

    /**
     * Merge any conversation in $session that represents the same contact as
     * $keep — matched by phone number or by a known LID→PN mapping.
     */
    public function mergeTwinsFor(WhatsAppSession $session, WhatsAppConversation $keep): void
    {
        $phone = $keep->contact_phone;
        if (!$phone) {
            return;
        }

        $pnJid = $phone . '@s.whatsapp.net';
        $twinJids = DB::table('whatsapp_lid_mappings')
            ->whereIn('pn', [$pnJid, $phone])
            ->pluck('lid')
            ->all();
        $twinJids = array_values(array_diff(
            array_merge([$pnJid], $twinJids),
            [$keep->contact_jid]
        ));

        $twins = WhatsAppConversation::where('session_id', $session->id)
            ->where('id', '!=', $keep->id)
            ->where(function ($q) use ($phone, $twinJids) {
                $q->where('contact_phone', $phone);
                if ($twinJids) {
                    $q->orWhereIn('contact_jid', $twinJids);
                }
            })
            ->get();

        foreach ($twins as $twin) {
            $this->mergeConversationInto($keep, $twin);
        }
    }

    /**
     * Merge the conversation keyed by a LID JID into the PN conversation now
     * that a senderLid→PN link was learned from live traffic.
     */
    public function mergeLidConversation(WhatsAppSession $session, string $lidJid, WhatsAppConversation $keep): void
    {
        $twin = WhatsAppConversation::where('session_id', $session->id)
            ->where('contact_jid', $lidJid)
            ->where('id', '!=', $keep->id)
            ->first();
        if ($twin) {
            $this->mergeConversationInto($keep, $twin);
        }
    }

    /**
     * Ask the engine to resolve counterpart JIDs for the session's contacts.
     * usync reveals a LID for a queried PN JID (and vice versa when the
     * account exposes it); each learned pair merges matching LID-keyed
     * conversations into their phone-number row.
     */
    public function resolveSessionTwins(WhatsAppSession $session): void
    {
        // Apply every stored mapping first — mappings learned from sender_pn
        // or history chunks resolve LIDs the usync query cannot.
        $this->applyStoredMappings($session);

        if (!$session->session_token) {
            return;
        }

        $jids = WhatsAppConversation::where('session_id', $session->id)
            ->pluck('contact_jid')
            ->filter(fn ($j) => $j && (str_ends_with($j, '@s.whatsapp.net') || str_ends_with($j, '@lid')))
            ->values()
            ->all();
        if (!$jids) {
            return;
        }

        try {
            $engineUrl = rtrim(config('services.whatsapp.url', 'http://127.0.0.1:3005'), '/');
            $apiKey = config('services.whatsapp.api_key', 'wavixa-local-api-key-2026');

            $res = Http::withHeaders(['Authorization' => 'Bearer ' . $apiKey])
                ->timeout(15)
                ->post("{$engineUrl}/internal/lid/resolve", [
                    'sessionId' => $session->session_token,
                    'lids' => array_slice($jids, 0, 400),
                ]);

            $mappings = $res->ok() ? ($res->json('mappings') ?: []) : [];
            foreach ($mappings as $queried => $counterpart) {
                $lidJid = str_ends_with($queried, '@lid') ? $queried
                    : (str_ends_with($counterpart, '@lid') ? $counterpart : null);
                $pnJid = str_ends_with($queried, '@lid') ? $counterpart
                    : (str_ends_with($counterpart, '@lid') ? $queried : null);
                if (!$lidJid || !$pnJid) {
                    continue;
                }

                DB::table('whatsapp_lid_mappings')->updateOrInsert(
                    ['lid' => $lidJid],
                    ['pn' => $pnJid, 'updated_at' => now(), 'created_at' => now()]
                );
            }
        } catch (\Throwable $e) {
            Log::warning('LID twin resolution failed: ' . $e->getMessage());
        }

        // Engine may have learned new pairs — apply again.
        $this->applyStoredMappings($session);
    }

    /**
     * Batch-fetch WhatsApp profile picture URLs for conversations that do
     * not have one yet. WhatsApp CDN URLs are signed but long-lived.
     */
    public function fetchAvatars(WhatsAppSession $session, int $limit = 80, ?array $sessionIds = null): void
    {
        if (!$session->session_token) {
            return;
        }

        $convs = WhatsAppConversation::whereIn('session_id', $sessionIds ?: [$session->id])
            ->where(function ($q) {
                $q->whereNull('contact_avatar')
                  ->orWhere(function ($q2) {
                      // Retry misses once a day — the contact may upload a
                      // picture after the first lookup.
                      $q2->where('contact_avatar', '')
                         ->where('updated_at', '<', now()->subDay());
                  })
                  ->orWhere(function ($q3) {
                      // Stored CDN links are signed; once `oe` lapses the
                      // picture 403s and stays blank — re-queue it, retrying
                      // at most hourly while it keeps failing.
                      $q3->whereRaw(self::EXPIRED_AVATAR_SQL, [time()])
                         ->where('updated_at', '<', now()->subHour());
                  });
            })
            ->whereNotNull('contact_jid')
            ->where('contact_jid', '!=', '')
            ->where('contact_jid', 'not like', '%@broadcast%')
            ->limit($limit)
            ->get(['id', 'contact_jid']);

        if ($convs->isEmpty()) {
            return;
        }

        try {
            $engineUrl = rtrim(config('services.whatsapp.url', 'http://127.0.0.1:3005'), '/');
            $apiKey = config('services.whatsapp.api_key', 'wavixa-local-api-key-2026');

            $res = Http::withHeaders(['Authorization' => 'Bearer ' . $apiKey])
                ->timeout(15)
                ->post("{$engineUrl}/internal/picture/resolve", [
                    'sessionId' => $session->session_token,
                    'jids' => $convs->pluck('contact_jid')->all(),
                ]);

            if (!$res->ok()) {
                return;
            }

            $pictures = $res->json('pictures') ?: [];
            foreach ($convs as $conv) {
                $url = $pictures[$conv->contact_jid] ?? null;
                if ($url) {
                    // CDN links expire — download once, serve our own copy
                    // forever so the avatar can never 403 again.
                    $local = $this->storeAvatarLocally($conv->id, $url);
                    $conv->update(['contact_avatar' => $local ?: $url]);
                } else {
                    // Mark misses so they are not re-queried every request —
                    // a refresh pass can clear the marker later.
                    $conv->update(['contact_avatar' => '']);
                }
            }
        } catch (\Throwable $e) {
            Log::warning('Avatar fetch failed: ' . $e->getMessage());
        }
    }

    /** Download a signed CDN avatar once into local storage; returns the
     *  app-relative path to store (null when the download fails). */
    private function storeAvatarLocally(int $convId, string $url): ?string
    {
        try {
            $img = \Illuminate\Support\Facades\Http::timeout(10)->get($url);
            if (!$img->successful() || !$img->body()) {
                return null;
            }
            $dir = storage_path('app/avatars');
            if (!is_dir($dir)) {
                mkdir($dir, 0755, true);
            }
            $file = "{$dir}/{$convId}.jpg";
            file_put_contents($file, $img->body());
            return "/api/crm/avatar/{$convId}";
        } catch (\Throwable $e) {
            return null;
        }
    }

    /**
     * Batch-resolve WhatsApp @usernames for conversations that never got one
     * from a history chunk. NULL = not queried yet, '' = checked (no handle,
     * retried after a day), string = the handle.
     */
    public function fetchUsernames(WhatsAppSession $session, int $limit = 100): void
    {
        if (!$session->session_token) {
            return;
        }

        $convs = WhatsAppConversation::where('session_id', $session->id)
            ->where(function ($q) {
                $q->whereNull('contact_username')
                  ->orWhere(function ($q2) {
                      $q2->where('contact_username', '')
                         ->where('updated_at', '<', now()->subDay());
                  });
            })
            ->whereNotNull('contact_jid')
            ->where('contact_jid', '!=', '')
            ->where('contact_jid', 'not like', '%@g.us')
            ->where('contact_jid', 'not like', '%@broadcast%')
            ->limit($limit)
            ->get(['id', 'contact_jid']);

        if ($convs->isEmpty()) {
            return;
        }

        try {
            $engineUrl = rtrim(config('services.whatsapp.url', 'http://127.0.0.1:3005'), '/');
            $apiKey = config('services.whatsapp.api_key', 'wavixa-local-api-key-2026');

            $res = Http::withHeaders(['Authorization' => 'Bearer ' . $apiKey])
                ->timeout(15)
                ->post("{$engineUrl}/internal/usernames", [
                    'sessionId' => $session->session_token,
                    'jids' => $convs->pluck('contact_jid')->all(),
                ]);

            if (!$res->ok()) {
                return;
            }

            $usernames = $res->json('usernames') ?: [];
            foreach ($convs as $conv) {
                $conv->update(['contact_username' => $usernames[$conv->contact_jid] ?? '']);
            }
        } catch (\Throwable $e) {
            Log::warning('Username fetch failed: ' . $e->getMessage());
        }
    }

    /**
     * Re-key or merge LID-keyed conversations using mappings already
     * persisted in whatsapp_lid_mappings.
     */
    public function applyStoredMappings(WhatsAppSession $session): void
    {
        // Only touch mappings for LIDs this session actually carries — the
        // table holds every account's pairs (thousands of rows).
        $lids = WhatsAppConversation::where('session_id', $session->id)
            ->where('contact_jid', 'like', '%@lid')
            ->pluck('contact_jid');
        if ($lids->isEmpty()) {
            return;
        }

        $pairs = DB::table('whatsapp_lid_mappings')->whereIn('lid', $lids)->pluck('pn', 'lid');
        foreach ($pairs as $lidJid => $pnJid) {
            if (!is_string($pnJid) || !str_ends_with($pnJid, '@s.whatsapp.net')) {
                continue;
            }

            $lidConv = WhatsAppConversation::where('session_id', $session->id)
                ->where('contact_jid', $lidJid)
                ->first();
            if (!$lidConv) {
                continue;
            }

            $pnConv = WhatsAppConversation::where('session_id', $session->id)
                ->where('contact_jid', $pnJid)
                ->first();

            if ($pnConv) {
                $this->mergeConversationInto($pnConv, $lidConv);
            } else {
                $lidConv->contact_jid = $pnJid;
                $lidConv->contact_phone = preg_replace('/\D/', '', explode('@', $pnJid)[0]);
                $lidConv->save();
            }
        }
    }

}
