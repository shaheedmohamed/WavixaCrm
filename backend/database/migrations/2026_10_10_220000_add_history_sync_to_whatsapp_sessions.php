<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('whatsapp_sessions', function (Blueprint $table) {
            $table->unsignedTinyInteger('history_sync_progress')->default(0)->after('last_activity_at');
            $table->timestamp('history_synced_at')->nullable()->after('history_sync_progress');
        });
    }

    public function down(): void
    {
        Schema::table('whatsapp_sessions', function (Blueprint $table) {
            $table->dropColumn(['history_sync_progress', 'history_synced_at']);
        });
    }
};
