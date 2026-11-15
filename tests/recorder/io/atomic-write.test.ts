/** Tests for src/recorder/io/atomic-write.ts. */

import { describe, expect, it } from 'vitest';
import { AtomicFileWriter, type FileWriteProblem } from '../../../src/recorder/io/atomic-write';
import type { WriteResult } from '../../../src/recorder/io/server-client';
import type { Timers } from '../../../src/recorder/io/session-writer';

/** Timers whose interval the test fires by hand. */
class ManualTimers implements Timers {
  private fn: (() => void) | null = null;
  cleared = false;

  setInterval(fn: () => void): unknown {
    this.fn = fn;
    return 1;
  }

  clearInterval(): void {
    this.cleared = true;
    this.fn = null;
  }

  tick(): void {
    this.fn?.();
  }
}

/** A server whose writes can fail, or be held until the test releases them. */
class Server {
  readonly landed: string[] = [];
  fail = 0;
  private held: (() => void)[] = [];
  hold = false;

  writeFile(_dir: string, _file: string, data: string): Promise<WriteResult> {
    const run = (): WriteResult => {
      if (this.fail > 0) {
        this.fail--;
        return { kind: 'error', message: 'HTTP 500' };
      }
      this.landed.push(data);
      return { kind: 'ok', size: data.length };
    };
    if (!this.hold) return Promise.resolve(run());
    return new Promise((resolve) => this.held.push(() => resolve(run())));
  }

  release(): void {
    const held = this.held;
    this.held = [];
    held.forEach((go) => go());
  }
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function setup() {
  const server = new Server();
  const timers = new ManualTimers();
  const problems: FileWriteProblem[] = [];
  const writer = new AtomicFileWriter({
    server,
    dir: 'hw1',
    file: 'f.slog.meta',
    timers,
    onProblem: (p) => problems.push(p),
  });
  return { server, timers, problems, writer };
}

describe('AtomicFileWriter', () => {
  it('writes each version, in order', async () => {
    const { server, writer } = setup();
    await writer.write('a');
    await writer.write('b');
    expect(server.landed).toEqual(['a', 'b']);
    expect(writer.hasPending).toBe(false);
  });

  it('keeps a failed write, reports it, and retries it on the timer', async () => {
    const { server, timers, problems, writer } = setup();
    server.fail = 1;
    await writer.write('a');
    expect(server.landed).toEqual([]);
    expect(problems).toEqual([
      { kind: 'file_write_failed', file: 'f.slog.meta', message: 'HTTP 500' },
    ]);
    expect(writer.hasPending).toBe(true);

    timers.tick();
    await flush();
    expect(server.landed).toEqual(['a']);
    expect(writer.hasPending).toBe(false);
  });

  it('sends a newer version only after the one in flight, so the newest lands last', async () => {
    const { server, writer } = setup();
    server.hold = true;
    const first = writer.write('old');
    await flush(); // 'old' is in flight
    const second = writer.write('new');
    server.release();
    await first;
    await flush();
    server.release();
    await second;
    expect(server.landed).toEqual(['old', 'new']);
  });

  it('skips a version replaced before it was sent', async () => {
    const { server, writer } = setup();
    const first = writer.write('old');
    const second = writer.write('new');
    await Promise.all([first, second]);
    expect(server.landed).toEqual(['new']);
  });

  it('does not retry a failed version once a newer one has replaced it', async () => {
    const { server, writer } = setup();
    server.hold = true;
    server.fail = 1;
    const first = writer.write('old');
    const second = writer.write('new');
    await flush();
    server.release(); // 'old' fails while 'new' is already pending
    await first;
    await flush();
    server.release();
    await second;
    expect(server.landed).toEqual(['new']);
    expect(writer.hasPending).toBe(false);
  });

  it('makes one last attempt on dispose, then stops the timer', async () => {
    const { server, timers, writer } = setup();
    server.fail = 1;
    await writer.write('a');
    await writer.dispose();
    expect(server.landed).toEqual(['a']);
    expect(timers.cleared).toBe(true);
    await writer.dispose(); // idempotent
    expect(() => writer.write('b')).toThrow();
  });
});
