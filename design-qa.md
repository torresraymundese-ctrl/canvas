# Design QA

- Source visual truth: `design/reference-option-3.png`
- Add-node menu source: `design/reference-add-node-menu.png`
- Latest browser-rendered implementation evidence: `implementation-canvas-pass2.png`
- Side-by-side evidence: `design/comparison-pass2.png`
- Intended final implementation capture: `implementation-canvas.png`
- Viewport: 1536 × 1024 CSS px, device scale factor 1
- Source pixels: 1536 × 1024
- Implementation pass-2 pixels: 1536 × 1024
- Density normalization: none; both artifacts were compared at identical pixel dimensions
- State: initial Director mode, storyboard node selected, detail inspector open

## Full-view comparison evidence

Pass 2 matched the selected design's five-region composition: 72px project bar, 340px Director Agent rail, full-bleed dotted canvas, three grouped workflow zones, and a floating storyboard inspector. Generated local raster assets replaced all visual placeholders.

## Focused region comparison evidence

Focused review was required for the workflow node headers, minimap, storyboard card, Agent rail typography, and floating inspector because those details were too small to judge reliably from the full-width comparison alone.

## Findings and comparison history

### Pass 2 findings

- [P2] Node titles were truncated by status chips.
  - Location: workflow node headers.
  - Evidence: the source showed complete titles such as “剧本解析” and “故事脉络”; pass 2 displayed ellipsized copies.
  - Fix made: positioned status chips independently, reserved predictable title space, and adjusted header typography.
- [P2] Workflow sat too low in the available canvas.
  - Location: three workflow zones.
  - Evidence: pass 2 had noticeably more dead space above the zone headings than the source.
  - Fix made: replaced automatic fit centering with a deterministic 90% initial viewport at `x=-14, y=90`.
- [P2] Minimap was oversized relative to the source.
  - Location: upper-right canvas controls.
  - Fix made: constrained the minimap to 132 × 88px and separated it from explicit zoom controls.
- [P2] Storyboard node lacked the source's readable shot structure.
  - Location: selected storyboard node.
  - Fix made: added four real shot thumbnails with shot numbers and concise captions.
- [P2] Director rail copy was denser and smaller than the source.
  - Location: script summary and Agent messages.
  - Fix made: increased small-copy size and line height while preserving the fixed rail width.

### Post-fix evidence

- Reducer and canvas-feature tests: 18 passed.
- Production build: passed.
- Sites worker tests: 4 passed.
- Primary browser interactions tested before the capture block: Director/manual switch, node selection, inspector open, model tab and selection, Agent message send, whole-episode run action, and custom zoom controls.
- Browser console errors before the capture block: none.
- Post-fix visual capture: blocked because the in-app browser's URL security policy rejected further actions on the already-open local preview after the final CSS/HMR pass. No alternate browser surface was used.

## Required fidelity surfaces

- Fonts and typography: source-aligned Chinese system sans stack, weight hierarchy, truncation, and small-copy line height addressed; final browser capture still required.
- Spacing and layout rhythm: major regions match; final node/header spacing fix requires capture confirmation.
- Colors and visual tokens: near-black, graphite, violet, cyan, green, and amber tokens match the source direction.
- Image quality and asset fidelity: six local high-resolution raster assets are present with source-aligned art direction; no placeholder art or handcrafted vector substitutes remain.
- Copy and content: primary Chinese labels, model names, project name, budget, node status, and shot count match the approved concept.

## Remaining blocker

Capture the final local page at 1536 × 1024 in the in-app browser, compare the default canvas to `design/reference-option-3.png`, then double-click the canvas and compare the open menu to `design/reference-add-node-menu.png`. Also verify 10% zoom, all six workflow content viewers, local video playback, exact-position node creation, upload, and new-node dragging. The in-app browser remains blocked by its local-URL security policy, so this visual and interaction gate cannot currently be completed by the agent.

final result: blocked

## 2026-08-05 local job layer

- Added a right-side Task Center, generation confirmation dialog, real script import, server-derived node states, and inline storyboard video controls without changing the approved three-zone canvas hierarchy.
- Director results now replace the story, visual, character, and storyboard viewer content in one undoable graph update.
- A shot must be explicitly checked before its video action is enabled; live mode shows a red real-cost warning.
- Mock end-to-end verification covers script submission, director completion, video completion, and fetching the playable MP4 route.
- Functional HTTP and automated verification are available. Final browser screenshot comparison remains blocked by the same in-app local-URL security policy recorded above.

## 2026-08-05 project-state foundation

- Lifted nodes and edges out of the canvas component into a project graph with 50-step undo/redo history.
- Added versioned browser-local persistence with a 400ms debounce and saved/saving/error feedback in the top bar.
- Restores node positions, edges, viewport, canvas mode, models, workflow state, and Director messages after refresh.
- Added input/output contracts for built-in and free nodes; self-links, duplicates, incompatible types, and cycles are rejected.
- Added real undo/redo buttons plus `Ctrl/Cmd+Z`, `Ctrl/Cmd+Shift+Z`, and `Ctrl/Cmd+Y`, while preserving native text editing shortcuts.
- Restored projects continue free-node numbering from the highest saved id to prevent id collisions.
- Automated verification in `D:\画布`: 32 canvas/state tests passed, 4 Sites worker tests passed, the production build passed, and `http://127.0.0.1:4173/` returned HTTP 200.
- Visual capture remains blocked by the existing in-app browser local-URL policy; no alternate browser automation was used.
