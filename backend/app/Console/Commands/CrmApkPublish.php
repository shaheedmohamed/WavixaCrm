<?php

namespace App\Console\Commands;

use App\Events\CrmRealtimeEvent;
use App\Models\AppRelease;
use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Process;

/**
 * Publish a new employee-app APK: verify the binary with aapt (package +
 * versionCode come from the APK itself, not from the operator), copy it into
 * the nginx-served /apk/ directory, register the release, then push an
 * app.update realtime event so every signed-in phone walls itself instantly.
 */
class CrmApkPublish extends Command
{
    protected $signature = 'crm:apk-publish
                            {path : Path to the .apk file already on this server}
                            {--notes= : Release notes shown on the update wall}
                            {--optional : Non-mandatory release — the app offers a dismissible banner instead of a wall}
                            {--force : Replace an existing release row with the same versionCode}';

    protected $description = 'Publish an employee-app APK: copy to /apk/, register release, broadcast app.update.';

    private const APK_DIR = '/var/www/WavixaCRM/apk';

    private const EXPECTED_PACKAGE = 'net.wavixa.crm';

    public function handle(): int
    {
        $path = realpath((string) $this->argument('path'));
        if (! $path || ! is_file($path)) {
            $this->error('File not found: ' . $this->argument('path'));
            return self::FAILURE;
        }
        if (! str_ends_with(strtolower($path), '.apk')) {
            $this->error('File must end with .apk');
            return self::FAILURE;
        }

        $meta = $this->readBadging($path);
        if (! $meta) {
            return self::FAILURE;
        }
        ['package' => $package, 'vc' => $vc, 'vn' => $vn] = $meta;

        if ($package !== self::EXPECTED_PACKAGE) {
            $this->error("APK package is {$package}, expected " . self::EXPECTED_PACKAGE);
            return self::FAILURE;
        }

        $existing = AppRelease::where('version_code', $vc)->first();
        if ($existing && ! $this->option('force')) {
            $this->error("versionCode {$vc} already published as {$existing->file_name}. Use --force to replace.");
            return self::FAILURE;
        }

        $fileName = $this->sanitizeFileName(basename($path));
        if ($fileName === 'wavixa-latest.apk' || $fileName === 'carebot-latest.apk') {
            // Those names are reserved for the always-latest pointer.
            $fileName = "wavixa-v{$vc}-{$vn}.apk";
        }

        $dest = self::APK_DIR . '/' . $fileName;
        // Publishing a file that already lives in the served directory is a
        // no-op copy — comparing inode-safe via realpath on both sides.
        if ($path !== $dest && ! copy($path, $dest)) {
            $this->error("Failed to copy APK to {$dest}");
            return self::FAILURE;
        }
        @chmod($dest, 0644);

        // Stable always-latest URL: https://crm.wavixa.net/apk/wavixa-latest.apk
        copy($dest, self::APK_DIR . '/wavixa-latest.apk');
        copy($dest, self::APK_DIR . '/carebot-latest.apk');

        $sha = hash_file('sha256', $dest) ?: null;

        $release = AppRelease::updateOrCreate(
            ['version_code' => $vc],
            [
                'version_name' => $vn,
                'package' => $package,
                'file_name' => $fileName,
                'size_bytes' => filesize($dest) ?: 0,
                'sha256' => $sha,
                'notes' => $this->option('notes'),
                'mandatory' => ! $this->option('optional'),
            ]
        );

        $payload = [
            'version_code' => $release->version_code,
            'version_name' => $release->version_name,
            'file_name' => $release->file_name,
            'size_bytes' => $release->size_bytes,
            'sha256' => $release->sha256,
            'notes' => $release->notes,
            'mandatory' => $release->mandatory,
            'apk_url' => 'https://crm.wavixa.net/apk/' . $release->file_name,
        ];

        // Push the wall to every account owner — agents subscribe to their
        // owner's channel, so one event per owner reaches the whole fleet.
        $owners = User::where('crm_role', 'owner')->pluck('id');
        foreach ($owners as $ownerId) {
            event(new CrmRealtimeEvent((int) $ownerId, 'app.update', $payload));
        }

        $this->info("Published {$fileName} — v{$vn} (vc {$vc}), " .
            round(($release->size_bytes ?? 0) / 1048576, 1) . ' MB, ' .
            ($release->mandatory ? 'mandatory' : 'optional') .
            ". Notified {$owners->count()} owner channel(s).");

        return self::SUCCESS;
    }

    /**
     * aapt dump badging → package name, versionCode, versionName straight
     * from the binary manifest. Returns null on parse failure.
     */
    private function readBadging(string $path): ?array
    {
        $aapt = $this->findAapt();
        if (! $aapt) {
            $this->error('aapt not found under /opt/android-sdk/build-tools');
            return null;
        }

        $result = Process::timeout(120)->run([$aapt, 'dump', 'badging', $path]);
        if (! $result->successful()) {
            $this->error('aapt failed: ' . trim($result->errorOutput() ?: $result->output()));
            return null;
        }

        if (! preg_match("/^package: name='([^']+)' versionCode='(\d+)' versionName='([^']*)'/m", $result->output(), $m)) {
            $this->error('Could not parse package/version from aapt output');
            return null;
        }

        return ['package' => $m[1], 'vc' => (int) $m[2], 'vn' => $m[3]];
    }

    private function findAapt(): ?string
    {
        $candidates = glob('/opt/android-sdk/build-tools/*/aapt') ?: [];
        rsort($candidates); // newest build-tools dir first (37.0.0 > 36.0.0)
        foreach ($candidates as $bin) {
            if (is_executable($bin)) {
                return $bin;
            }
        }
        return null;
    }

    private function sanitizeFileName(string $name): string
    {
        $name = preg_replace('/[^A-Za-z0-9._-]+/', '-', $name) ?? 'app.apk';
        $name = trim($name, '-_');
        return str_ends_with(strtolower($name), '.apk') ? $name : $name . '.apk';
    }
}
