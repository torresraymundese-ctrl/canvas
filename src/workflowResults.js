const storyboardFallbackImages = [
  "/assets/world-rain-courtyard.png",
  "/assets/character-woman.png",
  "/assets/world-temple-night.png",
  "/assets/character-man.png",
];

function addAppliedJob(data, jobId) {
  if (!jobId) return data;
  return {
    ...data,
    appliedJobIds: [...new Set([...(data.appliedJobIds ?? []), jobId])],
  };
}

function updateNode(graph, nodeId, update) {
  return {
    ...graph,
    nodes: graph.nodes.map((node) => node.id === nodeId ? update(node) : node),
  };
}

export function getAppliedJobIds(graph) {
  return [...new Set(graph.nodes.flatMap((node) => node.data?.appliedJobIds ?? []))];
}

export function applyDirectorResult(graph, result, { jobId } = {}) {
  if (!result || (jobId && getAppliedJobIds(graph).includes(jobId))) return graph;

  const storySteps = [
    result.logline,
    ...result.shots.map((shot) => `${shot.id} ${shot.title}：${shot.action}`),
  ];
  const worldBody = [
    `整体风格：${result.visualBible.tone}`,
    `主色：${result.visualBible.palette.join("、")}`,
    "",
    "场景设定",
    ...result.visualBible.locations.map((location) => `${location.name}：${location.visual}`),
  ].join("\n");
  const characterBody = result.characters
    .map((character) => `${character.name}\n${character.visual}`)
    .join("\n\n");
  const shots = result.shots.map((shot, index) => ({
    ...shot,
    confirmed: false,
    name: `${shot.id} ${shot.title}`,
    note: `${shot.camera} · ${shot.durationSeconds} 秒`,
    image: storyboardFallbackImages[index % storyboardFallbackImages.length],
  }));

  let next = graph;
  next = updateNode(next, "story", (node) => ({
    ...node,
    data: addAppliedJob({
      ...node.data,
      status: "complete",
      directorResult: result,
      viewer: { mediaType: "timeline", title: result.title, eyebrow: "故事理解", steps: storySteps },
    }, jobId),
  }));
  next = updateNode(next, "world", (node) => ({
    ...node,
    data: addAppliedJob({
      ...node.data,
      status: "complete",
      directorResult: result,
      viewer: { mediaType: "document", title: "视觉设定", eyebrow: result.visualBible.tone, body: worldBody },
    }, jobId),
  }));
  next = updateNode(next, "characters", (node) => ({
    ...node,
    data: addAppliedJob({
      ...node.data,
      status: "complete",
      directorResult: result,
      viewer: { mediaType: "document", title: "角色设定", eyebrow: `${result.characters.length} 位角色`, body: characterBody },
    }, jobId),
  }));
  next = updateNode(next, "storyboard", (node) => ({
    ...node,
    data: addAppliedJob({
      ...node.data,
      status: "approval",
      subtitle: `已规划 ${shots.length} 个镜头`,
      directorResult: result,
      viewer: { mediaType: "storyboard", title: "分镜规划", eyebrow: result.title, shots },
    }, jobId),
  }));
  return next;
}

export function attachVideoResult(graph, job) {
  const videoUrl = job?.result?.videoUrl;
  const targetNodeId = job?.nodeId ?? "video";
  if (
    !job?.id
    || !videoUrl
    || !graph.nodes.some((node) => node.id === targetNodeId)
    || getAppliedJobIds(graph).includes(job.id)
  ) return graph;

  let next = updateNode(graph, "storyboard", (node) => ({
    ...node,
    data: addAppliedJob({
      ...node.data,
      viewer: node.data.viewer?.mediaType === "storyboard"
        ? {
            ...node.data.viewer,
            shots: node.data.viewer.shots.map((shot) => shot.id === job.input?.shotId ? { ...shot, videoUrl } : shot),
          }
        : node.data.viewer,
    }, job.id),
  }));
  next = updateNode(next, targetNodeId, (node) => ({
    ...node,
    data: addAppliedJob({
      ...node.data,
      status: "complete",
      subtitle: `${job.input?.shotId ?? "镜头"} · 已生成`,
      generatedVideos: { ...(node.data.generatedVideos ?? {}), [job.input?.shotId ?? job.id]: videoUrl },
      viewer: {
        mediaType: "video",
        title: `${job.input?.shotId ?? "镜头"} 视频`,
        eyebrow: job.modelId,
        src: videoUrl,
        poster: "/assets/world-temple-night.png",
      },
    }, job.id),
  }));
  return next;
}
