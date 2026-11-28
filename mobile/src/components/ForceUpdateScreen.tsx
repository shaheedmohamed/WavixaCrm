import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LatestApk } from '../services/appUpdate';
import { Colors } from '../constants/theme';

export type UpdatePhase =
  | 'downloading'
  | 'installing'
  | 'install_blocked'
  | 'error';

const formatSize = (bytes: number | null | undefined) => {
  if (!bytes) return null;
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(0)} م.ب`;
};

/**
 * Blocking update wall — rendered above EVERYTHING when the server manifest
 * says this build is too old. The download starts automatically, the system
 * installer opens by itself, and the app stays unusable until the new APK is
 * installed. `onDismiss` is only provided for optional (non-mandatory)
 * releases — mandatory walls cannot be closed.
 */
export const ForceUpdateScreen: React.FC<{
  latest: LatestApk;
  phase: UpdatePhase;
  written: number;
  total: number;
  checking: boolean;
  onInstall: () => void;
  onRetry: () => void;
  onOpenSettings: () => void;
  onRecheck: () => void;
  onDismiss?: () => void;
}> = ({
  latest,
  phase,
  written,
  total,
  checking,
  onInstall,
  onRetry,
  onOpenSettings,
  onRecheck,
  onDismiss,
}) => {
  const pct =
    total > 0 ? Math.min(100, Math.round((written / total) * 100)) : 0;
  const mandatory = latest.mandatory;

  return (
    <View style={styles.root}>
      <View style={styles.iconWrap}>
        <Image
          source={require('../../assets/logo.png')}
          style={styles.logo}
        />
      </View>

      <Text style={styles.title}>
        {mandatory ? 'تحديث مطلوب' : 'تحديث متوفر'}
      </Text>
      <Text style={styles.subtitle}>
        في إصدار جديد من التطبيق ({latest.version_name})
        {mandatory ? ' ولازم تحمّله عشان تكمل استخدام التطبيق' : ''}
      </Text>

      {latest.notes ? <Text style={styles.notes}>{latest.notes}</Text> : null}

      {phase === 'downloading' && (
        <View style={styles.progressWrap}>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${pct}%` }]} />
          </View>
          <Text style={styles.progressText}>
            جاري تحميل التحديث… {pct}%
            {total > 0 ? `  (${formatSize(written)} / ${formatSize(total)})` : ''}
          </Text>
          <Text style={styles.progressHint}>سيب التطبيق مفتوح لحد ما التحميل يخلص</Text>
        </View>
      )}

      {phase === 'installing' && (
        <View style={styles.progressWrap}>
          <ActivityIndicator size="small" color="#FFFFFF" />
          <Text style={styles.progressText}>
            التحميل خلص — لو نافذة التثبيت مشفتش، اضغط الزر تحت
          </Text>
          <TouchableOpacity
            style={styles.downloadBtn}
            activeOpacity={0.85}
            onPress={onInstall}
          >
            <Ionicons name="download-outline" size={20} color="#FFFFFF" />
            <Text style={styles.downloadText}>ثبّت التحديث</Text>
          </TouchableOpacity>
        </View>
      )}

      {phase === 'install_blocked' && (
        <View style={styles.progressWrap}>
          <Ionicons name="shield-checkmark-outline" size={30} color="#FFD166" />
          <Text style={styles.progressText}>
            النظام محتاج إذن «تثبيت تطبيقات من مصادر غير معروفة» للتطبيق ده. افتح
            الإعدادات، فعّل الإذن، وارجع — التثبيت هيكمل لوحده.
          </Text>
          <TouchableOpacity
            style={styles.downloadBtn}
            activeOpacity={0.85}
            onPress={onOpenSettings}
          >
            <Ionicons name="settings-outline" size={20} color="#FFFFFF" />
            <Text style={styles.downloadText}>افتح إعدادات التثبيت</Text>
          </TouchableOpacity>
        </View>
      )}

      {phase === 'error' && (
        <View style={styles.progressWrap}>
          <Ionicons name="cloud-offline-outline" size={30} color="#FF8A80" />
          <Text style={styles.progressText}>
            التحميل وقف — اتأكد من النت وحاول تاني
          </Text>
          <TouchableOpacity
            style={styles.downloadBtn}
            activeOpacity={0.85}
            onPress={onRetry}
          >
            <Ionicons name="refresh" size={20} color="#FFFFFF" />
            <Text style={styles.downloadText}>
              حمّل التحديث{formatSize(latest.size_bytes) ? ` (${formatSize(latest.size_bytes)})` : ''}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {onDismiss ? (
        <TouchableOpacity
          style={styles.recheckBtn}
          activeOpacity={0.7}
          onPress={onDismiss}
        >
          <Ionicons name="time-outline" size={16} color="rgba(255,255,255,0.7)" />
          <Text style={styles.dismissText}>لاحقاً</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          style={styles.recheckBtn}
          activeOpacity={0.7}
          onPress={onRecheck}
          disabled={checking}
        >
          {checking ? (
            <ActivityIndicator size="small" color={Colors.primary} />
          ) : (
            <>
              <Ionicons name="refresh" size={16} color={Colors.primary} />
              <Text style={styles.recheckText}>حدّثت التطبيق؟ اضغط هنا للمتابعة</Text>
            </>
          )}
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Colors.headerBg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    zIndex: 9999,
    elevation: 9999,
  },
  iconWrap: {
    width: 104,
    height: 104,
    borderRadius: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 26,
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    overflow: 'hidden',
  },
  logo: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 10,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.85)',
    textAlign: 'center',
    lineHeight: 23,
    marginBottom: 8,
  },
  notes: {
    fontSize: 13.5,
    color: 'rgba(255,255,255,0.65)',
    textAlign: 'center',
    lineHeight: 20,
    marginTop: 6,
    marginBottom: 4,
    paddingHorizontal: 8,
  },
  progressWrap: {
    alignItems: 'center',
    marginTop: 26,
    width: '100%',
    gap: 12,
  },
  progressTrack: {
    width: '100%',
    height: 10,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.18)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 6,
    backgroundColor: Colors.secondary,
  },
  progressText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
    textAlign: 'center',
    lineHeight: 21,
  },
  progressHint: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
  },
  downloadBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.primary,
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: 30,
    marginTop: 8,
    elevation: 4,
  },
  downloadText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  recheckBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    marginTop: 18,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  recheckText: {
    color: Colors.primary,
    fontSize: 13.5,
    fontWeight: '600',
  },
  dismissText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13.5,
    fontWeight: '600',
  },
});
