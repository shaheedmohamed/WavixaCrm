<?php

namespace App\Services;

use App\Models\CrmContact;
use App\Models\WhatsAppConversation;
use App\Models\WhatsAppSession;
use Illuminate\Support\Facades\DB;

/**
 * Per-owner WhatsApp address book: uploaded CSV contacts whose names win
 * over WhatsApp pushnames whenever a conversation's number matches.
 */
class CrmContactBook
{
    /**
     * Normalize any phone representation to international digits.
     * Handles "01012345678" (Egypt local) and "00201012345678" styles.
     */
    public static function normalizePhone(?string $raw): ?string
    {
        $digits = preg_replace('/\D/', '', (string) $raw);
        if (strlen($digits) < 8) {
            return null;
        }
        if (str_starts_with($digits, '00')) {
            $digits = substr($digits, 2);
        }
        // Egyptian local format: 010xxxxxxxx → 2010xxxxxxxx
        if (str_starts_with($digits, '0') && strlen($digits) === 11) {
            $digits = '20' . substr($digits, 1);
        }
        return $digits;
    }

    public static function tail(string $digits): string
    {
        return substr($digits, -10);
    }

    /**
     * The book's name for a phone number owned by $ownerId, or null.
     */
    public static function nameFor(int $ownerId, ?string $phone): ?string
    {
        $digits = self::normalizePhone($phone);
        if (!$digits) {
            return null;
        }
        return CrmContact::where('owner_id', $ownerId)
            ->where(fn ($q) => $q->where('phone', $digits)->orWhere('phone_tail', self::tail($digits)))
            ->value('name');
    }

    /**
     * Rename a conversation to the book name when its number matches.
     * Returns true when the name actually changed.
     */
    public static function applyToConversation(WhatsAppConversation $conversation): bool
    {
        if (!$conversation->user_id) {
            return false;
        }
        $name = self::nameFor((int) $conversation->user_id, $conversation->contact_phone);
        if ($name && $conversation->contact_name !== $name) {
            $conversation->update(['contact_name' => $name]);
            return true;
        }
        return false;
    }

    /**
     * Rename every matching conversation belonging to one contact.
     * Returns how many conversations were renamed.
     */
    public static function applyContact(int $ownerId, CrmContact $contact): int
    {
        $sessionIds = WhatsAppSession::where('user_id', $ownerId)->pluck('id');
        if ($sessionIds->isEmpty()) {
            return 0;
        }
        return WhatsAppConversation::whereIn('session_id', $sessionIds)
            ->where('contact_name', '!=', $contact->name)
            ->where(fn ($q) => $q->where('contact_phone', $contact->phone)
                ->orWhere('contact_phone', 'like', '%' . $contact->phone_tail))
            ->update(['contact_name' => $contact->name]);
    }
}
