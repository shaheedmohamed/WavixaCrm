<?php

namespace App\Console\Commands;

use App\Jobs\FetchBusinessProfileJob;
use App\Models\WhatsAppConversation;
use App\Models\WhatsAppMessage;
use App\Services\GeoLocator;
use Illuminate\Console\Command;

/**
 * Fill geo fields for messages/conversations that predate the feature:
 * sender_country from the phone prefix, lat/lng parsed out of shared
 * location pins, contact_country on conversations. Optionally dispatches
 * the business-profile pull for contacts that never got checked.
 */
class CrmGeoBackfill extends Command
{
    protected $signature = 'crm:geo-backfill
                            {--with-profiles : Also queue a business-profile pull for unchecked conversations}
                            {--limit=0 : Cap the number of business-profile pulls dispatched}';

    protected $description = 'Backfill message sender_country / location pins and conversation contact_country for the geo stats page.';

    public function handle(): int
    {
        // 1) Incoming messages → sender_country from the `from` digits.
        // `from` stores phone digits for 1:1 senders and group participants —
        // except unresolved LID senders, whose numeric id is NOT a phone
        // number. Known LIDs live in whatsapp_lid_mappings; skip those rows
        // instead of pinning a wrong country on them.
        $lidSet = \Illuminate\Support\Facades\DB::table('whatsapp_lid_mappings')
            ->pluck('lid')
            ->mapWithKeys(fn ($lid) => [preg_replace('/\D/', '', (string) $lid) => true]);
        // Unmapped LIDs slip through as raw digits in `from` — they are
        // almost always longer than any real international number, so the
        // >13-digit guard is the second net after the mappings lookup.
        $looksLid = fn (?string $from) => isset($lidSet[(string) $from]) || strlen((string) $from) > 13;
        $countries = 0;
        $pins = 0;
        WhatsAppMessage::whereNull('sender_country')
            ->where('direction', 'incoming')
            ->whereNotNull('from')
            ->select(['id', 'from', 'message', 'message_type', 'latitude', 'longitude'])
            ->chunkById(1000, function ($rows) use (&$countries, &$pins, $looksLid) {
                foreach ($rows as $m) {
                    $updates = [];
                    $cc = $looksLid($m->from) ? null : GeoLocator::countryFromPhone($m->from);
                    if ($cc) {
                        $updates['sender_country'] = $cc;
                    }
                    if ($m->message_type === 'location' && $m->latitude === null) {
                        $loc = GeoLocator::parseLatLng($m->message);
                        if ($loc) {
                            $updates['latitude'] = $loc[0];
                            $updates['longitude'] = $loc[1];
                            $pins++;
                        }
                    }
                    if ($updates) {
                        WhatsAppMessage::where('id', $m->id)->update($updates);
                        if ($cc) {
                            $countries++;
                        }
                    }
                }
            });
        $this->info("Messages: {$countries} stamped with sender_country, {$pins} location pins parsed.");

        // 2) Conversations → contact_country from contact_phone/jid.
        $convCount = 0;
        WhatsAppConversation::whereNull('contact_country')
            ->whereNotNull('contact_jid')
            ->select(['id', 'contact_jid', 'contact_phone'])
            ->chunkById(500, function ($rows) use (&$convCount) {
                foreach ($rows as $c) {
                    $cc = GeoLocator::countryFromPhone($c->contact_phone)
                        ?? GeoLocator::countryFromJid($c->contact_jid);
                    if ($cc) {
                        WhatsAppConversation::where('id', $c->id)->update(['contact_country' => $cc]);
                        $convCount++;
                    }
                }
            });
        $this->info("Conversations: {$convCount} stamped with contact_country.");

        // 3) Optional: queue business-profile pulls for unchecked 1:1 chats.
        if ($this->option('with-profiles')) {
            $limit = (int) $this->option('limit');
            $pending = WhatsAppConversation::where('business_profile_attempts', 0)
                ->whereNotNull('contact_jid')
                ->where('contact_jid', 'not like', '%@g.us')
                ->where('contact_jid', 'not like', '%@broadcast%')
                ->orderByDesc('last_message_at')
                ->when($limit > 0, fn ($q) => $q->limit($limit))
                ->pluck('id');
            foreach ($pending as $i => $id) {
                FetchBusinessProfileJob::dispatch($id)->delay(now()->addSeconds($i * 2));
                WhatsAppConversation::where('id', $id)->increment('business_profile_attempts');
            }
            $this->info("Queued {$pending->count()} business-profile pulls (staggered 2s apart).");
        }

        return self::SUCCESS;
    }
}
