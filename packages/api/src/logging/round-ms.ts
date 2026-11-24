const MS_ROUNDING_SCALE = 1000;

/** Rounds milliseconds to three decimals (microsecond precision) for logs. */
export const roundMs = (ms: number): number =>
  Math.round(ms * MS_ROUNDING_SCALE) / MS_ROUNDING_SCALE;
