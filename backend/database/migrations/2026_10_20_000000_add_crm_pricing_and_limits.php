<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
 
return new class extends Migration
{
    public function up(): void
    {
        // 1. Add category, agents_limit, and extra limits to plans
        Schema::table('plans', function (Blueprint $table) {
            if (!Schema::hasColumn('plans', 'category')) {
                $table->string('category', 32)->default('api')->after('slug'); // 'api' or 'crm'
            }
            if (!Schema::hasColumn('plans', 'agents_limit')) {
                $table->unsignedInteger('agents_limit')->default(1)->after('sessions_limit');
            }
            if (!Schema::hasColumn('plans', 'billing_period')) {
                $table->string('billing_period', 16)->nullable()->after('interval'); // 'monthly' | 'yearly' | 'lifetime'
            }
        });

        // 2. Add agents_limit and add-on counters to subscriptions
        Schema::table('subscriptions', function (Blueprint $table) {
            if (!Schema::hasColumn('subscriptions', 'agents_limit')) {
                $table->unsignedInteger('agents_limit')->default(1)->after('sessions_limit');
            }
            if (!Schema::hasColumn('subscriptions', 'extra_sessions')) {
                $table->unsignedInteger('extra_sessions')->default(0)->after('agents_limit');
            }
            if (!Schema::hasColumn('subscriptions', 'extra_agents')) {
                $table->unsignedInteger('extra_agents')->default(0)->after('extra_sessions');
            }
            if (!Schema::hasColumn('subscriptions', 'extra_messages')) {
                $table->unsignedBigInteger('extra_messages')->default(0)->after('extra_agents');
            }
        });

        // 3. Optional user-level override fields for owners (if assigned directly without a formal sub)
        Schema::table('users', function (Blueprint $table) {
            if (!Schema::hasColumn('users', 'crm_plan_id')) {
                $table->foreignId('crm_plan_id')->nullable()->after('crm_role')->constrained('plans')->nullOnDelete();
            }
            if (!Schema::hasColumn('users', 'crm_custom_agents_limit')) {
                $table->unsignedInteger('crm_custom_agents_limit')->nullable()->after('crm_plan_id');
            }
            if (!Schema::hasColumn('users', 'crm_custom_sessions_limit')) {
                $table->unsignedInteger('crm_custom_sessions_limit')->nullable()->after('crm_custom_agents_limit');
            }
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            if (Schema::hasColumn('users', 'crm_plan_id')) {
                $table->dropForeign(['crm_plan_id']);
                $table->dropColumn(['crm_plan_id', 'crm_custom_agents_limit', 'crm_custom_sessions_limit']);
            }
        });

        Schema::table('subscriptions', function (Blueprint $table) {
            $table->dropColumn(['agents_limit', 'extra_sessions', 'extra_agents', 'extra_messages']);
        });

        Schema::table('plans', function (Blueprint $table) {
            $table->dropColumn(['category', 'agents_limit', 'billing_period']);
        });
    }
};
