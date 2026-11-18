/**
 * Tests for src/recorder/io/server-client.ts.
 *
 * Only the response checks so far; the requests themselves are covered by the real-JupyterLab
 * checks.
 */

import { describe, expect, it } from 'vitest';
import { isInventory } from '../../../src/recorder/io/server-client';

describe('isInventory', () => {
  it('accepts the server extension inventory', () => {
    expect(
      isInventory({
        lab: [{ name: '@jupyter-ai/core', version: '2.31.0' }],
        server: [{ name: 'jupyter_ai', version: '2.31.0', enabled: true }],
      }),
    ).toBe(true);
    expect(isInventory({ lab: [], server: [] })).toBe(true);
  });

  it.each([
    ['not an object', null],
    ['missing lists', {}],
    ['a lab entry without a version', { lab: [{ name: 'x' }], server: [] }],
    ['a server entry without enabled', { lab: [], server: [{ name: 'x', version: '1' }] }],
    ['a non-string name', { lab: [{ name: 1, version: '1' }], server: [] }],
  ])('rejects %s', (_label, value) => {
    expect(isInventory(value)).toBe(false);
  });
});
