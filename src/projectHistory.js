const DEFAULT_HISTORY_LIMIT = 50;

const sameSnapshot = (left, right) => JSON.stringify(left) === JSON.stringify(right);

const appendPast = (history, snapshot) => (
  [...history.past, snapshot].slice(-history.limit)
);

export function createHistory(present, limit = DEFAULT_HISTORY_LIMIT) {
  return { past: [], present, future: [], limit };
}

export function commitHistory(history, present) {
  if (sameSnapshot(history.present, present)) return history;
  return {
    ...history,
    past: appendPast(history, history.present),
    present,
    future: [],
  };
}

export function replacePresent(history, present) {
  if (sameSnapshot(history.present, present)) return history;
  return { ...history, present };
}

export function commitTransaction(history, startingSnapshot) {
  if (!startingSnapshot || sameSnapshot(startingSnapshot, history.present)) return history;
  return {
    ...history,
    past: appendPast(history, startingSnapshot),
    future: [],
  };
}

export function undoHistory(history) {
  if (history.past.length === 0) return history;
  const previous = history.past.at(-1);
  return {
    ...history,
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
  };
}

export function redoHistory(history) {
  if (history.future.length === 0) return history;
  const [next, ...future] = history.future;
  return {
    ...history,
    past: appendPast(history, history.present),
    present: next,
    future,
  };
}
