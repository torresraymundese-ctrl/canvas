# Project State Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the current in-memory canvas into a locally persistent, undoable, typed workflow graph that can safely support the later Volcengine job layer.

**Architecture:** Keep the existing React/Vite frontend and move graph ownership from `CanvasStage` into a focused `useProjectGraph` hook. Store a versioned project document in browser local storage through a pure codec, keep undo/redo snapshots in a bounded history reducer, and validate every new edge against node input/output contracts plus cycle detection.

**Tech Stack:** React 19, Vite 6, `@xyflow/react` 12, Node built-in test runner, browser `localStorage`.

## Global Constraints

- Preserve the approved Director Agent visual direction and current canvas interactions.
- Keep the project frontend-only in this phase; do not place Volcengine credentials in browser code.
- Save runtime and final project data under `D:\画布` after verification.
- Keep the existing Sites worker and packaging files intact.
- This directory is not a Git repository, so tasks end with verified local checkpoints instead of commits.

---

### Task 1: Versioned project document and storage codec

**Files:**
- Create: `src/projectPersistence.js`
- Modify: `tests/canvas-state.test.mjs`

**Interfaces:**
- Produces: `PROJECT_STORAGE_KEY`, `createProjectDocument(input)`, `serializeProject(document)`, `parseProject(raw)`, `loadProject(storage)`, `saveProject(storage, document)`.
- Consumes: graph nodes/edges, viewport, and serializable canvas state supplied by `App`.

- [ ] **Step 1: Write failing codec tests**

```js
test("project documents round-trip through storage", () => {
  const storage = createMemoryStorage();
  const project = createProjectDocument({
    graph: { nodes: [{ id: "script", data: {} }], edges: [] },
    viewport: { x: 10, y: 20, zoom: 0.8 },
    canvas: { mode: "director", models: { director: "Doubao Seed 2.0 Pro" } },
  });
  saveProject(storage, project);
  assert.deepEqual(loadProject(storage), project);
});

test("invalid stored data is ignored safely", () => {
  const storage = createMemoryStorage("{broken");
  assert.equal(loadProject(storage), null);
});
```

- [ ] **Step 2: Run `npm.cmd test` and verify the tests fail because the persistence module is missing.**
- [ ] **Step 3: Implement the versioned codec**

```js
export const PROJECT_STORAGE_KEY = "director-canvas/spring-god/episode-1/v1";
export const PROJECT_SCHEMA_VERSION = 1;

export function createProjectDocument({ graph, viewport, canvas, savedAt = new Date().toISOString() }) {
  return { schemaVersion: PROJECT_SCHEMA_VERSION, projectId: "spring-god-episode-1", savedAt, graph, viewport, canvas };
}

export function saveProject(storage, document) {
  storage.setItem(PROJECT_STORAGE_KEY, JSON.stringify(document));
  return document;
}

export function loadProject(storage) {
  try {
    const raw = storage.getItem(PROJECT_STORAGE_KEY);
    return raw ? parseProject(raw) : null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run `npm.cmd test` and verify the codec tests pass.**

### Task 2: Bounded undo/redo history

**Files:**
- Create: `src/projectHistory.js`
- Create: `src/hooks/useProjectGraph.js`
- Modify: `tests/canvas-state.test.mjs`

**Interfaces:**
- Produces pure functions `createHistory`, `commitHistory`, `replacePresent`, `undoHistory`, `redoHistory`, `commitTransaction`.
- Produces hook `useProjectGraph(initialGraph)` returning `nodes`, `edges`, `onNodesChange`, `onEdgesChange`, `commitGraph`, `beginTransaction`, `endTransaction`, `undo`, `redo`, `canUndo`, and `canRedo`.

- [ ] **Step 1: Write failing history tests**

```js
test("undo and redo restore graph snapshots", () => {
  const first = { nodes: [{ id: "a" }], edges: [] };
  const second = { nodes: [{ id: "a" }, { id: "b" }], edges: [] };
  const committed = commitHistory(createHistory(first), second);
  assert.deepEqual(undoHistory(committed).present, first);
  assert.deepEqual(redoHistory(undoHistory(committed)).present, second);
});

test("a new edit clears redo history", () => {
  const undone = undoHistory(commitHistory(createHistory({ nodes: [], edges: [] }), { nodes: [{ id: "a" }], edges: [] }));
  assert.equal(commitHistory(undone, { nodes: [{ id: "b" }], edges: [] }).future.length, 0);
});
```

- [ ] **Step 2: Run the tests and verify expected failures.**
- [ ] **Step 3: Implement the pure bounded history reducer with a 50-snapshot limit.**
- [ ] **Step 4: Implement `useProjectGraph` with `applyNodeChanges` and `applyEdgeChanges`; live drag changes use `replacePresent`, while add/remove/connect operations use `commitHistory`.**
- [ ] **Step 5: Run the tests and verify all history tests pass.**

### Task 3: Typed node contracts and connection validation

**Files:**
- Create: `src/workflowSchema.js`
- Modify: `src/workflowData.js`
- Modify: `src/canvasFeatures.js`
- Modify: `tests/canvas-state.test.mjs`

**Interfaces:**
- Produces: `getNodeContract(node)`, `validateConnection(connection, nodes, edges)`, `wouldCreateCycle(connection, edges)`.
- `validateConnection` returns `{ valid: boolean, code: string, message: string }`.

- [ ] **Step 1: Write failing validation tests**

```js
test("typed connections accept compatible outputs", () => {
  const nodes = [
    { id: "storyboard", data: { outputType: "storyboard" } },
    { id: "video", data: { accepts: ["storyboard"] } },
  ];
  assert.equal(validateConnection({ source: "storyboard", target: "video" }, nodes, []).valid, true);
});

test("typed connections reject incompatible outputs and graph cycles", () => {
  const nodes = [
    { id: "image", data: { outputType: "image" } },
    { id: "audio", data: { accepts: ["audio"], outputType: "audio" } },
  ];
  assert.equal(validateConnection({ source: "image", target: "audio" }, nodes, []).code, "type-mismatch");
  assert.equal(validateConnection({ source: "b", target: "a" }, [{ id: "a", data: {} }, { id: "b", data: {} }], [{ source: "a", target: "b" }]).code, "cycle");
});
```

- [ ] **Step 2: Run tests and verify type/cycle cases fail.**
- [ ] **Step 3: Implement contracts, duplicate/self-edge checks, type validation, and DFS cycle detection.**
- [ ] **Step 4: Add `outputType` and `accepts` to every built-in and freely created node.**
- [ ] **Step 5: Run tests and verify validation passes.**

### Task 4: Lift graph state and restore persisted projects

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/components/CanvasStage.jsx`
- Modify: `src/canvasState.js`

**Interfaces:**
- `App` owns restored canvas state, `useProjectGraph`, viewport state, and debounced persistence.
- `CanvasStage` consumes `graph`, `viewport`, and `onViewportChange` props instead of creating private node/edge state.

- [ ] **Step 1: Add reducer tests for `save-status` state transitions and run them red.**
- [ ] **Step 2: Implement `save-status` in `canvasReducer` with `saving`, `saved`, and `error` plus `savedAt`.**
- [ ] **Step 3: Initialize `App` from `loadProject(window.localStorage)` and merge only allowed persisted canvas fields.**
- [ ] **Step 4: Add a 400ms debounced effect that writes graph, viewport, and canvas state through `saveProject`; dispatch saving/saved/error without retriggering the effect.**
- [ ] **Step 5: Refactor `CanvasStage` to consume the lifted graph, commit add/connect/upload/history-node operations, and record drag transactions.**
- [ ] **Step 6: Pass `validateConnection(...).valid` to React Flow's `isValidConnection` and keep invalid edges out of history.**
- [ ] **Step 7: Run tests and build.**

### Task 5: Real save status, undo/redo controls, and keyboard shortcuts

**Files:**
- Modify: `src/components/TopBar.jsx`
- Modify: `src/App.jsx`
- Modify: `src/styles.css`
- Modify: `tests/canvas-state.test.mjs`

**Interfaces:**
- `TopBar` consumes `history={{ canUndo, canRedo, undo, redo }}`.
- Produces `getHistoryShortcut(event)` to map `Ctrl/Cmd+Z`, `Ctrl/Cmd+Shift+Z`, and `Ctrl/Cmd+Y`.

- [ ] **Step 1: Write failing shortcut tests with literal expected actions `undo`, `redo`, and `null`.**
- [ ] **Step 2: Run tests and verify failures.**
- [ ] **Step 3: Implement shortcut mapping and register a window keydown handler that ignores text inputs.**
- [ ] **Step 4: Enable TopBar undo/redo buttons, add click handlers and tooltips, and replace “已自动保存” with “正在保存…”, “已保存到本机”, or “保存失败”.**
- [ ] **Step 5: Add a compact save-error treatment without changing the approved top bar layout.**
- [ ] **Step 6: Run tests and build.**

### Task 6: Final verification and delivery checkpoint

**Files:**
- Modify: `AGENTS.md`
- Modify: `design-qa.md`
- Sync verified files to: `D:\画布`

**Interfaces:**
- Preserves the same local preview URL and Sites packaging contract.

- [ ] **Step 1: Run `npm.cmd test`. Expected: all reducer, persistence, history, schema, and shortcut tests pass.**
- [ ] **Step 2: Run `npm.cmd run build`. Expected: Vite and Sites packaging exit 0.**
- [ ] **Step 3: Run `npm.cmd run test:sites`. Expected: all Sites worker tests pass.**
- [ ] **Step 4: Sync changed files to `D:\画布` and repeat all three commands in the final directory.**
- [ ] **Step 5: Confirm `http://localhost:4173/` returns HTTP 200; report browser visual verification separately because the in-app browser local-URL policy remains blocked.**
