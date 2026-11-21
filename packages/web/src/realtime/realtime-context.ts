import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  noRealtime,
  type ConnectionStatus,
  type RealtimeEvent,
  type RealtimeEvents,
} from './events';

/** Builds the connection; given a way to read the current access token (it is renewed). */
export type CreateRealtime = (getAccessToken: () => string | undefined) => RealtimeEvents;

export const RealtimeContext = createContext<RealtimeEvents>(noRealtime);

/** Calls `listener` for every server push while the calling component is mounted. */
export function useRealtimeEvents(listener: (event: RealtimeEvent) => void): void {
  const realtime = useContext(RealtimeContext);
  const latest = useRef(listener);
  // Layout effect, not passive: the new listener must be in place as soon as the render that
  // produced it is visible, or a push landing in that gap reaches a stale listener and is lost.
  useLayoutEffect(() => {
    latest.current = listener;
  });
  useEffect(() => realtime.subscribe((event) => latest.current(event)), [realtime]);
}

/** The connection's current status, kept up to date. */
export function useConnectionStatus(): ConnectionStatus {
  const realtime = useContext(RealtimeContext);
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  useEffect(() => realtime.subscribeStatus(setStatus), [realtime]);
  return status;
}

/** Calls `onReconnect` each time the connection comes back after having been lost. */
export function useReconnected(onReconnect: () => void): void {
  const realtime = useContext(RealtimeContext);
  const latest = useRef(onReconnect);
  useLayoutEffect(() => {
    latest.current = onReconnect;
  });
  useEffect(() => {
    let lost = false;
    return realtime.subscribeStatus((status) => {
      if (status === 'disconnected') lost = true;
      else if (status === 'connected' && lost) {
        lost = false;
        latest.current();
      }
    });
  }, [realtime]);
}
