<?php

namespace App\Services;

use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Process;
use Illuminate\Support\Str;

class CrmMediaEditService
{
    private const FONT_BOLD = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';
    private const FONT_REGULAR = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';

    private const ARABIC_FORMS = [
        0x0621 => [0xFE80, 0xFE80, 0xFE80, 0xFE80],
        0x0622 => [0xFE81, 0xFE82, 0xFE81, 0xFE82],
        0x0623 => [0xFE83, 0xFE84, 0xFE83, 0xFE84],
        0x0624 => [0xFE85, 0xFE86, 0xFE85, 0xFE86],
        0x0625 => [0xFE87, 0xFE88, 0xFE87, 0xFE88],
        0x0626 => [0xFE89, 0xFE8A, 0xFE8B, 0xFE8C],
        0x0627 => [0xFE8D, 0xFE8E, 0xFE8D, 0xFE8E],
        0x0628 => [0xFE8F, 0xFE90, 0xFE91, 0xFE92],
        0x0629 => [0xFE93, 0xFE94, 0xFE93, 0xFE94],
        0x062A => [0xFE95, 0xFE96, 0xFE97, 0xFE98],
        0x062B => [0xFE99, 0xFE9A, 0xFE9B, 0xFE9C],
        0x062C => [0xFE9D, 0xFE9E, 0xFE9F, 0xFEA0],
        0x062D => [0xFEA1, 0xFEA2, 0xFEA3, 0xFEA4],
        0x062E => [0xFEA5, 0xFEA6, 0xFEA7, 0xFEA8],
        0x062F => [0xFEA9, 0xFEAA, 0xFEA9, 0xFEAA],
        0x0630 => [0xFEAB, 0xFEAC, 0xFEAB, 0xFEAC],
        0x0631 => [0xFEAD, 0xFEAE, 0xFEAD, 0xFEAE],
        0x0632 => [0xFEAF, 0xFEB0, 0xFEAF, 0xFEB0],
        0x0633 => [0xFEB1, 0xFEB2, 0xFEB3, 0xFEB4],
        0x0634 => [0xFEB5, 0xFEB6, 0xFEB7, 0xFEB8],
        0x0635 => [0xFEB9, 0xFEBA, 0xFEBB, 0xFEBC],
        0x0636 => [0xFEBD, 0xFEBE, 0xFEBF, 0xFEC0],
        0x0637 => [0xFEC1, 0xFEC2, 0xFEC3, 0xFEC4],
        0x0638 => [0xFEC5, 0xFEC6, 0xFEC7, 0xFEC8],
        0x0639 => [0xFEC9, 0xFECA, 0xFECB, 0xFECC],
        0x063A => [0xFECD, 0xFECE, 0xFECF, 0xFED0],
        0x0641 => [0xFED1, 0xFED2, 0xFED3, 0xFED4],
        0x0642 => [0xFED5, 0xFED6, 0xFED7, 0xFED8],
        0x0643 => [0xFED9, 0xFEDA, 0xFEDB, 0xFEDC],
        0x0644 => [0xFEDD, 0xFEDE, 0xFEDF, 0xFEE0],
        0x0645 => [0xFEE1, 0xFEE2, 0xFEE3, 0xFEE4],
        0x0646 => [0xFEE5, 0xFEE6, 0xFEE7, 0xFEE8],
        0x0647 => [0xFEE9, 0xFEEA, 0xFEEB, 0xFEEC],
        0x0648 => [0xFEED, 0xFEEE, 0xFEED, 0xFEEE],
        0x0649 => [0xFEEF, 0xFEF0, 0xFEEF, 0xFEF0],
        0x064A => [0xFEF1, 0xFEF2, 0xFEF3, 0xFEF4],
    ];

    private const NON_CONNECTING_NEXT = [
        0x0621, 0x0622, 0x0623, 0x0624, 0x0625, 0x0627,
        0x0629, 0x062F, 0x0630, 0x0631, 0x0632, 0x0648, 0x0649,
    ];

    public function hasImageChanges(array $spec): bool
    {
        $rot = ((int) ($spec['rotation'] ?? 0)) % 360;
        if ($rot !== 0) {
            return true;
        }
        if (!empty($spec['crop']) && is_array($spec['crop'])) {
            $c = $spec['crop'];
            if (
                abs((float) ($c['x'] ?? 0)) > 0.005 ||
                abs((float) ($c['y'] ?? 0)) > 0.005 ||
                abs((float) ($c['w'] ?? 1) - 1.0) > 0.005 ||
                abs((float) ($c['h'] ?? 1) - 1.0) > 0.005
            ) {
                return true;
            }
        }
        return !empty($spec['strokes']) || !empty($spec['texts']);
    }

    public function hasVideoChanges(array $spec): bool
    {
        if (!empty($spec['muteAudio'])) {
            return true;
        }
        $start = max(0.0, (float) ($spec['trimStart'] ?? 0));
        $end = (float) ($spec['trimEnd'] ?? 0);
        $dur = (float) ($spec['duration'] ?? 0);
        if ($start > 0.15) {
            return true;
        }
        if ($end > 0 && $dur > 0 && ($dur - $end) > 0.25) {
            return true;
        }
        return false;
    }

    public function applyImageEdits(string $srcPath, array $spec, string $outDir): ?array
    {
        if (!class_exists(\Imagick::class) || !is_file($srcPath)) {
            return null;
        }

        try {
            $img = new \Imagick($srcPath);
            $img->autoOrient();

            $rot = ((int) ($spec['rotation'] ?? 0)) % 360;
            if ($rot < 0) {
                $rot += 360;
            }
            if (in_array($rot, [90, 180, 270], true)) {
                $img->rotateImage(new \ImagickPixel('#000000'), $rot);
                $img->setImagePage(0, 0, 0, 0);
            }

            $w = $img->getImageWidth();
            $h = $img->getImageHeight();

            if (!empty($spec['crop']) && is_array($spec['crop'])) {
                $cx = max(0.0, min(0.95, (float) ($spec['crop']['x'] ?? 0)));
                $cy = max(0.0, min(0.95, (float) ($spec['crop']['y'] ?? 0)));
                $cw = max(0.05, min(1.0 - $cx, (float) ($spec['crop']['w'] ?? 1)));
                $ch = max(0.05, min(1.0 - $cy, (float) ($spec['crop']['h'] ?? 1)));

                $px = (int) round($cx * $w);
                $py = (int) round($cy * $h);
                $pw = max(16, (int) round($cw * $w));
                $ph = max(16, (int) round($ch * $h));

                $img->cropImage($pw, $ph, $px, $py);
                $img->setImagePage(0, 0, 0, 0);
                $w = $img->getImageWidth();
                $h = $img->getImageHeight();
            }

            if (!empty($spec['strokes']) && is_array($spec['strokes'])) {
                foreach ($spec['strokes'] as $stroke) {
                    $pts = $stroke['points'] ?? [];
                    if (!is_array($pts) || count($pts) < 1) {
                        continue;
                    }
                    $color = $this->safeHexColor($stroke['color'] ?? '#00A884');
                    $ratio = max(0.003, min(0.06, (float) ($stroke['widthRatio'] ?? 0.012)));
                    $strokePx = max(2.0, $ratio * min($w, $h));

                    $draw = new \ImagickDraw();
                    $draw->setStrokeColor(new \ImagickPixel($color));
                    $draw->setFillColor(new \ImagickPixel('transparent'));
                    $draw->setStrokeWidth($strokePx);
                    $draw->setStrokeLineCap(\Imagick::LINECAP_ROUND);
                    $draw->setStrokeLineJoin(\Imagick::LINEJOIN_ROUND);
                    $draw->setStrokeAntialias(true);

                    if (count($pts) === 1) {
                        $x0 = (float) ($pts[0][0] ?? 0.5) * $w;
                        $y0 = (float) ($pts[0][1] ?? 0.5) * $h;
                        $draw->setFillColor(new \ImagickPixel($color));
                        $draw->circle($x0, $y0, $x0 + $strokePx * 0.5, $y0);
                    } else {
                        $poly = [];
                        foreach ($pts as $pt) {
                            if (!is_array($pt) || count($pt) < 2) {
                                continue;
                            }
                            $poly[] = [
                                'x' => max(0.0, min((float) $w, (float) $pt[0] * $w)),
                                'y' => max(0.0, min((float) $h, (float) $pt[1] * $h)),
                            ];
                        }
                        if (count($poly) >= 2) {
                            $draw->polyline($poly);
                        }
                    }
                    $img->drawImage($draw);
                    $draw->destroy();
                }
            }

            if (!empty($spec['texts']) && is_array($spec['texts'])) {
                $fontPath = is_file(self::FONT_BOLD)
                    ? self::FONT_BOLD
                    : (is_file(self::FONT_REGULAR) ? self::FONT_REGULAR : null);

                foreach ($spec['texts'] as $item) {
                    $rawText = trim((string) ($item['text'] ?? ''));
                    if ($rawText === '') {
                        continue;
                    }

                    $tx = max(0.02, min(0.98, (float) ($item['x'] ?? 0.5))) * $w;
                    $ty = max(0.02, min(0.98, (float) ($item['y'] ?? 0.5))) * $h;
                    $color = $this->safeHexColor($item['color'] ?? '#FFFFFF');
                    $bgStyle = (string) ($item['bgStyle'] ?? 'dark');
                    $sizeRatio = max(0.025, min(0.14, (float) ($item['fontSizeRatio'] ?? 0.055)));
                    $fontSize = max(16.0, $sizeRatio * min($w, $h));

                    $lines = preg_split('/\r\n|\r|\n/', $rawText) ?: [$rawText];
                    $shapedLines = array_map(fn ($ln) => $this->shapeVisualLine($ln), $lines);

                    $probe = new \ImagickDraw();
                    if ($fontPath) {
                        $probe->setFont($fontPath);
                    }
                    $probe->setFontSize($fontSize);

                    $maxLineW = 0.0;
                    $lineHeight = $fontSize * 1.28;
                    foreach ($shapedLines as $sl) {
                        $metrics = $img->queryFontMetrics($probe, $sl ?: ' ');
                        $maxLineW = max($maxLineW, (float) ($metrics['textWidth'] ?? ($fontSize * mb_strlen($sl))));
                    }
                    $probe->destroy();

                    $totalH = count($shapedLines) * $lineHeight;
                    $padX = $fontSize * 0.48;
                    $padY = $fontSize * 0.28;

                    if ($bgStyle !== 'none') {
                        $bgDraw = new \ImagickDraw();
                        $bgHex = $bgStyle === 'solid'
                            ? ($color === '#FFFFFF' ? '#00A884' : $color)
                            : 'rgba(17, 27, 33, 0.72)';
                        $bgDraw->setFillColor(new \ImagickPixel($bgHex));
                        $bgDraw->setStrokeColor(new \ImagickPixel('transparent'));
                        $rx1 = max(4.0, $tx - $maxLineW / 2 - $padX);
                        $ry1 = max(4.0, $ty - $totalH / 2 - $padY);
                        $rx2 = min($w - 4.0, $tx + $maxLineW / 2 + $padX);
                        $ry2 = min($h - 4.0, $ty + $totalH / 2 + $padY);
                        $rad = min(18.0, ($ry2 - $ry1) * 0.28);
                        $bgDraw->roundRectangle($rx1, $ry1, $rx2, $ry2, $rad, $rad);
                        $img->drawImage($bgDraw);
                        $bgDraw->destroy();
                    }

                    $txtColor = ($bgStyle === 'solid' && $color !== '#FFFFFF') ? '#FFFFFF' : $color;
                    $textDraw = new \ImagickDraw();
                    if ($fontPath) {
                        $textDraw->setFont($fontPath);
                    }
                    $textDraw->setFontSize($fontSize);
                    $textDraw->setFillColor(new \ImagickPixel($txtColor));
                    $textDraw->setTextAntialias(true);

                    if ($bgStyle === 'none') {
                        $shadowDraw = clone $textDraw;
                        $shadowDraw->setFillColor(new \ImagickPixel('rgba(0,0,0,0.65)'));
                        foreach ($shapedLines as $idx => $sl) {
                            $m = $img->queryFontMetrics($shadowDraw, $sl ?: ' ');
                            $lw = (float) ($m['textWidth'] ?? 0);
                            $lx = $tx - $lw / 2 + 2;
                            $ly = ($ty - $totalH / 2) + ($idx + 0.82) * $lineHeight + 2;
                            $img->annotateImage($shadowDraw, $lx, $ly, 0, $sl);
                        }
                        $shadowDraw->destroy();
                    }

                    foreach ($shapedLines as $idx => $sl) {
                        $m = $img->queryFontMetrics($textDraw, $sl ?: ' ');
                        $lw = (float) ($m['textWidth'] ?? 0);
                        $lx = $tx - $lw / 2;
                        $ly = ($ty - $totalH / 2) + ($idx + 0.82) * $lineHeight;
                        $img->annotateImage($textDraw, $lx, $ly, 0, $sl);
                    }
                    $textDraw->destroy();
                }
            }

            $outName = 'crm_' . time() . '_' . Str::random(8) . '.jpg';
            $outPath = rtrim($outDir, '/') . '/' . $outName;
            $img->setImageFormat('jpeg');
            $img->setImageCompression(\Imagick::COMPRESSION_JPEG);
            $img->setImageCompressionQuality(90);
            $img->writeImage($outPath);
            $img->clear();
            $img->destroy();

            return [
                'name' => $outName,
                'path' => $outPath,
                'mime' => 'image/jpeg',
            ];
        } catch (\Throwable $e) {
            Log::warning('CRM image edit failed: ' . $e->getMessage());
            return null;
        }
    }

    public function applyVideoEdits(string $srcPath, array $spec, string $outDir): ?array
    {
        if (!is_file($srcPath)) {
            return null;
        }

        try {
            $start = max(0.0, (float) ($spec['trimStart'] ?? 0));
            $end = (float) ($spec['trimEnd'] ?? 0);
            $mute = !empty($spec['muteAudio']);

            $outName = 'crm_' . time() . '_' . Str::random(8) . '.mp4';
            $outPath = rtrim($outDir, '/') . '/' . $outName;

            $cmd = ['ffmpeg', '-y'];
            if ($start > 0.05) {
                $cmd[] = '-ss';
                $cmd[] = number_format($start, 2, '.', '');
            }
            if ($end > $start + 0.2) {
                $cmd[] = '-to';
                $cmd[] = number_format($end, 2, '.', '');
            }
            $cmd[] = '-i';
            $cmd[] = $srcPath;
            $cmd[] = '-c:v';
            $cmd[] = 'libx264';
            $cmd[] = '-preset';
            $cmd[] = 'veryfast';
            $cmd[] = '-crf';
            $cmd[] = '25';
            $cmd[] = '-pix_fmt';
            $cmd[] = 'yuv420p';

            if ($mute) {
                $cmd[] = '-an';
            } else {
                $cmd[] = '-c:a';
                $cmd[] = 'aac';
                $cmd[] = '-b:a';
                $cmd[] = '128k';
            }
            $cmd[] = '-movflags';
            $cmd[] = '+faststart';
            $cmd[] = $outPath;

            Process::timeout(90)->run($cmd)->throw();

            $seconds = null;
            $probe = Process::run([
                'ffprobe', '-v', 'error', '-show_entries', 'format=duration',
                '-of', 'csv=p=0', $outPath,
            ]);
            if ($probe->successful()) {
                $seconds = max(1, (int) round((float) trim($probe->output())));
            }

            return [
                'name' => $outName,
                'path' => $outPath,
                'mime' => 'video/mp4',
                'seconds' => $seconds,
            ];
        } catch (\Throwable $e) {
            Log::warning('CRM video edit failed: ' . $e->getMessage());
            if (isset($outPath) && is_file($outPath)) {
                @unlink($outPath);
            }
            return null;
        }
    }

    private function safeHexColor(string $c): string
    {
        return preg_match('/^#[0-9A-Fa-f]{6}$/', $c) ? $c : '#FFFFFF';
    }

    private function shapeVisualLine(string $line): string
    {
        if (!preg_match('/[\x{0600}-\x{06FF}]/u', $line)) {
            return $line;
        }

        $chars = preg_split('//u', $line, -1, PREG_SPLIT_NO_EMPTY) ?: [];
        $codes = array_map(fn ($ch) => mb_ord($ch, 'UTF-8'), $chars);
        $filtered = [];
        foreach ($codes as $cp) {
            if ($cp >= 0x064B && $cp <= 0x065F) {
                continue;
            }
            $filtered[] = $cp;
        }

        $n = count($filtered);
        $shaped = [];
        for ($i = 0; $i < $n; $i++) {
            $cur = $filtered[$i];
            $next = $i + 1 < $n ? $filtered[$i + 1] : null;
            $prev = count($shaped) > 0 ? $filtered[$i - 1] : null;

            $prevConnects = $prev !== null
                && isset(self::ARABIC_FORMS[$prev])
                && !in_array($prev, self::NON_CONNECTING_NEXT, true);

            if ($cur === 0x0644 && $next !== null && in_array($next, [0x0622, 0x0623, 0x0625, 0x0627], true)) {
                $lamAlef = match ($next) {
                    0x0622 => $prevConnects ? 0xFEF6 : 0xFEF5,
                    0x0623 => $prevConnects ? 0xFEF8 : 0xFEF7,
                    0x0625 => $prevConnects ? 0xFEFA : 0xFEF9,
                    default => $prevConnects ? 0xFEFC : 0xFEFB,
                };
                $shaped[] = ['cp' => $lamAlef, 'rtl' => true];
                $i++;
                continue;
            }

            if (isset(self::ARABIC_FORMS[$cur])) {
                $nextConnects = $next !== null && isset(self::ARABIC_FORMS[$next])
                    && !in_array($cur, self::NON_CONNECTING_NEXT, true);

                $forms = self::ARABIC_FORMS[$cur];
                if ($prevConnects && $nextConnects) {
                    $glyph = $forms[3];
                } elseif ($prevConnects) {
                    $glyph = $forms[1];
                } elseif ($nextConnects) {
                    $glyph = $forms[2];
                } else {
                    $glyph = $forms[0];
                }
                $shaped[] = ['cp' => $glyph, 'rtl' => true];
            } else {
                $isLtrRun = ($cur >= 0x30 && $cur <= 0x39)
                    || ($cur >= 0x41 && $cur <= 0x5A)
                    || ($cur >= 0x61 && $cur <= 0x7A);
                $shaped[] = ['cp' => $cur, 'rtl' => !$isLtrRun];
            }
        }

        $runs = [];
        foreach ($shaped as $item) {
            if (empty($runs) || $runs[count($runs) - 1]['rtl'] !== $item['rtl']) {
                $runs[] = ['rtl' => $item['rtl'], 'cps' => [$item['cp']]];
            } else {
                $runs[count($runs) - 1]['cps'][] = $item['cp'];
            }
        }

        $runs = array_reverse($runs);
        $visualCps = [];
        foreach ($runs as $run) {
            $cps = $run['rtl'] ? array_reverse($run['cps']) : $run['cps'];
            foreach ($cps as $cp) {
                $visualCps[] = $cp;
            }
        }

        return implode('', array_map(fn ($cp) => mb_chr($cp, 'UTF-8'), $visualCps));
    }
}
