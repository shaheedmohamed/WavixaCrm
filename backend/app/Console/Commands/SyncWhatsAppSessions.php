<?php

namespace App\Console\Commands;

use App\Models\WhatsAppSession;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class SyncWhatsAppSessions extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'whatsapp:sync-sessions
                            {--dry-run : Report differences without updating the database}';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Reconcile whatsapp_sessions rows with the live state of the node service.';

    /**
     * Execute the console command.
     *
     * Sessions marked "connected" in the database while the node service has no
     * live socket cause system messages (OTP) to be routed to a dead device and
     * fail silently. This command is the safety net for missed webhooks.
     */
    public function handle(): int
    {
        $serviceUrl = config('services.whatsapp.url', 'http://127.0.0.1:3002');

        // A single failed probe must never nuke every session — the engine
        // stalls for a second during reconnects/GC and mass-marking all
        // devices disconnected used to block every CRM send until the next
        // status webhook happened to heal the rows. Only after several
        // consecutive failures is the service really down.
        $health = null;
        $healthError = null;
        for ($attempt = 1; $attempt <= 3; $attempt++) {
            try {
                $health = Http::timeout(5)->get("{$serviceUrl}/health");
                if ($health->successful()) {
                    break;
                }
                $healthError = 'HTTP ' . $health->status();
            } catch (\Throwable $e) {
                $health = null;
                $healthError = $e->getMessage();
            }
            if ($attempt < 3) {
                sleep(2);
            }
        }

        if (!$health || !$health->successful()) {
            $this->error("WhatsApp service unreachable after 3 probes: {$healthError}");
            $this->markAllDisconnected('service_unreachable');
            return self::FAILURE;
        }

        // "disconnected" is included so a false mark (a flapping probe, a
        // missed status webhook) self-corrects on the next run instead of
        // sticking until the engine happens to re-emit a status event.
        $sessions = WhatsAppSession::whereIn('status', ['connected', 'pending', 'disconnected'])->get();
        $this->info("Checking {$sessions->count()} session(s)...");

        $fixed = 0;

        foreach ($sessions as $session) {
            $liveStatus = 'disconnected';

            foreach ([$session->session_token, (string) $session->user_id] as $nodeUserId) {
                if (! $nodeUserId) {
                    continue;
                }

                try {
                    $response = Http::timeout(5)
                        ->withHeaders([
                            'Authorization' => 'Bearer ' . config('services.whatsapp.api_key'),
                        ])
                        ->get("{$serviceUrl}/api/whatsapp/status/{$nodeUserId}");
                    $status = $response->successful()
                        ? ($response->json()['status'] ?? 'disconnected')
                        : 'disconnected';
                } catch (\Throwable $e) {
                    $status = 'disconnected';
                }

                if ($status === 'connected') {
                    $liveStatus = 'connected';
                    break;
                }

                if ($status !== 'disconnected' && $liveStatus === 'disconnected') {
                    $liveStatus = $status;
                }
            }

            if ($liveStatus === $session->status) {
                continue;
            }

            // If session is temporarily reconnecting and was marked connected, don't drop it to disconnected
            if ($liveStatus === 'reconnecting' && $session->status === 'connected') {
                continue;
            }

            $this->warn("Session #{$session->id} ({$session->phone_number}): db={$session->status} live={$liveStatus}");
            $fixed++;

            if ($this->option('dry-run')) {
                continue;
            }

            $targetStatus = in_array($liveStatus, ['connected', 'pending', 'disconnected']) ? $liveStatus : 'disconnected';

            $session->update([
                'status' => $targetStatus,
                'last_activity_at' => now(),
            ]);

            Log::info("whatsapp:sync-sessions corrected session {$session->id} to {$liveStatus}");
        }

        $this->info($fixed === 0 ? 'All sessions in sync.' : "Corrected {$fixed} session(s).");

        return self::SUCCESS;
    }

    /**
     * The node service is down, so no session can possibly be connected.
     */
    private function markAllDisconnected(string $reason): void
    {
        if ($this->option('dry-run')) {
            return;
        }

        $count = WhatsAppSession::where('status', 'connected')
            ->update(['status' => 'disconnected', 'last_activity_at' => now()]);

        if ($count > 0) {
            Log::warning("whatsapp:sync-sessions marked {$count} session(s) disconnected ({$reason})");
            $this->warn("Marked {$count} session(s) disconnected.");
        }
    }
}
