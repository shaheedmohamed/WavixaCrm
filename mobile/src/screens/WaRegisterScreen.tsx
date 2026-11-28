import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors } from '../constants/theme';
import {
  waRegisterPrepareCode,
  waRegisterSendCode,
  waRegisterPrepareRegister,
  waRegisterSubmitCode,
  waRegisterNewSessionId,
} from '../services/waRegister';

interface WaRegisterScreenProps {
  onBack: () => void;
}

type Step = 'phone' | 'otp' | 'done';

const friendlyReason = (raw: string): string => {
  const r = raw.toLowerCase();
  if (r.includes('temporarily_unavailable') || r.includes('rate')) {
    return 'واتساب طلب مهلة — انتظر دقائق ثم أعد المحاولة';
  }
  if (r.includes('blocked')) {
    return 'واتساب رفض الطلب من هذا الجهاز — جرّب لاحقاً أو من جهاز آخر';
  }
  if (r.includes('bad_param') || r.includes('bad_format') || r.includes('missing')) {
    return 'صيغة الرقم غير صحيحة — استخدم الصيغة الدولية مثل 2015xxxxxxx';
  }
  if (r.includes('incorrect')) return 'الرمز غير صحيح';
  if (r.includes('mismatch')) return 'الرمز لا يطابق الرقم';
  return raw;
};

export const WaRegisterScreen: React.FC<WaRegisterScreenProps> = ({ onBack }) => {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ phoneNumber?: string; me?: string } | null>(null);

  const sessionIdRef = React.useRef<string | null>(null);
  const authkeyRef = React.useRef<string | null>(null);

  const sendCode = async () => {
    const normalized = phone.replace(/[^\d]/g, '');
    if (normalized.length < 8) {
      setError('أدخل الرقم بالصيغة الدولية بدون + مثل 2015xxxxxxx');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const sessionId = waRegisterNewSessionId();
      sessionIdRef.current = sessionId;
      const prepared = await waRegisterPrepareCode(sessionId, normalized);
      authkeyRef.current = prepared.authkey;
      await waRegisterSendCode(sessionId, prepared.authkey, prepared.enc);
      setStep('otp');
    } catch (e) {
      setError(friendlyReason(e instanceof Error ? e.message : 'فشل إرسال الرمز'));
    } finally {
      setBusy(false);
    }
  };

  const confirmOtp = async () => {
    const code = otp.replace(/[^\d]/g, '');
    if (code.length !== 6) {
      setError('أدخل رمز التحقق المكوّن من 6 أرقام');
      return;
    }
    const sessionId = sessionIdRef.current;
    const authkey = authkeyRef.current;
    if (!sessionId || !authkey) {
      setError('انتهت الجلسة — أعد إدخال الرقم');
      setStep('phone');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const prepared = await waRegisterPrepareRegister(sessionId, code);
      const res = await waRegisterSubmitCode(sessionId, code, prepared.enc, authkey);
      setResult({ phoneNumber: res.phoneNumber as string, me: res.me as string });
      setStep('done');
    } catch (e) {
      setError(friendlyReason(e instanceof Error ? e.message : 'فشل تأكيد الرمز'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.safeArea}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top + 6, 16) }]}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Ionicons name="arrow-forward" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>تسجيل رقم واتساب</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom + 24, 32) }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <MaterialCommunityIcons name="whatsapp" size={38} color="#25D366" />
          </View>
          <Text style={styles.heroTitle}>
            {step === 'done' ? 'اكتمل التسجيل' : 'تسجيل رقم على المنصة'}
          </Text>
          <Text style={styles.heroSub}>
            {step === 'phone' &&
              'سجّل رقم العميل كجهاز واتساب أساسي داخل المنصة. إن كان الرقم مسجلاً على هاتف آخر سيتم نقله تلقائياً بعد تأكيد الرمز.'}
            {step === 'otp' &&
              `أُرسل رمز التحقق إلى ${phone} — أدخله خلال دقائق لإتمام التسجيل.`}
            {step === 'done' &&
              'الرقم أصبح مسجلاً على المنصة والاتصال جارٍ الآن — ستظهر المحادثات في القائمة فور اكتمال المزامنة.'}
          </Text>
        </View>

        {error ? (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle" size={18} color="#DC2626" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {step === 'phone' && (
          <View style={styles.card}>
            <Text style={styles.label}>رقم الهاتف بالصيغة الدولية</Text>
            <View style={styles.inputRow}>
              <Text style={styles.plus}>+</Text>
              <TextInput
                style={styles.input}
                value={phone}
                onChangeText={setPhone}
                placeholder="2015xxxxxxx"
                placeholderTextColor="#8696A0"
                keyboardType="phone-pad"
                textAlign="left"
                editable={!busy}
              />
            </View>
            <Text style={styles.hint}>
              بدون + أو أصفاف بادئة — الرقم سيصله رمز SMS على شريحته.
            </Text>

            <TouchableOpacity
              style={[styles.primaryBtn, busy && styles.primaryBtnBusy]}
              onPress={sendCode}
              disabled={busy}
            >
              {busy ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.primaryBtnText}>إرسال رمز التحقق</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {step === 'otp' && (
          <View style={styles.card}>
            <Text style={styles.label}>رمز التحقق (6 أرقام)</Text>
            <TextInput
              style={[styles.input, styles.otpInput]}
              value={otp}
              onChangeText={setOtp}
              placeholder="••••••"
              placeholderTextColor="#8696A0"
              keyboardType="number-pad"
              maxLength={6}
              textAlign="center"
              editable={!busy}
            />

            <TouchableOpacity
              style={[styles.primaryBtn, busy && styles.primaryBtnBusy]}
              onPress={confirmOtp}
              disabled={busy}
            >
              {busy ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.primaryBtnText}>تأكيد التسجيل</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.linkBtn}
              onPress={() => {
                setStep('phone');
                setOtp('');
                setError(null);
              }}
              disabled={busy}
            >
              <Text style={styles.linkBtnText}>تغيير الرقم أو إعادة الإرسال</Text>
            </TouchableOpacity>
          </View>
        )}

        {step === 'done' && (
          <View style={styles.card}>
            <View style={styles.doneRow}>
              <Ionicons name="checkmark-circle" size={22} color="#00A884" />
              <Text style={styles.doneText}>{result?.phoneNumber || phone}</Text>
            </View>
            {result?.me ? (
              <Text style={styles.doneSub}>معرّف الحساب: {result.me}</Text>
            ) : null}

            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => {
                setStep('phone');
                setPhone('');
                setOtp('');
                setResult(null);
                setError(null);
              }}
            >
              <Text style={styles.primaryBtnText}>تسجيل رقم آخر</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.linkBtn} onPress={onBack}>
              <Text style={styles.linkBtnText}>العودة للمحادثات</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.noteBox}>
          <Ionicons name="information-circle-outline" size={16} color="#667781" />
          <Text style={styles.noteText}>
            التسجيل يجعل المنصة الجهاز الأساسي لهذا الرقم — أي جهاز واتساب آخر
            كان مسجلاً به الرقم سيتم تسجيل خروجه تلقائياً عند اكتمال التسجيل.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.headerBg,
  },
  header: {
    backgroundColor: Colors.headerBg,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backBtn: {
    padding: 4,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  content: {
    flex: 1,
    backgroundColor: '#F0F2F5',
  },
  hero: {
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    paddingVertical: 26,
    paddingHorizontal: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F2F5',
  },
  heroIcon: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#E8F8EF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  heroTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#111B21',
    marginBottom: 8,
  },
  heroSub: {
    fontSize: 12.5,
    color: '#667781',
    textAlign: 'center',
    lineHeight: 19,
  },
  card: {
    backgroundColor: '#FFFFFF',
    margin: 14,
    borderRadius: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E9EDEF',
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: '#111B21',
    textAlign: 'right',
    marginBottom: 10,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#D1D7DB',
    borderRadius: 10,
    paddingHorizontal: 12,
    backgroundColor: '#FAFBFC',
  },
  plus: {
    fontSize: 16,
    fontWeight: '700',
    color: '#667781',
    marginRight: 6,
  },
  input: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 16,
    color: '#111B21',
    letterSpacing: 0.5,
  },
  otpInput: {
    borderWidth: 1,
    borderColor: '#D1D7DB',
    borderRadius: 10,
    backgroundColor: '#FAFBFC',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 8,
    paddingVertical: 12,
  },
  hint: {
    fontSize: 11.5,
    color: '#8696A0',
    textAlign: 'right',
    marginTop: 8,
    lineHeight: 17,
  },
  primaryBtn: {
    backgroundColor: '#00A884',
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 18,
  },
  primaryBtnBusy: {
    opacity: 0.7,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 14.5,
    fontWeight: '800',
  },
  linkBtn: {
    alignItems: 'center',
    paddingVertical: 12,
    marginTop: 4,
  },
  linkBtnText: {
    color: '#00A884',
    fontSize: 13,
    fontWeight: '700',
  },
  errorBox: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
    borderWidth: 1,
    borderRadius: 10,
    marginHorizontal: 14,
    marginTop: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  errorText: {
    flex: 1,
    fontSize: 12.5,
    color: '#B91C1C',
    textAlign: 'right',
    lineHeight: 18,
  },
  doneRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 6,
  },
  doneText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111B21',
  },
  doneSub: {
    fontSize: 11.5,
    color: '#667781',
    textAlign: 'center',
    marginBottom: 4,
  },
  noteBox: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-start',
    gap: 8,
    marginHorizontal: 14,
    marginTop: 6,
    paddingHorizontal: 6,
  },
  noteText: {
    flex: 1,
    fontSize: 11.5,
    color: '#667781',
    textAlign: 'right',
    lineHeight: 17,
  },
});
