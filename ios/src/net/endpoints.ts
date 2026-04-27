import type {
  ChatMessage,
  ChatTemplates,
  ChatThread,
  CompletedParty,
  CompletedSummary,
  PartyId,
  SeatedParty,
  WaitingParty,
} from '@/core/party';
import type {
  BrandContext,
  MembershipOption,
  PublicUser,
  StaffRole,
  WebsiteTemplate,
} from '@/core/auth';
import type { GuestFeatures } from '@/core/auth';

export type { GuestFeatures };
import type { GuestChatThread, GuestStatus, QueueState } from '@/core/guest';

import { platformRequest, request } from './client';

export interface LoginSuccessResponse {
  ok: true;
  user: PublicUser;
  role: StaffRole;
  locationId: string;
}

export interface LoginPickerResponse {
  ok: true;
  pickLocation: true;
  user: PublicUser;
  memberships: MembershipOption[];
}

export type LoginResponse = LoginSuccessResponse | LoginPickerResponse;

export const auth = {
  login: (body: { email: string; password: string; locationId?: string }) =>
    platformRequest<LoginResponse>('/login', { method: 'POST', body }),
  me: () => platformRequest<{ user: PublicUser; role: StaffRole; locationId: string }>('/me'),
  logout: () => platformRequest<{ ok: true }>('/logout', { method: 'POST' }),
};

export interface HostQueueResponse {
  parties: WaitingParty[];
  oldestWaitMinutes: number;
  avgTurnTimeMinutes: number;
}

export interface HostDiningResponse {
  parties: SeatedParty[];
  diningCount: number;
}

export interface HostCompletedResponse extends CompletedSummary {
  parties: CompletedParty[];
}

export interface SeatResponse {
  ok: true;
}

export interface AddPartyResponse {
  code: string;
  position: number;
  etaAt: string;
  etaMinutes: number;
}

export interface PublicConfigResponse {
  name: string;
  publicHost?: string;
  websiteTemplate?: WebsiteTemplate;
  guestFeatures?: GuestFeatures;
}

export interface LocationAddress {
  street: string;
  city: string;
  state: string;
  zip: string;
}

export interface ServiceWindow {
  open: string; // HH:mm 24h
  close: string; // HH:mm 24h
}

export type ServiceWindowKey = 'breakfast' | 'lunch' | 'special' | 'dinner';

export interface DayHours {
  breakfast?: ServiceWindow;
  lunch?: ServiceWindow;
  special?: ServiceWindow;
  dinner?: ServiceWindow;
}

export type DayOfWeek = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export type WeeklyHours = {
  [K in DayOfWeek]?: DayHours | 'closed';
};

export interface SiteConfigResponse {
  name: string;
  address: LocationAddress | null;
  hours: WeeklyHours | null;
  publicHost: string;
}

export interface SiteConfigUpdate {
  address?: LocationAddress | null;
  hours?: WeeklyHours | null;
  publicHost?: string | null;
}

export interface WebsiteConfigResponse {
  websiteTemplate: WebsiteTemplate;
  content: {
    heroHeadline?: string;
    heroSubhead?: string;
    about?: string;
    contactEmail?: string;
    instagramHandle?: string;
    reservationsNote?: string;
  } | null;
}

export interface MessagingConfigResponse {
  smsSenderName: string;
  sharedNumber: string;
  twilioVoiceNumber: string;
}

// ─── Menu types (matches src/types/queue.ts) ─────────────────────────
export interface MenuItem {
  id: string;
  name: string;
  description?: string;
  price?: string;
  image?: string;
  availability?: 'available' | 'sold_out';
}
export interface MenuSection {
  id: string;
  title: string;
  items: MenuItem[];
}
export interface LocationMenu {
  sections: MenuSection[];
}
export interface MenuResponse {
  menu: LocationMenu;
  menuUrl: string;
}

// ─── Website content types ────────────────────────────────────────────
export type WebsiteTemplateKey = 'saffron' | 'slate';
export interface KnownForItem {
  title: string;
  desc: string;
  image: string;
}
export interface LocationContent {
  heroHeadline?: string;
  heroSubhead?: string;
  knownFor?: KnownForItem[];
  about?: string;
  contactEmail?: string;
  instagramHandle?: string;
  reservationsNote?: string;
}
export interface WebsiteConfigUpdate {
  websiteTemplate?: WebsiteTemplateKey | null;
  content?: LocationContent | null;
}

// ─── Staff types ──────────────────────────────────────────────────────
export type InvitableRole = 'admin' | 'host';

export interface StaffMember {
  _id: string;
  userId: string;
  email?: string;
  name?: string;
  locationId: string;
  role: 'owner' | 'admin' | 'host';
  createdAt?: string;
}

export interface PendingInvite {
  _id: string;
  email: string;
  name?: string;
  role: InvitableRole;
  locationId: string;
  createdAt?: string;
}

export interface StaffResponse {
  staff: StaffMember[];
  pending: PendingInvite[];
}

// ─── Caller stats types (subset for the iOS funnel + outcomes) ────────
export type CallerOutcome =
  | 'dropped_before_choice'
  | 'dropped_during_name'
  | 'dropped_during_size'
  | 'dropped_during_phone_confirmation'
  | 'front_desk_transfer'
  | 'catering_transfer'
  | 'menu_only'
  | 'hours_only'
  | 'join_error'
  | 'joined_waitlist';

export interface CallerOutcomeStat {
  key: CallerOutcome;
  count: number;
  share: number;
}

export interface CallerStatsResponse {
  dateRange: { from: string; to: string };
  funnel: {
    inboundCalls: number;
    joinIntent: number;
    reachedPhoneConfirmation: number;
    joinedWaitlist: number;
  };
  outcomes: CallerOutcomeStat[];
}

export interface VoiceConfigResponse {
  voiceEnabled: boolean;
  frontDeskPhone: string;
  voiceLargePartyThreshold: number;
}

export interface HostStats {
  partiesSeated: number;
  noShows: number;
  avgActualWaitMinutes: number | null;
  peakHourLabel: string | null;
  configuredTurnTime: number;
  actualTurnTime: number | null;
  totalJoined: number;
  stillWaiting: number;
  avgOrderTimeMinutes: number | null;
  avgServeTimeMinutes: number | null;
  avgCheckoutTimeMinutes: number | null;
  avgTableOccupancyMinutes: number | null;
}

export const waitlist = {
  listWaiting: (locationId: string) => request<HostQueueResponse>('/host/queue', { locationId }),
  listSeated: (locationId: string) => request<HostDiningResponse>('/host/dining', { locationId }),
  listCompleted: (locationId: string) => request<HostCompletedResponse>('/host/completed', { locationId }),
  addParty: (locationId: string, body: { name: string; partySize: number; phone: string }) =>
    request<AddPartyResponse>('/host/queue/add', { method: 'POST', body, locationId }),
  seat: (locationId: string, id: PartyId, tableNumber: number, override = false) =>
    request<SeatResponse>(`/host/queue/${id}/remove`, {
      method: 'POST',
      body: { reason: 'seated', tableNumber, override },
      locationId,
    }),
  noShow: (locationId: string, id: PartyId) =>
    request<{ ok: true }>(`/host/queue/${id}/remove`, {
      method: 'POST',
      body: { reason: 'no_show' },
      locationId,
    }),
  advance: (locationId: string, id: PartyId, state: 'ordered' | 'served' | 'checkout' | 'departed') =>
    request<{ ok: true }>(`/host/queue/${id}/advance`, {
      method: 'POST',
      body: { state },
      locationId,
    }),
};

export const chat = {
  templates: (locationId: string, code: string) =>
    request<ChatTemplates>(`/host/chat/templates?code=${encodeURIComponent(code)}`, { locationId }),
  thread: (locationId: string, id: PartyId) => request<ChatThread>(`/host/queue/${id}/chat`, { locationId }),
  send: (locationId: string, id: PartyId, body: string) =>
    request<{ ok: true; smsStatus: string; message: ChatMessage }>(
      `/host/queue/${id}/chat`,
      { method: 'POST', body: { body }, locationId },
    ),
  markRead: (locationId: string, id: PartyId) =>
    request<{ ok: true; updated: number }>(`/host/queue/${id}/chat/read`, { method: 'PATCH', locationId }),
};

export const calls = {
  log: (locationId: string, id: PartyId) =>
    request<{ ok: true }>(`/host/queue/${id}/call-log`, { method: 'POST', locationId }),
  customCall: (locationId: string, id: PartyId) =>
    request<{ ok: true; smsStatus: string }>(`/host/queue/${id}/call`, { method: 'POST', locationId }),
};

export interface HostSettings {
  avgTurnTimeMinutes: number;
  etaMode: 'manual' | 'dynamic';
  effectiveMinutes: number;
  dynamicMinutes?: number | null;
  sampleSize?: number;
  fellBackToManual?: boolean;
}

export const stats = {
  getStats: (locationId: string) => request<HostStats>('/host/stats', { locationId }),
  getSettings: (locationId: string) => request<HostSettings>('/host/settings', { locationId }),
  saveSettings: (locationId: string, body: { avgTurnTimeMinutes?: number; etaMode?: 'manual' | 'dynamic' }) =>
    request<HostSettings>('/host/settings', { method: 'POST', body, locationId }),
};

export const config = {
  publicBrand: async (locationId: string): Promise<BrandContext> => {
    const data = await request<PublicConfigResponse>('/public-config', { locationId });
    return {
      locationId,
      restaurantName: data.name || locationId,
      websiteTemplate: data.websiteTemplate ?? 'saffron',
      publicHost: data.publicHost ?? '',
      guestFeatures: {
        sms: data.guestFeatures?.sms !== false,
        chat: data.guestFeatures?.chat !== false,
        order: data.guestFeatures?.order !== false,
      },
    };
  },
  staffBrand: async (locationId: string): Promise<BrandContext> => {
    const [site, website, guestFeatures] = await Promise.all([
      request<SiteConfigResponse>('/host/site-config', { locationId }),
      request<WebsiteConfigResponse>('/host/website-config', { locationId }),
      request<GuestFeatures>('/host/guest-features', { locationId }),
    ]);
    return {
      locationId,
      restaurantName: site.name || locationId,
      websiteTemplate: website.websiteTemplate ?? 'saffron',
      publicHost: site.publicHost ?? '',
      guestFeatures: {
        sms: guestFeatures.sms !== false,
        chat: guestFeatures.chat !== false,
        order: guestFeatures.order !== false,
      },
    };
  },
  siteConfig: (locationId: string) => request<SiteConfigResponse>('/host/site-config', { locationId }),
  saveSiteConfig: (locationId: string, body: SiteConfigUpdate) =>
    request<SiteConfigResponse>('/host/site-config', { method: 'POST', body, locationId }),
  websiteConfig: (locationId: string) => request<WebsiteConfigResponse>('/host/website-config', { locationId }),
  saveWebsiteConfig: (locationId: string, body: WebsiteConfigUpdate) =>
    request<WebsiteConfigResponse>('/host/website-config', { method: 'POST', body, locationId }),
  messagingConfig: (locationId: string) => request<MessagingConfigResponse>('/host/messaging-config', { locationId }),
  voiceConfig: (locationId: string) => request<VoiceConfigResponse>('/host/voice-config', { locationId }),
  guestFeatures: (locationId: string) => request<GuestFeatures>('/host/guest-features', { locationId }),
  saveGuestFeatures: (locationId: string, body: GuestFeatures) =>
    request<GuestFeatures>('/host/guest-features', { method: 'POST', body, locationId }),
  saveMessagingConfig: (locationId: string, body: { smsSenderName: string }) =>
    request<MessagingConfigResponse>('/host/messaging-config', { method: 'POST', body, locationId }),
  saveVoiceConfig: (
    locationId: string,
    body: { voiceEnabled: boolean; frontDeskPhone: string; voiceLargePartyThreshold: number },
  ) => request<VoiceConfigResponse>('/host/voice-config', { method: 'POST', body, locationId }),
};

export const staff = {
  list: (locationId: string) => request<StaffResponse>('/staff', { locationId }),
  invite: (locationId: string, body: { email: string; name?: string; role: InvitableRole }) =>
    request<{ invite: PendingInvite }>('/staff/invite', { method: 'POST', body, locationId }),
  revoke: (locationId: string, body: { membershipId?: string; inviteId?: string }) =>
    request<{ ok: true }>('/staff/revoke', { method: 'POST', body, locationId }),
};

export const menu = {
  get: (locationId: string) => request<MenuResponse>('/menu', { locationId }),
  save: (locationId: string, body: { menu?: LocationMenu; menuUrl?: string }) =>
    request<MenuResponse>('/host/menu', { method: 'POST', body, locationId }),
};

export const callerStats = {
  get: (locationId: string, range: '1' | '7' | '30') =>
    request<CallerStatsResponse>(`/host/caller-stats?range=${range}`, { locationId }),
};

export const guest = {
  state: (locationId: string) => request<QueueState>('/queue/state', { locationId }),
  join: (locationId: string, body: { name: string; partySize: number; phone: string; smsConsent?: boolean }) =>
    request<AddPartyResponse>('/queue/join', { method: 'POST', body, locationId }),
  status: (locationId: string, code: string) =>
    request<GuestStatus>(`/queue/status?code=${encodeURIComponent(code)}`, { locationId }),
  thread: (locationId: string, code: string) =>
    request<GuestChatThread>(`/queue/chat/${encodeURIComponent(code)}`, { locationId }),
  sendMessage: (locationId: string, code: string, body: string) =>
    request<{ ok: true }>(`/queue/chat/${encodeURIComponent(code)}`, {
      method: 'POST',
      body: { body },
      locationId,
    }),
  acknowledge: (locationId: string, code: string) =>
    request<{ ok: true }>('/queue/acknowledge', {
      method: 'POST',
      body: { code },
      locationId,
    }),
};
