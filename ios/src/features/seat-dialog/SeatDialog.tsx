import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import type { SeatedParty, WaitingParty } from '@/core/party';
import {
  canConfirm,
  confirmLabel,
  validateSeatInput,
} from '@/core/seatValidation';
import { recentTableNumbers } from '@/core/waitlist';
import { useWaitlistStore } from '@/state/waitlist';
import { Button } from '@/ui/Button';
import { Dialog } from '@/ui/Dialog';
import { theme } from '@/ui/theme';

interface Props {
  party: WaitingParty | null;
  seated: readonly SeatedParty[];
  onClose: () => void;
}

export function SeatDialog({ party, seated, onClose }: Props) {
  const [raw, setRaw] = useState('');
  const [overrideArmed, setOverrideArmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [serverConflict, setServerConflict] = useState<{
    tableNumber: number;
    occupiedBy: string;
  } | null>(null);
  const seatParty = useWaitlistStore((s) => s.seatParty);

  useEffect(() => {
    if (party) {
      setRaw('');
      setOverrideArmed(false);
      setApiError(null);
      setServerConflict(null);
    }
  }, [party]);

  // Client-side conflict is a UX pre-flight; the server is the real authority.
  const clientState = useMemo(
    () => validateSeatInput({ raw, seated }),
    [raw, seated],
  );

  // If the server returned 409 and the user hasn't changed the input yet,
  // show the server's conflict message (which may include parties we don't
  // have locally because they were seated between our last poll and this tap).
  const state =
    serverConflict !== null && clientState.kind !== 'empty' && clientState.kind !== 'invalid'
      ? ({
          kind: 'conflict',
          tableNumber: serverConflict.tableNumber,
          byPartyName: serverConflict.occupiedBy,
        } as const)
      : clientState;

  const recent = useMemo(() => recentTableNumbers(seated, 5), [seated]);
  // Occupied tables get rendered as visually disabled chips so the host
  // can SEE which tables are off-limits before they tap (matches the
  // web's chip-occupied styling). Without this the host has to guess
  // and only finds out after the seat conflict comes back from the
  // server.
  const occupiedTables = useMemo(
    () => Array.from(new Set(seated.map((p) => p.tableNumber).filter((n): n is number => typeof n === 'number'))),
    [seated],
  );
  const recentSet = new Set(recent);
  const occupiedNotInRecent = occupiedTables.filter((n) => !recentSet.has(n));

  async function handleConfirm() {
    if (!party) return;
    if (state.kind !== 'valid' && state.kind !== 'conflict') return;
    setSubmitting(true);
    setApiError(null);
    try {
      const result = await seatParty(
        party.id,
        state.tableNumber,
        state.kind === 'conflict',
      );
      if (result.ok) {
        setRaw('');
        setServerConflict(null);
        onClose();
      } else if ('conflict' in result) {
        setServerConflict(result.conflict);
        setOverrideArmed(false);
      } else {
        setApiError(result.error);
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (!party) return null;

  return (
    <Dialog
      visible
      title="Seat Party"
      onClose={onClose}
      footer={
        <>
          <Button label="Cancel" variant="ghost" onPress={onClose} />
          <Button
            label={submitting ? 'Seating…' : confirmLabel(state)}
            variant="primary"
            disabled={!canConfirm(state, overrideArmed) || submitting}
            onPress={() => void handleConfirm()}
          />
        </>
      }
    >
      <View style={styles.partySummary}>
        <Summary label="Party" value={party.name} />
        <Summary label="Size" value={String(party.partySize)} />
        <Summary label="Waiting" value={`${party.waitingMinutes}m`} />
      </View>

      <View style={styles.body}>
        <Text style={styles.fieldLabel}>TABLE #</Text>
        <TextInput
          accessibilityLabel="Table number"
          value={raw}
          onChangeText={(t) => {
            setRaw(t);
            setOverrideArmed(false);
            setApiError(null);
            setServerConflict(null);
          }}
          keyboardType="number-pad"
          maxLength={3}
          placeholder="—"
          placeholderTextColor={theme.color.textMuted}
          style={[
            styles.input,
            (state.kind === 'conflict' || state.kind === 'invalid') && styles.inputError,
          ]}
          autoFocus
          returnKeyType="go"
          onSubmitEditing={() => void handleConfirm()}
        />

        {(recent.length > 0 || occupiedNotInRecent.length > 0) && (
          <>
            <Text style={styles.chipsLabel}>RECENT TABLES</Text>
            <View style={styles.chips}>
              {recent.map((n) => {
                const isOccupied = occupiedTables.includes(n);
                return (
                  <Pressable
                    key={n}
                    accessibilityRole="button"
                    accessibilityLabel={
                      isOccupied
                        ? `Table ${n} is occupied — tap to override conflict`
                        : `Use table ${n}`
                    }
                    style={[styles.chip, isOccupied && styles.chipOccupied]}
                    onPress={() => {
                      setRaw(String(n));
                      setOverrideArmed(false);
                      setApiError(null);
                      setServerConflict(null);
                    }}
                  >
                    <Text style={[styles.chipText, isOccupied && styles.chipTextOccupied]}>{n}</Text>
                  </Pressable>
                );
              })}
              {occupiedNotInRecent.map((n) => (
                <Pressable
                  key={`occ-${n}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Table ${n} is occupied — tap to override conflict`}
                  style={[styles.chip, styles.chipOccupied]}
                  onPress={() => {
                    setRaw(String(n));
                    setOverrideArmed(false);
                    setApiError(null);
                    setServerConflict(null);
                  }}
                >
                  <Text style={[styles.chipText, styles.chipTextOccupied]}>{n}</Text>
                </Pressable>
              ))}
            </View>
          </>
        )}

        {state.kind === 'conflict' && (
          <View style={styles.alert}>
            <Text style={styles.alertText}>
              Table <Text style={styles.alertNumber}>{state.tableNumber}</Text> is occupied by{' '}
              <Text style={styles.alertNumber}>{state.byPartyName}</Text>.
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Override and seat anyway at table ${state.tableNumber}`}
              onPress={() => setOverrideArmed(true)}
              style={[styles.override, overrideArmed && styles.overrideArmed]}
            >
              <Text style={styles.overrideText}>
                {overrideArmed ? 'Override armed — tap Seat again' : 'Seat anyway'}
              </Text>
            </Pressable>
          </View>
        )}

        {state.kind === 'invalid' && (
          <Text style={styles.inlineError}>
            {state.reason === 'out_of_range'
              ? 'Table must be between 1 and 999.'
              : 'Enter a number.'}
          </Text>
        )}

        {apiError !== null && <Text style={styles.inlineError}>{apiError}</Text>}
      </View>
    </Dialog>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryCell}>
      <Text style={styles.summaryKey}>{label.toUpperCase()}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  partySummary: {
    flexDirection: 'row',
    padding: theme.space.lg,
    backgroundColor: theme.color.surfaceRaised,
    borderBottomWidth: 1,
    borderBottomColor: theme.color.line,
    gap: theme.space.md,
  },
  summaryCell: {
    flex: 1,
  },
  summaryKey: {
    color: theme.color.textMuted,
    fontSize: 10,
    letterSpacing: 0.8,
  },
  summaryValue: {
    color: theme.color.text,
    fontSize: 15,
    fontWeight: '700',
    marginTop: 2,
  },
  body: {
    padding: theme.space.lg,
  },
  fieldLabel: {
    color: theme.color.textMuted,
    fontSize: 11,
    letterSpacing: 1,
    marginBottom: theme.space.sm,
    fontWeight: '600',
  },
  input: {
    backgroundColor: '#0f1115',
    color: theme.color.text,
    borderWidth: 1,
    borderColor: theme.color.line,
    borderRadius: theme.radius.md,
    paddingVertical: theme.space.lg,
    paddingHorizontal: theme.space.lg,
    fontSize: 32,
    fontWeight: '800',
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
    letterSpacing: 1.5,
  },
  inputError: {
    borderColor: theme.color.warn,
  },
  chipsLabel: {
    marginTop: theme.space.md,
    color: theme.color.textMuted,
    fontSize: 11,
    letterSpacing: 0.8,
    fontWeight: '600',
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: theme.space.sm,
  },
  chip: {
    backgroundColor: theme.color.surfaceRaised,
    borderWidth: 1,
    borderColor: theme.color.line,
    borderRadius: theme.radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  chipText: {
    color: theme.color.text,
    fontSize: 14,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  chipOccupied: {
    // Don't go fully ghosted — the chip stays tappable so the host can
    // queue a seat-override flow. Dashed border + strikethrough makes
    // the "occupied" state legible without disabling the affordance.
    opacity: 0.7,
    borderStyle: 'dashed',
    borderColor: theme.color.warn,
  },
  chipTextOccupied: {
    textDecorationLine: 'line-through',
    color: theme.color.textMuted,
  },
  alert: {
    marginTop: theme.space.md,
    backgroundColor: 'rgba(248,113,113,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.4)',
    borderRadius: theme.radius.sm,
    padding: theme.space.md,
  },
  alertText: {
    color: theme.color.warn,
    fontSize: 13,
  },
  alertNumber: {
    color: '#fff',
    fontWeight: '700',
  },
  override: {
    alignSelf: 'flex-start',
    marginTop: theme.space.sm,
    borderWidth: 1,
    borderColor: theme.color.warn,
    borderRadius: theme.radius.sm,
    paddingHorizontal: theme.space.md,
    paddingVertical: 6,
  },
  overrideArmed: {
    backgroundColor: theme.color.warn,
  },
  overrideText: {
    color: theme.color.warn,
    fontSize: 12,
    fontWeight: '700',
  },
  inlineError: {
    color: theme.color.warn,
    fontSize: 12,
    marginTop: theme.space.sm,
  },
});
