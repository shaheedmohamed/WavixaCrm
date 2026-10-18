<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\CrmContact;
use App\Models\User;
use App\Services\CrmContactBook;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

/**
 * Owner's WhatsApp address book — CSV-uploaded contacts whose names get
 * applied to matching conversations (existing and incoming).
 */
class CrmContactsController extends Controller
{
    private function owner(): User
    {
        /** @var User $user */
        $user = Auth::user();
        abort_unless($user, 401);
        if ($user->crm_role === 'agent' && $user->crm_parent_id) {
            return User::find($user->crm_parent_id) ?? $user;
        }
        abort_if($user->crm_role === 'admin', 403, 'دليل جهات الاتصال لحسابات العملاء فقط');
        return $user;
    }

    public function index(Request $request)
    {
        $owner = $this->owner();
        $query = CrmContact::where('owner_id', $owner->id)->orderBy('name');
        if ($q = trim((string) $request->input('q'))) {
            $query->where(fn ($w) => $w->where('name', 'like', "%{$q}%")
                ->orWhere('phone', 'like', "%{$q}%"));
        }
        $contacts = $query->paginate(50);
        return response()->json([
            'success' => true,
            'contacts' => $contacts->items(),
            'pagination' => [
                'current_page' => $contacts->currentPage(),
                'last_page' => $contacts->lastPage(),
                'total' => $contacts->total(),
            ],
        ]);
    }

    public function store(Request $request)
    {
        $owner = $this->owner();
        $request->validate([
            'name' => 'required|string|max:150',
            'phone' => 'required|string|max:30',
        ]);
        $phone = CrmContactBook::normalizePhone($request->input('phone'));
        if (!$phone) {
            return response()->json(['success' => false, 'message' => 'رقم الهاتف غير صالح'], 422);
        }
        $contact = CrmContact::updateOrCreate(
            ['owner_id' => $owner->id, 'phone_tail' => CrmContactBook::tail($phone)],
            ['name' => trim($request->input('name')), 'phone' => $phone]
        );
        $renamed = CrmContactBook::applyContact($owner->id, $contact);
        return response()->json([
            'success' => true,
            'contact' => $contact,
            'conversations_renamed' => $renamed,
        ]);
    }

    public function update(Request $request, $id)
    {
        $owner = $this->owner();
        $contact = CrmContact::where('owner_id', $owner->id)->findOrFail($id);
        $request->validate([
            'name' => 'sometimes|string|max:150',
            'phone' => 'sometimes|string|max:30',
        ]);
        if ($request->filled('name')) {
            $contact->name = trim($request->input('name'));
        }
        if ($request->filled('phone')) {
            $phone = CrmContactBook::normalizePhone($request->input('phone'));
            if (!$phone) {
                return response()->json(['success' => false, 'message' => 'رقم الهاتف غير صالح'], 422);
            }
            $contact->phone = $phone;
            $contact->phone_tail = CrmContactBook::tail($phone);
        }
        $contact->save();
        $renamed = CrmContactBook::applyContact($owner->id, $contact);
        return response()->json(['success' => true, 'contact' => $contact, 'conversations_renamed' => $renamed]);
    }

    public function destroy($id)
    {
        $owner = $this->owner();
        CrmContact::where('owner_id', $owner->id)->findOrFail($id)->delete();
        return response()->json(['success' => true]);
    }

    /**
     * Bulk import from a CSV or VCF (vCard) file. CSV column order is
     * auto-detected per row; vCards contribute every TEL under their FN.
     * After upserting, every existing conversation whose number matches
     * is renamed to the book name.
     */
    public function import(Request $request)
    {
        $owner = $this->owner();
        $request->validate(['file' => 'required|file|max:5120']);

        $pairs = $this->parseContactsFile($request->file('file')->getRealPath());
        if ($pairs === null) {
            return response()->json(['success' => false, 'message' => 'تعذر قراءة الملف — تأكد إنه CSV أو VCF'], 422);
        }

        $imported = 0;
        $skipped = 0;
        $renamed = 0;
        $seen = [];

        foreach ($pairs as [$name, $phone]) {
            $name = trim($this->cleanUtf8($name));
            if (!$phone || !$name || mb_strlen($name) > 150) {
                $skipped++;
                continue;
            }
            $tail = CrmContactBook::tail($phone);
            if (isset($seen[$tail])) {
                continue;
            }
            $seen[$tail] = true;

            try {
                $contact = CrmContact::updateOrCreate(
                    ['owner_id' => $owner->id, 'phone_tail' => $tail],
                    ['name' => $name, 'phone' => $phone]
                );
                $imported++;
                $renamed += CrmContactBook::applyContact($owner->id, $contact);
            } catch (\Throwable $e) {
                $skipped++;
            }
        }

        return response()->json([
            'success' => true,
            'imported' => $imported,
            'skipped' => $skipped,
            'conversations_renamed' => $renamed,
            'message' => "تم استيراد {$imported} جهة اتصال" . ($renamed ? " وتحديث {$renamed} محادثة" : ''),
        ]);
    }

    /**
     * Returns an array of [name, normalizedPhone] pairs, or null when the
     * file is neither CSV nor vCard.
     */
    private function parseContactsFile(string $path): ?array
    {
        $content = file_get_contents($path);
        if ($content === false || trim($content) === '') {
            return null;
        }

        // Windows-1256 export (older phones write Arabic in ANSI) — but a
        // mostly-UTF-8 file with a truncated byte must NOT be converted or
        // every name turns to mojibake. Convert only when the share of
        // bytes that are not valid UTF-8 sequences is clearly high.
        if (!mb_check_encoding($content, 'UTF-8')) {
            $stripped = preg_replace(
                '/[\x00-\x7F]|[\xC2-\xDF][\x80-\xBF]|[\xE0-\xEF][\x80-\xBF]{2}|[\xF0-\xF4][\x80-\xBF]{3}/',
                '',
                $content
            );
            $invalidRatio = strlen((string) $stripped) / max(1, strlen($content));
            if ($invalidRatio > 0.02) {
                $converted = @iconv('Windows-1256', 'UTF-8//IGNORE', $content);
                if ($converted !== false) {
                    $content = $converted;
                }
            }
        }

        if (stripos($content, 'BEGIN:VCARD') !== false) {
            return $this->parseVcf($content);
        }
        return $this->parseCsv($content);
    }

    /**
     * CSV / TSV rows → pairs. Per row, the cell that looks like a phone is
     * the phone; the longest remaining text cell is the name.
     */
    private function parseCsv(string $content): array
    {
        $pairs = [];
        $handle = fopen('php://temp', 'r+');
        fwrite($handle, $content);
        rewind($handle);
        while (($row = fgetcsv($handle, 0, ',', '"', '')) !== false) {
            if (count($row) === 1 && (str_contains($row[0], ';') || str_contains($row[0], "\t"))) {
                $row = preg_split('/[;\t]/', $row[0]);
            }
            $row = array_map('trim', array_filter((array) $row, fn ($c) => trim((string) $c) !== ''));
            if (count($row) < 2) {
                continue;
            }
            $phone = null;
            $name = null;
            foreach ($row as $cell) {
                $norm = CrmContactBook::normalizePhone($cell);
                if ($norm && !$phone) {
                    $phone = $norm;
                } elseif ($norm === null && !is_numeric($cell) && (!$name || mb_strlen($cell) > mb_strlen($name))) {
                    $name = $cell;
                }
            }
            if ($phone && $name) {
                $pairs[] = [$name, $phone];
            } else {
                $pairs[] = [$name ?: '', $phone ?: ''];
            }
        }
        fclose($handle);
        return $pairs;
    }

    /**
     * vCard (VCF) entries → pairs. Handles folded lines, quoted-printable
     * names (vCard 2.1 exports), FN/N fallbacks and multiple TEL values —
     * each number becomes its own contact under the same name.
     */
    /**
     * Strip bytes that are not valid UTF-8 (truncated multibyte chars in
     * some exports would otherwise abort the whole import with SQLSTATE
     * 1366).
     */
    private function cleanUtf8(string $v): string
    {
        $clean = @iconv('UTF-8', 'UTF-8//IGNORE', $v);
        return $clean === false ? mb_convert_encoding($v, 'UTF-8', 'UTF-8') : $clean;
    }

    private function parseVcf(string $content): array
    {
        $pairs = [];
        // Unfold continuation lines (start with space/tab) then normalize endings.
        $content = preg_replace("/\r?\n[ \t]/", '', $content);
        $cards = preg_split('/BEGIN:VCARD/i', $content);
        array_shift($cards);

        foreach ($cards as $card) {
            $card = preg_split('/END:VCARD/i', $card)[0];
            $name = null;
            $nName = null;
            $phones = [];

            foreach (preg_split('/\r?\n/', $card) as $line) {
                $line = trim($line);
                if ($line === '' || !str_contains($line, ':')) {
                    continue;
                }
                [$prop, $value] = explode(':', $line, 2);
                $propParts = explode(';', strtoupper($prop));
                $key = $propParts[0];
                if (in_array('ENCODING=QUOTED-PRINTABLE', $propParts) || stripos($prop, 'ENCODING=QUOTED-PRINTABLE') !== false) {
                    $value = quoted_printable_decode($value);
                }

                if ($key === 'FN') {
                    $name = trim($value);
                } elseif ($key === 'N') {
                    // N = Last;First;Middle;Prefix;Suffix
                    $parts = array_map('trim', explode(';', $value));
                    $nName = trim(implode(' ', array_filter([$parts[1] ?? '', $parts[0] ?? ''])));
                } elseif ($key === 'TEL') {
                    $norm = CrmContactBook::normalizePhone($value);
                    if ($norm) {
                        $phones[] = $norm;
                    }
                }
            }

            $finalName = $name ?: $nName;
            if (!$finalName) {
                foreach ($phones as $p) {
                    $pairs[] = ['', $p];
                }
                continue;
            }
            foreach ($phones as $p) {
                $pairs[] = [$finalName, $p];
            }
        }
        return $pairs;
    }
}
