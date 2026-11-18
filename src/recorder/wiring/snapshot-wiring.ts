/**
 * Installed extensions to ext.snapshot, at the start and every 5 minutes.
 *
 * Ported from VS Code's `wiring/extension-snapshot.ts` (recorder PRD §4.2). Two differences
 * JupyterLab forces:
 *
 * - The list is fetched once, when recording starts. JupyterLab loads every extension with the
 *   page and cannot add or enable one without a reload, which starts a new session, so the
 *   list cannot change while this page records.
 * - There is no ext.activate (decided for 8.5, 2026-11-18). VS Code activates extensions
 *   lazily while it runs; JupyterLab has no equivalent. The periodic snapshot is kept so the
 *   log has the same shape as VS Code's.
 *
 * Every recording session receives each snapshot.
 */

import type { ExtSnapshotPayload } from '../../core/index';
import type { Timers } from '../io/session-writer';
import type { RecordingSession } from '../session/recording-session';
import type { Disposable } from './jupyter-documents';

export const SNAPSHOT_INTERVAL_MS = 5 * 60 * 1000;

export interface ExtensionSnapshotDeps {
  snapshot: ExtSnapshotPayload;
  sessions: () => readonly Pick<RecordingSession, 'host'>[];
  timers: Timers;
  /** Override the interval in ms. Default: 5 minutes, as in VS Code. */
  intervalMs?: number;
}

export function startExtensionSnapshot(deps: ExtensionSnapshotDeps): Disposable {
  const emit = (): void => {
    for (const session of deps.sessions()) session.host.emit('ext.snapshot', deps.snapshot);
  };
  emit();
  const handle = deps.timers.setInterval(emit, deps.intervalMs ?? SNAPSHOT_INTERVAL_MS);
  return {
    dispose(): void {
      deps.timers.clearInterval(handle);
    },
  };
}
