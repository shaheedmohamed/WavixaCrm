<?php

namespace App\Http\Controllers\Api;

use App\Events\CrmRealtimeEvent;
use App\Http\Controllers\Controller;
use App\Models\WhatsAppSession;
use App\Services\CallBridgeManager;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * CRM voice calls — proxies call control to per-number WhatsApp call-bridge
 * instances (whatsapp-callbridge, Puppeteer WA Web sessions). Each CRM-linked
 * number gets its own `wavixa-callbridge@<phone>` unit — see CallBridgeManager.
 * The bridge handles one call at a time per instance. The WS ticket is a
 * short-lived HMAC used to open the audio WebSocket (nginx /call-ws/<port>).
 */
class CrmCallController extends Controller
{
    private function wsSecret(): ?string
    {
        $s = env('CALL_WS_SECRET');
        if ($s) return $s;
        $f = '/var/www/Wavixa/whatsapp-callbridge/.wssecret';
        return is_file($f) ? trim(file_get_contents($f)) : null;
    }

    /**
     * Which number should serve this request: an explicit ?phone= (validated
     * against the caller's sessions), the conversation's owning session phone,
     * the user's own connected session, or the default system bridge.
     */
    private function callerPhone(Request $request): string
    {
        $user = $request->user();
        $explicit = preg_replace('/\D/', '', (string) $request->input('phone'));
        if ($explicit) {
            $owns = $user && WhatsAppSession::where('phone_number', 'like', "%{$explicit}")->exists();
            if ($owns || ($user && in_array($user->crm_role, ['owner', 'admin']))) return $explicit;
        }
        if ($convId = $request->input('conversation_id')) {
            $conv = \App\Models\WhatsAppConversation::find($convId);
            if ($conv?->session?->phone_number) return $conv->session->phone_number;
        }
        $sess = $user ? WhatsAppSession::where('user_id', $user->id)
            ->where('status', 'connected')->latest('connected_at')->first() : null;
        return $sess?->phone_number ?: CallBridgeManager::DEFAULT_PHONE;
    }

    private function post(string $base, string $path, array $body = [], int $timeout = 15)
    {
        try {
            $r = Http::timeout($timeout)->post($base . $path, $body);
            return $r->json() ?? ['ok' => false, 'err' => 'bad bridge response'];
        } catch (\Throwable $e) {
            return ['ok' => false, 'err' => 'bridge unreachable: ' . $e->getMessage()];
        }
    }

    /** Provisioned + up URL for the phone, or a needs_pairing-style result. */
    private function bridgeFor(string $phone): ?string
    {
        CallBridgeManager::ensure($phone);
        return CallBridgeManager::url($phone);
    }

    /**
     * Read-only bridge status — unlike /state this never provisions an
     * instance, so pages can poll it per device without spinning up
     * Chromium for numbers that never asked for calls.
     */
    public function status(Request $request)
    {
        $phone = $this->callerPhone($request);
        $r = CallBridgeManager::resolve($phone);
        if (!$r) return response()->json(['ready' => false, 'provisioned' => false, 'phone' => $phone]);
        try {
            $j = Http::timeout(5)->get("http://127.0.0.1:{$r['port']}/state")->json() ?? [];
        } catch (\Throwable $e) {
            $j = [];
        }
        return response()->json([
            'ready' => (bool) ($j['ready'] ?? false),
            'online' => (bool) ($j['online'] ?? false),
            'provisioned' => true,
            'phone' => $phone,
            'callState' => $j['callState'] ?? 'idle',
        ]);
    }

    public function state(Request $request)
    {
        $phone = $this->callerPhone($request);
        $base = $this->bridgeFor($phone);
        if (!$base) return response()->json(['ready' => false, 'err' => 'no bridge for ' . $phone]);
        try {
            $r = Http::timeout(8)->get($base . '/state');
            $j = $r->json() ?? ['ready' => false];
            $j['phone'] = $phone;
            return response()->json($j);
        } catch (\Throwable $e) {
            return response()->json(['ready' => false, 'phone' => $phone, 'err' => $e->getMessage()]);
        }
    }

    /**
     * Pairing QR for the requested phone's bridge as PNG. The session's owner
     * (and owner/admin) may fetch it — agents need it to pair THEIR calls.
     */
    public function pairingQr(Request $request)
    {
        $accessToken = \Laravel\Sanctum\PersonalAccessToken::findToken((string) $request->query('token'));
        $user = $accessToken?->tokenable;
        if (!$user) abort(403);
        $phone = preg_replace('/\D/', '', (string) $request->query('phone')) ?: $this->callerPhone($request);
        $isAdmin = in_array($user->crm_role, ['owner', 'admin']);
        $owns = WhatsAppSession::where('user_id', $user->id)->where('phone_number', 'like', "%{$phone}")->exists();
        if (!$isAdmin && !$owns) abort(403);
        $png = CallBridgeManager::qrPath($phone);
        if (!is_file($png)) {
            abort(404, 'no qr — bridge is paired or not emitting one');
        }
        return response()->file($png, ['Cache-Control' => 'no-store']);
    }

    /**
     * Explicit "enable calls for my number" — provisions the bridge instance
     * so the app can immediately show whether WA Web pairing is required.
     */
    public function link(Request $request)
    {
        $phone = $this->callerPhone($request);
        $r = CallBridgeManager::ensure($phone);
        if (!$r) return response()->json(['ok' => false, 'err' => 'bridge cap reached'], 503);
        $state = null;
        try { $state = Http::timeout(5)->get("http://127.0.0.1:{$r['port']}/state")->json(); } catch (\Throwable $e) {}
        return response()->json([
            'ok' => true,
            'phone' => $phone,
            'port' => $r['port'],
            'created' => $r['created'],
            'ready' => (bool) ($state['ready'] ?? false),
            'online' => (bool) ($state['online'] ?? false),
        ]);
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

        $phone = $this->callerPhone($request);
        $base = $this->bridgeFor($phone);
        if (!$base) return response()->json(['ok' => false, 'err' => 'bridge cap reached'], 503);

        // Fresh instance or unpaired WA Web → tell the app to show the QR.
        try {
            $st = Http::timeout(8)->get($base . '/state')->json();
            if (!($st['ready'] ?? false)) {
                return response()->json([
                    'ok' => false,
                    'err' => 'مكالمات الرقم ده محتاجة ربط WhatsApp Web مرة واحدة — افتح رابط الـ QR من الإعدادات',
                    'needs_pairing' => true,
                    'phone' => $phone,
                    'qr' => '/api/crm/call/qr?phone=' . $phone . '&token=' . urlencode((string) $request->bearerToken()),
                ]);
            }
        } catch (\Throwable $e) {
            return response()->json(['ok' => false, 'err' => 'bridge starting: ' . $e->getMessage()], 503);
        }

        // dial walks the WA UI (open chat → menu → picker) — allow ~45s
        return response()->json($this->post($base, '/dial', ['to' => $to, 'video' => $request->boolean('video')], 45));
    }

    public function answer(Request $request)  { return $this->callCtl($request, '/answer'); }
    public function reject(Request $request)  { return $this->callCtl($request, '/reject'); }
    public function hangup(Request $request)  { return $this->callCtl($request, '/hangup'); }
    public function mute(Request $request)    { return $this->callCtl($request, '/mute', ['mute' => $request->boolean('mute', true)]); }

    private function callCtl(Request $request, string $path, array $body = [])
    {
        $base = CallBridgeManager::url($this->callerPhone($request));
        if (!$base) return response()->json(['ok' => false, 'err' => 'no bridge'], 503);
        return response()->json($this->post($base, $path, $body));
    }

    /** Short-lived HMAC ticket for the audio WebSocket (nginx /call-ws/<port>). */
    public function wsTicket(Request $request)
    {
        $secret = $this->wsSecret();
        if (!$secret) return response()->json(['ok' => false, 'err' => 'ws secret not configured'], 500);
        $uid = $request->user()->id;
        $exp = (time() + 120) * 1000; // ms — matches bridge Date.now() check
        $sig = hash_hmac('sha256', "{$uid}.{$exp}", $secret);
        $scheme = $request->secure() ? 'wss' : 'ws';
        $phone = $this->callerPhone($request);
        $r = CallBridgeManager::resolve($phone) ?? ['port' => CallBridgeManager::DEFAULT_PORT];
        $wsPath = $r['port'] === CallBridgeManager::DEFAULT_PORT ? '/call-ws' : "/call-ws/{$r['port']}";
        return response()->json([
            'ok' => true,
            'ticket' => "{$uid}.{$exp}.{$sig}",
            'url' => "{$scheme}://{$request->getHost()}{$wsPath}",
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
            $this->pushCallEnded($request, $session, $ownerId);
        }

        // Incoming call → data-only high-priority push so the app wakes and
        // renders a real full-screen ringing UI even when killed/locked.
        if ($request->input('event') === 'state' && $request->input('callState') === 'incoming'
            && $request->filled('peer')) {
            $this->pushIncomingCall($request, $session, $ownerId);
        }
        return response()->json(['ok' => true]);
    }

    /** Owner + the agent the peer's chat is assigned to. */
    private function callTargets($session, string $peer): array
    {
        $conv = \App\Models\WhatsAppConversation::where('session_id', $session->id)
            ->where(function ($q) use ($peer) {
                $q->where('contact_phone', $peer)
                  ->orWhere('contact_jid', 'like', "%{$peer}%");
            })->first();
        return [$conv, collect([$session->user_id, $conv?->assigned_agent_id])
            ->filter()->unique()->values()];
    }

    /** FCM data "call.incoming" → app renders its own full-screen call UI. */
    private function pushIncomingCall(Request $request, $session, int $ownerId): void
    {
        try {
            $peer = preg_replace('/\D/', '', (string) $request->input('peer'));
            [$conv, $targets] = $this->callTargets($session, $peer);
            $caller = $conv?->contact_name ?: "+{$peer}";
            foreach ($targets as $uid) {
                \App\Services\ExpoPushService::sendDataPush($uid, [
                    'type' => 'call.incoming',
                    'conversation_id' => $conv?->id,
                    'peer' => $peer,
                    'caller' => $caller,
                    'video' => $request->boolean('video') ? '1' : '0',
                ]);
            }
        } catch (\Throwable $e) {
            Log::debug('CRM push (call.incoming) failed: ' . $e->getMessage());
        }
    }

    /**
     * FCM data "call.end" cancels the ringing UI on every target device; an
     * unanswered incoming call additionally leaves a normal missed-call
     * notification so there is a tray trace like WhatsApp.
     */
    private function pushCallEnded(Request $request, $session, int $ownerId): void
    {
        try {
            $peer = preg_replace('/\D/', '', (string) $request->input('peer'));
            [$conv, $targets] = $this->callTargets($session, $peer);
            foreach ($targets as $uid) {
                \App\Services\ExpoPushService::sendDataPush($uid, [
                    'type' => 'call.end',
                    'conversation_id' => $conv?->id,
                    'peer' => $peer,
                ]);
            }
            if ($request->input('direction') === 'in' && !$request->boolean('answered')) {
                $caller = $conv?->contact_name ?: "+{$peer}";
                foreach ($targets as $uid) {
                    \App\Services\ExpoPushService::notifyIncoming(
                        $uid, 'مكالمة فائتة', "{$caller} حاول الاتصال بك",
                        ['conversation_id' => $conv?->id, 'type' => 'call.missed']
                    );
                }
            }
        } catch (\Throwable $e) {
            Log::debug('CRM push (call.end) failed: ' . $e->getMessage());
        }
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

            $freshConv = $conversation->fresh([
                'assignedAgent:id,name',
                'resolvedBy:id,name',
                'lastOutgoingUser:id,name',
                'transferredBy:id,name',
            ]);
            event(new CrmRealtimeEvent($session->user_id, 'message.new', [
                'session_id' => $session->id,
                'conversation_id' => $conversation->id,
                'conversation' => $freshConv ? array_merge(
                    $freshConv->only([
                        'id', 'session_id', 'contact_jid', 'contact_name', 'contact_phone',
                        'contact_avatar', 'last_message', 'last_message_at',
                        'last_message_direction', 'last_message_type', 'last_message_status', 'unread_count', 'is_pinned',
                        'assigned_agent_id', 'assigned_at', 'resolved_at', 'resolved_by',
                        'rating', 'rating_note', 'last_outgoing_user_id',
                    ]),
                    [
                        'assigned_agent' => $freshConv->assignedAgent ? [
                            'id' => $freshConv->assignedAgent->id,
                            'name' => $freshConv->assignedAgent->name,
                        ] : null,
                        'last_outgoing_user' => $freshConv->lastOutgoingUser ? [
                            'id' => $freshConv->lastOutgoingUser->id,
                            'name' => $freshConv->lastOutgoingUser->name,
                        ] : null,
                    ]
                ) : null,
                'message' => $msg->toArray(),
            ]));
        } catch (\Throwable $e) {
            Log::debug('CRM call-log message failed: ' . $e->getMessage());
        }
    }
}
