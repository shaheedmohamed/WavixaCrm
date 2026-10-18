<?php

namespace App\Http\Controllers\Api;

use App\Events\CrmRealtimeEvent;
use App\Http\Controllers\Controller;
use App\Models\WhatsAppSession;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * CRM voice calls — proxies call control to the local WhatsApp call bridge
 * (whatsapp-callbridge, a Puppeteer-driven WhatsApp Web session on 127.0.0.1:3999)
 * and receives its call events for Reverb broadcast.
 *
 * The bridge handles one call at a time. The WS ticket is a short-lived HMAC
 * the CRM browser uses to open the audio WebSocket (nginx → bridge /ws).
 */
class CrmCallController extends Controller
{
    private function bridge(): string
    {
        return rtrim(env('CALL_BRIDGE_URL', 'http://127.0.0.1:3999'), '/');
    }

    private function wsSecret(): ?string
    {
        $s = env('CALL_WS_SECRET');
        if ($s) return $s;
        $f = '/var/www/Wavixa/whatsapp-callbridge/.wssecret';
        return is_file($f) ? trim(file_get_contents($f)) : null;
    }

    private function post(string $path, array $body = [], int $timeout = 15)
    {
        try {
            $r = Http::timeout($timeout)->post($this->bridge() . $path, $body);
            return $r->json() ?? ['ok' => false, 'err' => 'bad bridge response'];
        } catch (\Throwable $e) {
            return ['ok' => false, 'err' => 'bridge unreachable: ' . $e->getMessage()];
        }
    }

    public function state()
    {
        try {
            $r = Http::timeout(8)->get($this->bridge() . '/state');
            return response()->json($r->json() ?? ['ready' => false]);
        } catch (\Throwable $e) {
            return response()->json(['ready' => false, 'err' => $e->getMessage()]);
        }
    }

    public function dial(Request $request)
    {
        // Group conversations carry a @g.us JID — keep the suffix so the
        // bridge opens the group chat instead of a bogus @c.us contact.
        $raw = trim((string) $request->input('to'));
        $to = preg_replace('/\D/', '', $raw);
        if (stripos($raw, '@g.us') !== false || preg_match('/^120363\d+$/', $to)) {
            $to .= '@g.us';
        }
        if (!$to || $to === '@g.us') return response()->json(['ok' => false, 'err' => 'missing number'], 422);
        // dial walks the WA UI (open chat → menu → picker) — allow ~45s
        return response()->json($this->post('/dial', ['to' => $to, 'video' => $request->boolean('video')], 45));
    }

    public function answer()  { return response()->json($this->post('/answer')); }
    public function reject()  { return response()->json($this->post('/reject')); }
    public function hangup()  { return response()->json($this->post('/hangup')); }
    public function mute(Request $request) { return response()->json($this->post('/mute', ['mute' => $request->boolean('mute', true)])); }

    /** Short-lived HMAC ticket for the audio WebSocket (nginx /call-ws → bridge). */
    public function wsTicket(Request $request)
    {
        $secret = $this->wsSecret();
        if (!$secret) return response()->json(['ok' => false, 'err' => 'ws secret not configured'], 500);
        $uid = $request->user()->id;
        $exp = (time() + 120) * 1000; // ms — matches bridge Date.now() check
        $sig = hash_hmac('sha256', "{$uid}.{$exp}", $secret);
        $scheme = $request->secure() ? 'wss' : 'ws';
        return response()->json([
            'ok' => true,
            'ticket' => "{$uid}.{$exp}.{$sig}",
            'url' => "{$scheme}://{$request->getHost()}/call-ws",
        ]);
    }

    /**
     * Bridge → CRM call events. Runs behind VerifyServiceSignature
     * (X-Service-Signature HMAC over the raw JSON body).
     * Broadcasts to the owner of the bridge number's WhatsApp session.
     */
    public function event(Request $request)
    {
        $phone = (string) $request->input('bridgePhone');
        $session = WhatsAppSession::where('phone_number', $phone)->orWhere('phone_number', 'like', '%' . substr($phone, -10))->first();
        $ownerId = $session?->user_id;
        if (!$ownerId) return response()->json(['ok' => true, 'skipped' => 'no owner']);

        try {
            event(new CrmRealtimeEvent($ownerId, 'call.event', [
                'event' => $request->input('event'),
                'callState' => $request->input('callState'),
                'peer' => $request->input('peer'),
                'reason' => $request->input('reason'),
                'video' => $request->boolean('video'),
            ]));
        } catch (\Throwable $e) {
            Log::debug('CRM broadcast (call.event) failed: ' . $e->getMessage());
        }

        // Call finished → drop a call-log bubble into the CRM conversation,
        // mirroring WhatsApp's own "Voice call" chat entry. Only real call
        // attempts count — a 'dialing' end means the call was never placed.
        if ($request->input('event') === 'state' && $request->input('callState') === 'idle'
            && $request->filled('peer')
            && in_array($request->input('prevState'), ['ringing', 'connecting', 'active', 'incoming'])) {
            $this->logCallMessage($request, $session);
        }
        return response()->json(['ok' => true]);
    }

    /** Persist a call-log message row + broadcast it like a normal message. */
    private function logCallMessage(Request $request, $session): void
    {
        try {
            $peer = preg_replace('/\D/', '', (string) $request->input('peer'));
            $direction = $request->input('direction') === 'in' ? 'incoming' : 'outgoing';
            $answered = (bool) $request->input('answered');
            $duration = (int) $request->input('duration', 0);
            $dur = sprintf('%d:%02d', intdiv($duration, 60), $duration % 60);
            $kind = $request->boolean('video') ? 'فيديو' : 'صوتية';

            $body = match (true) {
                $direction === 'outgoing' && $answered => "مكالمة {$kind} • {$dur}",
                $direction === 'outgoing' => "مكالمة {$kind} • لم يتم الرد",
                $answered => "مكالمة {$kind} واردة • {$dur}",
                default => "مكالمة {$kind} فائتة",
            };

            $conversation = \App\Models\WhatsAppConversation::where('session_id', $session->id)
                ->where(function ($q) use ($peer) {
                    $q->where('contact_phone', $peer)
                      ->orWhere('contact_jid', 'like', "%{$peer}%");
                })->first();
            if (!$conversation) {
                $conversation = \App\Models\WhatsAppConversation::create([
                    'session_id' => $session->id,
                    'user_id' => $session->user_id,
                    'contact_jid' => "{$peer}@s.whatsapp.net",
                    'contact_phone' => $peer,
                    'contact_name' => "+{$peer}",
                    'last_message_at' => now(),
                    'unread_count' => 0,
                ]);
            }

            $msg = \App\Models\WhatsAppMessage::create([
                'user_id' => $session->user_id,
                'session_id' => $session->id,
                'conversation_id' => $conversation->id,
                'message_id' => 'call_' . uniqid(),
                'from' => $direction === 'outgoing' ? $session->phone_number : $peer,
                'to' => $direction === 'outgoing' ? $peer : $session->phone_number,
                'message' => $body,
                'message_type' => 'call',
                'direction' => $direction,
                'status' => \App\Models\WhatsAppMessage::STATUS_DELIVERED,
                'sent_at' => now(),
                'delivered_at' => now(),
                'timestamp' => now(),
            ]);

            $convUpdate = [
                'last_message' => $body,
                'last_message_type' => 'call',
                'last_message_at' => now(),
                'last_message_direction' => $direction,
                'last_message_status' => \App\Models\WhatsAppMessage::STATUS_DELIVERED,
            ];
            if ($direction === 'incoming' && !$answered) {
                $convUpdate['unread_count'] = ($conversation->unread_count ?? 0) + 1;
            }
            $conversation->update($convUpdate);

            event(new CrmRealtimeEvent($session->user_id, 'message.new', [
                'session_id' => $session->id,
                'conversation_id' => $conversation->id,
                'conversation' => $conversation->fresh()?->only([
                    'id', 'session_id', 'contact_jid', 'contact_name', 'contact_phone',
                    'contact_avatar', 'last_message', 'last_message_at',
                    'last_message_direction', 'last_message_type', 'last_message_status', 'unread_count', 'is_pinned',
                    'assigned_agent_id', 'assigned_at', 'resolved_at', 'resolved_by',
                    'rating', 'rating_note',
                ]),
                'message' => $msg->toArray(),
            ]));
        } catch (\Throwable $e) {
            Log::debug('CRM call-log message failed: ' . $e->getMessage());
        }
    }
}
