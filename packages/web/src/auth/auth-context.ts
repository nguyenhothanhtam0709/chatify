import type {
  CreateGroupRequest,
  SendDirectMessageRequest,
  SendMessageRequest,
  TypingState,
  UpdateProfileRequest,
  User,
} from '@chat/contracts';
import { createContext, useContext } from 'react';
import type { LoginResult } from '@/api/auth';
import type {
  TypingResult,
  MarkReadResult,
  ReadReceiptResult,
  ConversationResult,
  DirectConversationResult,
  MessagesCursor,
  MessagesPageResult,
  ListConversationsResult,
} from '@/api/conversations';
import type { CreateGroupResult, GroupDetail, GroupResult } from '@/api/groups';
import type { SendResult } from '@/api/messages';
import type { UpdateProfileResult } from '@/api/profile';
import type { SearchUsersResult } from '@/api/users';

export type AuthState =
  { status: 'loading' } | { status: 'signedOut' } | { status: 'signedIn'; user: User };

export interface AuthContextValue {
  state: AuthState;
  signIn: (identifier: string, password: string) => Promise<LoginResult>;
  /** Changes the Nickname (`null` clears it) and/or sharing read receipts; updates the User. */
  updateProfile: (changes: UpdateProfileRequest) => Promise<UpdateProfileResult>;
  /** Server-side Username-prefix search with the current access token. */
  searchUsers: (q: string, signal?: AbortSignal) => Promise<SearchUsersResult>;
  /** Sends to a User, creating the Direct Conversation if it does not exist yet. */
  sendDirectMessage: (request: SendDirectMessageRequest) => Promise<SendResult>;
  /** Sends to an existing Conversation. */
  sendMessage: (conversationId: string, request: SendMessageRequest) => Promise<SendResult>;
  /** Creates a Group owned by the User. */
  createGroup: (request: CreateGroupRequest) => Promise<CreateGroupResult>;
  /** A Group with its Members and Owner. */
  getGroup: (groupId: string, signal?: AbortSignal) => Promise<GroupResult<GroupDetail>>;
  /** Owner only: adds a User to the Group. */
  addGroupMember: (groupId: string, userId: string) => Promise<GroupResult>;
  /** Owner only: removes a Member from the Group. */
  removeGroupMember: (groupId: string, userId: string) => Promise<GroupResult>;
  /** Any Member leaves the Group; resolves with the Group as it is afterwards. */
  leaveGroup: (groupId: string) => Promise<GroupResult>;
  /** The User's Conversations, most recently active first. */
  listConversations: (signal?: AbortSignal) => Promise<ListConversationsResult>;
  /**
   * A page of a Conversation's Messages, oldest first: the newest page, or with a cursor the
   * page just older than `before` or just newer than `after` (sequence numbers).
   */
  messagesPage: (
    conversationId: string,
    cursor?: MessagesCursor,
    signal?: AbortSignal,
  ) => Promise<MessagesPageResult>;
  /** One Conversation by id, as the User may see it. */
  getConversation: (conversationId: string, signal?: AbortSignal) => Promise<ConversationResult>;
  /** The other User, and the Direct Conversation with them if there is one. Creates nothing. */
  getDirectConversation: (
    userId: string,
    signal?: AbortSignal,
  ) => Promise<DirectConversationResult>;
  /** The other User's Read Marker in a Direct Conversation, when both share read receipts. */
  readReceipt: (conversationId: string, signal?: AbortSignal) => Promise<ReadReceiptResult>;
  /** Marks the Conversation read up to `upToSequence` (forward only). */
  markRead: (conversationId: string, upToSequence: number) => Promise<MarkReadResult>;
  /** Tells the other Members the User started or stopped typing. Best-effort: never fails. */
  signalTyping: (conversationId: string, state: TypingState) => Promise<TypingResult>;
  /** The current access token (renewed in the background), if signed in. */
  getAccessToken: () => string | undefined;
  /** Signs out here only, because the server already ended the session. */
  endSession: () => void;
  /** Ends the session on the server and signs out here. */
  logOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
