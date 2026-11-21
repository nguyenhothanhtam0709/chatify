import type { AddressInfo } from 'node:net';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { io, type Socket } from 'socket.io-client';
import parser from 'socket.io-msgpack-parser';

/** Starts the app on a random local port and returns its base URL. */
export async function listenOnRandomPort(app: NestFastifyApplication): Promise<string> {
  await app.listen(0, '127.0.0.1');
  const { port } = app.getHttpServer().address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

export interface TestSocket {
  socket: Socket;
  /** Every event received, in order, as `[name, payload]`. */
  received: Array<[string, unknown]>;
  /** Resolves with the next payload of `event` received after this call (or earlier, unread). */
  next(event: string): Promise<unknown>;
  close(): void;
}

const sockets = new Set<Socket>();

/** Closes every socket opened by `connectSocket` (call from `finally` or `afterEach`). */
export function closeAllSockets(): void {
  for (const socket of sockets) socket.close();
  sockets.clear();
}

/**
 * A real Socket.IO client with the MessagePack parser, WebSocket transport only, as the SPA
 * uses it. Rejects with the server's error message when the handshake is refused.
 */
export function connectSocket(url: string, accessToken: string | undefined): Promise<TestSocket> {
  const socket = io(url, {
    parser,
    transports: ['websocket'],
    reconnection: false,
    forceNew: true,
    auth: accessToken === undefined ? {} : { token: accessToken },
  });
  sockets.add(socket);
  const received: Array<[string, unknown]> = [];
  const waiting = new Map<string, Array<(payload: unknown) => void>>();
  socket.onAny((event: string, payload: unknown) => {
    received.push([event, payload]);
    for (const resolve of waiting.get(event)?.splice(0) ?? []) resolve(payload);
  });
  const handle: TestSocket = {
    socket,
    received,
    next: (event) =>
      new Promise((resolve) => {
        waiting.set(event, [...(waiting.get(event) ?? []), resolve]);
      }),
    close: () => socket.close(),
  };
  return new Promise((resolve, reject) => {
    socket.once('connect', () => resolve(handle));
    socket.once('connect_error', (error) => reject(error));
  });
}

export interface RejectedHandshake {
  /** The `connect_error` message (the error code). */
  error: string;
  /** Resolves `'closed'` when the server closes the connection, or `'open'` after `withinMs`. */
  closedByServer(withinMs: number): Promise<'closed' | 'open'>;
}

/**
 * Opens a bare Engine.IO WebSocket and sends the Socket.IO CONNECT packet by hand (MessagePack
 * encoded), because a real Socket.IO client closes its own connection after `connect_error` and
 * would hide whether the server did. Resolves with the `connect_error` it received.
 */
export function connectRawSocket(
  url: string,
  accessToken: string | undefined,
): Promise<RejectedHandshake> {
  const ws = new WebSocket(`${url.replace('http', 'ws')}/socket.io/?EIO=4&transport=websocket`);
  ws.binaryType = 'arraybuffer';
  const closed = new Promise<void>((resolve) => ws.addEventListener('close', () => resolve()));
  const decoder = new parser.Decoder();
  return new Promise<RejectedHandshake>((resolve, reject) => {
    ws.addEventListener('error', () => reject(new Error('websocket error')));
    decoder.on('decoded', (packet: { type: number; data?: { message?: string } }) => {
      if (packet.type === 0) return reject(new Error('handshake was accepted'));
      if (packet.type !== 4) return;
      resolve({
        error: packet.data?.message ?? '',
        closedByServer: (withinMs) =>
          Promise.race([
            closed.then(() => 'closed' as const),
            new Promise<'open'>((r) => setTimeout(() => r('open'), withinMs)),
          ]),
      });
    });
    ws.addEventListener('message', (event) => {
      if (typeof event.data === 'string') {
        // The Engine.IO open packet ("0{...}"): reply with the Socket.IO CONNECT packet.
        if (!event.data.startsWith('0')) return;
        const encoder = new parser.Encoder();
        const auth = accessToken === undefined ? {} : { token: accessToken };
        // The typings say one buffer; the parser returns an array of them.
        const chunks = encoder.encode({
          type: 0,
          nsp: '/',
          data: auth,
        }) as unknown as Uint8Array<ArrayBuffer>[];
        for (const chunk of chunks) ws.send(chunk);
      } else {
        decoder.add(Buffer.from(event.data as ArrayBuffer));
      }
    });
  }).finally(() => {
    // Not closing here: the caller observes whether the server does. Cleanup after the test.
    rawSockets.add(ws);
  });
}

const rawSockets = new Set<WebSocket>();

/** Closes every socket opened by `connectRawSocket`. */
export function closeAllRawSockets(): void {
  for (const ws of rawSockets) ws.close();
  rawSockets.clear();
}
