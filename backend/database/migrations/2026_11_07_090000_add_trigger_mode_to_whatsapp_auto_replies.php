<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('whatsapp_auto_replies', function (Blueprint $table) {
            // all | new_customer | outside_hours | delayed
            $table->string('trigger_mode', 30)->default('all')->after('mode');
            $table->time('work_hours_from')->nullable()->after('trigger_mode');
            $table->time('work_hours_to')->nullable()->after('work_hours_from');
            $table->unsignedSmallInteger('response_delay_minutes')->default(5)->after('work_hours_to');
        });
    }

    public function down(): void
    {
        Schema::table('whatsapp_auto_replies', function (Blueprint $table) {
            $table->dropColumn(['trigger_mode', 'work_hours_from', 'work_hours_to', 'response_delay_minutes']);
        });
    }
};
