/**
 * Self-update for the employee app — replaces manual APK sideloading.
 *
 * The server publishes releases via `php artisan crm:apk-publish`, which
 * registers the APK's real versionCode (aapt-parsed) and broadcasts an
 * `app.update` realtime event. This module checks the public
 * /api/app-release/latest endpoint, downloads the APK in-app with progress
 * (no browser), verifies size + sha256, then hands the file to the Android
 * package installer through our FileProvider content URI.
 *
 * The only unavoidable manual step is Android's own "update app?" system
 * dialog — silent installs require a device-owner/system app.
 */
import * as Application from 'expo-application';
import * as IntentLauncher from 'expo-intent-launcher';
import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';
import { Config } from '../constants/config';

export type LatestApk = {
  version_code: number;
  version_name: string;
  file_name: string;
  size_bytes: number;
  sha256: string | null;
  notes: string | null;
  mandatory: boolean;
  published_at: string | null;
  apk_url: string;
};

const FLAG_GRANT_READ_URI_PERMISSION = 0x00000001;
const FLAG_ACTIVITY_NEW_TASK = 0x10000000;

export function installedVersionCode(): number {
  const raw = Application.nativeBuildVersion;
  const parsed = raw ? parseInt(raw, 10) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function fetchLatestRelease(): Promise<LatestApk | null> {
  try {
    const res = await fetch(
      `${Config.API_BASE_URL}/app-release/latest?v=${Date.now()}`,
      { headers: { Accept: 'application/json' } }
    );
    if (!res.ok) return null;
    const body = await res.json();
    const r = body?.release;
    if (!r || typeof r.version_code !== 'number' || !r.apk_url) return null;
    return r as LatestApk;
  } catch {
    return null;
  }
}

export function updateAvailable(latest: LatestApk | null): boolean {
  if (!latest) return false;
  return latest.version_code > installedVersionCode();
}

/**
 * Downloads the release APK into the cache dir with byte progress. Skips the
 * transfer when a previous run already fetched a verified copy of the same
 * versionCode (e.g. the user backed out of the installer and came back).
 * Throws on size/sha256 mismatch — corrupt files never reach the installer.
 */
export async function downloadApk(
  latest: LatestApk,
  onProgress?: (written: number, total: number) => void
): Promise<File> {
  const target = new File(Paths.cache, `wavixa-v${latest.version_code}.apk`);

  if (target.exists && (await verifyFile(target, latest))) {
    onProgress?.(latest.size_bytes, latest.size_bytes);
    return target;
  }
  if (target.exists) {
    try { target.delete(); } catch {}
  }

  const task = File.createDownloadTask(latest.apk_url, target, {
    onProgress: ({ bytesWritten, totalBytes }) => {
      onProgress?.(bytesWritten, totalBytes > 0 ? totalBytes : latest.size_bytes);
    },
  });

  let file: File | null;
  try {
    file = await task.downloadAsync();
  } catch (e) {
    try { target.delete(); } catch {}
    throw e;
  }

  if (!file || !(await verifyFile(file, latest))) {
    try { file?.delete(); } catch {}
    throw new Error('Downloaded APK failed integrity check');
  }
  return file;
}

async function verifyFile(file: File, latest: LatestApk): Promise<boolean> {
  try {
    if (!file.exists) return false;
    if (latest.size_bytes > 0 && file.size !== latest.size_bytes) return false;
    if (latest.sha256) {
      const digest = await file.digest('SHA-256');
      if (digest.toLowerCase() !== latest.sha256.toLowerCase()) return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Hands the verified APK to the system installer. If the user never granted
 * "install unknown apps" for this app, the intent is denied — open our
 * MANAGE_UNKNOWN_APP_SOURCES settings page so they can flip it and return.
 * Returns true when an install or settings screen was opened.
 */
export async function launchInstaller(file: File): Promise<'installer' | 'settings' | 'failed'> {
  if (Platform.OS !== 'android') return 'failed';
  try {
    await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
      data: file.contentUri,
      type: 'application/vnd.android.package-archive',
      flags: FLAG_GRANT_READ_URI_PERMISSION | FLAG_ACTIVITY_NEW_TASK,
    });
    return 'installer';
  } catch {
    // fall through to the settings deep-link
  }
  try {
    await IntentLauncher.startActivityAsync(
      IntentLauncher.ActivityAction.MANAGE_UNKNOWN_APP_SOURCES,
      { data: `package:${Application.applicationId}` }
    );
    return 'settings';
  } catch {
    return 'failed';
  }
}
