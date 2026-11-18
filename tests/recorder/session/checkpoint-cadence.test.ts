/** Tests for src/recorder/session/checkpoint-cadence.ts. */

import { describe, expect, it } from 'vitest';
import {
  CHECKPOINT_INTERVAL,
  checkpointCadence,
} from '../../../src/recorder/session/checkpoint-cadence';

describe('checkpointCadence', () => {
  it('is due on every 100th entry written, as in VS Code', () => {
    expect(CHECKPOINT_INTERVAL).toBe(100);
    const cadence = checkpointCadence();
    const due: number[] = [];
    for (let n = 1; n <= 300; n++) if (cadence.entryWritten()) due.push(n);
    expect(due).toEqual([100, 200, 300]);
  });

  it('takes another interval', () => {
    const cadence = checkpointCadence(3);
    expect([1, 2, 3, 4, 5, 6].map(() => cadence.entryWritten())).toEqual([
      false,
      false,
      true,
      false,
      false,
      true,
    ]);
  });
});
