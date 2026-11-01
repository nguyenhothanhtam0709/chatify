import { IoAdapter } from '@nestjs/platform-socket.io';
import parser from 'socket.io-msgpack-parser';
import type { IoServerOptions } from './socket-types.js';

/**
 * Socket.IO as the spec fixes it: WebSocket transport only (no long-polling fallback),
 * MessagePack on the wire, and per-message deflate.
 */
export class RealtimeIoAdapter extends IoAdapter {
  public override createIOServer(port: number, options?: IoServerOptions) {
    const fixed = { transports: ['websocket'], parser, perMessageDeflate: true };
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- spreading the optional `options` makes every key optional, which the adapter's ServerOptions rejects under exactOptionalPropertyTypes (confirmed by compiling without the cast)
    return super.createIOServer(port, { ...options, ...fixed } as IoServerOptions);
  }
}
