export type StaffRole = 'owner' | 'admin' | 'host';
export type AppRole = StaffRole | 'guest';
export type WebsiteTemplate = 'saffron' | 'slate';

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  createdAt?: string;
}

export interface MembershipOption {
  id: string;
  userId: string;
  locationId: string;
  role: StaffRole;
  createdAt?: string;
}

export interface GuestFeatures {
  menu: boolean;
  sms: boolean;
  chat: boolean;
  order: boolean;
}

export interface BrandContext {
  locationId: string;
  restaurantName: string;
  websiteTemplate: WebsiteTemplate;
  publicHost: string;
  guestFeatures: GuestFeatures;
}

export function isStaffRole(role: AppRole | null | undefined): role is StaffRole {
  return role === 'owner' || role === 'admin' || role === 'host';
}

export function isAdminRole(role: AppRole | null | undefined): role is 'owner' | 'admin' {
  return role === 'owner' || role === 'admin';
}

export function roleLabel(role: AppRole | null | undefined): string {
  if (role === 'owner') return 'Owner';
  if (role === 'admin') return 'Admin';
  if (role === 'host') return 'Host';
  if (role === 'guest') return 'Guest';
  return 'OSH';
}
