import { apiClient, setAuthToken, setStoredUser, getStoredToken, getStoredUser } from './api';
import { User } from '../types/crm';

export interface LoginResponse {
  success: boolean;
  token?: string;
  user?: User;
  message?: string;
}

export const authService = {
  async login(email: string, password: string): Promise<LoginResponse> {
    const response = await apiClient.post<LoginResponse>('/crm/auth/login', {
      email: email.trim().toLowerCase(),
      password,
    });

    if (response.data.success && response.data.token && response.data.user) {
      await setAuthToken(response.data.token);
      await setStoredUser(response.data.user);
    }
    return response.data;
  },

  async getMe(): Promise<{ success: boolean; user?: User; message?: string }> {
    const response = await apiClient.get('/crm/me');
    if (response.data.success && response.data.user) {
      await setStoredUser(response.data.user);
    }
    return response.data;
  },

  async logout(): Promise<void> {
    await setAuthToken(null);
    await setStoredUser(null);
  },

  getStoredToken,
  getStoredUser,
};
