<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * WhatsApp does not send a `progress` field on full/recent history-sync
 * chunks — only on single-chat ON_DEMAND pulls (always 100). The progress
 * bar therefore sat at 1% then jumped to 100%. These counters accumulate
 * the real number of conversations/messages imported so the UI can show
 * truthful, moving values.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('whatsapp_sessions', function (Blueprint $table) {
            $table->unsignedInteger('history_synced_conversations')->default(0)->after('history_sync_progress');
            $table->unsignedInteger('history_synced_messages')->default(0)->after('history_synced_conversations');
            // Correlates chunks belonging to one on-demand sync run — a new
            // id resets the counters above.
            $table->string('history_sync_request_id')->nullable()->after('history_synced_messages');
        });
    }

    public function down(): void
    {
        Schema::table('whatsapp_sessions', function (Blueprint $table) {
            $table->dropColumn(['history_synced_conversations', 'history_synced_messages', 'history_sync_request_id']);
        });
    }
};
