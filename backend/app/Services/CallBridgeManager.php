<?php

namespace App\Services;

use Illuminate\Support\Facades\Log;

/**
 * Maps a WhatsApp phone number to its dedicated call-bridge instance.
 *
 * The bridge runs one systemd instance per number —
 * `wavixa-callbridge@<phone>` with env file
 * `/var/www/Wavixa/whatsapp-callbridge/instances/<phone>.env`.
 * A watcher service starts any new unit within ~10s; the instance then emits
 * its own WhatsApp Web QR (qr.png in the instance out dir) — pairing it is a
 * WhatsApp requirement, no way around a second scan, but it only happens once.
 */
class CallBridgeManager
{
    public const INSTANCES_DIR = '/var/www/Wavixa/whatsapp-callbridge/instances';
    public const DEFAULT_PHONE = '201024520482';
    public const DEFAULT_PORT = 3999;
    public const PORT_BASE = 4000;
    public const MAX_INSTANCES = 10;

    /** phone → ['port' => int, 'dir' => string] or null */
    public static function resolve(?string $phone): ?array
    {
        if (!$phone) return null;
        if ($phone === self::DEFAULT_PHONE) {
            return ['port' => self::DEFAULT_PORT, 'dir' => '/var/www/Wavixa/whatsapp-callbridge/out'];
        }
        $env = self::envPath($phone);
        if (!is_file($env)) return null;
        $port = self::portFromEnv($env);
        return $port ? ['port' => $port, 'dir' => self::outDir($phone)] : null;
    }

    public static function url(?string $phone): ?string
    {
        $r = self::resolve($phone);
        return $r ? "http://127.0.0.1:{$r['port']}" : null;
    }

    /**
     * Ensure an instance exists for the phone — allocates the next free port
     * and writes the env file; the watcher starts the unit automatically.
     * Returns ['port' => int, 'created' => bool] or null when capped.
     */
    public static function ensure(string $phone): ?array
    {
        $phone = preg_replace('/\D/', '', $phone);
        if (!$phone) return null;

        $existing = self::resolve($phone);
        if ($existing) return ['port' => $existing['port'], 'created' => false];

        $used = [self::DEFAULT_PORT];
        foreach (glob(self::INSTANCES_DIR . '/*.env') ?: [] as $f) {
            if (($p = self::portFromEnv($f))) $used[] = $p;
        }
        if (count($used) - 1 >= self::MAX_INSTANCES) {
            Log::warning("CallBridgeManager: instance cap reached, refusing $phone");
            return null;
        }
        $port = max(self::PORT_BASE, (int) max($used) + 1);

        @mkdir(self::INSTANCES_DIR, 0755, true);
        $short = substr($phone, -4);
        $env = implode("\n", [
            'BRIDGE_PORT=' . $port,
            'BRIDGE_PHONE=' . $phone,
            'BRIDGE_CLIENT_ID=cb-' . $short,
            'BRIDGE_OUT_DIR=' . self::outDir($phone),
            'BRIDGE_PUBLIC_WS=wss://crm.wavixa.net/call-ws/' . $port,
            '',
        ]);
        if (@file_put_contents(self::envPath($phone), $env, LOCK_EX) === false) {
            Log::error("CallBridgeManager: cannot write env for $phone");
            return null;
        }
        Log::info("CallBridgeManager: provisioned bridge for $phone on :$port");
        return ['port' => $port, 'created' => true];
    }

    public static function envPath(string $phone): string
    {
        return self::INSTANCES_DIR . '/' . $phone . '.env';
    }

    public static function outDir(string $phone): string
    {
        return self::INSTANCES_DIR . '/' . $phone;
    }

    public static function qrPath(string $phone): string
    {
        $dir = $phone === self::DEFAULT_PHONE
            ? '/var/www/Wavixa/whatsapp-callbridge/out'
            : self::outDir($phone);
        return $dir . '/qr.png';
    }

    private static function portFromEnv(string $file): ?int
    {
        $c = @file_get_contents($file);
        if ($c && preg_match('/BRIDGE_PORT=(\d+)/', $c, $m)) return (int) $m[1];
        return null;
    }
}
