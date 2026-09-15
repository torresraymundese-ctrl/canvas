import { useEffect, useMemo, useReducer, useState } from "react";
import { ReactFlowProvider } from "@xyflow/react";

import { CanvasStage } from "./components/CanvasStage.jsx";
import { DirectorPanel } from "./components/DirectorPanel.jsx";
import { GenerationConfirmDialog } from "./components/GenerationConfirmDialog.jsx";
import { TaskCenter } from "./components/TaskCenter.jsx";
import { TopBar } from "./components/TopBar.jsx";
import { canvasReducer, initialCanvasState } from "./canvasState.js";
import { useJobQueue } from "./hooks/useJobQueue.js";
import { useProjectGraph } from "./hooks/useProjectGraph.js";
import { getHistoryShortcut } from "./keyboardShortcuts.js";
import { getNodeJobStatus, resolveModelId } from "./jobState.js";
import { createProjectDocument, loadProject, restoreCanvasState, saveProject, selectPersistedCanvasState } from "./projectPersistence.js";
import { workflowEdges, workflowNodes } from "./workflowData.js";
import { applyDirectorResult, attachVideoResult, getAppliedJobIds } from "./workflowResults.js";

const PROJECT_ID = "spring-god-episode-1";
const DEFAULT_VIEWPORT = { x: 24, y: 116, zoom: 0.78 };

export function App() {
  const [restoredProject] = useState(() => typeof window === "undefined" ? null : loadProject(window.localStorage));
  const [state, dispatch] = useReducer(canvasReducer, restoredProject, (project) => ({
    ...restoreCanvasState(initialCanvasState, project?.canvas),
    saveStatus: "saved",
    savedAt: project?.savedAt ?? null,
  }));
  const graph = useProjectGraph(restoredProject?.graph ?? { nodes: workflowNodes, edges: workflowEdges });
  const tasks = useJobQueue({ projectId: PROJECT_ID });
  const [viewport, setViewport] = useState(restoredProject?.viewport ?? DEFAULT_VIEWPORT);
  const [taskCenterOpen, setTaskCenterOpen] = useState(false);
  const [generationRequest, setGenerationRequest] = useState(null);
  const [submissionError, setSubmissionError] = useState("");
  const durableCanvas = useMemo(() => selectPersistedCanvasState(state), [
    state.mode,
    state.selectedNodeId,
    state.inspectorOpen,
    state.directorPanelCollapsed,
    state.canvasFocus,
    state.zoom,
    state.runState,
    state.spentBudget,
      state.totalBudget,
      state.appliedJobIds,
      state.models,
    state.script,
    state.nodes,
    state.messages,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    dispatch({ type: "save-status", status: "saving" });
    const timer = window.setTimeout(() => {
      try {
        const document = createProjectDocument({ graph: graph.graph, viewport, canvas: durableCanvas });
        saveProject(window.localStorage, document);
        dispatch({ type: "save-status", status: "saved", savedAt: document.savedAt });
      } catch {
        dispatch({ type: "save-status", status: "error" });
      }
    }, 400);
    return () => window.clearTimeout(timer);
  }, [durableCanvas, graph.graph, viewport]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      const action = getHistoryShortcut(event);
      if (!action) return;
      event.preventDefault();
      if (action === "undo") graph.undo();
      if (action === "redo") graph.redo();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [graph.redo, graph.undo]);

  useEffect(() => {
    const legacyApplied = getAppliedJobIds(graph.graph);
    for (const jobId of legacyApplied) dispatch({ type: "mark-job-applied", jobId });
    const applied = new Set([...state.appliedJobIds, ...legacyApplied]);
    const completed = tasks.jobs
      .filter((job) => job.status === "succeeded" && job.result && !applied.has(job.id))
      .sort((left, right) => Date.parse(left.updatedAt ?? left.createdAt) - Date.parse(right.updatedAt ?? right.createdAt));
    if (!completed.length) return;
    graph.commitGraph((current) => completed.reduce((next, job) => (
      job.type === "director"
        ? applyDirectorResult(next, job.result, { jobId: job.id })
        : attachVideoResult(next, job)
    ), current));
    for (const job of completed) dispatch({ type: "mark-job-applied", jobId: job.id });
  }, [graph.commitGraph, graph.graph, state.appliedJobIds, tasks.jobs]);

  useEffect(() => {
    const directorStatus = getNodeJobStatus(tasks.jobs.filter((job) => job.type === "director"), "storyboard");
    const videoStatus = getNodeJobStatus(tasks.jobs.filter((job) => job.type === "video"), "video");
    const mapStatus = (status, completedStatus) => {
      if (["queued", "running", "canceled_requested"].includes(status)) return "running";
      if (status === "succeeded") return completedStatus;
      if (status === "failed") return "failed";
      if (status === "canceled") return "waiting";
      return null;
    };
    const storyboardStatus = mapStatus(directorStatus, "approval");
    const mappedVideoStatus = mapStatus(videoStatus, "complete");
    if (storyboardStatus) dispatch({ type: "set-node-status", nodeId: "storyboard", status: storyboardStatus });
    if (mappedVideoStatus) dispatch({ type: "set-node-status", nodeId: "video", status: mappedVideoStatus });
    dispatch({ type: "set-run-state", status: tasks.activeJobs.some((job) => job.type === "director") ? "running" : "idle" });
    for (const job of tasks.jobs.filter((item) => item.type === "director" && ["succeeded", "failed", "canceled"].includes(item.status))) {
      dispatch({
        type: "append-agent-message",
        eventKey: `${job.id}:${job.status}`,
        status: job.status === "succeeded" ? "已完成" : job.status === "failed" ? "失败" : "已取消",
        content: job.status === "succeeded"
          ? `导演拆解完成，已生成 ${job.result?.shots?.length ?? 0} 个镜头，可点开分镜规划查看。`
          : job.status === "failed" ? `导演拆解失败：${job.error?.message ?? "请在任务中心重试。"}` : "导演拆解任务已取消。",
      });
    }
  }, [tasks.activeJobs, tasks.jobs]);

  const confirmGeneration = async (settings) => {
    setSubmissionError("");
    try {
      if (generationRequest.type === "director") {
        const job = await tasks.submitDirector({ projectId: PROJECT_ID, nodeId: "storyboard", script: state.script.content, shotCount: settings.shotCount, modelId: settings.modelId });
        dispatch({ type: "append-agent-message", eventKey: `${job.id}:created`, status: "进行中", content: `导演拆解任务已创建，目标 ${settings.shotCount} 个镜头。` });
      } else {
        await tasks.submitVideo({
          projectId: PROJECT_ID,
          nodeId: "video",
          shotId: generationRequest.shot.id,
          prompt: generationRequest.shot.prompt,
          modelId: settings.modelId,
          ratio: settings.ratio,
          duration: settings.duration,
          generateAudio: settings.generateAudio,
          referenceImages: [],
        });
      }
      setGenerationRequest(null);
      setTaskCenterOpen(true);
    } catch (error) {
      setSubmissionError(error.message || "任务提交失败，请检查本地服务。");
    }
  };

  const preferredModelId = generationRequest?.type === "video"
    ? resolveModelId(tasks.models, "video", state.models.video)
    : resolveModelId(tasks.models, "director", state.models.director);

  return (
    <main className="app-shell">
      <TopBar
        state={state}
        dispatch={dispatch}
        history={graph}
        activeJobCount={tasks.activeJobs.length}
        serviceStatus={tasks.service.status}
        onToggleTaskCenter={() => setTaskCenterOpen(true)}
        onRequestDirectorRun={() => { setSubmissionError(""); setGenerationRequest({ type: "director" }); }}
      />
      <div className={`workspace${state.directorPanelCollapsed ? " is-agent-collapsed" : ""}${state.canvasFocus ? " is-canvas-focus" : ""}`}>
        <DirectorPanel state={state} dispatch={dispatch} />
        <ReactFlowProvider>
          <CanvasStage
            state={state}
            dispatch={dispatch}
            graph={graph}
            viewport={viewport}
            onViewportChange={setViewport}
            jobs={tasks.jobs}
            onGenerateShot={(shot) => { setSubmissionError(""); setGenerationRequest({ type: "video", shot }); }}
          />
        </ReactFlowProvider>
      </div>
      <TaskCenter open={taskCenterOpen} jobs={tasks.jobs} service={tasks.service} error={tasks.error} onClose={() => setTaskCenterOpen(false)} onRetry={tasks.retry} onCancel={tasks.cancel} />
      <GenerationConfirmDialog request={generationRequest} models={tasks.models} service={tasks.service} preferredModelId={preferredModelId} error={submissionError} onCancel={() => setGenerationRequest(null)} onConfirm={confirmGeneration} />
    </main>
  );
}
