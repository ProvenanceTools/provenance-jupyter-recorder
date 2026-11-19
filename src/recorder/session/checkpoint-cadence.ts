/**
 * Decides when a checkpoint is due: after every 100th entry written, as in VS Code
 * (`session/session-registry.ts`, `CHECKPOINT_INTERVAL`).
 */

export const CHECKPOINT_INTERVAL = 100;

export interface CheckpointCadence {
  /** Count one written entry; true when it is the one to checkpoint. */
  entryWritten(): boolean;
}

export function checkpointCadence(interval = CHECKPOINT_INTERVAL): CheckpointCadence {
  let sinceLast = 0;
  return {
    entryWritten(): boolean {
      sinceLast++;
      if (sinceLast < interval) return false;
      sinceLast = 0;
      return true;
    },
  };
}
