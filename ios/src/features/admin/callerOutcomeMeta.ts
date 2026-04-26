import type { CallerOutcome } from '@/net/endpoints';

export interface OutcomeMeta {
  label: string;
  type: 'Conversion' | 'Self-service' | 'Transfer' | 'Abandonment' | 'Failure';
  copy: string;
}

/**
 * Static reference data for caller outcomes. Mirrors the labels + descriptions
 * used in the web admin Dashboard so admins see consistent copy across surfaces.
 */
export const CALLER_OUTCOME_META: Record<CallerOutcome, OutcomeMeta> = {
  joined_waitlist: {
    label: 'Joined waitlist',
    type: 'Conversion',
    copy: 'These callers completed the phone flow and became real queue entries — the phone-channel conversion number that matters most operationally.',
  },
  menu_only: {
    label: 'Menu only',
    type: 'Self-service',
    copy: 'These callers resolved their need through menu information alone. Higher counts here mean the IVR is successfully deflecting basic menu questions.',
  },
  hours_only: {
    label: 'Hours / location only',
    type: 'Self-service',
    copy: 'These callers used the IVR for logistical information only. Useful deflection, especially during peak host-stand load.',
  },
  front_desk_transfer: {
    label: 'Front desk transfer',
    type: 'Transfer',
    copy: 'These callers routed to a human host. Use this to judge whether the IVR is deflecting routine traffic or still escalating too much to the floor.',
  },
  catering_transfer: {
    label: 'Catering transfer',
    type: 'Transfer',
    copy: 'Catering requests are intentionally carved out from normal waitlist demand — this separates event/business inquiries from dine-in queue pressure.',
  },
  dropped_before_choice: {
    label: 'Dropped before choice',
    type: 'Abandonment',
    copy: 'These callers reached the greeting but never committed to a path. Check opening prompt length and clarity during peak periods.',
  },
  dropped_during_name: {
    label: 'Dropped during name',
    type: 'Abandonment',
    copy: 'Callers wanted to join but fell off before name capture completed — usually points to speech-recognition friction or a fragile fallback moment.',
  },
  dropped_during_size: {
    label: 'Dropped during size',
    type: 'Abandonment',
    copy: 'Callers made it through name capture but did not finish party size. Revisit keypad instructions and keep the prompt short and unambiguous.',
  },
  dropped_during_phone_confirmation: {
    label: 'Dropped during phone confirmation',
    type: 'Abandonment',
    copy: 'The last self-service hurdle before conversion. Higher drop-off here can indicate caller-ID mistrust or friction around manual phone entry.',
  },
  join_error: {
    label: 'Join error',
    type: 'Failure',
    copy: 'A technical or validation failure interrupted the join flow. These should stay rare; if they climb, inspect logs immediately.',
  },
};

export const OUTCOME_TYPE_COLOR: Record<OutcomeMeta['type'], 'ok' | 'accent' | 'warn'> = {
  Conversion: 'ok',
  'Self-service': 'accent',
  Transfer: 'accent',
  Abandonment: 'warn',
  Failure: 'warn',
};
