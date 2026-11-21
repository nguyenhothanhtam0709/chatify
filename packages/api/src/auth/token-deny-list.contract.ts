import { describe, expect, it } from 'vitest';
import type { TokenDenyList } from './token-deny-list.js';

/**
 * The behaviour every `TokenDenyList` adapter must have. Call it from a test file with a
 * factory that builds the adapter and a way to make an entry expire (adapters cannot fake
 * their store's clock, so the test moves the entry, not time).
 */
export interface TokenDenyListUnderTest {
  denyList: TokenDenyList;
  /** Makes the entry for `jti` already expired. */
  expire: (jti: string) => Promise<void>;
}

export function describeTokenDenyListContract(
  adapterName: string,
  create: () => Promise<TokenDenyListUnderTest>,
): void {
  describe(`TokenDenyList contract: ${adapterName}`, () => {
    async function setup(): Promise<{
      denyList: TokenDenyList;
      expire: (jti: string) => Promise<void>;
      inSeconds: (seconds: number) => Date;
    }> {
      const { denyList, expire } = await create();
      const inSeconds = (seconds: number): Date => new Date(Date.now() + seconds * 1000);
      return { denyList, expire, inSeconds };
    }

    it('does not deny a jti that was never added', async () => {
      const { denyList } = await setup();

      expect(await denyList.isDenied('jti-unknown')).toBe(false);
    });

    it('denies an added jti until its expiry, and not after', async () => {
      const { denyList, expire, inSeconds } = await setup();
      await denyList.add('jti-1', inSeconds(60));

      expect(await denyList.isDenied('jti-1')).toBe(true);
      await expire('jti-1');
      expect(await denyList.isDenied('jti-1')).toBe(false);
    });

    it('keeps jtis independent of each other', async () => {
      const { denyList, inSeconds } = await setup();
      await denyList.add('jti-a', inSeconds(60));

      expect(await denyList.isDenied('jti-a')).toBe(true);
      expect(await denyList.isDenied('jti-b')).toBe(false);
    });

    it('accepts the same jti twice', async () => {
      const { denyList, inSeconds } = await setup();
      await denyList.add('jti-1', inSeconds(60));
      await denyList.add('jti-1', inSeconds(60));

      expect(await denyList.isDenied('jti-1')).toBe(true);
    });

    it('sweeps expired entries and keeps live ones, reporting how many it removed', async () => {
      const { denyList, expire, inSeconds } = await setup();
      await denyList.add('short', inSeconds(10));
      await denyList.add('short-too', inSeconds(20));
      await denyList.add('long', inSeconds(600));
      await expire('short');
      await expire('short-too');

      expect(await denyList.sweepExpired()).toBe(2);

      expect(await denyList.isDenied('long')).toBe(true);
      expect(await denyList.sweepExpired()).toBe(0);
    });
  });
}
