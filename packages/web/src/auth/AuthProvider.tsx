import type {
  CreateGroupRequest,
  SendDirectMessageRequest,
  SendMessageRequest,
  TypingState,
  UpdateProfileRequest,
} from '@chat/contracts';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { fetchCurrentUser, login, logout, msUntilExpiry, refreshAccessToken } from '@/api/auth';
import {
  getConversation,
  getDirectConversation,
  listConversations,
  markRead,
  messagesPage,
  readReceipt,
  signalTyping,
  type MessagesCursor,
} from '@/api/conversations';
import { addGroupMember, createGroup, getGroup, leaveGroup, removeGroupMember } from '@/api/groups';
import { sendDirectMessage, sendMessage } from '@/api/messages';
import { updateProfile as patchProfile } from '@/api/profile';
import { searchUsers } from '@/api/users';
import { AuthContext, type AuthState } from './auth-context';

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
