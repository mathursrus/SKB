import { Linking, StyleSheet, View } from 'react-native';

import { events, logger } from '@/core/logger';
import type { WaitingParty } from '@/core/party';
import { hasDialablePhone } from '@/core/party';
import { calls } from '@/net/endpoints';
import { useAuthStore } from '@/state/auth';
import { useChatStore } from '@/state/chat';
import { Button } from '@/ui/Button';

interface Props {
  party: WaitingParty;
  onSeat: () => void;
  onNotify: () => void;
  onRemove: () => void;
}

/**
 * Three host comm channels: Notify, Chat, Call. Custom SMS and Custom
 * Call were retired — compose lives in Chat, the Call button doesn't
 * need a separate confirm dialog. Mirrors the web host stand exactly
 * (issue #102).
 *
 * Reachability:
 *   - SMS goes out when the diner consented (smsCapable=true).
 *   - In-app chat appears in the diner's queue page when the tenant has
 *     features.chat=true.
 *   - The host's compose surface is enabled whenever EITHER channel can
 *     deliver — so a SMS-consenting diner is reachable even if the tenant
 *     turned off the in-app chat panel, and a chat-only diner is reachable
 *     even if they didn't consent to SMS.
 */
export function RowActions({ party, onSeat, onNotify, onRemove }: Props) {
  const phoneOk = hasDialablePhone(party);
  const locationId = useAuthStore((s) => s.locationId);
  const chatFeatureOn = useAuthStore((s) => s.brand?.guestFeatures.chat ?? true);
  const openChat = useChatStore((s) => s.openChat);
  const isCalled = party.state === 'called';
  const smsCapable = party.smsCapable === true;
  const reachable = phoneOk && (smsCapable || chatFeatureOn);

  function handleCall() {
    if (!party.phoneForDial || !locationId) return;
    logger.info(events.callInitiate, { partyId: party.id });
    void calls.log(locationId, party.id).catch(() => {});
    const cleaned = party.phoneForDial.replace(/[^\d+]/g, '');
    void Linking.openURL(`tel:${cleaned}`);
  }

  return (
    <View style={styles.container}>
      <Button
        label="Seat"
        icon="people"
        variant="primary"
        onPress={onSeat}
      />
      <Button
        label={isCalled ? 'Re-notify' : 'Notify'}
        icon="notifications"
        variant={isCalled ? 'primary' : 'default'}
        onPress={onNotify}
        disabled={!reachable}
      />
      <Button
        label="Chat"
        icon="chatbubble-ellipses"
        disabled={!reachable}
        badge={party.unreadChat}
        onPress={() => void openChat(party.id, party.code, smsCapable)}
        accessibilityLabel={`Chat with ${party.name}`}
      />
      <Button
        label="Call"
        icon="call"
        disabled={!phoneOk}
        onPress={handleCall}
        accessibilityLabel={`Call ${party.name}`}
      />
      <Button
        label="No-show"
        icon="close-circle"
        variant="danger"
        onPress={onRemove}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    rowGap: 8,
  },
});
