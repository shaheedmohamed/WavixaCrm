<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('whatsapp_messages', function (Blueprint $table) {
            $table->timestamp('edited_at')->nullable()->after('revoked_at');
            $table->boolean('is_view_once')->default(false)->after('edited_at');
            $table->json('payload')->nullable()->after('is_view_once');
        });
    }

    public function down(): void
    {
        Schema::table('whatsapp_messages', function (Blueprint $table) {
            $table->dropColumn(['edited_at', 'is_view_once', 'payload']);
        });
    }
};
