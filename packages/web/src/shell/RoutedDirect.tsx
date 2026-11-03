import type { User, UserSearchResult } from '@chat/contracts';
import { useEffect, useState } from 'react';
import { useAuth } from '@/auth/AuthProvider';
import { Skeleton } from '@/components/ui/skeleton';
import { ConversationView } from './ConversationView';

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

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      const result = await getDirectConversation(userId, controller.signal);
      if (controller.signal.aborted) return;
      if (!result.ok) {
        setLooked({ status: 'unreachable', notFound: result.notFound === true });
      } else if (result.conversationId !== undefined) {
        onExisting(result.conversationId);
      } else {
        setLooked({ status: 'new', peer: result.peer });
      }
    })();
    return () => controller.abort();
    // `onExisting` is a fresh closure on every render; the lookup runs once per User.
  }, [userId, getDirectConversation]);

  if (looked.status === 'new') {
    return (
      <ConversationView
        user={user}
        target={{ kind: 'direct', peer: looked.peer }}
        onSent={onStarted}
        onStarted={onStarted}
        onAtLatestChange={onAtLatestChange}
        reading={reading}
      />
    );
  }
  if (looked.status === 'unreachable') {
    return (
      <main className="flex flex-1 items-center justify-center p-6 text-center text-muted-foreground">
        {looked.notFound ? "This user can't be found." : 'Could not load this user. Try again.'}
      </main>
    );
  }
  return (
    <div
      role="status"
      aria-label="Loading conversation"
      className="flex h-12 items-center border-b px-4"
    >
      <Skeleton className="h-5 w-40" />
    </div>
  );
}
