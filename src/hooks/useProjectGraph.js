import { useCallback, useRef, useState } from "react";
import { applyEdgeChanges, applyNodeChanges } from "@xyflow/react";

import {
  commitHistory,
  commitTransaction,
  createHistory,
  redoHistory,
  replacePresent,
  undoHistory,
} from "../projectHistory.js";

export function useProjectGraph(initialGraph) {
  const [history, setHistory] = useState(() => createHistory(initialGraph));
  const historyRef = useRef(history);
  const transactionStart = useRef(null);

  const updateHistory = useCallback((nextHistory) => {
    historyRef.current = nextHistory;
    setHistory(nextHistory);
  }, []);

  const commitGraph = useCallback((nextGraphOrUpdater) => {
    const current = historyRef.current;
    const nextGraph = typeof nextGraphOrUpdater === "function"
      ? nextGraphOrUpdater(current.present)
      : nextGraphOrUpdater;
    updateHistory(commitHistory(current, nextGraph));
  }, [updateHistory]);

  const replaceGraph = useCallback((nextGraph) => {
    updateHistory(replacePresent(historyRef.current, nextGraph));
  }, [updateHistory]);

  const onNodesChange = useCallback((changes) => {
    const current = historyRef.current.present;
    const next = { ...current, nodes: applyNodeChanges(changes, current.nodes) };
    const recordsHistory = changes.some((change) => ["add", "remove", "replace"].includes(change.type));
    if (recordsHistory) commitGraph(next);
    else replaceGraph(next);
  }, [commitGraph, replaceGraph]);

  const onEdgesChange = useCallback((changes) => {
    const current = historyRef.current.present;
    const next = { ...current, edges: applyEdgeChanges(changes, current.edges) };
    const recordsHistory = changes.some((change) => ["add", "remove", "replace"].includes(change.type));
    if (recordsHistory) commitGraph(next);
    else replaceGraph(next);
  }, [commitGraph, replaceGraph]);

  const beginTransaction = useCallback(() => {
    transactionStart.current = historyRef.current.present;
  }, []);

  const endTransaction = useCallback(() => {
    const next = commitTransaction(historyRef.current, transactionStart.current);
    transactionStart.current = null;
    updateHistory(next);
  }, [updateHistory]);

  const undo = useCallback(() => updateHistory(undoHistory(historyRef.current)), [updateHistory]);
  const redo = useCallback(() => updateHistory(redoHistory(historyRef.current)), [updateHistory]);

  return {
    nodes: history.present.nodes,
    edges: history.present.edges,
    graph: history.present,
    onNodesChange,
    onEdgesChange,
    commitGraph,
    beginTransaction,
    endTransaction,
    undo,
    redo,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
  };
}
