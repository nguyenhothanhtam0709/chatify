import { RealtimeEventSchemas, type RealtimeEventName } from '@chat/contracts';
import { io, type Socket } from 'socket.io-client';
import parser from 'socket.io-msgpack-parser';
import type { ConnectionStatus, RealtimeEvent, RealtimeEvents } from './events';

const isRealtimeEventName = (name: string): name is RealtimeEventName =>
  Object.hasOwn(RealtimeEventSchemas, name);

export interface SocketRealtimeOptions {
  /** Where the Socket.IO server is; the page's origin in the app. */
  url: string;
  /** Read at every (re)connection, because the access token is renewed. */
  getAccessToken: () => string | undefined;
}

/**
 * Socket.IO `RealtimeEvents`: WebSocket transport, MessagePack, authenticated with the access
 * token, reconnecting by itself. Connects with the first subscriber and closes after the last.
 * Each event is validated against the contracts; unknown or invalid ones are dropped and logged.
 */
export function createSocketRealtime({
  url,
  getAccessToken,
}: SocketRealtimeOptions): RealtimeEvents {
  const listeners = new Set<(event: RealtimeEvent) => void>();
  const statusListeners = new Set<(status: ConnectionStatus) => void>();
  let status: ConnectionStatus = 'connecting';
  let socket: Socket | undefined;

  function setStatus(next: ConnectionStatus) {
    if (next === status) return;
    status = next;
    statusListeners.forEach((listener) => listener(next));
  }

  function connect(): Socket {
    const next = io(url, {
      parser,
      transports: ['websocket'],
      auth: (cb) => cb({ token: getAccessToken() }),
    });
    next.on('connect', () => setStatus('connected'));
    next.on('disconnect', () => setStatus('disconnected'));
    next.on('connect_error', () => setStatus('disconnected'));
    next.onAny((name: string, payload: unknown) => {
      if (!isRealtimeEventName(name)) {
        console.warn(`Dropped unknown realtime event "${name}"`);
        return;
      }
      const parsed = RealtimeEventSchemas[name].safeParse(payload);
      if (!parsed.success) {
        console.warn(`Dropped invalid realtime event "${name}"`, parsed.error.issues);
        return;
      }
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- `name` and `parsed.data` come from the same schema entry, but TypeScript cannot correlate them into the union
      const event = { type: name, ...parsed.data } as RealtimeEvent;
      listeners.forEach((listener) => listener(event));
    });
    return next;
  }

  return {
    subscribeStatus(listener) {
      statusListeners.add(listener);
      listener(status);
      return () => statusListeners.delete(listener);
    },
    subscribe(listener) {
      listeners.add(listener);
      socket ??= connect();
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          socket?.close();
          socket = undefined;
          status = 'connecting';
        }
      };
    },
  };
}
