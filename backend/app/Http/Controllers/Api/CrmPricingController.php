<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Invoice;
use App\Models\Plan;
use App\Models\Subscription;
use App\Models\Transaction;
use App\Models\User;
use App\Services\CrmSubscriptionService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class CrmPricingController extends Controller
{
    protected CrmSubscriptionService $subscriptionService;

    public function __construct(CrmSubscriptionService $subscriptionService)
    {
        $this->subscriptionService = $subscriptionService;
    }

    /**
     * Public / Authenticated catalog of CRM plans, Add-ons and active user plan if logged in.
     */
    public function index(Request $request)
    {
        $plans = Plan::where('category', 'crm')
            ->where('is_active', true)
            ->orderBy('sort_order')
            ->get();

        // Separate monthly and yearly for clean presentation
        $monthlyPlans = $plans->where('billing_period', 'monthly')->values();
        $yearlyPlans = $plans->where('billing_period', 'yearly')->values();

        $user = Auth::guard('sanctum')->user() ?: $request->user();
        $userLimits = null;
        if ($user) {
            $owner = $this->subscriptionService->resolveOwner($user);
            $userLimits = $this->subscriptionService->getOwnerCrmLimits($owner);
        }

        return response()->json([
            'success' => true,
            'plans' => $plans,
            'monthly_plans' => $monthlyPlans,
            'yearly_plans' => $yearlyPlans,
            'addons' => CrmSubscriptionService::ADDONS,
            'sales_contact' => [
                'whatsapp' => '+201024520482',
                'whatsapp_display' => '01024520482',
                'whatsapp_url' => 'https://wa.me/201024520482',
                'support_email' => 'support@wavixa.net',
            ],
            'current_user_subscription' => $userLimits,
        ]);
    }

    /**
     * Smart interactive quote calculator
     */
    public function calculate(Request $request)
    {
        $request->validate([
            'devices' => 'required|integer|min:1|max:1000',
            'agents' => 'required|integer|min:1|max:1000',
            'messages' => 'required|integer|min:0|max:10000000',
            'billing' => 'nullable|string|in:monthly,yearly',
        ]);

        $devices = (int) $request->input('devices', 1);
        $agents = (int) $request->input('agents', 2);
        $messages = (int) $request->input('messages', 5000);
        $billing = $request->input('billing', 'monthly');

        $quote = $this->subscriptionService->calculateQuote($devices, $agents, $messages, $billing);

        return response()->json([
            'success' => true,
            'quote' => $quote,
        ]);
    }

    /**
     * Subscribe / Upgrade current CRM owner to a CRM plan
     */
    public function subscribe(Request $request)
    {
        $user = $request->user();
        if (!$user) {
            return response()->json(['success' => false, 'message' => 'غير مصرح'], 401);
        }

        $owner = $this->subscriptionService->resolveOwner($user);
        if ($user->crm_role === 'agent') {
            return response()->json(['success' => false, 'message' => 'الترقية متاحة فقط لمدير الحساب (Owner)'], 403);
        }

        $request->validate([
            'plan_slug' => 'required|string|exists:plans,slug',
            'payment_method' => 'nullable|string',
        ]);

        $plan = Plan::where('slug', $request->plan_slug)->firstOrFail();

        if ($plan->category !== 'crm') {
            return response()->json(['success' => false, 'message' => 'هذه الباقة ليست ضمن باقات الـ CRM'], 422);
        }

        if (!empty($plan->metadata['contact_sales'])) {
            return response()->json([
                'success' => false,
                'message' => 'هذه الباقة تتطلب التواصل مع فريق المبيعات لتخصيص الخوادم والاتفاقية',
                'contact_url' => 'https://wa.me/201024520482',
            ], 422);
        }

        $sub = DB::transaction(function () use ($owner, $plan, $request) {
            // Expire any existing active subscriptions
            Subscription::where('user_id', $owner->id)
                ->where('status', Subscription::STATUS_ACTIVE)
                ->update([
                    'status' => Subscription::STATUS_EXPIRED,
                    'cancelled_at' => now(),
                ]);

            $isYearly = $plan->interval === Plan::INTERVAL_YEAR || $plan->billing_period === 'yearly';
            $endsAt = $isYearly ? now()->addYear() : now()->addMonth();

            $subscription = Subscription::create([
                'user_id' => $owner->id,
                'plan_id' => $plan->id,
                'status' => Subscription::STATUS_ACTIVE,
                'messages_limit' => $plan->messages_limit,
                'sessions_limit' => $plan->sessions_limit,
                'agents_limit' => $plan->agents_limit,
                'extra_sessions' => 0,
                'extra_agents' => 0,
                'extra_messages' => 0,
                'messages_used' => 0,
                'messages_remaining' => $plan->messages_limit,
                'starts_at' => now(),
                'ends_at' => $endsAt,
                'renews_at' => $endsAt,
                'payment_method' => $request->payment_method ?: 'demo_checkout',
            ]);

            $owner->update([
                'crm_plan_id' => $plan->id,
                'subscription_plan' => $plan->slug,
                'subscription_status' => Subscription::STATUS_ACTIVE,
            ]);

            // Record transaction
            $transaction = Transaction::create([
                'user_id' => $owner->id,
                'subscription_id' => $subscription->id,
                'plan_id' => $plan->id,
                'type' => Transaction::TYPE_SUBSCRIPTION,
                'amount' => $plan->price,
                'currency' => $plan->currency,
                'status' => Transaction::STATUS_COMPLETED,
                'payment_method' => $request->payment_method ?: 'demo_checkout',
                'description' => "CRM Plan Subscription: {$plan->name}",
            ]);

            Invoice::create([
                'user_id' => $owner->id,
                'subscription_id' => $subscription->id,
                'transaction_id' => $transaction->id,
                'invoice_number' => Invoice::generateNumber(),
                'amount' => $plan->price,
                'currency' => $plan->currency,
                'status' => Invoice::STATUS_PAID,
                'due_date' => now(),
                'paid_at' => now(),
                'items' => [
                    [
                        'description' => $plan->name,
                        'quantity' => 1,
                        'amount' => $plan->price,
                    ],
                ],
                'notes' => 'Wavixa CRM Subscription',
            ]);

            return $subscription;
        });

        $limits = $this->subscriptionService->getOwnerCrmLimits($owner);

        return response()->json([
            'success' => true,
            'message' => "تم تفعيل باقة {$plan->name} بنجاح!",
            'subscription' => $sub,
            'limits' => $limits,
        ]);
    }

    /**
     * Add-on purchase: add extra device, extra agent, or extra messages pack
     */
    public function purchaseAddon(Request $request)
    {
        $user = $request->user();
        if (!$user) {
            return response()->json(['success' => false, 'message' => 'غير مصرح'], 401);
        }

        $owner = $this->subscriptionService->resolveOwner($user);
        if ($user->crm_role === 'agent') {
            return response()->json(['success' => false, 'message' => 'شراء الإضافات متاح فقط لمدير الحساب (Owner)'], 403);
        }

        $request->validate([
            'addon_type' => 'required|string|in:extra_device,extra_agent,extra_messages',
            'quantity' => 'nullable|integer|min:1|max:100',
            'message_tier' => 'nullable|string|in:tier_1k,tier_10k,tier_50k',
        ]);

        $sub = Subscription::forUser($owner->id)->active()->latest('starts_at')->first();
        if (!$sub) {
            // Auto create an active starter sub if none exists
            $starter = Plan::where('slug', 'crm-starter')->first();
            $sub = Subscription::create([
                'user_id' => $owner->id,
                'plan_id' => $starter?->id,
                'status' => Subscription::STATUS_ACTIVE,
                'messages_limit' => $starter?->messages_limit ?? 5000,
                'sessions_limit' => $starter?->sessions_limit ?? 1,
                'agents_limit' => $starter?->agents_limit ?? 2,
                'messages_used' => 0,
                'messages_remaining' => 5000,
                'starts_at' => now(),
                'ends_at' => now()->addMonth(),
            ]);
        }

        $type = $request->addon_type;
        $qty = (int) ($request->quantity ?: 1);
        $cost = 0;
        $desc = '';

        if ($type === 'extra_device') {
            $cost = CrmSubscriptionService::ADDONS['extra_device']['monthly_price'] * $qty;
            $sub->increment('extra_sessions', $qty);
            $desc = "إضافة {$qty} جهاز واتساب إضافي";
        } elseif ($type === 'extra_agent') {
            $cost = CrmSubscriptionService::ADDONS['extra_agent']['monthly_price'] * $qty;
            $sub->increment('extra_agents', $qty);
            $desc = "إضافة {$qty} وكيل خدمة عملاء إضافي";
        } elseif ($type === 'extra_messages') {
            $tierKey = $request->message_tier ?: 'tier_1k';
            $tier = CrmSubscriptionService::ADDONS['extra_messages'][$tierKey] ?? CrmSubscriptionService::ADDONS['extra_messages']['tier_1k'];
            $messagesToAdd = $tier['messages'] * $qty;
            $cost = $tier['price'] * $qty;
            $sub->increment('extra_messages', $messagesToAdd);
            $sub->increment('messages_remaining', $messagesToAdd);
            $desc = "شحن رصيد إضافي " . number_format($messagesToAdd) . " رسالة";
        }

        // Record transaction
        Transaction::create([
            'user_id' => $owner->id,
            'subscription_id' => $sub->id,
            'plan_id' => $sub->plan_id,
            'type' => Transaction::TYPE_TOPUP,
            'amount' => $cost,
            'currency' => 'USD',
            'status' => Transaction::STATUS_COMPLETED,
            'payment_method' => 'addon_checkout',
            'description' => "Wavixa CRM Addon: {$desc}",
        ]);

        $limits = $this->subscriptionService->getOwnerCrmLimits($owner);

        return response()->json([
            'success' => true,
            'message' => "تمت إضافة {$desc} بنجاح!",
            'limits' => $limits,
        ]);
    }
}
