/** Tests for src/recorder/events/focus-payloads.ts. */

import { describe, expect, it } from 'vitest';
import { focusChangePayload } from '../../../src/recorder/events/focus-payloads';

describe('focusChangePayload', () => {
  it('records only whether focus was gained, as VS Code does', () => {
    expect(focusChangePayload(true)).toEqual({ gained: true });
    expect(focusChangePayload(false)).toEqual({ gained: false });
  });
});
