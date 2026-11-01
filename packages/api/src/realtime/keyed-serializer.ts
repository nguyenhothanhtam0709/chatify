export interface Slot {
  /** Resolves when every earlier slot of the key has been released. */
  turn: Promise<void>;
  /** Gives the turn up (once this slot's own turn has come, so the order holds on failure too). */
  release(): void;
}

/**
 * Hands out numbered slots per key. The database lock orders commits across processes; taking
 * a slot while holding that lock makes slot order equal commit order, so what follows a commit
 * (room joins and leaves, pushes) runs in the same order within this process and a push never
 * overtakes the room change that preceded it. Never wait for a turn while holding the lock.
 */
export class KeyedSerializer {
  private readonly tails = new Map<string, Promise<void>>();

  public enter(key: string): Slot {
    const turn = this.tails.get(key) ?? Promise.resolve();
    let finish!: () => void;
    const tail = new Promise<void>((resolve) => (finish = resolve));
    this.tails.set(key, tail);
    void tail.then(() => {
      if (this.tails.get(key) === tail) this.tails.delete(key);
    });
    return { turn, release: () => void turn.then(finish) };
  }
}
