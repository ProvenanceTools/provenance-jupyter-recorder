/** Tests for src/recorder/wiring/selection-wiring.ts. */

import { describe, expect, it } from 'vitest';
import type { EditorSelection } from '../../../src/recorder/events/selection-payloads';
import {
  watchCellSelections,
  watchSelections,
} from '../../../src/recorder/wiring/selection-wiring';
import { FakeCellModel, FakeCellModels, FakeSelections } from '../../support/fake-jupyter';

describe('watchSelections', () => {
  it('passes on the primary selection of each update', () => {
    const map = new FakeSelections();
    const seen: EditorSelection[] = [];
    watchSelections(map, (s) => seen.push(s));
    const primary = { start: { line: 0, column: 1 }, end: { line: 0, column: 2 } };
    const secondary = { start: { line: 4, column: 0 }, end: { line: 4, column: 0 } };
    map.changed.emit({ key: 'e', newValue: [primary, secondary] });
    expect(seen).toEqual([primary]);
  });

  it('ignores removed or empty entries', () => {
    const map = new FakeSelections();
    const seen: EditorSelection[] = [];
    watchSelections(map, (s) => seen.push(s));
    map.remove();
    map.changed.emit({ key: 'e', newValue: [] });
    expect(seen).toEqual([]);
  });

  it('disconnects when unwatched', () => {
    const map = new FakeSelections();
    watchSelections(map, () => undefined)();
    expect(map.changed.listeners).toBe(0);
  });
});

describe('watchCellSelections', () => {
  it('reports the cell id with each selection, following added and removed cells', () => {
    const a = new FakeCellModel('a');
    const b = new FakeCellModel('b');
    const list = new FakeCellModels([a]);
    const seen: string[] = [];
    watchCellSelections(list, (id) => seen.push(id));

    a.selections.select([0, 0]);
    list.set([b]);
    a.selections.select([0, 0]);
    b.selections.select([0, 0]);

    expect(seen).toEqual(['a', 'b']);
    expect(a.selections.changed.listeners).toBe(0);
    expect(b.selections.changed.listeners).toBe(1);
  });

  it('watches a cell once however often the list changes', () => {
    const a = new FakeCellModel('a');
    const list = new FakeCellModels([a]);
    const seen: string[] = [];
    watchCellSelections(list, (id) => seen.push(id));
    list.set([a]);
    list.set([a]);
    a.selections.select([0, 0]);
    expect(seen).toEqual(['a']);
  });

  it('disconnects from every cell and the list when unwatched', () => {
    const a = new FakeCellModel('a');
    const b = new FakeCellModel('b');
    const list = new FakeCellModels([a, b]);
    watchCellSelections(list, () => undefined)();
    expect([a, b].map((c) => c.selections.changed.listeners)).toEqual([0, 0]);
    expect(list.changed.listeners).toBe(0);
  });
});
