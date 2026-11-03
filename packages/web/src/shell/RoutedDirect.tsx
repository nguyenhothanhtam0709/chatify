import type { User, UserSearchResult } from '@chat/contracts';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/auth/AuthProvider';
import { ConversationView } from './ConversationView';
import { LoadingConversation, Unreachable } from './RoutedStatus';

type Looked =
  | { status: 'loading' }
  | { status: 'new'; peer: UserSearchResult }
  | { status: 'unreachable'; notFound: boolean };

/**
 * The Direct view a `/direct/:userId` URL names. When the User already has a Direct Conversation
 * with the peer, `onExisting` replaces the location with it. Otherwise it is the "Say hello"
 * view, until a Message (sent here, or arriving from the peer) starts the Conversation.
 */
export function RoutedDirect({
  user,
  userId,
  onExisting,
  onStarted,
  onAtLatestChange,
  reading,
}: {
  user: User;
  userId: string;
  /** The lookup found the Direct Conversation: the location should become its URL. */
  onExisting: (conversationId: string) => void;
  /** A first Message, sent here or received, started the Conversation. */
  onStarted: (conversationId: string) => void;
  onAtLatestChange: (atLatest: boolean) => void;
  reading: boolean;
}) {
  const { getDirectConversation } = useAuth();
  const [looked, setLooked] = useState<Looked>({ status: 'loading' });
  // The lookup runs once per User, whatever closure `onExisting` is on that render.
  const onExistingRef = useRef(onExisting);
  useEffect(() => {
    onExistingRef.current = onExisting;
  });
  // Only the first Message starts the Conversation; later sends have nothing more to do here.
  const started = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      const result = await getDirectConversation(userId, controller.signal);
      if (controller.signal.aborted) return;
      if (!result.ok) {
        setLooked({ status: 'unreachable', notFound: result.notFound === true });
      } else if (result.conversationId !== undefined) {
        onExistingRef.current(result.conversationId);
      } else {
        setLooked({ status: 'new', peer: result.peer });
      }
    })();
    return () => controller.abort();
  }, [userId, getDirectConversation]);

  const startOnce = (conversationId: string) => {
    if (started.current) return;
    started.current = true;
    onStarted(conversationId);
  };

  if (looked.status === 'new') {
    return (
      <ConversationView
        user={user}
        target={{ kind: 'direct', peer: looked.peer }}
        onSent={startOnce}
        onStarted={startOnce}
        onAtLatestChange={onAtLatestChange}
        reading={reading}
      />
    );
  }
  if (looked.status === 'unreachable') {
    return (
      <Unreachable>
        {looked.notFound ? "This user can't be found." : 'Could not load this user. Try again.'}
      </Unreachable>
    );
  }
  return <LoadingConversation />;
}
