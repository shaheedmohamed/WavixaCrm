<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * WhatsApp status updates (stories). They arrive as ordinary messages
 * addressed to `status@broadcast` — one row per status item, keyed by the
 * original message id so the same status never duplicates. Anti-delete:
 * a revoked status keeps its row and only stamps deleted_at; view state is
 * tracked locally (WhatsApp never tells us what the agent saw).
 */
return new class extends Migration
{4
    public function up(): void
    {
        Schema::create('whatsapp_statuses', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('user_id')->index();
            $table->unsignedBigInteger('session_id')->index();
            $table->string('poster_jid')->nullable();
            $table->string('poster_phone', 32)->index();
            $table->string('poster_name')->nullable();
            $table->string('poster_avatar')->nullable();
            $table->boolean('is_mine')->default(false)->index();
            $table->string('message_id')->index();
            $table->string('type', 24)->default('text'); // text|image|video|audio|voice
            $table->text('body')->nullable();
            $table->string('media_url', 512)->nullable();
            $table->string('media_mime_type')->nullable();
            $table->unsignedBigInteger('media_size')->nullable();
            $table->json('media_meta')->nullable(); // mediaKey/directPath for lazy decrypt
            $table->timestamp('posted_at')->nullable()->index();
            $table->timestamp('expires_at')->nullable()->index();
            $table->timestamp('deleted_at')->nullable();
            $table->timestamp('viewed_at')->nullable();
            $table->timestamps();

            $table->unique(['session_id', 'message_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('whatsapp_statuses');
    }
};
