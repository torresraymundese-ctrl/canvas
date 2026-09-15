# Director Canvas Prototype Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a faithful, interactive desktop prototype of the selected “Agent 导演模式” canvas and deliver it under `D:\画布`.

**Architecture:** A Vite + React single-screen application renders a left Director Agent rail and a zoomable grouped node canvas. All visible interactions are driven by a tested reducer with local mock data; API calls, authentication, persistence, and job queues are intentionally excluded from this first visual prototype.

**Tech Stack:** React 19, Vite 6, Phosphor Icons, CSS, Node.js built-in test runner.

## Global Constraints

- The selected third generated concept is the visual source of truth.
- Desktop web-app canvas; target viewport `1440 x 1024`.
- Chinese UI copy and cinematic near-black theme with restrained violet/cyan status colors.
- Core interactions must work: mode toggle, node selection, floating inspector, model selection, zoom controls, Agent message send, and “自动生成整集”.
- Use real raster artwork for character, setting, storyboard, and video thumbnails; use an icon library for UI icons.
- Do not implement backend APIs, credentials, auth, databases, or persistent job execution in this pass.
- Final files and runtime data root are `D:\画布`.

---

### Task 1: Scaffold and tested canvas state

**Files:**
- Modify: `package.json`
- Create: `src/canvasState.js`
- Create: `tests/canvas-state.test.mjs`

**Interfaces:**
- Produces: `initialCanvasState`, `canvasReducer(state, action)`, `clampZoom(value)`, and `modelOptions`.
- Consumes: no prior task interfaces.

- [ ] **Step 1: Add the failing state tests**

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { canvasReducer, clampZoom, initialCanvasState } from '../src/canvasState.js'

test('selecting a node opens its inspector', () => {
  const next = canvasReducer(initialCanvasState, { type: 'select-node', nodeId: 'storyboard' })
  assert.equal(next.selectedNodeId, 'storyboard')
  assert.equal(next.inspectorOpen, true)
})

test('running the episode advances ready generation nodes and budget', () => {
  const next = canvasReducer(initialCanvasState, { type: 'run-episode' })
  assert.equal(next.runState, 'running')
  assert.equal(next.spentBudget, 42)
  assert.equal(next.nodes.video.status, 'running')
})

test('zoom stays inside the supported range', () => {
  assert.equal(clampZoom(10), 60)
  assert.equal(clampZoom(140), 120)
})
```

- [ ] **Step 2: Run the tests and verify RED**

Run: `node --test tests/canvas-state.test.mjs`

Expected: FAIL because `src/canvasState.js` does not exist.

- [ ] **Step 3: Implement the reducer and data contract**

```js
export const clampZoom = (value) => Math.min(120, Math.max(60, value))

export const initialCanvasState = {
  mode: 'director',
  selectedNodeId: 'storyboard',
  inspectorOpen: true,
  zoom: 90,
  runState: 'idle',
  spentBudget: 36,
  totalBudget: 120,
  nodes: {
    script: { status: 'complete' },
    story: { status: 'complete' },
    world: { status: 'complete' },
    characters: { status: 'complete' },
    storyboard: { status: 'approval' },
    video: { status: 'waiting' },
  },
}

export function canvasReducer(state, action) {
  switch (action.type) {
    case 'select-node':
      return { ...state, selectedNodeId: action.nodeId, inspectorOpen: true }
    case 'toggle-mode':
      return { ...state, mode: action.mode }
    case 'close-inspector':
      return { ...state, inspectorOpen: false }
    case 'set-zoom':
      return { ...state, zoom: clampZoom(action.zoom) }
    case 'run-episode':
      return {
        ...state,
        runState: 'running',
        spentBudget: 42,
        nodes: { ...state.nodes, video: { status: 'running' } },
      }
    default:
      return state
  }
}
```

- [ ] **Step 4: Run the tests and verify GREEN**

Run: `node --test tests/canvas-state.test.mjs`

Expected: all state tests pass.

### Task 2: Build the core interactive screen

**Files:**
- Modify: `src/App.jsx`
- Create: `src/components/TopBar.jsx`
- Create: `src/components/DirectorPanel.jsx`
- Create: `src/components/CanvasStage.jsx`
- Create: `src/components/WorkflowNode.jsx`
- Create: `src/components/FloatingInspector.jsx`

**Interfaces:**
- Consumes: reducer state and dispatch actions from Task 1.
- Produces: the complete primary canvas journey rendered by `App`.

- [ ] **Step 1: Compose `App` around `useReducer`**

```jsx
const [state, dispatch] = useReducer(canvasReducer, initialCanvasState)
return (
  <main className="app-shell">
    <TopBar state={state} dispatch={dispatch} />
    <div className="workspace">
      <DirectorPanel state={state} dispatch={dispatch} />
      <CanvasStage state={state} dispatch={dispatch} />
    </div>
  </main>
)
```

- [ ] **Step 2: Implement the top bar controls**

Use semantic buttons for back, Director/manual segmented mode, budget ring, undo/redo, and the primary run action. Dispatch `toggle-mode` and `run-episode`; show a success/running label after run.

- [ ] **Step 3: Implement the Director Agent rail**

Render the imported script, short script summary, three realistic planning messages, and a composer. Sending a non-empty message appends it locally and clears the field.

- [ ] **Step 4: Implement grouped workflow nodes**

Render “故事理解”, “视觉设定”, and “镜头生成” zones with six connected nodes. Node buttons dispatch `select-node`; selected, complete, waiting, approval, and running states are visibly distinct.

- [ ] **Step 5: Implement the floating inspector**

Show detail tabs, status, model dropdown, note input, “返回修改”, and “确认通过”. Closing dispatches `close-inspector`; confirming locally changes the selected node’s status through a reducer action added test-first.

- [ ] **Step 6: Run tests**

Run: `npm test`

Expected: all reducer and Sites worker tests pass.

### Task 3: Produce and place cinematic image assets

**Files:**
- Create: `public/assets/world-rain-courtyard.png`
- Create: `public/assets/world-temple-night.png`
- Create: `public/assets/character-woman.png`
- Create: `public/assets/character-man.png`
- Create: `public/assets/character-elder.png`
- Create: `public/assets/character-rival.png`

**Interfaces:**
- Consumes: the selected ImageGen visual direction.
- Produces: six local raster assets used by the workflow nodes.

- [ ] **Step 1: Generate six independent cinematic assets**

Generate landscape 16:9 setting images and portrait 4:5 character images with a shared dark Chinese-fantasy film art direction. No text, logos, or watermark.

- [ ] **Step 2: Inspect every asset**

Verify subject, crop, palette, sharpness, and absence of accidental text.

- [ ] **Step 3: Copy assets into `public/assets`**

Keep generated originals intact and copy the selected files into the project with the exact filenames above.

### Task 4: Match the selected visual target

**Files:**
- Modify: `src/styles.css`
- Modify: `src/components/CanvasStage.jsx`
- Modify: `src/components/WorkflowNode.jsx`

**Interfaces:**
- Consumes: component anatomy from Task 2 and assets from Task 3.
- Produces: faithful responsive rendering at 1440 × 1024.

- [ ] **Step 1: Define visual tokens**

```css
:root {
  --bg: #08090b;
  --surface: #111216;
  --surface-raised: #17181d;
  --line: rgba(255, 255, 255, 0.09);
  --text: #f3f1f7;
  --muted: #87858f;
  --violet: #8b5cf6;
  --cyan: #35c7d4;
  --green: #35c77a;
  --amber: #e5ad47;
}
```

- [ ] **Step 2: Reproduce the 340px Agent rail and full-bleed canvas**

At 1440px, keep the left rail fixed and make the canvas consume the remaining width. Preserve the top bar, three zone headings, node density, and bottom status legend from the selected mock.

- [ ] **Step 3: Add responsive behavior**

At widths below 1100px, collapse the Agent rail to a slim icon rail and keep the workflow horizontally scrollable without hiding persistent controls.

- [ ] **Step 4: Add interaction states**

Provide focus-visible rings, hover elevation, selected violet outline, disabled undo/redo states, progress pulse, and the run-action success state.

- [ ] **Step 5: Build**

Run: `npm run build`

Expected: Vite build succeeds and Sites artifacts are produced.

### Task 5: Browser verification, design QA, and delivery

**Files:**
- Create: `design-qa.md`
- Create: `implementation-canvas.png`
- Modify: files identified by QA findings.

**Interfaces:**
- Consumes: selected source mock and locally running implementation.
- Produces: browser-verified prototype with `design-qa.md` ending in `final result: passed`.

- [ ] **Step 1: Start the local preview**

Run Vite on an available local port with host `0.0.0.0` and keep the process alive.

- [ ] **Step 2: Verify primary interactions in the in-app browser**

Test Director/manual mode, node selection, inspector close/open, model selection, zoom bounds, message send, and run workflow. Check browser console errors.

- [ ] **Step 3: Capture at 1440 × 1024**

Save the implementation screenshot as `implementation-canvas.png`.

- [ ] **Step 4: Compare source and implementation together**

Write `design-qa.md` with viewport, pixel dimensions, state, required fidelity surfaces, findings, comparison history, and result.

- [ ] **Step 5: Fix all P0/P1/P2 findings and repeat**

Re-capture and re-compare until `design-qa.md` says exactly `final result: passed`.

- [ ] **Step 6: Copy the verified project to `D:\画布`**

Copy source, assets, lockfile, tests, plan, and QA report. Exclude transient preview logs and `node_modules`; install dependencies in the final directory and verify `npm test` and `npm run build` there.

