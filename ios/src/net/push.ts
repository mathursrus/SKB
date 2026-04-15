import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { request } from './client';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export interface RegisterResult {
  granted: boolean;
  token: string | null;
  reason?: string;
}

export async function registerForPushNotifications(): Promise<RegisterResult> {
  if (Platform.OS !== 'ios') {
    return { granted: false, token: null, reason: 'non_ios' };
  }
  if (!Device.isDevice) {
    return { granted: false, token: null, reason: 'simulator' };
  }

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== 'granted') {
    const next = await Notifications.requestPermissionsAsync({
      ios: { allowAlert: true, allowBadge: true, allowSound: true },
    });
    status = next.status;
  }
  if (status !== 'granted') {
    return { granted: false, token: null, reason: 'denied' };
  }

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId;
  if (!projectId || projectId === 'REPLACE_WITH_EAS_PROJECT_ID') {
    return { granted: true, token: null, reason: 'missing_eas_project_id' };
  }

  const tokenResponse = await Notifications.getExpoPushTokenAsync({ projectId });
  return { granted: true, token: tokenResponse.data };
}

export async function registerPushTokenWithBackend(token: string): Promise<void> {
  // The SKB backend doesn't yet expose a push-token registration endpoint — this
  // is a best-effort call. A 404 here is expected until the backend lands; the
  // client still works offline and will send unread-count badges client-side via
  // the polling layer.
  try {
    await request('/host/push-tokens', {
      method: 'POST',
      body: { token, platform: 'ios' },
    });
  } catch {
    // swallow — backend endpoint may not exist yet
  }
}

export function addUnreadBadgeListener(): () => void {
  const sub = Notifications.addNotificationReceivedListener((notification) => {
    const partyId = notification.request.content.data?.partyId;
    if (typeof partyId === 'string') {
      // Consumer side will bump useChatStore unread count on next poll anyway;
      // this listener is primarily for side effects like logging / haptics.
    }
  });
  return () => sub.remove();
}
