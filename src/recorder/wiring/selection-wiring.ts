/**
 * Cursor and selection signals.
 *
 * JupyterLab's shared models carry text, not cursors. Each code editor writes its selections
 * into its model's `selections` map, under the editor's uuid, and only while it has focus, so
 * other views of the same document and collaborators do not trigger it. A notebook has one such
 * map per cell model; a text file has one for the file.
 *
 * These watchers pass on the primary selection (the first, as JupyterLab defines it) of every
 * update, with no throttling, as VS Code's `onDidChangeTextEditorSelection` does.
 * `jupyter-documents.ts` starts them with each document's recorder, so they share its lifecycle.
 */

import type { EditorSelection } from '../events/selection-payloads';
import type { SignalLike } from './jupyter-documents';

/** A model's `selections` map (`IObservableMap<CodeEditor.ITextSelection[]>`). */
export interface SelectionMapLike {
  readonly changed: SignalLike<{
    readonly key: string;
    readonly newValue: readonly EditorSelection[] | undefined;
  }>;
}

/** A cell model (`ICellModel`): its id and its selections. */
export interface CellModelLike {
  readonly id: string;
  readonly selections: SelectionMapLike;
}

/** A notebook model's cell list (`CellList`). */
export interface CellModelListLike extends Iterable<CellModelLike> {
  readonly changed: SignalLike<unknown>;
}

export type Unwatch = () => void;

/** Calls `onSelection` with the primary selection of each update to `map`. */
export function watchSelections(
  map: SelectionMapLike,
  onSelection: (selection: EditorSelection) => void,
): Unwatch {
  const slot = (
    _: unknown,
    change: { readonly newValue: readonly EditorSelection[] | undefined },
  ) => {
    // An editor removing its entry (closing) is not a cursor move.
    const primary = change.newValue?.[0];
    if (primary !== undefined) onSelection(primary);
  };
  map.changed.connect(slot);
  return () => {
    map.changed.disconnect(slot);
  };
}

/**
 * Watches every cell's selections, following cells as they are added and removed. The cell id
 * is read when the selection moves, so a watcher never reports for the wrong cell.
 */
export function watchCellSelections(
  cells: CellModelListLike,
  onSelection: (cellId: string, selection: EditorSelection) => void,
): Unwatch {
  const watched = new Map<CellModelLike, Unwatch>();
  const sync = (): void => {
    const current = new Set(cells);
    for (const [cell, unwatch] of watched) {
      if (!current.has(cell)) {
        unwatch();
        watched.delete(cell);
      }
    }
    for (const cell of current) {
      if (watched.has(cell)) continue;
      watched.set(
        cell,
        watchSelections(cell.selections, (selection) => onSelection(cell.id, selection)),
      );
    }
  };
  const onCellsChanged = (): void => sync();
  sync();
  cells.changed.connect(onCellsChanged);
  return () => {
    cells.changed.disconnect(onCellsChanged);
    for (const unwatch of watched.values()) unwatch();
    watched.clear();
  };
}
