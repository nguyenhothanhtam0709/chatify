/** Unit factors; each is a bare literal so durations built from them stay free of magic numbers. */
export const MS_PER_SECOND = 1000;
export const SECONDS_PER_MINUTE = 60;
export const MINUTES_PER_HOUR = 60;
export const HOURS_PER_DAY = 24;

export const SECONDS_PER_DAY = HOURS_PER_DAY * MINUTES_PER_HOUR * SECONDS_PER_MINUTE;
export const ONE_MINUTE_MS = SECONDS_PER_MINUTE * MS_PER_SECOND;
export const ONE_HOUR_MS = MINUTES_PER_HOUR * ONE_MINUTE_MS;

const MS_ROUNDING_SCALE = 1000;

/** Rounds milliseconds to three decimals (microsecond precision) for logs. */
export const roundMs = (ms: number): number =>
  Math.round(ms * MS_ROUNDING_SCALE) / MS_ROUNDING_SCALE;
