<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('app_releases', function (Blueprint $table) {
            $table->id();
            // versionCode/versionName/package are parsed out of the APK itself
            // by aapt in crm:apk-publish — never trusted from user input.
            $table->unsignedInteger('version_code')->unique();
            $table->string('version_name');
            $table->string('package')->default('net.wavixa.crm');
            $table->string('file_name');
            $table->unsignedBigInteger('size_bytes');
            $table->string('sha256', 64)->nullable();
            $table->text('notes')->nullable();
            // mandatory releases wall the app until installed; optional ones
            // can be dismissed with "later".
            $table->boolean('mandatory')->default(true);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('app_releases');
    }
};
