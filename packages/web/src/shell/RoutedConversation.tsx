import type { ConversationSummary, User } from '@chat/contracts';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/auth/AuthProvider';
import { Skeleton } from '@/components/ui/skeleton';
import { ConversationView } from './ConversationView';
import { targetOfDetail, targetOfSummary, type ConversationTarget } from './conversation-target';

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
          ? { status: 'ready', target: targetOfDetail(result.conversation, user) }
          : { status: 'unreachable', notFound: result.notFound === true },
      );
    })();
    return () => controller.abort();
  }, [listed, id, getConversation, user]);

  const target = useMemo(
    () =>
      entry
        ? targetOfSummary(entry, user)
        : fetched.status === 'ready'
          ? fetched.target
          : undefined,
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
  if (fetched.status === 'unreachable') {
    return (
      <main className="flex flex-1 items-center justify-center p-6 text-center text-muted-foreground">
        {fetched.notFound
          ? "This conversation doesn't exist or you don't have access to it."
          : 'Could not load this conversation. Try again.'}
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
