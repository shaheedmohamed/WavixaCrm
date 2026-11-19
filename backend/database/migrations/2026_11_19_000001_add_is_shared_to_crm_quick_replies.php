<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('crm_quick_replies', function (Blueprint $table) {
            // Shared replies show up for every agent on the owner's team;
            // private ones stay visible to their creator only.
            $table->boolean('is_shared')->default(false)->index()->after('body');
        });
    }

    public function down(): void
    {
        Schema::table('crm_quick_replies', function (Blueprint $table) {
            $table->dropColumn('is_shared');
        });
    }
};
