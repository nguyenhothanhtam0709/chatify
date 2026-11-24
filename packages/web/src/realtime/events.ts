import type { RealtimeEventSchemas } from '@chat/contracts';

type Schemas = typeof RealtimeEventSchemas;

/** An event with no fields (`z.object({})` infers `Record<string, never>`) adds nothing to `{ type }`. */
type Payload<Name extends keyof Schemas> =
  Schemas[Name]['_output'] extends Record<string, never> ? unknown : Schemas[Name]['_output'];

/** An already-decoded, contracts-validated server push. Derived from `RealtimeEventSchemas`. */
export type RealtimeEvent = {
  [Name in keyof Schemas]: { type: Name } & Payload<Name>;
}[keyof Schemas];

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
