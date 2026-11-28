import React, { useEffect, useState } from 'react';
import {
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Application from 'expo-application';
import * as Device from 'expo-device';
import * as IntentLauncher from 'expo-intent-launcher';
import { Colors } from '../constants/theme';

const KEY = 'wavixa_battery_prompted_v1';

// Sideloaded APKs get no OEM whitelisting — Xiaomi/Oppo/Huawei/etc kill the
// process aggressively and FCM stops waking the app, so agents silently miss
// messages for hours. WhatsApp survives the same ROMs because Play-installed
// apps land on the vendors' protected lists. The only fix a sideloaded app
// has is asking once, politely, for the battery exemption + autostart.
const KILLER_OEMS = [
  'xiaomi', 'redmi', 'poco', 'oppo', 'realme', 'vivo', 'iqoo',
  'huawei', 'honor', 'oneplus', 'samsung', 'tecno', 'infinix', 'itel',
];

const oemHint = (manufacturer: string): string => {
  const m = manufacturer.toLowerCase();
  if (m.includes('xiaomi') || m.includes('redmi') || m.includes('poco'))
    return 'وفعّل "التشغيل التلقائي" للتطبيق من الإعدادات ← الأمان ← إدارة التطبيقات';
  if (m.includes('oppo') || m.includes('realme'))
    return 'وفعّل "التشغيل التلقائي" من مدير التطبيقات ← Wavixa';
  if (m.includes('vivo') || m.includes('iqoo'))
    return 'ومن الإعدادات ← البطارية ← إدارة استهلاك التطبيقات ← Wavixa ← "سماح العمل في الخلفية"';
  if (m.includes('huawei') || m.includes('honor'))
    return 'ومن الإعدادات ← التطبيقات ← تشغيل التطبيقات ← Wavixa ← "إدارة يدوية" وفعّل التشغيل التلقائي';
  if (m.includes('samsung'))
    return 'ومن العناية بالجهاز ← البطارية ← استخدام البطارية في الخلفية ← Wavixa ← بدون قيود';
  if (m.includes('oneplus'))
    return 'ومن الإعدادات ← البطارية ← تحسين البطارية ← Wavixa ← "عدم التحسين"';
  return 'ولو جهازك فيه إعداد "تشغيل تلقائي" للتطبيقات فعّله من هناك';
};

export const BatteryOptimizationPrompt: React.FC = () => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    (async () => {
      try {
        if (await AsyncStorage.getItem(KEY)) return;
        const mfr = (Device.manufacturer || '').toLowerCase();
        // Known killers get the prompt; Pixel/stock Android is gentle enough
        // to skip the nag screen entirely.
        if (!KILLER_OEMS.some((o) => mfr.includes(o))) return;
        setVisible(true);
      } catch {}
    })();
  }, []);

  const done = () => {
    setVisible(false);
    AsyncStorage.setItem(KEY, '1').catch(() => undefined);
  };

  const exempt = async () => {
    try {
      await IntentLauncher.startActivityAsync(
        'android.settings.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS',
        { data: `package:${Application.applicationId}` },
      );
    } catch {
      try {
        await IntentLauncher.startActivityAsync(
          IntentLauncher.ActivityAction.IGNORE_BATTERY_OPTIMIZATION_SETTINGS,
        );
      } catch {}
    }
    done();
  };

  if (!visible) return null;

  return (
    <Modal transparent animationType="fade" onRequestClose={done}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.iconWrap}>
            <Ionicons name="battery-half" size={30} color="#F59E0B" />
          </View>
          <Text style={styles.title}>خلّي الإشعارات توصل دايماً</Text>
          <Text style={styles.body}>
            جهاز {Device.manufacturer || 'أندرويد'} بيوقّف التطبيقات في الخلفية
            للحفاظ على البطارية — وممكن يمنع رسايل العملاء من الوصول لساعات.
            {'\n\n'}
            استثني التطبيق من تحسين البطارية{' '}
            {oemHint(Device.manufacturer || '')}.
          </Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={exempt} activeOpacity={0.85}>
            <Ionicons name="shield-checkmark" size={17} color="#FFFFFF" />
            <Text style={styles.primaryBtnText}>استثناء من تحسين البطارية</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.skipBtn} onPress={done} activeOpacity={0.7}>
            <Text style={styles.skipText}>لاحقاً</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 28,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 22,
    alignItems: 'center',
  },
  iconWrap: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111B21',
    marginBottom: 10,
    textAlign: 'center',
  },
  body: {
    fontSize: 13.5,
    lineHeight: 21,
    color: '#3B4A54',
    textAlign: 'center',
    marginBottom: 18,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.primary,
    borderRadius: 24,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignSelf: 'stretch',
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 14.5,
    fontWeight: '700',
  },
  skipBtn: {
    marginTop: 12,
    paddingVertical: 6,
  },
  skipText: {
    fontSize: 13.5,
    color: '#8696A0',
    fontWeight: '600',
  },
});
