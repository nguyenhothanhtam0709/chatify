import {
  MESSAGE_BODY_MAX,
  MessageBodySchema,
  type Message as ChatMessage,
  type SystemMessageKind,
  type TypingState,
  type User,
} from '@chat/contracts';
import { ArrowDown, ArrowUp, Info } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type UIEvent,
} from 'react';
import { useAuth } from '@/auth/AuthProvider';
import {
  useConnectionStatus,
  useReconnected,
  useRealtimeEvents,
} from '@/realtime/RealtimeProvider';
import { Bubble, BubbleContent } from '@/components/ui/bubble';
import { Button } from '@/components/ui/button';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupText,
  InputGroupTextarea,
} from '@/components/ui/input-group';
import { GroupDetailsSheet } from './GroupDetailsSheet';
import { displayName, type ConversationTarget } from './conversation-target';
import { Marker, MarkerContent } from '@/components/ui/marker';
import { Message, MessageContent, MessageFooter } from '@/components/ui/message';
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
  useMessageScrollerScrollable,
} from '@/components/ui/message-scroller';

/** Show the counter once the text is within this many characters of the limit. */
const COUNTER_THRESHOLD = MESSAGE_BODY_MAX - 500;

const dayKey = (iso: string): string => new Date(iso).toDateString();
const dayLabel = (iso: string): string =>
  new Date(iso).toLocaleDateString(undefined, { dateStyle: 'full' });
const timeLabel = (iso: string): string =>
  new Date(iso).toLocaleTimeString(undefined, { timeStyle: 'short' });

/** A Message the User composed that the server has not confirmed yet. */
interface Outgoing {
  clientMessageId: string;
  body: string;
  /** When it was composed; only used to place it in the day grouping. */
  createdAt: string;
  status: 'pending' | 'failed';
  error?: string;
}

interface Row {
  key: string;
  senderId: string;
  createdAt: string;
  body: string;
  outgoing?: Outgoing;
  /** Set for a stored membership systemMessage ("Bob was added"): rendered as a `Marker`, not a bubble. */
  systemMessage?: string;
  /** The Read Receipt sits under this Message: "Seen". */
  seen?: true;
  /** The User's own Message: it always scrolls into view, even from older history. */
  own?: true;
}

const SYSTEM_MESSAGE_VERBS: Record<SystemMessageKind, string> = {
  member_added: 'was added',
  member_removed: 'was removed',
  member_left: 'left',
  owner_changed: 'is now the Owner',
};

/** The systemMessage's text, or undefined for a Message a Member wrote. */
const systemMessageText = (m: ChatMessage): string | undefined =>
  m.kind === 'text' || !m.subject
    ? undefined
    : `${displayName(m.subject)} ${SYSTEM_MESSAGE_VERBS[m.kind]}`;

/** Mark-read waits this long for the view to settle, so a burst of changes sends one call. */
const MARK_READ_DEBOUNCE_MS = 300;

/** A failed mark-read is tried again after these waits, then given up on until the next change. */
const MARK_READ_RETRY_MS = [1000, 3000, 9000];

/** An indicator shows for this long after the last signal from that Member. */
const TYPING_EXPIRY_MS = 6000;

/** While input continues, the composer repeats `typing` at most this often. */
const TYPING_REPEAT_MS = 3000;

/** The text of the Typing Indicator for the Members typing now, or undefined for none. */
function typingText(names: string[]): string | undefined {
  if (names.length === 0) return undefined;
  if (names.length === 1) return `${names[0]} is typing…`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing…`;
  return 'Several people are typing…';
}

/** Reaching within this many pixels of the top counts as the top. */
const TOP_THRESHOLD = 48;

interface Entry {
  row: Row;
  /** Set on the first Message of a day: the divider rendered inside its item, above it. */
  day?: string;
  /** Continues the previous Message's run: same sender, same day. */
  continuesRun: boolean;
}

/**
 * One entry per Message, so that prepending older Messages never changes an existing item
 * (the scroller keeps the reader's place by tracking items). Runs are only styling.
 */
function toEntries(rows: Row[]): Entry[] {
  return rows.map((row, i) => {
    const prev = rows[i - 1];
    const newDay = !prev || dayKey(prev.createdAt) !== dayKey(row.createdAt);
    return {
      row,
      ...(newDay ? { day: row.createdAt } : {}),
      continuesRun:
        !newDay && !row.systemMessage && !prev.systemMessage && prev.senderId === row.senderId,
    };
  });
}

const bySequence = (a: ChatMessage, b: ChatMessage) => a.sequence - b.sequence;

/** Adds Messages to a list, replacing any already there, oldest first. */
const mergeMessages = (current: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] => {
  const ids = new Set(incoming.map((m) => m.id));
  return [...incoming, ...current.filter((m) => !ids.has(m.id))].sort(bySequence);
};

function Composer({
  onSend,
  onTyping,
}: {
  onSend: (body: string) => void;
  /** Reports a Typing Indicator signal to send; the caller ignores any failure. */
  onTyping: (state: TypingState) => void;
}) {
  const [text, setText] = useState('');
  // Whether the other side may be showing us as typing, and when `typing` was last sent.
  const signalled = useRef(false);
  const lastSignal = useRef(0);
  const sendButton = useRef<HTMLButtonElement>(null);

  function signal(state: TypingState) {
    if (state === 'stopped') {
      if (!signalled.current) return;
      signalled.current = false;
    } else {
      const now = Date.now();
      if (signalled.current && now - lastSignal.current < TYPING_REPEAT_MS) return;
      signalled.current = true;
      lastSignal.current = now;
    }
    onTyping(state);
  }

  function onChange(value: string) {
    setText(value);
    signal(value === '' ? 'stopped' : 'typing');
  }

  const length = [...text].length;
  const sendable = MessageBodySchema.safeParse(text).success;

  function submit() {
    if (!sendable) return;
    onSend(text);
    setText('');
    // The Message itself clears the indicator on the other side: no `stopped` is needed.
    signalled.current = false;
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    submit();
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-2 border-t p-3">
      <InputGroup>
        <InputGroupTextarea
          aria-label="Message"
          placeholder="Write a message"
          rows={1}
          className="max-h-40 min-h-10"
          value={text}
          onChange={(e) => onChange(e.target.value)}
          onBlur={(e) => {
            // Going to the Send button is a send, whose Message clears the indicator itself.
            if (e.relatedTarget === sendButton.current) return;
            signal('stopped');
          }}
          onKeyDown={onKeyDown}
        />
        <InputGroupAddon align="block-end" className="p-2">
          {length >= COUNTER_THRESHOLD && (
            <InputGroupText className={length > MESSAGE_BODY_MAX ? 'text-destructive' : undefined}>
              {length} / {MESSAGE_BODY_MAX}
            </InputGroupText>
          )}
          <InputGroupButton
            type="submit"
            variant="default"
            size="icon-sm"
            aria-label="Send"
            ref={sendButton}
            // Keeps focus in the textarea, so a click or tap does not blur it before the send.
            onMouseDown={(e) => e.preventDefault()}
            disabled={!sendable}
            className="ml-auto"
          >
            <ArrowUp />
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    </form>
  );
}

/**
 * Reports whether the view is at its live edge: the latest Message is in view, so nothing is
 * left to scroll towards the end (also true while there is nothing to scroll at all).
 */
function LiveEdge({ onChange }: { onChange: ((atLatest: boolean) => void) | undefined }) {
  const { end } = useMessageScrollerScrollable();
  useEffect(() => onChange?.(!end), [end, onChange]);
  return null;
}

/** What the server last told us about the Group; events and refetches keep it current. */
interface GroupInfo {
  memberCount: number;
  closed: boolean;
  isMember: boolean;
}

/**
 * A Direct Conversation with a peer, or a Group. A Direct Conversation starts without a
 * Conversation ID: the first Message is sent to the User and creates the Conversation, later
 * ones go to it. Messages are shown as text only (ADR-0002).
 */
export function ConversationView({
  user,
  target,
  conversationId: initialConversationId,
  onSent,
  onLeft,
  onAtLatestChange,
  reading = false,
}: {
  user: User;
  target: ConversationTarget;
  /** Set when opening an existing Conversation: its newest Messages are loaded. */
  conversationId?: string | undefined;
  /** Called after each send with the Conversation's ID. */
  onSent?: (conversationId: string) => void;
  /** Called after the User left the Group, so the Conversation list can follow. */
  onLeft?: () => void;
  /** Called whenever the view reaches or leaves the latest Message. */
  onAtLatestChange?: (atLatest: boolean) => void;
  /**
   * The User is reading this view right now: the tab is visible and the view is at its latest
   * Message. Then everything on screen is marked read.
   */
  reading?: boolean;
}) {
  const {
    sendDirectMessage,
    sendMessage,
    messagesPage,
    getGroup,
    markRead,
    readReceipt,
    signalTyping,
  } = useAuth();
  // Only the Conversation this view was opened with is loaded; a later change of the prop is
  // just the first send reporting the Conversation it created.
  const [openedWith] = useState(initialConversationId);
  const [conversationId, setConversationId] = useState(openedWith);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [firstPageAnswered, setFirstPageAnswered] = useState(false);
  const loadingOlder = useRef(false);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const viewportRef = useRef<HTMLDivElement>(null);
  // Only a Message the User sent, or one arriving while they are at the latest Message, scrolls
  // into view. One arriving while they read older history waits (the scroller scrolls every
  // new anchor into view, so the others are not anchors).
  const [atLatest, setAtLatest] = useState(true);
  const onLiveEdge = useCallback(
    (latest: boolean) => {
      setAtLatest(latest);
      onAtLatestChange?.(latest);
    },
    [onAtLatestChange],
  );

  useEffect(() => {
    if (!openedWith) return;
    const controller = new AbortController();
    void (async () => {
      const result = await messagesPage(openedWith, {}, controller.signal);
      if (controller.signal.aborted) return;
      setFirstPageAnswered(true);
      if (!result.ok) return;
      setHasMore(result.hasMore);
      setMessages((current) => mergeMessages(current, result.messages));
    })();
    return () => controller.abort();
  }, [openedWith, messagesPage]);

  const loadOlder = useCallback(async () => {
    const oldest = messagesRef.current[0];
    if (!openedWith || !hasMore || !oldest || loadingOlder.current) return;
    loadingOlder.current = true;
    try {
      const result = await messagesPage(openedWith, { before: oldest.sequence });
      if (!result.ok) return;
      setHasMore(result.hasMore);
      setMessages((current) => mergeMessages(current, result.messages));
    } finally {
      loadingOlder.current = false;
    }
  }, [openedWith, hasMore, messagesPage]);

  function onScroll(e: UIEvent<HTMLDivElement>) {
    if (e.currentTarget.scrollTop <= TOP_THRESHOLD) void loadOlder();
  }

  // A page that does not fill the viewport can never be scrolled to its top: keep loading.
  useEffect(() => {
    const viewport = viewportRef.current;
    if (viewport && viewport.clientHeight > 0 && viewport.scrollHeight <= viewport.clientHeight) {
      void loadOlder();
    }
  }, [messages, loadOlder]);

  const [info, setInfo] = useState<GroupInfo | undefined>(
    target.kind === 'group'
      ? { memberCount: target.memberCount, closed: target.closed, isMember: target.isMember }
      : undefined,
  );
  const isGroup = target.kind === 'group';
  const listedCount = target.kind === 'group' ? target.memberCount : 0;
  const listedClosed = target.kind === 'group' ? target.closed : false;
  const listedIsMember = target.kind === 'group' ? target.isMember : false;
  // Set once the Group's own endpoint has answered: its answers are fresher than any list
  // snapshot, whose request may have been made before a Member change and answered after it.
  const answered = useRef(false);
  // A reload of the Conversation list hands down a fresh snapshot: it replaces ours, until the
  // server has answered about this Group itself.
  useEffect(() => {
    if (!isGroup || answered.current) return;
    setInfo({ memberCount: listedCount, closed: listedClosed, isMember: listedIsMember });
  }, [isGroup, listedCount, listedClosed, listedIsMember]);

  // The server is the source of truth for the count and the closed flag. Only the newest
  // request counts, so a slow answer never overwrites a newer one.
  const refreshes = useRef(0);
  const refreshGroup = useCallback(() => {
    if (!conversationId || !isGroup) return;
    const mine = ++refreshes.current;
    void (async () => {
      const result = await getGroup(conversationId);
      if (!result.ok || mine !== refreshes.current) return;
      const { group } = result;
      answered.current = true;
      setInfo({
        memberCount: group.members.length,
        closed: group.closed,
        isMember: group.isMember,
      });
    })();
  }, [conversationId, isGroup, getGroup]);

  // The list's snapshot can predate Member changes pushed while this Group was not open (the
  // list is not told of them), so opening the Group asks the server for the current count.
  useEffect(() => {
    refreshGroup();
  }, [refreshGroup]);

  // The other User's Read Marker in a Direct Conversation, known only while both share read
  // receipts: from the Conversation on open (and on reconnect, for a missed push), then from
  // `conversation.receipt`. It only moves forward. Only the newest request counts.
  const isDirect = target.kind === 'direct';
  const [otherMarker, setOtherMarker] = useState<number | undefined>(undefined);
  const receiptRequests = useRef(0);
  const sharing = user.shareReadReceipts;
  const refreshReceipt = useCallback(() => {
    if (!conversationId || !isDirect) return;
    const mine = ++receiptRequests.current;
    // Not sharing: the other User's marker is not ours to see. Clear it, and drop any answer on its way.
    if (!sharing) {
      setOtherMarker(undefined);
      return;
    }
    void (async () => {
      const result = await readReceipt(conversationId);
      if (!result.ok || mine !== receiptRequests.current) return;
      const fetched = result.readUpToSequence;
      setOtherMarker((current) =>
        fetched === undefined ? undefined : Math.max(current ?? 0, fetched),
      );
    })();
  }, [conversationId, isDirect, sharing, readReceipt]);

  useEffect(() => {
    refreshReceipt();
  }, [refreshReceipt]);

  useRealtimeEvents(
    useCallback(
      (event) => {
        if (
          event.type !== 'conversation.receipt' ||
          event.conversationId !== conversationId ||
          !sharing
        ) {
          return;
        }
        setOtherMarker((current) => Math.max(current ?? 0, event.upToSequence));
      },
      [conversationId, sharing],
    ),
  );

  // Messages pushed while the connection was down are gone for good: fetch what came after the
  // last one seen, page by page. Duplicates with pushes are merged by ID.
  useReconnected(() => {
    const id = conversationId;
    if (!id) return;
    refreshGroup();
    refreshReceipt();
    markFailures.current = 0;
    setMarkAttempt((n) => n + 1);
    void (async () => {
      // Resume from the page's own newest Message, not the newest seen: a push that lands
      // meanwhile must not make the fetch skip the Messages before it.
      let after = messagesRef.current.at(-1)?.sequence;
      for (;;) {
        const result = await messagesPage(id, after === undefined ? {} : { after });
        if (!result.ok) return;
        setMessages((current) => mergeMessages(current, result.messages));
        const newest = result.messages.at(-1);
        if (after === undefined || !result.hasMore || !newest) return;
        after = newest.sequence;
      }
    })();
  });

  // While the User is reading, the newest Message on screen is read: tell the server (debounced,
  // and only past what it already acknowledged; sending moved the marker by itself). A Former
  // Member or a closed Group has no marker to move: the server would refuse. A failure that may
  // pass is tried again a few times, and again on reconnect.
  const newestSequence = messages.at(-1)?.sequence;
  const acknowledged = useRef(0);
  const markFailures = useRef(0);
  const [markAttempt, setMarkAttempt] = useState(0);
  const mayMark = info === undefined || (info.isMember && !info.closed);
  useEffect(() => {
    if (!reading || !mayMark || !conversationId || newestSequence === undefined) return;
    if (newestSequence <= acknowledged.current) return;
    let cancelled = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const timer = setTimeout(() => {
      void (async () => {
        const result = await markRead(conversationId, newestSequence);
        if (result.ok) {
          markFailures.current = 0;
          acknowledged.current = Math.max(acknowledged.current, result.upToSequence);
          return;
        }
        const wait = MARK_READ_RETRY_MS[markFailures.current];
        if (cancelled || !result.retryable || wait === undefined) return;
        markFailures.current += 1;
        retry = setTimeout(() => setMarkAttempt((n) => n + 1), wait);
      })();
    }, MARK_READ_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      clearTimeout(retry);
    };
  }, [reading, mayMark, conversationId, newestSequence, markRead, markAttempt]);

  // Who is typing here now, by User ID, each with a timer that drops them 6 s after their last
  // signal. This side owns the expiry: the server relays and forgets (ADR 0009).
  const [typists, setTypists] = useState<Record<string, string>>({});
  const typistTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const dropTypist = useCallback((userId: string) => {
    clearTimeout(typistTimers.current.get(userId));
    typistTimers.current.delete(userId);
    setTypists((current) => {
      if (!(userId in current)) return current;
      return Object.fromEntries(Object.entries(current).filter(([id]) => id !== userId));
    });
  }, []);
  const clearTypists = useCallback(() => {
    typistTimers.current.forEach((timer) => clearTimeout(timer));
    typistTimers.current.clear();
    setTypists({});
  }, []);
  useEffect(() => clearTypists, [clearTypists]);
  const connection = useConnectionStatus();
  useEffect(() => {
    if (connection === 'disconnected') clearTypists();
  }, [connection, clearTypists]);

  const [outgoing, setOutgoing] = useState<Outgoing[]>([]);
  const [detailsOpen, setDetailsOpen] = useState(false);

  useRealtimeEvents(
    useCallback(
      (event) => {
        if (event.type === 'group.closed') {
          if (event.conversationId !== conversationId) return;
          setInfo((current) => current && { ...current, closed: true, isMember: false });
          refreshGroup();
          return;
        }
        if (event.type === 'group.membership_ended') {
          // This User's membership ended elsewhere (removed, or left on another tab).
          if (event.conversationId !== conversationId) return;
          setInfo((current) => current && { ...current, isMember: false });
          refreshGroup();
          return;
        }
        if (
          event.type !== 'group.member_added' &&
          event.type !== 'group.member_removed' &&
          event.type !== 'group.member_left'
        ) {
          return;
        }
        if (event.conversationId !== conversationId) return;
        // Being added (again) makes this User a Member. The count is not adjusted here: the
        // server's answer already includes everyone, so adding one would count them twice.
        if (event.type === 'group.member_added' && event.member.id === user.id) {
          setInfo((current) => current && { ...current, isMember: true });
        }
        refreshGroup();
      },
      [conversationId, user.id, refreshGroup],
    ),
  );

  useRealtimeEvents(
    useCallback(
      (event) => {
        if (event.type !== 'typing.updated') return;
        const ours = conversationId
          ? event.conversationId === conversationId
          : target.kind === 'direct' && event.user.id === target.peer.id;
        if (!ours || event.user.id === user.id) return;
        if (event.state === 'stopped') {
          dropTypist(event.user.id);
          return;
        }
        clearTimeout(typistTimers.current.get(event.user.id));
        typistTimers.current.set(
          event.user.id,
          setTimeout(() => dropTypist(event.user.id), TYPING_EXPIRY_MS),
        );
        setTypists((current) => ({ ...current, [event.user.id]: displayName(event.user) }));
      },
      [conversationId, target, user.id, dropTypist],
    ),
  );

  useRealtimeEvents(
    useCallback(
      (event) => {
        if (event.type !== 'message.created') return;
        const { message } = event;
        // A Message from the peer starts the Conversation this view was opened without.
        const ours = conversationId
          ? message.conversationId === conversationId
          : target.kind === 'direct' && message.senderId === target.peer.id;
        if (!ours) return;
        if (!conversationId) setConversationId(message.conversationId);
        dropTypist(message.senderId);
        setMessages((current) => mergeMessages(current, [message]));
        setOutgoing((current) =>
          current.filter((o) => o.clientMessageId !== message.clientMessageId),
        );
      },
      [conversationId, target, dropTypist],
    ),
  );

  /** Sends (or re-sends) with the Outgoing's own client message ID, so a retry never duplicates. */
  async function transmit(item: Outgoing) {
    const { clientMessageId, body } = item;
    let result;
    if (conversationId) {
      result = await sendMessage(conversationId, { clientMessageId, body });
    } else if (target.kind === 'direct') {
      result = await sendDirectMessage({ recipientId: target.peer.id, clientMessageId, body });
    } else {
      throw new Error('A group has no Conversation ID to send to');
    }
    if (!result.ok) {
      setOutgoing((current) =>
        current.map((o) =>
          o.clientMessageId === clientMessageId
            ? { ...o, status: 'failed', error: result.error }
            : o,
        ),
      );
      return;
    }
    const id = result.conversation?.id ?? result.message.conversationId;
    acknowledged.current = Math.max(acknowledged.current, result.message.sequence);
    setConversationId(id);
    onSent?.(id);
    setOutgoing((current) => current.filter((o) => o.clientMessageId !== clientMessageId));
    setMessages((current) =>
      [
        ...current.filter(
          (m) => m.id !== result.message.id && m.clientMessageId !== clientMessageId,
        ),
        result.message,
      ].sort(bySequence),
    );
  }

  function send(body: string) {
    const item: Outgoing = {
      clientMessageId: crypto.randomUUID(),
      body,
      createdAt: new Date().toISOString(),
      status: 'pending',
    };
    setOutgoing((current) => [...current, item]);
    void transmit(item);
  }

  function retry(item: Outgoing) {
    const pending: Outgoing = {
      clientMessageId: item.clientMessageId,
      body: item.body,
      createdAt: item.createdAt,
      status: 'pending',
    };
    setOutgoing((current) =>
      current.map((o) => (o.clientMessageId === item.clientMessageId ? pending : o)),
    );
    void transmit(pending);
  }

  const closed = info?.closed ?? false;
  const memberCount = info?.memberCount ?? 0;
  const canPost = target.kind !== 'group' || (!!info?.isMember && !closed);

  // "Seen" goes under the newest of the User's own Messages the other User has read.
  const seenId =
    !sharing || otherMarker === undefined
      ? undefined
      : [...messages]
          .reverse()
          .find((m) => m.kind === 'text' && m.senderId === user.id && m.sequence <= otherMarker)
          ?.id;

  const rows: Row[] = [
    ...messages.map((m) => {
      const systemMessage = systemMessageText(m);
      return {
        key: m.clientMessageId,
        senderId: m.senderId,
        createdAt: m.createdAt,
        body: m.body,
        ...(systemMessage === undefined ? {} : { systemMessage }),
        ...(m.id === seenId ? { seen: true as const } : {}),
        ...(m.senderId === user.id && systemMessage === undefined ? { own: true as const } : {}),
      };
    }),
    ...outgoing.map((o) => ({
      key: o.clientMessageId,
      senderId: user.id,
      createdAt: o.createdAt,
      body: o.body,
      outgoing: o,
      own: true as const,
    })),
  ];
  const showEmptyState = rows.length === 0 && (openedWith === undefined || firstPageAnswered);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-12 items-center gap-2 border-b px-4">
        {target.kind === 'group' ? (
          <>
            <h1 className="truncate text-base font-semibold">{target.name}</h1>
            {/* A Former Member sees no Members, so no count of them either. */}
            {info?.isMember && !closed && (
              <span className="shrink-0 text-sm text-muted-foreground">
                {memberCount} {memberCount === 1 ? 'member' : 'members'}
              </span>
            )}
            {conversationId && (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="ml-auto"
                  aria-label="Group details"
                  onClick={() => setDetailsOpen(true)}
                >
                  <Info />
                </Button>
                <GroupDetailsSheet
                  groupId={conversationId}
                  user={user}
                  open={detailsOpen}
                  onOpenChange={setDetailsOpen}
                  onLeft={(group) => {
                    // The response is the server's word on the Group after leaving.
                    refreshes.current += 1;
                    setInfo({
                      memberCount: group.members.length,
                      closed: group.closed,
                      isMember: false,
                    });
                    onLeft?.();
                  }}
                />
              </>
            )}
          </>
        ) : (
          <>
            <h1 className="truncate text-base font-semibold">{displayName(target.peer)}</h1>
            {target.peer.nickname !== null && (
              <span className="truncate text-sm text-muted-foreground">
                @{target.peer.username}
              </span>
            )}
          </>
        )}
      </header>
      <div className="relative min-h-0 flex-1">
        <MessageScrollerProvider>
          <LiveEdge onChange={onLiveEdge} />
          {showEmptyState && (
            <p className="absolute inset-x-0 top-0 p-6 text-center text-sm text-muted-foreground">
              No messages yet.{' '}
              {target.kind === 'group'
                ? 'Say hello to the Group.'
                : `Say hello to ${displayName(target.peer)}.`}
            </p>
          )}
          {/* Mounted from the first render, so Messages arrive into a viewport that exists. */}
          <MessageScroller>
            <MessageScrollerViewport ref={viewportRef} onScroll={onScroll}>
              <MessageScrollerContent className="p-4">
                {toEntries(rows).map(({ row: m, day, continuesRun }) => {
                  const outgoing = m.outgoing;
                  return (
                    <MessageScrollerItem
                      key={m.key}
                      messageId={m.key}
                      scrollAnchor={m.own === true || atLatest}
                      className={continuesRun ? '-mt-4' : undefined}
                    >
                      {day && (
                        <Marker variant="separator" className="mb-6">
                          <MarkerContent>{dayLabel(day)}</MarkerContent>
                        </Marker>
                      )}
                      {m.systemMessage !== undefined ? (
                        <Marker>
                          <MarkerContent>{m.systemMessage}</MarkerContent>
                        </Marker>
                      ) : (
                        <Message align={m.senderId === user.id ? 'end' : 'start'}>
                          <MessageContent>
                            <Bubble
                              variant={
                                m.outgoing?.status === 'failed'
                                  ? 'destructive'
                                  : m.outgoing || m.senderId !== user.id
                                    ? 'muted'
                                    : 'default'
                              }
                            >
                              <BubbleContent
                                className="whitespace-pre-wrap"
                                title={timeLabel(m.createdAt)}
                              >
                                {m.body}
                              </BubbleContent>
                            </Bubble>
                          </MessageContent>
                          {outgoing?.status === 'failed' && (
                            <MessageFooter className="items-center gap-2">
                              <span role="alert" className="text-sm text-destructive">
                                {outgoing.error}
                              </span>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => retry(outgoing)}
                              >
                                Retry
                              </Button>
                            </MessageFooter>
                          )}
                          {m.seen && <MessageFooter>Seen</MessageFooter>}
                        </Message>
                      )}
                    </MessageScrollerItem>
                  );
                })}
              </MessageScrollerContent>
            </MessageScrollerViewport>
            <MessageScrollerButton>
              <ArrowDown />
              <span className="sr-only">Jump to latest</span>
            </MessageScrollerButton>
          </MessageScroller>
        </MessageScrollerProvider>
      </div>
      {canPost && (
        <p role="status" className="h-5 truncate px-4 text-sm text-muted-foreground">
          {typingText(Object.values(typists))}
        </p>
      )}
      {canPost ? (
        <Composer
          onSend={send}
          onTyping={(state) => {
            if (conversationId) void signalTyping(conversationId, state);
          }}
        />
      ) : (
        <p className="border-t p-4 text-center text-sm text-muted-foreground">
          {closed
            ? 'This group is closed. It has no members left and can no longer receive messages or new members. You can read the messages from when you were a member.'
            : 'You are no longer a member of this group. You can read the messages from when you were a member, but you cannot send new ones.'}
        </p>
      )}
    </div>
  );
}
