import test from "node:test";
import assert from "node:assert/strict";

import {
  canvasReducer,
  clampZoom,
  initialCanvasState,
} from "../src/canvasState.js";
import {
  clampMenuPosition,
  createFreeNode,
  getNextFreeNodeSequence,
  getViewerContent,
  nodeCreationOptions,
} from "../src/canvasFeatures.js";
import * as canvasFeatures from "../src/canvasFeatures.js";
import {
  createProjectDocument,
  loadProject,
  restoreCanvasState,
  saveProject,
  selectPersistedCanvasState,
} from "../src/projectPersistence.js";
import {
  commitHistory,
  commitTransaction,
  createHistory,
  redoHistory,
  replacePresent,
  undoHistory,
} from "../src/projectHistory.js";
import { validateConnection } from "../src/workflowSchema.js";
import { getHistoryShortcut } from "../src/keyboardShortcuts.js";

function createMemoryStorage(initialValue = null) {
  const values = new Map();
  if (initialValue !== null) values.set("director-canvas/spring-god/episode-1/v1", initialValue);
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}

test("selecting a node opens its inspector", () => {
  const next = canvasReducer(initialCanvasState, {
    type: "select-node",
    nodeId: "characters",
  });

  assert.equal(next.selectedNodeId, "characters");
  assert.equal(next.inspectorOpen, true);
});

test("switching mode preserves the canvas selection", () => {
  const next = canvasReducer(initialCanvasState, {
    type: "set-mode",
    mode: "manual",
  });

  assert.equal(next.mode, "manual");
  assert.equal(next.selectedNodeId, initialCanvasState.selectedNodeId);
});

test("running the episode advances the video node and budget", () => {
  const next = canvasReducer(initialCanvasState, { type: "run-episode" });

  assert.equal(next.runState, "running");
  assert.equal(next.spentBudget, 42);
  assert.equal(next.nodes.video.status, "running");
});

test("confirming a node marks it complete and starts its downstream node", () => {
  const next = canvasReducer(initialCanvasState, {
    type: "confirm-node",
    nodeId: "storyboard",
  });

  assert.equal(next.nodes.storyboard.status, "complete");
  assert.equal(next.nodes.video.status, "ready");
  assert.equal(next.inspectorOpen, false);
});

test("zoom stays inside the supported range", () => {
  assert.equal(clampZoom(0), 10);
  assert.equal(clampZoom(10), 10);
  assert.equal(clampZoom(92), 92);
  assert.equal(clampZoom(140), 120);
});

test("zoom actions clamp the canvas scale", () => {
  const next = canvasReducer(initialCanvasState, {
    type: "set-zoom",
    zoom: 140,
  });

  assert.equal(next.zoom, 120);
});

test("closing the inspector preserves the node selection", () => {
  const next = canvasReducer(initialCanvasState, { type: "close-inspector" });

  assert.equal(next.inspectorOpen, false);
  assert.equal(next.selectedNodeId, initialCanvasState.selectedNodeId);
});

test("model selection changes only the requested model role", () => {
  const next = canvasReducer(initialCanvasState, {
    type: "set-model",
    role: "video",
    model: "Seedance 2.0 Pro",
  });

  assert.equal(next.models.video, "Seedance 2.0 Pro");
  assert.equal(next.models.director, initialCanvasState.models.director);
});

test("adding a director message trims its content", () => {
  const next = canvasReducer(initialCanvasState, {
    type: "add-message",
    content: "  把第八镜改成雨夜近景  ",
  });

  assert.equal(next.messages.at(-1).content, "把第八镜改成雨夜近景");
  assert.equal(next.messages.at(-1).author, "user");
});

test("empty director messages do not change state", () => {
  const next = canvasReducer(initialCanvasState, {
    type: "add-message",
    content: "   ",
  });

  assert.equal(next, initialCanvasState);
});

test("the director panel can be collapsed and reopened", () => {
  const collapsed = canvasReducer(initialCanvasState, {
    type: "toggle-director-panel",
  });
  const reopened = canvasReducer(collapsed, {
    type: "toggle-director-panel",
  });

  assert.equal(collapsed.directorPanelCollapsed, true);
  assert.equal(reopened.directorPanelCollapsed, false);
});

test("focus mode gives the canvas maximum space and restores the panel", () => {
  const focused = canvasReducer(initialCanvasState, {
    type: "toggle-canvas-focus",
  });
  const restored = canvasReducer(focused, {
    type: "toggle-canvas-focus",
  });

  assert.equal(focused.canvasFocus, true);
  assert.equal(focused.directorPanelCollapsed, true);
  assert.equal(restored.canvasFocus, false);
  assert.equal(restored.directorPanelCollapsed, false);
});

test("a free node is created at the exact canvas coordinates", () => {
  const node = createFreeNode("image", { x: 1210, y: -420 }, 7);

  assert.equal(node.id, "free-image-7");
  assert.equal(node.type, "free");
  assert.deepEqual(node.position, { x: 1210, y: -420 });
  assert.equal(node.data.freeKind, "image");
  assert.equal(node.parentId, undefined);
});

test("new free nodes keep unique ids after a saved graph is restored", () => {
  const nodes = [
    { id: "free-image-2" },
    { id: "free-video-11" },
    { id: "storyboard" },
  ];

  assert.equal(getNextFreeNodeSequence(nodes), 12);
});

test("the add-node menu exposes every requested creation type", () => {
  assert.deepEqual(
    nodeCreationOptions.map((option) => option.id),
    ["text", "image", "video", "composite", "director", "audio", "script", "assets"],
  );
});

test("every workflow node has viewable content and video has a playable source", () => {
  for (const id of ["script", "story", "world", "characters", "storyboard", "video"]) {
    assert.ok(getViewerContent({ id, data: {} }), `${id} should have viewer content`);
  }

  const video = getViewerContent({ id: "video", data: {} });
  assert.equal(video.mediaType, "video");
  assert.equal(video.src, "/assets/seedance-demo.mp4");
});

test("the node menu stays inside the visible canvas", () => {
  assert.deepEqual(
    clampMenuPosition({ x: 980, y: 700 }, { width: 1000, height: 720 }),
    { x: 744, y: 180 },
  );
  assert.deepEqual(
    clampMenuPosition({ x: -10, y: -20 }, { width: 1000, height: 720 }),
    { x: 12, y: 12 },
  );
});

test("double-clicking any blank canvas surface opens the node menu", () => {
  const blankCanvasTarget = { closest: () => null };
  const canOpen = canvasFeatures.shouldOpenNodeMenuFromTarget?.(blankCanvasTarget) ?? false;

  assert.equal(canOpen, true);
});

test("double-clicking an existing node does not open another node menu", () => {
  const workflowNodeTarget = {
    closest: (selector) => selector.includes(".react-flow__node-workflow") ? {} : null,
  };
  const canOpen = canvasFeatures.shouldOpenNodeMenuFromTarget?.(workflowNodeTarget) ?? true;

  assert.equal(canOpen, false);
});

test("project documents round-trip through storage", () => {
  const storage = createMemoryStorage();
  const project = createProjectDocument({
    graph: { nodes: [{ id: "script", data: {} }], edges: [] },
    viewport: { x: 10, y: 20, zoom: 0.8 },
    canvas: { mode: "director", models: { director: "Doubao Seed 2.0 Pro" } },
    savedAt: "2026-08-05T13:00:00.000Z",
  });

  saveProject(storage, project);

  assert.deepEqual(loadProject(storage), project);
});

test("invalid or incompatible stored projects are ignored safely", () => {
  assert.equal(loadProject(createMemoryStorage("{broken")), null);
  assert.equal(loadProject(createMemoryStorage(JSON.stringify({ schemaVersion: 99 }))), null);
});

test("only durable canvas fields are stored and restored", () => {
  const durable = selectPersistedCanvasState({
    ...initialCanvasState,
    mode: "manual",
    saveStatus: "error",
    savedAt: "should-not-be-nested",
    temporaryNotice: "ignore me",
  });

  assert.equal(durable.mode, "manual");
  assert.equal("saveStatus" in durable, false);
  assert.equal("savedAt" in durable, false);
  assert.equal("temporaryNotice" in durable, false);

  const restored = restoreCanvasState(initialCanvasState, {
    mode: "manual",
    models: { video: "Seedance 2.0 Pro" },
    unknown: true,
  });
  assert.equal(restored.mode, "manual");
  assert.equal(restored.models.video, "Seedance 2.0 Pro");
  assert.equal(restored.models.director, initialCanvasState.models.director);
  assert.equal("unknown" in restored, false);
});

test("save status reflects saving, success, and failure", () => {
  const saving = canvasReducer(initialCanvasState, { type: "save-status", status: "saving" });
  const saved = canvasReducer(saving, {
    type: "save-status",
    status: "saved",
    savedAt: "2026-08-05T13:00:00.000Z",
  });
  const failed = canvasReducer(saved, { type: "save-status", status: "error" });

  assert.equal(saving.saveStatus, "saving");
  assert.equal(saved.saveStatus, "saved");
  assert.equal(saved.savedAt, "2026-08-05T13:00:00.000Z");
  assert.equal(failed.saveStatus, "error");
});

test("imported script content replaces the demo script and is durable", () => {
  const next = canvasReducer(initialCanvasState, {
    type: "set-script",
    script: {
      name: "episode-02.txt",
      size: 28,
      content: "第一场\n雨夜古寺",
      importedAt: "2026-08-05T10:00:00.000Z",
    },
  });
  const durable = selectPersistedCanvasState(next);

  assert.equal(next.script.name, "episode-02.txt");
  assert.equal(next.script.content, "第一场\n雨夜古寺");
  assert.equal(durable.script.name, "episode-02.txt");
});

test("an empty imported script never replaces the current script", () => {
  const next = canvasReducer(initialCanvasState, {
    type: "set-script",
    script: { name: "empty.txt", size: 0, content: "   " },
  });

  assert.equal(next, initialCanvasState);
});

test("server-derived node status does not mutate unrelated nodes", () => {
  const next = canvasReducer(initialCanvasState, {
    type: "set-node-status",
    nodeId: "video",
    status: "running",
  });

  assert.equal(next.nodes.video.status, "running");
  assert.equal(next.nodes.storyboard.status, initialCanvasState.nodes.storyboard.status);
});

test("server job messages are appended once per event", () => {
  const action = {
    type: "append-agent-message",
    eventKey: "job_1:succeeded",
    content: "导演拆解完成，已生成 26 个镜头。",
    status: "已完成",
  };
  const next = canvasReducer(initialCanvasState, action);
  const duplicate = canvasReducer(next, action);

  assert.equal(next.messages.at(-1).author, "agent");
  assert.equal(next.messages.at(-1).content, action.content);
  assert.equal(duplicate, next);
});

test("applied server job receipts are durable and idempotent outside graph history", () => {
  const next = canvasReducer(initialCanvasState, { type: "mark-job-applied", jobId: "job_1" });
  const duplicate = canvasReducer(next, { type: "mark-job-applied", jobId: "job_1" });

  assert.deepEqual(next.appliedJobIds, ["job_1"]);
  assert.deepEqual(selectPersistedCanvasState(next).appliedJobIds, ["job_1"]);
  assert.equal(duplicate, next);
});

test("undo and redo restore graph snapshots", () => {
  const first = { nodes: [{ id: "a" }], edges: [] };
  const second = { nodes: [{ id: "a" }, { id: "b" }], edges: [] };
  const committed = commitHistory(createHistory(first), second);

  assert.deepEqual(undoHistory(committed).present, first);
  assert.deepEqual(redoHistory(undoHistory(committed)).present, second);
});

test("a new edit after undo clears redo history", () => {
  const empty = { nodes: [], edges: [] };
  const withA = { nodes: [{ id: "a" }], edges: [] };
  const withB = { nodes: [{ id: "b" }], edges: [] };
  const undone = undoHistory(commitHistory(createHistory(empty), withA));

  assert.equal(commitHistory(undone, withB).future.length, 0);
});

test("a drag transaction stores its starting graph as one undo step", () => {
  const before = { nodes: [{ id: "a", position: { x: 0, y: 0 } }], edges: [] };
  const after = { nodes: [{ id: "a", position: { x: 80, y: 40 } }], edges: [] };
  const live = replacePresent(createHistory(before), after);
  const committed = commitTransaction(live, before);

  assert.deepEqual(undoHistory(committed).present, before);
  assert.equal(committed.past.length, 1);
});

test("history keeps only the latest fifty undo snapshots", () => {
  let history = createHistory({ nodes: [], edges: [] });
  for (let index = 1; index <= 55; index += 1) {
    history = commitHistory(history, { nodes: [{ id: String(index) }], edges: [] });
  }

  assert.equal(history.past.length, 50);
  assert.equal(history.past[0].nodes[0].id, "5");
});

test("typed connections accept compatible outputs", () => {
  const nodes = [
    { id: "storyboard", data: { outputType: "storyboard", accepts: ["character-reference"] } },
    { id: "video", data: { outputType: "video", accepts: ["storyboard"] } },
  ];

  assert.equal(validateConnection({ source: "storyboard", target: "video" }, nodes, []).valid, true);
});

test("typed connections reject incompatible outputs", () => {
  const nodes = [
    { id: "image", data: { outputType: "image", accepts: ["text"] } },
    { id: "audio", data: { outputType: "audio", accepts: ["audio"] } },
  ];

  assert.equal(validateConnection({ source: "image", target: "audio" }, nodes, []).code, "type-mismatch");
});

test("connections reject graph cycles, self-links, and duplicates", () => {
  const nodes = [{ id: "a", data: {} }, { id: "b", data: {} }];
  const edges = [{ id: "a-b", source: "a", target: "b" }];

  assert.equal(validateConnection({ source: "b", target: "a" }, nodes, edges).code, "cycle");
  assert.equal(validateConnection({ source: "a", target: "a" }, nodes, edges).code, "self-link");
  assert.equal(validateConnection({ source: "a", target: "b" }, nodes, edges).code, "duplicate");
});

test("history keyboard shortcuts support undo and redo", () => {
  const target = { tagName: "DIV", isContentEditable: false };

  assert.equal(getHistoryShortcut({ key: "z", ctrlKey: true, target }), "undo");
  assert.equal(getHistoryShortcut({ key: "Z", metaKey: true, shiftKey: true, target }), "redo");
  assert.equal(getHistoryShortcut({ key: "y", ctrlKey: true, target }), "redo");
});

test("history shortcuts never capture text editing", () => {
  assert.equal(getHistoryShortcut({
    key: "z",
    ctrlKey: true,
    target: { tagName: "TEXTAREA", isContentEditable: false },
  }), null);
  assert.equal(getHistoryShortcut({
    key: "z",
    ctrlKey: false,
    target: { tagName: "DIV", isContentEditable: false },
  }), null);
});
