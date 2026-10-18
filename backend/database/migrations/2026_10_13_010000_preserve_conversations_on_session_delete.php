<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Deleting a WhatsApp device (session) must NOT wipe its chat history —
 * admins keep the conversation archive even after the device is gone.
 * The FK becomes SET NULL and the device identity is snapshotted onto the
 * conversation row so the admin view can still say which number it was.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('whatsapp_conversations', function (Blueprint $table) {
            $table->string('archived_device_name')->nullable()->after('session_id');
            $table->string('archived_device_phone')->nullable()->after('archived_device_name');
        });

        DB::statement('ALTER TABLE whatsapp_conversations DROP FOREIGN KEY whatsapp_conversations_session_id_foreign');
        DB::statement('ALTER TABLE whatsapp_conversations MODIFY session_id BIGINT UNSIGNED NULL');
        DB::statement('ALTER TABLE whatsapp_conversations ADD CONSTRAINT whatsapp_conversations_session_id_foreign FOREIGN KEY (session_id) REFERENCES whatsapp_sessions(id) ON DELETE SET NULL');
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE whatsapp_conversations DROP FOREIGN KEY whatsapp_conversations_session_id_foreign');
        // Rows already orphaned by a deleted session keep NULL session_id;
        // they would violate a NOT NULL column, so reattach nothing and only
        // restore the FK on rows that still reference a live session.
        DB::statement('ALTER TABLE whatsapp_conversations ADD CONSTRAINT whatsapp_conversations_session_id_foreign FOREIGN KEY (session_id) REFERENCES whatsapp_sessions(id) ON DELETE SET NULL');

        Schema::table('whatsapp_conversations', function (Blueprint $table) {
            $table->dropColumn(['archived_device_name', 'archived_device_phone']);
        });
    }
};
