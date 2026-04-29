import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { useAuthStore } from '@/state/auth';
import { useGuestStore } from '@/state/guest';
import { theme } from '@/ui/theme';

const POLL_INTERVAL_MS = 15_000;

export default function GuestLobbyScreen() {
  const brand = useAuthStore((s) => s.brand);
  const logout = useAuthStore((s) => s.logout);
  const queueState = useGuestStore((s) => s.queueState);
  const trackedCode = useGuestStore((s) => s.trackedCode);
  const status = useGuestStore((s) => s.status);
  const thread = useGuestStore((s) => s.thread);
  const joining = useGuestStore((s) => s.joining);
  const refreshing = useGuestStore((s) => s.refreshing);
  const error = useGuestStore((s) => s.error);
  const setTrackedCode = useGuestStore((s) => s.setTrackedCode);
  const loadOverview = useGuestStore((s) => s.loadOverview);
  const trackParty = useGuestStore((s) => s.trackParty);
  const joinQueue = useGuestStore((s) => s.joinQueue);
  const sendMessage = useGuestStore((s) => s.sendMessage);
  const acknowledge = useGuestStore((s) => s.acknowledge);
  const reset = useGuestStore((s) => s.reset);

  const [name, setName] = useState('');
  const [partySize, setPartySize] = useState('2');
  const [phone, setPhone] = useState('');
  const [smsConsent, setSmsConsent] = useState(true);
  const [draftMessage, setDraftMessage] = useState('');

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  useEffect(() => () => reset(), [reset]);

  useEffect(() => {
    if (!trackedCode) return undefined;
    void trackParty(trackedCode);
    const timer = setInterval(() => {
      void trackParty(trackedCode);
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [trackParty, trackedCode]);

  async function handleJoin() {
    const cleanedPhone = phone.replace(/[^\d]/g, '');
    const size = parseInt(partySize, 10);
    if (!name.trim()) {
      Alert.alert('Missing name', 'Please enter the party name.');
      return;
    }
    if (!Number.isFinite(size) || size < 1 || size > 10) {
      Alert.alert('Invalid party size', 'Party size must be between 1 and 10.');
      return;
    }
    if (cleanedPhone.length !== 10) {
      Alert.alert('Invalid phone', 'Phone number must be exactly 10 digits.');
      return;
    }
    const code = await joinQueue({
      name: name.trim(),
      partySize: size,
      phone: cleanedPhone,
      smsConsent,
    });
    if (code) {
      Alert.alert('Joined the waitlist', `Your code is ${code}.`);
    }
  }

  async function handleTrack() {
    if (!trackedCode.trim()) return;
    await trackParty(trackedCode);
  }

  async function handleSendMessage() {
    if (!draftMessage.trim()) return;
    await sendMessage(draftMessage);
    setDraftMessage('');
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>Guest view</Text>
        <Text style={styles.heroTitle}>{brand?.restaurantName ?? 'Restaurant'}</Text>
        <Text style={styles.heroSubtitle}>
          Branded queue tracking, a quick join form, and chat with the host from the same app.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Tonight's line</Text>
        <Text style={styles.bigStat}>{queueState?.partiesWaiting ?? '--'}</Text>
        <Text style={styles.meta}>
          waiting now · new party ETA {queueState?.etaForNewPartyMinutes ?? '--'}m
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Join the waitlist</Text>
        <Field label="Name" value={name} onChangeText={setName} placeholder="Party name" />
        <Field label="Party size" value={partySize} onChangeText={(value) => setPartySize(value.replace(/[^\d]/g, ''))} placeholder="2" keyboardType="number-pad" />
        <Field label="Phone" value={phone} onChangeText={setPhone} placeholder="2065551234" keyboardType="phone-pad" />
        {brand?.guestFeatures.sms && (
          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>Text me status updates</Text>
            <Switch value={smsConsent} onValueChange={setSmsConsent} trackColor={{ true: theme.color.accent, false: theme.color.line }} />
          </View>
        )}
        <PrimaryButton label={joining ? 'Joining...' : 'Join waitlist'} disabled={joining} onPress={() => void handleJoin()} />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Track a party</Text>
        <Field label="Party code" value={trackedCode} onChangeText={setTrackedCode} placeholder="ABC-1234" autoCapitalize="characters" />
        <PrimaryButton label={refreshing ? 'Refreshing...' : 'Track code'} disabled={refreshing || !trackedCode.trim()} onPress={() => void handleTrack()} />
        {status && (
          <View style={styles.statusCard}>
            <SummaryRow label="State" value={status.state.replace('_', ' ')} />
            <SummaryRow label="Position" value={String(status.position)} />
            <SummaryRow label="ETA" value={status.etaMinutes !== null ? `${status.etaMinutes}m` : 'Ready'} />
            <SummaryRow label="Table" value={status.tableNumber ? String(status.tableNumber) : 'Not seated yet'} />
            {status.state === 'called' && !status.onMyWayAt && (
              <PrimaryButton label="I'm on my way" onPress={() => void acknowledge()} />
            )}
          </View>
        )}
      </View>

      {brand?.guestFeatures.chat && trackedCode.trim().length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Message the host</Text>
          <View style={styles.thread}>
            {(thread?.messages ?? []).map((message, index) => (
              <View
                key={`${message.at}-${index}`}
                style={[
                  styles.bubble,
                  message.direction === 'outbound' ? styles.bubbleOutbound : styles.bubbleInbound,
                ]}
              >
                <Text style={styles.bubbleText}>{message.body}</Text>
              </View>
            ))}
            {thread?.messages.length === 0 && (
              <Text style={styles.emptyThread}>No messages yet.</Text>
            )}
          </View>
          <TextInput
            value={draftMessage}
            onChangeText={setDraftMessage}
            placeholder="Type a message"
            placeholderTextColor={theme.color.textMuted}
            style={styles.input}
            multiline
          />
          <PrimaryButton label="Send message" disabled={!draftMessage.trim()} onPress={() => void handleSendMessage()} />
        </View>
      )}

      {error !== null && <Text style={styles.error}>{error}</Text>}

      <Pressable onPress={() => void logout()} style={styles.signOut}>
        <Text style={styles.signOutText}>Leave guest view</Text>
      </Pressable>
    </ScrollView>
  );
}

function Field(props: React.ComponentProps<typeof TextInput> & { label: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{props.label}</Text>
      <TextInput
        {...props}
        style={styles.input}
        placeholderTextColor={theme.color.textMuted}
      />
    </View>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

function PrimaryButton({
  label,
  disabled,
  onPress,
}: {
  label: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={[styles.primaryButton, disabled && styles.primaryButtonDisabled]} onPress={onPress} disabled={disabled}>
      <Text style={styles.primaryButtonText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.color.surface,
  },
  content: {
    padding: theme.space.lg,
    gap: theme.space.lg,
    paddingBottom: theme.space.xxl,
  },
  hero: {
    borderRadius: 28,
    backgroundColor: theme.color.surfaceRaised,
    borderWidth: 1,
    borderColor: theme.color.line,
    padding: theme.space.xl,
  },
  eyebrow: {
    color: theme.color.accent,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontWeight: '700',
    fontSize: 12,
  },
  heroTitle: {
    color: theme.color.text,
    fontSize: 30,
    fontWeight: '800',
    marginTop: 8,
  },
  heroSubtitle: {
    color: theme.color.textMuted,
    marginTop: 8,
    lineHeight: 20,
  },
  card: {
    borderRadius: 22,
    backgroundColor: theme.color.surfaceRaised,
    borderWidth: 1,
    borderColor: theme.color.line,
    padding: theme.space.lg,
    gap: theme.space.md,
  },
  cardTitle: {
    color: theme.color.text,
    fontSize: 18,
    fontWeight: '800',
  },
  bigStat: {
    color: theme.color.accent,
    fontSize: 40,
    fontWeight: '800',
  },
  meta: {
    color: theme.color.textMuted,
  },
  field: {
    gap: 8,
  },
  fieldLabel: {
    color: theme.color.textMuted,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    fontWeight: '700',
  },
  input: {
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.color.line,
    backgroundColor: theme.color.surface,
    color: theme.color.text,
    paddingHorizontal: theme.space.md,
    paddingVertical: theme.space.md,
    fontSize: 15,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  settingLabel: {
    color: theme.color.text,
    fontWeight: '600',
  },
  primaryButton: {
    borderRadius: theme.radius.md,
    backgroundColor: theme.color.accent,
    paddingVertical: theme.space.md,
    alignItems: 'center',
  },
  primaryButtonDisabled: {
    opacity: 0.45,
  },
  primaryButtonText: {
    color: theme.color.accentFg,
    fontWeight: '800',
    fontSize: 15,
  },
  statusCard: {
    marginTop: theme.space.sm,
    gap: theme.space.sm,
    borderTopWidth: 1,
    borderTopColor: theme.color.line,
    paddingTop: theme.space.md,
  },
  summaryRow: {
    gap: 2,
  },
  summaryLabel: {
    color: theme.color.textMuted,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    fontWeight: '700',
  },
  summaryValue: {
    color: theme.color.text,
    fontSize: 15,
    fontWeight: '600',
  },
  thread: {
    gap: 8,
  },
  bubble: {
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    maxWidth: '88%',
  },
  bubbleInbound: {
    backgroundColor: theme.color.surface,
    alignSelf: 'flex-start',
  },
  bubbleOutbound: {
    backgroundColor: theme.color.accent,
    alignSelf: 'flex-end',
  },
  bubbleText: {
    color: theme.color.text,
  },
  emptyThread: {
    color: theme.color.textMuted,
  },
  error: {
    color: theme.color.warn,
    fontWeight: '600',
  },
  signOut: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: theme.color.line,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.space.lg,
    paddingVertical: theme.space.md,
  },
  signOutText: {
    color: theme.color.textMuted,
    fontWeight: '700',
  },
});
