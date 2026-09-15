# Prototype Instructions

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.

## Durable prototype decisions

- Visual source of truth: `design/reference-option-3.png`, the selected Agent-director canvas direction.
- The canvas is a desktop web app for an internal short-drama team, not a marketing page.
- Preserve the split between Director Agent and manual canvas modes.
- Keep Director, image, and video model choices independent so later provider adapters can replace Volcengine models without redesigning the canvas.
- Runtime and final project data belong under `D:\画布`.
- The canvas interaction has been approved. Keep versioned browser-local project persistence, bounded undo/redo, and typed graph validation.
- The local backend phase is approved: model execution belongs to the loopback Node service, mock mode remains the default, and live credentials stay only in the ignored local `.env` file.
- Director, Mini video, and full video jobs use durable metadata under `runtime`; generated media belongs under `runtime/outputs` and concurrency defaults to one.
- Every live submission requires an explicit confirmation screen. The first live smoke test is one five-second `doubao-seedance-2-0-mini-260615` shot and must not be submitted without fresh user confirmation.
- Persist node positions, edges, viewport, canvas mode, selected models, workflow statuses, and Director messages locally. Never persist API credentials in browser storage.
- Treat the canvas as unbounded in every direction and preserve a 10%–120% zoom range.
- Every workflow node must open its actual content in a dedicated viewer; video nodes must use a playable video source, not a static poster-only state.
- Double-clicking empty canvas or a workflow-zone background opens the add-node menu at that exact canvas position. New nodes remain freely draggable and are not constrained to the three workflow zones.
- Add-node menu visual reference: `design/reference-add-node-menu.png`.
