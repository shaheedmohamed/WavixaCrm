<?php

namespace App\Http\Controllers;

use App\Jobs\GenerateAIReplyJob;
use App\Models\WhatsAppAutoReply;
use App\Models\WhatsAppAutoReplyLog;
use App\Models\WhatsAppConversation;
use App\Models\WhatsAppMessage;
use App\Models\WhatsAppSession;
use App\Jobs\SendWhatsAppMessageJob;
use App\Services\UserReputationService;
use App\Services\MetaPixelService;
use App\Services\WebhookDispatcher;
use App\Services\WhatsAppLidResolver;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class WhatsAppWebhookController extends Controller
{
    /**
     * Resolve the session the node service is talking about. The service
     * identifies sessions by session_token, falling back to user_id for
     * legacy sessions created before tokens existed.
     */
    private function resolveSession(string $nodeUserId): ?WhatsAppSession
    {
        $session = WhatsAppSession::where('session_token', $nodeUserId)->first();

        if (!$session && ctype_digit($nodeUserId)) {
            $session = WhatsAppSession::where('user_id', (int) $nodeUserId)
                ->orderByDesc('last_activity_at')
                ->first();
        }

        return $session;
    }

    /**
     * Handle a session becoming connected in the node service.
     */
    public function connected(Request $request)
    {
        $data = $request->validate([
            'userId' => 'required|string',
            'phoneNumber' => 'nullable|string',
        ]);

        $session = $this->resolveSession($data['userId']);

        if (!$session) {
            Log::warning("WhatsApp connected webhook: no session for {$data['userId']}");
            return response()->json(['success' => false, 'message' => 'Session not found'], 404);
        }

        $session->update([
            'status' => 'connected',
            'phone_number' => $data['phoneNumber'] ?? $session->phone_number,
            'connected_at' => now(),
            'last_activity_at' => now(),
        ]);

        try {
            MetaPixelService::track(
                'ConnectWhatsApp',
                $session->user,
                [
                    'content_name' => 'WhatsApp Device Connected',
                    'content_type' => 'device',
                    'phone_number' => $session->phone_number,
                ],
                "whatsapp-connected-{$session->id}-" . time(),
                'https://wavixa.net/devices'
            );
        } catch (\Throwable $e) {
            Log::error('MetaPixel ConnectWhatsApp webhook error: ' . $e->getMessage());
        }

        Log::info("WhatsApp session {$session->id} marked connected ({$session->phone_number})");

        try {
            event(new \App\Events\CrmRealtimeEvent($session->user_id, 'device.status', [
                'session_id' => $session->id,
                'phone_number' => $session->phone_number,
                'status' => 'connected',
            ]));
        } catch (\Throwable $e) {
            Log::debug('CRM broadcast (device.status) failed: ' . $e->getMessage());
        }

        return response()->json(['success' => true]);
    }

    /**
     * Handle a session dropping in the node service. Without this the DB keeps
     * a stale "connected" row and system messages (OTP) are routed to a dead device.
     */
    public function disconnected(Request $request)
    {
        $data = $request->validate([
            'userId' => 'required|string',
            'reason' => 'nullable|string',
        ]);

        $session = $this->resolveSession($data['userId']);

        if (!$session) {
            Log::warning("WhatsApp disconnected webhook: no session for {$data['userId']}");
            return response()->json(['success' => false, 'message' => 'Session not found'], 404);
        }

        $session->update([
            'status' => 'disconnected',
            'last_activity_at' => now(),
        ]);

        if ($session->user) {
            UserReputationService::recalculateIfStale($session->user, 0);
        }

        $reason = $data['reason'] ?? 'unknown';
        Log::warning("WhatsApp session {$session->id} marked disconnected (reason: {$reason})");

        try {
            event(new \App\Events\CrmRealtimeEvent($session->user_id, 'device.status', [
                'session_id' => $session->id,
                'phone_number' => $session->phone_number,
                'status' => 'disconnected',
                'reason' => $reason,
            ]));
        } catch (\Throwable $e) {
            Log::debug('CRM broadcast (device.status) failed: ' . $e->getMessage());
        }

        try {
            app(\App\Services\AdminAlertService::class)
                ->notifySessionDisconnected($session->id, $session->phone_number, $reason);
        } catch (\Throwable $e) {
            Log::error('AdminAlert: failed to send disconnect alert: ' . $e->getMessage());
        }

        // Notify the device owner directly if their device disconnected.
        $user = $session->user;
        if ($user && $user->phone_number && $user->phone_number !== $session->phone_number) {
            try {
                \App\Services\SystemWhatsAppService::sendMessage(
                    $user->phone_number,
                    "🔌 تنبيه انقطاع الاتصال\n\nجهازك {$session->phone_number} انقطع عن WhatsApp.\n\nلإعادة الربط، افتح لوحة التحكم وامسح رمز الـ QR مرة أخرى.\n\nشكراً لاستخدامك Wavixa."
                );
            } catch (\Throwable $e) {
                Log::error('UserAlert: failed to send disconnect notification: ' . $e->getMessage());
            }
        }

        return response()->json(['success' => true]);
    }

    /**
     * Handle message sent webhook from WhatsApp service.
     */
    public function messageSent(Request $request)
    {
        try {
            $data = $request->validate([
                'userId' => 'required',
                'to' => 'required|string',
                'message' => 'nullable|string',
                'messageType' => 'nullable|string',
                'messageId' => 'required|string',
                'timestamp' => 'nullable',
            ]);

            $session = $this->resolveSession((string) $data['userId']);

            if (!$session) {
                Log::warning("WhatsApp message sent: no session for {$data['userId']}");
                return response()->json(['success' => false, 'message' => 'Session not found'], 404);
            }

            $userId = $session->user_id;
            $from = $session->phone_number;
            $sessionId = $session->id;

            // Link the send to its CRM conversation — sends originating
            // outside the CRM (API, campaigns) otherwise orphan the row.
            // For 1:1 chats, create the conversation if this is a new contact.
            $toDigits = preg_replace('/\D/', '', $data['to']);
            $toJid = str_contains((string) $data['to'], '@')
                ? $data['to']
                : $toDigits . '@s.whatsapp.net';
            $isGroupDest = str_ends_with((string) $toJid, '@g.us');
            $conversation = WhatsAppConversation::where('session_id', $sessionId)
                ->where(function ($q) use ($data, $toDigits, $toJid) {
                    $q->where('contact_jid', $data['to'])
                      ->orWhere('contact_jid', $toJid)
                      ->orWhere('contact_phone', $toDigits);
                })
                ->first();

            if (!$conversation && $toDigits && !$isGroupDest) {
                $conversation = WhatsAppConversation::create([
                    'session_id' => $sessionId,
                    'user_id' => $userId,
                    'contact_jid' => $toJid,
                    'contact_phone' => $toDigits,
                    'contact_name' => '+' . $toDigits,
                    'last_message' => $data['message'] ?? '',
                    'last_message_type' => $data['messageType'] ?? 'text',
                    'last_message_direction' => 'outgoing',
                    'last_message_status' => WhatsAppMessage::STATUS_SENT,
                    'last_message_at' => now(),
                ]);
            }

            // Find-or-create must be serialized per message_id: the engine fires
            // this webhook at the same moment it answers the caller's send
            // request, so CRM/job writers insert concurrently. Without a lock
            // both sides miss the lookup and the message is stored twice.
            $lockName = 'wa_msg_sent_' . sha1($sessionId . '|' . $data['messageId']);
            $locked = (int) (DB::select('SELECT GET_LOCK(?, 10) AS l', [$lockName])[0]->l ?? 0);

            try {
                // Find the message by messageId or create a new one if it doesn't exist
                $message = WhatsAppMessage::where('message_id', $data['messageId'])->first();

                if (!$message) {
                    // Queued/CRM sends create the row before (or right after) the
                    // engine responds, sometimes without the engine message_id
                    // stamped yet. Adopt that in-flight row instead of duplicating.
                    $message = WhatsAppMessage::where('session_id', $sessionId)
                        ->where('direction', 'outgoing')
                        ->where(function ($q) {
                            $q->whereNull('message_id')->orWhere('message_id', '');
                        })
                        ->where(function ($q) use ($data) {
                            $q->where('message', $data['message'] ?? '')
                              ->orWhere(function ($q2) use ($data) {
                                  $t = $data['messageType'] ?? 'text';
                                  if ($t !== 'text') $q2->where('message_type', $t);
                              });
                        })
                        ->where('created_at', '>=', now()->subMinutes(10))
                        ->orderByDesc('id')
                        ->first();
                }

                if ($message) {
                    $updateData = [
                        'status' => WhatsAppMessage::STATUS_SENT,
                        'sent_at' => now(),
                    ];
                    if (empty($message->message_id)) {
                        $updateData['message_id'] = $data['messageId'];
                    }
                    if (empty($message->from) && $from) {
                        $updateData['from'] = $from;
                    }
                    if (empty($message->session_id) && $sessionId) {
                        $updateData['session_id'] = $sessionId;
                    }
                    if (empty($message->message) && !empty($data['message'])) {
                        $updateData['message'] = $data['message'];
                    }
                    if (empty($message->message_type)) {
                        $updateData['message_type'] = $data['messageType'] ?? 'text';
                    }
                    if (empty($message->conversation_id) && $conversation) {
                        $updateData['conversation_id'] = $conversation->id;
                    }
                    $message->update($updateData);
                } else {
                    // Create a new message record if it doesn't exist
                    $message = WhatsAppMessage::create([
                        'user_id' => $userId,
                        'session_id' => $sessionId,
                        'conversation_id' => $conversation?->id,
                        'from' => $from,
                        'to' => $data['to'],
                        'message' => $data['message'] ?? '',
                        'message_type' => $data['messageType'] ?? 'text',
                        'message_id' => $data['messageId'],
                        'status' => WhatsAppMessage::STATUS_SENT,
                        'direction' => 'outgoing',
                        'sent_at' => now(),
                        'timestamp' => now(),
                    ]);
                }
            } finally {
                if ($locked) {
                    DB::select('SELECT RELEASE_LOCK(?)', [$lockName]);
                }
            }

            // Update auto reply log status if this was an auto reply
            WhatsAppAutoReplyLog::where('outgoing_message_id', $message->id)->update([
                'status' => 'sent',
                'status_reason' => 'تم إرسال الرد التلقائي للعميل بنجاح',
            ]);

            Log::info("WhatsApp message sent: {$data['messageId']}");

            return response()->json([
                'success' => true,
                'message' => 'Message status updated',
            ]);
        } catch (\Exception $e) {
            Log::error("Error processing message sent webhook: " . $e->getMessage());
            return response()->json([
                'success' => false,
                'message' => 'Error processing webhook',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Handle message delivered webhook from WhatsApp service.
     */
    public function messageDelivered(Request $request)
    {
        return $this->updateReceiptStatus($request, WhatsAppMessage::STATUS_DELIVERED);
    }

    /**
     * Handle message read webhook from WhatsApp service.
     */
    public function messageRead(Request $request)
    {
        return $this->updateReceiptStatus($request, WhatsAppMessage::STATUS_READ);
    }

    /**
     * Delivery/read receipts arrive batched from the engine (a reconnect can
     * dump hundreds at once). One query per batch, no status downgrades, and
     * a single broadcast per owner.
     */
    private function updateReceiptStatus(Request $request, string $status)
    {
        try {
            $data = $request->validate([
                'messageId' => 'required_without:messageIds|nullable|string',
                'messageIds' => 'required_without:messageId|nullable|array|max:200',
                'messageIds.*' => 'string',
                'timestamp' => 'required',
            ]);

            $ids = $data['messageIds'] ?? [$data['messageId']];
            $rank = ['sent' => 1, 'delivered' => 2, 'read' => 3];
            $tsColumn = $status === WhatsAppMessage::STATUS_READ ? 'read_at' : 'delivered_at';
            $eventName = $status === WhatsAppMessage::STATUS_READ ? 'message.read' : 'message.delivered';

            $messages = WhatsAppMessage::whereIn('message_id', $ids)->get();

            $convLastStatus = [];
            foreach ($messages as $message) {
                if (($rank[$message->status] ?? 0) >= ($rank[$status] ?? 0)) {
                    continue; // never downgrade (read → delivered on out-of-order receipts)
                }
                $message->update(['status' => $status, $tsColumn => now()]);

                // Keep the conversation list tick in sync: only stamp the new
                // status when this receipt is for the conversation's latest
                // message (older receipts must not rewind the list).
                if ($message->conversation_id) {
                    $bumped = WhatsAppConversation::where('id', $message->conversation_id)
                        ->where('last_message_at', '<=', $message->timestamp ?? $message->created_at)
                        ->update(['last_message_status' => $status]);
                    $convLastStatus[$message->id] = $bumped ? $status : null;
                }

                WebhookDispatcher::dispatch($message->user_id, $eventName, [
                    'message_id' => $message->id,
                    'external_message_id' => $message->message_id,
                    'to' => $message->to,
                    'from' => $message->from,
                    'message_type' => $message->message_type,
                    'status' => $message->status,
                    $tsColumn => $message->{$tsColumn},
                ]);
            }

            if ($messages->isNotEmpty()) {
                $messages->groupBy('user_id')->each(function ($msgs, $userId) use ($status, $convLastStatus) {
                    try {
                        event(new \App\Events\CrmRealtimeEvent($userId, 'message.status', [
                            'status' => $status,
                            'items' => $msgs->map(fn ($m) => [
                                'message_id' => $m->id,
                                'external_message_id' => $m->message_id,
                                'conversation_id' => $m->conversation_id,
                                'status' => $m->status,
                                'conversation_last_status' => $convLastStatus[$m->id] ?? null,
                            ])->values()->all(),
                        ]));
                    } catch (\Throwable $e) {
                        Log::debug('CRM broadcast (message.status) failed: ' . $e->getMessage());
                    }
                });
            }

            return response()->json([
                'success' => true,
                'message' => 'Message status updated',
            ]);
        } catch (\Exception $e) {
            Log::error("Error processing {$status} webhook: " . $e->getMessage());
            return response()->json([
                'success' => false,
                'message' => 'Error processing webhook',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Media that finished downloading after the message row was created —
     * patch media_url and broadcast so the CRM can render it.
     */
    public function messageMedia(Request $request)
    {
        try {
            $data = $request->validate([
                'userId' => 'required|string',
                'messageId' => 'required|string',
                'mediaUrl' => 'required|string',
            ]);

            $message = WhatsAppMessage::where('message_id', $data['messageId'])->first();
            if (!$message) {
                // Status media arrives through the same event — statuses are
                // keyed by the same WhatsApp message id.
                $status = \App\Models\WhatsAppStatus::where('message_id', $data['messageId'])->first();
                if (!$status) {
                    return response()->json(['success' => false, 'message' => 'Message not found'], 404);
                }
                $status->update(['media_url' => $data['mediaUrl']]);
                try {
                    event(new \App\Events\CrmRealtimeEvent($status->user_id, 'status.media', [
                        'status_id' => $status->id,
                        'media_url' => $data['mediaUrl'],
                    ]));
                } catch (\Throwable $e) {
                    Log::debug('CRM broadcast (status.media) failed: ' . $e->getMessage());
                }
                return response()->json(['success' => true]);
            }

            $message->update(['media_url' => $data['mediaUrl']]);

            try {
                event(new \App\Events\CrmRealtimeEvent($message->user_id, 'message.media', [
                    'conversation_id' => $message->conversation_id,
                    'message_id' => $message->id,
                    'media_url' => $data['mediaUrl'],
                ]));
            } catch (\Throwable $e) {
                Log::debug('CRM broadcast (message.media) failed: ' . $e->getMessage());
            }

            return response()->json(['success' => true]);
        } catch (\Exception $e) {
            Log::error("Error processing message media webhook: " . $e->getMessage());
            return response()->json(['success' => false, 'message' => 'Error processing webhook'], 500);
        }
    }

    /**
     * Typing indicators — broadcast to the CRM so agents see "يكتب الآن…".
     */
    public function chatstate(Request $request)
    {
        try {
            $data = $request->validate([
                'userId' => 'required|string',
                'from' => 'nullable|string',
                'participant' => 'nullable|string',
                'state' => 'required|string',
            ]);

            $session = $this->resolveSession($data['userId']);
            if (!$session) {
                return response()->json(['success' => false, 'message' => 'Session not found'], 404);
            }

            // Resolve the conversation this chatstate belongs to so the CRM
            // only shows the indicator on the right thread.
            $chatJid = $data['from'] ?? null;
            if ($chatJid && str_ends_with($chatJid, '@lid')) {
                $chatJid = DB::table('whatsapp_lid_mappings')->where('lid', $chatJid)->value('pn') ?? $chatJid;
            }

            $conversation = $chatJid
                ? WhatsAppConversation::where('session_id', $session->id)
                    ->where('contact_jid', $chatJid)
                    ->first()
                : null;

            try {
                event(new \App\Events\CrmRealtimeEvent($session->user_id, 'typing', [
                    'session_id' => $session->id,
                    'conversation_id' => $conversation?->id,
                    'chat_jid' => $chatJid,
                    'state' => $data['state'],
                ]));
            } catch (\Throwable $e) {
                Log::debug('CRM broadcast (typing) failed: ' . $e->getMessage());
            }

            return response()->json(['success' => true]);
        } catch (\Exception $e) {
            Log::error("Error processing chatstate webhook: " . $e->getMessage());
            return response()->json(['success' => false, 'message' => 'Error processing webhook'], 500);
        }
    }

    /** Push a delivery/read status change to the CRM realtime channel. */
    private function broadcastStatus(WhatsAppMessage $message): void
    {
        $convLast = null;
        if ($message->conversation_id) {
            $bumped = WhatsAppConversation::where('id', $message->conversation_id)
                ->where('last_message_at', '<=', $message->timestamp ?? $message->created_at)
                ->update(['last_message_status' => $message->status]);
            $convLast = $bumped ? $message->status : null;
        }
        try {
            event(new \App\Events\CrmRealtimeEvent($message->user_id, 'message.status', [
                'conversation_id' => $message->conversation_id,
                'message_id' => $message->id,
                'external_message_id' => $message->message_id,
                'status' => $message->status,
                'conversation_last_status' => $convLast,
            ]));
        } catch (\Throwable $e) {
            Log::debug('CRM broadcast (message.status) failed: ' . $e->getMessage());
        }
    }

    /**
     * Handle QR code generated webhook from WhatsApp service.
     */
    public function qrGenerated(Request $request)
    {
        try {
            $data = $request->validate([
                'userId' => 'required|string',
                'qr' => 'required|string',
            ]);

            Log::info("QR code generated for user: {$data['userId']}");

            return response()->json([
                'success' => true,
                'message' => 'QR code received',
            ]);
        } catch (\Exception $e) {
            Log::error("Error processing QR generated webhook: " . $e->getMessage());
            return response()->json([
                'success' => false,
                'message' => 'Error processing webhook',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Handle incoming emoji reaction webhook from WhatsApp engine.
     */
    public function messageReaction(Request $request)
    {
        try {
            $data = $request->validate([
                'userId' => 'required|string',
                'targetMessageId' => 'required|string',
                'emoji' => 'nullable|string',
                'senderPhone' => 'nullable|string',
            ]);

            $session = $this->resolveSession($data['userId']);
            if (!$session) {
                return response()->json(['success' => false, 'message' => 'Session not found'], 404);
            }

            $message = WhatsAppMessage::where('message_id', $data['targetMessageId'])
                ->orWhere('id', $data['targetMessageId'])
                ->first();

            if ($message) {
                $reactions = is_array($message->reactions) ? $message->reactions : [];
                $emoji = trim($data['emoji'] ?? '');
                $sender = $data['senderPhone'] ?? '';

                if (empty($emoji)) {
                    $reactions = array_values(array_filter($reactions, fn($r) => ($r['from'] ?? '') !== $sender));
                } else {
                    $found = false;
                    foreach ($reactions as &$r) {
                        if (($r['from'] ?? '') === $sender) {
                            $r['emoji'] = $emoji;
                            $r['timestamp'] = time();
                            $found = true;
                            break;
                        }
                    }
                    if (!$found) {
                        $reactions[] = [
                            'emoji' => $emoji,
                            'from' => $sender,
                            'timestamp' => time(),
                        ];
                    }
                }

                $message->update(['reactions' => $reactions]);
            }

            return response()->json(['success' => true]);
        } catch (\Throwable $e) {
            Log::error('WhatsApp message reaction webhook error: ' . $e->getMessage());
            return response()->json(['success' => false, 'error' => $e->getMessage()], 500);
        }
    }

    /**
     * Anti-delete: the contact used "delete for everyone". The row stays —
     * we only stamp revoked_at and push a realtime badge so agents can see
     * what was deleted and when.
     */
    public function messageRevoked(Request $request)
    {
        try {
            $data = $request->validate([
                'userId' => 'required|string',
                'messageId' => 'required|string',
                'fromMe' => 'nullable|boolean',
                'from' => 'nullable|string',
            ]);

            $session = $this->resolveSession($data['userId']);
            if (!$session) {
                return response()->json(['success' => false, 'message' => 'Session not found'], 404);
            }

            // A revoke against status@broadcast deletes a status item, not a
            // chat message — stamp deleted_at and keep the row (anti-delete).
            if (str_ends_with((string) ($data['from'] ?? ''), '@broadcast')) {
                $status = \App\Models\WhatsAppStatus::where('user_id', $session->user_id)
                    ->where('message_id', $data['messageId'])
                    ->first();
                if ($status && !$status->deleted_at) {
                    $status->update(['deleted_at' => now()]);
                    try {
                        event(new \App\Events\CrmRealtimeEvent($status->user_id, 'status.deleted', [
                            'status_id' => $status->id,
                            'poster_phone' => $status->poster_phone,
                        ]));
                    } catch (\Throwable $e) {
                        Log::debug('CRM broadcast (status.deleted) failed: ' . $e->getMessage());
                    }
                }
                return response()->json(['success' => true, 'matched' => (bool) $status]);
            }

            // resolveSession returns the user's newest session — the revoked
            // message may live on another device row, so widen the match to
            // any session owned by this user when the strict lookup misses.
            $message = WhatsAppMessage::where('session_id', $session->id)
                ->where('message_id', $data['messageId'])
                ->first()
                ?? WhatsAppMessage::where('user_id', $session->user_id)
                    ->where('message_id', $data['messageId'])
                    ->first();

            if (!$message) {
                // Revoke may still target a status even without a broadcast
                // remoteJid (older engine payloads lack `from`).
                $status = \App\Models\WhatsAppStatus::where('user_id', $session->user_id)
                    ->where('message_id', $data['messageId'])
                    ->first();
                if ($status && !$status->deleted_at) {
                    $status->update(['deleted_at' => now()]);
                    try {
                        event(new \App\Events\CrmRealtimeEvent($status->user_id, 'status.deleted', [
                            'status_id' => $status->id,
                            'poster_phone' => $status->poster_phone,
                        ]));
                    } catch (\Throwable $e) {
                        Log::debug('CRM broadcast (status.deleted) failed: ' . $e->getMessage());
                    }
                }
                return response()->json(['success' => true, 'matched' => (bool) $status]);
            }

            if (!$message->revoked_at) {
                $message->update(['revoked_at' => now()]);
                try {
                    event(new \App\Events\CrmRealtimeEvent($message->user_id, 'message.revoked', [
                        'message_id' => $message->id,
                        'external_message_id' => $message->message_id,
                        'conversation_id' => $message->conversation_id,
                        'revoked_at' => $message->revoked_at?->toISOString(),
                    ]));
                } catch (\Throwable $e) {
                    Log::debug('CRM broadcast (revoked) failed: ' . $e->getMessage());
                }
            }

            return response()->json(['success' => true, 'matched' => true]);
        } catch (\Throwable $e) {
            Log::error('WhatsApp message revoked webhook error: ' . $e->getMessage());
            return response()->json(['success' => false, 'error' => $e->getMessage()], 500);
        }
    }

    /**
     * Bulk-import a WhatsApp history-sync chunk pushed by the engine.
     * Idempotent — conversations and messages are upserted, so repeated or
     * overlapping chunks merge cleanly.
     */
    public function historySync(Request $request)
    {
        try {
            $data = $request->validate([
                'userId' => 'required|string',
                'syncType' => 'nullable|integer',
                'chunkOrder' => 'nullable|integer',
                'progress' => 'nullable|integer',
                'requestId' => 'nullable|string',
                'pushnames' => 'nullable|array',
                'lidMappings' => 'nullable|array',
                'conversations' => 'nullable|array',
            ]);

            $session = $this->resolveSession($data['userId']);
            if (!$session) {
                Log::warning("WhatsApp history sync: no session for {$data['userId']}");
                return response()->json(['success' => false, 'message' => 'Session not found'], 404);
            }

            // Persist fresh LID→PN mappings (accepts both the engine's
            // synthesized {lid, pn} shape and the raw proto {lidJid, pnJid}
            // shape), then load the full table so conversations keyed under
            // a LID resolve to their phone number.
            foreach (($data['lidMappings'] ?? []) as $m) {
                $lid = $m['lid'] ?? $m['lidJid'] ?? null;
                $pn = $m['pn'] ?? $m['pnJid'] ?? null;
                if ($lid && $pn) {
                    DB::table('whatsapp_lid_mappings')->updateOrInsert(
                        ['lid' => $lid],
                        ['pn' => $pn, 'updated_at' => now(), 'created_at' => now()]
                    );
                }
            }
            $lidToPn = DB::table('whatsapp_lid_mappings')->pluck('pn', 'lid')->toArray();

            $pushnames = [];
            foreach (($data['pushnames'] ?? []) as $p) {
                if (!empty($p['jid']) && !empty($p['pushname'])) {
                    $pushnames[$p['jid']] = $p['pushname'];
                }
            }

            $imported = 0;
            $convsSeen = 0;

            // INITIAL_STATUS_V3 chunks carry statuses as raw messages (not
            // inside a conversation wrapper) — each is one story item.
            foreach (($data['statusMessages'] ?? []) as $m) {
                if (empty($m['id'])) continue;
                $posterJid = $m['participant'] ?? null;
                $posterPn = $posterJid ? ($lidToPn[$posterJid] ?? $posterJid) : null;
                $isLidPoster = $posterJid && str_ends_with($posterJid, '@lid');
                $this->recordStatus($session, [
                    'fromMe' => !empty($m['fromMe']),
                    'senderPhone' => preg_replace('/\D/', '', explode('@', (string) ($posterPn ?: $posterJid))[0]),
                    'senderLid' => $isLidPoster ? $posterJid : null,
                    'senderName' => $m['pushName'] ?? ($posterJid ? ($pushnames[$posterJid] ?? null) : null),
                    'body' => $m['body'] ?? '',
                    'type' => $m['type'] ?? 'text',
                    'mimeType' => $m['media']['mimetype'] ?? null,
                    'mediaMeta' => !empty($m['media']['mediaKey']) ? array_filter([
                        'mediaKey' => $m['media']['mediaKey'] ?? null,
                        'directPath' => $m['media']['directPath'] ?? null,
                        'url' => $m['media']['url'] ?? null,
                        'mimetype' => $m['media']['mimetype'] ?? null,
                        'fileName' => $m['media']['fileName'] ?? null,
                        'type' => $m['type'] ?? null,
                    ]) : null,
                    'messageId' => $m['id'],
                    'msgTimestamp' => $m['timestamp'] ?? null,
                ]);
            }

            foreach (($data['conversations'] ?? []) as $conv) {
                $jid = $conv['jid'] ?? null;
                if (!$jid || str_contains($jid, '@newsletter')) {
                    continue;
                }
                // Status updates sync as a `status@broadcast` "conversation" —
                // each message is one story item posted by `participant`.
                if (str_ends_with($jid, '@broadcast')) {
                    foreach (($conv['messages'] ?? []) as $m) {
                        if (empty($m['id'])) continue;
                        $posterJid = $m['participant'] ?? null;
                        $posterPn = $posterJid ? ($lidToPn[$posterJid] ?? $posterJid) : null;
                        $isLidPoster = $posterJid && str_ends_with($posterJid, '@lid');
                        $this->recordStatus($session, [
                            'fromMe' => !empty($m['fromMe']),
                            'senderPhone' => preg_replace('/\D/', '', explode('@', (string) ($posterPn ?: $posterJid))[0]),
                            'senderLid' => $isLidPoster ? $posterJid : null,
                            'senderName' => $m['pushName'] ?? ($posterJid ? ($pushnames[$posterJid] ?? null) : null),
                            'body' => $m['body'] ?? '',
                            'type' => $m['type'] ?? 'text',
                            'mimeType' => $m['media']['mimetype'] ?? null,
                            'mediaMeta' => !empty($m['media']['mediaKey']) ? array_filter([
                                'mediaKey' => $m['media']['mediaKey'] ?? null,
                                'directPath' => $m['media']['directPath'] ?? null,
                                'url' => $m['media']['url'] ?? null,
                                'mimetype' => $m['media']['mimetype'] ?? null,
                                'fileName' => $m['media']['fileName'] ?? null,
                                'type' => $m['type'] ?? null,
                            ]) : null,
                            'messageId' => $m['id'],
                            'msgTimestamp' => $m['timestamp'] ?? null,
                        ]);
                    }
                    continue;
                }

                $isGroup = str_contains($jid, '@g.us');
                $convsSeen++;
                $phoneJid = $lidToPn[$jid] ?? $jid;
                $phone = preg_replace('/\D/', '', explode('@', $phoneJid)[0]);
                $msgs = array_values(array_filter($conv['messages'] ?? [], fn ($m) => !empty($m['id'])));
                // Chunks stream newest-first — insert in chronological order
                // so row ids track time within each chunk as far as possible.
                usort($msgs, fn ($a, $b) => ($a['timestamp'] ?? 0) <=> ($b['timestamp'] ?? 0));

                $name = $conv['name'] ?? $pushnames[$jid] ?? $pushnames[$phoneJid] ?? null;
                if (!$name && !$isGroup) {
                    foreach (array_reverse($msgs) as $m) {
                        if (!empty($m['pushName']) && empty($m['fromMe'])) {
                            $name = $m['pushName'];
                            break;
                        }
                    }
                }

                $conversation = WhatsAppConversation::where('session_id', $session->id)
                    ->where('contact_jid', $jid)
                    ->first();
                // Same contact under a different JID form (the phone is
                // resolved from the lid→pn map above) — continue that chat.
                if (!$conversation && $phone && !$isGroup) {
                    $conversation = WhatsAppConversation::where('session_id', $session->id)
                        ->where('contact_phone', $phone)
                        ->first();
                }
                if (!$conversation) {
                    $conversation = WhatsAppConversation::create([
                        'session_id' => $session->id,
                        'contact_jid' => $jid,
                        'user_id' => $session->user_id,
                        'contact_phone' => $phone,
                        'contact_name' => $name ?: ($isGroup ? 'مجموعة' : '+' . $phone),
                        // Must stay null: seeding now() would outrank every real
                        // history timestamp below and leave the chat ordered by
                        // import time instead of its last message.
                        'last_message_at' => null,
                    ]);
                }

                // Dedupe PN/LID twins: the same contact can exist as both
                // 2010..@s.whatsapp.net and 4014..@lid — merge the twin rows
                // into this one so one person stays one conversation.
                $lidResolver = app(WhatsAppLidResolver::class);
                if (!empty($conv['lidJid'])) {
                    $lidResolver->mergeLidConversation($session, $conv['lidJid'], $conversation);
                }
                $lidResolver->mergeTwinsFor($session, $conversation->fresh() ?? $conversation);
                // Merges above save() newer twin fields (incl. last_message_at)
                // straight to the row — reload so the timestamp guard below
                // never regresses them with an older chunk value.
                $conversation = $conversation->fresh() ?? $conversation;

                $convUpdates = [];
                if ($name && $conversation->contact_name !== $name) {
                    $convUpdates['contact_name'] = $name;
                }
                // WhatsApp @username travels on the Conversation record — it
                // replaces the bare phone number in the chat list.
                $peerUsername = $conv['username'] ?? null;
                if ($peerUsername && $conversation->contact_username !== $peerUsername) {
                    $convUpdates['contact_username'] = $peerUsername;
                }
                if ($phone && $conversation->contact_phone !== $phone) {
                    $convUpdates['contact_phone'] = $phone;
                }
                $lastMsg = collect($msgs)->sortByDesc('timestamp')->first();
                // Conversation-level fallback travels in milliseconds on some
                // proto versions — normalize to seconds before Carbon sees it.
                $fallbackTs = $conv['lastMsgTimestamp'] ?? null;
                if ($fallbackTs && $fallbackTs > 100000000000) {
                    $fallbackTs = intdiv((int) $fallbackTs, 1000);
                }
                $newestTs = $lastMsg['timestamp'] ?? $fallbackTs;
                if ($newestTs) {
                    $newest = \Carbon\Carbon::createFromTimestamp((int) $newestTs);
                    if (!$conversation->last_message_at || $newest->gt($conversation->last_message_at)) {
                        $convUpdates['last_message_at'] = $newest;
                        if ($lastMsg) {
                            $convUpdates['last_message'] = ($lastMsg['body'] ?? '') ?: '[' . ($lastMsg['type'] ?? 'other') . ']';
                            $convUpdates['last_message_type'] = $lastMsg['type'] ?? 'other';
                            $convUpdates['last_message_direction'] = !empty($lastMsg['fromMe']) ? 'outgoing' : 'incoming';
                            $convUpdates['last_message_status'] = !empty($lastMsg['fromMe'])
                                ? (((int) ($lastMsg['status'] ?? 2)) >= 5
                                    ? WhatsAppMessage::STATUS_READ
                                    : (((int) ($lastMsg['status'] ?? 2)) >= 3
                                        ? WhatsAppMessage::STATUS_DELIVERED
                                        : WhatsAppMessage::STATUS_SENT))
                                : WhatsAppMessage::STATUS_DELIVERED;
                        }
                    }
                }
                // Phone-side truth: a chat the owner read on the WhatsApp app
                // carries unreadCount 0 in the sync payload. Lowering our
                // counter is safe only when this chunk is at least as fresh as
                // what we already store — a stale chunk must never erase a
                // live unread badge.
                if (isset($conv['unreadCount'])) {
                    $syncUnread = (int) $conv['unreadCount'];
                    $storedUnread = (int) ($conversation->unread_count ?? 0);
                    $chunkIsFresh = !$newestTs
                        || !$conversation->last_message_at
                        || (int) $newestTs >= $conversation->last_message_at->getTimestamp();
                    if ($syncUnread > $storedUnread || ($syncUnread < $storedUnread && $chunkIsFresh)) {
                        $convUpdates['unread_count'] = $syncUnread;
                    }
                }
                if ($convUpdates) {
                    $conversation->update($convUpdates);
                }

                // The owner's uploaded address book wins over pushnames.
                try {
                    \App\Services\CrmContactBook::applyToConversation($conversation);
                } catch (\Throwable $ignored) {}

                foreach ($msgs as $m) {
                    $fromMe = !empty($m['fromMe']);
                    $type = $m['type'] ?? 'text';
                    if ($type === 'reaction') {
                        continue;
                    }
                    $ts = !empty($m['timestamp'])
                        ? \Carbon\Carbon::createFromTimestamp((int) $m['timestamp'])
                        : now();
                    $sender = $fromMe
                        ? $session->phone_number
                        : preg_replace('/\D/', '', explode('@', $m['participant'] ?? $jid)[0]);

                    $mediaMeta = null;
                    if (!empty($m['media']['mediaKey'])) {
                        $mediaMeta = array_filter([
                            'mediaKey' => $m['media']['mediaKey'] ?? null,
                            'directPath' => $m['media']['directPath'] ?? null,
                            'url' => $m['media']['url'] ?? null,
                            'mimetype' => $m['media']['mimetype'] ?? null,
                            'fileName' => $m['media']['fileName'] ?? null,
                            'type' => $type,
                        ]);
                    }

                    WhatsAppMessage::updateOrCreate(
                        [
                            'user_id' => $session->user_id,
                            'message_id' => $m['id'],
                        ],
                        [
                            'session_id' => $session->id,
                            'conversation_id' => $conversation->id,
                            'from' => $sender,
                            'to' => $fromMe ? ($m['remoteJid'] ? preg_replace('/\D/', '', explode('@', $m['remoteJid'])[0]) : $phone) : $session->phone_number,
                            'message' => $m['body'] ?? '',
                            'media_meta' => $mediaMeta,
                            'media_mime_type' => $m['media']['mimetype'] ?? null,
                            'media_caption' => $m['media']['caption'] ?? null,
                            'message_type' => $type,
                            'direction' => $fromMe ? 'outgoing' : 'incoming',
                            'status' => $fromMe
                                ? (((int) ($m['status'] ?? 2)) >= 5
                                    ? WhatsAppMessage::STATUS_READ
                                    : (((int) ($m['status'] ?? 2)) >= 3
                                        ? WhatsAppMessage::STATUS_DELIVERED
                                        : WhatsAppMessage::STATUS_SENT))
                                : WhatsAppMessage::STATUS_DELIVERED,
                            'reply_to_id' => $m['quotedMessageId'] ?? null,
                            'is_forwarded' => !empty($m['isForwarded']),
                            'sent_at' => $ts,
                            'delivered_at' => $ts,
                            'timestamp' => $ts,
                        ]
                    );
                    $imported++;
                }
            }

            $syncType = (int) ($data['syncType'] ?? -1);
            $requestId = $data['requestId'] ?? null;

            // A new sync run resets the cumulative counters. Full-history
            // pulls correlate via requestId; a fresh pairing bootstrap
            // (syncType 0) marks a brand-new run on its own. ON_DEMAND
            // chunks (syncType 6) are single-chat pulls — they must neither
            // reset the run nor drive the global progress to 100%.
            $newRun = $syncType !== 6 && (
                ($requestId && $session->history_sync_request_id !== $requestId)
                || ($syncType === 0 && (int) $session->history_sync_progress >= 100)
            );

            $syncUpdates = [
                'last_activity_at' => now(),
                'history_sync_last_chunk_at' => now(),
                'history_synced_conversations' => DB::raw('history_synced_conversations + ' . $convsSeen),
                'history_synced_messages' => DB::raw('history_synced_messages + ' . $imported),
            ];

            if ($newRun) {
                $syncUpdates['history_synced_conversations'] = $convsSeen;
                $syncUpdates['history_synced_messages'] = $imported;
                $syncUpdates['history_sync_progress'] = 1;
                if ($requestId) {
                    $syncUpdates['history_sync_request_id'] = $requestId;
                }
            }

            if (isset($data['progress']) && $syncType !== 6) {
                $p = max(0, min(100, (int) $data['progress']));
                $baseline = $newRun ? 0 : (int) $session->history_sync_progress;
                $syncUpdates['history_sync_progress'] = max($baseline, $p);
                if ($p >= 100) {
                    $syncUpdates['history_synced_at'] = now();
                }
            } elseif (!$newRun) {
                // Keep the indicator alive while chunks without % stream in.
                $syncUpdates['history_sync_progress'] = max(1, (int) $session->history_sync_progress);
            }
            $session->update($syncUpdates);

            // Reconcile LID-keyed conversations left unmapped by the chunk:
            // a usync lookup per session (throttled) links each PN contact to
            // its LID twin so duplicates collapse into one conversation.
            if (Cache::add("lid_twin_sync_{$session->id}", 1, 60)) {
                app(WhatsAppLidResolver::class)->resolveSessionTwins($session);
            }

            Log::info(
                "WhatsApp history sync session {$session->id}: " .
                count($data['conversations'] ?? []) . " conversations, {$imported} messages, " .
                count($pushnames) . ' pushnames'
            );

            return response()->json(['success' => true, 'imported' => $imported]);
        } catch (\Throwable $e) {
            Log::error('WhatsApp history sync webhook error: ' . $e->getMessage());
            return response()->json(['success' => false, 'error' => $e->getMessage()], 500);
        }
    }

    /**
     * Handle incoming message from WhatsApp service.
     */
    public function messageReceived(Request $request)
    {
        try {
            $data = $request->validate([
                'userId' => 'required|string',
                'from' => 'required|string',
                'senderPhone' => 'nullable|string',
                'senderLid' => 'nullable|string',
                'senderName' => 'nullable|string',
                'fromMe' => 'nullable|boolean',
                'body' => 'nullable|string',
                'type' => 'nullable|string',
                'mediaUrl' => 'nullable|string',
                'mediaMeta' => 'nullable|array',
                'mimeType' => 'nullable|string',
                'messageId' => 'nullable|string',
                'isGroup' => 'nullable|boolean',
                'replyToId' => 'nullable|string',
                'isForwarded' => 'nullable|boolean',
                'msgTimestamp' => 'nullable|integer',
                'timestamp' => 'nullable',
            ]);

            $session = $this->resolveSession($data['userId']);

            if (!$session) {
                Log::warning("WhatsApp message received: no session for {$data['userId']}");
                return response()->json(['success' => false, 'message' => 'Session not found'], 404);
            }

            $session->update(['last_activity_at' => now()]);

            // Status updates arrive addressed to status@broadcast — they are
            // stories, not chat messages. Store them in whatsapp_statuses and
            // never let them create a conversation/bubble.
            if (str_ends_with($data['from'], '@broadcast')) {
                $this->recordStatus($session, $data);
                return response()->json(['success' => true, 'status' => true]);
            }

            // Engine resolved a LID chat to its PN jid — persist the mapping
            // so history chunks and future traffic resolve the same way, and
            // merge the LID-keyed conversation into this one if it exists.
            $lidResolver = app(WhatsAppLidResolver::class);
            $senderLidJid = null;
            if (
                !empty($data['senderLid'])
                && str_ends_with($data['senderLid'], '@lid')
                && str_ends_with($data['from'], '@s.whatsapp.net')
            ) {
                $senderLidJid = $data['senderLid'];
                DB::table('whatsapp_lid_mappings')->updateOrInsert(
                    ['lid' => $senderLidJid],
                    ['pn' => $data['from'], 'updated_at' => now(), 'created_at' => now()]
                );
            }

            // Canonicalize a LID sender to its known phone-number JID so the
            // message lands in the contact's single conversation.
            $fromJid = $data['from'];
            if (str_ends_with($fromJid, '@lid')) {
                $knownPn = DB::table('whatsapp_lid_mappings')->where('lid', $fromJid)->value('pn');
                if ($knownPn && str_ends_with($knownPn, '@s.whatsapp.net')) {
                    $fromJid = $knownPn;
                    $senderLidJid = $senderLidJid ?? $data['from'];
                }
            }

            $senderPhone = !empty($data['senderPhone'])
                ? $data['senderPhone']
                : (str_ends_with($fromJid, '@lid')
                    ? null
                    : preg_replace('/@.*$/', '', $fromJid));
            $senderName = $data['senderName'] ?? null;
            $fromMe = (bool) ($data['fromMe'] ?? false);
            $body = $data['body'] ?? '';
            $messageType = $data['type'] ?? 'text';
            $messageId = $data['messageId'] ?? null;
            $isGroup = (bool) ($data['isGroup'] ?? false);
            $contactPhone = $fromMe
                ? preg_replace('/\D/', '', explode('@', $fromJid)[0])
                : ($senderPhone ?: preg_replace('/\D/', '', explode('@', $fromJid)[0]));
            $msgTime = !empty($data['msgTimestamp'])
                ? \Carbon\Carbon::createFromTimestamp((int) $data['msgTimestamp'])
                : now();

            // Resolve or create the conversation for this contact. JID match
            // first, then fall back to the phone number so a chat already
            // stored under another JID form (@lid ↔ @s.whatsapp.net) is
            // continued instead of forked into a twin.
            $conversation = WhatsAppConversation::where('session_id', $session->id)
                ->where('contact_jid', $fromJid)
                ->first();
            if (!$conversation && $contactPhone) {
                $conversation = WhatsAppConversation::where('session_id', $session->id)
                    ->where('contact_phone', $contactPhone)
                    ->first();
            }
            if (!$conversation) {
                $conversation = WhatsAppConversation::create([
                    'session_id' => $session->id,
                    'contact_jid' => $fromJid,
                    'user_id' => $session->user_id,
                    'contact_phone' => $contactPhone,
                    'contact_name' => $senderName ?: '+' . $contactPhone,
                    'last_message_at' => $msgTime,
                ]);
            }

            // Merge PN/LID twin conversations for the same resolved contact
            if ($senderLidJid) {
                $lidResolver->mergeLidConversation($session, $senderLidJid, $conversation);
            }
            $lidResolver->mergeTwinsFor($session, $conversation->fresh() ?? $conversation);

            $convUpdate = [
                'last_message_at' => $msgTime->gt($conversation->last_message_at ?? now()->subSecond())
                    ? $msgTime
                    : ($conversation->last_message_at ?? $msgTime),
                'last_message' => $body ?: ($messageType !== 'text' ? "[{$messageType}]" : ''),
                'last_message_type' => $messageType,
                'last_message_direction' => $fromMe ? 'outgoing' : 'incoming',
                'last_message_status' => WhatsAppMessage::STATUS_DELIVERED,
            ];
            if (!$fromMe) {
                $convUpdate['unread_count'] = ($conversation->unread_count ?? 0) + 1;
                // A resolved chat that gets a fresh customer reply reopens —
                // the rating stays, the "مكتمل" badge and stale lock clear.
                if ($conversation->resolved_at) {
                    $convUpdate['resolved_at'] = null;
                    $convUpdate['resolved_by'] = null;
                }
            } else {
                // Reply sent straight from the WhatsApp app — the owner has
                // clearly seen this chat, so a stale unread badge is wrong.
                if (($conversation->unread_count ?? 0) > 0) {
                    $convUpdate['unread_count'] = 0;
                }
            }
            if ($senderName && (!$conversation->contact_name || str_starts_with($conversation->contact_name, '+'))) {
                $convUpdate['contact_name'] = $senderName;
            }
            if ($contactPhone && !$conversation->contact_phone) {
                $convUpdate['contact_phone'] = $contactPhone;
            }
            $conversation->update($convUpdate);

            // The owner's uploaded address book wins over pushnames.
            try {
                \App\Services\CrmContactBook::applyToConversation($conversation);
            } catch (\Throwable $ignored) {}

            // Save incoming message record if it has a messageId or body
            $incomingMessage = null;
            if ($messageId || !empty($data['mediaUrl'])) {
                $msgValues = [
                    'session_id' => $session->id,
                    'conversation_id' => $conversation->id,
                    'from' => $fromMe ? $session->phone_number : $senderPhone,
                    'to' => $fromMe ? $contactPhone : $session->phone_number,
                    'message' => $body,
                    'media_mime_type' => $data['mimeType'] ?? null,
                    'message_type' => $messageType,
                    'direction' => $fromMe ? 'outgoing' : 'incoming',
                    'status' => WhatsAppMessage::STATUS_DELIVERED,
                    'reply_to_id' => $data['replyToId'] ?? null,
                    'is_forwarded' => !empty($data['isForwarded']),
                    'sent_at' => $msgTime,
                    'delivered_at' => $msgTime,
                    'timestamp' => $msgTime,
                ];
                if (!empty($data['mediaUrl'])) {
                    $msgValues['media_url'] = $data['mediaUrl'];
                }
                if (!empty($data['mediaMeta']) && is_array($data['mediaMeta'])) {
                    $msgValues['media_meta'] = $data['mediaMeta'];
                }
                $incomingMessage = WhatsAppMessage::updateOrCreate(
                    [
                        'user_id' => $session->user_id,
                        'message_id' => $messageId ?: ('inc_' . uniqid()),
                    ],
                    $msgValues
                );
            }

            // Push to the CRM realtime channel so every open agent browser
            // sees the new message instantly — no polling wait.
            try {
                event(new \App\Events\CrmRealtimeEvent($session->user_id, 'message.new', [
                    'session_id' => $session->id,
                    'conversation_id' => $conversation->id,
                    'conversation' => $conversation->fresh()?->only([
                        'id', 'session_id', 'contact_jid', 'contact_name', 'contact_phone',
                        'contact_avatar', 'last_message', 'last_message_at',
                        'last_message_direction', 'last_message_type', 'last_message_status', 'unread_count', 'is_pinned',
                        'assigned_agent_id', 'assigned_at', 'resolved_at', 'resolved_by',
                        'rating', 'rating_note',
                    ]),
                    'message' => $incomingMessage?->toArray(),
                ]));
            } catch (\Throwable $e) {
                Log::debug('CRM broadcast (message.new) failed: ' . $e->getMessage());
            }

            // Dispatch incoming message event for user webhooks
            WebhookDispatcher::dispatch($session->user_id, 'message.received', [
                'session_id' => $session->id,
                'from' => $fromMe ? $session->phone_number : $senderPhone,
                'to' => $fromMe ? $contactPhone : $session->phone_number,
                'message' => $body,
                'message_type' => $messageType,
                'message_id' => $messageId,
                'timestamp' => now()->toIso8601String(),
                'direction' => $fromMe ? 'outgoing' : 'incoming',
            ]);

            // Auto Reply handling:
            // 1. Ignore own messages, group chats, broadcast channels, newsletters, or empty sender
            if ($fromMe || $isGroup || str_contains($data['from'], '@g.us') || str_contains($data['from'], 'broadcast') || str_contains($data['from'], 'newsletter') || empty($senderPhone)) {
                return response()->json(['success' => true, 'auto_replied' => false, 'reason' => 'group_or_broadcast']);
            }

            // 2. Check if auto reply is enabled for this session
            $autoReply = WhatsAppAutoReply::where('user_id', $session->user_id)
                ->where('session_id', $session->id)
                ->where('is_enabled', true)
                ->first();

            if (!$autoReply) {
                return response()->json(['success' => true, 'auto_replied' => false, 'reason' => 'disabled']);
            }

            // Static mode requires a non-empty static reply text
            if ($autoReply->mode === 'static' && empty(trim($autoReply->reply_message))) {
                WhatsAppAutoReplyLog::create([
                    'user_id' => $session->user_id,
                    'session_id' => $session->id,
                    'conversation_id' => $conversation->id,
                    'incoming_message_id' => $incomingMessage?->id,
                    'sender_phone' => $senderPhone,
                    'sender_name' => $senderName,
                    'incoming_message' => $body,
                    'reply_message' => null,
                    'status' => 'disabled',
                    'status_reason' => 'الرد الثابت غير مفعّل لهذا الجهاز',
                ]);

                return response()->json(['success' => true, 'auto_replied' => false, 'reason' => 'disabled_or_empty']);
            }

            // Duplicate / already processed protection
            $dedupKey = "wa_incoming:{$session->id}:{$messageId}";
            if ($messageId && !Cache::add($dedupKey, true, 300)) {
                Log::info("Duplicate incoming message ignored: {$messageId}");
                return response()->json(['success' => true, 'auto_replied' => false, 'reason' => 'duplicate']);
            }

            // 3. Prevent rapid loop/flood: don't auto reply to same contact within 30 seconds
            $floodKey = "auto_reply_flood:{$session->id}:{$senderPhone}";
            if ($autoReply->mode !== 'ai' && Cache::has($floodKey)) {
                Log::info("Auto reply suppressed for {$senderPhone} on session {$session->id} (loop/flood prevention)");
                WhatsAppAutoReplyLog::create([
                    'user_id' => $session->user_id,
                    'session_id' => $session->id,
                    'conversation_id' => $conversation->id,
                    'incoming_message_id' => $incomingMessage?->id,
                    'sender_phone' => $senderPhone,
                    'sender_name' => $senderName,
                    'incoming_message' => $body,
                    'reply_message' => $autoReply->reply_message,
                    'status' => 'cooldown',
                    'status_reason' => 'تم تخطي الرد لتكرار الرسائل في فترة قصيرة (Anti-flood)',
                ]);

                return response()->json(['success' => true, 'auto_replied' => false, 'reason' => 'flood_cooldown']);
            }

            // 4. "Reply once per conversation" check if enabled
            $onceKey = "auto_reply_once:{$conversation->id}";
            if ($autoReply->reply_once && Cache::has($onceKey)) {
                Log::info("Auto reply suppressed for {$senderPhone} on conversation {$conversation->id} (reply_once active)");
                WhatsAppAutoReplyLog::create([
                    'user_id' => $session->user_id,
                    'session_id' => $session->id,
                    'conversation_id' => $conversation->id,
                    'incoming_message_id' => $incomingMessage?->id,
                    'sender_phone' => $senderPhone,
                    'sender_name' => $senderName,
                    'incoming_message' => $body,
                    'reply_message' => $autoReply->mode === 'ai' ? null : $autoReply->reply_message,
                    'status' => 'reply_once_skipped',
                    'status_reason' => 'تم الرد مسبقاً على هذه المحادثة (رد مرة واحدة)',
                ]);

                return response()->json(['success' => true, 'auto_replied' => false, 'reason' => 'reply_once_active']);
            }

            // Target address: use full JID if available
            $targetAddress = $data['from'];

            $delay = (int) ($autoReply->delay_seconds ?? 0);

            if ($autoReply->mode === 'ai') {
                if (!$incomingMessage || !$messageId) {
                    return response()->json(['success' => true, 'auto_replied' => false, 'reason' => 'ai_no_message_id']);
                }

                $log = WhatsAppAutoReplyLog::create([
                    'user_id' => $session->user_id,
                    'session_id' => $session->id,
                    'conversation_id' => $conversation->id,
                    'incoming_message_id' => $incomingMessage->id,
                    'sender_phone' => $senderPhone,
                    'sender_name' => $senderName,
                    'incoming_message' => $body,
                    'reply_message' => null,
                    'status' => 'ai_pending',
                    'status_reason' => 'تم استلام الرسالة وبانتظار معالجة الذكاء الاصطناعي',
                ]);

                $this->setTyping($session, $data['from'], true);
                GenerateAIReplyJob::dispatch($log->id);

                Log::info("AI auto reply queued for {$senderPhone} on session {$session->id}");

                return response()->json([
                    'success' => true,
                    'auto_replied' => true,
                    'mode' => 'ai',
                    'log_id' => $log->id,
                ]);
            }

            // Create queued outgoing static Auto Reply message
            $replyMessage = WhatsAppMessage::create([
                'user_id' => $session->user_id,
                'session_id' => $session->id,
                'conversation_id' => $conversation->id,
                'from' => $session->phone_number,
                'to' => $targetAddress,
                'message' => $autoReply->reply_message,
                'message_type' => 'text',
                'direction' => 'outgoing',
                'status' => WhatsAppMessage::STATUS_QUEUED,
                'queued_at' => now(),
                'timestamp' => now(),
            ]);

            // Create Auto Reply Log record
            WhatsAppAutoReplyLog::create([
                'user_id' => $session->user_id,
                'session_id' => $session->id,
                'conversation_id' => $conversation->id,
                'incoming_message_id' => $incomingMessage?->id,
                'sender_phone' => $senderPhone,
                'sender_name' => $senderName,
                'incoming_message' => $body,
                'reply_message' => $autoReply->reply_message,
                'status' => 'queued',
                'status_reason' => 'تمت جدولة الرد التلقائي بنجاح',
                'outgoing_message_id' => $replyMessage->id,
            ]);

            // Set anti-flood lock (30s) and reply-once lock (30 days)
            Cache::put($floodKey, true, 30);
            if ($autoReply->reply_once) {
                Cache::put($onceKey, true, 86400 * 30);
            }

            // Update auto reply stats
            $autoReply->increment('total_replies_sent');
            $autoReply->update(['last_reply_at' => now()]);

            // Dispatch job with user-configured delay
            if ($delay <= 0) {
                $delay = rand(1, 2);
            }

            // isAutoReply=true: bypasses the 60s anti-ban pacing and plan
            // quota so instant static replies actually send immediately.
            SendWhatsAppMessageJob::dispatch($replyMessage->id, false, true)->delay(now()->addSeconds($delay));

            Log::info("Auto reply scheduled for {$senderPhone} on session {$session->id} with delay {$delay}s");

            return response()->json([
                'success' => true,
                'auto_replied' => true,
                'mode' => 'static',
                'message_id' => $replyMessage->id,
                'delay' => $delay,
            ]);
        } catch (\Exception $e) {
            Log::error("Error processing message received webhook: " . $e->getMessage());
            return response()->json([
                'success' => false,
                'message' => 'Error processing webhook',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Persist a WhatsApp status item (story). Called from messageReceived for
     * live `status@broadcast` traffic and from historySync for synced status
     * conversations. Idempotent on (session_id, message_id). The poster's
     * display name prefers the device owner's saved contact name — exactly
     * like WhatsApp shows it — falling back to pushname then the raw number.
     */
    private function recordStatus(WhatsAppSession $session, array $data): ?\App\Models\WhatsAppStatus
    {
        $fromMe = (bool) ($data['fromMe'] ?? false);
        $posterPhone = $fromMe
            ? preg_replace('/\D/', '', (string) $session->phone_number)
            : preg_replace('/\D/', '', (string) ($data['senderPhone'] ?? ''));

        // LID-posted status: resolve the phone via the stored lid→pn map,
        // falling back to a live usync query for posters not yet mapped.
        if (!$posterPhone && !empty($data['senderLid'])) {
            $pn = DB::table('whatsapp_lid_mappings')->where('lid', $data['senderLid'])->value('pn');
            if (!$pn) {
                try {
                    $engineUrl = rtrim(config('services.whatsapp.url', 'http://127.0.0.1:3005'), '/');
                    $apiKey = config('services.whatsapp.api_key', 'wavixa-local-api-key-2026');
                    $res = Http::withHeaders(['Authorization' => 'Bearer ' . $apiKey])
                        ->timeout(10)
                        ->post("{$engineUrl}/internal/lid/resolve", [
                            'sessionId' => $session->session_token,
                            'lids' => [$data['senderLid']],
                        ]);
                    $pn = collect($res->json('mappings') ?: [])->first(fn ($v) => str_ends_with((string) $v, '@s.whatsapp.net'));
                    if ($pn) {
                        DB::table('whatsapp_lid_mappings')->updateOrInsert(
                            ['lid' => $data['senderLid']],
                            ['pn' => $pn, 'updated_at' => now(), 'created_at' => now()]
                        );
                    }
                } catch (\Throwable $e) {
                    Log::debug('status lid resolve failed: ' . $e->getMessage());
                }
            }
            $posterPhone = preg_replace('/\D/', '', explode('@', (string) ($pn ?: ''))[0]);
        }
        if (!$posterPhone) {
            // Last resort: the raw sender id is better than dropping the story.
            $posterPhone = preg_replace('/\D/', '', explode('@', (string) ($data['senderLid'] ?? ''))[0]);
        }
        if (!$posterPhone) return null;

        $posterJid = $fromMe
            ? $posterPhone . '@s.whatsapp.net'
            : (!empty($data['senderLid']) && empty($data['senderPhone'])
                ? $data['senderLid']
                : $posterPhone . '@s.whatsapp.net');

        $postedAt = !empty($data['msgTimestamp'])
            ? \Carbon\Carbon::createFromTimestamp((int) $data['msgTimestamp'])
            : now();

        // Saved contact name (what the owner actually calls them) → pushname → number.
        $contact = WhatsAppConversation::where('session_id', $session->id)
            ->where('contact_phone', $posterPhone)
            ->first()
            ?? WhatsAppConversation::where('user_id', $session->user_id)
                ->where('contact_phone', $posterPhone)
                ->first();
        $savedName = ($contact && $contact->contact_name && !preg_match('/^\+?\d+$/', trim($contact->contact_name)))
            ? $contact->contact_name
            : null;
        $posterName = $fromMe
            ? ($savedName ?: 'أنا')
            : ($savedName ?: ($data['senderName'] ?? null) ?: '+' . $posterPhone);

        $values = [
            'user_id' => $session->user_id,
            'poster_jid' => $posterJid,
            'poster_phone' => $posterPhone,
            'poster_name' => $posterName,
            'poster_avatar' => $contact?->contact_avatar,
            'is_mine' => $fromMe,
            'type' => $data['type'] ?? 'text',
            'body' => $data['body'] ?? null,
            'media_mime_type' => $data['mimeType'] ?? null,
            'posted_at' => $postedAt,
            'expires_at' => $postedAt->copy()->addHours(24),
        ];
        if (!empty($data['mediaUrl'])) {
            $values['media_url'] = $data['mediaUrl'];
        }
        if (!empty($data['mediaMeta']) && is_array($data['mediaMeta'])) {
            $values['media_meta'] = $data['mediaMeta'];
        }

        $status = \App\Models\WhatsAppStatus::updateOrCreate(
            [
                'session_id' => $session->id,
                'message_id' => $data['messageId'] ?? ('st_' . uniqid()),
            ],
            $values
        );

        if ($status->wasRecentlyCreated) {
            try {
                event(new \App\Events\CrmRealtimeEvent($session->user_id, 'status.new', [
                    'status' => $status->toArray(),
                ]));
            } catch (\Throwable $e) {
                Log::debug('CRM broadcast (status.new) failed: ' . $e->getMessage());
            }
        }

        return $status;
    }

    private function setTyping(?WhatsAppSession $session, string $contactJid, bool $composing): void
    {
        if (!$session) {
            return;
        }

        try {
            $serviceUrl = rtrim(config('services.whatsapp.url', 'http://127.0.0.1:3002'), '/');
            $nodeUserId = $session->nodeUserId();
            $state = $composing ? 'composing' : 'paused';

            Http::timeout(10)
                ->withHeaders([
                    'Authorization' => 'Bearer ' . config('services.whatsapp.api_key'),
                ])
                ->post("{$serviceUrl}/api/whatsapp/send-presence", [
                    'userId' => $nodeUserId,
                    'to' => $contactJid,
                    'state' => $state,
                ]);
        } catch (\Throwable $e) {
            Log::warning("Webhook presence failed for {$contactJid}: " . $e->getMessage());
        }
    }
}
