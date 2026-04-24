import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState, type ComponentProps } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { destinationForRole } from '@/core/navigation';
import { roleLabel } from '@/core/auth';
import { useAuthStore } from '@/state/auth';
import { useGuestStore } from '@/state/guest';
import { useTheme, type Theme } from '@/ui/theme';

type LoginMode = 'staff' | 'guest';

export default function LoginScreen() {
  const [mode, setMode] = useState<LoginMode>('staff');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [guestLocation, setGuestLocation] = useState('skb');
  const [guestCode, setGuestCode] = useState('');

  const status = useAuthStore((s) => s.status);
  const error = useAuthStore((s) => s.error);
  const role = useAuthStore((s) => s.role);
  const memberships = useAuthStore((s) => s.memberships);
  const pendingStage = useAuthStore((s) => s.pendingStage);
  const loginStaff = useAuthStore((s) => s.loginStaff);
  const chooseMembership = useAuthStore((s) => s.chooseMembership);
  const continueAsGuest = useAuthStore((s) => s.continueAsGuest);
  const logout = useAuthStore((s) => s.logout);
  const setTrackedCode = useGuestStore((s) => s.setTrackedCode);
  const theme = useTheme();
  const styles = makeStyles(theme);

  useEffect(() => {
    if (status === 'loggedIn') {
      router.replace(destinationForRole(role));
    }
  }, [role, status]);

  const staffDisabled = status === 'loggingIn' || email.trim().length === 0 || password.length === 0;
  const guestDisabled = status === 'loggingIn' || guestLocation.trim().length === 0;

  async function handleGuestContinue() {
    setTrackedCode(guestCode);
    await continueAsGuest(guestLocation);
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <View style={styles.hero}>
            <Text style={styles.brand}>OSH</Text>
            <Text style={styles.heroTitle}>Restaurant OS on your phone.</Text>
            <Text style={styles.heroSubtitle}>
              Staff gets the right workspace for their role. Guests get a branded queue tracker for the restaurant they are visiting.
            </Text>
            <View style={styles.heroChips}>
              <PersonaChip icon="sparkles-outline" label="Admin workspace" />
              <PersonaChip icon="restaurant-outline" label="Host floor tools" />
              <PersonaChip icon="people-outline" label="Guest tracker" />
            </View>
          </View>

          <View style={styles.card}>
            <View style={styles.modeRow}>
              <ModeButton
                label="Admin / Host"
                icon="person-circle-outline"
                active={mode === 'staff'}
                onPress={() => setMode('staff')}
              />
              <ModeButton
                label="Guest"
                icon="ticket-outline"
                active={mode === 'guest'}
                onPress={() => setMode('guest')}
              />
            </View>

            {pendingStage === 'locationPicker' ? (
              <View>
                <Text style={styles.sectionTitle}>Which restaurant?</Text>
                <Text style={styles.sectionSubtitle}>
                  This OSH account can work multiple restaurants. Pick the workspace you want.
                </Text>
                <View style={styles.locationList}>
                  {memberships.map((membership) => (
                    <Pressable
                      key={membership.id}
                      style={styles.locationCard}
                      onPress={() => void chooseMembership(membership.locationId)}
                    >
                      <View>
                        <Text style={styles.locationName}>{membership.locationId}</Text>
                        <Text style={styles.locationRole}>{roleLabel(membership.role)}</Text>
                      </View>
                      <Ionicons name="arrow-forward" size={18} color={theme.color.textMuted} />
                    </Pressable>
                  ))}
                </View>
                <Pressable style={styles.resetLink} onPress={() => void logout()}>
                  <Text style={styles.resetLinkText}>Use different credentials</Text>
                </Pressable>
              </View>
            ) : mode === 'staff' ? (
              <View>
                <Text style={styles.sectionTitle}>Sign in with your OSH account</Text>
                <Text style={styles.sectionSubtitle}>
                  Owners, admins, and hosts all use the same named login now. The app routes you into the right view after sign-in.
                </Text>

                <Field
                  label="Email"
                  value={email}
                  onChangeText={setEmail}
                  placeholder="you@restaurant.com"
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
                <Field
                  label="Password"
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Enter password"
                  secureTextEntry
                />

                {error !== null && <Text style={styles.error}>{error}</Text>}

                <Pressable
                  style={[styles.primaryButton, staffDisabled && styles.buttonDisabled]}
                  disabled={staffDisabled}
                  onPress={() => void loginStaff(email.trim(), password)}
                >
                  <Text style={styles.primaryButtonText}>
                    {status === 'loggingIn' ? 'Signing in...' : 'Continue'}
                  </Text>
                </Pressable>
              </View>
            ) : (
              <View>
                <Text style={styles.sectionTitle}>Open the guest view</Text>
                <Text style={styles.sectionSubtitle}>
                  Enter the restaurant slug to get that restaurant's branded queue experience. If you already have a code, add it now and the app will track your place in line.
                </Text>

                <Field
                  label="Restaurant slug"
                  value={guestLocation}
                  onChangeText={setGuestLocation}
                  placeholder="skb"
                  autoCapitalize="none"
                />
                <Field
                  label="Party code (optional)"
                  value={guestCode}
                  onChangeText={setGuestCode}
                  placeholder="SKB-7Q3"
                  autoCapitalize="characters"
                />

                {error !== null && <Text style={styles.error}>{error}</Text>}

                <Pressable
                  style={[styles.primaryButton, guestDisabled && styles.buttonDisabled]}
                  disabled={guestDisabled}
                  onPress={() => void handleGuestContinue()}
                >
                  <Text style={styles.primaryButtonText}>
                    {status === 'loggingIn' ? 'Opening...' : 'Open guest view'}
                  </Text>
                </Pressable>
              </View>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function PersonaChip({ icon, label }: { icon: ComponentProps<typeof Ionicons>['name']; label: string }) {
  return (
    <View style={stylesShared.heroChip}>
      <Ionicons name={icon} size={14} color="#5c3a10" />
      <Text style={stylesShared.heroChipText}>{label}</Text>
    </View>
  );
}

function ModeButton({
  label,
  icon,
  active,
  onPress,
}: {
  label: string;
  icon: ComponentProps<typeof Ionicons>['name'];
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={[stylesShared.modeButton, active && stylesShared.modeButtonActive]} onPress={onPress}>
      <Ionicons name={icon} size={16} color={active ? '#1d1306' : '#7c6242'} />
      <Text style={[stylesShared.modeButtonText, active && stylesShared.modeButtonTextActive]}>{label}</Text>
    </Pressable>
  );
}

function Field(props: React.ComponentProps<typeof TextInput> & { label: string }) {
  return (
    <View style={stylesShared.field}>
      <Text style={stylesShared.fieldLabel}>{props.label}</Text>
      <TextInput
        {...props}
        style={stylesShared.input}
        placeholderTextColor="#8b7661"
      />
    </View>
  );
}

const stylesShared = StyleSheet.create({
  heroChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    backgroundColor: '#f6dfbf',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  heroChipText: {
    color: '#5c3a10',
    fontSize: 12,
    fontWeight: '600',
  },
  modeButton: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2d4c0',
    backgroundColor: '#f9f2ea',
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  modeButtonActive: {
    borderColor: '#d49b4f',
    backgroundColor: '#f7d7a5',
  },
  modeButtonText: {
    color: '#7c6242',
    fontWeight: '600',
  },
  modeButtonTextActive: {
    color: '#1d1306',
  },
  field: {
    marginTop: 16,
  },
  fieldLabel: {
    color: '#4d3b27',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  input: {
    borderWidth: 1,
    borderColor: '#e4d9ca',
    borderRadius: 16,
    backgroundColor: '#fffdfb',
    color: '#24170c',
    fontSize: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
});

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: '#f6efe4',
    },
    flex: {
      flex: 1,
    },
    container: {
      paddingHorizontal: theme.space.lg,
      paddingVertical: theme.space.xl,
      gap: theme.space.xl,
    },
    hero: {
      borderRadius: 28,
      padding: 24,
      backgroundColor: '#1e4f47',
      gap: 14,
    },
    brand: {
      color: '#f5d6a6',
      fontSize: 16,
      fontWeight: '800',
      letterSpacing: 2,
    },
    heroTitle: {
      color: '#fff8ef',
      fontSize: 34,
      lineHeight: 38,
      fontWeight: '800',
    },
    heroSubtitle: {
      color: '#cfe3de',
      fontSize: 15,
      lineHeight: 22,
      maxWidth: 520,
    },
    heroChips: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
      marginTop: 4,
    },
    card: {
      borderRadius: 28,
      backgroundColor: '#fffaf3',
      borderWidth: 1,
      borderColor: '#eadfce',
      padding: 22,
      gap: 18,
      shadowColor: '#000',
      shadowOpacity: 0.08,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
      elevation: 3,
    },
    modeRow: {
      flexDirection: 'row',
      gap: 10,
    },
    sectionTitle: {
      color: '#24170c',
      fontSize: 24,
      fontWeight: '800',
    },
    sectionSubtitle: {
      color: '#6c5a47',
      fontSize: 14,
      lineHeight: 21,
      marginTop: 6,
    },
    error: {
      color: '#a22912',
      marginTop: 14,
      fontWeight: '600',
    },
    primaryButton: {
      marginTop: 20,
      borderRadius: 18,
      backgroundColor: '#d98b31',
      paddingVertical: 16,
      alignItems: 'center',
    },
    primaryButtonText: {
      color: '#24170c',
      fontSize: 16,
      fontWeight: '800',
    },
    buttonDisabled: {
      opacity: 0.45,
    },
    locationList: {
      gap: 10,
      marginTop: 18,
    },
    locationCard: {
      borderRadius: 18,
      borderWidth: 1,
      borderColor: '#eadfce',
      backgroundColor: '#fffdfb',
      paddingHorizontal: 16,
      paddingVertical: 15,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    locationName: {
      color: '#24170c',
      fontSize: 16,
      fontWeight: '700',
    },
    locationRole: {
      color: '#7a6750',
      marginTop: 4,
    },
    resetLink: {
      marginTop: 18,
      alignSelf: 'flex-start',
    },
    resetLinkText: {
      color: '#1f6a5d',
      fontWeight: '700',
    },
  });
}
