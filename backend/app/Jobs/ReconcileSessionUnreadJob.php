<?php

namespace App\Jobs;

use App\Models\WhatsAppConversation;
use App\Models\WhatsAppMessage;
use App\Models\WhatsAppSession;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Reconcile stale unread badges with the phone. WhatsApp only retains recent
 * markChatAsRead app-state mutations, so chats the owner read long ago never
 * re-emit a 'chat.read' — the only phone-side truth left is the Conversation
 * record itself. For every still-unread conversation we ask the phone for an
 * on-demand history chunk (HISTORY_SYNC_ON_DEMAND, anchored at the newest
 * stored message); the reply lands at whatsapp/history-sync as syncType 6
 * carrying the chat's real unreadCount.
 */
class ReconcileSessionUnreadJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 1;
    public int $timeout = 300;

    /** Cap per run — very busy sessions reconcile newest-first across runs. */
    private const MAX_CONVERSATIONS = 80;
    /** Gap between phone requests so one sweep can't burst the primary. */
    private const REQUEST_GAP_US = 600000;

    public function __construct(private int $sessionId)
    {
        $this->onQueue('default');
    }

    public function handle(): void
    {
        $session = WhatsAppSession::find($this->sessionId);
        if (!$session || $session->status !== 'connected') {
            return;
        }

        $conversations = WhatsAppConversation::where('session_id', $session->id)
            ->where('unread_count', '>', 0)
            ->where('contact_jid', 'not like', '%broadcast%')
            ->where('contact_jid', 'not like', '%newsletter%')
            ->orderByDesc('last_message_at')
            ->limit(self::MAX_CONVERSATIONS)
            ->get(['id', 'contact_jid']);

        if ($conversations->isEmpty()) {
            return;
        }

        $engineUrl = rtrim(config('services.whatsapp.url', 'http://127.0.0.1:3005'), '/');
        $token = $session->session_token ?: (string) $session->id;
        $requested = 0;

        foreach ($conversations as $conv) {
            if (!$conv->contact_jid) {
                continue;
            }
            // Newest stored real message is the anchor — we only need the
            // Conversation proto back, not a message backfill.
            $anchor = WhatsAppMessage::where('conversation_id', $conv->id)
                ->whereNotNull('message_id')
                ->where('message_id', 'not like', 'out\_%')
                ->where('message_id', 'not like', 'fwd\_%')
                ->orderByDesc('timestamp')
                ->orderByDesc('id')
                ->first(['message_id', 'direction', 'timestamp']);
            if (!$anchor?->message_id) {
                continue;
            }

            try {
                Http::timeout(15)
                    ->withHeaders(['Authorization' => 'Bearer ' . config('services.whatsapp.api_key')])
                    ->post("{$engineUrl}/internal/history/chat", [
                        'sessionId' => $token,
                        'chatJid' => $conv->contact_jid,
                        'oldestMsgId' => $anchor->message_id,
                        'oldestMsgFromMe' => $anchor->direction === 'outgoing',
                        'oldestMsgTimestampMs' => $anchor->timestamp->getTimestamp() * 1000,
                        'count' => 5,
                    ]);
                $requested++;
            } catch (\Throwable $e) {
                Log::info("Unread reconcile request for conversation {$conv->id} failed: {$e->getMessage()}");
            }

            usleep(self::REQUEST_GAP_US);
        }

        Log::info("Unread reconcile session {$session->id}: {$requested}/{$conversations->count()} on-demand pulls requested");
    }
}
