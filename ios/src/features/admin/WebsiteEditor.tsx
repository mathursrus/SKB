import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import {
  config as configApi,
  type KnownForItem,
  type LocationContent,
  type WebsiteTemplateKey,
} from '@/net/endpoints';
import { theme } from '@/ui/theme';

const TEMPLATES: ReadonlyArray<{ key: WebsiteTemplateKey; label: string; help: string }> = [
  { key: 'saffron', label: 'Saffron', help: 'Warm, hospitality-forward look. Default.' },
  { key: 'slate', label: 'Slate', help: 'Cool, minimal layout for modern restaurants.' },
];

const EMPTY_KNOWN_FOR: KnownForItem = { title: '', desc: '', image: '' };

export function WebsiteEditor({ locationId }: { locationId: string }) {
  const [template, setTemplate] = useState<WebsiteTemplateKey>('saffron');
  const [content, setContent] = useState<LocationContent>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    configApi
      .websiteConfig(locationId)
      .then((next) => {
        if (cancelled) return;
        setTemplate((next.websiteTemplate ?? 'saffron') as WebsiteTemplateKey);
        setContent(next.content ?? {});
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load website config');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [locationId]);

  function setField<K extends keyof LocationContent>(key: K, value: LocationContent[K]) {
    setContent((c) => ({ ...c, [key]: value }));
  }

  function setKnownFor(idx: number, partial: Partial<KnownForItem>) {
    setContent((c) => {
      const list = (c.knownFor ?? []).slice();
      while (list.length <= idx) list.push({ ...EMPTY_KNOWN_FOR });
      const current = list[idx] ?? { ...EMPTY_KNOWN_FOR };
      list[idx] = { ...current, ...partial };
      return { ...c, knownFor: list };
    });
  }

  function removeKnownFor(idx: number) {
    setContent((c) => {
      const list = (c.knownFor ?? []).slice();
      list.splice(idx, 1);
      return { ...c, knownFor: list };
    });
  }

  function addKnownFor() {
    setContent((c) => {
      const list = (c.knownFor ?? []).slice();
      if (list.length >= 3) {
        Alert.alert('Limit reached', 'Up to 3 signature dishes.');
        return c;
      }
      list.push({ ...EMPTY_KNOWN_FOR });
      return { ...c, knownFor: list };
    });
  }

  async function save() {
    setSaving(true);
    setError(null);
    // Trim text fields and drop empty knownFor entries so the server stores tidy data.
    const cleaned: LocationContent = {
      heroHeadline: content.heroHeadline?.trim() || undefined,
      heroSubhead: content.heroSubhead?.trim() || undefined,
      about: content.about?.trim() || undefined,
      contactEmail: content.contactEmail?.trim() || undefined,
      instagramHandle: content.instagramHandle?.trim() || undefined,
      reservationsNote: content.reservationsNote?.trim() || undefined,
      knownFor: (content.knownFor ?? [])
        .filter((k) => k.title.trim() !== '' || k.desc.trim() !== '' || (k.image ?? '').trim() !== '')
        .map((k) => ({
          title: k.title.trim(),
          desc: k.desc.trim(),
          image: (k.image ?? '').trim(),
        })),
    };
    try {
      const next = await configApi.saveWebsiteConfig(locationId, { websiteTemplate: template, content: cleaned });
      setTemplate((next.websiteTemplate ?? 'saffron') as WebsiteTemplateKey);
      setContent(next.content ?? {});
      Alert.alert('Saved', 'Website content updated.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save website');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Text style={styles.muted}>Loading…</Text>;

  const knownFor = content.knownFor ?? [];

  return (
    <View style={styles.wrap}>
      {error !== null && <Text style={styles.error}>{error}</Text>}

      <View>
        <Text style={styles.fieldLabel}>Template</Text>
        <View style={styles.templateRow}>
          {TEMPLATES.map(({ key, label, help }) => {
            const active = template === key;
            return (
              <Pressable
                key={key}
                accessibilityRole="radio"
                accessibilityLabel={`${label} template: ${help}`}
                accessibilityState={{ selected: active }}
                onPress={() => setTemplate(key)}
                style={[styles.templateOption, active && styles.templateOptionActive]}
                hitSlop={6}
              >
                <Text style={[styles.templateLabel, active && styles.templateLabelActive]}>{label}</Text>
                <Text style={[styles.templateHelp, active && styles.templateHelpActive]}>{help}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View>
        <Text style={styles.fieldLabel}>Hero headline</Text>
        <TextInput
          value={content.heroHeadline ?? ''}
          onChangeText={(v) => setField('heroHeadline', v)}
          placeholder="A warm welcome to South Indian cooking."
          placeholderTextColor={theme.color.textMuted}
          style={styles.input}
          accessibilityLabel="Hero headline"
        />
      </View>

      <View>
        <Text style={styles.fieldLabel}>Hero subhead</Text>
        <TextInput
          value={content.heroSubhead ?? ''}
          onChangeText={(v) => setField('heroSubhead', v)}
          placeholder="Two short lines under the headline."
          placeholderTextColor={theme.color.textMuted}
          style={[styles.input, styles.textarea]}
          multiline
          accessibilityLabel="Hero subhead"
        />
      </View>

      <View>
        <Text style={styles.fieldLabel}>About</Text>
        <TextInput
          value={content.about ?? ''}
          onChangeText={(v) => setField('about', v)}
          placeholder="A few paragraphs about your restaurant. Plain text."
          placeholderTextColor={theme.color.textMuted}
          style={[styles.input, styles.aboutTextarea]}
          multiline
          accessibilityLabel="About copy"
        />
      </View>

      <View>
        <Text style={styles.fieldLabel}>Contact email (optional)</Text>
        <TextInput
          value={content.contactEmail ?? ''}
          onChangeText={(v) => setField('contactEmail', v)}
          placeholder="hello@example.com"
          placeholderTextColor={theme.color.textMuted}
          autoCapitalize="none"
          keyboardType="email-address"
          style={styles.input}
          accessibilityLabel="Contact email"
        />
      </View>

      <View>
        <Text style={styles.fieldLabel}>Instagram handle (optional)</Text>
        <TextInput
          value={content.instagramHandle ?? ''}
          onChangeText={(v) => setField('instagramHandle', v)}
          placeholder="@yourhandle"
          placeholderTextColor={theme.color.textMuted}
          autoCapitalize="none"
          style={styles.input}
          accessibilityLabel="Instagram handle"
        />
      </View>

      <View>
        <Text style={styles.fieldLabel}>Reservations note (optional)</Text>
        <TextInput
          value={content.reservationsNote ?? ''}
          onChangeText={(v) => setField('reservationsNote', v)}
          placeholder="Walk-ins welcome. Call (206) 555-1234 for parties of 8+."
          placeholderTextColor={theme.color.textMuted}
          style={[styles.input, styles.textarea]}
          multiline
          accessibilityLabel="Reservations note"
        />
      </View>

      <View style={styles.divider} />

      <View>
        <Text style={styles.fieldLabel}>Signature dishes (up to 3)</Text>
        <Text style={styles.helpSmall}>
          Title + description for each. To add or change a photo, open the web admin — image upload coming to the
          app soon.
        </Text>

        {knownFor.map((k, idx) => (
          <View key={idx} style={styles.knownForCard}>
            <View style={styles.knownForHeader}>
              <Text style={styles.knownForIndex}>Dish {idx + 1}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Remove dish ${idx + 1}`}
                onPress={() => removeKnownFor(idx)}
                style={styles.removeButton}
                hitSlop={6}
              >
                <Text style={styles.removeButtonText}>×</Text>
              </Pressable>
            </View>
            <TextInput
              value={k.title}
              onChangeText={(v) => setKnownFor(idx, { title: v })}
              placeholder="Dish name (e.g. Masala Dosa)"
              placeholderTextColor={theme.color.textMuted}
              style={styles.input}
              accessibilityLabel={`Dish ${idx + 1} title`}
            />
            <TextInput
              value={k.desc}
              onChangeText={(v) => setKnownFor(idx, { desc: v })}
              placeholder="One-line description"
              placeholderTextColor={theme.color.textMuted}
              style={styles.input}
              accessibilityLabel={`Dish ${idx + 1} description`}
            />
            {k.image ? (
              <Text style={styles.helpSmall}>Photo on file: {k.image}</Text>
            ) : (
              <Text style={styles.helpSmall}>No photo. Add one from the web admin.</Text>
            )}
          </View>
        ))}

        {knownFor.length < 3 && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add signature dish"
            onPress={addKnownFor}
            style={styles.secondaryButton}
            hitSlop={6}
          >
            <Text style={styles.secondaryButtonText}>+ Add signature dish</Text>
          </Pressable>
        )}
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Save website content"
        disabled={saving}
        onPress={() => void save()}
        style={[styles.primaryButton, saving && styles.primaryButtonDisabled]}
      >
        <Text style={styles.primaryButtonText}>{saving ? 'Saving…' : 'Save website'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: theme.space.lg },
  error: { color: theme.color.warn, fontWeight: '600' },
  muted: { color: theme.color.textMuted, fontSize: 13 },
  helpSmall: { color: theme.color.textMuted, fontSize: 12, lineHeight: 16 },
  fieldLabel: {
    color: theme.color.textMuted,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    fontWeight: '700',
    marginBottom: theme.space.sm,
  },
  templateRow: { flexDirection: 'row', gap: theme.space.sm },
  templateOption: {
    flex: 1,
    paddingVertical: theme.space.md,
    paddingHorizontal: theme.space.md,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.color.line,
    backgroundColor: theme.color.surface,
    minHeight: 64,
  },
  templateOptionActive: { borderColor: theme.color.accent, backgroundColor: theme.color.accent },
  templateLabel: { color: theme.color.text, fontSize: 14, fontWeight: '800' },
  templateLabelActive: { color: theme.color.accentFg },
  templateHelp: { color: theme.color.textMuted, fontSize: 12, marginTop: 4, lineHeight: 16 },
  templateHelpActive: { color: theme.color.accentFg, opacity: 0.85 },
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
  textarea: { minHeight: 60, textAlignVertical: 'top' },
  aboutTextarea: { minHeight: 100, textAlignVertical: 'top' },
  divider: { height: 1, backgroundColor: theme.color.line },
  knownForCard: {
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.color.line,
    backgroundColor: theme.color.surface,
    padding: theme.space.md,
    gap: theme.space.sm,
    marginBottom: theme.space.sm,
  },
  knownForHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  knownForIndex: {
    color: theme.color.accent,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    fontWeight: '700',
  },
  removeButton: {
    width: 32,
    height: 32,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.color.warn,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeButtonText: { color: theme.color.warn, fontSize: 18, fontWeight: '700', lineHeight: 18 },
  secondaryButton: {
    paddingVertical: theme.space.md,
    paddingHorizontal: theme.space.lg,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.color.line,
    alignItems: 'center',
    backgroundColor: theme.color.surface,
    minHeight: 44,
    justifyContent: 'center',
  },
  secondaryButtonText: { color: theme.color.text, fontWeight: '700', fontSize: 14 },
  primaryButton: {
    borderRadius: theme.radius.md,
    backgroundColor: theme.color.accent,
    paddingVertical: theme.space.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  primaryButtonDisabled: { opacity: 0.45 },
  primaryButtonText: { color: theme.color.accentFg, fontWeight: '800', fontSize: 15 },
});
