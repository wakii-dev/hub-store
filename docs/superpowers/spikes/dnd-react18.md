# SPIKE 3 — Drag-and-drop on React 18: react-sortable-hoc vs dnd-kit (SF-1 / FI-234, decision D7)

**Date:** 2026-08-31 · **Sandbox:** /tmp/sf1-spikes/spike3 (Vite + React 18.3.1 + TS + Vitest/jsdom, never inside the repo)
**Scope of real use (SF-8):** sortable row list inside an AntD4 modal, mouse drag on desktop 1440px; reorder → `onSortEnd({oldIndex, newIndex})` → `array.move` → stopOrder update.

## Verdict: **GO — react-sortable-hoc@2.0.0 + array-move@3.0.1** (no dnd-kit fallback needed)

| Checklist item | Result | Evidence |
|---|---|---|
| 1. react18-pass | **PASS** | Renders + drags without crash on react@18.3.1 `createRoot`, **with and without `<StrictMode>`**. All 10 tests green. |
| 2. reorder-pass | **PASS** | jsdom drag simulation fires `onSortEnd` with correct indices: forward `{oldIndex:0,newIndex:2}`, backward `{oldIndex:4,newIndex:1}`; list state reorders correctly (`two,three,one,four,five`). |
| 3. antd4-note | **PASS (light-touch)** | Same SortableList with rows rendered as antd `List.Item` inside antd `List` (antd@4.24.16): drag → `onSortEnd {oldIndex:0,newIndex:2}`, order reorders. No conflict observed. Needs standard `window.matchMedia` jsdom stub (antd testing requirement, unrelated to dnd). |
| 4. verdict | **GO** | Pinned: `react-sortable-hoc@2.0.0`, `array-move@3.0.1`, verified against `react@18.3.1`, `react-dom@18.3.1`, `antd@4.24.16`. |

StrictMode facts for D9: **StrictMode does NOT need to be disabled for the sortable list.** Rendering and mouse-drag sorting both work inside `<React.StrictMode>`. The only StrictMode-adjacent side effect is React's one-time-per-process `console.error` deprecation warning (see caveats).

## array-move correctness (unit, array-move@3.0.1)
- `arrayMove(['a','b','c','d','e'], 0, 2)` → `['b','c','a','d','e']` (forward)
- `arrayMove(['a','b','c','d','e'], 3, 1)` → `['a','d','b','c','e']` (backward)
- `arrayMove(['a','b','c'], 1, 1)` → no-op

## Working component skeleton (verified — copy into SF-8)

```tsx
import React from 'react';
import { SortableContainer, SortableElement, SortableHandle, SortEnd } from 'react-sortable-hoc';
import arrayMove from 'array-move'; // NOTE: default export, not named

export interface Row { id: number; label: string; }

const DragHandle = SortableHandle(() => (
  <span style={{ cursor: 'grab', marginRight: 8 }}>::</span>
));

const SortableRow = SortableElement<{ value: Row }>(({ value }) => (
  <li style={{ height: 40, display: 'flex', alignItems: 'center' }}>
    <DragHandle />
    {value.label}
  </li>
));

export const SortableListInner = SortableContainer<{ items: Row[] }>(({ items }) => (
  <ul style={{ padding: 0, listStyle: 'none' }}>
    {items.map((item, index) => (
      <SortableRow key={`item-${item.id}`} index={index} value={item} />
    ))}
  </ul>
));

// Host (e.g. inside AntD4 modal):
function Host({ initial, onOrderChange }: { initial: Row[]; onOrderChange: (rows: Row[]) => void }) {
  const [list, setList] = React.useState(initial);
  const handleSortEnd = ({ oldIndex, newIndex }: SortEnd) => {
    const next = arrayMove(list, oldIndex, newIndex);
    setList(next);
    onOrderChange(next); // → persist stopOrder
  };
  return <SortableListInner items={list} onSortEnd={handleSortEnd} />;
}
```

## Caveats (record these in SF-8 planning)

1. **React 19 time bomb (flag for future upgrade):** react-sortable-hoc is unmaintained (repo archived) and relies on `findDOMNode`. React 18.3.1 emits "findDOMNode is deprecated and will be removed in the next major release" once per process at mount. Works today; **will break on React 19** — migrating to dnd-kit should be revisited at any React-19 upgrade.
2. **Keyboard a11y (D10 known limitation):** mouse-only drag is verified; keyboard sorting exists in the lib (space = lift, arrows = move) but is untested here and not required for the desktop-1440px SF-8 use. Documented as accepted limitation.
3. **Test harness recipes (jsdom), needed for SF-8 unit tests — the library silently no-ops without them:**
   - Container event listeners attach in a `Promise.then` **microtask** after mount → `await` a macrotask flush after `render()` before simulating mousedown.
   - `onSortEnd` fires via `setTimeout(0)`-deferred code → flush timers before asserting.
   - jsdom has no layout: mock `getBoundingClientRect` + `offsetHeight/offsetWidth/offsetTop/offsetLeft` per row (row index × row height). Without these, `animateNodes()` index math degenerates (newIndex clamps to a list edge).
   - Use `clientX/clientY` in `fireEvent` inits; jsdom implements `pageX/pageY` as computed getters that cannot be overridden via fireEvent init (and `clientY`-only → pageY=0 → no translate).
   - antd components in jsdom need the standard `window.matchMedia` stub.
4. `array-move` v3 is a **default export** (`import arrayMove from 'array-move'`), not named.
