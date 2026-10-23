<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The "pulling chats" bar stayed alive forever: its liveness check used
 * last_activity_at, which EVERY incoming message webhook refreshes — so a
 * busy device with a progress stuck at 1% (WhatsApp never sends a final
 * progress field on full syncs) showed the bar indefinitely. This column
 * is bumped only when a real history-sync chunk arrives.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('whatsapp_sessions', function (Blueprint $table) {
            $table->timestamp('history_sync_last_chunk_at')->nullable()->after('history_synced_at');
        });
    }

    public function down(): void
    {
        Schema::table('whatsapp_sessions', function (Blueprint $table) {
            $table->dropColumn('history_sync_last_chunk_at');
        });
    }
};
