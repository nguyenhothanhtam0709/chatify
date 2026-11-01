import type {
  ConversationCreatedEvent,
  ConversationReadEvent,
  ConversationReceiptEvent,
  GroupMemberAddedEvent,
  GroupMemberRemovedEvent,
  GroupMemberLeftEvent,
  GroupOwnerChangedEvent,
  GroupClosedEvent,
  GroupMembershipEndedEvent,
  MessageCreatedEvent,
  TypingUpdatedEvent,
} from '@chat/contracts';

/** An already-decoded, contracts-validated server push. */
export type RealtimeEvent =
  | ({ type: 'message.created' } & MessageCreatedEvent)
  | ({ type: 'conversation.created' } & ConversationCreatedEvent)
  | ({ type: 'conversation.read' } & ConversationReadEvent)
  | ({ type: 'conversation.receipt' } & ConversationReceiptEvent)
  | ({ type: 'group.member_added' } & GroupMemberAddedEvent)
  | ({ type: 'group.member_removed' } & GroupMemberRemovedEvent)
  | ({ type: 'group.member_left' } & GroupMemberLeftEvent)
  | ({ type: 'group.owner_changed' } & GroupOwnerChangedEvent)
  | ({ type: 'group.closed' } & GroupClosedEvent)
  | ({ type: 'group.membership_ended' } & GroupMembershipEndedEvent)
  | ({ type: 'typing.updated' } & TypingUpdatedEvent)
  | { type: 'session.revoked' };

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

/**
 * Server-push events. The socket is receive-only (ADR-0001): everything the User does goes
 * over HTTP.
 */
export interface RealtimeEvents {
  /**
   * Reports the connection: the current status at once, then every change. Only a connection
   * that is up or lost is reported; a first attempt in progress is `connecting`.
   */
  subscribeStatus(listener: (status: ConnectionStatus) => void): () => void;
  /** Starts delivering events to `listener`; the returned function stops it. */
  subscribe(listener: (event: RealtimeEvent) => void): () => void;
}

/** Delivers nothing; used where no connection is wanted (e.g. tests that do not need one). */
export const noRealtime: RealtimeEvents = {
  subscribe: () => () => {},
  subscribeStatus: (listener) => {
    listener('connected');
    return () => {};
  },
};
