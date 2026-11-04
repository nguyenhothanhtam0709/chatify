/**
 * Where a signed-out visitor was going, kept in router location state (never in the URL)
 * while they log in or sign up.
 */
export interface ReturnToState {
  returnTo: string;
}

export function rememberReturnTo(location: { pathname: string; search: string }): ReturnToState {
  return { returnTo: location.pathname + location.search };
}

/** The remembered path and query to go to after signing in, or `/` when it isn't safe to follow. */
export function returnToFrom(state: unknown): string {
  if (typeof state !== 'object' || state === null || !('returnTo' in state)) return '/';
  const { returnTo } = state;
  if (typeof returnTo !== 'string' || !returnTo.startsWith('/')) return '/';
  let url: URL;
  try {
    url = new URL(returnTo, window.location.origin);
  } catch {
    return '/';
  }
  if (url.origin !== window.location.origin) return '/';
  if (url.pathname === '/login' || url.pathname === '/signup') return '/';
  return url.pathname + url.search;
}
