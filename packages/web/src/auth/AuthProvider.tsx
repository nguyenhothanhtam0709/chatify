import type {
  CreateGroupRequest,
  SendDirectMessageRequest,
  SendMessageRequest,
  TypingState,
  UpdateProfileRequest,
  User,
} from '@chat/contracts';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  fetchCurrentUser,
  login,
  logout,
  msUntilExpiry,
  refreshAccessToken,
  type LoginResult,
} from '@/api/auth';
import {
  getConversation,
  getDirectConversation,
  listConversations,
  markRead,
  messagesPage,
  readReceipt,
  signalTyping,
  type TypingResult,
  type MarkReadResult,
  type ReadReceiptResult,
  type ConversationResult,
  type DirectConversationResult,
  type MessagesCursor,
  type MessagesPageResult,
  type ListConversationsResult,
} from '@/api/conversations';
import {
  addGroupMember,
  createGroup,
  getGroup,
  leaveGroup,
  removeGroupMember,
  type CreateGroupResult,
  type GroupDetail,
  type GroupResult,
} from '@/api/groups';
import { sendDirectMessage, sendMessage, type SendResult } from '@/api/messages';
import { updateProfile as patchProfile, type UpdateProfileResult } from '@/api/profile';
import { searchUsers, type SearchUsersResult } from '@/api/users';

export type AuthState =
  { status: 'loading' } | { status: 'signedOut' } | { status: 'signedIn'; user: User };

interface AuthContextValue {
  state: AuthState;
  signIn(identifier: string, password: string): Promise<LoginResult>;
  /** Changes the Nickname (`null` clears it) and/or sharing read receipts; updates the User. */
  updateProfile(changes: UpdateProfileRequest): Promise<UpdateProfileResult>;
  /** Server-side Username-prefix search with the current access token. */
  searchUsers(q: string, signal?: AbortSignal): Promise<SearchUsersResult>;
  /** Sends to a User, creating the Direct Conversation if it does not exist yet. */
  sendDirectMessage(request: SendDirectMessageRequest): Promise<SendResult>;
  /** Sends to an existing Conversation. */
  sendMessage(conversationId: string, request: SendMessageRequest): Promise<SendResult>;
  /** Creates a Group owned by the User. */
  createGroup(request: CreateGroupRequest): Promise<CreateGroupResult>;
  /** A Group with its Members and Owner. */
  getGroup(groupId: string, signal?: AbortSignal): Promise<GroupResult<GroupDetail>>;
  /** Owner only: adds a User to the Group. */
  addGroupMember(groupId: string, userId: string): Promise<GroupResult>;
  /** Owner only: removes a Member from the Group. */
  removeGroupMember(groupId: string, userId: string): Promise<GroupResult>;
  /** Any Member leaves the Group; resolves with the Group as it is afterwards. */
  leaveGroup(groupId: string): Promise<GroupResult>;
  /** The User's Conversations, most recently active first. */
  listConversations(signal?: AbortSignal): Promise<ListConversationsResult>;
  /**
   * A page of a Conversation's Messages, oldest first: the newest page, or with a cursor the
   * page just older than `before` or just newer than `after` (sequence numbers).
   */
  messagesPage(
    conversationId: string,
    cursor?: MessagesCursor,
    signal?: AbortSignal,
  ): Promise<MessagesPageResult>;
  /** One Conversation by id, as the User may see it. */
  getConversation(conversationId: string, signal?: AbortSignal): Promise<ConversationResult>;
  /** The other User, and the Direct Conversation with them if there is one. Creates nothing. */
  getDirectConversation(userId: string, signal?: AbortSignal): Promise<DirectConversationResult>;
  /** The other User's Read Marker in a Direct Conversation, when both share read receipts. */
  readReceipt(conversationId: string, signal?: AbortSignal): Promise<ReadReceiptResult>;
  /** Marks the Conversation read up to `upToSequence` (forward only). */
  markRead(conversationId: string, upToSequence: number): Promise<MarkReadResult>;
  /** Tells the other Members the User started or stopped typing. Best-effort: never fails. */
  signalTyping(conversationId: string, state: TypingState): Promise<TypingResult>;
  /** The current access token (renewed in the background), if signed in. */
  getAccessToken(): string | undefined;
  /** Signs out here only, because the server already ended the session. */
  endSession(): void;
  /** Ends the session on the server and signs out here. */
  logOut(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/** Refresh a minute before expiry; for very short-lived tokens, halfway through. */
function refreshDelay(accessToken: string): number {
  const remaining = msUntilExpiry(accessToken);
  return remaining > 120_000 ? remaining - 60_000 : Math.max(remaining / 2, 0);
}

/**
 * Owns the session. The access token lives only in this component's memory (a ref), is
 * obtained from the refresh cookie on load, and is renewed before it expires. Anything the
 * server refuses signs the User out.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const accessTokenRef = useRef<string | undefined>(undefined);

  const signOut = useCallback(() => {
    clearTimeout(timer.current);
    accessTokenRef.current = undefined;
    setState({ status: 'signedOut' });
  }, []);

  const scheduleRefresh = useCallback(
    (accessToken: string) => {
      accessTokenRef.current = accessToken;
      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        void (async () => {
          const next = await refreshAccessToken();
          if (next === undefined) signOut();
          else scheduleRefresh(next);
        })();
      }, refreshDelay(accessToken));
    },
    [signOut],
  );

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      const accessToken = await refreshAccessToken(controller.signal);
      const user = accessToken && (await fetchCurrentUser(accessToken, controller.signal));
      if (controller.signal.aborted) return;
      if (accessToken && user) {
        setState({ status: 'signedIn', user });
        scheduleRefresh(accessToken);
      } else {
        setState({ status: 'signedOut' });
      }
    })();
    return () => {
      controller.abort();
      clearTimeout(timer.current);
    };
  }, [scheduleRefresh]);

  const signIn = useCallback(
    async (identifier: string, password: string) => {
      const result = await login({ identifier, password });
      if (result.ok) {
        setState({ status: 'signedIn', user: result.user });
        scheduleRefresh(result.accessToken);
      }
      return result;
    },
    [scheduleRefresh],
  );

  const updateProfile = useCallback(async (changes: UpdateProfileRequest) => {
    const accessToken = accessTokenRef.current;
    if (!accessToken) return { ok: false, error: 'You are signed out. Log in again.' } as const;
    const result = await patchProfile(accessToken, changes);
    if (result.ok) setState({ status: 'signedIn', user: result.user });
    return result;
  }, []);

  const searchUsersByPrefix = useCallback(async (q: string, signal?: AbortSignal) => {
    const accessToken = accessTokenRef.current;
    if (!accessToken) return { ok: false, error: 'You are signed out. Log in again.' } as const;
    return searchUsers(accessToken, q, signal);
  }, []);

  const sendDirect = useCallback(async (request: SendDirectMessageRequest) => {
    const accessToken = accessTokenRef.current;
    if (!accessToken) return { ok: false, error: 'You are signed out. Log in again.' } as const;
    return sendDirectMessage(accessToken, request);
  }, []);

  const sendToConversation = useCallback(
    async (conversationId: string, request: SendMessageRequest) => {
      const accessToken = accessTokenRef.current;
      if (!accessToken) return { ok: false, error: 'You are signed out. Log in again.' } as const;
      return sendMessage(accessToken, conversationId, request);
    },
    [],
  );

  const makeGroup = useCallback(async (request: CreateGroupRequest) => {
    const accessToken = accessTokenRef.current;
    if (!accessToken) return { ok: false, error: 'You are signed out. Log in again.' } as const;
    return createGroup(accessToken, request);
  }, []);

  const group = useCallback(async (groupId: string, signal?: AbortSignal) => {
    const accessToken = accessTokenRef.current;
    if (!accessToken) return { ok: false, error: 'You are signed out. Log in again.' } as const;
    return getGroup(accessToken, groupId, signal);
  }, []);

  const addMember = useCallback(async (groupId: string, userId: string) => {
    const accessToken = accessTokenRef.current;
    if (!accessToken) return { ok: false, error: 'You are signed out. Log in again.' } as const;
    return addGroupMember(accessToken, groupId, userId);
  }, []);

  const removeMember = useCallback(async (groupId: string, userId: string) => {
    const accessToken = accessTokenRef.current;
    if (!accessToken) return { ok: false, error: 'You are signed out. Log in again.' } as const;
    return removeGroupMember(accessToken, groupId, userId);
  }, []);

  const leave = useCallback(async (groupId: string) => {
    const accessToken = accessTokenRef.current;
    if (!accessToken) return { ok: false, error: 'You are signed out. Log in again.' } as const;
    return leaveGroup(accessToken, groupId);
  }, []);

  const conversationList = useCallback(async (signal?: AbortSignal) => {
    const accessToken = accessTokenRef.current;
    if (!accessToken) return { ok: false, error: 'You are signed out. Log in again.' } as const;
    return listConversations(accessToken, signal);
  }, []);

  const page = useCallback(
    async (conversationId: string, cursor?: MessagesCursor, signal?: AbortSignal) => {
      const accessToken = accessTokenRef.current;
      if (!accessToken) return { ok: false, error: 'You are signed out. Log in again.' } as const;
      return messagesPage(accessToken, conversationId, cursor, signal);
    },
    [],
  );

  const receipt = useCallback(async (conversationId: string, signal?: AbortSignal) => {
    const accessToken = accessTokenRef.current;
    if (!accessToken) return { ok: false, error: 'You are signed out. Log in again.' } as const;
    return readReceipt(accessToken, conversationId, signal);
  }, []);

  const conversation = useCallback(async (conversationId: string, signal?: AbortSignal) => {
    const accessToken = accessTokenRef.current;
    if (!accessToken) return { ok: false, error: 'You are signed out. Log in again.' } as const;
    return getConversation(accessToken, conversationId, signal);
  }, []);

  const directConversation = useCallback(async (userId: string, signal?: AbortSignal) => {
    const accessToken = accessTokenRef.current;
    if (!accessToken) return { ok: false, error: 'You are signed out. Log in again.' } as const;
    return getDirectConversation(accessToken, userId, signal);
  }, []);

  const read = useCallback(async (conversationId: string, upToSequence: number) => {
    const accessToken = accessTokenRef.current;
    if (!accessToken) return { ok: false, error: 'You are signed out. Log in again.' } as const;
    return markRead(accessToken, conversationId, upToSequence);
  }, []);

  const typing = useCallback(async (conversationId: string, state: TypingState) => {
    const accessToken = accessTokenRef.current;
    if (!accessToken) return { ok: false } as const;
    return signalTyping(accessToken, conversationId, state);
  }, []);

  const getAccessToken = useCallback(() => accessTokenRef.current, []);

  const logOut = useCallback(async () => {
    const accessToken = accessTokenRef.current;
    signOut();
    if (accessToken) await logout(accessToken);
  }, [signOut]);

  const value = useMemo(
    () => ({
      state,
      signIn,
      updateProfile,
      searchUsers: searchUsersByPrefix,
      sendDirectMessage: sendDirect,
      sendMessage: sendToConversation,
      createGroup: makeGroup,
      getGroup: group,
      addGroupMember: addMember,
      removeGroupMember: removeMember,
      leaveGroup: leave,
      listConversations: conversationList,
      messagesPage: page,
      readReceipt: receipt,
      getConversation: conversation,
      getDirectConversation: directConversation,
      markRead: read,
      signalTyping: typing,
      getAccessToken,
      endSession: signOut,
      logOut,
    }),
    [
      state,
      signIn,
      updateProfile,
      searchUsersByPrefix,
      sendDirect,
      sendToConversation,
      makeGroup,
      group,
      addMember,
      removeMember,
      leave,
      conversationList,
      page,
      receipt,
      conversation,
      directConversation,
      read,
      typing,
      getAccessToken,
      signOut,
      logOut,
    ],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
