import type { ConversationSummary, User } from '@chat/contracts';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/auth/AuthProvider';
import { ConversationView } from './ConversationView';
import { targetOf, type ConversationTarget } from './conversation-target';
import { LoadingConversation, Unreachable } from './RoutedStatus';

const NOT_FOUND = "This conversation doesn't exist or you don't have access to it.";

type Fetched =
  | { status: 'loading' }
  | { status: 'ready'; target: ConversationTarget | undefined }
  | { status: 'unreachable'; notFound: boolean };

/**
 * The Conversation a URL names. Its header and Group state come from the Conversation list's
 * entry when that has loaded, else from the Conversation itself.
 */
export function RoutedConversation({
  user,
  id,
  entry,
  onLeft,
  onAtLatestChange,
  onSent,
  reading,
}: {
  user: User;
  id: string;
  /** The Conversation list's entry for `id`, when the list has loaded and has it. */
  entry: ConversationSummary | undefined;
  onLeft: () => void;
  onAtLatestChange: (atLatest: boolean) => void;
  onSent: (conversationId: string) => void;
  reading: boolean;
}) {
  const { getConversation } = useAuth();
  const [fetched, setFetched] = useState<Fetched>({ status: 'loading' });
  const listed = entry !== undefined;

  useEffect(() => {
    if (listed) return;
    const controller = new AbortController();
    void (async () => {
      const result = await getConversation(id, controller.signal);
      if (controller.signal.aborted) return;
      setFetched(
        result.ok
          ? { status: 'ready', target: targetOf(result.conversation, user) }
          : { status: 'unreachable', notFound: result.notFound === true },
      );
    })();
    return () => controller.abort();
  }, [listed, id, getConversation, user]);

  const target = useMemo(
    () => (entry ? targetOf(entry, user) : fetched.status === 'ready' ? fetched.target : undefined),
    [entry, fetched, user],
  );

  if (target) {
    return (
      <ConversationView
        user={user}
        target={target}
        conversationId={id}
        onLeft={onLeft}
        onAtLatestChange={onAtLatestChange}
        reading={reading}
        onSent={onSent}
      />
    );
  }
  // A listed or fetched Conversation that has no target is a Direct one with no other User.
  if (entry !== undefined || fetched.status === 'ready') {
    return <Unreachable>{NOT_FOUND}</Unreachable>;
  }
  if (fetched.status === 'unreachable') {
    return (
      <Unreachable>
        {fetched.notFound ? NOT_FOUND : 'Could not load this conversation. Try again.'}
      </Unreachable>
    );
  }
  return <LoadingConversation />;
}
