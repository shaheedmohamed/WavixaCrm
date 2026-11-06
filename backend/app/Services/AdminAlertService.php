<?php

namespace App\Services;

use App\Models\User;
use App\Models\WhatsAppSession;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Throwable;

class AdminAlertService
{
    /**
     * Send an alert when a WhatsApp message fails to send.
     */
    public function notifyMessageFailed(int $messageId, string $to, string $error): void
    {
        $title = 'فشل إرسال رسالة واتساب';
        $body = "الرسالة #{$messageId} للرقم {$to} فشلت:\n" . mb_substr($error, 0, 300);
        $this->send($title, $body, 'msg-fail');
    }

    /**
     * Send an alert when a WhatsApp device drops so the admin can re-pair it
     * before OTP delivery starts failing for real users.
     */
    public function notifySessionDisconnected(int $sessionId, ?string $phone, string $reason): void
    {
        $title = 'انقطاع جهاز واتساب';
        $body = "الجلسة #{$sessionId}" . ($phone ? " ({$phone})" : '') . " انقطعت.\nالسبب: " . mb_substr($reason, 0, 200);
        $this->send($title, $body, 'session-disconnect');
    }

    /**
     * Send an alert for an unhandled exception on the site. The raw
     * exception text (SQL, file paths, secrets) must NEVER leave the
     * server — the WhatsApp alert carries only the class + location so the
     * admin knows to check the log.
     */
    public function notifyException(Throwable $e): void
    {
        $title = 'خطأ غير متوقع في الموقع';
        $body = sprintf(
            "%s في %s:%s\n%s",
            class_basename($e),
            basename($e->getFile()),
            $e->getLine(),
            now()->toDateTimeString()
        );
        $this->send($title, $body, 'exception');
    }

    /**
     * Try to send the alert through the connected admin WhatsApp device.
     * Disabled by default — alerts must never land inside a customer
     * conversation. Set WHATSAPP_ADMIN_ALERTS=true to re-enable.
     */
    protected function send(string $title, string $body, string $type): void
    {
        if (!config('services.whatsapp.admin_alerts', false)) {
            Log::info("AdminAlert suppressed [{$type}] {$title}");
            return;
        }

        $number = config('services.whatsapp.admin_number');
        if (!$number) {
            return;
        }

        try {
            // Avoid duplicate alerts for the same body within 5 minutes
            $dedupKey = "admin-alert:{$type}:" . md5($body);
            if (!Cache::add($dedupKey, true, 300)) {
                return;
            }

            // Global rate limit: 1 alert per minute
            if (!Cache::add('admin-alert:global', true, 60)) {
                return;
            }
        } catch (Throwable $e) {
            // A deadlocked cache write must never break the alert — or the
            // request that triggered it.
            return;
        }

        $session = $this->getAdminSession();
        if (!$session) {
            Log::warning('AdminAlert: no connected WhatsApp session found');
            return;
        }

        $nodeUserId = $session->session_token ?? (string) $session->user_id;
        $to = $this->normalizePhone($number);

        try {
            $serviceUrl = config('services.whatsapp.url', 'http://127.0.0.1:3002');
            $response = Http::timeout(30)->withHeaders([
                'Authorization' => 'Bearer ' . config('services.whatsapp.api_key'),
            ])->post("{$serviceUrl}/api/whatsapp/send-message", [
                'userId' => $nodeUserId,
                'to' => $to,
                'message' => "*{$title}*\n\n{$body}",
            ]);

            if (!$response->successful() || !($response->json()['success'] ?? false)) {
                Log::warning('AdminAlert: send failed', ['response' => $response->body()]);
            }
        } catch (Throwable $e) {
            Log::error('AdminAlert: exception while sending alert', ['error' => $e->getMessage()]);
        }
    }

    /**
     * Find a connected WhatsApp session to use for sending the alert.
     */
    protected function getAdminSession(): ?WhatsAppSession
    {
        $admin = User::where('is_admin', true)->first();

        if (!$admin) {
            return null;
        }

        // ONLY the admin's own device may send alerts. Falling back to "any
        // connected session" leaked internal errors through customer phones.
        return WhatsAppSession::where('user_id', $admin->id)
            ->where('status', 'connected')
            ->latest('connected_at')
            ->first();
    }

    /**
     * Normalize the target phone number to international format.
     */
    protected function normalizePhone(string $phone): string
    {
        return PhoneNormalizer::normalize($phone);
    }
}
