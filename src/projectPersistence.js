export const PROJECT_STORAGE_KEY = "director-canvas/spring-god/episode-1/v1";
export const PROJECT_SCHEMA_VERSION = 1;

const DURABLE_CANVAS_FIELDS = [
  "mode",
  "selectedNodeId",
  "inspectorOpen",
  "directorPanelCollapsed",
  "canvasFocus",
  "zoom",
  "runState",
  "spentBudget",
  "totalBudget",
  "appliedJobIds",
  "models",
  "script",
  "nodes",
  "messages",
];

export function createProjectDocument({
  graph,
  viewport,
  canvas,
  savedAt = new Date().toISOString(),
}) {
  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    projectId: "spring-god-episode-1",
    savedAt,
    graph,
    viewport,
    canvas,
  };
}

export function serializeProject(document) {
  return JSON.stringify(document);
}

export function parseProject(raw) {
  const document = JSON.parse(raw);
  if (
    !document
    || document.schemaVersion !== PROJECT_SCHEMA_VERSION
    || document.projectId !== "spring-god-episode-1"
    || !Array.isArray(document.graph?.nodes)
    || !Array.isArray(document.graph?.edges)
    || typeof document.viewport?.zoom !== "number"
    || typeof document.canvas !== "object"
  ) {
    return null;
  }
  return document;
}

export function loadProject(storage) {
  try {
    const raw = storage?.getItem(PROJECT_STORAGE_KEY);
    return raw ? parseProject(raw) : null;
  } catch {
    return null;
  }
}

export function saveProject(storage, document) {
  storage.setItem(PROJECT_STORAGE_KEY, serializeProject(document));
  return document;
}

export function selectPersistedCanvasState(state) {
  return Object.fromEntries(
    DURABLE_CANVAS_FIELDS
      .filter((key) => Object.hasOwn(state, key))
      .map((key) => [key, state[key]]),
  );
}

export function restoreCanvasState(defaultState, storedState) {
  if (!storedState || typeof storedState !== "object") return { ...defaultState };

  const durable = selectPersistedCanvasState(storedState);
  return {
    ...defaultState,
    ...durable,
    models: { ...defaultState.models, ...(durable.models ?? {}) },
    nodes: { ...defaultState.nodes, ...(durable.nodes ?? {}) },
    messages: Array.isArray(durable.messages) ? durable.messages : defaultState.messages,
  };
}
