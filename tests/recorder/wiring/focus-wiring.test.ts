/** Tests for src/recorder/wiring/focus-wiring.ts. */

import { describe, expect, it } from 'vitest';
import { FixedClock } from '../../../src/core/index';
import type { HashedEnvelope } from '../../../src/core/index';
import { createSessionHost } from '../../../src/recorder/session/session-host';
import { connectFocus, type FocusTargetLike } from '../../../src/recorder/wiring/focus-wiring';

class FakeWindow implements FocusTargetLike {
  readonly listeners = new Map<string, Set<() => void>>();

  addEventListener(type: 'focus' | 'blur', listener: () => void): void {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(listener);
  }

  removeEventListener(type: 'focus' | 'blur', listener: () => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  fire(type: 'focus' | 'blur'): void {
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener();
  }

  get count(): number {
    let n = 0;
    for (const set of this.listeners.values()) n += set.size;
    return n;
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

const focusEvents = (entries: HashedEnvelope[]) =>
  entries.filter((e) => e.kind === 'focus.change').map((e) => e.data);

describe('connectFocus', () => {
  it('records each transition, and not the starting state', () => {
    const win = new FakeWindow();
    const s = session();
    connectFocus({ target: win, hasFocus: () => true, sessions: () => [s] });
    win.fire('blur');
    win.fire('focus');
    expect(focusEvents(s.entries)).toEqual([{ gained: false }, { gained: true }]);
  });

  it('records nothing for an event that does not change focus', () => {
    const win = new FakeWindow();
    const s = session();
    connectFocus({ target: win, hasFocus: () => false, sessions: () => [s] });
    win.fire('blur');
    win.fire('focus');
    win.fire('focus');
    expect(focusEvents(s.entries)).toEqual([{ gained: true }]);
  });

  it('records each transition in every session', () => {
    const win = new FakeWindow();
    const a = session();
    const b = session();
    connectFocus({ target: win, hasFocus: () => true, sessions: () => [a, b] });
    win.fire('blur');
    expect(focusEvents(a.entries)).toEqual([{ gained: false }]);
    expect(focusEvents(b.entries)).toEqual([{ gained: false }]);
  });

  it('stops listening on dispose', () => {
    const win = new FakeWindow();
    const s = session();
    const focus = connectFocus({ target: win, hasFocus: () => true, sessions: () => [s] });
    focus.dispose();
    expect(win.count).toBe(0);
    win.fire('blur');
    expect(focusEvents(s.entries)).toEqual([]);
  });
});
