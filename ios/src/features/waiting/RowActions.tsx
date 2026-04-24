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
  onCustomSms: () => void;
  onCustomCall: () => void;
  onRemove: () => void;
}

export function RowActions({
  party,
  onSeat,
  onNotify,
  onCustomSms,
  onCustomCall,
  onRemove,
}: Props) {
  const phoneOk = hasDialablePhone(party);
  const locationId = useAuthStore((s) => s.locationId);
  const openChat = useChatStore((s) => s.openChat);
  const isCalled = party.state === 'called';

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
        disabled={!phoneOk}
      />
      <Button
        label="Chat"
        icon="chatbubble-ellipses"
        disabled={!phoneOk}
        badge={party.unreadChat}
        onPress={() => void openChat(party.id, party.code)}
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
        label="SMS…"
        icon="create"
        disabled={!phoneOk}
        onPress={onCustomSms}
        accessibilityLabel="Custom SMS"
      />
      <Button
        label="Dial…"
        icon="keypad"
        disabled={!phoneOk}
        onPress={onCustomCall}
        accessibilityLabel="Confirm before dial"
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
