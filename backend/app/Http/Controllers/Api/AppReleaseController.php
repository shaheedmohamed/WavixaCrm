<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AppRelease;

/**
 * Public (throttled) endpoint the mobile app polls to learn whether a newer
 * APK exists. Deliberately unauthenticated — the update gate runs before
 * login, so it must not depend on a sanctum token.
 */
class AppReleaseController extends Controller
{
    public function latest()
    {
        $release = AppRelease::latest();

        if (! $release) {
            return response()->json(['release' => null]);
        }

        return response()->json([
            'release' => [
                'version_code' => $release->version_code,
                'version_name' => $release->version_name,
                'file_name' => $release->file_name,
                'size_bytes' => $release->size_bytes,
                'sha256' => $release->sha256,
                'notes' => $release->notes,
                'mandatory' => $release->mandatory,
                'published_at' => $release->created_at?->toIso8601String(),
                'apk_url' => 'https://crm.wavixa.net/apk/' . $release->file_name,
            ],
        ]);
    }
}
