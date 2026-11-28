<?php

namespace App\Console\Commands;

use App\Models\CrmScheduledMessage;
use App\Models\WhatsAppMessage;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Deliver due crm_scheduled_messages — text rows an agent parked for later.
 * Runs every minute via the scheduler; each send goes through the same engine
 * route a live send uses so delivery receipts/status flow normally.
 */
class CrmSendScheduled extends Command
{
    protected $signature = 'crm:send-scheduled';
    protected $description = 'Send due scheduled CRM WhatsApp messages';

    public function handle(): int
    {
        $engineUrl = rtrim((string) env('WHATSAPP_SERVICE_URL', 'http://127.0.0.1:3005'), '/');
        $apiKey = env('WHATSAPP_API_KEY');

        $due = CrmScheduledMessage::where('status', 'pending')
            ->where('send_at', '<=', now())
            ->orderBy('send_at')
            ->limit(50)
            ->get();

        foreach ($due as $row) {
            // Claim the row so a second overlapping run can't double-send.
            $claimed = CrmScheduledMessage::where('id', $row->id)
                ->where('status', 'pending')
                ->update(['status' => 'sending']) > 0;
            if (!$claimed) continue;

            try {
                $conv = $row->conversation;
                $session = $conv?->session;
                if (!$conv || !$session || !$session->session_token) {
                    throw new \RuntimeException('no live session');
                }

                $dest = $conv->contact_jid
                    ?: (preg_replace('/\D/', '', (string) $conv->contact_phone) . '@s.whatsapp.net');

                $res = Http::withHeaders(['Authorization' => 'Bearer ' . $apiKey])
                    ->timeout(30)
                    ->post("{$engineUrl}/api/whatsapp/send-message", [
                        'sessionId' => $session->session_token,
                        'to' => $dest,
                        'message' => $row->body,
                        'type' => 'text',
                    ]);

                $engineData = $res->json();
                $messageId = $engineData['messageId'] ?? ('out_' . uniqid());

                $lockName = 'wa_msg_sent_' . sha1($session->id . '|' . $messageId);
                $locked = (int) (DB::select('SELECT GET_LOCK(?, 10) AS l', [$lockName])[0]->l ?? 0);
                try {
                    $msg = WhatsAppMessage::where('message_id', $messageId)->first()
                        ?? WhatsAppMessage::create([
                            'user_id' => $conv->user_id,
                            'sent_by_user_id' => $row->user_id,
                            'session_id' => $session->id,
                            'conversation_id' => $conv->id,
                            'from' => $session->phone_number,
                            'to' => $dest,
                            'message' => $row->body,
                            'message_type' => 'text',
                            'message_id' => $messageId,
                            'direction' => 'outgoing',
                            'status' => 'sent',
                            'sent_at' => now(),
                            'timestamp' => now(),
                        ]);
                } finally {
                    if ($locked) DB::select('SELECT RELEASE_LOCK(?)', [$lockName]);
                }

                $conv->update([
                    'last_message' => $row->body,
                    'last_message_at' => now(),
                    'last_message_type' => 'text',
                    'last_message_direction' => 'outgoing',
                    'last_message_status' => 'sent',
                ]);

                try {
                    event(new \App\Events\CrmRealtimeEvent($conv->user_id, 'message.new', [
                        'conversation_id' => $conv->id,
                        'message' => $msg->toArray(),
                        'conversation' => $conv->only([
                            'id', 'last_message', 'last_message_at', 'last_message_type',
                            'last_message_direction', 'last_message_status', 'unread_count',
                        ]),
                    ]));
                } catch (\Throwable $e) {
                    Log::debug('scheduled broadcast failed: ' . $e->getMessage());
                }

                $row->update(['status' => 'sent', 'sent_message_id' => $msg->id]);
            } catch (\Throwable $e) {
                $row->update(['status' => 'failed', 'fail_reason' => mb_substr($e->getMessage(), 0, 250)]);
                Log::warning("crm:send-scheduled failed for #{$row->id}: " . $e->getMessage());
            }
        }

        return self::SUCCESS;
    }
}
