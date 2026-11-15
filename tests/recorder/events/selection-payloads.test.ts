/**
 * Tests for src/recorder/events/selection-payloads.ts. Cases follow the VS Code recorder's
 * `transformSelectionChange` tests.
 */

import { describe, expect, it } from 'vitest';
import {
  selectionChangePayload,
  selectionRange,
} from '../../../src/recorder/events/selection-payloads';

const at = (line: number, column: number) => ({ line, column });

describe('selectionChangePayload', () => {
  it('records a cursor as an empty range with was_selection false', () => {
    expect(selectionChangePayload('src/foo.py', { start: at(2, 3), end: at(2, 3) })).toEqual({
      path: 'src/foo.py',
      range: { start: { line: 2, character: 3 }, end: { line: 2, character: 3 } },
      was_selection: false,
    });
  });

  it('records a selection within one line as was_selection true', () => {
    const payload = selectionChangePayload('a.py', { start: at(0, 0), end: at(0, 5) });
    expect(payload.was_selection).toBe(true);
    expect(payload.range).toEqual({
      start: { line: 0, character: 0 },
      end: { line: 0, character: 5 },
    });
  });

  it('records a selection across lines as was_selection true, even at the same column', () => {
    expect(selectionChangePayload('a.py', { start: at(1, 4), end: at(3, 4) }).was_selection).toBe(
      true,
    );
  });

  it('shifts lines, not characters, by the line offset for a notebook view', () => {
    expect(selectionRange({ start: at(0, 2), end: at(1, 0) }, 5)).toEqual({
      start: { line: 5, character: 2 },
      end: { line: 6, character: 0 },
    });
  });
});
