import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { WaitingParty } from '@/core/party';
import { theme } from '@/ui/theme';

import { LiveClock } from './LiveClock';
import { RowActions } from './RowActions';

interface Props {
  party: WaitingParty;
  baseAt: number;
  onSeat: (party: WaitingParty) => void;
  onNotify: (party: WaitingParty) => void;
  onCustomSms: (party: WaitingParty) => void;
  onCustomCall: (party: WaitingParty) => void;
  onRemove: (party: WaitingParty) => void;
}

function formatClockTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.valueOf())) return '—';
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function PartyRowImpl(props: Props) {
  const { party, baseAt } = props;
  return (
    <View
      accessibilityRole="summary"
      accessibilityLabel={`Party ${party.position}, ${party.name}, size ${party.partySize}`}
      style={[
        styles.row,
        party.state === 'called' && styles.rowCalled,
      ]}
    >
      <View style={styles.position}>
        <Text style={styles.positionText}>{party.position}</Text>
      </View>
      <View style={styles.main}>
        <Text style={styles.name}>{party.name}</Text>
        <Text style={styles.meta}>
          {party.partySize} · {party.phoneMasked}
        </Text>
      </View>
      <View style={styles.times}>
        <Text style={styles.timeLabel}>ETA</Text>
        <Text style={styles.timeValue}>{formatClockTime(party.etaAt)}</Text>
      </View>
      <View style={styles.times}>
        <Text style={styles.timeLabel}>Waiting</Text>
        <LiveClock
          joinedAt={party.joinedAt}
          baseMinutes={party.waitingMinutes}
          baseAt={baseAt}
          style={styles.timeValue}
        />
      </View>
      <View style={styles.actions}>
        <RowActions
          party={party}
          onSeat={() => props.onSeat(party)}
          onNotify={() => props.onNotify(party)}
          onCustomSms={() => props.onCustomSms(party)}
          onCustomCall={() => props.onCustomCall(party)}
          onRemove={() => props.onRemove(party)}
        />
      </View>
    </View>
  );
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
    a.unreadChat === b.unreadChat
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.color.surface,
    borderWidth: 1,
    borderColor: theme.color.line,
    borderRadius: theme.radius.md,
    padding: theme.space.md,
    marginBottom: theme.space.sm,
    gap: theme.space.md,
  },
  rowCalled: {
    borderColor: theme.color.accent,
  },
  position: {
    width: 36,
    alignItems: 'center',
  },
  positionText: {
    color: theme.color.textMuted,
    fontSize: 16,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  main: {
    flex: 1,
    minWidth: 140,
  },
  name: {
    color: theme.color.text,
    fontSize: 15,
    fontWeight: '600',
  },
  meta: {
    color: theme.color.textMuted,
    fontSize: 12,
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },
  times: {
    alignItems: 'flex-start',
    minWidth: 80,
  },
  timeLabel: {
    color: theme.color.textMuted,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  timeValue: {
    color: theme.color.text,
    fontSize: 14,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    marginTop: 2,
  },
  actions: {
    flexShrink: 1,
    minWidth: 180,
  },
});
