<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('crm_contacts', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('owner_id')->index();
            $table->string('name');
            $table->string('phone', 30);
            $table->string('phone_tail', 15)->index();
            $table->timestamps();
            $table->unique(['owner_id', 'phone_tail']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('crm_contacts');
    }
};
