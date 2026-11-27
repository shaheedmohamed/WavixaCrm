<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('whatsapp_messages', function (Blueprint $table) {
            $table->decimal('latitude', 10, 7)->nullable()->after('message_type');
            $table->decimal('longitude', 10, 7)->nullable()->after('latitude');
            $table->string('sender_country', 4)->nullable()->after('longitude')->index();
        });

        Schema::table('whatsapp_conversations', function (Blueprint $table) {
            $table->string('contact_country', 4)->nullable()->after('contact_username');
            $table->string('business_address')->nullable()->after('contact_country');
            $table->decimal('business_latitude', 10, 7)->nullable()->after('business_address');
            $table->decimal('business_longitude', 10, 7)->nullable()->after('business_latitude');
            $table->unsignedTinyInteger('business_profile_attempts')->default(0)->after('business_longitude');
            $table->timestamp('business_profile_checked_at')->nullable()->after('business_profile_attempts');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('whatsapp_messages', function (Blueprint $table) {
            $table->dropIndex(['sender_country']);
            $table->dropColumn(['latitude', 'longitude', 'sender_country']);
        });

        Schema::table('whatsapp_conversations', function (Blueprint $table) {
            $table->dropColumn([
                'contact_country',
                'business_address',
                'business_latitude',
                'business_longitude',
                'business_profile_attempts',
                'business_profile_checked_at',
            ]);
        });
    }
};
