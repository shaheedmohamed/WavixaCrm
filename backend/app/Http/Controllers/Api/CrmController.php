<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\CrmGroup;
use App\Models\LoginHistory;
use App\Models\User;
use App\Services\DeviceInfoService;
use App\Services\FraudDetectionService;
use App\Models\WhatsAppConversation;
use App\Models\WhatsAppMessage;
use App\Models\WhatsAppSession;
use App\Services\CrmSubscriptionService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class CrmController extends Controller
{
    private string $engineUrl;
    private string $apiKey;
    protected CrmSubscriptionService $subscriptionService;

    public function __construct(CrmSubscriptionService $subscriptionService)
    {
        $this->subscriptionService = $subscriptionService;
        $this->engineUrl = rtrim(config('services.whatsapp.url', 'http://127.0.0.1:3005'), '/');
        $this->apiKey = config('services.whatsapp.api_key', 'wavixa-local-api-key-2026');
    }

    private function engineClient()
    {
        return Http::withHeaders([
            'Authorization' => 'Bearer ' . $this->apiKey,
        ])->timeout(30);
    }

    /**
     * Resolve the owner user for the current authenticated CRM user.
     * If user is owner, returns self. If agent, returns parent owner.
     */
    private function resolveOwner(): User
    {
        /** @var User $user */
        return $this->resolveOwnerFor(Auth::user());
    }

    private function resolveOwnerFor(User $user): User
    {
        if ($user->crm_role === 'agent' && $user->crm_parent_id) {
            $parent = User::find($user->crm_parent_id);
            if ($parent) {
                return $parent;
            }
        }
        return $user;
    }

    /**
     * The agent currently holding this conversation's lock, or null when the
     * caller may write. Owners/admins are never blocked — only other agents.
     */
    private function conversationLocker(WhatsAppConversation $conversation, User $user): ?User
    {
        if ($user->crm_role !== 'agent') {
            return null;
        }
        if (!$conversation->assigned_agent_id || $conversation->assigned_agent_id === $user->id) {
            return null;
        }
        return User::find($conversation->assigned_agent_id);
    }

    private function lockedResponse(?User $locker)
    {
        return response()->json([
            'success' => false,
            'message' => 'هذه المحادثة يتعامل معاها ' . ($locker?->name ?? 'موظف آخر') . ' حالياً',
            'locked_by' => $locker?->name,
        ], 423);
    }

    /**
     * First reply claims the chat for that agent so nobody else interferes.
     */
    private function claimConversation(WhatsAppConversation $conversation, User $user): void
    {
        if ($user->crm_role !== 'agent' || $conversation->assigned_agent_id) {
            return;
        }
        $conversation->forceFill([
            'assigned_agent_id' => $user->id,
            'assigned_at' => now(),
        ])->save();
        $this->broadcastConversation($conversation);
    }

    /** Push assignment/resolution changes to every agent on the CRM channel. */
    private function broadcastConversation(WhatsAppConversation $conversation): void
    {
        try {
            $conversation->loadMissing(['assignedAgent:id,name', 'resolvedBy:id,name']);
            event(new \App\Events\CrmRealtimeEvent($conversation->user_id, 'conversation.update', [
                'conversation' => array_merge(
                    $conversation->only([
                        'id', 'session_id', 'contact_jid', 'contact_name', 'contact_phone',
                        'contact_avatar', 'last_message', 'last_message_at',
                        'last_message_direction', 'last_message_type', 'last_message_status', 'unread_count', 'is_pinned',
                        'assigned_agent_id', 'assigned_at', 'resolved_at', 'resolved_by',
                        'rating', 'rating_note',
                    ]),
                    [
                        'assigned_agent' => $conversation->assignedAgent ? [
                            'id' => $conversation->assignedAgent->id,
                            'name' => $conversation->assignedAgent->name,
                        ] : null,
                        'resolved_by_agent' => $conversation->resolvedBy ? [
                            'id' => $conversation->resolvedBy->id,
                            'name' => $conversation->resolvedBy->name,
                        ] : null,
                    ]
                ),
            ]));
        } catch (\Throwable $e) {
            Log::debug('CRM broadcast (conversation) failed: ' . $e->getMessage());
        }
    }

    /**
     * Get IDs of sessions the given (or authenticated) user has permission to see.
     */
    private function getAllowedSessionIds(?User $user = null): array
    {
        $user = $user ?: Auth::user();
        $owner = $this->resolveOwnerFor($user);

        if ($user->crm_role === 'agent') {
            // Group membership takes precedence: agents in a group share the
            // group's sessions so the whole team works the same workload.
            if ($user->crm_group_id) {
                $group = CrmGroup::where('owner_id', $owner->id)->find($user->crm_group_id);
                $groupSessions = $group?->session_ids;
                if (is_array($groupSessions) && count($groupSessions) > 0) {
                    return WhatsAppSession::where('user_id', $owner->id)
                        ->whereIn('id', $groupSessions)
                        ->pluck('id')
                        ->toArray();
                }
                // Group with no sessions selected = all owner sessions (same
                // convention as an agent with no assigned_sessions).
            }

            $assigned = $user->crm_assigned_sessions;
            if (is_array($assigned) && count($assigned) > 0) {
                return WhatsAppSession::where('user_id', $owner->id)
                    ->whereIn('id', $assigned)
                    ->pluck('id')
                    ->toArray();
            }
        }

        return WhatsAppSession::where('user_id', $owner->id)->pluck('id')->toArray();
    }

    /**
     * Serialize the CRM user payload shared by login() and me().
     */
    private function serializeCrmUser(User $user): array
    {
        $groupName = null;
        if ($user->crm_role === 'agent' && $user->crm_group_id) {
            $groupName = CrmGroup::whereKey($user->crm_group_id)->value('name');
        }

        $planLimits = null;
        try {
            $planLimits = $this->subscriptionService->getOwnerCrmLimits($this->resolveOwnerFor($user));
        } catch (\Throwable $e) {
            Log::warning("Could not compute CRM limits for user {$user->id}: " . $e->getMessage());
        }

        return [
            'id' => $user->id,
            'name' => $user->name,
            'email' => $user->email,
            'crm_role' => $user->crm_role ?? 'owner',
            'crm_parent_id' => $user->crm_parent_id,
            'assigned_sessions' => $user->crm_assigned_sessions ?? [],
            'group_id' => $user->crm_group_id,
            'group_name' => $groupName,
            'limits' => $planLimits,
        ];
    }

    /**
     * CRM Login: Handles crm@crm.com and team agents
     */
    public function login(Request $request)
    {
        $request->validate([
            'email' => 'required|email',
            'password' => 'required|string',
        ]);

        $email = strtolower(trim($request->email));
        $user = User::where('email', $email)->first();

        if (!$user) {
            $this->recordFailedLogin($request, $email, null, 'unknown_email');
            FraudDetectionService::report('login_failed', 'medium', 'Failed CRM login attempt with unknown email', [
                'email' => $email,
            ]);
            return response()->json([
                'success' => false,
                'message' => 'بيانات الدخول غير صحيحة',
            ], 401);
        }

        if (!Hash::check($request->password, $user->password)) {
            $this->recordFailedLogin($request, $email, $user, 'invalid_password');
            FraudDetectionService::report('login_failed', 'medium', 'Failed CRM login attempt with invalid password', [
                'email' => $email,
            ]);
            return response()->json([
                'success' => false,
                'message' => 'كلمة المرور غير صحيحة',
            ], 401);
        }

        if ($user->status === 'suspended' || $user->status === 'inactive') {
            return response()->json([
                'success' => false,
                'message' => 'الحساب معطل حالياً، يرجى مراجعة المسؤول',
            ], 403);
        }

        // If crm@crm.com, guarantee owner role
        if ($user->email === 'crm@crm.com' && empty($user->crm_role)) {
            $user->update(['crm_role' => 'owner']);
        }

        $token = $user->createToken('crm-token')->plainTextToken;

        return response()->json([
            'success' => true,
            'message' => 'تم تسجيل الدخول بنجاح',
            'token' => $token,
            'user' => $this->serializeCrmUser($user),
        ]);
    }

    /**
     * Persist a failed CRM login attempt so it shows up in the Security Center.
     */
    private function recordFailedLogin(Request $request, string $email, ?User $user, string $reason): void
    {
        try {
            $info = DeviceInfoService::parse($request->userAgent());
            LoginHistory::create([
                'user_id' => $user?->id,
                'attempted_email' => $email,
                'ip_address' => $request->ip(),
                'user_agent' => $request->userAgent(),
                'device_name' => $info['name'],
                'device_type' => $info['device_type'],
                'browser' => $info['browser'],
                'os' => $info['os'],
                'success' => false,
                'failure_reason' => $reason,
                'login_at' => now(),
            ]);
        } catch (\Throwable $e) {
            Log::warning('Failed to record CRM login attempt: ' . $e->getMessage());
        }
    }

    /**
     * Current authenticated user profile
     */
    public function me()
    {
        /** @var User $user */
        $user = Auth::user();
        return response()->json([
            'success' => true,
            'user' => $this->serializeCrmUser($user),
        ]);
    }

    /**
     * Dashboard Overview Stats
     */
    public function stats()
    {
        $owner = $this->resolveOwner();
        $allowedSessionIds = $this->getAllowedSessionIds();

        $totalDevices = WhatsAppSession::whereIn('id', $allowedSessionIds)->count();
        $connectedDevices = WhatsAppSession::whereIn('id', $allowedSessionIds)->where('status', 'connected')->count();
        $totalAgents = User::where('crm_parent_id', $owner->id)->count();

        $totalConversations = WhatsAppConversation::whereIn('session_id', $allowedSessionIds)->count();
        $unreadConversations = WhatsAppConversation::whereIn('session_id', $allowedSessionIds)
            ->where('unread_count', '>', 0)
            ->count();

        $messagesSentToday = WhatsAppMessage::whereIn('session_id', $allowedSessionIds)
            ->where('direction', 'outgoing')
            ->whereDate('created_at', now()->today())
            ->count();

        $messagesReceivedToday = WhatsAppMessage::whereIn('session_id', $allowedSessionIds)
            ->where('direction', 'incoming')
            ->whereDate('created_at', now()->today())
            ->count();

        return response()->json([
            'success' => true,
            'stats' => [
                'total_devices' => $totalDevices,
                'connected_devices' => $connectedDevices,
                'total_agents' => $totalAgents,
                'total_conversations' => $totalConversations,
                'unread_conversations' => $unreadConversations,
                'messages_sent_today' => $messagesSentToday,
                'messages_received_today' => $messagesReceivedToday,
            ],
        ]);
    }

    /**
     * List linked WhatsApp devices
     */
    public function getDevices()
    {
        $allowedSessionIds = $this->getAllowedSessionIds();
        $devices = WhatsAppSession::whereIn('id', $allowedSessionIds)
            ->orderBy('id', 'asc')
            ->get();

        return response()->json([
            'success' => true,
            'devices' => $devices->map(function ($d) {
                return [
                    'id' => $d->id,
                    'session_token' => $d->session_token,
                    'device_name' => $d->device_name ?: ('ج' . $d->id),
                    'phone_number' => $d->phone_number,
                    'status' => $d->status,
                    'connected_at' => $d->connected_at,
                    'last_activity_at' => $d->last_activity_at,
                    'created_at' => $d->created_at,
                ];
            }),
        ]);
    }

    /**
     * Initialize / Add a new device (Generate QR code)
     */
    public function initDevice(Request $request)
    {
        /** @var User $user */
        $user = Auth::user();
        if ($user->crm_role === 'agent') {
            return response()->json(['success' => false, 'message' => 'غير مصرح للوكيل بإضافة أجهزة'], 403);
        }

        $owner = $this->resolveOwner();

        try {
            $this->subscriptionService->assertCanAddDevice($owner);
        } catch (\RuntimeException $e) {
            return response()->json([
                'success' => false,
                'message' => $e->getMessage(),
                'code' => 'DEVICE_LIMIT_REACHED',
            ], 403);
        }

        $existingCount = WhatsAppSession::where('user_id', $owner->id)->count();
        $autoName = 'ج' . ($existingCount + 1);

        $deviceName = trim($request->input('device_name') ?: $autoName);
        $sessionToken = 'crm_dev_' . Str::uuid()->toString();

        $session = WhatsAppSession::create([
            'user_id' => $owner->id,
            'session_token' => $sessionToken,
            'device_name' => $deviceName,
            'status' => 'pending',
            'qr_generated_at' => now(),
        ]);

        $phoneNumber = $request->input('phone_number');
        $payload = [];
        if ($phoneNumber) {
            $payload['phone_number'] = preg_replace('/\D/', '', $phoneNumber);
        }

        try {
            $response = $this->engineClient()->post("{$this->engineUrl}/api/whatsapp/connect/{$sessionToken}", $payload);
            $data = $response->json();

            return response()->json([
                'success' => true,
                'device' => [
                    'id' => $session->id,
                    'session_token' => $sessionToken,
                    'device_name' => $deviceName,
                    'status' => 'pending',
                    'qr' => $data['qr'] ?? null,
                    'pairingCode' => $data['pairingCode'] ?? null,
                    'mode' => $data['mode'] ?? 'qr',
                ],
            ]);
        } catch (\Throwable $e) {
            Log::error("CRM initDevice engine error: " . $e->getMessage());
            return response()->json([
                'success' => true,
                'device' => [
                    'id' => $session->id,
                    'session_token' => $sessionToken,
                    'device_name' => $deviceName,
                    'status' => 'pending',
                    'qr' => null,
                ],
            ]);
        }
    }

    /**
     * Poll device status and QR code
     */
    public function getDeviceStatus($id)
    {
        $allowedSessionIds = $this->getAllowedSessionIds();
        $session = WhatsAppSession::whereIn('id', $allowedSessionIds)->where('id', $id)->firstOrFail();

        $token = $session->session_token ?: (string) $session->id;
        try {
            $response = $this->engineClient()->get("{$this->engineUrl}/api/whatsapp/status/{$token}");
            if ($response->successful()) {
                $data = $response->json();
                $status = $data['status'] ?? 'disconnected';
                $phone = $data['phoneNumber'] ?? $session->phone_number;

                if ($status !== $session->status || ($phone && $phone !== $session->phone_number)) {
                    $session->update([
                        'status' => $status,
                        'phone_number' => $phone,
                        'connected_at' => $status === 'connected' ? ($session->connected_at ?: now()) : $session->connected_at,
                        'last_activity_at' => now(),
                    ]);
                }

                return response()->json([
                    'success' => true,
                    'data' => [
                        'id' => $session->id,
                        'device_name' => $session->device_name ?: ('ج' . $session->id),
                        'status' => $status,
                        'phoneNumber' => $phone,
                        'qr' => $data['qr'] ?? null,
                        'pairingCode' => $data['pairingCode'] ?? null,
                        'mode' => $data['mode'] ?? null,
                    ],
                ]);
            }
        } catch (\Throwable $e) {
            Log::warning("CRM getDeviceStatus engine error: " . $e->getMessage());
        }

        return response()->json([
            'success' => true,
            'data' => [
                'id' => $session->id,
                'device_name' => $session->device_name ?: ('ج' . $session->id),
                'status' => $session->status,
                'phoneNumber' => $session->phone_number,
                'qr' => null,
            ],
        ]);
    }

    /**
     * Reconnect device (Trigger new QR if disconnected)
     */
    public function reconnectDevice($id)
    {
        $allowedSessionIds = $this->getAllowedSessionIds();
        $session = WhatsAppSession::whereIn('id', $allowedSessionIds)->where('id', $id)->firstOrFail();

        $token = $session->session_token ?: (string) $session->id;
        try {
            $response = $this->engineClient()->post("{$this->engineUrl}/api/whatsapp/connect/{$token}");
            $data = $response->json();
            $session->update(['status' => 'pending']);

            return response()->json([
                'success' => true,
                'data' => $data,
            ]);
        } catch (\Throwable $e) {
            return response()->json(['success' => false, 'message' => $e->getMessage()], 500);
        }
    }

    /**
     * Rename device
     */
    public function updateDevice(Request $request, $id)
    {
        $owner = $this->resolveOwner();
        $session = WhatsAppSession::where('user_id', $owner->id)->where('id', $id)->firstOrFail();

        $request->validate(['device_name' => 'required|string|max:100']);
        $session->update(['device_name' => trim($request->device_name)]);

        return response()->json([
            'success' => true,
            'message' => 'تم تحديث اسم الجهاز بنجاح',
            'device' => $session,
        ]);
    }

    /**
     * Disconnect device
     */
    public function disconnectDevice($id)
    {
        $owner = $this->resolveOwner();
        $session = WhatsAppSession::where('user_id', $owner->id)->where('id', $id)->firstOrFail();

        $token = $session->session_token ?: (string) $session->id;
        try {
            $this->engineClient()->post("{$this->engineUrl}/api/whatsapp/disconnect/{$token}");
        } catch (\Throwable $e) {}

        $session->update(['status' => 'disconnected']);

        return response()->json([
            'success' => true,
            'message' => 'تم فصل الجهاز بنجاح',
        ]);
    }

    /**
     * Ask the paired phone for a full on-demand history sync. Results arrive
     * asynchronously at the whatsapp/history-sync webhook.
     */
    public function syncDeviceHistory($id)
    {
        $owner = $this->resolveOwner();
        $session = WhatsAppSession::where('user_id', $owner->id)->where('id', $id)->firstOrFail();

        if ($session->status !== 'connected') {
            return response()->json(['success' => false, 'message' => 'الجهاز غير متصل'], 400);
        }

        $token = $session->session_token ?: (string) $session->id;
        try {
            $res = $this->engineClient()->post("{$this->engineUrl}/internal/history/sync", [
                'sessionId' => $token,
            ]);
            $ok = (bool) ($res->json('success') ?? false);
            if ($ok) {
                // New run: zero the synced counters so the UI's counts and
                // progress reflect this pull, not leftovers from the last one.
                $session->update([
                    'history_sync_progress' => 1,
                    'history_synced_conversations' => 0,
                    'history_synced_messages' => 0,
                    'history_sync_request_id' => null,
                ]);
            }
            return response()->json([
                'success' => $ok,
                'message' => $ok
                    ? 'تم إرسال طلب مزامنة المحادثات — ستظهر تباعاً خلال دقائق'
                    : ($res->json('message') ?? 'فشل طلب المزامنة'),
            ], $ok ? 200 : 500);
        } catch (\Throwable $e) {
            return response()->json(['success' => false, 'message' => 'خطأ في الاتصال بالمحرك: ' . $e->getMessage()], 500);
        }
    }

    /**
     * Per-device WhatsApp history-sync progress — the phone streams chunks
     * back asynchronously, the webhook keeps history_sync_progress updated,
     * and the chat UI polls this to render the "pulling chats" bar.
     */
    public function syncStatus()
    {
        $owner = $this->resolveOwner();
        $devices = WhatsAppSession::where('user_id', $owner->id)
            ->get(['id', 'device_name', 'status', 'history_sync_progress', 'history_synced_conversations', 'history_synced_messages', 'history_synced_at', 'last_activity_at'])
            ->map(fn ($s) => [
                'id' => $s->id,
                'device_name' => $s->device_name,
                'status' => $s->status,
                'progress' => (int) $s->history_sync_progress,
                'synced_conversations' => (int) $s->history_synced_conversations,
                'synced_messages' => (int) $s->history_synced_messages,
                'synced_at' => $s->history_synced_at,
                // A sync counts as live only while chunks keep arriving —
                // otherwise a stalled sync would pin the bar forever.
                'syncing' => $s->history_sync_progress > 0
                    && $s->history_sync_progress < 100
                    && $s->last_activity_at
                    && $s->last_activity_at->gt(now()->subMinutes(3)),
            ]);

        return response()->json(['success' => true, 'devices' => $devices]);
    }

    /**
     * Delete device completely
     */
    public function deleteDevice($id)
    {
        $owner = $this->resolveOwner();
        $session = WhatsAppSession::where('user_id', $owner->id)->where('id', $id)->firstOrFail();

        $token = $session->session_token ?: (string) $session->id;
        try {
            $this->engineClient()->post("{$this->engineUrl}/api/whatsapp/delete-session/{$token}");
        } catch (\Throwable $e) {}

        // Snapshot the device identity onto its conversations BEFORE the row
        // goes — the FK nulls session_id on delete (SET NULL), so the chat
        // history survives and the admin view can still name the device.
        WhatsAppConversation::where('session_id', $session->id)->update([
            'archived_device_name' => $session->device_name ?: ('ج' . $session->id),
            'archived_device_phone' => $session->phone_number,
        ]);

        $session->delete();

        return response()->json([
            'success' => true,
            'message' => 'تم حذف الجهاز بنجاح',
        ]);
    }

    /**
     * List Customer Service Agents
     */
    public function getAgents()
    {
        $owner = $this->resolveOwner();
        $agents = User::where('crm_parent_id', $owner->id)
            ->with('crmGroup:id,name')
            ->orderBy('id', 'desc')
            ->get();

        return response()->json([
            'success' => true,
            'agents' => $agents->map(function ($a) {
                return [
                    'id' => $a->id,
                    'name' => $a->name,
                    'email' => $a->email,
                    'status' => $a->status ?? 'active',
                    'assigned_sessions' => $a->crm_assigned_sessions ?? [],
                    'group_id' => $a->crm_group_id,
                    'group_name' => $a->crmGroup?->name,
                    'created_at' => $a->created_at,
                ];
            }),
        ]);
    }

    /**
     * Add Customer Service Agent
     */
    public function createAgent(Request $request)
    {
        /** @var User $user */
        $user = Auth::user();
        if ($user->crm_role === 'agent') {
            return response()->json(['success' => false, 'message' => 'غير مصرح بإضافة أعضاء'], 403);
        }

        $owner = $this->resolveOwner();

        try {
            $this->subscriptionService->assertCanAddAgent($owner);
        } catch (\RuntimeException $e) {
            return response()->json([
                'success' => false,
                'message' => $e->getMessage(),
                'code' => 'AGENT_LIMIT_REACHED',
            ], 403);
        }

        $request->validate([
            'name' => 'required|string|max:100',
            'email' => 'required|email|unique:users,email',
            'password' => 'required|string|min:6',
            'assigned_sessions' => 'nullable|array',
            'group_id' => [
                'nullable',
                'integer',
                Rule::exists('crm_groups', 'id')->where('owner_id', $owner->id),
            ],
        ]);

        $agent = User::create([
            'name' => trim($request->name),
            'email' => strtolower(trim($request->email)),
            'password' => Hash::make($request->password),
            'crm_role' => 'agent',
            'crm_parent_id' => $owner->id,
            'crm_assigned_sessions' => $request->assigned_sessions ?? [],
            'crm_group_id' => $request->group_id,
            'status' => 'active',
            'email_verified_at' => now(),
            'messages_balance' => 0,
        ]);

        return response()->json([
            'success' => true,
            'message' => 'تم إضافة عضو خدمة العملاء بنجاح',
            'agent' => [
                'id' => $agent->id,
                'name' => $agent->name,
                'email' => $agent->email,
                'assigned_sessions' => $agent->crm_assigned_sessions,
                'group_id' => $agent->crm_group_id,
                'group_name' => $agent->crmGroup?->name,
                'status' => $agent->status,
                'created_at' => $agent->created_at,
            ],
        ]);
    }

    /**
     * Update Customer Service Agent
     */
    public function updateAgent(Request $request, $id)
    {
        $owner = $this->resolveOwner();
        $agent = User::where('crm_parent_id', $owner->id)->where('id', $id)->firstOrFail();

        $request->validate([
            'name' => 'required|string|max:100',
            'email' => 'required|email|unique:users,email,' . $agent->id,
            'password' => 'nullable|string|min:6',
            'assigned_sessions' => 'nullable|array',
            'group_id' => [
                'nullable',
                'integer',
                Rule::exists('crm_groups', 'id')->where('owner_id', $owner->id),
            ],
            'status' => 'nullable|string|in:active,inactive',
        ]);

        $updateData = [
            'name' => trim($request->name),
            'email' => strtolower(trim($request->email)),
            'crm_assigned_sessions' => $request->assigned_sessions ?? [],
            'crm_group_id' => $request->group_id,
            'status' => $request->status ?? $agent->status ?? 'active',
        ];

        if ($request->filled('password')) {
            $updateData['password'] = Hash::make($request->password);
        }

        $agent->update($updateData);

        return response()->json([
            'success' => true,
            'message' => 'تم تحديث بيانات العضو بنجاح',
            'agent' => [
                'id' => $agent->id,
                'name' => $agent->name,
                'email' => $agent->email,
                'assigned_sessions' => $agent->crm_assigned_sessions,
                'group_id' => $agent->crm_group_id,
                'group_name' => $agent->crmGroup?->name,
                'status' => $agent->status,
            ],
        ]);
    }

    /**
     * Delete Customer Service Agent
     */
    public function deleteAgent($id)
    {
        $owner = $this->resolveOwner();
        $agent = User::where('crm_parent_id', $owner->id)->where('id', $id)->firstOrFail();
        $agent->delete();

        return response()->json([
            'success' => true,
            'message' => 'تم حذف العضو بنجاح',
        ]);
    }

    /**
     * Agent performance report: messages sent, conversations resolved/open,
     * average reply speed and customer ratings — per team member.
     */
    public function agentPerformance(Request $request)
    {
        /** @var User $user */
        $user = Auth::user();
        if ($user->crm_role === 'agent') {
            return response()->json(['success' => false, 'message' => 'غير مصرح'], 403);
        }

        $owner = $this->resolveOwner();

        [$from, $to] = match ($request->input('period', '30d')) {
            'today' => [now()->startOfDay(), now()->endOfDay()],
            '7d' => [now()->subDays(6)->startOfDay(), now()->endOfDay()],
            'all' => [null, null],
            default => [now()->subDays(29)->startOfDay(), now()->endOfDay()],
        };

        $agents = User::where('crm_parent_id', $owner->id)->with('crmGroup:id,name')->get();
        $members = $agents->concat([$owner]);
        $memberIds = $members->pluck('id');

        // CRM actions (who sent what) live in the audit log — messages
        // themselves only store the owner's user_id.
        $sends = \DB::table('crm_audit_logs')
            ->where('owner_id', $owner->id)
            ->whereIn('action', ['message.send', 'message.forward'])
            ->whereIn('actor_id', $memberIds)
            ->when($from, fn ($q) => $q->where('created_at', '>=', $from))
            ->when($to, fn ($q) => $q->where('created_at', '<=', $to))
            ->get(['actor_id', 'message_id', 'conversation_id', 'created_at']);

        $sentCounts = $sends->groupBy('actor_id')->map->count();
        $touchedCounts = $sends->groupBy('actor_id')
            ->map(fn ($g) => $g->pluck('conversation_id')->filter()->unique()->count());

        $lastActivity = \DB::table('crm_audit_logs')
            ->where('owner_id', $owner->id)
            ->whereIn('actor_id', $memberIds)
            ->when($from, fn ($q) => $q->where('created_at', '>=', $from))
            ->when($to, fn ($q) => $q->where('created_at', '<=', $to))
            ->selectRaw('actor_id, MAX(created_at) as last_at')
            ->groupBy('actor_id')
            ->pluck('last_at', 'actor_id');

        // Resolved conversations (completed) + ratings
        $resolved = WhatsAppConversation::whereIn('resolved_by', $memberIds)
            ->whereNotNull('resolved_at')
            ->when($from, fn ($q) => $q->where('resolved_at', '>=', $from))
            ->when($to, fn ($q) => $q->where('resolved_at', '<=', $to))
            ->get(['resolved_by', 'rating']);
        $resolvedCounts = $resolved->groupBy('resolved_by')->map->count();
        $avgRatings = $resolved->filter(fn ($c) => $c->rating !== null)
            ->groupBy('resolved_by')
            ->map(fn ($g) => round($g->avg('rating'), 1));

        // Open (incomplete) conversations currently held by each member
        $openAssigned = WhatsAppConversation::whereIn('assigned_agent_id', $memberIds)
            ->whereNull('resolved_at')
            ->get(['assigned_agent_id', 'last_message_direction']);
        $openCounts = $openAssigned->groupBy('assigned_agent_id')->map->count();
        $awaitingCounts = $openAssigned->where('last_message_direction', 'incoming')
            ->groupBy('assigned_agent_id')->map->count();

        // Reply speed: for each audited outgoing message, diff against the
        // latest incoming message that preceded it in the same conversation.
        // Bounded to the 300 most recent sends to keep the report cheap.
        $rtSends = $sends->whereNotNull('message_id')->sortByDesc('created_at')->take(300);
        $sentMessages = WhatsAppMessage::whereIn('id', $rtSends->pluck('message_id')->unique())
            ->get(['id', 'conversation_id', 'created_at'])
            ->keyBy('id');

        $replyTimes = [];
        foreach ($rtSends as $send) {
            $msg = $sentMessages->get($send->message_id);
            if (!$msg || !$msg->conversation_id) {
                continue;
            }
            $prevIncoming = WhatsAppMessage::where('conversation_id', $msg->conversation_id)
                ->where('direction', 'incoming')
                ->where('id', '<', $msg->id)
                ->orderBy('id', 'desc')
                ->first(['created_at']);
            if (!$prevIncoming) {
                continue;
            }
            $delta = $msg->created_at->diffInSeconds($prevIncoming->created_at);
            if ($delta < 0 || $delta > 86400) {
                continue;
            }
            $replyTimes[$send->actor_id][] = $delta;
        }

        $data = $members->map(fn ($m) => [
            'id' => $m->id,
            'name' => $m->name,
            'email' => $m->email,
            'role' => $m->id === $owner->id ? 'owner' : 'agent',
            'group_name' => $m->crmGroup?->name,
            'status' => $m->status ?? 'active',
            'messages_sent' => $sentCounts[$m->id] ?? 0,
            'conversations_touched' => $touchedCounts[$m->id] ?? 0,
            'conversations_resolved' => $resolvedCounts[$m->id] ?? 0,
            'conversations_open' => $openCounts[$m->id] ?? 0,
            'awaiting_reply' => $awaitingCounts[$m->id] ?? 0,
            'avg_rating' => $avgRatings[$m->id] ?? null,
            'avg_response_seconds' => isset($replyTimes[$m->id])
                ? (int) round(array_sum($replyTimes[$m->id]) / count($replyTimes[$m->id]))
                : null,
            'response_samples' => count($replyTimes[$m->id] ?? []),
            'last_activity_at' => $lastActivity[$m->id] ?? null,
        ])->sortByDesc('messages_sent')->values();

        return response()->json([
            'success' => true,
            'members' => $data,
            'totals' => [
                'messages_sent' => $data->sum('messages_sent'),
                'conversations_resolved' => $data->sum('conversations_resolved'),
                'conversations_open' => $data->sum('conversations_open'),
                'awaiting_reply' => $data->sum('awaiting_reply'),
                'avg_response_seconds' => ($all = $data->whereNotNull('avg_response_seconds'))->isNotEmpty()
                    ? (int) round($all->avg('avg_response_seconds'))
                    : null,
                'avg_rating' => ($rated = $data->whereNotNull('avg_rating'))->isNotEmpty()
                    ? round($rated->avg('avg_rating'), 1)
                    : null,
            ],
        ]);
    }

    /**
     * List CRM groups with their devices and member count
     */
    public function getGroups()
    {
        $owner = $this->resolveOwner();
        $groups = CrmGroup::where('owner_id', $owner->id)
            ->withCount('agents')
            ->orderBy('id')
            ->get();

        return response()->json([
            'success' => true,
            'groups' => $groups->map(function ($g) {
                return [
                    'id' => $g->id,
                    'name' => $g->name,
                    'session_ids' => $g->session_ids ?? [],
                    'agents_count' => $g->agents_count,
                    'created_at' => $g->created_at,
                ];
            }),
        ]);
    }

    /**
     * Create a CRM group (owner only)
     */
    public function createGroup(Request $request)
    {
        $owner = $this->resolveOwner();
        abort_if(Auth::user()->crm_role === 'agent', 403, 'غير مصرح بإدارة المجموعات');

        $data = $request->validate([
            'name' => 'required|string|max:100',
            'session_ids' => 'nullable|array',
            'session_ids.*' => [
                'integer',
                Rule::exists('whatsapp_sessions', 'id')->where('user_id', $owner->id),
            ],
        ]);

        $group = CrmGroup::create([
            'owner_id' => $owner->id,
            'name' => trim($data['name']),
            'session_ids' => $data['session_ids'] ?? [],
        ]);

        return response()->json([
            'success' => true,
            'message' => 'تم إنشاء المجموعة بنجاح',
            'group' => [
                'id' => $group->id,
                'name' => $group->name,
                'session_ids' => $group->session_ids,
                'agents_count' => 0,
            ],
        ]);
    }

    /**
     * Update a CRM group (owner only)
     */
    public function updateGroup(Request $request, $id)
    {
        $owner = $this->resolveOwner();
        abort_if(Auth::user()->crm_role === 'agent', 403, 'غير مصرح بإدارة المجموعات');

        $group = CrmGroup::where('owner_id', $owner->id)->findOrFail($id);

        $data = $request->validate([
            'name' => 'required|string|max:100',
            'session_ids' => 'nullable|array',
            'session_ids.*' => [
                'integer',
                Rule::exists('whatsapp_sessions', 'id')->where('user_id', $owner->id),
            ],
        ]);

        $group->update([
            'name' => trim($data['name']),
            'session_ids' => $data['session_ids'] ?? [],
        ]);

        return response()->json([
            'success' => true,
            'message' => 'تم تحديث المجموعة بنجاح',
            'group' => [
                'id' => $group->id,
                'name' => $group->name,
                'session_ids' => $group->session_ids,
                'agents_count' => $group->agents()->count(),
            ],
        ]);
    }

    /**
     * Delete a CRM group — member agents keep their per-agent sessions
     * and fall back to the default customer-service scope.
     */
    public function deleteGroup($id)
    {
        $owner = $this->resolveOwner();
        abort_if(Auth::user()->crm_role === 'agent', 403, 'غير مصرح بإدارة المجموعات');

        $group = CrmGroup::where('owner_id', $owner->id)->findOrFail($id);
        $group->delete(); // users.crm_group_id -> null via FK

        return response()->json([
            'success' => true,
            'message' => 'تم حذف المجموعة — الأعضاء رجعوا للوضع الافتراضي',
        ]);
    }

    /**
     * List Conversations with Device info
     */
    public function getConversations(Request $request)
    {
        $allowedSessionIds = $this->getAllowedSessionIds();

        // Self-heal LID/PN twin conversations: sessions that still hold
        // @lid-keyed conversations get a throttled usync resolution pass so
        // duplicates collapse into their phone-number row as the user browses.
        if (Cache::add('lid_twin_cron', 1, 120)) {
            $resolver = app(\App\Services\WhatsAppLidResolver::class);
            $lidSessions = WhatsAppSession::whereIn('id', $allowedSessionIds)
                ->where('status', 'connected')
                ->where(function ($q) {
                    $q->whereHas('conversations', fn ($c) => $c->where('contact_jid', 'like', '%@lid'))
                      ->orWhereHas('conversations', fn ($c) => $c->whereNull('contact_avatar'))
                      ->orWhereHas('conversations', fn ($c) => $c->whereNull('contact_username'));
                })
                ->get();
            foreach ($lidSessions as $lidSession) {
                $resolver->resolveSessionTwins($lidSession);
                $resolver->fetchAvatars($lidSession);
                $resolver->fetchUsernames($lidSession);
            }
        }

        $query = WhatsAppConversation::with([
                'session:id,device_name,phone_number',
                'assignedAgent:id,name',
                'resolvedBy:id,name',
            ])
            ->whereIn('session_id', $allowedSessionIds);

        if ($request->filled('session_id')) {
            $query->where('session_id', $request->session_id);
        }

        if ($request->boolean('unread_only')) {
            $query->where('unread_count', '>', 0);
        }

        if ($request->filled('search')) {
            $search = trim($request->search);
            $query->where(function ($q) use ($search) {
                $q->where('contact_phone', 'like', "%{$search}%")
                  ->orWhere('contact_name', 'like', "%{$search}%")
                  ->orWhere('contact_username', 'like', "%{$search}%")
                  ->orWhere('last_message', 'like', "%{$search}%");
            });
        }

        $conversations = $query->orderBy('is_pinned', 'desc')
            ->orderBy('last_message_at', 'desc')
            ->paginate($request->input('per_page', 40));

        return response()->json([
            'success' => true,
            'conversations' => $conversations->items(),
            'pagination' => [
                'current_page' => $conversations->currentPage(),
                'last_page' => $conversations->lastPage(),
                'total' => $conversations->total(),
            ],
        ]);
    }

    /**
     * Get Thread Messages for a Conversation
     */
    public function getMessages(Request $request, $conversationId)
    {
        $allowedSessionIds = $this->getAllowedSessionIds();

        $conversation = WhatsAppConversation::with(['session:id,device_name,phone_number'])
            ->whereIn('session_id', $allowedSessionIds)
            ->where('id', $conversationId)
            ->firstOrFail();

        // Mark unread count to 0 when opened — and tell WhatsApp the messages
        // were read (blue ticks for the sender), fire-and-forget.
        if ($conversation->unread_count > 0) {
            $conversation->update(['unread_count' => 0]);
            $this->sendReadReceipts($conversation);
        }

        // Wrap the whole scope in ONE group: an ungrouped `A orWhere B` lets
        // later `where id` filters bind only to B (SQL AND before OR), which
        // silently broke before_id/after_id paging for conversation rows.
        $query = WhatsAppMessage::where(function ($q) use ($conversation) {
            $q->where('conversation_id', $conversation->id)
              ->orWhere(function ($sq) use ($conversation) {
                  $sq->where('session_id', $conversation->session_id)
                    ->where(function ($sq2) use ($conversation) {
                        $sq2->where('from', $conversation->contact_phone)
                           ->orWhere('to', $conversation->contact_phone);
                    });
              });
        });

        $hasMore = false;
        $hasNewer = false;
        $limit = min(max((int) $request->input('limit', 20), 1), 100);

        // Ordering is the (timestamp, id) tuple, NOT bare id: history-sync
        // chunks stream newest-first, so row ids can run opposite to real
        // message time. Cursors still arrive as ids — each resolves to its
        // row and is then compared as a tuple so paging tracks chronology.
        $cursorRow = fn (int $id) => (clone $query)->where('id', $id)->first();
        // '$dir': '<' strictly older, '>' strictly newer, '<=' / '>=' anchor-inclusive.
        $tupleCompare = function ($q, $row, string $dir) {
            $cmp = $dir[0];
            $eq = str_ends_with($dir, '=');
            $q->where(function ($w) use ($row, $cmp, $eq) {
                $w->where('timestamp', $cmp, $row->timestamp)
                  ->orWhere(function ($w2) use ($row, $cmp, $eq) {
                      $w2->where('timestamp', '=', $row->timestamp)
                         ->where('id', $eq ? $cmp . '=' : $cmp, $row->id);
                  });
            });
        };
        $asc = fn ($rows) => $rows->sortBy([['timestamp', 'asc'], ['id', 'asc']])->values();

        // Incremental poll: the chat poller passes the id of the newest row it
        // already holds so we only ship the delta instead of the whole thread.
        // With `limit` it becomes forward paging (scroll down after a date jump).
        if ($request->filled('after_id')) {
            $anchor = $cursorRow((int) $request->after_id);
            $forward = clone $query;
            if ($anchor && $anchor->timestamp) {
                $tupleCompare($forward, $anchor, '>');
            } else {
                $forward->where('id', '>', (int) $request->after_id);
            }
            $forward->orderBy('timestamp', 'asc')->orderBy('id', 'asc');
            if ($request->filled('limit')) {
                $rows = $forward->limit($limit + 1)->get();
                $hasNewer = $rows->count() > $limit;
                $messages = $rows->take($limit)->values();
                $hasMore = true; // anything after an after_id cursor has older rows
            } else {
                $messages = $forward->get();
            }
        } elseif ($request->filled('around_id')) {
            // Jump to a specific message (tapping a quoted reply): center the
            // window on it so it lands mid-screen and both directions stay
            // pageable.
            // reply_to_id stores the WA stanza id (3EB0…), numeric ids are DB
            // rows. Prefer this conversation's own row — duplicates of the
            // same contact exist under other conversation ids.
            $anchorRow = WhatsAppMessage::where('conversation_id', $conversation->id)
                ->where(function ($q) use ($request) {
                    $q->where('id', $request->around_id)
                      ->orWhere('message_id', $request->around_id);
                })
                ->first()
                ?? (clone $query)
                    ->where(function ($q) use ($request) {
                        $q->where('id', $request->around_id)
                          ->orWhere('message_id', $request->around_id);
                    })
                    ->first();
            if (!$anchorRow || !$anchorRow->timestamp) {
                return response()->json([
                    'success' => true,
                    'conversation' => $conversation,
                    'messages' => [],
                    'has_more' => false,
                    'has_newer' => true,
                ]);
            }
            $half = intdiv($limit, 2);

            $afterQ = clone $query;
            $tupleCompare($afterQ, $anchorRow, '>');
            $after = $afterQ->orderBy('timestamp', 'asc')->orderBy('id', 'asc')
                ->limit($half + 1)
                ->get();
            $hasNewer = $after->count() > $half;
            $takeAfter = $after->take($half);

            $beforeLimit = $limit - $takeAfter->count();
            $beforeQ = clone $query;
            $tupleCompare($beforeQ, $anchorRow, '<=');
            $before = $beforeQ->orderBy('timestamp', 'desc')->orderBy('id', 'desc')
                ->limit($beforeLimit + 1)
                ->get();
            $hasMore = $before->count() > $beforeLimit;
            $messages = $asc($before->take($beforeLimit))
                ->merge($takeAfter->values())
                ->values();
        } elseif ($request->filled('date')) {
            // Jump-to-date (WhatsApp calendar search): anchor on the first
            // message of the chosen day and page forward from there.
            try {
                $dayStart = \Illuminate\Support\Carbon::parse($request->date)->startOfDay();
            } catch (\Throwable) {
                return response()->json(['success' => false, 'message' => 'Invalid date'], 422);
            }

            $anchorRow = (clone $query)->where('timestamp', '>=', $dayStart)
                ->orderBy('timestamp', 'asc')
                ->orderBy('id', 'asc')
                ->first();

            if ($anchorRow) {
                $beforeQ = clone $query;
                $tupleCompare($beforeQ, $anchorRow, '<');
                $hasMore = $beforeQ->exists();
                $rowsQ = clone $query;
                $tupleCompare($rowsQ, $anchorRow, '>=');
                $rows = $rowsQ->orderBy('timestamp', 'asc')->orderBy('id', 'asc')
                    ->limit($limit + 1)
                    ->get();
                $hasNewer = $rows->count() > $limit;
                $messages = $rows->take($limit)->values();
            } else {
                // No messages on/after that day — land on the newest window.
                $rows = $query->orderBy('timestamp', 'desc')->orderBy('id', 'desc')->limit($limit + 1)->get();
                $hasMore = $rows->count() > $limit;
                $messages = $asc($rows->take($limit));
            }
        } else {
            // Sparse chat? Ask the phone for its older messages once per day —
            // results stream back through the whatsapp/history-sync webhook.
            $marker = "wa_hist_sync_conv_{$conversation->id}";
            if (
                \Illuminate\Support\Facades\Cache::add($marker, true, now()->addDay())
                && WhatsAppMessage::where('conversation_id', $conversation->id)->count() < 60
            ) {
                \App\Jobs\SyncConversationHistoryJob::dispatch($conversation->id);
            }

            // WhatsApp-style windowed paging: newest `limit` rows, and when the
            // client scrolls up it asks for `before_id` to page backwards.
            $rowsQ = clone $query;
            if ($request->filled('before_id')) {
                $anchor = $cursorRow((int) $request->before_id);
                if ($anchor && $anchor->timestamp) {
                    $tupleCompare($rowsQ, $anchor, '<');
                } else {
                    $rowsQ->where('id', '<', (int) $request->before_id);
                }
            }
            $rows = $rowsQ->orderBy('timestamp', 'desc')->orderBy('id', 'desc')
                ->limit($limit + 1)
                ->get();

            $hasMore = $rows->count() > $limit;
            $messages = $asc($rows->take($limit));
        }

        return response()->json([
            'success' => true,
            'conversation' => $conversation,
            'messages' => $messages,
            'has_more' => $hasMore,
            'has_newer' => $hasNewer,
        ]);
    }

    /** Record an auditable CRM action (who did what, on which conversation). */
    private function audit(string $action, array $meta = [], ?int $conversationId = null, ?int $sessionId = null, ?int $messageId = null): void
    {
        try {
            $user = Auth::user();
            $owner = $this->resolveOwnerFor($user);
            \DB::table('crm_audit_logs')->insert([
                'owner_id' => $owner->id,
                'actor_id' => $user->id,
                'actor_name' => $user->name ?? $user->email,
                'action' => $action,
                'conversation_id' => $conversationId,
                'session_id' => $sessionId,
                'message_id' => $messageId,
                'meta' => json_encode($meta, JSON_UNESCAPED_UNICODE),
                'ip' => request()?->ip(),
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        } catch (\Throwable $e) {
            Log::debug('CRM audit write failed: ' . $e->getMessage());
        }
    }

    /**
     * Send WhatsApp read receipts for the unread incoming messages of a
     * conversation — runs in the background via the queue when available so
     * the HTTP response isn't delayed by the engine call.
     */
    private function sendReadReceipts(WhatsAppConversation $conversation): void
    {
        try {
            $session = $conversation->session;
            if (!$session || $session->status !== 'connected' || !$conversation->contact_jid) {
                return;
            }

            $ids = WhatsAppMessage::where('conversation_id', $conversation->id)
                ->where('direction', 'incoming')
                ->whereIn('status', [WhatsAppMessage::STATUS_SENT, WhatsAppMessage::STATUS_DELIVERED])
                ->whereNotNull('message_id')
                ->orderBy('id', 'desc')
                ->limit(50)
                ->pluck('message_id')
                ->filter()
                ->values()
                ->all();

            if (!$ids) {
                return;
            }

            $token = $session->session_token ?: (string) $session->id;
            $this->engineClient()->post("{$this->engineUrl}/internal/messages/read", [
                'sessionId' => $token,
                'chatJid' => $conversation->contact_jid,
                'messageIds' => $ids,
            ]);
        } catch (\Throwable $e) {
            Log::debug("CRM read receipts failed for conversation {$conversation->id}: " . $e->getMessage());
        }
    }

    /**
     * Start a new chat with a phone number
     */
    public function startConversation(Request $request)
    {
        $request->validate([
            'phone' => 'required|string',
            'session_id' => 'nullable|integer',
            'name' => 'nullable|string',
        ]);

        $allowedSessionIds = $this->getAllowedSessionIds();
        $sessionId = $request->session_id;

        if (!$sessionId || !in_array($sessionId, $allowedSessionIds)) {
            $connected = WhatsAppSession::whereIn('id', $allowedSessionIds)
                ->where('status', 'connected')
                ->first();
            if (!$connected) {
                return response()->json(['success' => false, 'message' => 'لا يوجد جهاز متصل حالياً لبدء المحادثة'], 400);
            }
            $sessionId = $connected->id;
        }

        $cleanPhone = preg_replace('/\D/', '', $request->phone);
        $owner = $this->resolveOwner();

        // One chat per number, whatever shape it was typed/stored in. The same
        // contact can already exist under a @lid JID, a PN JID, or a different
        // digit format (010.. / 0020.. / +20..) — matching on the last 10
        // national digits covers all of them. Exact matches win over the
        // tail fallback.
        $tail = substr($cleanPhone, -10);
        $conv = WhatsAppConversation::where('session_id', $sessionId)
            ->where('contact_jid', 'not like', '%@g.us')
            ->where(function ($q) use ($cleanPhone, $tail) {
                $q->where('contact_phone', $cleanPhone)
                  ->orWhere('contact_jid', "{$cleanPhone}@s.whatsapp.net")
                  ->orWhere('contact_jid', "{$cleanPhone}@lid")
                  ->orWhere(function ($q2) use ($tail) {
                      $q2->whereRaw("RIGHT(REGEXP_REPLACE(COALESCE(contact_phone,''), '[^0-9]', ''), 10) = ?", [$tail])
                         ->orWhereRaw("RIGHT(REGEXP_REPLACE(COALESCE(contact_jid,''), '[^0-9]', ''), 10) = ?", [$tail]);
                  });
            })
            ->orderByRaw("CASE WHEN contact_phone = ? OR contact_jid = ? THEN 0 ELSE 1 END", [$cleanPhone, "{$cleanPhone}@s.whatsapp.net"])
            ->first();

        if (!$conv) {
            // Local Egyptian mobile (01x xx xxx xxxx) → international form;
            // a 00-prefix is already an intl number without the +.
            $canonical = preg_replace('/^00/', '', $cleanPhone);
            if (strlen($canonical) === 11 && str_starts_with($canonical, '0')) {
                $canonical = '2' . $canonical;
            }
            $conv = WhatsAppConversation::create([
                'session_id' => $sessionId,
                'user_id' => $owner->id,
                'contact_jid' => $canonical . '@s.whatsapp.net',
                'contact_phone' => $canonical,
                'contact_name' => $request->name ?: ('+' . $canonical),
                'last_message_at' => now(),
            ]);
        } else {
            $updates = [];
            if ($request->filled('name') && (!$conv->contact_name || str_starts_with($conv->contact_name, '+'))) {
                $updates['contact_name'] = $request->name;
            }
            if (!$conv->last_message_at) $updates['last_message_at'] = now();
            if ($updates) $conv->update($updates);
        }

        $conv->load('session:id,device_name,phone_number');

        return response()->json([
            'success' => true,
            'conversation' => $conv,
        ]);
    }

    /**
     * Send text message in CRM chat
     */
    /**
     * Build a proto.ContextInfo quote payload for the engine from a stored
     * message. participant = the quoted message's author JID.
     */
    /**
     * Routable send JID for a conversation. The raw chat JID wins — @lid
     * contacts cannot be addressed by digits. PN↔LID fan-out for LID-
     * migrated accounts happens inside the engine (sendWAMessage encrypts
     * for both identities; revoke/reaction keys are sent per form).
     */
    private function resolveDestJid(WhatsAppConversation $conv): string
    {
        return $conv->contact_jid && str_contains($conv->contact_jid, '@')
            ? $conv->contact_jid
            : ($conv->contact_phone ?: preg_replace('/@.*$/', '', (string) $conv->contact_jid));
    }

    private function buildReplyTo(WhatsAppMessage $quoted, WhatsAppSession $session, WhatsAppConversation $conversation): array
    {
        $participant = $quoted->direction === 'outgoing'
            ? preg_replace('/\D/', '', (string) $session->phone_number) . '@s.whatsapp.net'
            : $this->resolveDestJid($conversation);

        $text = (string) ($quoted->message ?? '');
        $quotedMessage = match ($quoted->message_type) {
            'image', 'sticker' => ['imageMessage' => ['caption' => $text, 'mimetype' => $quoted->media_mime_type ?: 'image/jpeg']],
            'video' => ['videoMessage' => ['caption' => $text, 'mimetype' => $quoted->media_mime_type ?: 'video/mp4']],
            'audio', 'voice' => ['audioMessage' => ['mimetype' => $quoted->media_mime_type ?: 'audio/ogg; codecs=opus', 'ptt' => $quoted->message_type === 'voice']],
            'document' => ['documentMessage' => ['fileName' => $quoted->media_meta['fileName'] ?? 'document', 'mimetype' => $quoted->media_mime_type ?: 'application/octet-stream']],
            'location' => ['locationMessage' => ['name' => $text]],
            'contact' => ['contactMessage' => ['displayName' => $text]],
            default => ['conversation' => $text],
        };

        return [
            'stanzaId' => $quoted->message_id,
            'participant' => $participant,
            'remoteJid' => $conversation->contact_jid,
            'quotedMessage' => $quotedMessage,
        ];
    }

    private function findQuotedMessage(WhatsAppConversation $conversation, ?string $replyToId): ?WhatsAppMessage
    {
        if (!$replyToId) {
            return null;
        }
        return WhatsAppMessage::where('conversation_id', $conversation->id)
            ->where(function ($q) use ($replyToId) {
                $q->where('message_id', $replyToId)->orWhere('id', $replyToId);
            })
            ->first();
    }

    public function sendMessage(Request $request)
    {
        $request->validate([
            'conversation_id' => 'required|integer',
            'message' => 'required|string',
            'session_id' => 'nullable|integer',
            'reply_to_id' => 'nullable|string',
        ]);

        $allowedSessionIds = $this->getAllowedSessionIds();
        $conversation = WhatsAppConversation::whereIn('session_id', $allowedSessionIds)
            ->where('id', $request->conversation_id)
            ->firstOrFail();

        if ($locker = $this->conversationLocker($conversation, $request->user())) {
            return $this->lockedResponse($locker);
        }

        $owner = $this->resolveOwner();
        try {
            $this->subscriptionService->assertCanSendMessage($owner);
        } catch (\RuntimeException $e) {
            return response()->json([
                'success' => false,
                'message' => $e->getMessage(),
                'code' => 'MESSAGE_LIMIT_REACHED',
            ], 403);
        }

        $session = $conversation->session;
        if ($request->filled('session_id') && in_array($request->session_id, $allowedSessionIds)) {
            $session = WhatsAppSession::find($request->session_id) ?: $session;
        }

        if (!$session || $session->status !== 'connected') {
            return response()->json(['success' => false, 'message' => 'الجهاز غير متصل حالياً بالواتساب'], 400);
        }

        $token = $session->session_token ?: (string) $session->id;
        // Prefer the raw chat JID — @lid contacts cannot be addressed by digits.
        $dest = $this->resolveDestJid($conversation);
        $text = trim($request->message);

        try {
            $payload = [
                'sessionId' => $token,
                'to' => $dest,
                'message' => $text,
                'type' => 'text',
            ];

            $quoted = $this->findQuotedMessage($conversation, $request->reply_to_id);
            if ($quoted && $quoted->message_id) {
                $payload['replyTo'] = $this->buildReplyTo($quoted, $session, $conversation);
            }

            $res = $this->engineClient()->post("{$this->engineUrl}/api/whatsapp/send-message", $payload);

            $engineData = $res->json();
            $messageId = $engineData['messageId'] ?? ('out_' . uniqid());

            // The engine's message-sent webhook may have already stored this
            // message (it fires the moment the send resolves). Serialize with
            // the same lock name the webhook uses so we never write twice.
            $lockName = 'wa_msg_sent_' . sha1($session->id . '|' . $messageId);
            $locked = (int) (\Illuminate\Support\Facades\DB::select('SELECT GET_LOCK(?, 10) AS l', [$lockName])[0]->l ?? 0);

            try {
                $msgRecord = WhatsAppMessage::where('message_id', $messageId)->first();
                if ($msgRecord) {
                    $msgRecord->update(array_filter([
                        'conversation_id' => $msgRecord->conversation_id ?: $conversation->id,
                        'reply_to_id' => $request->reply_to_id,
                    ]));
                } else {
                    $msgRecord = WhatsAppMessage::create([
                        'user_id' => $conversation->user_id,
                        'session_id' => $session->id,
                        'conversation_id' => $conversation->id,
                        'from' => $session->phone_number,
                        'to' => $dest,
                        'message' => $text,
                        'message_type' => 'text',
                        'message_id' => $messageId,
                        'direction' => 'outgoing',
                        'status' => 'sent',
                        'reply_to_id' => $request->reply_to_id,
                        'sent_at' => now(),
                        'timestamp' => now(),
                    ]);
                }
            } finally {
                if ($locked) {
                    \Illuminate\Support\Facades\DB::select('SELECT RELEASE_LOCK(?)', [$lockName]);
                }
            }

            $conversation->update([
                'last_message' => $text,
                'last_message_type' => 'text',
                'last_message_direction' => 'outgoing',
                'last_message_status' => 'sent',
                'last_message_at' => now(),
            ]);

            // Broadcast so other agents/devices with the CRM open see the
            // outgoing message without waiting for the next poll.
            try {
                event(new \App\Events\CrmRealtimeEvent($conversation->user_id, 'message.new', [
                    'session_id' => $session->id,
                    'conversation_id' => $conversation->id,
                    'conversation' => $conversation->only([
                        'id', 'session_id', 'contact_jid', 'contact_name', 'contact_phone',
                        'contact_avatar', 'last_message', 'last_message_at',
                        'last_message_direction', 'last_message_type', 'last_message_status', 'unread_count', 'is_pinned',
                    ]),
                    'message' => $msgRecord->toArray(),
                ]));
            } catch (\Throwable $e) {
                Log::debug('CRM broadcast (outgoing) failed: ' . $e->getMessage());
            }

            $this->claimConversation($conversation, $request->user());

            // Human handoff: a manual agent reply pauses the AI bot on this
            // conversation for the configured window so they don't fight.
            try {
                $ar = \App\Models\WhatsAppAutoReply::where('user_id', $conversation->user_id)
                    ->where('session_id', $session->id)
                    ->where('is_enabled', true)
                    ->where('mode', 'ai')
                    ->first();
                if ($ar && (int) $ar->ai_handoff_minutes > 0) {
                    $conversation->update(['ai_disabled_until' => now()->addMinutes((int) $ar->ai_handoff_minutes)]);
                }
            } catch (\Throwable $ignored) {}

            $this->audit('message.send', ['preview' => mb_substr($text, 0, 120)], $conversation->id, $session->id, $msgRecord->id);

            return response()->json([
                'success' => true,
                'message' => $msgRecord,
            ]);
        } catch (\Throwable $e) {
            Log::error("CRM sendMessage engine error: " . $e->getMessage());
            return response()->json(['success' => false, 'message' => 'فشل إرسال الرسالة: ' . $e->getMessage()], 500);
        }
    }

    /**
     * Agent typing indicator — relays a 'composing'/'paused' chatstate to
     * WhatsApp so the contact sees the agent typing, like WhatsApp Web.
     */
    public function sendTyping(Request $request)
    {
        $request->validate([
            'conversation_id' => 'required|integer',
            'state' => 'nullable|string|in:composing,paused',
        ]);

        $allowedSessionIds = $this->getAllowedSessionIds();
        $conversation = WhatsAppConversation::whereIn('session_id', $allowedSessionIds)
            ->where('id', $request->conversation_id)
            ->firstOrFail();

        // Locked chat → don't leak the other agent's typing to the customer.
        if ($this->conversationLocker($conversation, $request->user())) {
            return response()->json(['success' => true]);
        }

        $session = $conversation->session;
        if (!$session || $session->status !== 'connected' || !$conversation->contact_jid) {
            return response()->json(['success' => true]); // silently no-op
        }

        // Throttle: composing stanzas would otherwise fire per keystroke.
        $throttleKey = "crm_typing_{$conversation->id}_{$request->user()->id}";
        if (!Cache::add($throttleKey, 1, 4)) {
            return response()->json(['success' => true]);
        }

        try {
            $token = $session->session_token ?: (string) $session->id;
            $this->engineClient()->post("{$this->engineUrl}/api/whatsapp/send-presence", [
                'sessionId' => $token,
                'state' => $request->input('state', 'composing'),
                'to' => $conversation->contact_jid,
            ]);
        } catch (\Throwable $e) {
            Log::debug('CRM typing relay failed: ' . $e->getMessage());
        }

        return response()->json(['success' => true]);
    }

    /**
     * Send rich media (Image, Video, Audio, Voice, Document) in CRM chat
     */
    public function sendMedia(Request $request)
    {
        $request->validate([
            'conversation_id' => 'required|integer',
            'type' => 'required|string|in:image,video,audio,voice,document',
            'caption' => 'nullable|string',
            'session_id' => 'nullable|integer',
            'reply_to_id' => 'nullable|string',
            'file' => 'nullable|file|max:51200', // max 50MB
            'media_url' => 'nullable|string',
        ]);

        $allowedSessionIds = $this->getAllowedSessionIds();
        $conversation = WhatsAppConversation::whereIn('session_id', $allowedSessionIds)
            ->where('id', $request->conversation_id)
            ->firstOrFail();

        if ($locker = $this->conversationLocker($conversation, $request->user())) {
            return $this->lockedResponse($locker);
        }

        $owner = $this->resolveOwner();
        try {
            $this->subscriptionService->assertCanSendMessage($owner);
        } catch (\RuntimeException $e) {
            return response()->json([
                'success' => false,
                'message' => $e->getMessage(),
                'code' => 'MESSAGE_LIMIT_REACHED',
            ], 403);
        }

        $session = $conversation->session;
        if ($request->filled('session_id') && in_array($request->session_id, $allowedSessionIds)) {
            $session = WhatsAppSession::find($request->session_id) ?: $session;
        }

        if (!$session || $session->status !== 'connected') {
            return response()->json(['success' => false, 'message' => 'الجهاز غير متصل حالياً'], 400);
        }

        $dest = $this->resolveDestJid($conversation);
        $token = $session->session_token ?: (string) $session->id;
        $type = $request->type;
        $caption = $request->caption ?? '';

        $mediaUrl = null;
        $mimeType = null;
        $fileName = null;
        $fileSize = 0;
        $base64Content = null;
        $seconds = null;

        if ($request->hasFile('file')) {
            $uploadedFile = $request->file('file');
            $fileName = $uploadedFile->getClientOriginalName();
            $mimeType = $uploadedFile->getMimeType();
            $fileSize = $uploadedFile->getSize();
            $fileBytes = file_get_contents($uploadedFile->getRealPath());

            // Save to public storage
            $ext = $uploadedFile->getClientOriginalExtension() ?: ($type === 'image' ? 'jpg' : ($type === 'video' ? 'mp4' : 'ogg'));
            $storedName = 'crm_' . time() . '_' . Str::random(8) . '.' . $ext;
            $uploadedFile->move(public_path('storage/crm_media'), $storedName);
            $mediaUrl = '/storage/crm_media/' . $storedName;

            // Browser MediaRecorder emits webm/opus but we label it .ogg —
            // WhatsApp rejects voice notes that aren't real ogg/opus (message
            // gets an id yet never delivers). Transcode to genuine ogg/opus.
            // Only for real audio payloads — a PDF uploaded under the
            // "audio" button must not hit ffmpeg.
            if (($type === 'voice' || $type === 'audio')
                && (str_starts_with((string) $mimeType, 'audio/') || str_starts_with((string) $mimeType, 'video/'))) {
                $srcPath = public_path('storage/crm_media/' . $storedName);
                $oggName = 'crm_' . time() . '_' . Str::random(8) . '.ogg';
                $oggPath = public_path('storage/crm_media/' . $oggName);

                try {
                    \Illuminate\Support\Facades\Process::run([
                        'ffmpeg', '-y', '-i', $srcPath,
                        '-c:a', 'libopus', '-b:a', '32k', $oggPath,
                    ])->throw();

                    $probe = \Illuminate\Support\Facades\Process::run([
                        'ffprobe', '-v', 'error', '-show_entries', 'format=duration',
                        '-of', 'csv=p=0', $oggPath,
                    ]);
                    if ($probe->successful()) {
                        $seconds = max(1, (int) round((float) trim($probe->output())));
                    }

                    $fileBytes = file_get_contents($oggPath);
                    $fileSize = strlen($fileBytes);
                    $mimeType = 'audio/ogg; codecs=opus';
                    @unlink($srcPath);
                    $mediaUrl = '/storage/crm_media/' . $oggName;
                    $fileName = $oggName;
                } catch (\Throwable $e) {
                    Log::warning("CRM voice transcode skipped: " . $e->getMessage());
                    @unlink($oggPath);
                }
            }

            // Base64 buffer for engine — strip mime params (; codecs=opus)
            // from the data URI so strict parsers don't choke on the ';'.
            $dataUriMime = explode(';', (string) $mimeType)[0];
            $base64Content = 'data:' . $dataUriMime . ';base64,' . base64_encode($fileBytes);
        } elseif ($request->filled('media_url')) {
            $mediaUrl = $request->media_url;
            $base64Content = $mediaUrl;
        } else {
            return response()->json(['success' => false, 'message' => 'يجب إرفاق ملف أو رابط وسائط'], 422);
        }

        try {
            $enginePayload = [
                'sessionId' => $token,
                'to' => $dest,
                'type' => $type,
                'content' => $base64Content,
                'caption' => $caption,
                'fileName' => $fileName,
                'mimeType' => $mimeType,
                'seconds' => $seconds,
            ];

            $quoted = $this->findQuotedMessage($conversation, $request->reply_to_id);
            if ($quoted && $quoted->message_id) {
                $enginePayload['replyTo'] = $this->buildReplyTo($quoted, $session, $conversation);
            }

            // Persist a pending row BEFORE calling the engine. It already
            // carries the local media URL, so the bubble stays playable even
            // when the engine call times out after actually sending — the
            // message-sent webhook then owns the real-id row and media_url
            // would otherwise stay empty forever.
            $pending = WhatsAppMessage::create([
                'user_id' => $conversation->user_id,
                'session_id' => $session->id,
                'conversation_id' => $conversation->id,
                'from' => $session->phone_number,
                'to' => $dest,
                'message' => $caption ?: ($type === 'voice' ? '[تسجيل صوتي]' : '[' . $type . ']'),
                'message_type' => $type,
                'message_id' => 'pend_media_' . uniqid(),
                'direction' => 'outgoing',
                'status' => WhatsAppMessage::STATUS_PENDING,
                'media_url' => $mediaUrl,
                'media_caption' => $caption ?: null,
                'media_mime_type' => $mimeType,
                'media_size' => $fileSize,
                'reply_to_id' => $request->reply_to_id,
                'sent_at' => now(),
                'timestamp' => now(),
            ]);

            $res = $this->engineClient()->post("{$this->engineUrl}/api/whatsapp/send-media", $enginePayload);
            $engineData = $res->json();
            $messageId = $engineData['messageId'] ?? ('out_media_' . uniqid());

            // Same race as sendMessage: the engine's message-sent webhook can
            // persist the row first — serialize on the shared lock name.
            $lockName = 'wa_msg_sent_' . sha1($session->id . '|' . $messageId);
            $locked = (int) (\Illuminate\Support\Facades\DB::select('SELECT GET_LOCK(?, 10) AS l', [$lockName])[0]->l ?? 0);

            try {
                $msgRecord = WhatsAppMessage::where('message_id', $messageId)->first();
                if ($msgRecord && $msgRecord->id !== $pending->id) {
                    // The webhook already wrote the real row — merge our
                    // pending media fields onto it and drop the placeholder.
                    $pending->delete();
                    $msgRecord->update(array_filter([
                        'conversation_id' => $msgRecord->conversation_id ?: $conversation->id,
                        'media_url' => $mediaUrl,
                        'media_caption' => $caption,
                        'media_mime_type' => $mimeType,
                        'media_size' => $fileSize,
                        'message_type' => $type,
                        'reply_to_id' => $request->reply_to_id,
                    ], fn($v) => $v !== null && $v !== ''));
                    if ($fileName && empty($msgRecord->media_meta['fileName'])) {
                        $meta = $msgRecord->media_meta ?: [];
                        $meta['fileName'] = $fileName;
                        $msgRecord->update(['media_meta' => $meta]);
                    }
                } else {
                    // No webhook row yet — promote our pending row to the real
                    // engine id. When the webhook lands later it finds this
                    // row by message_id and updates it in place.
                    $pending->update([
                        'message_id' => $messageId,
                        'status' => WhatsAppMessage::STATUS_SENT,
                        'media_meta' => $fileName ? ['fileName' => $fileName] : null,
                    ]);
                    $msgRecord = $pending;
                }
            } finally {
                if ($locked) {
                    \Illuminate\Support\Facades\DB::select('SELECT RELEASE_LOCK(?)', [$lockName]);
                }
            }

            $conversation->update([
                'last_message' => $caption ?: ($type === 'image' ? '📷 صورة' : ($type === 'video' ? '🎥 فيديو' : '🎤 تسجيل صوتي')),
                'last_message_type' => $type,
                'last_message_direction' => 'outgoing',
                'last_message_status' => 'sent',
                'last_message_at' => now(),
            ]);

            // Broadcast so other agents/devices with the CRM open see the
            // outgoing media instantly — the list would otherwise move ahead
            // of the open thread until the next poll.
            try {
                event(new \App\Events\CrmRealtimeEvent($conversation->user_id, 'message.new', [
                    'session_id' => $session->id,
                    'conversation_id' => $conversation->id,
                    'conversation' => $conversation->only([
                        'id', 'session_id', 'contact_jid', 'contact_name', 'contact_phone',
                        'contact_avatar', 'last_message', 'last_message_at',
                        'last_message_direction', 'last_message_type', 'last_message_status', 'unread_count', 'is_pinned',
                    ]),
                    'message' => $msgRecord->toArray(),
                ]));
            } catch (\Throwable $e) {
                Log::debug('CRM broadcast (outgoing media) failed: ' . $e->getMessage());
            }

            $this->claimConversation($conversation, $request->user());

            return response()->json([
                'success' => true,
                'message' => $msgRecord,
            ]);
        } catch (\Throwable $e) {
            Log::error("CRM sendMedia engine error: " . $e->getMessage());
            // The media file is already stored — keep the row playable and
            // mark it failed. If the engine actually sent it, the
            // message-sent webhook stamps the real id/status later.
            if (isset($pending) && $pending instanceof WhatsAppMessage) {
                $pending->update(['status' => WhatsAppMessage::STATUS_FAILED]);
            }
            return response()->json(['success' => false, 'message' => 'فشل إرسال الوسائط: ' . $e->getMessage()], 500);
        }
    }

    /**
     * Send reaction to a message
     */
    public function sendReaction(Request $request)
    {
        $request->validate([
            'message_id' => 'required|string',
            'emoji' => 'nullable|string',
            'conversation_id' => 'required|integer',
        ]);

        $allowedSessionIds = $this->getAllowedSessionIds();
        $conversation = WhatsAppConversation::whereIn('session_id', $allowedSessionIds)
            ->where('id', $request->conversation_id)
            ->firstOrFail();

        $session = $conversation->session;
        if (!$session || $session->status !== 'connected') {
            return response()->json(['success' => false, 'message' => 'الجهاز غير متصل'], 400);
        }

        $message = WhatsAppMessage::where('conversation_id', $conversation->id)
            ->where(function ($q) use ($request) {
                $q->where('message_id', $request->message_id)
                  ->orWhere('id', $request->message_id);
            })
            ->firstOrFail();

        $token = $session->session_token ?: (string) $session->id;
        $dest = $this->resolveDestJid($conversation);
        $emoji = trim($request->emoji ?? '');

        try {
            $this->engineClient()->post("{$this->engineUrl}/api/whatsapp/send-reaction", [
                'sessionId' => $token,
                'to' => $dest,
                'messageId' => $message->message_id,
                'emoji' => $emoji,
                'fromMe' => $message->direction === 'outgoing',
            ]);

            // Update reactions in DB
            $reactions = is_array($message->reactions) ? $message->reactions : [];
            $sender = $session->phone_number ?: 'me';

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

            return response()->json([
                'success' => true,
                'message' => $message,
            ]);
        } catch (\Throwable $e) {
            Log::error("CRM sendReaction engine error: " . $e->getMessage());
            return response()->json(['success' => false, 'message' => 'فشل إضافة التفاعل: ' . $e->getMessage()], 500);
        }
    }

    /**
     * Delete a stored message.
     * - for_everyone=true: sends a protocolMessage REVOKE through the engine
     *   (outgoing messages only) and stamps revoked_at — same badge the
     *   incoming "delete for everyone" webhook shows.
     * - otherwise: removes the local row only (WhatsApp "delete for me").
     */
    public function deleteMessage(Request $request)
    {
        $request->validate([
            'message_id' => 'required|string',
            'conversation_id' => 'required|integer',
            'for_everyone' => 'nullable|boolean',
        ]);

        $allowedSessionIds = $this->getAllowedSessionIds();
        $conversation = WhatsAppConversation::whereIn('session_id', $allowedSessionIds)
            ->where('id', $request->conversation_id)
            ->firstOrFail();

        $message = WhatsAppMessage::where('conversation_id', $conversation->id)
            ->where(function ($q) use ($request) {
                $q->where('message_id', $request->message_id)
                  ->orWhere('id', $request->message_id);
            })
            ->firstOrFail();

        if ($request->boolean('for_everyone')) {
            if ($message->direction !== 'outgoing' || !$message->message_id) {
                return response()->json(['success' => false, 'message' => 'الحذف عند الجميع متاح على رسائلك المرسلة بس'], 400);
            }

            $session = $conversation->session;
            if (!$session || $session->status !== 'connected') {
                return response()->json(['success' => false, 'message' => 'الجهاز غير متصل'], 400);
            }

            $token = $session->session_token ?: (string) $session->id;
            $dest = $this->resolveDestJid($conversation);

            try {
                $res = $this->engineClient()->post("{$this->engineUrl}/api/whatsapp/delete-message", [
                    'sessionId' => $token,
                    'to' => $dest,
                    'messageId' => $message->message_id,
                ]);
                // Laravel's HTTP client never throws on non-2xx — check the
                // body or the message is flagged deleted while WhatsApp kept it.
                $engineData = $res->json();
                if (!$res->successful() || !($engineData['success'] ?? false)) {
                    $err = $engineData['message'] ?? ('HTTP ' . $res->status());
                    Log::warning("CRM deleteMessage engine rejected: {$err}");
                    return response()->json(['success' => false, 'message' => 'فشل حذف الرسالة عند الجميع: ' . $err], 502);
                }
            } catch (\Throwable $e) {
                Log::error("CRM deleteMessage engine error: " . $e->getMessage());
                return response()->json(['success' => false, 'message' => 'فشل حذف الرسالة عند الجميع: ' . $e->getMessage()], 500);
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

            return response()->json(['success' => true, 'mode' => 'everyone']);
        }

        $message->delete();
        try {
            event(new \App\Events\CrmRealtimeEvent($conversation->user_id, 'message.deleted', [
                'message_id' => $message->id,
                'conversation_id' => $conversation->id,
            ]));
        } catch (\Throwable $e) {
            Log::debug('CRM broadcast (message.deleted) failed: ' . $e->getMessage());
        }

        return response()->json(['success' => true, 'mode' => 'me']);
    }

    /**
     * Forward a stored message to one or more conversations. The engine marks
     * the stanza with contextInfo.isForwarded so WhatsApp shows the
     * "Forwarded" label like the official client.
     */
    public function forwardMessage(Request $request)
    {
        $request->validate([
            'message_id' => 'required_without:message_ids',
            'message_ids' => 'nullable|array|min:1|max:50',
            'target_conversation_ids' => 'required|array|min:1|max:20',
            'target_conversation_ids.*' => 'integer',
        ]);

        $allowed = $this->getAllowedSessionIds();

        $ids = $request->message_ids ?: [$request->message_id];
        $sources = WhatsAppMessage::where(function ($q) use ($ids) {
                $q->whereIn('id', $ids)->orWhereIn('message_id', $ids);
            })
            ->whereIn('session_id', $allowed)
            ->orderBy('id')
            ->get();

        abort_if($sources->isEmpty(), 404, 'الرسائل غير موجودة');

        $targets = WhatsAppConversation::whereIn('session_id', $allowed)
            ->whereIn('id', $request->target_conversation_ids)
            ->get();

        $results = [];
        foreach ($targets as $conv) {
            foreach ($sources as $source) {
                try {
                    $msg = $this->forwardToConversation($source, $conv);
                    $results[] = ['conversation_id' => $conv->id, 'source_id' => $source->id, 'success' => true, 'message' => $msg];
                } catch (\Throwable $e) {
                    $results[] = ['conversation_id' => $conv->id, 'source_id' => $source->id, 'success' => false, 'error' => $e->getMessage()];
                }
            }
        }

        $ok = collect($results)->where('success')->count();

        return response()->json([
            'success' => $ok > 0,
            'results' => $results,
            'message' => $ok ? "تم تحويل {$ok} رسالة" : 'فشل التحويل',
        ]);
    }

    /**
     * Re-send a stored message's content to another conversation as a forward.
     */
    private function forwardToConversation(WhatsAppMessage $source, WhatsAppConversation $conv): WhatsAppMessage
    {
        $session = $conv->session;
        if (!$session || $session->status !== 'connected') {
            throw new \RuntimeException('الجهاز غير متصل');
        }

        $token = $session->session_token ?: (string) $session->id;
        $dest = $this->resolveDestJid($conv);

        $type = $source->message_type ?: 'text';
        $label = $source->message ?: '';

        if ($type === 'text' || !in_array($type, ['image', 'video', 'audio', 'voice', 'document', 'sticker'])) {
            $res = $this->engineClient()->post("{$this->engineUrl}/api/whatsapp/send-message", [
                'sessionId' => $token,
                'to' => $dest,
                'message' => $label,
                'type' => 'text',
                'forwarded' => true,
            ]);
            $engineData = $res->json();
        } else {
            // Media forward: re-upload the file we stored on send/receive.
            $mediaUrl = $source->media_url;
            if (!$mediaUrl) {
                throw new \RuntimeException('الوسائط غير متوفرة للتحويل');
            }

            $content = null;
            if (str_starts_with($mediaUrl, 'http')) {
                $content = $mediaUrl; // engine resolves http(s) itself
            } else {
                $path = public_path(ltrim($mediaUrl, '/'));
                if (!is_file($path)) {
                    throw new \RuntimeException('ملف الوسائط غير موجود على الخادم');
                }
                $mime = explode(';', (string) ($source->media_mime_type ?: 'application/octet-stream'))[0];
                $content = 'data:' . $mime . ';base64,' . base64_encode(file_get_contents($path));
            }

            $res = $this->engineClient()->post("{$this->engineUrl}/api/whatsapp/send-media", [
                'sessionId' => $token,
                'to' => $dest,
                'type' => $type,
                'content' => $content,
                'caption' => $source->media_caption,
                'fileName' => $source->media_meta['fileName'] ?? null,
                'mimeType' => $source->media_mime_type,
                'seconds' => $source->media_meta['seconds'] ?? null,
                'forwarded' => true,
            ]);
            $engineData = $res->json();
        }

        if (!($engineData['success'] ?? true) && !isset($engineData['messageId'])) {
            throw new \RuntimeException($engineData['message'] ?? 'فشل الإرسال');
        }

        $messageId = $engineData['messageId'] ?? ('fwd_' . uniqid());

        $lockName = 'wa_msg_sent_' . sha1($session->id . '|' . $messageId);
        $locked = (int) (\Illuminate\Support\Facades\DB::select('SELECT GET_LOCK(?, 10) AS l', [$lockName])[0]->l ?? 0);

        try {
            $msgRecord = WhatsAppMessage::where('message_id', $messageId)->first();
            if ($msgRecord) {
                $msgRecord->update(array_filter([
                    'is_forwarded' => true,
                    'conversation_id' => $msgRecord->conversation_id ?: $conv->id,
                ], fn($v) => $v !== null));
            } else {
                $msgRecord = WhatsAppMessage::create([
                    'user_id' => $conv->user_id,
                    'session_id' => $session->id,
                    'conversation_id' => $conv->id,
                    'from' => $session->phone_number,
                    'to' => $dest,
                    'message' => $label ?: "[{$type}]",
                    'media_url' => $source->media_url,
                    'media_caption' => $source->media_caption,
                    'media_mime_type' => $source->media_mime_type,
                    'media_size' => $source->media_size,
                    'media_meta' => $source->media_meta,
                    'message_type' => $type,
                    'is_forwarded' => true,
                    'message_id' => $messageId,
                    'direction' => 'outgoing',
                    'status' => 'sent',
                    'sent_at' => now(),
                    'timestamp' => now(),
                ]);
            }
        } finally {
            if ($locked) {
                \Illuminate\Support\Facades\DB::select('SELECT RELEASE_LOCK(?)', [$lockName]);
            }
        }

        $conv->update([
            'last_message' => $label ?: "[{$type}]",
            'last_message_type' => $type,
            'last_message_direction' => 'outgoing',
            'last_message_status' => 'sent',
            'last_message_at' => now(),
        ]);

        try {
            event(new \App\Events\CrmRealtimeEvent($conv->user_id, 'message.new', [
                'session_id' => $session->id,
                'conversation_id' => $conv->id,
                'conversation' => $conv->only([
                    'id', 'session_id', 'contact_jid', 'contact_name', 'contact_phone',
                    'contact_avatar', 'last_message', 'last_message_at',
                    'last_message_direction', 'last_message_type', 'last_message_status', 'unread_count', 'is_pinned',
                ]),
                'message' => $msgRecord->toArray(),
            ]));
        } catch (\Throwable $e) {
            Log::debug('CRM broadcast (forward) failed: ' . $e->getMessage());
        }

        $this->audit('message.forward', ['source' => $source->id], $conv->id, $session->id, $msgRecord->id);

        return $msgRecord;
    }

    /**
     * Rename the contact for a conversation — the agent's saved label wins
     * over the synced WhatsApp name everywhere in the CRM.
     */
    public function renameConversation(Request $request, $id)
    {
        $request->validate(['name' => 'required|string|max:120']);

        $allowed = $this->getAllowedSessionIds();
        $conversation = WhatsAppConversation::whereIn('session_id', $allowed)
            ->where('id', $id)
            ->firstOrFail();

        $conversation->update(['contact_name' => trim($request->name)]);

        try {
            event(new \App\Events\CrmRealtimeEvent($conversation->user_id, 'conversation.update', [
                'session_id' => $conversation->session_id,
                'conversation_id' => $conversation->id,
                'conversation' => $conversation->only([
                    'id', 'session_id', 'contact_jid', 'contact_name', 'contact_phone',
                    'contact_avatar', 'last_message', 'last_message_at',
                    'last_message_direction', 'last_message_type', 'last_message_status', 'unread_count', 'is_pinned',
                ]),
            ]));
        } catch (\Throwable $e) {
            Log::debug('CRM broadcast (rename) failed: ' . $e->getMessage());
        }

        return response()->json([
            'success' => true,
            'conversation' => $conversation,
        ]);
    }

    /**
     * End (resolve) a conversation: releases the agent lock so anyone can
     * pick it up again, stamps a "مكتمل" badge, and optionally stores the
     * agent's star-rating + note about the customer.
     */
    public function resolveConversation(Request $request, $id)
    {
        $request->validate([
            'rating' => 'nullable|integer|min:1|max:5',
            'note' => 'nullable|string|max:2000',
        ]);

        $user = $request->user();
        $conversation = WhatsAppConversation::whereIn('session_id', $this->getAllowedSessionIds())
            ->where('id', $id)
            ->firstOrFail();

        // Only the holding agent or an owner may close the chat.
        if ($locker = $this->conversationLocker($conversation, $user)) {
            return $this->lockedResponse($locker);
        }

        $conversation->forceFill([
            'assigned_agent_id' => null,
            'assigned_at' => null,
            'resolved_at' => now(),
            'resolved_by' => $user->id,
            'rating' => $request->input('rating'),
            'rating_note' => $request->input('note'),
        ])->save();

        $this->audit('conversation.resolve', [
            'rating' => $request->input('rating'),
            'note' => mb_substr((string) $request->input('note'), 0, 300),
        ], $conversation->id, $conversation->session_id);
        $this->broadcastConversation($conversation);

        return response()->json([
            'success' => true,
            'conversation' => $conversation->fresh(['assignedAgent:id,name', 'resolvedBy:id,name']),
        ]);
    }

    /**
     * Assign a conversation to an agent. Owners may assign anyone (or null to
     * release); agents may only claim an unassigned chat for themselves.
     */
    public function assignConversation(Request $request, $id)
    {
        $request->validate(['agent_id' => 'nullable|integer']);

        $user = $request->user();
        $owner = $this->resolveOwner();
        $conversation = WhatsAppConversation::whereIn('session_id', $this->getAllowedSessionIds())
            ->where('id', $id)
            ->firstOrFail();

        $targetId = $request->filled('agent_id') ? (int) $request->agent_id : $user->id;

        if ($user->crm_role === 'agent') {
            // Agents can only take an unassigned chat for themselves.
            if ($targetId !== $user->id
                || ($conversation->assigned_agent_id && $conversation->assigned_agent_id !== $user->id)) {
                return response()->json(['success' => false, 'message' => 'غير مسموح'], 403);
            }
        } else {
            // Owner: target must be themselves or one of their agents.
            if ($request->filled('agent_id')
                && $targetId !== $owner->id
                && !User::where('id', $targetId)->where('crm_parent_id', $owner->id)->exists()) {
                return response()->json(['success' => false, 'message' => 'الموظف غير تابع لك'], 403);
            }
            if (!$request->filled('agent_id')) {
                $targetId = null; // owner releasing the lock
            }
        }

        $conversation->forceFill([
            'assigned_agent_id' => $targetId,
            'assigned_at' => $targetId ? now() : null,
            // Assigning a handled chat reopens the workflow for the new agent.
            'resolved_at' => $targetId ? null : $conversation->resolved_at,
        ])->save();

        $this->audit('conversation.assign', ['agent_id' => $targetId], $conversation->id, $conversation->session_id);
        $this->broadcastConversation($conversation);

        return response()->json([
            'success' => true,
            'conversation' => $conversation->fresh(['assignedAgent:id,name', 'resolvedBy:id,name']),
        ]);
    }

    /**
     * Media, links & docs shared inside a conversation — feeds the
     * contact-info side panel like WhatsApp Web's "Contact info".
     */
    public function getConversationMedia($id)
    {
        $allowed = $this->getAllowedSessionIds();
        $conversation = WhatsAppConversation::whereIn('session_id', $allowed)
            ->where('id', $id)
            ->firstOrFail();

        $rows = WhatsAppMessage::where('conversation_id', $conversation->id)
            ->whereIn('message_type', ['image', 'video', 'document', 'audio', 'voice', 'sticker'])
            ->orderBy('timestamp', 'desc')->orderBy('id', 'desc')
            ->limit(30)
            ->get(['id', 'message_id', 'message_type', 'message', 'media_url', 'media_mime_type', 'media_size', 'media_meta', 'direction', 'timestamp', 'created_at']);

        return response()->json([
            'success' => true,
            'media' => $rows,
        ]);
    }

    /**
     * Stream a message's media. <img>/<audio> tags cannot send Authorization
     * headers, so the sanctum token arrives as ?token= and is validated here.
     * History-synced media is decrypted lazily through the engine on first
     * request, then cached on disk.
     */
    public function streamMedia(Request $request, $id)
    {
        $accessToken = \Laravel\Sanctum\PersonalAccessToken::findToken((string) $request->query('token'));
        $user = $accessToken?->tokenable;
        if (!$user instanceof User) {
            return response()->json(['success' => false, 'message' => 'Unauthenticated.'], 401);
        }

        $message = WhatsAppMessage::findOrFail($id);

        if ($message->session_id
            && $user->crm_role !== 'admin'
            && !in_array($message->session_id, $this->getAllowedSessionIds($user))) {
            return response()->json(['success' => false, 'message' => 'Forbidden'], 403);
        }

        $base = rtrim(config('app.url'), '/');

        if ($message->media_url) {
            $url = str_starts_with($message->media_url, 'http')
                ? $message->media_url
                : $base . $message->media_url;
            return redirect()->to($url);
        }

        $meta = $message->media_meta;
        if (!is_array($meta) || empty($meta['mediaKey'])) {
            return response()->json(['success' => false, 'message' => 'No media for this message'], 404);
        }

        try {
            $res = $this->engineClient()->post("{$this->engineUrl}/internal/media/download", [
                'mediaKey' => $meta['mediaKey'],
                'directPath' => $meta['directPath'] ?? null,
                'url' => $meta['url'] ?? null,
                'type' => $meta['type'] ?? 'document',
                'mimetype' => $meta['mimetype'] ?? null,
            ]);

            $mediaUrl = $res->json('mediaUrl');
            if (!$mediaUrl) {
                return response()->json(['success' => false, 'message' => 'Media unavailable'], 404);
            }

            $message->update(['media_url' => $mediaUrl]);

            return redirect()->to($base . $mediaUrl);
        } catch (\Throwable $e) {
            Log::warning("CRM streamMedia engine error for message {$id}: " . $e->getMessage());
            return response()->json(['success' => false, 'message' => 'Media download failed'], 502);
        }
    }

    /**
     * WhatsApp statuses (stories) — grouped exactly like the WA Status tab:
     * my own items, recent (unviewed) contacts, then viewed contacts. Rows
     * survive deletion (deleted_at only flags them) and the 24h expiry is
     * enforced by the window here, not by dropping data.
     */
    public function getStatuses(Request $request)
    {
        $allowed = $this->getAllowedSessionIds();
        $rows = \App\Models\WhatsAppStatus::whereIn('session_id', $allowed)
            ->where('posted_at', '>=', now()->subHours(36))
            ->orderBy('posted_at', 'desc')->orderBy('id', 'desc')
            ->get();

        // Live contact resolution — the saved name/avatar may have been
        // learned after the status row was first stored.
        $phones = $rows->pluck('poster_phone')->filter()->unique()->all();
        $contacts = WhatsAppConversation::whereIn('session_id', $allowed)
            ->whereIn('contact_phone', $phones)
            ->get()->keyBy('contact_phone');

        $items = $rows->map(function ($s) use ($contacts) {
            $c = $contacts->get($s->poster_phone);
            $saved = ($c && $c->contact_name && !preg_match('/^\+?\d+$/', trim($c->contact_name)))
                ? $c->contact_name : null;
            return [
                'id' => $s->id,
                'poster_phone' => $s->poster_phone,
                'poster_name' => $saved ?: ($s->poster_name ?: '+' . $s->poster_phone),
                'poster_avatar' => $c?->contact_avatar ?: $s->poster_avatar,
                'is_mine' => (bool) $s->is_mine,
                'type' => $s->type,
                'body' => $s->body,
                'media_url' => $s->media_url,
                'media_mime_type' => $s->media_mime_type,
                'has_lazy_media' => !$s->media_url && !empty($s->media_meta['mediaKey']),
                'posted_at' => $s->posted_at?->toIso8601String(),
                'expires_at' => $s->expires_at?->toIso8601String(),
                'deleted_at' => $s->deleted_at?->toIso8601String(),
                'viewed_at' => $s->viewed_at?->toIso8601String(),
            ];
        });

        $mine = $items->where('is_mine', true)->values();

        $groups = [];
        foreach ($items->where('is_mine', false) as $it) {
            $groups[$it['poster_phone']][] = $it;
        }
        $recent = [];
        $viewed = [];
        foreach ($groups as $phone => $list) {
            $g = [
                'poster_phone' => $phone,
                'poster_name' => $list[0]['poster_name'],
                'poster_avatar' => $list[0]['poster_avatar'],
                'count' => count($list),
                'latest_at' => $list[0]['posted_at'],
                'items' => array_values($list),
            ];
            $allSeen = collect($list)->every(fn ($i) => $i['viewed_at'] || $i['deleted_at']);
            if ($allSeen) {
                $viewed[] = $g;
            } else {
                $recent[] = $g;
            }
        }
        $byLatest = fn ($a, $b) => strtotime($b['latest_at']) <=> strtotime($a['latest_at']);
        usort($recent, $byLatest);
        usort($viewed, $byLatest);

        return response()->json([
            'success' => true,
            'mine' => $mine,
            'recent' => $recent,
            'viewed' => $viewed,
        ]);
    }

    /**
     * Mark a status item as seen — drives the Recent/Viewed split exactly
     * like WhatsApp moves a contact down once you watched their story.
     */
    public function viewStatus(Request $request, $id)
    {
        $allowed = $this->getAllowedSessionIds();
        $status = \App\Models\WhatsAppStatus::whereIn('session_id', $allowed)
            ->where('id', $id)->firstOrFail();
        if (!$status->viewed_at) {
            $status->update(['viewed_at' => now()]);
        }
        return response()->json(['success' => true]);
    }

    /**
     * Stream a status's media — same ?token= auth + lazy engine decrypt as
     * streamMedia, but against whatsapp_statuses.
     */
    public function streamStatusMedia(Request $request, $id)
    {
        $accessToken = \Laravel\Sanctum\PersonalAccessToken::findToken((string) $request->query('token'));
        $user = $accessToken?->tokenable;
        if (!$user instanceof User) {
            return response()->json(['success' => false, 'message' => 'Unauthenticated.'], 401);
        }

        $status = \App\Models\WhatsAppStatus::findOrFail($id);
        if ($status->session_id
            && $user->crm_role !== 'admin'
            && !in_array($status->session_id, $this->getAllowedSessionIds($user))) {
            return response()->json(['success' => false, 'message' => 'Forbidden'], 403);
        }

        $base = rtrim(config('app.url'), '/');

        if ($status->media_url) {
            $url = str_starts_with($status->media_url, 'http')
                ? $status->media_url
                : $base . $status->media_url;
            return redirect()->to($url);
        }

        $meta = $status->media_meta;
        if (!is_array($meta) || empty($meta['mediaKey'])) {
            return response()->json(['success' => false, 'message' => 'No media for this status'], 404);
        }

        try {
            $res = $this->engineClient()->post("{$this->engineUrl}/internal/media/download", [
                'mediaKey' => $meta['mediaKey'],
                'directPath' => $meta['directPath'] ?? null,
                'url' => $meta['url'] ?? null,
                'type' => $meta['type'] ?? 'document',
                'mimetype' => $meta['mimetype'] ?? null,
            ]);
            $mediaUrl = $res->json('mediaUrl');
            if (!$mediaUrl) {
                return response()->json(['success' => false, 'message' => 'Media unavailable'], 404);
            }
            $status->update(['media_url' => $mediaUrl]);
            return redirect()->to($base . $mediaUrl);
        } catch (\Throwable $e) {
            Log::warning("CRM streamStatusMedia engine error for status {$id}: " . $e->getMessage());
            return response()->json(['success' => false, 'message' => 'Media download failed'], 502);
        }
    }
}
