import { create } from 'zustand';

import { events, logger } from '@/core/logger';
import { ApiError } from '@/net/client';
import { auth as authApi, waitlist as waitlistApi } from '@/net/endpoints';

export type AuthStatus = 'unknown' | 'loggedOut' | 'loggedIn' | 'loggingIn';

interface AuthState {
  status: AuthStatus;
  error: string | null;
  hydrate: () => Promise<void>;
  login: (pin: string) => Promise<void>;
  logout: () => Promise<void>;
}

// Session lives in iOS NSHTTPCookieStorage / Android CookieJar — both persist
// across app launches by default. Hydrate probes with a lightweight authed
// endpoint (GET /host/queue, already used by the waiting tab) to decide
// whether the platform still holds a valid session cookie.
export const useAuthStore = create<AuthState>((set) => ({
  status: 'unknown',
  error: null,

  hydrate: async () => {
    try {
      await waitlistApi.listWaiting();
      set({ status: 'loggedIn', error: null });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        set({ status: 'loggedOut', error: null });
      } else {
        // Network/other — default to loggedOut so the user sees the PIN
        // screen rather than an empty waiting tab with a silent fetch error.
        set({ status: 'loggedOut', error: null });
      }
    }
  },

  login: async (pin: string) => {
    logger.info(events.authLoginAttempt);
    set({ status: 'loggingIn', error: null });
    try {
      await authApi.login(pin);
      // Cookie stored by the platform; nothing for us to persist.
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
      // Server may be unreachable — we still reset local state so the user
      // sees the PIN screen. The cookie will expire on its own or get
      // overwritten on next successful login.
    }
    set({ status: 'loggedOut', error: null });
  },
}));
