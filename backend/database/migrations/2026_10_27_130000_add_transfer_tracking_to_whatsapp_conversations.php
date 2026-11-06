<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('whatsapp_conversations', function (Blueprint $table) {
            // Agent-to-agent handoff trail: who pushed the chat to the current
            // holder and when — the "محولة من …" badge + transfer stats.
            $table->unsignedBigInteger('transferred_by')->nullable()->index()->after('rating_note');
            $table->timestamp('transferred_at')->nullable()->after('transferred_by');
            $table->unsignedInteger('transfer_count')->default(0)->after('transferred_at');
            // Seconds between claim/assignment and resolve — feeds the
            // avg handle-time column in the team performance report.
            $table->unsignedInteger('handle_seconds')->nullable()->after('transfer_count');
            // Composite lookup used by the per-agent active-chats cap:
            // WHERE assigned_agent_id = ? AND resolved_at IS NULL
            $table->index(['assigned_agent_id', 'resolved_at'], 'wa_conv_agent_open_idx');
        });
    }

    public function down(): void
    {
        Schema::table('whatsapp_conversations', function (Blueprint $table) {
            $table->dropIndex('wa_conv_agent_open_idx');
            $table->dropColumn([
                'transferred_by',
                'transferred_at',
                'transfer_count',
                'handle_seconds',
            ]);
        });
    }
};
