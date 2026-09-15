import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowsOutSimple, CornersIn, CornersOut, Minus, Plus, SidebarSimple } from "@phosphor-icons/react";
import {
  addEdge,
  Background,
  BackgroundVariant,
  MiniMap,
  ReactFlow,
  useReactFlow,
} from "@xyflow/react";

import { clampZoom, modelOptions } from "../canvasState.js";
import {
  clampMenuPosition,
  createFreeNode,
  getNextFreeNodeSequence,
  shouldOpenNodeMenuFromTarget,
} from "../canvasFeatures.js";
import { validateConnection } from "../workflowSchema.js";
import { ContentViewer } from "./ContentViewer.jsx";
import { FreeNode } from "./FreeNode.jsx";
import { FloatingInspector } from "./FloatingInspector.jsx";
import { NodeCreationMenu } from "./NodeCreationMenu.jsx";
import { WorkflowNode, ZoneNode } from "./WorkflowNode.jsx";

const nodeTypes = { workflow: WorkflowNode, zone: ZoneNode, free: FreeNode };

export function CanvasStage({ state, dispatch, graph, viewport, onViewportChange, jobs = [], onGenerateShot }) {
  const {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    commitGraph,
    beginTransaction,
    endTransaction,
  } = graph;
  const [nodeMenu, setNodeMenu] = useState(null);
  const [viewerNode, setViewerNode] = useState(null);
  const stageRef = useRef(null);
  const uploadInputRef = useRef(null);
  const uploadPositionRef = useRef(null);
  const nextNodeSequence = useRef(getNextFreeNodeSequence(nodes));
  const objectUrls = useRef([]);
  const { screenToFlowPosition, setViewport, zoomTo } = useReactFlow();

  useEffect(() => () => objectUrls.current.forEach((url) => URL.revokeObjectURL(url)), []);

  const renderedNodes = useMemo(
    () => nodes.map((node) => {
      if (node.type !== "workflow") return node;
      return {
        ...node,
        selected: node.id === state.selectedNodeId,
        data: {
          ...node.data,
          status: state.nodes[node.id]?.status ?? node.data.status,
          model: node.id === "characters" ? state.models.image : node.id === "video" ? state.models.video : node.data.model,
        },
      };
    }),
    [nodes, state.models, state.nodes, state.selectedNodeId],
  );
  const liveViewerNode = renderedNodes.find((node) => node.id === viewerNode?.id) ?? viewerNode;

  const onConnect = useCallback(
    (connection) => {
      if (!validateConnection(connection, nodes, edges).valid) return;
      commitGraph((current) => ({
        ...current,
        edges: addEdge({ ...connection, type: "smoothstep", animated: true }, current.edges),
      }));
    },
    [commitGraph, edges, nodes],
  );

  const isValidConnection = useCallback(
    (connection) => validateConnection(connection, nodes, edges).valid,
    [edges, nodes],
  );

  const changeZoom = (delta) => {
    const nextZoom = clampZoom(state.zoom + delta);
    dispatch({ type: "set-zoom", zoom: nextZoom });
    zoomTo(nextZoom / 100, { duration: 180 });
  };

  const resetView = () => {
    dispatch({ type: "set-zoom", zoom: 78 });
    const nextViewport = { x: 24, y: 116, zoom: 0.78 };
    onViewportChange(nextViewport);
    setViewport(nextViewport, { duration: 180 });
  };

  const openNodeMenu = useCallback((event) => {
    event.preventDefault();
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return;

    const localPosition = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    setNodeMenu({
      screenPosition: clampMenuPosition(localPosition, { width: rect.width, height: rect.height }),
      flowPosition: screenToFlowPosition({ x: event.clientX, y: event.clientY }),
    });
  }, [screenToFlowPosition]);

  const handleCanvasDoubleClick = useCallback((event) => {
    if (!shouldOpenNodeMenuFromTarget(event.target)) return;
    openNodeMenu(event);
  }, [openNodeMenu]);

  const addFreeNode = useCallback((kind, overrides = {}, position = nodeMenu?.flowPosition) => {
    if (!position) return;
    const node = createFreeNode(kind, position, nextNodeSequence.current, overrides);
    nextNodeSequence.current += 1;
    commitGraph((current) => ({ ...current, nodes: [...current.nodes, node] }));
    setNodeMenu(null);
  }, [commitGraph, nodeMenu?.flowPosition]);

  const beginUpload = () => {
    uploadPositionRef.current = nodeMenu?.flowPosition;
    setNodeMenu(null);
    uploadInputRef.current?.click();
  };

  const addUploadedFile = (event) => {
    const file = event.target.files?.[0];
    const position = uploadPositionRef.current;
    if (!file || !position) return;

    const url = URL.createObjectURL(file);
    objectUrls.current.push(url);
    const isVideo = file.type.startsWith("video/");
    const isAudio = file.type.startsWith("audio/");
    const viewer = isVideo
      ? { mediaType: "video", title: file.name, src: url }
      : isAudio
        ? { mediaType: "audio", title: file.name, src: url }
        : { mediaType: "gallery", title: file.name, images: [url] };
    addFreeNode("upload", {
      title: file.name,
      summary: isVideo ? "本地视频素材" : isAudio ? "本地音频素材" : "本地图片素材",
      viewer,
      preview: isVideo || isAudio ? undefined : url,
    }, position);
    event.target.value = "";
  };

  const openViewer = useCallback((node) => {
    if (node.type === "workflow") dispatch({ type: "select-node", nodeId: node.id });
    if (node.type !== "zone") setViewerNode(node);
    setNodeMenu(null);
  }, [dispatch]);

  const setShotConfirmed = useCallback((shotId, confirmed) => {
    commitGraph((current) => ({
      ...current,
      nodes: current.nodes.map((node) => {
        if (node.id !== "storyboard" || node.data.viewer?.mediaType !== "storyboard") return node;
        return {
          ...node,
          data: {
            ...node.data,
            viewer: {
              ...node.data.viewer,
              shots: node.data.viewer.shots.map((shot) => shot.id === shotId ? { ...shot, confirmed } : shot),
            },
          },
        };
      }),
    }));
  }, [commitGraph]);

  return (
    <section
      className="canvas-stage"
      aria-label="AI短剧创作画布"
      ref={stageRef}
      onDoubleClick={handleCanvasDoubleClick}
    >
      <div className="canvas-stage__mode-note">
        {state.mode === "director" ? "导演 Agent 已规划 26 个镜头" : "手动模式：可自由移动和连接节点"}
      </div>
      <div className="canvas-layout-controls" aria-label="画布布局">
        <button
          aria-label={state.directorPanelCollapsed ? "展开导演面板" : "收起导演面板"}
          title={state.directorPanelCollapsed ? "展开导演面板" : "收起导演面板"}
          onClick={() => dispatch({ type: "toggle-director-panel" })}
        >
          <SidebarSimple size={15} />
          <span>{state.directorPanelCollapsed ? "展开导演" : "收起导演"}</span>
        </button>
        <button
          className={state.canvasFocus ? "is-active" : ""}
          aria-label={state.canvasFocus ? "退出专注画布" : "进入专注画布"}
          title={state.canvasFocus ? "退出专注画布" : "进入专注画布"}
          onClick={() => dispatch({ type: "toggle-canvas-focus" })}
        >
          {state.canvasFocus ? <CornersIn size={15} /> : <ArrowsOutSimple size={15} />}
          <span>{state.canvasFocus ? "退出专注" : "专注画布"}</span>
        </button>
      </div>
      <ReactFlow
        nodes={renderedNodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        isValidConnection={isValidConnection}
        onNodeDragStart={beginTransaction}
        onNodeDragStop={endTransaction}
        onNodeClick={(_, node) => openViewer(node)}
        onPaneClick={() => setNodeMenu(null)}
        onMoveEnd={(_, nextViewport) => {
          onViewportChange(nextViewport);
          dispatch({ type: "set-zoom", zoom: Math.round(nextViewport.zoom * 100) });
        }}
        minZoom={0.1}
        maxZoom={1.2}
        defaultViewport={viewport}
        zoomOnDoubleClick={false}
        nodesDraggable
        nodesConnectable
        panOnDrag
        selectionOnDrag
        colorMode="dark"
      >
        <Background variant={BackgroundVariant.Dots} gap={18} size={1} color="#2a2a30" />
        <MiniMap
          position="top-right"
          pannable
          zoomable
          maskColor="rgba(5,6,8,.72)"
          nodeColor={(node) => node.type === "zone" ? "#202128" : "#6f4fd2"}
        />
      </ReactFlow>

      <div className="canvas-doubleclick-hint"><span>双击画布</span> 自由生成节点</div>

      <div className="canvas-zoom-controls" aria-label="画布缩放">
        <button aria-label="缩小画布" onClick={() => changeZoom(-10)}><Minus size={14} weight="bold" /></button>
        <span>{state.zoom}%</span>
        <button aria-label="放大画布" onClick={() => changeZoom(10)}><Plus size={14} weight="bold" /></button>
        <button aria-label="适应画布" onClick={resetView}><CornersOut size={14} /></button>
      </div>

      <div className="canvas-legend" aria-label="节点状态图例">
        <span><i className="legend-dot legend-dot--complete" />已完成</span>
        <span><i className="legend-dot legend-dot--running" />进行中</span>
        <span><i className="legend-dot legend-dot--approval" />待确认</span>
        <span><i className="legend-dot legend-dot--waiting" />等待中</span>
      </div>

      {nodeMenu && (
        <NodeCreationMenu
          position={nodeMenu.screenPosition}
          onAdd={(kind) => addFreeNode(kind)}
          onUpload={beginUpload}
          onHistory={() => addFreeNode("history", { title: "生成历史", summary: "选择之前生成的图片与视频" })}
        />
      )}
      <input
        className="visually-hidden"
        ref={uploadInputRef}
        type="file"
        accept="image/*,video/*,audio/*"
        onChange={addUploadedFile}
        tabIndex={-1}
      />

      <ContentViewer node={liveViewerNode} jobs={jobs} onGenerateShot={onGenerateShot} onSetShotConfirmed={setShotConfirmed} onClose={() => setViewerNode(null)} />

      <FloatingInspector state={state} dispatch={dispatch} modelOptions={modelOptions} />
    </section>
  );
}
