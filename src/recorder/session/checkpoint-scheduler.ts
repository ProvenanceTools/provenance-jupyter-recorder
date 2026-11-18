/**
 * Signs checkpoints off the keystroke path and writes them to `.slog.meta`.
 *
 * Ported from VS Code's checkpoint hook (`session/session-registry.ts`): each checkpoint is
 * chained onto the last, so they are signed and written in order, and `drain()` waits for the
 * most recent one before the session closes its meta file. A failure is reported and does not
 * stop later checkpoints.
 *
 * One difference: VS Code starts signing on a microtask, straight after the entry handler
 * returns. Here `schedule` only queues, and signing waits for a macrotask (`defer`), so an
 * ed25519 signature and the meta rewrite never run inside the handler of the keystroke that
 * triggered them (CLAUDE.md: never sign on the keystroke path).
 */

import { signCheckpoint } from '../../core/index';
import type { Checkpoint } from '../../core/index';

export interface CheckpointSchedulerDeps {
  privateKey: Uint8Array;
  /** Append the checkpoint to `.slog.meta` (`MetaWriter.appendCheckpoint`). */
  write: (checkpoint: Checkpoint) => Promise<void>;
  /** Run `fn` on a later macrotask. Default: `setTimeout(fn, 0)`. */
  defer?: (fn: () => void) => void;
  sign?: typeof signCheckpoint;
  /** Told when signing or writing fails. Default: `console.error`. */
  onError?: (error: unknown) => void;
}

export class CheckpointScheduler {
  private pending: Promise<void> = Promise.resolve();
  private readonly defer: (fn: () => void) => void;
  private readonly sign: typeof signCheckpoint;
  private readonly onError: (error: unknown) => void;

  constructor(private readonly deps: CheckpointSchedulerDeps) {
    this.defer = deps.defer ?? ((fn) => void globalThis.setTimeout(fn, 0));
    this.sign = deps.sign ?? signCheckpoint;
    this.onError =
      deps.onError ?? ((error) => console.error('provjup: checkpoint sign/write error', error));
  }

  /** Queue a checkpoint of the entry at `seq` with hash `hash`. Returns at once. */
  schedule(seq: number, hash: string): void {
    this.pending = this.pending
      .then(() => new Promise<void>((resolve) => this.defer(resolve)))
      .then(() => this.sign(seq, hash, this.deps.privateKey))
      .then((checkpoint) => this.deps.write(checkpoint))
      .catch((error: unknown) => this.onError(error));
  }

  /** Resolves when every checkpoint scheduled so far has been signed and written. */
  drain(): Promise<void> {
    return this.pending;
  }
}
