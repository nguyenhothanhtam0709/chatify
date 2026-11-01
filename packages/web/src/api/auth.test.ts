import { describe, expect, it } from 'vitest';
import { msUntilExpiry } from './auth.js';

function tokenWith(claims: unknown): string {
  return `h.${btoa(JSON.stringify(claims)).replace(/\+/g, '-').replace(/\//g, '_')}.s`;
}

describe('msUntilExpiry', () => {
  it('counts down to a numeric exp', () => {
    const exp = Math.floor(Date.now() / 1000) + 60;
    const ms = msUntilExpiry(tokenWith({ exp }));
    expect(ms).toBeGreaterThan(50_000);
    expect(ms).toBeLessThanOrEqual(60_000);
  });

  it('is 0 for a token that is not parsable', () => {
    expect(msUntilExpiry('not-a-token')).toBe(0);
  });

  it('is 0 for a non-numeric exp', () => {
    expect(msUntilExpiry(tokenWith({ exp: 'soon' }))).toBe(0);
  });

  it('is 0 for a missing exp', () => {
    expect(msUntilExpiry(tokenWith({ sub: 'x' }))).toBe(0);
  });
});
