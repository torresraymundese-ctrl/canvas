import { getFreeNodeContract } from "./workflowSchema.js";

const imageAssets = {
  world: ["/assets/world-rain-courtyard.png", "/assets/world-temple-night.png"],
  characters: [
    "/assets/character-woman.png",
    "/assets/character-man.png",
    "/assets/character-elder.png",
    "/assets/character-rival.png",
  ],
};

export const nodeCreationOptions = [
  { id: "text", label: "文本", summary: "输入提示词或创作备注" },
  { id: "image", label: "图片", summary: "生成或整理视觉参考" },
  { id: "video", label: "视频", summary: "生成、播放和调整视频" },
  { id: "composite", label: "视频合成", summary: "组合镜头与转场", badge: "Beta" },
  { id: "director", label: "导演台", summary: "创建独立导演任务", badge: "NEW" },
  { id: "audio", label: "音频", summary: "配音、音乐与环境音" },
  { id: "script", label: "脚本", summary: "拆解新的剧本片段", nested: true },
  { id: "assets", label: "素材库", summary: "选择项目素材", nested: true },
];

const freeNodeViewers = {
  text: { mediaType: "document", title: "文本节点", body: "双击打开后，可在这里继续完善提示词、对白或创作备注。" },
  image: { mediaType: "gallery", title: "图片节点", images: imageAssets.world },
  video: { mediaType: "video", title: "视频节点", src: "/assets/seedance-demo.mp4", poster: imageAssets.world[1] },
  composite: { mediaType: "document", title: "视频合成", body: "镜头 01 → 转场 → 镜头 02\n可继续添加字幕、音乐与节奏点。" },
  director: { mediaType: "document", title: "导演台", body: "描述导演目标，Agent 将调用剧本、图片与视频节点完成任务。" },
  audio: { mediaType: "document", title: "音频节点", body: "添加配音、环境音或音乐，并与镜头时间轴对齐。" },
  script: { mediaType: "document", title: "脚本节点", body: "在此粘贴新的场景、对白或完整剧本片段。" },
  assets: { mediaType: "gallery", title: "素材库", images: [...imageAssets.world, ...imageAssets.characters] },
  upload: { mediaType: "document", title: "上传素材", body: "已添加本地素材。" },
  history: { mediaType: "gallery", title: "生成历史", images: imageAssets.characters },
};

const workflowViewers = {
  script: {
    mediaType: "document",
    title: "剧本解析",
    eyebrow: "26 场 · 8,420 字",
    body: "第 1 场｜春祭广场｜夜\n\n鼓声从雨幕深处传来。女主穿过祭祀人群，在倾倒的神像下发现带有花纹的遗骸。\n\n核心冲突：她必须在家族守护者封锁现场前确认遗骸的身份。",
  },
  story: {
    mediaType: "timeline",
    title: "故事脉络",
    steps: ["春祭开场：女主发现异常", "遗骸出现：古老花纹苏醒", "家族阻拦：调查被迫中断", "春神苏醒：秘密指向更深阴谋"],
  },
  world: { mediaType: "gallery", title: "世界观设定", eyebrow: "雨夜 · 古寺 · 冷青色调", images: imageAssets.world },
  characters: { mediaType: "gallery", title: "角色定妆", eyebrow: "4 位主要角色", images: imageAssets.characters },
  storyboard: {
    mediaType: "storyboard",
    title: "分镜规划",
    shots: [
      { name: "S001 春祭开场", image: imageAssets.world[0], note: "大全景 · 缓慢推进 · 4 秒" },
      { name: "S002 遗骸出现", image: imageAssets.characters[0], note: "近景 · 手持轻晃 · 3 秒" },
      { name: "S003 家族对峙", image: imageAssets.world[1], note: "中景 · 横向移动 · 5 秒" },
      { name: "S004 春神苏醒", image: imageAssets.characters[1], note: "特写 · 快速推近 · 3 秒" },
    ],
  },
  video: {
    mediaType: "video",
    title: "视频生成",
    eyebrow: "Seedance Mini · 测试预览",
    src: "/assets/seedance-demo.mp4",
    poster: imageAssets.world[1],
  },
};

export function createFreeNode(kind, position, sequence, overrides = {}) {
  const option = nodeCreationOptions.find((item) => item.id === kind)
    ?? { id: kind, label: overrides.title ?? "新节点", summary: "自由创作节点" };
  const viewer = overrides.viewer ?? freeNodeViewers[kind] ?? freeNodeViewers.text;
  const contract = getFreeNodeContract(kind, viewer);

  return {
    id: `free-${kind}-${sequence}`,
    type: "free",
    position: { x: position.x, y: position.y },
    data: {
      freeKind: kind,
      title: overrides.title ?? option.label,
      summary: overrides.summary ?? option.summary,
      badge: option.badge,
      viewer,
      preview: overrides.preview ?? viewer.poster ?? viewer.images?.[0],
      ...contract,
    },
    style: { width: 220, height: 148 },
  };
}

export function getNextFreeNodeSequence(nodes) {
  return nodes.reduce((highest, node) => {
    const match = /^free-.+-(\d+)$/.exec(node.id);
    return match ? Math.max(highest, Number(match[1])) : highest;
  }, 0) + 1;
}

export function getViewerContent(node) {
  if (!node) return null;
  if (node.data?.viewer) return node.data.viewer;
  return workflowViewers[node.id] ?? freeNodeViewers[node.data?.freeKind] ?? null;
}

export function clampMenuPosition(position, bounds) {
  const margin = 12;
  const menuWidth = 244;
  const menuHeight = 528;
  return {
    x: Math.max(margin, Math.min(position.x, bounds.width - menuWidth - margin)),
    y: Math.max(margin, Math.min(position.y, bounds.height - menuHeight - margin)),
  };
}

const nodeMenuBlockedSelector = [
  ".react-flow__node-workflow",
  ".react-flow__node-free",
  ".react-flow__edge",
  ".react-flow__panel",
  ".canvas-layout-controls",
  ".canvas-zoom-controls",
  ".node-creation-menu",
  ".content-viewer",
  ".content-viewer-backdrop",
  ".floating-inspector",
  "button",
  "input",
  "textarea",
  "select",
  "video",
  "audio",
  "a",
].join(",");

export function shouldOpenNodeMenuFromTarget(target) {
  return Boolean(target && typeof target.closest === "function" && !target.closest(nodeMenuBlockedSelector));
}
