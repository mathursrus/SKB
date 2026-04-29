import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { HostSentiment, WaitingParty } from '@/core/party';
import { useWaitlistStore } from '@/state/waitlist';
import { theme } from '@/ui/theme';

import { EtaEditor } from './EtaEditor';
import { LiveClock } from './LiveClock';
import { RowActions } from './RowActions';
import { SentimentPicker } from './Sentiment';

/** Inline status surfaced briefly after a Notify completes. */
export type NotifyFlashStatus = 'sent' | 'failed' | 'not_configured';

interface Props {
  party: WaitingParty;
  baseAt: number;
  notifyFlash?: NotifyFlashStatus;
  onSeat: (party: WaitingParty) => void;
  onNotify: (party: WaitingParty) => void;
  onRemove: (party: WaitingParty) => void;
}

function PartyRowImpl(props: Props) {
  const { party, baseAt, notifyFlash } = props;
  const setSentiment = useWaitlistStore((s) => s.setSentiment);
  const setEta = useWaitlistStore((s) => s.setEta);
  return (
    <View
      accessibilityRole="summary"
      accessibilityLabel={`Party ${party.position}, ${party.name}, size ${party.partySize}`}
      style={[styles.row, party.state === 'called' && styles.rowCalled]}
    >
      <View style={styles.topLine}>
        <View style={styles.position}>
          <Text style={styles.positionText}>#{party.position}</Text>
        </View>
        <View style={styles.main}>
          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={1}>
              {party.name}
            </Text>
            <SentimentPicker
              partyName={party.name}
              sentiment={party.sentiment}
              source={party.sentimentSource}
              onChange={(next) => void setSentiment(party.id, next)}
            />
            {party.state === 'called' && (
              <View style={[styles.badge, styles.badgeCalled]}>
                <Text style={styles.badgeCalledText}>CALLED</Text>
              </View>
            )}
            {party.onMyWayAt != null && party.onMyWayAt !== '' && (
              <View style={[styles.badge, styles.badgeOnTheWay]}>
                <Text style={styles.badgeOnTheWayText}>ON THE WAY</Text>
              </View>
            )}
            {notifyFlash !== undefined && (
              <View
                style={[
                  styles.badge,
                  notifyFlash === 'sent' && styles.badgeFlashOk,
                  notifyFlash === 'failed' && styles.badgeFlashFail,
                  notifyFlash === 'not_configured' && styles.badgeFlashMuted,
                ]}
              >
                <Text style={styles.badgeFlashText}>
                  {notifyFlash === 'sent'
                    ? '✓ SMS sent'
                    : notifyFlash === 'failed'
                      ? '✗ SMS failed'
                      : 'In-app only'}
                </Text>
              </View>
            )}
          </View>
          <Text style={styles.meta} numberOfLines={1}>
            {party.partySize} · {party.phoneMasked}
            {party.calls[0] &&
              ` · ${party.calls.length === 1 ? 'called' : `${party.calls.length}× called`} ${party.calls[0].minutesAgo}m ago${callIcon(party.calls)}`}
          </Text>
        </View>
        <View style={styles.timesBlock}>
          <View style={styles.timeCol}>
            <Text style={styles.timeLabel}>ETA</Text>
            <EtaEditor
              partyName={party.name}
              currentEtaAt={party.etaAt}
              onSave={(next) => void setEta(party.id, next)}
            />
          </View>
          <View style={styles.timeCol}>
            <Text style={styles.timeLabel}>Wait</Text>
            <LiveClock
              joinedAt={party.joinedAt}
              baseMinutes={party.waitingMinutes}
              baseAt={baseAt}
              style={styles.timeValue}
            />
          </View>
        </View>
      </View>
      <View style={styles.actionsRow}>
        <RowActions
          party={party}
          onSeat={() => props.onSeat(party)}
          onNotify={() => props.onNotify(party)}
          onRemove={() => props.onRemove(party)}
        />
      </View>
    </View>
  );
}

/** Mirrors the web's per-call ✓/✗ icon next to the "Nm ago" text. */
function callIcon(calls: WaitingParty['calls']): string {
  const last = calls[calls.length - 1];
  if (!last) return '';
  if (last.smsStatus === 'sent') return ' ✓';
  if (last.smsStatus === 'failed') return ' ✗';
  return '';
}

function sentimentChanged(a: WaitingParty, b: WaitingParty): boolean {
  return a.sentiment !== b.sentiment || a.sentimentSource !== b.sentimentSource;
}

export const PartyRow = memo(PartyRowImpl, (prev, next) => {
  const a = prev.party;
  const b = next.party;
  return (
    a.id === b.id &&
    a.position === b.position &&
    a.name === b.name &&
    a.partySize === b.partySize &&
    a.phoneMasked === b.phoneMasked &&
    a.phoneForDial === b.phoneForDial &&
    a.state === b.state &&
    a.etaAt === b.etaAt &&
    a.joinedAt === b.joinedAt &&
    a.waitingMinutes === b.waitingMinutes &&
    a.unreadChat === b.unreadChat &&
    a.onMyWayAt === b.onMyWayAt &&
    a.calls.length === b.calls.length &&
    !sentimentChanged(a, b) &&
    prev.notifyFlash === next.notifyFlash
  );
});

const styles = StyleSheet.create({
  row: {
    backgroundColor: theme.color.surface,
    borderWidth: 1,
    borderColor: theme.color.line,
    borderRadius: theme.radius.md,
    padding: theme.space.md,
    marginBottom: theme.space.sm,
    gap: theme.space.md,
  },
  rowCalled: { borderColor: theme.color.accent },
  topLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.md,
  },
  position: { minWidth: 34, alignItems: 'flex-start' },
  positionText: {
    color: theme.color.textMuted,
    fontSize: 14,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  main: { flex: 1, minWidth: 0 },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.xs,
    flexWrap: 'wrap',
  },
  name: {
    color: theme.color.text,
    fontSize: 16,
    fontWeight: '600',
    flexShrink: 1,
  },
  badge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  badgeCalled: { backgroundColor: theme.color.accent },
  badgeCalledText: {
    color: theme.color.accentFg,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  badgeOnTheWay: { backgroundColor: theme.color.ok },
  badgeOnTheWayText: {
    color: theme.color.surface,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  badgeFlashOk: { backgroundColor: 'rgba(16, 185, 129, 0.85)' },
  badgeFlashFail: { backgroundColor: 'rgba(248, 113, 113, 0.9)' },
  badgeFlashMuted: { backgroundColor: theme.color.surfaceRaised, borderWidth: 1, borderColor: theme.color.line },
  badgeFlashText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  meta: {
    color: theme.color.textMuted,
    fontSize: 12,
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },
  timesBlock: {
    flexDirection: 'row',
    gap: theme.space.md,
  },
  timeCol: { alignItems: 'flex-end', minWidth: 44 },
  timeLabel: {
    color: theme.color.textMuted,
    fontSize: 9,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  timeValue: {
    color: theme.color.text,
    fontSize: 14,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    marginTop: 2,
  },
  actionsRow: { marginTop: 2 },
});
