import React, { createContext, useContext, useState, useEffect } from 'react';
import { authService } from '../services/authService';
import { setPushUserId, unregisterPushToken } from '../services/notifications';
import { User } from '../types/crm';

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, pass: string) => Promise<{ success: boolean; message?: string }>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  isAgent: boolean;
  isOwner: boolean;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    const initAuth = async () => {
      try {
        const storedToken = await authService.getStoredToken();
        const storedUser = await authService.getStoredUser();

        if (storedToken && storedUser) {
          setToken(storedToken);
          setUser(storedUser);

          // Refresh user profile in background
          authService.getMe().then((res) => {
            if (res.success && res.user) {
              setUser(res.user);
            }
          }).catch(() => {});
        }
      } catch (err) {
        console.error('Failed to restore auth session:', err);
      } finally {
        setIsLoading(false);
      }
    };

    initAuth();
  }, []);

  const login = async (email: string, pass: string) => {
    try {
      const res = await authService.login(email, pass);
      if (res.success && res.token && res.user) {
        setToken(res.token);
        setUser(res.user);
        return { success: true };
      }
      return { success: false, message: res.message || 'بيانات الدخول غير صحيحة' };
    } catch (err: any) {
      console.error(
        'Login request failed:',
        err.code,
        err.message,
        'status:', err.response?.status,
        'url:', err.config?.baseURL + err.config?.url
      );
      const msg = err.response?.data?.message || 'تعذر الاتصال بالخادم، يرجى المحاولة لاحقاً';
      return { success: false, message: msg };
    }
  };

  const logout = async () => {
    try {
      // Detach the device token BEFORE the API token is dropped — after
      // this the backend has no route left to push to this install.
      await unregisterPushToken();
      await authService.logout();
    } finally {
      setUser(null);
      setToken(null);
    }
  };

  const refreshUser = async () => {
    try {
      const res = await authService.getMe();
      if (res.success && res.user) {
        setUser(res.user);
      }
    } catch (err) {
      console.error('Failed to refresh user:', err);
    }
  };

  const isAgent = user?.crm_role === 'agent';
  const isOwner = user?.crm_role === 'owner';
  const isAdmin = user?.crm_role === 'admin';

  // Push notifications carry the target account id — a shared device token
  // from a previous login gets its pushes dropped here instead of shown.
  useEffect(() => {
    setPushUserId(user?.id ?? null);
  }, [user]);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        login,
        logout,
        refreshUser,
        isAgent,
        isOwner,
        isAdmin,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
