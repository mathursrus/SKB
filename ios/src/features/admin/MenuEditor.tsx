import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import {
  menu as menuApi,
  type LocationMenu,
  type MenuItem,
  type MenuSection,
} from '@/net/endpoints';
import { theme } from '@/ui/theme';

/** Short, monotonically-unique id. Server treats `id` as opaque string. */
function freshId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function makeEmptySection(): MenuSection {
  return { id: freshId('s'), title: '', items: [] };
}

function makeEmptyItem(): MenuItem {
  return { id: freshId('i'), name: '', description: '', price: '', availability: 'available' };
}

export function MenuEditor({ locationId }: { locationId: string }) {
  const [menu, setMenu] = useState<LocationMenu>({ sections: [] });
  const [menuUrl, setMenuUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    menuApi
      .get(locationId)
      .then((next) => {
        if (cancelled) return;
        setMenu(next.menu ?? { sections: [] });
        setMenuUrl(next.menuUrl ?? '');
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load menu');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [locationId]);

  function updateSection(idx: number, partial: Partial<MenuSection>) {
    setMenu((m) => ({
      sections: m.sections.map((s, i) => (i === idx ? { ...s, ...partial } : s)),
    }));
  }

  function updateItem(sIdx: number, iIdx: number, partial: Partial<MenuItem>) {
    setMenu((m) => ({
      sections: m.sections.map((s, i) =>
        i === sIdx
          ? { ...s, items: s.items.map((it, j) => (j === iIdx ? { ...it, ...partial } : it)) }
          : s,
      ),
    }));
  }

  function moveSection(idx: number, dir: -1 | 1) {
    setMenu((m) => {
      const target = idx + dir;
      if (target < 0 || target >= m.sections.length) return m;
      const a = m.sections[idx];
      const b = m.sections[target];
      if (!a || !b) return m;
      const sections = m.sections.slice();
      sections[idx] = b;
      sections[target] = a;
      return { sections };
    });
  }

  function moveItem(sIdx: number, iIdx: number, dir: -1 | 1) {
    setMenu((m) => ({
      sections: m.sections.map((s, i) => {
        if (i !== sIdx) return s;
        const target = iIdx + dir;
        if (target < 0 || target >= s.items.length) return s;
        const a = s.items[iIdx];
        const b = s.items[target];
        if (!a || !b) return s;
        const items = s.items.slice();
        items[iIdx] = b;
        items[target] = a;
        return { ...s, items };
      }),
    }));
  }

  function removeSection(idx: number) {
    const section = menu.sections[idx];
    if (!section) return;
    Alert.alert(
      `Remove "${section.title || 'section'}"?`,
      'All items in this section will be removed too.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () =>
            setMenu((m) => ({ sections: m.sections.filter((_, i) => i !== idx) })),
        },
      ],
    );
  }

  function removeItem(sIdx: number, iIdx: number) {
    setMenu((m) => ({
      sections: m.sections.map((s, i) =>
        i === sIdx ? { ...s, items: s.items.filter((_, j) => j !== iIdx) } : s,
      ),
    }));
  }

  function addSection() {
    setMenu((m) => ({ sections: [...m.sections, makeEmptySection()] }));
  }

  function addItem(sIdx: number) {
    setMenu((m) => ({
      sections: m.sections.map((s, i) => (i === sIdx ? { ...s, items: [...s.items, makeEmptyItem()] } : s)),
    }));
  }

  async function save() {
    // Strip empty sections / items so the server stores tidy data.
    const cleaned: LocationMenu = {
      sections: menu.sections
        .map((s) => ({
          ...s,
          title: s.title.trim(),
          items: s.items
            .filter((it) => it.name.trim() !== '')
            .map((it) => ({
              ...it,
              name: it.name.trim(),
              description: it.description?.trim() || undefined,
              price: it.price?.trim() || undefined,
            })),
        }))
        .filter((s) => s.title !== '' || s.items.length > 0),
    };
    setSaving(true);
    setError(null);
    try {
      const next = await menuApi.save(locationId, { menu: cleaned, menuUrl });
      setMenu(next.menu ?? { sections: [] });
      setMenuUrl(next.menuUrl ?? '');
      Alert.alert('Saved', 'Menu updated.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save menu');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Text style={styles.muted}>Loading…</Text>;

  return (
    <View style={styles.wrap}>
      {error !== null && <Text style={styles.error}>{error}</Text>}

      <Text style={styles.help}>
        Sections appear on the diner menu page in this order. Drop a section&apos;s title and items completely to
        delete it. To add menu photos, use the web admin (image upload coming to the app soon).
      </Text>

      {menu.sections.map((section, sIdx) => (
        <View key={section.id} style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <TextInput
              value={section.title}
              onChangeText={(v) => updateSection(sIdx, { title: v })}
              placeholder="Section title (e.g. Appetizers)"
              placeholderTextColor={theme.color.textMuted}
              style={styles.sectionTitleInput}
              accessibilityLabel={`Section ${sIdx + 1} title`}
            />
            <View style={styles.sectionControls}>
              <ReorderButton
                label="↑"
                accessibilityLabel={`Move section ${sIdx + 1} up`}
                disabled={sIdx === 0}
                onPress={() => moveSection(sIdx, -1)}
              />
              <ReorderButton
                label="↓"
                accessibilityLabel={`Move section ${sIdx + 1} down`}
                disabled={sIdx === menu.sections.length - 1}
                onPress={() => moveSection(sIdx, 1)}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Remove section ${sIdx + 1}`}
                onPress={() => removeSection(sIdx)}
                style={styles.removeButton}
                hitSlop={6}
              >
                <Text style={styles.removeButtonText}>×</Text>
              </Pressable>
            </View>
          </View>

          {section.items.length === 0 && (
            <Text style={styles.muted}>No items yet.</Text>
          )}

          {section.items.map((item, iIdx) => (
            <View key={item.id} style={styles.itemRow}>
              <View style={styles.itemFields}>
                <TextInput
                  value={item.name}
                  onChangeText={(v) => updateItem(sIdx, iIdx, { name: v })}
                  placeholder="Item name"
                  placeholderTextColor={theme.color.textMuted}
                  style={styles.input}
                  accessibilityLabel={`Item ${iIdx + 1} name`}
                />
                <TextInput
                  value={item.description ?? ''}
                  onChangeText={(v) => updateItem(sIdx, iIdx, { description: v })}
                  placeholder="Description (optional)"
                  placeholderTextColor={theme.color.textMuted}
                  style={[styles.input, styles.textarea]}
                  multiline
                  accessibilityLabel={`Item ${iIdx + 1} description`}
                />
                <TextInput
                  value={item.price ?? ''}
                  onChangeText={(v) => updateItem(sIdx, iIdx, { price: v })}
                  placeholder="$12.50 or market"
                  placeholderTextColor={theme.color.textMuted}
                  style={[styles.input, styles.priceInput]}
                  accessibilityLabel={`Item ${iIdx + 1} price`}
                />
              </View>
              <View style={styles.itemControls}>
                <ReorderButton
                  label="↑"
                  accessibilityLabel={`Move item ${iIdx + 1} up`}
                  disabled={iIdx === 0}
                  onPress={() => moveItem(sIdx, iIdx, -1)}
                />
                <ReorderButton
                  label="↓"
                  accessibilityLabel={`Move item ${iIdx + 1} down`}
                  disabled={iIdx === section.items.length - 1}
                  onPress={() => moveItem(sIdx, iIdx, 1)}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remove item ${iIdx + 1}`}
                  onPress={() => removeItem(sIdx, iIdx)}
                  style={styles.removeButton}
                  hitSlop={6}
                >
                  <Text style={styles.removeButtonText}>×</Text>
                </Pressable>
              </View>
            </View>
          ))}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add item to section"
            onPress={() => addItem(sIdx)}
            style={styles.secondaryButton}
            hitSlop={6}
          >
            <Text style={styles.secondaryButtonText}>+ Add item</Text>
          </Pressable>
        </View>
      ))}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Add menu section"
        onPress={addSection}
        style={styles.secondaryButton}
        hitSlop={6}
      >
        <Text style={styles.secondaryButtonText}>+ Add section</Text>
      </Pressable>

      <View style={styles.divider} />
      <Text style={styles.fieldLabel}>External menu URL (optional fallback)</Text>
      <Text style={styles.helpSmall}>
        If you keep your menu on Squarespace or a PDF, paste the link here. Used when no sections are configured.
      </Text>
      <TextInput
        value={menuUrl}
        onChangeText={setMenuUrl}
        placeholder="https://example.com/menu.pdf"
        placeholderTextColor={theme.color.textMuted}
        autoCapitalize="none"
        keyboardType="url"
        style={styles.input}
        accessibilityLabel="External menu URL"
      />

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Save menu"
        disabled={saving}
        onPress={() => void save()}
        style={[styles.primaryButton, saving && styles.primaryButtonDisabled]}
      >
        <Text style={styles.primaryButtonText}>{saving ? 'Saving…' : 'Save menu'}</Text>
      </Pressable>
    </View>
  );
}

function ReorderButton({
  label,
  accessibilityLabel,
  disabled,
  onPress,
}: {
  label: string;
  accessibilityLabel: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !!disabled }}
      onPress={onPress}
      disabled={disabled}
      style={[styles.reorderButton, disabled && styles.reorderButtonDisabled]}
      hitSlop={6}
    >
      <Text style={styles.reorderButtonText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: theme.space.lg },
  error: { color: theme.color.warn, fontWeight: '600' },
  muted: { color: theme.color.textMuted, fontSize: 13 },
  help: { color: theme.color.textMuted, fontSize: 13, lineHeight: 18 },
  helpSmall: { color: theme.color.textMuted, fontSize: 12, lineHeight: 16 },
  fieldLabel: {
    color: theme.color.textMuted,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    fontWeight: '700',
  },
  sectionCard: {
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.color.line,
    backgroundColor: theme.color.surface,
    padding: theme.space.md,
    gap: theme.space.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.sm,
  },
  sectionTitleInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: theme.color.line,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.space.md,
    paddingVertical: theme.space.md,
    color: theme.color.text,
    fontSize: 15,
    fontWeight: '700',
    backgroundColor: theme.color.surfaceRaised,
    minHeight: 44,
  },
  sectionControls: {
    flexDirection: 'row',
    gap: 4,
  },
  itemRow: {
    flexDirection: 'row',
    gap: theme.space.sm,
    paddingVertical: theme.space.sm,
    borderTopWidth: 1,
    borderTopColor: theme.color.line,
  },
  itemFields: { flex: 1, gap: theme.space.sm },
  itemControls: { flexDirection: 'column', gap: 4, justifyContent: 'flex-start' },
  input: {
    borderWidth: 1,
    borderColor: theme.color.line,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.space.md,
    paddingVertical: theme.space.md,
    color: theme.color.text,
    fontSize: 14,
    backgroundColor: theme.color.surfaceRaised,
    minHeight: 44,
  },
  textarea: { minHeight: 60, textAlignVertical: 'top' },
  priceInput: { width: 140 },
  reorderButton: {
    width: 32,
    height: 32,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.color.line,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.color.surfaceRaised,
  },
  reorderButtonDisabled: { opacity: 0.3 },
  reorderButtonText: { color: theme.color.text, fontSize: 14, fontWeight: '700' },
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
  divider: { height: 1, backgroundColor: theme.color.line, marginVertical: theme.space.sm },
});
