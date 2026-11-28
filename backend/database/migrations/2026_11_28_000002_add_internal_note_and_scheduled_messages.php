<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('whatsapp_messages', function (Blueprint $table) {
            $table->text('internal_note')->nullable()->after('payload');
            $table->string('internal_note_by', 120)->nullable()->after('internal_note');
        });

        Schema::create('crm_scheduled_messages', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('user_id')->index();      // agent who scheduled
            $table->unsignedBigInteger('conversation_id')->index();
            $table->text('body');
            $table->timestamp('send_at')->index();
            $table->string('status', 20)->default('pending')->index(); // pending|sent|canceled|failed
            $table->unsignedBigInteger('sent_message_id')->nullable();
            $table->string('fail_reason')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::table('whatsapp_messages', function (Blueprint $table) {
            $table->dropColumn(['internal_note', 'internal_note_by']);
        });
        Schema::dropIfExists('crm_scheduled_messages');
    }
};
