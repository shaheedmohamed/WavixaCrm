<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('whatsapp_messages', function (Blueprint $table) {
            // contextInfo.mentionedJid — full JIDs behind the "@digits" tokens
            // in the body, so the CRM can resolve mentions to names.
            $table->json('mentioned_jids')->nullable()->after('reactions');
        });
    }

    public function down(): void
    {
        Schema::table('whatsapp_messages', function (Blueprint $table) {
            $table->dropColumn('mentioned_jids');
        });
    }
};
