<?php

namespace Tests\Feature;

use App\Models\Plan;
use App\Models\Subscription;
use App\Models\User;
use App\Models\WhatsAppSession;
use App\Services\CrmSubscriptionService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\TestCase;

class CrmPricingAndLimitsTest extends TestCase
{
    use DatabaseTransactions;

    protected CrmSubscriptionService $service;

    protected function setUp(): void
    {
        parent::setUp();
        $this->service = app(CrmSubscriptionService::class);
    }

    /**
     * Requirement 4: Test case specified by user:
     * 2 WhatsApp devices, 10 agents, 20,000 monthly messages.
     * Optimal recommendation must be: Growth plan ($79) + 5 extra agents ($40) = $119/month, or $1,190/year.
     */
    public function test_calculator_recommends_growth_with_addons_for_ten_agents(): void
    {
        $quote = $this->service->calculateQuote(2, 10, 20000, 'monthly');

        $best = $quote['best_recommendation'];
        $this->assertEquals('growth', $best['tier_key']);
        $this->assertEquals(79, $best['base_price']);
        $this->assertEquals(0, $best['addons']['devices']['count']); // Growth includes 3 devices, 2 needed
        $this->assertEquals(5, $best['addons']['agents']['count']);  // Growth includes 5 agents, 10 needed -> +5 agents
        $this->assertEquals(40, $best['addons']['agents']['total']); // 5 * $8 = $40
        $this->assertEquals(0, $best['addons']['messages']['total']);// Growth includes 20k messages
        $this->assertEquals(119, $best['total_cost']);

        // Yearly calculation check: 10 months multiplier = $1,190
        $yearlyQuote = $this->service->calculateQuote(2, 10, 20000, 'yearly');
        $this->assertEquals(1190, $yearlyQuote['best_recommendation']['total_cost']);
    }

    /**
     * Test case: A customer who naturally needs Business tier (e.g. 10 devices, 15 agents, 60,000 messages)
     */
    public function test_calculator_recommends_business_tier_when_appropriate(): void
    {
        $quote = $this->service->calculateQuote(10, 15, 60000, 'monthly');
        $best = $quote['best_recommendation'];

        $this->assertEquals('business', $best['tier_key']);
        $this->assertEquals(149, $best['total_cost']);
        $this->assertEquals(0, $best['addons']['devices']['count']);
        $this->assertEquals(0, $best['addons']['agents']['count']);
        $this->assertEquals(0, $best['addons']['messages']['total']);
    }

    /**
     * Requirement 5: Test device limit enforcement
     */
    public function test_device_limit_enforcement_blocks_extra_devices(): void
    {
        $starterPlan = Plan::where('slug', 'crm-starter')->first();

        /** @var User $owner */
        $owner = User::factory()->create([
            'email' => 'starter-test-' . uniqid() . '@example.com',
            'crm_role' => 'owner',
            'crm_plan_id' => $starterPlan?->id,
        ]);

        Subscription::create([
            'user_id' => $owner->id,
            'plan_id' => $starterPlan->id,
            'status' => Subscription::STATUS_ACTIVE,
            'messages_limit' => 5000,
            'sessions_limit' => 1,
            'agents_limit' => 2,
            'messages_used' => 0,
            'messages_remaining' => 5000,
            'starts_at' => now(),
            'ends_at' => now()->addMonth(),
        ]);

        // Connect first device (allowed)
        WhatsAppSession::create([
            'user_id' => $owner->id,
            'session_token' => 'test_token_' . uniqid(),
            'device_name' => 'Device 1',
            'status' => 'connected',
        ]);

        // Attempting to add 2nd device without addon/upgrade must throw 403
        $this->expectException(\RuntimeException::class);
        $this->service->assertCanAddDevice($owner);
    }

    /**
     * Requirement 5: Test agent limit enforcement
     */
    public function test_agent_limit_enforcement_blocks_extra_agents(): void
    {
        $starterPlan = Plan::where('slug', 'crm-starter')->first();

        /** @var User $owner */
        $owner = User::factory()->create([
            'email' => 'starter-agent-test-' . uniqid() . '@example.com',
            'crm_role' => 'owner',
            'crm_plan_id' => $starterPlan?->id,
        ]);

        Subscription::create([
            'user_id' => $owner->id,
            'plan_id' => $starterPlan->id,
            'status' => Subscription::STATUS_ACTIVE,
            'messages_limit' => 5000,
            'sessions_limit' => 1,
            'agents_limit' => 2,
            'messages_used' => 0,
            'messages_remaining' => 5000,
            'starts_at' => now(),
            'ends_at' => now()->addMonth(),
        ]);

        // Create 2 agents (allowed)
        User::factory()->create([
            'email' => 'agent1-' . uniqid() . '@example.com',
            'crm_role' => 'agent',
            'crm_parent_id' => $owner->id,
        ]);
        User::factory()->create([
            'email' => 'agent2-' . uniqid() . '@example.com',
            'crm_role' => 'agent',
            'crm_parent_id' => $owner->id,
        ]);

        // 3rd agent must throw exception
        $this->expectException(\RuntimeException::class);
        $this->service->assertCanAddAgent($owner);
    }

    /**
     * Requirement 5: Upgrade recalculates limits properly
     */
    public function test_upgrade_plan_recalculates_limits(): void
    {
        $starterPlan = Plan::where('slug', 'crm-starter')->first();
        $growthPlan = Plan::where('slug', 'crm-growth')->first();

        /** @var User $owner */
        $owner = User::factory()->create([
            'email' => 'upgrade-test-' . uniqid() . '@example.com',
            'crm_role' => 'owner',
            'crm_plan_id' => $starterPlan?->id,
        ]);

        $sub = Subscription::create([
            'user_id' => $owner->id,
            'plan_id' => $starterPlan->id,
            'status' => Subscription::STATUS_ACTIVE,
            'messages_limit' => 5000,
            'sessions_limit' => 1,
            'agents_limit' => 2,
            'messages_used' => 0,
            'messages_remaining' => 5000,
            'starts_at' => now(),
            'ends_at' => now()->addMonth(),
        ]);

        $limitsBefore = $this->service->getOwnerCrmLimits($owner);
        $this->assertEquals(1, $limitsBefore['devices_limit']);
        $this->assertEquals(2, $limitsBefore['agents_limit']);

        // Upgrade subscription to Growth
        $sub->update([
            'plan_id' => $growthPlan->id,
            'sessions_limit' => 3,
            'agents_limit' => 5,
            'messages_limit' => 20000,
        ]);
        $owner->update(['crm_plan_id' => $growthPlan->id]);

        $limitsAfter = $this->service->getOwnerCrmLimits($owner);
        $this->assertEquals(3, $limitsAfter['devices_limit']);
        $this->assertEquals(5, $limitsAfter['agents_limit']);
        $this->assertEquals(20000, $limitsAfter['monthly_messages_limit']);
    }

    /**
     * Requirement: Public CRM plans API works and returns both monthly and yearly
     */
    public function test_crm_plans_api_endpoint(): void
    {
        $response = $this->getJson('/api/crm/plans');
        $response->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonStructure([
                'success',
                'plans',
                'monthly_plans',
                'yearly_plans',
                'addons',
                'sales_contact',
            ]);
    }
}
