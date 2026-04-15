import { ChatSlideOver } from '@/features/chat/ChatSlideOver';
import { WaitingList } from '@/features/waiting/WaitingList';

export default function WaitingScreen() {
  return (
    <>
      <WaitingList />
      <ChatSlideOver />
    </>
  );
}
