import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { CareBotLogo } from '../components/CareBotLogo';
import { KeyboardSafeView } from '../components/KeyboardSafeView';
import { Colors } from '../constants/theme';

interface LoginScreenProps {
  onLoginSuccess: () => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLoginSuccess }) => {
  const insets = useSafeAreaInsets();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!email.trim() || !password) {
      setError('يرجى إدخال البريد الإلكتروني وكلمة المرور');
      return;
    }

    setLoading(true);
    setError('');

    const res = await login(email.trim(), password);
    setLoading(false);

    if (res.success) {
      onLoginSuccess();
    } else {
      setError(res.message || 'بيانات الدخول غير صحيحة');
    }
  };

  return (
    <View style={styles.safeArea}>
      <KeyboardSafeView style={styles.container}>
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: Math.max(insets.bottom + 20, 30) }]}
          keyboardShouldPersistTaps="handled"
        >
          {/* Brand Card Header with Safe Status Bar padding */}
          <View style={[styles.topCard, { paddingTop: Math.max(insets.top + 16, 36) }]}>
            <CareBotLogo size="large" lightText />
            <Text style={styles.tagline}>بوابة الموظفين وخدمة العملاء</Text>
          </View>

          {/* Form */}
          <View style={styles.formContainer}>
            <Text style={styles.welcomeTitle}>تسجيل الدخول</Text>
            <Text style={styles.welcomeSub}>
              أدخل بيانات حسابك المسجل للمتابعة إلى المحادثات
            </Text>

            {error ? (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle" size={18} color="#EF4444" />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            {/* Email field */}
            <Text style={styles.label}>البريد الإلكتروني:</Text>
            <View style={styles.inputWrap}>
              <Ionicons name="mail-outline" size={19} color="#8696A0" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="name@carebot.com"
                placeholderTextColor="#8696A0"
                keyboardType="email-address"
                autoCapitalize="none"
                value={email}
                onChangeText={setEmail}
                textAlign="right"
              />
            </View>

            {/* Password field */}
            <Text style={styles.label}>كلمة المرور:</Text>
            <View style={styles.inputWrap}>
              <TouchableOpacity
                onPress={() => setShowPassword(!showPassword)}
                style={styles.eyeBtn}
              >
                <Ionicons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={19}
                  color="#8696A0"
                />
              </TouchableOpacity>
              <TextInput
                style={styles.input}
                placeholder="••••••••"
                placeholderTextColor="#8696A0"
                secureTextEntry={!showPassword}
                value={password}
                onChangeText={setPassword}
                textAlign="right"
              />
              <Ionicons name="lock-closed-outline" size={19} color="#8696A0" style={styles.inputIcon} />
            </View>

            {/* Submit button */}
            <TouchableOpacity
              style={[styles.submitButton, loading && styles.submitButtonDisabled]}
              onPress={handleSubmit}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.submitText}>دخول للنظام</Text>
              )}
            </TouchableOpacity>

            <View style={styles.footerInfo}>
              <Ionicons name="shield-checkmark" size={16} color={Colors.primary} />
              <Text style={styles.footerText}>اتصال آمن ومباشر مع CareBot</Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardSafeView>
    </View>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.headerBg,
  },
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  scrollContent: {
    flexGrow: 1,
  },
  topCard: {
    backgroundColor: Colors.headerBg,
    paddingTop: 36,
    paddingBottom: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  tagline: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 8,
  },
  formContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 24,
    paddingTop: 28,
  },
  welcomeTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111B21',
    textAlign: 'right',
    marginBottom: 4,
  },
  welcomeSub: {
    fontSize: 12.5,
    color: '#667781',
    textAlign: 'right',
    lineHeight: 18,
    marginBottom: 20,
  },
  errorBox: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    marginBottom: 16,
    gap: 8,
  },
  errorText: {
    color: '#EF4444',
    fontSize: 12.5,
    fontWeight: '600',
    flex: 1,
    textAlign: 'right',
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: '#54656F',
    marginBottom: 6,
    textAlign: 'right',
  },
  inputWrap: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: '#F8FAFB',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 48,
    marginBottom: 16,
  },
  inputIcon: {
    marginLeft: 6,
  },
  eyeBtn: {
    padding: 6,
    marginRight: 2,
  },
  input: {
    flex: 1,
    height: '100%',
    color: '#111B21',
    fontSize: 13.5,
  },
  submitButton: {
    backgroundColor: Colors.primary,
    borderRadius: 14,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    shadowColor: Colors.primaryDark,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
  submitButtonDisabled: {
    opacity: 0.7,
  },
  submitText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  footerInfo: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 28,
    gap: 6,
  },
  footerText: {
    color: '#8696A0',
    fontSize: 11.5,
    fontWeight: '500',
  },
});
