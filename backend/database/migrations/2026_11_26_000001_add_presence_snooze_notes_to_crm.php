<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('whatsapp_conversations', function (Blueprint $table) {
            // Peer online state pushed via <presence> stanzas (engine webhook).
            $table->string('presence', 20)->nullable()->after('archived_at');
            $table->timestamp('last_seen_at')->nullable()->after('presence');
            // "ذكّرني لاحقاً" — chat is hidden from the normal tabs until this
            // passes, then it resurfaces on its own.
            $table->timestamp('snoozed_until')->nullable()->index()->after('last_seen_at');
            $table->unsignedBigInteger('snoozed_by')->nullable()->after('snoozed_until');
        });

        Schema::create('crm_conversation_notes', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('conversation_id');
            $table->unsignedBigInteger('user_id');
            $table->text('body');
            $table->timestamps();
            $table->index('conversation_id');
            $table->index('user_id');
        });

        Schema::table('crm_chat_lists', function (Blueprint $table) {
            $table->string('color', 20)->nullable()->after('name');
        });
    }

    public function down(): void
    {
        Schema::table('whatsapp_conversations', function (Blueprint $table) {
            $table->dropIndex(['snoozed_until']);
            $table->dropColumn(['presence', 'last_seen_at', 'snoozed_until', 'snoozed_by']);
        });
        Schema::dropIfExists('crm_conversation_notes');
        Schema::table('crm_chat_lists', function (Blueprint $table) {
            $table->dropColumn('color');
        });
    }
};
