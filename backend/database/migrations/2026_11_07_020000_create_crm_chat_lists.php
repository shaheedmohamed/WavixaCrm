<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('crm_chat_lists', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('owner_id');
            $table->string('name', 100);
            $table->timestamps();
            $table->index('owner_id');
        });
        Schema::create('crm_chat_list_items', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('list_id');
            $table->unsignedBigInteger('conversation_id');
            $table->timestamps();
            $table->unique(['list_id', 'conversation_id']);
            $table->index('conversation_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('crm_chat_list_items');
        Schema::dropIfExists('crm_chat_lists');
    }
};
