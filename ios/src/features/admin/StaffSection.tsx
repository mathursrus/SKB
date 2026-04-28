import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import type { AppRole } from '@/core/auth';
import {
  staff as staffApi,
  type InvitableRole,
  type PendingInvite,
  type StaffMember,
} from '@/net/endpoints';
import { theme } from '@/ui/theme';

import { getStaffErrorMessage } from './staffErrors';

const ROLE_OPTIONS: ReadonlyArray<{ key: InvitableRole; label: string; help: string }> = [
  { key: 'host', label: 'Host', help: 'Floor-only — manage queue, seat parties, send chats.' },
  { key: 'admin', label: 'Admin', help: 'Host + edit settings, hours, voice, brand. Cannot manage staff.' },
];

export function StaffSection({ locationId, role }: { locationId: string; role: AppRole | null }) {
  const isOwner = role === 'owner';

  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [pending, setPending] = useState<PendingInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Invite form
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteRole, setInviteRole] = useState<InvitableRole>('host');
  const [inviting, setInviting] = useState(false);

  // Revoke state
  const [revokingId, setRevokingId] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const next = await staffApi.list(locationId);
      setStaff(next.staff);
      setPending(next.pending);
    } catch (err) {
      setError(getStaffErrorMessage(err, 'Failed to load staff'));
    }
  }

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationId]);

  async function handleInvite() {
    const email = inviteEmail.trim();
    const name = inviteName.trim();
    if (!email) {
      Alert.alert('Email required', 'Enter the email address to invite.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      Alert.alert('Invalid email', 'Enter a valid email address.');
      return;
    }
    setInviting(true);
    setError(null);
    try {
      const result = await staffApi.invite(locationId, { email, name: name || undefined, role: inviteRole });
      setInviteEmail('');
      setInviteName('');
      setInviteRole('host');
      await load();
      Alert.alert(result.delivery.delivered ? 'Invite emailed' : 'Invite created', result.deliveryMessage);
    } catch (err) {
      setError(getStaffErrorMessage(err, 'Failed to send invite'));
    } finally {
      setInviting(false);
    }
  }

  function confirmRevokeMember(member: StaffMember) {
    const label = member.name || member.email || 'this member';
    Alert.alert(
      `Remove ${label}?`,
      'They will lose access to this restaurant immediately.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => void revokeMember(member._id) },
      ],
    );
  }

  async function revokeMember(membershipId: string) {
    setRevokingId(membershipId);
    setError(null);
    try {
      await staffApi.revoke(locationId, { membershipId });
      await load();
    } catch (err) {
      setError(getStaffErrorMessage(err, 'Failed to revoke'));
    } finally {
      setRevokingId(null);
    }
  }

  function confirmCancelInvite(invite: PendingInvite) {
    Alert.alert(
      `Cancel invite for ${invite.email}?`,
      'The pending invite link will stop working.',
      [
        { text: 'Keep', style: 'cancel' },
        { text: 'Cancel invite', style: 'destructive', onPress: () => void cancelInvite(invite._id) },
      ],
    );
  }

  async function cancelInvite(inviteId: string) {
    setRevokingId(inviteId);
    setError(null);
    try {
      await staffApi.revoke(locationId, { inviteId });
      await load();
    } catch (err) {
      setError(getStaffErrorMessage(err, 'Failed to cancel invite'));
    } finally {
      setRevokingId(null);
    }
  }

  return (
    <View style={styles.wrap}>
      {error !== null && <Text style={styles.error}>{error}</Text>}

      {/* Active staff */}
      <View>
        <Text style={styles.sectionLabel}>Active members ({staff.length})</Text>
        {loading && <Text style={styles.muted}>Loading…</Text>}
        {!loading && staff.length === 0 && <Text style={styles.muted}>No staff members yet.</Text>}
        {staff.map((m) => {
          const isOwnerRow = m.role === 'owner';
          const isRevoking = revokingId === m._id;
          return (
            <View key={m._id} style={styles.row}>
              <View style={styles.rowText}>
                <Text style={styles.rowPrimary}>{m.name || m.email || 'Unknown'}</Text>
                {m.email && m.name && <Text style={styles.rowSecondary}>{m.email}</Text>}
                <Text style={styles.rowMeta}>{roleLabel(m.role)}</Text>
              </View>
              {isOwner && !isOwnerRow && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${m.name || m.email || 'member'}`}
                  onPress={() => confirmRevokeMember(m)}
                  disabled={isRevoking}
                  style={[styles.dangerButton, isRevoking && styles.dangerButtonDisabled]}
                  hitSlop={6}
                >
                  <Text style={styles.dangerButtonText}>{isRevoking ? '…' : 'Remove'}</Text>
                </Pressable>
              )}
            </View>
          );
        })}
      </View>

      {/* Pending invites */}
      {pending.length > 0 && (
        <View>
          <Text style={styles.sectionLabel}>Pending invites ({pending.length})</Text>
          {pending.map((p) => {
            const isRevoking = revokingId === p._id;
            return (
              <View key={p._id} style={styles.row}>
                <View style={styles.rowText}>
                  <Text style={styles.rowPrimary}>{p.email}</Text>
                  {p.name && <Text style={styles.rowSecondary}>{p.name}</Text>}
                  <Text style={styles.rowMeta}>Invited as {roleLabel(p.role)}</Text>
                </View>
                {isOwner && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Cancel invite for ${p.email}`}
                    onPress={() => confirmCancelInvite(p)}
                    disabled={isRevoking}
                    style={[styles.dangerButton, isRevoking && styles.dangerButtonDisabled]}
                    hitSlop={6}
                  >
                    <Text style={styles.dangerButtonText}>{isRevoking ? '…' : 'Cancel'}</Text>
                  </Pressable>
                )}
              </View>
            );
          })}
        </View>
      )}

      {/* Invite form (owner-only) */}
      {isOwner ? (
        <View style={styles.inviteCard}>
          <Text style={styles.sectionLabel}>Invite a teammate</Text>
          <Text style={styles.fieldLabel}>Email</Text>
          <TextInput
            value={inviteEmail}
            onChangeText={setInviteEmail}
            placeholder="teammate@example.com"
            placeholderTextColor={theme.color.textMuted}
            autoCapitalize="none"
            keyboardType="email-address"
            style={styles.input}
            accessibilityLabel="Invite email"
          />
          <Text style={styles.fieldLabel}>Name (optional)</Text>
          <TextInput
            value={inviteName}
            onChangeText={setInviteName}
            placeholder="First Last"
            placeholderTextColor={theme.color.textMuted}
            style={styles.input}
            accessibilityLabel="Invite name"
          />
          <Text style={styles.fieldLabel}>Role</Text>
          <View style={styles.roleRow}>
            {ROLE_OPTIONS.map(({ key, label, help }) => {
              const active = inviteRole === key;
              return (
                <Pressable
                  key={key}
                  accessibilityRole="radio"
                  accessibilityLabel={`${label} role: ${help}`}
                  accessibilityState={{ selected: active }}
                  onPress={() => setInviteRole(key)}
                  style={[styles.roleOption, active && styles.roleOptionActive]}
                  hitSlop={6}
                >
                  <Text style={[styles.roleLabel, active && styles.roleLabelActive]}>{label}</Text>
                  <Text style={[styles.roleHelp, active && styles.roleHelpActive]}>{help}</Text>
                </Pressable>
              );
            })}
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send invite"
            disabled={inviting}
            onPress={() => void handleInvite()}
            style={[styles.primaryButton, inviting && styles.primaryButtonDisabled]}
          >
            <Text style={styles.primaryButtonText}>{inviting ? 'Sending…' : 'Send invite'}</Text>
          </Pressable>
        </View>
      ) : (
        <Text style={styles.muted}>
          Only owners can invite or remove staff. Ask the owner if you need a teammate added.
        </Text>
      )}
    </View>
  );
}

function roleLabel(r: StaffMember['role'] | InvitableRole): string {
  if (r === 'owner') return 'Owner';
  if (r === 'admin') return 'Admin';
  return 'Host';
}

const styles = StyleSheet.create({
  wrap: { gap: theme.space.lg },
  error: { color: theme.color.warn, fontWeight: '600' },
  muted: { color: theme.color.textMuted, fontSize: 13 },
  sectionLabel: {
    color: theme.color.textMuted,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    fontWeight: '700',
    marginBottom: theme.space.sm,
  },
  fieldLabel: {
    color: theme.color.textMuted,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    fontWeight: '700',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: theme.space.sm,
    paddingHorizontal: theme.space.md,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.color.line,
    backgroundColor: theme.color.surface,
    marginBottom: theme.space.sm,
    minHeight: 56,
  },
  rowText: { flex: 1, paddingRight: theme.space.md },
  rowPrimary: { color: theme.color.text, fontSize: 15, fontWeight: '700' },
  rowSecondary: { color: theme.color.textMuted, fontSize: 13, marginTop: 2 },
  rowMeta: { color: theme.color.accent, fontSize: 12, fontWeight: '700', marginTop: 4 },
  dangerButton: {
    paddingHorizontal: theme.space.md,
    paddingVertical: theme.space.sm,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.color.warn,
    minHeight: 36,
    minWidth: 80,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dangerButtonDisabled: { opacity: 0.45 },
  dangerButtonText: { color: theme.color.warn, fontWeight: '700', fontSize: 13 },
  inviteCard: {
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.color.line,
    backgroundColor: theme.color.surface,
    padding: theme.space.md,
    gap: theme.space.sm,
  },
  input: {
    borderWidth: 1,
    borderColor: theme.color.line,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.space.md,
    paddingVertical: theme.space.md,
    color: theme.color.text,
    backgroundColor: theme.color.surfaceRaised,
    fontSize: 15,
    minHeight: 44,
  },
  roleRow: { gap: theme.space.sm },
  roleOption: {
    paddingVertical: theme.space.md,
    paddingHorizontal: theme.space.md,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.color.line,
    backgroundColor: theme.color.surfaceRaised,
    minHeight: 60,
  },
  roleOptionActive: { borderColor: theme.color.accent, backgroundColor: theme.color.accent },
  roleLabel: { color: theme.color.text, fontSize: 14, fontWeight: '800' },
  roleLabelActive: { color: theme.color.accentFg },
  roleHelp: { color: theme.color.textMuted, fontSize: 12, marginTop: 4, lineHeight: 16 },
  roleHelpActive: { color: theme.color.accentFg, opacity: 0.85 },
  primaryButton: {
    borderRadius: theme.radius.md,
    backgroundColor: theme.color.accent,
    paddingVertical: theme.space.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: theme.space.sm,
    minHeight: 48,
  },
  primaryButtonDisabled: { opacity: 0.45 },
  primaryButtonText: { color: theme.color.accentFg, fontWeight: '800', fontSize: 15 },
});
