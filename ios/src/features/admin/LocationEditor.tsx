import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { config as configApi, type LocationAddress } from '@/net/endpoints';
import { theme } from '@/ui/theme';

import { hasNonEmptyAddress } from './hoursLogic';

const EMPTY_ADDRESS: LocationAddress = { street: '', city: '', state: '', zip: '' };

export function LocationEditor({
  locationId,
  initialAddress,
  initialPublicHost,
  restaurantName,
}: {
  locationId: string;
  initialAddress: LocationAddress | null;
  initialPublicHost: string;
  restaurantName: string;
}) {
  const [address, setAddress] = useState<LocationAddress>(initialAddress ?? EMPTY_ADDRESS);
  const [publicHost, setPublicHost] = useState(initialPublicHost);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const trimmedHost = publicHost.trim();
    setSaving(true);
    setError(null);
    try {
      const next = await configApi.saveSiteConfig(locationId, {
        address: hasNonEmptyAddress(address) ? address : null,
        publicHost: trimmedHost ? trimmedHost : null,
      });
      setAddress(next.address ?? EMPTY_ADDRESS);
      setPublicHost(next.publicHost);
      Alert.alert('Saved', 'Address and public host updated.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save location');
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.wrap}>
      {error !== null && <Text style={styles.error}>{error}</Text>}
      <Text style={styles.help}>
        Address powers maps embeds and the IVR location prompt. Public host is your dinerfacing slug
        (e.g. <Text style={styles.code}>skbbellevue</Text>).
      </Text>
      <View style={styles.summaryRow}>
        <Text style={styles.summaryLabel}>Restaurant</Text>
        <Text style={styles.summaryValue}>{restaurantName || locationId || '—'}</Text>
      </View>

      <Text style={styles.fieldLabel}>Street</Text>
      <TextInput
        value={address.street}
        onChangeText={(v) => setAddress((a) => ({ ...a, street: v }))}
        placeholder="12 Bellevue Way SE"
        placeholderTextColor={theme.color.textMuted}
        style={styles.input}
        accessibilityLabel="Street address"
      />

      <View style={styles.row}>
        <View style={styles.flex}>
          <Text style={styles.fieldLabel}>City</Text>
          <TextInput
            value={address.city}
            onChangeText={(v) => setAddress((a) => ({ ...a, city: v }))}
            placeholder="Bellevue"
            placeholderTextColor={theme.color.textMuted}
            style={styles.input}
            accessibilityLabel="City"
          />
        </View>
        <View style={styles.stateField}>
          <Text style={styles.fieldLabel}>State</Text>
          <TextInput
            value={address.state}
            onChangeText={(v) => setAddress((a) => ({ ...a, state: v.toUpperCase().slice(0, 2) }))}
            placeholder="WA"
            placeholderTextColor={theme.color.textMuted}
            autoCapitalize="characters"
            maxLength={2}
            style={styles.input}
            accessibilityLabel="State two letter code"
          />
        </View>
        <View style={styles.zipField}>
          <Text style={styles.fieldLabel}>ZIP</Text>
          <TextInput
            value={address.zip}
            onChangeText={(v) =>
              setAddress((a) => ({ ...a, zip: v.replace(/[^\d-]/g, '').slice(0, 10) }))
            }
            placeholder="98004"
            placeholderTextColor={theme.color.textMuted}
            keyboardType="number-pad"
            style={styles.input}
            accessibilityLabel="ZIP code"
          />
        </View>
      </View>

      <Text style={styles.fieldLabel}>Public host slug</Text>
      <TextInput
        value={publicHost}
        onChangeText={(v) => setPublicHost(v.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
        placeholder="skbbellevue"
        placeholderTextColor={theme.color.textMuted}
        autoCapitalize="none"
        style={styles.input}
        accessibilityLabel="Public host slug"
      />

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Save location and web"
        disabled={saving}
        onPress={() => void save()}
        style={[styles.primaryButton, saving && styles.primaryButtonDisabled]}
      >
        <Text style={styles.primaryButtonText}>{saving ? 'Saving…' : 'Save location & web'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: theme.space.md },
  error: { color: theme.color.warn, fontWeight: '600' },
  help: { color: theme.color.textMuted, fontSize: 13, lineHeight: 18 },
  code: { fontFamily: 'Menlo', color: theme.color.text },
  summaryRow: { gap: 4 },
  summaryLabel: {
    color: theme.color.textMuted,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    fontWeight: '700',
  },
  summaryValue: { color: theme.color.text, fontSize: 15, fontWeight: '600' },
  fieldLabel: {
    color: theme.color.textMuted,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    fontWeight: '700',
  },
  input: {
    borderWidth: 1,
    borderColor: theme.color.line,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.space.md,
    paddingVertical: theme.space.md,
    color: theme.color.text,
    backgroundColor: theme.color.surface,
    fontSize: 15,
    minHeight: 44,
  },
  row: { flexDirection: 'row', gap: theme.space.sm },
  flex: { flex: 1 },
  stateField: { width: 70 },
  zipField: { width: 110 },
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
