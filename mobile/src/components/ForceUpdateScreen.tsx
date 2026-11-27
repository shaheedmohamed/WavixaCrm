import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Linking,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LatestApk } from '../services/appUpdate';
import { Colors } from '../constants/theme';

const formatSize = (bytes: number | null | undefined) => {
  if (!bytes) return null;
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(0)} م.ب`;
};

/**
 * Blocking update wall — rendered above EVERYTHING when the server
 * manifest says this build is too old. No close button, no back handling:
 * the app stays unusable until the new APK is installed, exactly like a
 * banking app's mandatory update.
 */
export const ForceUpdateScreen: React.FC<{
  latest: LatestApk;
  checking: boolean;
  onRecheck: () => void;
}> = ({ latest, checking, onRecheck }) => (
  <View style={styles.root}>
    <View style={styles.iconWrap}>
      <Ionicons name="rocket-outline" size={46} color="#FFFFFF" />
    </View>

    <Text style={styles.title}>تحديث مطلوب</Text>
    <Text style={styles.subtitle}>
      في إصدار جديد من التطبيق ({latest.version_name}) ولازم تحمّله عشان تكمل استخدام التطبيق
    </Text>

    {latest.notes ? <Text style={styles.notes}>{latest.notes}</Text> : null}

    <TouchableOpacity
      style={styles.downloadBtn}
      activeOpacity={0.85}
      onPress={() => latest.apk_url && Linking.openURL(latest.apk_url).catch(() => {})}
    >
      <Ionicons name="download-outline" size={20} color="#FFFFFF" />
      <Text style={styles.downloadText}>
        حمّل التحديث{formatSize(latest.size_bytes) ? ` (${formatSize(latest.size_bytes)})` : ''}
      </Text>
    </TouchableOpacity>

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

    <Text style={styles.hint}>
      لو التثبيت متعطّل، فعّل "التثبيت من مصادر غير معروفة" للمتصفح وارجع هنا
    </Text>
  </View>
);

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.headerBg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    zIndex: 9999,
    elevation: 9999,
  },
  iconWrap: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 26,
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
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
  downloadBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.primary,
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: 30,
    marginTop: 24,
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
  hint: {
    position: 'absolute',
    bottom: 40,
    fontSize: 12,
    color: 'rgba(255,255,255,0.45)',
    textAlign: 'center',
    paddingHorizontal: 30,
    lineHeight: 18,
  },
});
