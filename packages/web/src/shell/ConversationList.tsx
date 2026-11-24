import type { ConversationSummary, Message } from '@chat/contracts';
import { UNREAD_COUNT_MAX, previewOf } from '@chat/contracts';
import { MessageSquare } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useAuth } from '@/auth/auth-context';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { useReconnected, useRealtimeEvents } from '@/realtime/realtime-context';
import { Skeleton } from '@/components/ui/skeleton';
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar';

type ListState =
  | { status: 'loading' }
  | { status: 'error'; error: string }
  | { status: 'ready'; list: ConversationSummary[] };

const SAME_DAY = new Intl.DateTimeFormat(undefined, { timeStyle: 'short' });
const OTHER_DAY = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

/** Time of day for today's activity, the date otherwise. */
function activityLabel(iso: string): string {
  const date = new Date(iso);
  return (date.toDateString() === new Date().toDateString() ? SAME_DAY : OTHER_DAY).format(date);
}

/** The Unread Count as the badge shows it; the server stops counting at the cap. */
const unreadLabel = (count: number): string =>
  count >= UNREAD_COUNT_MAX ? `${UNREAD_COUNT_MAX - 1}+` : String(count);

interface PushedMessage {
  message: Message;
  /** Whether the Conversation was being read when it arrived, so it adds nothing to the count. */
  reading: boolean;
}

function ListSkeleton() {
  return (
    <div role="status" aria-label="Loading conversations" className="grid gap-2 p-2">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-center gap-2">
          <Skeleton className="size-9 rounded-full" />
          <div className="grid flex-1 gap-1">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-3 w-4/5" />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * The User's Conversations, most recently active first (the server's order). Reloads whenever
 * `refreshKey` changes, e.g. after a Message is sent.
 */
export function ConversationList({
  userId,
  selectedId,
  readingId,
  refreshKey,
  onLoaded,
  onSelect,
}: {
  userId: string;
  selectedId: string | undefined;
  /**
   * The Conversation the User is reading right now: open, in a visible tab, at its latest
   * Message. New Messages there are seen as they arrive, so they add nothing to its count.
   */
  readingId: string | undefined;
  refreshKey: number;
  /** Called with every list the server returns (first load, reloads, reconnects). */
  onLoaded?: (list: ConversationSummary[]) => void;
  onSelect: (conversation: ConversationSummary) => void;
}) {
  const { listConversations } = useAuth();
  const [state, setState] = useState<ListState>({ status: 'loading' });
  const [pushedReloads, setPushedReloads] = useState(0);
  const reload = useCallback(() => setPushedReloads((n) => n + 1), []);
  // The list as of the last push: two events can land before React renders either of them.
  const current = useRef<ConversationSummary[] | undefined>(undefined);
  const show = useCallback((list: ConversationSummary[]) => {
    current.current = list;
    setState({ status: 'ready', list });
  }, []);
  // Messages pushed while a list request is in flight, to replay onto its response.
  const inFlight = useRef<PushedMessage[] | undefined>(undefined);
  // The newest Message left uncounted because the open Conversation should mark it read. Until a
  // `conversation.read` covers it, the server may still count it, which only shows once the User
  // stops reading: then the list asks the server (see the effect below).
  const awaitedRead = useRef<{ conversationId: string; sequence: number } | undefined>(undefined);
  const onLoadedRef = useRef(onLoaded);
  useLayoutEffect(() => {
    onLoadedRef.current = onLoaded;
  });

  /** The list with one pushed Message applied. */
  const applyMessage = useCallback(
    (list: ConversationSummary[], { message, reading }: PushedMessage): ConversationSummary[] => {
      // Membership notes do not touch the preview or the order (spec: only Messages do).
      if (message.kind !== 'text') return list;
      const id = message.conversationId;
      const known = list.find((c) => c.id === id);
      if (!known) {
        // Not listed (e.g. the sender's other tab started it): the server knows the rest.
        reload();
        return list;
      }
      const fromOther = message.senderId !== userId;
      if (fromOther && reading) {
        awaitedRead.current = { conversationId: id, sequence: message.sequence };
      }
      // The entry already counts it: a response or `conversation.created` got here first.
      if (message.sequence <= (known.lastMessage?.sequence ?? 0)) return list;
      const updated = {
        ...known,
        unreadCount:
          fromOther && !reading
            ? Math.min(known.unreadCount + 1, UNREAD_COUNT_MAX)
            : known.unreadCount,
        lastMessage: {
          senderId: message.senderId,
          sequence: message.sequence,
          preview: previewOf(message.body),
          createdAt: message.createdAt,
        },
      };
      return [updated, ...list.filter((c) => c !== known)];
    },
    [userId, reload],
  );

  useEffect(() => {
    const controller = new AbortController();
    const pushes: PushedMessage[] = [];
    inFlight.current = pushes;
    void (async () => {
      const result = await listConversations(controller.signal);
      if (controller.signal.aborted) return;
      inFlight.current = undefined;
      if (!result.ok) {
        current.current = undefined;
        setState({ status: 'error', error: result.error });
        return;
      }
      awaitedRead.current = undefined;
      onLoadedRef.current?.(result.conversations);
      show(pushes.reduce(applyMessage, result.conversations));
    })();
    return () => controller.abort();
  }, [listConversations, refreshKey, pushedReloads, applyMessage, show]);

  // Stopped reading with no confirmed mark-read: it was cancelled or failed for good, or is yet
  // to land. The server knows which. While the User stays, no badge is right: they see the Message.
  useEffect(() => {
    if (!awaitedRead.current || awaitedRead.current.conversationId === readingId) return;
    awaitedRead.current = undefined;
    reload();
  }, [readingId, reload]);

  useReconnected(reload);

  useRealtimeEvents(
    useCallback(
      (event) => {
        const list = current.current;
        if (event.type === 'conversation.created') {
          const { conversation } = event;
          // A response in flight may predate it; one asked for now cannot.
          if (inFlight.current) reload();
          if (!list) return;
          // An ID already listed is replaced (a re-added Former Member's entry is stale).
          show([conversation, ...list.filter((c) => c.id !== conversation.id)]);
          return;
        }
        if (event.type === 'group.closed' || event.type === 'group.membership_ended') {
          // Both flip the entry to read-only; the server knows the rest.
          reload();
          return;
        }
        if (event.type === 'conversation.read') {
          const { conversationId, upToSequence } = event;
          const awaited = awaitedRead.current;
          if (awaited?.conversationId === conversationId && upToSequence >= awaited.sequence) {
            awaitedRead.current = undefined;
          }
          // A response in flight may predate it; one asked for now cannot.
          if (inFlight.current) reload();
          // The User read on another tab or device (or this one). The event carries a
          // position, not a count: only one that covers the entry's last Message clears it.
          const known = list?.find((c) => c.id === conversationId);
          if (!list || !known || known.unreadCount === 0) return;
          if (!known.lastMessage || upToSequence < known.lastMessage.sequence) {
            reload();
            return;
          }
          show(list.map((c) => (c === known ? { ...c, unreadCount: 0 } : c)));
          return;
        }
        if (event.type !== 'message.created') return;
        const { message } = event;
        const push = { message, reading: message.conversationId === readingId };
        inFlight.current?.push(push);
        if (list) show(applyMessage(list, push));
      },
      [readingId, applyMessage, reload, show],
    ),
  );

  if (state.status === 'loading') return <ListSkeleton />;
  if (state.status === 'error') {
    return (
      <p role="alert" className="p-3 text-sm text-destructive">
        {state.error}
      </p>
    );
  }
  if (state.list.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <MessageSquare />
          </EmptyMedia>
          <EmptyTitle>No conversations yet</EmptyTitle>
          <EmptyDescription>Messages you send and receive will show up here.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  return (
    <SidebarMenu>
      {state.list.map((conversation) => (
        <SidebarMenuItem key={conversation.id}>
          <SidebarMenuButton
            size="lg"
            isActive={conversation.id === selectedId}
            onClick={() => onSelect(conversation)}
          >
            <Avatar className="size-9">
              <AvatarFallback>{conversation.name.slice(0, 2).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="grid min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span
                  className={
                    conversation.unreadCount > 0 ? 'truncate font-semibold' : 'truncate font-medium'
                  }
                >
                  {conversation.name}
                </span>
                {conversation.lastMessage && (
                  <time
                    dateTime={conversation.lastMessage.createdAt}
                    className="shrink-0 text-xs text-muted-foreground"
                  >
                    {activityLabel(conversation.lastMessage.createdAt)}
                  </time>
                )}
              </div>
              <div className="flex items-center justify-between gap-2">
                <span
                  className={
                    conversation.unreadCount > 0
                      ? 'truncate text-xs font-medium text-foreground'
                      : 'truncate text-xs text-muted-foreground'
                  }
                >
                  {conversation.lastMessage?.preview ?? 'No messages yet'}
                </span>
                {conversation.unreadCount > 0 && (
                  <Badge className="h-4 min-w-4 px-1 tabular-nums">
                    <span aria-hidden>{unreadLabel(conversation.unreadCount)}</span>
                    <span className="sr-only">{` ${unreadLabel(conversation.unreadCount)} unread`}</span>
                  </Badge>
                )}
              </div>
            </div>
          </SidebarMenuButton>
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  );
}
