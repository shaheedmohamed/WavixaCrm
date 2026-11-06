<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('whatsapp_conversations', function (Blueprint $table) {
            // Group "past participants" (who left / was removed, ~60 days of
            // history) delivered inside history-sync chunks. JSON list of
            // {jid, leave_reason, leave_ts} — replaced wholesale per sync.
            $table->json('group_past_participants')->nullable()->after('transfer_count');
        });
    }

    public function down(): void
    {
        Schema::table('whatsapp_conversations', function (Blueprint $table) {
            $table->dropColumn('group_past_participants');
        });
    }
};
