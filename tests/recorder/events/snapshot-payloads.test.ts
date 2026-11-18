/** Tests for src/recorder/events/snapshot-payloads.ts. */

import { describe, expect, it } from 'vitest';
import { extSnapshotPayload } from '../../../src/recorder/events/snapshot-payloads';

describe('extSnapshotPayload', () => {
  it('lists labextensions by npm name and server extensions by Python name', () => {
    const payload = extSnapshotPayload(
      {
        lab: [
          { name: '@jupyter-ai/core', version: '2.31.0' },
          { name: 'provjup', version: '0.0.0' },
        ],
        server: [
          { name: 'jupyter_ai', version: '2.31.0', enabled: true },
          { name: 'jupyter_lsp', version: '2.3.1', enabled: false },
        ],
      },
      () => false,
    );
    expect(payload).toEqual({
      extensions: [
        { id: '@jupyter-ai/core', version: '2.31.0', enabled: true },
        { id: 'provjup', version: '0.0.0', enabled: true },
        { id: 'jupyter_ai', version: '2.31.0', enabled: true },
        { id: 'jupyter_lsp', version: '2.3.1', enabled: false },
      ],
    });
  });

  it("marks a labextension disabled when the page's configuration disables it", () => {
    const payload = extSnapshotPayload(
      { lab: [{ name: '@jupyter-ai/core', version: '2.31.0' }], server: [] },
      (name) => name === '@jupyter-ai/core',
    );
    expect(payload.extensions).toEqual([
      { id: '@jupyter-ai/core', version: '2.31.0', enabled: false },
    ]);
  });
});
