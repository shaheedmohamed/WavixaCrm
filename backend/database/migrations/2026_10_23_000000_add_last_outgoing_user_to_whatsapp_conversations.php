<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('whatsapp_conversations', function (Blueprint $table) {
            if (!Schema::hasColumn('whatsapp_conversations', 'last_outgoing_user_id')) {
                $table->foreignId('last_outgoing_user_id')
                    ->nullable()
                    ->after('assigned_at')
                    ->constrained('users')
                    ->nullOnDelete();
            }
        });
    }

    public function down(): void
    {
        Schema::table('whatsapp_conversations', function (Blueprint $table) {
            if (Schema::hasColumn('whatsapp_conversations', 'last_outgoing_user_id')) {
                $table->dropForeign(['last_outgoing_user_id']);
                $table->dropColumn('last_outgoing_user_id');
            }
        });
    }
};
