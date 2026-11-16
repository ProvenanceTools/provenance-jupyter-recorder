/**
 * Pure focus.change payloads.
 *
 * Ported from the VS Code recorder's `transformFocusChange` (`events/doc-events.ts`), which
 * records only whether the window gained focus. The caller emits on transitions only.
 */

import type { FocusChangePayload } from '../../core/index';

export function focusChangePayload(gained: boolean): FocusChangePayload {
  return { gained };
}
