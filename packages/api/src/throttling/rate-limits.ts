import { MS_PER_SECOND, ONE_HOUR_MS, ONE_MINUTE_MS } from '../common/time.js';

// Each limit sits beside its window. Comments elsewhere name the rule, never repeat the number.

/** Registration, per IP. */
export const REGISTER_LIMIT = 5;
export const REGISTER_TTL_MS = ONE_HOUR_MS;

const LOGIN_WINDOW_MINUTES = 15;
/** Login attempts, per IP (on the route) and per identifier (in `ThrottlingModule`). */
export const LOGIN_TTL_MS = LOGIN_WINDOW_MINUTES * ONE_MINUTE_MS;
export const LOGIN_IP_LIMIT = 10;
export const LOGIN_IDENTIFIER_LIMIT = 5;

/** User search, per User. */
export const SEARCH_LIMIT = 30;
export const SEARCH_TTL_MS = ONE_MINUTE_MS;

const SEND_WINDOW_SECONDS = 10;
/** Message sends, per User. */
export const SEND_LIMIT = 30;
export const SEND_TTL_MS = SEND_WINDOW_SECONDS * MS_PER_SECOND;

const TYPING_WINDOW_SECONDS = 2;
/** Typing signals, per User and Conversation: a refresh plus a `stopped`. */
export const TYPING_LIMIT = 2;
export const TYPING_TTL_MS = TYPING_WINDOW_SECONDS * MS_PER_SECOND;
