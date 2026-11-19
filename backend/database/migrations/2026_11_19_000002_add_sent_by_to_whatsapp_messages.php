<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('whatsapp_messages', function (Blueprint $table) {
            // Which CRM user actually sent this outgoing message. NULL means
            // it came from the WhatsApp device/app itself (or an older row).
            $table->unsignedBigInteger('sent_by_user_id')->nullable()->after('user_id')->index();
        });
    }

    public function down(): void
    {
        Schema::table('whatsapp_messages', function (Blueprint $table) {
            $table->dropColumn('sent_by_user_id');
        });
    }
};
