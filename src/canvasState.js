export const clampZoom = (value) => Math.min(120, Math.max(10, value));

export const modelOptions = {
  director: ["Doubao Seed 2.0 Pro"],
  image: ["Seedream 5.0", "Seedream 4.5"],
  video: ["Seedance 2.0 Mini", "Seedance 2.0"],
};

export const sampleScriptContent = `第1场  雨夜·春神古庙

林晚在修复一幅残损神像时，发现颜料下藏着一行只有月光才能照见的古字。
她循着古字指引进入荒废偏殿，撞见同样追查春神遗骸的沈砚。
庙外脚步逼近，两人必须在追兵到来前决定是否联手。`;

export const initialCanvasState = {
  mode: "director",
  selectedNodeId: "storyboard",
  inspectorOpen: true,
  directorPanelCollapsed: false,
  canvasFocus: false,
  zoom: 78,
  saveStatus: "saved",
  savedAt: null,
  runState: "idle",
  spentBudget: 36,
  totalBudget: 120,
  appliedJobIds: [],
  models: {
    director: modelOptions.director[0],
    image: modelOptions.image[0],
    video: modelOptions.video[0],
  },
  script: {
    name: "春神遗骸_第1集_剧本.txt",
    size: 12400,
    content: sampleScriptContent,
    importedAt: null,
    source: "demo",
  },
  nodes: {
    script: { status: "complete" },
    story: { status: "complete" },
    world: { status: "complete" },
    characters: { status: "complete" },
    storyboard: { status: "approval" },
    video: { status: "waiting" },
  },
  messages: [
    {
      id: "agent-1",
      author: "agent",
      time: "12:33",
      content: "我已理解剧本并拆解出核心冲突与人物关系，将生成故事脉络与关键事件节点。",
      status: "已完成",
    },
    {
      id: "agent-2",
      author: "agent",
      time: "12:34",
      content: "已完成视觉设定，包含世界观氛围、色彩风格与关键场景参考。",
      status: "已完成",
    },
    {
      id: "agent-3",
      author: "agent",
      time: "12:35",
      content: "正在规划分镜与镜头语言，已规划 26 个镜头，请确认或提出修改意见。",
      status: "进行中",
    },
  ],
};

export function canvasReducer(state, action) {
  switch (action.type) {
    case "select-node":
      return {
        ...state,
        selectedNodeId: action.nodeId,
        inspectorOpen: true,
      };
    case "set-mode":
      return { ...state, mode: action.mode };
    case "close-inspector":
      return { ...state, inspectorOpen: false };
    case "toggle-director-panel": {
      const directorPanelCollapsed = !state.directorPanelCollapsed;
      return {
        ...state,
        directorPanelCollapsed,
        canvasFocus: false,
      };
    }
    case "toggle-canvas-focus": {
      const canvasFocus = !state.canvasFocus;
      return {
        ...state,
        canvasFocus,
        directorPanelCollapsed: canvasFocus,
      };
    }
    case "set-zoom":
      return { ...state, zoom: clampZoom(action.zoom) };
    case "save-status":
      return {
        ...state,
        saveStatus: action.status,
        savedAt: action.savedAt ?? state.savedAt,
      };
    case "set-model":
      return {
        ...state,
        models: { ...state.models, [action.role]: action.model },
      };
    case "set-script": {
      const content = action.script?.content;
      if (typeof content !== "string" || !content.trim()) return state;
      return {
        ...state,
        script: {
          name: action.script.name || "未命名剧本.txt",
          size: Number.isFinite(action.script.size) ? action.script.size : content.length,
          content,
          importedAt: action.script.importedAt ?? new Date().toISOString(),
          source: action.script.source ?? "upload",
        },
      };
    }
    case "set-node-status": {
      if (!state.nodes[action.nodeId]) return state;
      if (state.nodes[action.nodeId].status === action.status) return state;
      return {
        ...state,
        nodes: {
          ...state.nodes,
          [action.nodeId]: {
            ...state.nodes[action.nodeId],
            status: action.status,
          },
        },
      };
    }
    case "set-run-state":
      return state.runState === action.status ? state : { ...state, runState: action.status };
    case "append-agent-message": {
      const content = action.content?.trim();
      if (!content || !action.eventKey || state.messages.some((message) => message.eventKey === action.eventKey)) return state;
      return {
        ...state,
        messages: [
          ...state.messages,
          {
            id: `agent-${action.eventKey}`,
            eventKey: action.eventKey,
            author: "agent",
            time: action.time ?? "刚刚",
            content,
            status: action.status ?? "已完成",
          },
        ],
      };
    }
    case "mark-job-applied": {
      if (!action.jobId || state.appliedJobIds.includes(action.jobId)) return state;
      return { ...state, appliedJobIds: [...state.appliedJobIds, action.jobId] };
    }
    case "run-episode":
      return {
        ...state,
        runState: "running",
        spentBudget: 42,
        nodes: {
          ...state.nodes,
          video: { ...state.nodes.video, status: "running" },
        },
      };
    case "confirm-node":
      return {
        ...state,
        inspectorOpen: false,
        nodes: {
          ...state.nodes,
          [action.nodeId]: {
            ...state.nodes[action.nodeId],
            status: "complete",
          },
          video: { ...state.nodes.video, status: "ready" },
        },
      };
    case "add-message": {
      const content = action.content.trim();
      if (!content) return state;

      return {
        ...state,
        messages: [
          ...state.messages,
          {
            id: `user-${state.messages.length + 1}`,
            author: "user",
            time: "刚刚",
            content,
            status: "已发送",
          },
        ],
      };
    }
    default:
      return state;
  }
}
