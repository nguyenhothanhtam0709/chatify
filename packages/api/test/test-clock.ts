import type { Clock } from '../src/clock/clock.js';

/** A clock the test moves by hand. */
export function testClock(start = new Date('2030-01-01T00:00:00Z')): {
  clock: Clock;
  advanceSeconds(seconds: number): void;
} {
  let current = start;
  const clock: Clock = { now: () => current };
  return {
    clock,
    advanceSeconds(seconds: number): void {
      current = new Date(current.getTime() + seconds * 1000);
    },
  };
}
