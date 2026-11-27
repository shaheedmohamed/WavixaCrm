<?php
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;

$jobs = DB::table('jobs')->where('payload','like','%FetchBusinessProfileJob%')->orderBy('available_at')->limit(6)->get();
foreach ($jobs as $j) {
    $cmd = unserialize(json_decode($j->payload)->data->command);
    $c = \App\Models\WhatsAppConversation::find($cmd->conversationId);
    $s = $c?->session;
    if (!$c || !$s) { echo "conv {$cmd->conversationId}: no conv/session\n"; continue; }
    $engineUrl = rtrim(config('services.whatsapp.url', 'http://127.0.0.1:3005'), '/');
    $apiKey = config('services.whatsapp.api_key', 'wavixa-local-api-key-2026');
    $res = Http::withHeaders(['Authorization' => 'Bearer ' . $apiKey])
        ->timeout(20)
        ->post("{$engineUrl}/internal/business-profile", [
            'sessionId' => $s->session_token,
            'jid' => $c->contact_jid,
        ]);
    echo "conv {$c->id} sess {$s->id} jid {$c->contact_jid} -> HTTP {$res->status()} " . mb_substr($res->body(), 0, 120) . "\n";
}
