import assert from "node:assert/strict";
import test from "node:test";

import {
  applyDirectorResult,
  attachVideoResult,
  getAppliedJobIds,
} from "../../src/workflowResults.js";
import { workflowEdges, workflowNodes } from "../../src/workflowData.js";

const directorResult = {
  title: "春神遗骸",
  logline: "修复师在雨夜古庙发现一段被掩埋的神祇往事。",
  characters: [
    { id: "character_1", name: "林晚", visual: "黑发青衣，神情冷静" },
    { id: "character_2", name: "沈砚", visual: "深色长衫，手持旧伞" },
  ],
  visualBible: {
    tone: "东方悬疑",
    palette: ["冷青", "暗金"],
    locations: [{ id: "location_1", name: "春神古庙", visual: "雨幕、残灯与石阶" }],
  },
  shots: [
    {
      id: "S001",
      title: "雨夜入庙",
      durationSeconds: 5,
      camera: "大全景缓慢推进",
      action: "林晚走入古庙",
      dialogue: "",
      continuity: "青衣与雨夜保持一致",
      prompt: "东方悬疑短剧，雨夜古庙，电影级光影",
      negativePrompt: "文字，水印",
    },
  ],
};

function createGraph() {
  return { nodes: structuredClone(workflowNodes), edges: structuredClone(workflowEdges) };
}

test("director results populate all viewable workflow stages", () => {
  const graph = createGraph();
  const next = applyDirectorResult(graph, directorResult, { jobId: "job_director_1" });

  assert.notEqual(next, graph);
  assert.equal(next.nodes.find((node) => node.id === "story").data.viewer.steps[0], directorResult.logline);
  assert.match(next.nodes.find((node) => node.id === "world").data.viewer.body, /东方悬疑/);
  assert.match(next.nodes.find((node) => node.id === "characters").data.viewer.body, /林晚/);
  assert.equal(next.nodes.find((node) => node.id === "storyboard").data.viewer.shots[0].prompt, directorResult.shots[0].prompt);
  assert.equal(next.nodes.find((node) => node.id === "storyboard").data.subtitle, "已规划 1 个镜头");
  assert.equal(next.nodes.find((node) => node.id === "storyboard").data.viewer.shots[0].confirmed, false);
  assert.deepEqual(getAppliedJobIds(next), ["job_director_1"]);
});

test("applying the same director job twice is idempotent", () => {
  const once = applyDirectorResult(createGraph(), directorResult, { jobId: "job_director_1" });
  assert.equal(applyDirectorResult(once, directorResult, { jobId: "job_director_1" }), once);
});

test("video results attach to the matching shot and playable video node", () => {
  const directed = applyDirectorResult(createGraph(), directorResult, { jobId: "job_director_1" });
  const job = {
    id: "job_video_1",
    type: "video",
    input: { shotId: "S001" },
    result: { videoUrl: "/outputs/job_video_1.mp4" },
  };
  const next = attachVideoResult(directed, job);

  const shot = next.nodes.find((node) => node.id === "storyboard").data.viewer.shots[0];
  const video = next.nodes.find((node) => node.id === "video");
  assert.equal(shot.videoUrl, "/outputs/job_video_1.mp4");
  assert.equal(video.data.viewer.mediaType, "video");
  assert.equal(video.data.viewer.src, "/outputs/job_video_1.mp4");
  assert.deepEqual(getAppliedJobIds(next).sort(), ["job_director_1", "job_video_1"]);
});

test("a video job without a local result does not alter the graph", () => {
  const graph = createGraph();
  assert.equal(attachVideoResult(graph, { id: "job_video_1", input: { shotId: "S001" }, result: null }), graph);
});

test("a result targeting an unknown node never mutates the graph", () => {
  const graph = createGraph();
  const job = {
    id: "job_video_unknown",
    nodeId: "deleted-video-node",
    input: { shotId: "S001" },
    result: { videoUrl: "/outputs/job_video_unknown.mp4" },
  };

  assert.equal(attachVideoResult(graph, job), graph);
});
