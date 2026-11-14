import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Config } from '../constants/config';
import { User } from '../types/crm';

const TOKEN_KEY = 'wavixa_crm_token';
const USER_KEY = 'wavixa_crm_user';

export const apiClient = axios.create({
  baseURL: Config.API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'X-Platform': 'mobile',
  },
});

let cachedToken: string | null = null;

export const setAuthToken = async (token: string | null) => {
  cachedToken = token;
  if (token) {
    await AsyncStorage.setItem(TOKEN_KEY, token);
    apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  } else {
    await AsyncStorage.removeItem(TOKEN_KEY);
    delete apiClient.defaults.headers.common['Authorization'];
  }
};

export const getStoredToken = async (): Promise<string | null> => {
  if (cachedToken) return cachedToken;
  try {
    const token = await AsyncStorage.getItem(TOKEN_KEY);
    if (token) {
      cachedToken = token;
      apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    }
    return token;
  } catch {
    return null;
  }
};

export const setStoredUser = async (user: User | null) => {
  if (user) {
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
  } else {
    await AsyncStorage.removeItem(USER_KEY);
  }
};

export const getStoredUser = async (): Promise<User | null> => {
  try {
    const raw = await AsyncStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

// Request interceptor to ensure token is present
apiClient.interceptors.request.use(async (config) => {
  if (!config.headers['Authorization']) {
    const token = await getStoredToken();
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }
  }
  return config;
});

// Response interceptor
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      await setAuthToken(null);
      await setStoredUser(null);
    }
    return Promise.reject(error);
  }
);
