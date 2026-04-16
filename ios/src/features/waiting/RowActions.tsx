import { Linking, View } from 'react-native';

import { events, logger } from '@/core/logger';
import type { WaitingParty } from '@/core/party';
import { hasDialablePhone } from '@/core/party';
import { calls } from '@/net/endpoints';
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
  const openChat = useChatStore((s) => s.openChat);

  function handleCall() {
    if (!party.phoneForDial) return;
    logger.info(events.callInitiate, { partyId: party.id });
    void calls.log(party.id).catch(() => {});
    const cleaned = party.phoneForDial.replace(/[^\d+]/g, '');
    void Linking.openURL(`tel:${cleaned}`);
  }

  return (
    <View
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'flex-end',
        alignItems: 'center',
      }}
    >
      <Button label="Seat" variant="primary" onPress={onSeat} />
      <Button label="Notify" onPress={onNotify} disabled={!phoneOk} />
      <Button
        label="Chat"
        newFeature
        disabled={!phoneOk}
        badge={party.unreadChat}
        onPress={() => void openChat(party.id, party.code)}
        accessibilityLabel={`Chat with ${party.name}`}
      />
      <Button
        label="Call"
        newFeature
        disabled={!phoneOk}
        onPress={handleCall}
        accessibilityLabel={`Call ${party.name}`}
      />
      <Button label="Custom SMS" disabled={!phoneOk} onPress={onCustomSms} />
      <Button label="Custom Call" disabled={!phoneOk} onPress={onCustomCall} />
      <Button label="No-show" variant="danger" onPress={onRemove} />
    </View>
  );
}
