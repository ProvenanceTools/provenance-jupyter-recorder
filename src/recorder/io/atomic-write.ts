/**
 * Whole-file writes through the server, which writes a temp file, fsyncs and renames
 * (`provjup/fs/atomic_write.py`), so `.provenance/` never holds a partly written file.
 *
 * The VS Code recorder's `io/atomic-write.ts` does that rename itself, on a local disk. Here the
 * disk is behind a request that can fail on its own, so this writer adds what a request needs:
 *
 * - writes go out one at a time, in order, so an older version never lands after a newer one;
 * - only the latest version matters: content superseded before it was sent is skipped;
 * - a failed write is kept and retried on a timer, and reported, rather than dropped. A brief
 *   network or server problem must not lose the session's meta (decided 2026-11-14).
 */

import type { ProvjupServer } from './server-client';
import { browserTimers, type Timers } from './session-writer';

/** Retry a failed write this often, matching the log writer's flush interval. */
export const DEFAULT_RETRY_MS = 1000;

export type FileWriteProblem = { kind: 'file_write_failed'; file: string; message: string };

export interface AtomicFileWriterOptions {
  server: Pick<ProvjupServer, 'writeFile'>;
  /** Assignment folder, relative to the server root. */
  dir: string;
  /** File name inside `.provenance/`. */
  file: string;
  retryMs?: number;
  timers?: Timers;
  onProblem?: (problem: FileWriteProblem) => void;
}

export class AtomicFileWriter {
  /** The newest content not yet known to be on disk, or `null`. */
  private pending: string | null = null;
  private chain: Promise<void> = Promise.resolve();
  private disposed = false;
  private readonly timer: unknown;
  private readonly timers: Timers;

  constructor(private readonly options: AtomicFileWriterOptions) {
    this.timers = options.timers ?? browserTimers;
    this.timer = this.timers.setInterval(() => {
      if (!this.disposed && this.pending !== null) void this.flush();
    }, options.retryMs ?? DEFAULT_RETRY_MS);
  }

  /** Whether some content is still waiting to land. */
  get hasPending(): boolean {
    return this.pending !== null;
  }

  /** Replace the file with `text`. Resolves after one attempt; a failure is retried later. */
  write(text: string): Promise<void> {
    if (this.disposed) throw new Error('[AtomicFileWriter] write() called after dispose()');
    this.pending = text;
    return this.flush();
  }

  /** Try to write the pending content now, after any write already in flight. */
  flush(): Promise<void> {
    this.chain = this.chain.then(() => this.attempt());
    return this.chain;
  }

  /** Stop retrying, after one last attempt at anything pending. Idempotent. */
  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    this.timers.clearInterval(this.timer);
    await this.flush();
  }

  private async attempt(): Promise<void> {
    const text = this.pending;
    if (text === null) return;
    this.pending = null;
    const { server, dir, file, onProblem } = this.options;
    const result = await server.writeFile(dir, file, text);
    if (result.kind === 'ok') return;
    // Keep it for the next try, unless newer content arrived meanwhile and replaces it.
    if (this.pending === null) this.pending = text;
    onProblem?.({ kind: 'file_write_failed', file, message: result.message });
  }
}
