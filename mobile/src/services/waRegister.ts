import { NativeModules } from 'react-native';
import { apiClient } from './api';

const { WaAttestation } = NativeModules as {
  WaAttestation?: {
    attestAndSign: (
      authkeyB64: string,
      dataToSign: string
    ) => Promise<{ authorization: string; h: string }>;
  };
};

const b64url = (b64: string) =>
  b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export const waAttestationAvailable = () => !!WaAttestation?.attestAndSign;

const attest = async (authkeyB64: string, enc: string) => {
  if (!WaAttestation?.attestAndSign) {
    throw new Error('وحدة التحقق غير متوفرة — حدّث التطبيق');
  }
  const res = await WaAttestation.attestAndSign(authkeyB64, enc);
  return { authorization: res.authorization, h: b64url(res.h) };
};

const newSessionId = () =>
  `wa-reg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export interface WaRegCheckResult {
  exists: boolean;
  login?: string;
}

export interface WaRegPrepareResult {
  enc: string;
  authkey: string;
  phoneNumber?: string;
}

export const waRegisterCheck = async (phone: string): Promise<WaRegCheckResult> => {
  const { data } = await apiClient.post('/crm/wa-register/check', { phone });
  return { exists: !!data?.exists, login: data?.login };
};

export const waRegisterPrepareCode = async (
  sessionId: string,
  phone: string
): Promise<WaRegPrepareResult> => {
  const { data } = await apiClient.post('/crm/wa-register/prepare-code', { sessionId, phone });
  if (!data?.success) throw new Error(data?.message || 'فشل تجهيز الطلب');
  return data;
};

export const waRegisterSendCode = async (
  sessionId: string,
  authkeyB64: string,
  enc: string
): Promise<Record<string, unknown>> => {
  const { authorization, h } = await attest(authkeyB64, enc);
  const { data } = await apiClient.post('/crm/wa-register/request-code', {
    sessionId,
    authorization,
    h,
  });
  if (!data?.success) {
    const reason = data?.response?.reason || data?.message || 'فشل طلب الرمز';
    const err = new Error(String(reason)) as Error & { response?: unknown };
    err.response = data?.response;
    throw err;
  }
  return data.result || {};
};

export const waRegisterPrepareRegister = async (
  sessionId: string,
  code: string
): Promise<{ enc: string }> => {
  const { data } = await apiClient.post('/crm/wa-register/prepare-register', { sessionId, code });
  if (!data?.success) throw new Error(data?.message || 'فشل تجهيز التسجيل');
  return data;
};

export const waRegisterSubmitCode = async (
  sessionId: string,
  code: string,
  enc: string,
  authkeyB64: string,
  pushName?: string
): Promise<Record<string, unknown>> => {
  const { authorization, h } = await attest(authkeyB64, enc);
  const { data } = await apiClient.post('/crm/wa-register/submit-code', {
    sessionId,
    code,
    authorization,
    h,
    pushName,
  });
  if (!data?.success) {
    const reason = data?.response?.reason || data?.message || 'فشل تأكيد الرمز';
    const err = new Error(String(reason)) as Error & { response?: unknown };
    err.response = data?.response;
    throw err;
  }
  return data;
};

export const waRegisterNewSessionId = newSessionId;
