<?php

namespace App\Services;

use App\Models\Plan;
use App\Models\Subscription;
use App\Models\User;
use App\Models\WhatsAppMessage;
use App\Models\WhatsAppSession;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;

class CrmSubscriptionService
{
    /**
     * Pricing and Add-on configuration (single source of truth for the entire platform).
     */
    public const ADDONS = [
        'extra_device' => [
            'name_ar' => 'جهاز واتساب إضافي',
            'name_en' => 'Extra WhatsApp Device',
            'monthly_price' => 12.00,
            'yearly_price' => 120.00, // Same 10-month discount ($12 * 10)
            'unit' => 'device',
        ],
        'extra_agent' => [
            'name_ar' => 'وكيل إضافي',
            'name_en' => 'Extra Agent',
            'monthly_price' => 8.00,
            'yearly_price' => 80.00, // Same 10-month discount ($8 * 10)
            'unit' => 'agent',
        ],
        'extra_messages' => [
            'tier_1k' => [
                'messages' => 1000,
                'price' => 5.00,
                'label_ar' => '1,000 رسالة',
                'label_en' => '1,000 Messages',
            ],
            'tier_10k' => [
                'messages' => 10000,
                'price' => 40.00, // ~20% volume discount
                'label_ar' => '10,000 رسالة',
                'label_en' => '10,000 Messages',
                'discount' => '20%',
            ],
            'tier_50k' => [
                'messages' => 50000,
                'price' => 175.00, // ~30% volume discount
                'label_ar' => '50,000 رسالة',
                'label_en' => '50,000 Messages',
                'discount' => '30%',
            ],
        ],
    ];

    /**
     * Resolve the owner user for CRM limits check.
     */
    public function resolveOwner(User $user): User
    {
        if ($user->crm_role === 'agent' && $user->crm_parent_id) {
            return User::find($user->crm_parent_id) ?: $user;
        }
        return $user;
    }

    /**
     * Get active CRM subscription or custom override limits for an owner.
     */
    public function getOwnerCrmLimits(User $owner): array
    {
        // 1. Platform admin or users without CRM role restriction (bypass limits)
        if ($owner->is_admin) {
            return [
                'plan_name' => 'Unlimited (Admin)',
                'plan_slug' => 'admin-unlimited',
                'tier' => 'admin',
                'status' => 'active',
                'billing_period' => 'unlimited',
                'is_admin_bypass' => true,
                'devices_limit' => 999999,
                'devices_used' => WhatsAppSession::where('user_id', $owner->id)->count(),
                'devices_remaining' => 999999,
                'can_add_device' => true,
                'agents_limit' => 999999,
                'agents_used' => User::where('crm_parent_id', $owner->id)->count(),
                'agents_remaining' => 999999,
                'can_add_agent' => true,
                'monthly_messages_limit' => 999999999,
                'messages_used_this_month' => 0,
                'messages_remaining_this_month' => 999999999,
                'can_send_message' => true,
                'expires_at' => null,
            ];
        }

        // 2. Active Subscription (prefer CRM category plan, or fallback to any active subscription)
        $subscription = Subscription::forUser($owner->id)
            ->active()
            ->with('plan')
            ->latest('starts_at')
            ->first();

        // 3. Fallback plan if user has crm_plan_id set directly
        $plan = $subscription?->plan;
        if (!$plan && $owner->crm_plan_id) {
            $plan = Plan::find($owner->crm_plan_id);
        }

        // 4. Default to Starter CRM if no plan configured
        $baseDevicesLimit = $plan?->sessions_limit ?? 1;
        $baseAgentsLimit = $plan?->agents_limit ?? 2;
        $baseMessagesLimit = $plan?->messages_limit ?? 5000;

        // Custom manual overrides on the user record (for custom contracts / special deals)
        if ($owner->crm_custom_sessions_limit !== null) {
            $baseDevicesLimit = (int) $owner->crm_custom_sessions_limit;
        }
        if ($owner->crm_custom_agents_limit !== null) {
            $baseAgentsLimit = (int) $owner->crm_custom_agents_limit;
        }

        // Add-ons added on top of active subscription
        $extraSessions = (int) ($subscription?->extra_sessions ?? 0);
        $extraAgents = (int) ($subscription?->extra_agents ?? 0);
        $extraMessages = (int) ($subscription?->extra_messages ?? 0);

        $totalDevicesLimit = $baseDevicesLimit + $extraSessions;
        $totalAgentsLimit = $baseAgentsLimit + $extraAgents;
        $totalMonthlyMessagesLimit = $baseMessagesLimit + $extraMessages;

        // Current usages
        $devicesUsed = WhatsAppSession::where('user_id', $owner->id)->count();
        $agentsUsed = User::where('crm_parent_id', $owner->id)->count();

        // Count messages sent in current calendar month
        $startOfMonth = Carbon::now()->startOfMonth();
        $endOfMonth = Carbon::now()->endOfMonth();

        $ownerSessions = WhatsAppSession::where('user_id', $owner->id)->pluck('id');
        $messagesUsedThisMonth = WhatsAppMessage::whereIn('session_id', $ownerSessions)
            ->where('direction', 'outgoing')
            ->whereBetween('created_at', [$startOfMonth, $endOfMonth])
            ->count();

        // Check if subscription has expired/cancelled
        $hasActiveSub = $subscription ? $subscription->isActive() : true; // if no sub row, owner uses default free starter
        $status = $subscription?->status ?? 'active';

        $devicesRemaining = max(0, $totalDevicesLimit - $devicesUsed);
        $agentsRemaining = max(0, $totalAgentsLimit - $agentsUsed);
        $messagesRemaining = max(0, $totalMonthlyMessagesLimit - $messagesUsedThisMonth);

        return [
            'plan_name' => $plan?->name ?? 'Starter CRM (تجريبي)',
            'plan_slug' => $plan?->slug ?? 'crm-starter',
            'tier' => $plan?->metadata['tier'] ?? 'starter',
            'status' => $status,
            'is_active' => $hasActiveSub,
            'billing_period' => $plan?->billing_period ?? ($plan?->interval === 'year' ? 'yearly' : 'monthly'),
            'is_admin_bypass' => false,
            'devices_limit' => $totalDevicesLimit,
            'devices_base' => $baseDevicesLimit,
            'devices_extra' => $extraSessions,
            'devices_used' => $devicesUsed,
            'devices_remaining' => $devicesRemaining,
            'can_add_device' => $hasActiveSub && $devicesUsed < $totalDevicesLimit,
            'agents_limit' => $totalAgentsLimit,
            'agents_base' => $baseAgentsLimit,
            'agents_extra' => $extraAgents,
            'agents_used' => $agentsUsed,
            'agents_remaining' => $agentsRemaining,
            'can_add_agent' => $hasActiveSub && $agentsUsed < $totalAgentsLimit,
            'monthly_messages_limit' => $totalMonthlyMessagesLimit,
            'messages_base' => $baseMessagesLimit,
            'messages_extra' => $extraMessages,
            'messages_used_this_month' => $messagesUsedThisMonth,
            'messages_remaining_this_month' => $messagesRemaining,
            'can_send_message' => $hasActiveSub && ($totalMonthlyMessagesLimit >= 1000000000 || $messagesUsedThisMonth < $totalMonthlyMessagesLimit),
            'starts_at' => $subscription?->starts_at?->toIso8601String(),
            'ends_at' => $subscription?->ends_at?->toIso8601String(),
            'renews_at' => $subscription?->renews_at?->toIso8601String(),
        ];
    }

    /**
     * Enforce device limit before connecting a new WhatsApp session.
     * Throws an exception with a user-friendly localized message if limit exceeded.
     */
    public function assertCanAddDevice(User $owner): void
    {
        $limits = $this->getOwnerCrmLimits($owner);
        if (!$limits['can_add_device']) {
            $msg = "لقد وصلت إلى الحد الأقصى للأجهزة في باقتك الحالية ({$limits['devices_used']}/{$limits['devices_limit']}). يرجى ترقية باقتك أو شراء جهاز إضافي ($12/شهر).";
            throw new \RuntimeException($msg, 403);
        }
    }

    /**
     * Enforce agents limit before creating a new customer service agent.
     */
    public function assertCanAddAgent(User $owner): void
    {
        $limits = $this->getOwnerCrmLimits($owner);
        if (!$limits['can_add_agent']) {
            $msg = "لقد وصلت إلى الحد الأقصى للوكلاء في باقتك الحالية ({$limits['agents_used']}/{$limits['agents_limit']}). يرجى ترقية باقتك أو شراء وكيل إضافي ($8/شهر).";
            throw new \RuntimeException($msg, 403);
        }
    }

    /**
     * Enforce monthly message quota before sending a message.
     */
    public function assertCanSendMessage(User $owner): void
    {
        $limits = $this->getOwnerCrmLimits($owner);
        if (!$limits['can_send_message']) {
            $msg = "لقد استنفدت رصيد الرسائل الشهري لباقة CRM ({$limits['messages_used_this_month']}/{$limits['monthly_messages_limit']}). يمكنك شحن رصيد رسائل إضافي لمتابعة المحادثات.";
            throw new \RuntimeException($msg, 403);
        }
    }

    /**
     * Smart Pricing Calculator: finds the optimal plan + add-ons combination.
     * Evaluates all tiers and returns the lowest total cost option and alternatives.
     *
     * Example input: devices=2, agents=10, messages=20000, billing='monthly'
     * Growth ($79) + 5 extra agents ($40) = $119 / month (Best option)
     */
    public function calculateQuote(int $devices, int $agents, int $messages, string $billing = 'monthly'): array
    {
        $devices = max(1, $devices);
        $agents = max(1, $agents);
        $messages = max(0, $messages);
        $isYearly = $billing === 'yearly';

        // Candidate base tiers for CRM
        $tiers = [
            'starter' => [
                'slug' => $isYearly ? 'crm-starter-yearly' : 'crm-starter',
                'name' => 'Starter',
                'base_price' => $isYearly ? 290.00 : 29.00,
                'devices' => 1,
                'agents' => 2,
                'messages' => 5000,
            ],
            'growth' => [
                'slug' => $isYearly ? 'crm-growth-yearly' : 'crm-growth',
                'name' => 'Growth',
                'base_price' => $isYearly ? 790.00 : 79.00,
                'devices' => 3,
                'agents' => 5,
                'messages' => 20000,
            ],
            'business' => [
                'slug' => $isYearly ? 'crm-business-yearly' : 'crm-business',
                'name' => 'Business',
                'base_price' => $isYearly ? 1490.00 : 149.00,
                'devices' => 10,
                'agents' => 15,
                'messages' => 60000,
            ],
        ];

        // Add-on unit costs
        $extraDeviceUnit = $isYearly ? self::ADDONS['extra_device']['yearly_price'] : self::ADDONS['extra_device']['monthly_price'];
        $extraAgentUnit = $isYearly ? self::ADDONS['extra_agent']['yearly_price'] : self::ADDONS['extra_agent']['monthly_price'];

        $quotes = [];

        foreach ($tiers as $tierKey => $tier) {
            // Devices calculation
            $neededDevices = max(0, $devices - $tier['devices']);
            $devicesAddonCost = $neededDevices * $extraDeviceUnit;

            // Agents calculation
            $neededAgents = max(0, $agents - $tier['agents']);
            $agentsAddonCost = $neededAgents * $extraAgentUnit;

            // Messages calculation using optimal message bundles
            $neededMessages = max(0, $messages - $tier['messages']);
            $messagesBundle = $this->calculateOptimalMessageBundleCost($neededMessages, $isYearly);

            $totalCost = $tier['base_price'] + $devicesAddonCost + $agentsAddonCost + $messagesBundle['total_cost'];

            $monthlyEquivalent = $isYearly ? round($totalCost / 12, 2) : $totalCost;

            $quotes[] = [
                'tier_key' => $tierKey,
                'tier_name' => $tier['name'],
                'plan_slug' => $tier['slug'],
                'base_price' => $tier['base_price'],
                'is_yearly' => $isYearly,
                'billing' => $billing,
                'included' => [
                    'devices' => $tier['devices'],
                    'agents' => $tier['agents'],
                    'messages' => $tier['messages'],
                ],
                'addons' => [
                    'devices' => [
                        'count' => $neededDevices,
                        'unit_price' => $extraDeviceUnit,
                        'total' => $devicesAddonCost,
                    ],
                    'agents' => [
                        'count' => $neededAgents,
                        'unit_price' => $extraAgentUnit,
                        'total' => $agentsAddonCost,
                    ],
                    'messages' => [
                        'needed' => $neededMessages,
                        'bundles' => $messagesBundle['bundles'],
                        'total' => $messagesBundle['total_cost'],
                    ],
                ],
                'total_cost' => round($totalCost, 2),
                'monthly_equivalent' => $monthlyEquivalent,
                'savings_vs_monthly' => $isYearly ? round(($totalCost / 10 * 12) - $totalCost, 2) : 0,
            ];
        }

        // Sort by total cost ascending to highlight the most optimal recommendation
        usort($quotes, fn ($a, $b) => $a['total_cost'] <=> $b['total_cost']);

        $best = $quotes[0];
        $runnerUp = $quotes[1] ?? null;

        return [
            'input' => [
                'devices' => $devices,
                'agents' => $agents,
                'messages' => $messages,
                'billing' => $billing,
            ],
            'best_recommendation' => $best,
            'runner_up' => $runnerUp,
            'all_options' => $quotes,
            'is_enterprise_territory' => $devices > 20 || $agents > 30 || $messages > 150000,
        ];
    }

    /**
     * Compute cheapest message credit packs for any excess message volume.
     * Uses greedy integer linear selection across 50k, 10k, 1k packs.
     */
    protected function calculateOptimalMessageBundleCost(int $neededMessages, bool $isYearly = false): array
    {
        if ($neededMessages <= 0) {
            return ['total_cost' => 0.0, 'bundles' => []];
        }

        // If yearly, user needs messages over 12 months, or we consider monthly excess
        // Default standard: calculate monthly excess message pack needed
        $pack50k = self::ADDONS['extra_messages']['tier_50k']['price']; // 175
        $pack10k = self::ADDONS['extra_messages']['tier_10k']['price']; // 40
        $pack1k = self::ADDONS['extra_messages']['tier_1k']['price'];   // 5

        $remaining = $neededMessages;
        $count50k = intdiv($remaining, 50000);
        $remaining %= 50000;

        $count10k = intdiv($remaining, 10000);
        $remaining %= 10000;

        $count1k = (int) ceil($remaining / 1000);

        // Check if upgrading to the next higher bundle is cheaper
        // e.g. 8 x 1k = $40, which is identical to 10k ($40)
        if ($count1k * $pack1k >= $pack10k) {
            $count10k++;
            $count1k = 0;
        }

        if ($count10k * $pack10k >= $pack50k) {
            $count50k++;
            $count10k = 0;
        }

        $monthlyCost = ($count50k * $pack50k) + ($count10k * $pack10k) + ($count1k * $pack1k);
        $totalCost = $isYearly ? ($monthlyCost * 10) : $monthlyCost; // 10 months annual multiplier for consistency

        $bundles = [];
        if ($count50k > 0) {
            $bundles[] = ['size' => 50000, 'count' => $count50k, 'cost' => $count50k * $pack50k];
        }
        if ($count10k > 0) {
            $bundles[] = ['size' => 10000, 'count' => $count10k, 'cost' => $count10k * $pack10k];
        }
        if ($count1k > 0) {
            $bundles[] = ['size' => 1000, 'count' => $count1k, 'cost' => $count1k * $pack1k];
        }

        return [
            'total_cost' => round($totalCost, 2),
            'monthly_cost' => round($monthlyCost, 2),
            'bundles' => $bundles,
        ];
    }
}
