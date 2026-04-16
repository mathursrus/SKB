import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

import { events, logger } from '@/core/logger';
import { ApiError, getCookie, setCookie } from '@/net/client';
import { auth as authApi } from '@/net/endpoints';

const COOKIE_KEY = 'skb_host_cookie_v1';

export type AuthStatus = 'unknown' | 'loggedOut' | 'loggedIn' | 'loggingIn';

interface AuthState {
  status: AuthStatus;
  error: string | null;
  hydrate: () => Promise<void>;
  login: (pin: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  status: 'unknown',
  error: null,

  hydrate: async () => {
    const saved = await SecureStore.getItemAsync(COOKIE_KEY);
    if (saved) {
      setCookie(saved);
      set({ status: 'loggedIn', error: null });
    } else {
      set({ status: 'loggedOut', error: null });
    }
  },

  login: async (pin: string) => {
    logger.info(events.authLoginAttempt);
    set({ status: 'loggingIn', error: null });
    try {
      await authApi.login(pin);
      const cookie = getCookie();
      if (cookie) await SecureStore.setItemAsync(COOKIE_KEY, cookie);
      logger.info(events.authLoginSuccess);
      set({ status: 'loggedIn', error: null });
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.status === 401
            ? 'Invalid PIN'
            : err.message
          : 'Login failed';
      logger.warn(events.authLoginFailure, { reason: msg });
      set({ status: 'loggedOut', error: msg });
    }
  },

  logout: async () => {
    logger.info(events.authLogout);
    try {
      await authApi.logout();
    } catch {
      // ignore — we clear local state regardless
    }
    setCookie(null);
    await SecureStore.deleteItemAsync(COOKIE_KEY);
    set({ status: 'loggedOut', error: null });
  },
}));
