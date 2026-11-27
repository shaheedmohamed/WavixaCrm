<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * One row per published employee-app APK. Rows are written only by the
 * crm:apk-publish artisan command after aapt verifies the binary's real
 * package + versionCode, so the metadata always matches the file on disk.
 */
class AppRelease extends Model
{
    protected $fillable = [
        'version_code',
        'version_name',
        'package',
        'file_name',
        'size_bytes',
        'sha256',
        'notes',
        'mandatory',
    ];

    protected $casts = [
        'mandatory' => 'boolean',
    ];

    public static function latest(): ?self
    {
        return static::orderByDesc('version_code')->first();
    }
}
