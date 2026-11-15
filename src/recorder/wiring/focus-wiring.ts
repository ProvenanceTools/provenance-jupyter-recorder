/**
 * Window focus and blur, to focus.change.
 *
 * VS Code records `onDidChangeWindowState` transitions: whether the editor window has focus.
 * The browser equivalent is the page window's `focus` and `blur` events, which fire when the
 * student switches to another tab or application and back. Moving focus between JupyterLab's
 * own panels does not fire them.
 *
 * As in VS Code, only transitions are recorded, never the starting state, and every recording
 * session receives each one.
 */

import { focusChangePayload } from '../events/focus-payloads';
import type { RecordingSession } from '../session/recording-session';
import type { Disposable } from './jupyter-documents';

/** The page window (`window`). */
export interface FocusTargetLike {
  addEventListener(type: 'focus' | 'blur', listener: () => void): void;
  removeEventListener(type: 'focus' | 'blur', listener: () => void): void;
}

export interface FocusWiringDeps {
  target: FocusTargetLike;
  /** Whether the page has focus now (`document.hasFocus()`). */
  hasFocus: () => boolean;
  sessions: () => readonly Pick<RecordingSession, 'host'>[];
}

export function connectFocus(deps: FocusWiringDeps): Disposable {
  let focused = deps.hasFocus();

  const transition = (gained: boolean): void => {
    if (gained === focused) return;
    focused = gained;
    for (const session of deps.sessions()) {
      session.host.emit('focus.change', focusChangePayload(gained));
    }
  };
  const onFocus = (): void => transition(true);
  const onBlur = (): void => transition(false);

  deps.target.addEventListener('focus', onFocus);
  deps.target.addEventListener('blur', onBlur);
  return {
    dispose(): void {
      deps.target.removeEventListener('focus', onFocus);
      deps.target.removeEventListener('blur', onBlur);
    },
  };
}
