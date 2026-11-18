/** Tests for src/recorder/session/checkpoint-scheduler.ts. */

import { describe, expect, it } from 'vitest';
import { generateSessionKeypair, verifyCheckpoint } from '../../../src/core/index';
import type { Checkpoint } from '../../../src/core/index';
import { CheckpointScheduler } from '../../../src/recorder/session/checkpoint-scheduler';

/** A macrotask queue the test runs by hand. */
class ManualDefer {
  readonly queue: (() => void)[] = [];
  readonly defer = (fn: () => void): void => void this.queue.push(fn);

  /** Run queued tasks, letting promise callbacks settle between them, until none are left. */
  async runAll(): Promise<void> {
    for (let guard = 0; guard < 100; guard++) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      const next = this.queue.shift();
      if (next === undefined) return;
      next();
    }
  }
}

const hash = (n: number): string => n.toString(16).padStart(64, '0');

describe('CheckpointScheduler', () => {
  it('never signs inside schedule(): signing waits for a later macrotask', async () => {
    const tasks = new ManualDefer();
    let signed = 0;
    const scheduler = new CheckpointScheduler({
      privateKey: new Uint8Array(32),
      write: () => Promise.resolve(),
      defer: tasks.defer,
      sign: (seq, entryHash) => {
        signed++;
        return Promise.resolve({ seq, hash: entryHash, sig: 'x' });
      },
    });

    scheduler.schedule(99, hash(99));
    await Promise.resolve(); // microtasks alone must not sign
    expect(signed).toBe(0);

    await tasks.runAll();
    await scheduler.drain();
    expect(signed).toBe(1);
  });

  it('signs with the session key and writes checkpoints in order', async () => {
    const keypair = await generateSessionKeypair();
    const written: Checkpoint[] = [];
    const scheduler = new CheckpointScheduler({
      privateKey: keypair.privateKey,
      write: (checkpoint) => {
        written.push(checkpoint);
        return Promise.resolve();
      },
    });

    scheduler.schedule(99, hash(99));
    scheduler.schedule(199, hash(199));
    await scheduler.drain();

    expect(written.map((c) => [c.seq, c.hash])).toEqual([
      [99, hash(99)],
      [199, hash(199)],
    ]);
    for (const checkpoint of written) {
      expect(await verifyCheckpoint(checkpoint, keypair.publicKeyHex)).toBe(true);
    }
  });

  it('reports a failure and keeps checkpointing', async () => {
    const errors: unknown[] = [];
    const written: number[] = [];
    const scheduler = new CheckpointScheduler({
      privateKey: new Uint8Array(32),
      write: (checkpoint) => {
        if (checkpoint.seq === 99) return Promise.reject(new Error('meta write failed'));
        written.push(checkpoint.seq);
        return Promise.resolve();
      },
      sign: (seq, entryHash) => Promise.resolve({ seq, hash: entryHash, sig: 'x' }),
      onError: (error) => errors.push(error),
    });

    scheduler.schedule(99, hash(99));
    scheduler.schedule(199, hash(199));
    await scheduler.drain();

    expect(errors).toEqual([new Error('meta write failed')]);
    expect(written).toEqual([199]);
  });
});
