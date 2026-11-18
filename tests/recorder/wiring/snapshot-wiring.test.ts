/** Tests for src/recorder/wiring/snapshot-wiring.ts. */

import { describe, expect, it } from 'vitest';
import { FixedClock } from '../../../src/core/index';
import type { HashedEnvelope } from '../../../src/core/index';
import type { Timers } from '../../../src/recorder/io/session-writer';
import { createSessionHost } from '../../../src/recorder/session/session-host';
import {
  SNAPSHOT_INTERVAL_MS,
  startExtensionSnapshot,
} from '../../../src/recorder/wiring/snapshot-wiring';

class FakeTimers implements Timers {
  readonly active = new Map<number, { fn: () => void; ms: number }>();
  private next = 0;

  setInterval(fn: () => void, ms: number): unknown {
    this.active.set(++this.next, { fn, ms });
    return this.next;
  }

  clearInterval(handle: unknown): void {
    this.active.delete(handle as number);
  }

  tick(): void {
    for (const { fn } of [...this.active.values()]) fn();
  }
}

function session() {
  const entries: HashedEnvelope[] = [];
  const host = createSessionHost({
    sessionId: 's',
    clock: new FixedClock(),
    onEntry: (e) => entries.push(e),
  });
  return { host, entries };
}

const snapshot = { extensions: [{ id: 'provjup', version: '0.0.0', enabled: true }] };

describe('startExtensionSnapshot', () => {
  it('emits at once and every 5 minutes, to every session', () => {
    const [a, b] = [session(), session()];
    const timers = new FakeTimers();
    startExtensionSnapshot({ snapshot, sessions: () => [a, b], timers });

    expect(a.entries.map((e) => [e.kind, e.data])).toEqual([['ext.snapshot', snapshot]]);
    expect(b.entries.map((e) => e.kind)).toEqual(['ext.snapshot']);
    expect([...timers.active.values()].map((t) => t.ms)).toEqual([SNAPSHOT_INTERVAL_MS]);
    expect(SNAPSHOT_INTERVAL_MS).toBe(5 * 60 * 1000);

    timers.tick();
    expect(a.entries.map((e) => e.kind)).toEqual(['ext.snapshot', 'ext.snapshot']);
    expect(b.entries.map((e) => e.kind)).toEqual(['ext.snapshot', 'ext.snapshot']);
  });

  it('stops on dispose', () => {
    const a = session();
    const timers = new FakeTimers();
    const wiring = startExtensionSnapshot({ snapshot, sessions: () => [a], timers });
    wiring.dispose();
    expect(timers.active.size).toBe(0);
  });
});
