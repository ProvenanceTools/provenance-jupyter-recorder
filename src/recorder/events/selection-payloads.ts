/**
 * Pure selection.change payloads.
 *
 * Ported from the VS Code recorder's `transformSelectionChange` (`events/doc-events.ts`): the
 * primary selection's range, and whether it selects anything. JupyterLab reports positions as
 * `{ line, column }` from its code editors, already ordered so that `start` is not after `end`,
 * as VS Code's `Selection.start` / `.end` are.
 *
 * For a notebook, the editor reports a position inside one cell's source; `lineOffset` moves it
 * into the `ipynb-source-v1` view, where that cell's source starts.
 */

import type { Range, SelectionChangePayload } from '../../core/index';

/** A selection as a JupyterLab code editor reports it (`CodeEditor.IRange`). */
export interface EditorSelection {
  readonly start: { readonly line: number; readonly column: number };
  readonly end: { readonly line: number; readonly column: number };
}

/** The selection as a log-core `Range`, its lines shifted down by `lineOffset`. */
export function selectionRange(selection: EditorSelection, lineOffset = 0): Range {
  return {
    start: { line: lineOffset + selection.start.line, character: selection.start.column },
    end: { line: lineOffset + selection.end.line, character: selection.end.column },
  };
}

export function selectionChangePayload(
  path: string,
  selection: EditorSelection,
  lineOffset = 0,
): SelectionChangePayload {
  const { start, end } = selection;
  return {
    path,
    range: selectionRange(selection, lineOffset),
    was_selection: start.line !== end.line || start.column !== end.column,
  };
}
