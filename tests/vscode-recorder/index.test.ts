/**
 * Tests for src/vscode-recorder/index.ts: the import site for the VS Code recorder's helpers.
 *
 * These fail loudly when a monorepo update moves or removes a helper this repo depends on,
 * instead of letting the build quietly fall back to something else.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as vscodeRecorder from '../../src/vscode-recorder/index';
import { MAX_INLINE_BYTES as docOpenLimit } from '../../src/recorder/events/doc-events';

const repoRoot = join(__dirname, '..', '..');

/** Every name the import site re-exports, with the type each must have. */
const REEXPORTS: Record<string, 'number' | 'function'> = {
  MAX_INLINE_BYTES: 'number',
};

describe('vscode-recorder import site', () => {
  it('re-exports exactly the helpers listed here, each present in the submodule', () => {
    expect(Object.keys(vscodeRecorder).sort()).toEqual(Object.keys(REEXPORTS).sort());
    for (const [name, type] of Object.entries(REEXPORTS)) {
      expect(typeof (vscodeRecorder as Record<string, unknown>)[name], name).toBe(type);
    }
  });

  it('builds every helper it lists from a source file that still exists in the submodule', () => {
    const config = JSON.parse(
      readFileSync(join(repoRoot, 'tsconfig.vscode-recorder.json'), 'utf8'),
    ) as { files: string[] };
    expect(config.files.length).toBeGreaterThan(0);
    for (const file of config.files) {
      expect(existsSync(join(repoRoot, file)), file).toBe(true);
    }
  });

  it('gives doc.open the VS Code recorder’s inline limit, not a local copy', () => {
    expect(docOpenLimit).toBe(vscodeRecorder.MAX_INLINE_BYTES);
  });
});
