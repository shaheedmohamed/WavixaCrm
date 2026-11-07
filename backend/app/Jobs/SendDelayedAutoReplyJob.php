<?php

namespace App\Jobs;

use App\Models\WhatsAppAutoReply;
use App\Models\WhatsAppAutoReplyLog;
use App\Models\WhatsAppConversation;
use App\Models\WhatsAppMessage;
use App\Models\WhatsAppSession;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;

/**
 * "Reply if nobody answers in time" — dispatched N minutes after an
 * incoming message. When it runs it re-checks the conversation: if any
 * outgoing message landed since the trigger message, a human (or an
 * earlier auto reply) already answered and we stay silent.
 */
class SendDelayedAutoReplyJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public function __construct(
        public int $autoReplyId,
        public int $conversationId,
        public int $sessionId,
        public ?int $incomingMessageId = null,
    ) {}

    public function handle(): void
    {
        $autoReply = WhatsAppAutoReply::find($this->autoReplyId);
        if (!$autoReply || !$autoReply->is_enabled || ($autoReply->trigger_mode ?: 'all') !== 'delayed') {
            return;
        }

        $session = WhatsAppSession::find($this->sessionId);
        $conversation = WhatsAppConversation::find($this->conversationId);
        if (!$session || !$conversation || $session->status !== 'connected') {
            return;
        }

        $incoming = $this->incomingMessageId ? WhatsAppMessage::find($this->incomingMessageId) : null;
        $since = $incoming?->created_at ?? now()->subMinutes(
            max(1, (int) ($autoReply->response_delay_minutes ?? 5)) + 5
        );
        $senderPhone = $incoming?->from ?: ($conversation->contact_phone ?: $conversation->contact_jid);
        $senderName = $incoming?->sender_name ?: ($conversation->contact_name ?: $senderPhone);

        $logBase = [
            'user_id' => $session->user_id,
            'session_id' => $session->id,
            'conversation_id' => $conversation->id,
            'incoming_message_id' => $incoming?->id,
            'sender_phone' => $senderPhone,
            'sender_name' => $senderName,
            'incoming_message' => $incoming?->message,
        ];

        // An agent replied in the meantime → no auto reply needed.
        $answered = WhatsAppMessage::where('conversation_id', $conversation->id)
            ->where('direction', 'outgoing')
            ->where('created_at', '>', $since)
            ->exists();
        if ($answered) {
            WhatsAppAutoReplyLog::create($logBase + [
                'reply_message' => $autoReply->reply_message,
                'status' => 'skipped',
                'status_reason' => 'تم الرد يدوياً من موظف خلال فترة الانتظار',
            ]);
            return;
        }

        // reply_once still applies — a conversation that already got one
        // auto reply doesn't get another just because it was unanswered.
        $onceKey = "auto_reply_once:{$conversation->id}";
        if ($autoReply->reply_once && Cache::has($onceKey)) {
            WhatsAppAutoReplyLog::create($logBase + [
                'reply_message' => $autoReply->reply_message,
                'status' => 'reply_once_skipped',
                'status_reason' => 'تم الرد مسبقاً على هذه المحادثة (رد مرة واحدة)',
            ]);
            return;
        }

        if ($autoReply->mode === 'ai') {
            if (!$incoming) {
                return;
            }
            $log = WhatsAppAutoReplyLog::create($logBase + [
                'reply_message' => null,
                'status' => 'ai_pending',
                'status_reason' => 'تأخر الرد — تم تمرير الرسالة للذكاء الاصطناعي',
            ]);
            GenerateAIReplyJob::dispatch($log->id);
            return;
        }

        $replyText = trim((string) $autoReply->reply_message);
        if ($replyText === '') {
            WhatsAppAutoReplyLog::create($logBase + [
                'reply_message' => null,
                'status' => 'disabled',
                'status_reason' => 'الرد الثابت غير مفعّل لهذا الجهاز',
            ]);
            return;
        }

        $targetAddress = $conversation->contact_jid ?: $conversation->contact_phone;

        $replyMessage = WhatsAppMessage::create([
            'user_id' => $session->user_id,
            'session_id' => $session->id,
            'conversation_id' => $conversation->id,
            'from' => $session->phone_number,
            'to' => $targetAddress,
            'message' => $replyText,
            'message_type' => 'text',
            'direction' => 'outgoing',
            'status' => WhatsAppMessage::STATUS_QUEUED,
            'queued_at' => now(),
            'timestamp' => now(),
        ]);

        WhatsAppAutoReplyLog::create($logBase + [
            'reply_message' => $replyText,
            'status' => 'queued',
            'status_reason' => 'تم إرسال الرد التلقائي بعد انتهاء مهلة الانتظار',
            'outgoing_message_id' => $replyMessage->id,
        ]);

        Cache::put("auto_reply_flood:{$session->id}:{$senderPhone}", true, 30);
        if ($autoReply->reply_once) {
            Cache::put($onceKey, true, 86400 * 30);
        }

        $autoReply->increment('total_replies_sent');
        $autoReply->update(['last_reply_at' => now()]);

        // isAutoReply=true bypasses anti-ban pacing, same as instant replies.
        SendWhatsAppMessageJob::dispatch($replyMessage->id, false, true)
            ->delay(now()->addSeconds(rand(1, 2)));

        Log::info("Delayed auto reply sent on conversation {$conversation->id} after agent timeout");
    }
}
