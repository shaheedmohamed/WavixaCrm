import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import type { File } from 'expo-file-system';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Application from 'expo-application';
import { realtime } from '../services/realtime';
import {
  downloadApk,
  fetchLatestRelease,
  launchInstaller,
  updateAvailable,
  type LatestApk,
} from '../services/appUpdate';
import { ForceUpdateScreen, type UpdatePhase } from './ForceUpdateScreen';

const RECHECK_MS = 5 * 60 * 1000;

/**
 * Update wall mounted above the whole app in _layout.tsx. Polls the public
 * /api/app-release/latest endpoint on launch, every foreground return and on
 * a 5-minute timer — plus instantly via the `app.update` realtime event the
 * backend broadcasts when crm:apk-publish runs. Mandatory releases block the
 * app until the new APK is installed; optional ones can be dismissed.
 *
 * Android only — iOS builds ignore the gate entirely.
 */
export const UpdateGate: React.FC = () => {
  const [latest, setLatest] = useState<LatestApk | null>(null);
  const [phase, setPhase] = useState<UpdatePhase>('downloading');
  const [written, setWritten] = useState(0);
  const [checking, setChecking] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const fileRef = useRef<File | null>(null);
  const busyRef = useRef(false);
  const latestRef = useRef<LatestApk | null>(null);

  const visible = !!latest && (latest.mandatory || !dismissed);

  const check = useCallback(async () => {
    if (Platform.OS !== 'android') return;
    setChecking(true);
    const rel = await fetchLatestRelease();
    setChecking(false);
    if (!updateAvailable(rel)) {
      latestRef.current = null;
      setLatest(null);
      fileRef.current = null;
      return;
    }
    // A newer release was published while an older download sat on the wall —
    // drop the stale file so the effect below refetches the right APK.
    if (rel!.version_code !== latestRef.current?.version_code) {
      fileRef.current = null;
    }
    latestRef.current = rel;
    setLatest(rel);
    if (rel!.mandatory) setDismissed(false);
  }, []);

  const startDownload = useCallback(async (rel: LatestApk) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setPhase('downloading');
    setWritten(0);
    try {
      const file = await downloadApk(rel, (w) => setWritten(w));
      fileRef.current = file;
      setPhase('installing');
      const res = await launchInstaller(file);
      if (res !== 'installer') setPhase('install_blocked');
    } catch {
      setPhase('error');
    } finally {
      busyRef.current = false;
    }
  }, []);

  const relaunchInstaller = useCallback(async () => {
    const file = fileRef.current;
    if (!file) return;
    setPhase('installing');
    const res = await launchInstaller(file);
    if (res !== 'installer') setPhase('install_blocked');
  }, []);

  // Kick off the download as soon as a pending release becomes visible.
  useEffect(() => {
    if (visible && latest && !fileRef.current && !busyRef.current && phase !== 'error') {
      startDownload(latest);
    }
  }, [visible, latest, dismissed, phase, startDownload]);

  useEffect(() => {
    // Deferred so the initial check doesn't setState synchronously in the
    // effect body (react-hooks/set-state-in-effect).
    const kickoff = setTimeout(check, 0);
    const timer = setInterval(check, RECHECK_MS);
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      check();
      // Returning from the unknown-sources settings screen → resume the
      // installer automatically; the APK is already downloaded and verified.
      if (phase === 'install_blocked' && fileRef.current) {
        relaunchInstaller();
      }
    });
    const offRealtime = realtime.on((ev) => {
      if (ev.type === 'app.update') check();
    });
    return () => {
      clearTimeout(kickoff);
      clearInterval(timer);
      sub.remove();
      offRealtime();
    };
  }, [check, phase, relaunchInstaller]);

  if (!visible || !latest) return null;

  return (
    <ForceUpdateScreen
      latest={latest}
      phase={phase}
      written={written}
      total={latest.size_bytes}
      checking={checking}
      onInstall={() => {
        if (fileRef.current) relaunchInstaller();
        else startDownload(latest);
      }}
      onRetry={() => startDownload(latest)}
      onOpenSettings={() => {
        IntentLauncher.startActivityAsync(
          IntentLauncher.ActivityAction.MANAGE_UNKNOWN_APP_SOURCES,
          { data: `package:${Application.applicationId}` }
        ).catch(() => {});
      }}
      onRecheck={check}
      onDismiss={latest.mandatory ? undefined : () => setDismissed(true)}
    />
  );
};
