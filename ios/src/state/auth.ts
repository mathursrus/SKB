import { create } from 'zustand';

import type { AppRole, BrandContext, MembershipOption, PublicUser } from '@/core/auth';
import { events, logger } from '@/core/logger';
import { ApiError } from '@/net/client';
import { auth as authApi, config as configApi } from '@/net/endpoints';

export type AuthStatus = 'unknown' | 'loggedOut' | 'loggedIn' | 'loggingIn';
export type PendingStage = 'credentials' | 'locationPicker';

interface AuthState {
  status: AuthStatus;
  error: string | null;
  role: AppRole | null;
  user: PublicUser | null;
  locationId: string | null;
  brand: BrandContext | null;
  pendingStage: PendingStage;
  memberships: MembershipOption[];
  hydrate: () => Promise<void>;
  loginStaff: (email: string, password: string, locationId?: string) => Promise<void>;
  chooseMembership: (locationId: string) => Promise<void>;
  continueAsGuest: (locationId: string) => Promise<void>;
  logout: () => Promise<void>;
}

interface LoginDraft {
  email: string;
  password: string;
}

let loginDraft: LoginDraft | null = null;

export const useAuthStore = create<AuthState>((set) => ({
  status: 'unknown',
  error: null,
  role: null,
  user: null,
  locationId: null,
  brand: null,
  pendingStage: 'credentials',
  memberships: [],

  hydrate: async () => {
    try {
      const session = await authApi.me();
      const brand = await configApi.staffBrand(session.locationId).catch(() => ({
        locationId: session.locationId,
        restaurantName: session.locationId,
        websiteTemplate: 'saffron' as const,
        publicHost: '',
        guestFeatures: { menu: true, sms: true, chat: true, order: true },
      }));
      set({
        status: 'loggedIn',
        error: null,
        role: session.role,
        user: session.user,
        locationId: session.locationId,
        brand,
        pendingStage: 'credentials',
        memberships: [],
      });
    } catch (err) {
      if (!(err instanceof ApiError) || err.status !== 401) {
        logger.warn(events.authLoginFailure, {
          reason: err instanceof Error ? err.message : 'hydrate failed',
        });
      }
      set({
        status: 'loggedOut',
        error: null,
        role: null,
        user: null,
        locationId: null,
        brand: null,
        pendingStage: 'credentials',
        memberships: [],
      });
    }
  },

  loginStaff: async (email: string, password: string, locationId?: string) => {
    logger.info(events.authLoginAttempt);
    set({ status: 'loggingIn', error: null });
    try {
      const result = await authApi.login({ email, password, locationId });
      loginDraft = { email, password };
      if ('pickLocation' in result && result.pickLocation) {
        set({
          status: 'loggedOut',
          error: null,
          role: null,
          user: result.user,
          locationId: null,
          brand: null,
          memberships: result.memberships,
          pendingStage: 'locationPicker',
        });
        return;
      }
      const success = result as { user: PublicUser; role: 'owner' | 'admin' | 'host'; locationId: string };
      const brand = await configApi.staffBrand(success.locationId);
      logger.info(events.authLoginSuccess);
      set({
        status: 'loggedIn',
        error: null,
        role: success.role,
        user: success.user,
        locationId: success.locationId,
        brand,
        memberships: [],
        pendingStage: 'credentials',
      });
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.status === 401
            ? 'Invalid email or password'
            : err.status === 429
              ? 'Too many attempts. Try again in 15 minutes.'
              : err.code === 'no membership'
                ? 'This account is not assigned to a restaurant yet.'
                : err.code === 'no membership at location'
                  ? 'That account does not have access to this restaurant.'
                  : err.message
          : 'Sign in failed';
      logger.warn(events.authLoginFailure, { reason: msg });
      set({
        status: 'loggedOut',
        error: msg,
        pendingStage: 'credentials',
        memberships: [],
      });
    }
  },

  chooseMembership: async (locationId: string) => {
    const draft = loginDraft;
    if (!draft) {
      set({
        error: 'Your login expired while choosing a restaurant. Sign in again.',
        pendingStage: 'credentials',
        memberships: [],
      });
      return;
    }
    await useAuthStore.getState().loginStaff(draft.email, draft.password, locationId);
  },

  continueAsGuest: async (locationId: string) => {
    set({ status: 'loggingIn', error: null });
    try {
      const brand = await configApi.publicBrand(locationId.trim().toLowerCase());
      set({
        status: 'loggedIn',
        error: null,
        role: 'guest',
        user: null,
        locationId: brand.locationId,
        brand,
        memberships: [],
        pendingStage: 'credentials',
      });
    } catch (err) {
      const msg =
        err instanceof ApiError && err.status === 404
          ? 'We could not find that restaurant.'
          : err instanceof Error
            ? err.message
            : 'Guest sign-in failed';
      set({
        status: 'loggedOut',
        error: msg,
        role: null,
        user: null,
        locationId: null,
        brand: null,
      });
    }
  },

  logout: async () => {
    logger.info(events.authLogout);
    try {
      if (useAuthStore.getState().role !== 'guest') {
        await authApi.logout();
      }
    } catch {
      // Best effort only.
    }
    loginDraft = null;
    set({
      status: 'loggedOut',
      error: null,
      role: null,
      user: null,
      locationId: null,
      brand: null,
      memberships: [],
      pendingStage: 'credentials',
    });
  },
}));
