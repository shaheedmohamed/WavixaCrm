<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Models\WhatsAppConversation;
use App\Models\WhatsAppMessage;
use App\Models\WhatsAppSession;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * Platform admin (crm_role = 'admin') — manages every CRM customer
 * (owner accounts), their devices, agents and conversations.
 */
class CrmAdminController extends Controller
{
    private function requireAdmin(): User
    {
        /** @var User $user */
        $user = Auth::user();
        abort_unless($user && $user->crm_role === 'admin', 403, 'غير مصرح — صلاحيات الأدمن فقط');
        return $user;
    }

    /**
     * Global KPIs across all CRM customers.
     */
    public function overview()
    {
        $this->requireAdmin();

        $customers = User::where('crm_role', 'owner')->count();
        $agents = User::where('crm_role', 'agent')->count();

        $devices = WhatsAppSession::count();
        $connected = WhatsAppSession::where('status', 'connected')->count();

        $messagesToday = WhatsAppMessage::where('direction', 'outgoing')
            ->whereDate('created_at', now()->today())->count();
        $messagesTotal = WhatsAppMessage::where('direction', 'outgoing')->count();

        $conversations = WhatsAppConversation::count();
        $openConversations = WhatsAppConversation::whereNull('resolved_at')->count();
        $unread = WhatsAppConversation::sum('unread_count');

        return response()->json([
            'success' => true,
            'overview' => [
                'customers' => $customers,
                'agents' => $agents,
                'devices' => $devices,
                'connected_devices' => $connected,
                'messages_today' => $messagesToday,
                'messages_total' => $messagesTotal,
                'conversations' => $conversations,
                'open_conversations' => $openConversations,
                'unread' => (int) $unread,
            ],
        ]);
    }

    /**
     * All CRM customers (owners) with usage stats.
     */
    public function customers(Request $request)
    {
        $this->requireAdmin();

        $query = User::where('crm_role', 'owner');

        if ($q = trim((string) $request->input('q'))) {
            $query->where(fn ($w) => $w->where('name', 'like', "%{$q}%")
                ->orWhere('email', 'like', "%{$q}%"));
        }
        if ($request->filled('status')) {
            $query->where('status', $request->input('status'));
        }

        $owners = $query->orderByDesc('id')->get();

        $rows = $owners->map(fn ($o) => $this->customerRow($o));

        return response()->json(['success' => true, 'customers' => $rows]);
    }

    /**
     * Usage stats for a single owner (shared by list + detail).
     */
    private function customerRow(User $o): array
    {
        $devices = WhatsAppSession::where('user_id', $o->id);
        $sentQuery = WhatsAppMessage::where('user_id', $o->id)->where('direction', 'outgoing');
        $convs = WhatsAppConversation::where('user_id', $o->id);

        return [
            'id' => $o->id,
            'name' => $o->name,
            'email' => $o->email,
            'status' => $o->status ?? 'active',
            'created_at' => $o->created_at,
            'agents_count' => User::where('crm_parent_id', $o->id)->count(),
            'devices_total' => (clone $devices)->count(),
            'devices_connected' => (clone $devices)->where('status', 'connected')->count(),
            'messages_sent_total' => (clone $sentQuery)->count(),
            'messages_sent_today' => (clone $sentQuery)->whereDate('created_at', now()->today())->count(),
            'messages_sent_month' => (clone $sentQuery)->where('created_at', '>=', now()->subDays(30))->count(),
            'conversations_total' => (clone $convs)->count(),
            'conversations_open' => (clone $convs)->whereNull('resolved_at')->count(),
            'unread' => (int) (clone $convs)->sum('unread_count'),
            'last_activity_at' => WhatsAppMessage::where('user_id', $o->id)->max('created_at'),
        ];
    }

    /**
     * Create a new customer (owner) account.
     */
    public function createCustomer(Request $request)
    {
        $this->requireAdmin();

        $request->validate([
            'name' => 'required|string|max:100',
            'email' => 'required|email|unique:users,email',
            'password' => 'required|string|min:6',
        ]);

        $customer = User::create([
            'name' => trim($request->name),
            'email' => strtolower(trim($request->email)),
            'password' => Hash::make($request->password),
            'crm_role' => 'owner',
            'status' => 'active',
            'messages_balance' => 0,
            'email_verified_at' => now(),
        ]);

        return response()->json([
            'success' => true,
            'message' => 'تم إنشاء حساب العميل بنجاح',
            'customer' => $this->customerRow($customer),
        ]);
    }

    /**
     * Update a customer account (name / email / password / status).
     */
    public function updateCustomer(Request $request, $id)
    {
        $this->requireAdmin();
        $customer = User::where('crm_role', 'owner')->findOrFail($id);

        $request->validate([
            'name' => 'sometimes|string|max:100',
            'email' => ['sometimes', 'email', Rule::unique('users', 'email')->ignore($customer->id)],
            'password' => 'nullable|string|min:6',
            'status' => 'nullable|string|in:active,inactive,suspended',
        ]);

        $data = [];
        if ($request->filled('name')) {
            $data['name'] = trim($request->name);
        }
        if ($request->filled('email')) {
            $data['email'] = strtolower(trim($request->email));
        }
        if ($request->filled('password')) {
            $data['password'] = Hash::make($request->password);
        }
        if ($request->filled('status')) {
            $data['status'] = $request->input('status');
        }

        $customer->update($data);

        return response()->json([
            'success' => true,
            'message' => 'تم تحديث بيانات العميل',
            'customer' => $this->customerRow($customer->fresh()),
        ]);
    }

    /**
     * Delete a customer account and its team/devices/conversations.
     */
    public function deleteCustomer($id)
    {
        $this->requireAdmin();
        $customer = User::where('crm_role', 'owner')->findOrFail($id);

        User::where('crm_parent_id', $customer->id)->delete();
        WhatsAppConversation::where('user_id', $customer->id)->delete();
        WhatsAppMessage::where('user_id', $customer->id)->delete();
        WhatsAppSession::where('user_id', $customer->id)->delete();
        \DB::table('crm_groups')->where('owner_id', $customer->id)->delete();
        \DB::table('crm_audit_logs')->where('owner_id', $customer->id)->delete();
        $customer->delete();

        return response()->json(['success' => true, 'message' => 'تم حذف العميل وبياناته']);
    }

    /**
     * Customer detail: account info, devices, agents, usage stats.
     */
    public function customer($id)
    {
        $this->requireAdmin();
        $customer = User::where('crm_role', 'owner')->findOrFail($id);

        $devices = WhatsAppSession::where('user_id', $customer->id)
            ->orderBy('id')
            ->get()
            ->map(fn ($d) => [
                'id' => $d->id,
                'device_name' => $d->device_name ?: 'ج' . $d->id,
                'phone_number' => $d->phone_number,
                'status' => $d->status,
                'connected_at' => $d->connected_at,
                'last_activity_at' => $d->last_activity_at,
                'conversations' => WhatsAppConversation::where('session_id', $d->id)->count(),
                'messages_sent' => WhatsAppMessage::where('session_id', $d->id)
                    ->where('direction', 'outgoing')->count(),
            ]);

        $agents = User::where('crm_parent_id', $customer->id)->get()
            ->map(fn ($a) => [
                'id' => $a->id,
                'name' => $a->name,
                'email' => $a->email,
                'status' => $a->status ?? 'active',
                'created_at' => $a->created_at,
            ]);

        return response()->json([
            'success' => true,
            'customer' => $this->customerRow($customer),
            'devices' => $devices,
            'agents' => $agents,
        ]);
    }

    /**
     * All conversations belonging to a customer's devices.
     */
    public function customerConversations(Request $request, $id)
    {
        $this->requireAdmin();
        $customer = User::where('crm_role', 'owner')->findOrFail($id);

        // Scope by user_id, not live session ids — conversations whose device
        // was deleted keep session_id=NULL and must stay visible.
        $query = WhatsAppConversation::where('user_id', $customer->id)
            ->with(['session:id,device_name,phone_number', 'assignedAgent:id,name']);

        if ($q = trim((string) $request->input('q'))) {
            $query->where(fn ($w) => $w->where('contact_name', 'like', "%{$q}%")
                ->orWhere('contact_phone', 'like', "%{$q}%"));
        }
        if ($request->input('status') === 'open') {
            $query->whereNull('resolved_at');
        } elseif ($request->input('status') === 'resolved') {
            $query->whereNotNull('resolved_at');
        }

        $convs = $query->orderByDesc('last_message_at')->orderByDesc('id')
            ->paginate(30);

        return response()->json([
            'success' => true,
            'conversations' => $convs->getCollection()->map(fn ($c) => [
                'id' => $c->id,
                'contact_name' => $c->contact_name,
                'contact_phone' => $c->contact_phone,
                'contact_jid' => $c->contact_jid,
                'contact_avatar' => $c->contact_avatar,
                'last_message' => $c->last_message,
                'last_message_at' => $c->last_message_at,
                'last_message_direction' => $c->last_message_direction,
                'unread_count' => $c->unread_count,
                'resolved_at' => $c->resolved_at,
                'rating' => $c->rating,
                'device' => $c->session ? [
                    'id' => $c->session->id,
                    'device_name' => $c->session->device_name,
                    'phone_number' => $c->session->phone_number,
                ] : ($c->archived_device_name || $c->archived_device_phone ? [
                    'id' => null,
                    'device_name' => $c->archived_device_name ?: 'جهاز محذوف',
                    'phone_number' => $c->archived_device_phone,
                    'archived' => true,
                ] : null),
                'assigned_agent' => $c->assignedAgent?->name,
                'messages_count' => WhatsAppMessage::where('conversation_id', $c->id)->count(),
            ]),
            'pagination' => [
                'current_page' => $convs->currentPage(),
                'last_page' => $convs->lastPage(),
                'total' => $convs->total(),
            ],
        ]);
    }

    /**
     * Read-only message viewer for any conversation (admin sees everything).
     */
    public function conversationMessages(Request $request, $id)
    {
        $this->requireAdmin();
        $conversation = WhatsAppConversation::with('session:id,device_name,phone_number')->findOrFail($id);

        $query = WhatsAppMessage::where('conversation_id', $conversation->id)->orderByDesc('id');
        if ($request->filled('before_id')) {
            $query->where('id', '<', (int) $request->before_id);
        }
        $messages = $query->limit(50)->get()->reverse()->values();

        return response()->json([
            'success' => true,
            'conversation' => [
                'id' => $conversation->id,
                'contact_name' => $conversation->contact_name,
                'contact_phone' => $conversation->contact_phone,
                'contact_jid' => $conversation->contact_jid,
                'contact_avatar' => $conversation->contact_avatar,
                'resolved_at' => $conversation->resolved_at,
                'rating' => $conversation->rating,
                'device' => $conversation->session ? [
                    'device_name' => $conversation->session->device_name,
                    'phone_number' => $conversation->session->phone_number,
                ] : ($conversation->archived_device_name || $conversation->archived_device_phone ? [
                    'device_name' => $conversation->archived_device_name ?: 'جهاز محذوف',
                    'phone_number' => $conversation->archived_device_phone,
                    'archived' => true,
                ] : null),
            ],
            'messages' => $messages,
            'has_more' => $messages->count() === 50,
        ]);
    }


    /**
     * Every device across all customers, with owner + usage stats.
     */
    public function devices(Request $request)
    {
        $this->requireAdmin();

        $query = WhatsAppSession::with('user:id,name,email')
            ->orderByDesc('last_activity_at')->orderByDesc('id');

        if ($request->filled('status')) {
            $query->where('status', $request->input('status'));
        }
        if ($request->filled('customer_id')) {
            $query->where('user_id', (int) $request->input('customer_id'));
        }
        if ($q = trim((string) $request->input('q'))) {
            $query->where(fn ($w) => $w->where('device_name', 'like', "%{$q}%")
                ->orWhere('phone_number', 'like', "%{$q}%"));
        }

        $devices = $query->paginate(30);

        return response()->json([
            'success' => true,
            'devices' => $devices->getCollection()->map(fn ($d) => [
                'id' => $d->id,
                'device_name' => $d->device_name,
                'phone_number' => $d->phone_number,
                'status' => $d->status,
                'connected_at' => $d->connected_at,
                'last_activity_at' => $d->last_activity_at,
                'customer' => $d->user ? ['id' => $d->user->id, 'name' => $d->user->name, 'email' => $d->user->email] : null,
                'conversations' => WhatsAppConversation::where('session_id', $d->id)->count(),
                'messages_sent_total' => WhatsAppMessage::where('session_id', $d->id)->where('direction', 'outgoing')->count(),
                'messages_sent_today' => WhatsAppMessage::where('session_id', $d->id)->where('direction', 'outgoing')->whereDate('created_at', today())->count(),
            ]),
            'pagination' => [
                'current_page' => $devices->currentPage(),
                'last_page' => $devices->lastPage(),
                'total' => $devices->total(),
            ],
        ]);
    }

    /**
     * Force-disconnect a customer's device from WhatsApp.
     */
    public function disconnectDevice($id)
    {
        $this->requireAdmin();
        $device = WhatsAppSession::findOrFail($id);

        try {
            \Illuminate\Support\Facades\Http::withHeaders([
                'Authorization' => 'Bearer ' . config('services.whatsapp.api_key'),
            ])->timeout(15)->post(
                rtrim(config('services.whatsapp.url', 'http://127.0.0.1:3005'), '/')
                . '/api/whatsapp/disconnect/' . $device->session_token
            );
        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\Log::warning('Admin disconnectDevice engine error: ' . $e->getMessage());
        }

        $device->update(['status' => 'disconnected']);

        return response()->json(['success' => true, 'message' => 'تم فصل الجهاز']);
    }

    /**
     * All conversations across every customer, filterable.
     */
    public function conversations(Request $request)
    {
        $this->requireAdmin();

        $query = WhatsAppConversation::with(['session:id,device_name,phone_number,user_id', 'assignedAgent:id,name'])
            ->orderByDesc('last_message_at')->orderByDesc('id');

        if ($request->filled('customer_id')) {
            $query->where('user_id', (int) $request->input('customer_id'));
        }
        if ($request->filled('device_id')) {
            $query->where('session_id', (int) $request->input('device_id'));
        }
        if ($request->input('status') === 'open') {
            $query->whereNull('resolved_at');
        } elseif ($request->input('status') === 'resolved') {
            $query->whereNotNull('resolved_at');
        }
        if ($q = trim((string) $request->input('q'))) {
            $query->where(fn ($w) => $w->where('contact_name', 'like', "%{$q}%")
                ->orWhere('contact_phone', 'like', "%{$q}%")
                ->orWhere('contact_jid', 'like', "%{$q}%"));
        }

        $convs = $query->paginate(30);

        // One row per contact, ever: the admin list aggregates every
        // customer's chats, so the same WhatsApp number can repeat across
        // owners (or as an archived twin of a deleted device). Collapse to
        // the most recent conversation — rows are newest-first already.
        $seenContacts = [];
        $items = $convs->getCollection()->filter(function ($c) use (&$seenContacts) {
            $digits = preg_replace('/\D/', '', explode(':', (string) ($c->contact_phone ?: explode('@', (string) $c->contact_jid)[0]))[0]);
            $key = $digits !== '' ? $digits : (string) $c->contact_jid;
            if (isset($seenContacts[$key])) return false;
            return $seenContacts[$key] = true;
        })->values();
        $convs->setCollection($items);

        $owners = User::whereIn('id', $items->pluck('user_id')->filter()->unique())
            ->get(['id', 'name', 'email'])->keyBy('id');

        return response()->json([
            'success' => true,
            'conversations' => $items->map(fn ($c) => [
                'id' => $c->id,
                'contact_name' => $c->contact_name,
                'contact_phone' => $c->contact_phone,
                'contact_jid' => $c->contact_jid,
                'contact_avatar' => $c->contact_avatar,
                'last_message' => $c->last_message,
                'last_message_at' => $c->last_message_at,
                'last_message_direction' => $c->last_message_direction,
                'last_message_type' => $c->last_message_type,
                'last_message_status' => $c->last_message_status,
                'unread_count' => $c->unread_count,
                'resolved_at' => $c->resolved_at,
                'rating' => $c->rating,
                'session_id' => $c->session_id,
                'assigned_agent_id' => $c->assigned_agent_id,
                'customer' => isset($owners[$c->user_id]) ? [
                    'id' => $owners[$c->user_id]->id,
                    'name' => $owners[$c->user_id]->name,
                ] : null,
                'session' => $c->session ? [
                    'id' => $c->session->id,
                    'device_name' => $c->session->device_name,
                    'phone_number' => $c->session->phone_number,
                ] : ($c->archived_device_name || $c->archived_device_phone ? [
                    'id' => null,
                    'device_name' => $c->archived_device_name ?: 'جهاز محذوف',
                    'phone_number' => $c->archived_device_phone,
                    'archived' => true,
                ] : null),
                'assigned_agent' => $c->assignedAgent?->name,
                'messages_count' => WhatsAppMessage::where('conversation_id', $c->id)->count(),
            ]),
            'pagination' => [
                'current_page' => $convs->currentPage(),
                'last_page' => $convs->lastPage(),
                'total' => $convs->total(),
            ],
        ]);
    }

    /**
     * All agents across every customer with their owner + usage stats.
     */
    public function agents(Request $request)
    {
        $this->requireAdmin();

        $query = User::where('crm_role', 'agent')->with('crmParent:id,name,email')
            ->orderByDesc('id');

        if ($request->filled('customer_id')) {
            $query->where('crm_parent_id', (int) $request->input('customer_id'));
        }
        if ($q = trim((string) $request->input('q'))) {
            $query->where(fn ($w) => $w->where('name', 'like', "%{$q}%")
                ->orWhere('email', 'like', "%{$q}%"));
        }

        $agents = $query->paginate(30);

        return response()->json([
            'success' => true,
            'agents' => $agents->getCollection()->map(fn ($a) => [
                'id' => $a->id,
                'name' => $a->name,
                'email' => $a->email,
                'status' => $a->status ?? 'active',
                'created_at' => $a->created_at,
                'customer' => $a->crmParent ? ['id' => $a->crmParent->id, 'name' => $a->crmParent->name, 'email' => $a->crmParent->email] : null,
                'assigned_conversations' => WhatsAppConversation::where('assigned_agent_id', $a->id)->count(),
                'open_conversations' => WhatsAppConversation::where('assigned_agent_id', $a->id)->whereNull('resolved_at')->count(),
                'messages_sent' => DB::table('crm_audit_logs')->where('actor_id', $a->id)->where('action', 'message_sent')->count(),
                'last_activity_at' => DB::table('crm_audit_logs')->where('actor_id', $a->id)->max('created_at'),
            ]),
            'pagination' => [
                'current_page' => $agents->currentPage(),
                'last_page' => $agents->lastPage(),
                'total' => $agents->total(),
            ],
        ]);
    }

    /**
     * Platform-wide audit log (who did what, where).
     */
    public function auditLogs(Request $request)
    {
        $this->requireAdmin();

        $query = DB::table('crm_audit_logs')->orderByDesc('id');

        if ($request->filled('customer_id')) {
            $query->where('owner_id', (int) $request->input('customer_id'));
        }
        if ($request->filled('action')) {
            $query->where('action', $request->input('action'));
        }
        if ($q = trim((string) $request->input('q'))) {
            $query->where('actor_name', 'like', "%{$q}%");
        }

        return response()->json([
            'success' => true,
            'logs' => $query->paginate(40),
            'actions' => DB::table('crm_audit_logs')->distinct()->pluck('action'),
        ]);
    }

    /**
     * Platform-wide login history for every CRM account.
     */
    public function loginHistory(Request $request)
    {
        $this->requireAdmin();

        $crmUserIds = User::whereIn('crm_role', ['owner', 'agent', 'admin'])->pluck('id');
        $crmEmails = User::whereIn('id', $crmUserIds)->pluck('email');

        $query = \App\Models\LoginHistory::whereIn('user_id', $crmUserIds)
            ->orWhereIn('attempted_email', $crmEmails)
            ->orderByDesc('login_at')->orderByDesc('id');

        if ($request->filled('success')) {
            $query->where('success', $request->input('success') === '1');
        }
        if ($q = trim((string) $request->input('q'))) {
            $query->where('attempted_email', 'like', "%{$q}%");
        }

        return response()->json([
            'success' => true,
            'logs' => $query->paginate(40),
            'failed_24h' => \App\Models\LoginHistory::whereIn('attempted_email', $crmEmails)
                ->where('success', false)->where('login_at', '>=', now()->subDay())->count(),
        ]);
    }

    /**
     * Per-day message activity for the last N days (dashboard chart).
     */
    public function messagesChart(Request $request)
    {
        $this->requireAdmin();
        $days = min(max((int) $request->input('days', 14), 7), 60);
        $from = now()->subDays($days - 1)->startOfDay();

        $rows = WhatsAppMessage::where('created_at', '>=', $from)
            ->selectRaw("DATE(created_at) as day, direction, COUNT(*) as total")
            ->groupBy('day', 'direction')
            ->get();

        $series = [];
        for ($i = 0; $i < $days; $i++) {
            $day = $from->copy()->addDays($i)->toDateString();
            $series[] = [
                'day' => $day,
                'incoming' => (int) $rows->where('day', $day)->where('direction', 'incoming')->sum('total'),
                'outgoing' => (int) $rows->where('day', $day)->where('direction', 'outgoing')->sum('total'),
            ];
        }

        return response()->json(['success' => true, 'series' => $series]);
    }
}
