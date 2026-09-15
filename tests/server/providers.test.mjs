import assert from "node:assert/strict";
import test from "node:test";

import { loadConfig } from "../../server/config.js";
import { createArkDirector } from "../../server/providers/arkDirector.js";
import { createArkVideo } from "../../server/providers/arkVideo.js";
import { createMockProvider } from "../../server/providers/mockProvider.js";
import { createProviderRegistry } from "../../server/providers/registry.js";
import { withRetry } from "../../server/providers/retry.js";

const liveConfig = loadConfig({
  MODEL_EXECUTION_MODE: "live",
  ARK_API_KEY: "test-key-not-real",
}, "C:\\director-canvas");

const directorInput = {
  projectId: "spring-god-episode-1",
  nodeId: "storyboard",
  script: "第一场：雨夜古寺",
  shotCount: 1,
  modelId: "doubao-seed-2-0-pro-260215",
};

const validDirectorResult = {
  title: "春神遗骸",
  logline: "少女在春祭发现苏醒遗骸。",
  characters: [{ id: "character_1", name: "沈春", visual: "黑发青衣" }],
  visualBible: {
    tone: "东方悬疑",
    palette: ["冷青", "暗金"],
    locations: [{ id: "location_1", name: "古寺", visual: "雨夜石阶" }],
  },
  shots: [{
    id: "S001",
    title: "春祭开场",
    durationSeconds: 5,
    camera: "大全景缓慢推进",
    action: "人群穿过雨幕",
    dialogue: "",
    continuity: "主角青衣保持一致",
    prompt: "电影感雨夜古寺",
    negativePrompt: "文字，水印",
  }],
};

const videoInput = {
  projectId: "spring-god-episode-1",
  nodeId: "video",
  shotId: "S001",
  prompt: "雨夜古寺，镜头缓慢推进",
  modelId: "doubao-seedance-2-0-mini-260615",
  ratio: "16:9",
  duration: 5,
  generateAudio: true,
  referenceImages: [],
};

test("retry handles rate limits and server errors", async () => {
  let calls = 0;
  const result = await withRetry(async () => {
    calls += 1;
    if (calls === 1) throw Object.assign(new Error("limited"), { status: 429 });
    if (calls === 2) throw Object.assign(new Error("server"), { status: 503 });
    return "ok";
  }, { sleep: async () => {}, random: () => 0, maxAttempts: 3 });

  assert.equal(result, "ok");
  assert.equal(calls, 3);
});

test("retry does not repeat authentication failures", async () => {
  let calls = 0;

  await assert.rejects(
    () => withRetry(async () => {
      calls += 1;
      throw Object.assign(new Error("unauthorized"), { status: 401 });
    }, { sleep: async () => {}, random: () => 0, maxAttempts: 3 }),
    (error) => error.status === 401,
  );
  assert.equal(calls, 1);
});

test("Ark director sends the configured model and parses the output", async () => {
  const requests = [];
  const adapter = createArkDirector({
    config: liveConfig,
    fetch: async (url, init) => {
      requests.push({ url, init, body: JSON.parse(init.body) });
      return Response.json({
        id: "resp_1",
        status: "completed",
        output: [{
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text: JSON.stringify(validDirectorResult) }],
        }],
      });
    },
    sleep: async () => {},
  });

  const result = await adapter.executeDirector(directorInput, { expectedShotCount: 1 });

  assert.equal(result.shots.length, 1);
  assert.equal(requests[0].url, `${liveConfig.baseUrl}/responses`);
  assert.equal(requests[0].body.model, "doubao-seed-2-0-pro-260215");
  assert.equal(requests[0].init.headers.Authorization, "Bearer test-key-not-real");
  assert.equal(requests[0].body.input.at(-1).content, directorInput.script);
});

test("Ark video creates a Seedance task with safe generation parameters", async () => {
  const requests = [];
  const adapter = createArkVideo({
    config: liveConfig,
    fetch: async (url, init) => {
      requests.push({ url, init, body: JSON.parse(init.body) });
      return Response.json({ id: "remote_1" });
    },
    sleep: async () => {},
  });

  const result = await adapter.createVideoTask(videoInput);

  assert.deepEqual(result, { remoteTaskId: "remote_1" });
  assert.equal(requests[0].url, `${liveConfig.baseUrl}/contents/generations/tasks`);
  assert.equal(requests[0].body.model, "doubao-seedance-2-0-mini-260615");
  assert.deepEqual(requests[0].body.content, [{
    type: "text",
    text: `${videoInput.prompt}，生成与画面同步的对白、环境音和音效 --ratio 16:9 --dur 5`,
  }]);
  assert.equal("ratio" in requests[0].body, false);
  assert.equal("duration" in requests[0].body, false);
  assert.equal("generate_audio" in requests[0].body, false);
});

test("Ark video encodes a silent-video preference in supported prompt content", async () => {
  let body;
  const adapter = createArkVideo({
    config: liveConfig,
    fetch: async (_url, init) => {
      body = JSON.parse(init.body);
      return Response.json({ id: "remote_silent" });
    },
    sleep: async () => {},
  });

  await adapter.createVideoTask({ ...videoInput, generateAudio: false });

  assert.equal(body.content[0].text, `${videoInput.prompt}，无声视频，不生成对白、环境音或音乐 --ratio 16:9 --dur 5`);
});

test("Ark requests abort instead of hanging indefinitely", async () => {
  const hangingFetch = async (_url, init) => new Promise((resolve, reject) => {
    const fallback = setTimeout(() => reject(new Error("fixture did not receive an abort signal")), 30);
    init.signal?.addEventListener("abort", () => {
      clearTimeout(fallback);
      reject(new DOMException("aborted", "AbortError"));
    });
  });
  const director = createArkDirector({
    config: liveConfig,
    fetch: hangingFetch,
    sleep: async () => {},
    requestTimeoutMs: 5,
    retryAttempts: 1,
  });
  const video = createArkVideo({
    config: liveConfig,
    fetch: hangingFetch,
    sleep: async () => {},
    requestTimeoutMs: 5,
    retryAttempts: 1,
  });

  await assert.rejects(() => director.executeDirector(directorInput, { expectedShotCount: 1 }), (error) => error.code === "ARK_REQUEST_TIMEOUT");
  await assert.rejects(() => video.createVideoTask(videoInput), (error) => error.code === "ARK_REQUEST_TIMEOUT");
});

test("Ark video maps succeeded task output", async () => {
  const adapter = createArkVideo({
    config: liveConfig,
    fetch: async () => Response.json({
      id: "remote_1",
      status: "succeeded",
      content: { video_url: "https://cdn.example.test/video.mp4" },
    }),
    sleep: async () => {},
  });

  assert.deepEqual(await adapter.getVideoTask("remote_1"), {
    status: "succeeded",
    progress: 100,
    videoUrl: "https://cdn.example.test/video.mp4",
    error: null,
  });
});

test("Ark video maps provider failure without exposing headers", async () => {
  const adapter = createArkVideo({
    config: liveConfig,
    fetch: async () => Response.json({
      id: "remote_1",
      status: "failed",
      error: { code: "ContentPolicy", message: "内容审核未通过" },
    }),
    sleep: async () => {},
  });

  const result = await adapter.getVideoTask("remote_1");

  assert.equal(result.status, "failed");
  assert.equal(result.error.code, "ContentPolicy");
  assert.equal(JSON.stringify(result).includes("test-key-not-real"), false);
});

test("Ark video maps canceled and unknown states without polling forever", async () => {
  const canceled = createArkVideo({
    config: liveConfig,
    fetch: async () => Response.json({ status: "cancelled" }),
    sleep: async () => {},
  });
  const unknown = createArkVideo({
    config: liveConfig,
    fetch: async () => Response.json({ status: "expired" }),
    sleep: async () => {},
  });

  assert.equal((await canceled.getVideoTask("remote_1")).status, "canceled");
  const unknownResult = await unknown.getVideoTask("remote_2");
  assert.equal(unknownResult.status, "failed");
  assert.equal(unknownResult.error.code, "ARK_VIDEO_STATUS_UNKNOWN");
});

test("mock provider returns deterministic director and video results", async () => {
  const provider = createMockProvider();
  const director = await provider.executeDirector(directorInput, { expectedShotCount: 1 });
  const { remoteTaskId } = await provider.createVideoTask(videoInput);
  const running = await provider.getVideoTask(remoteTaskId);
  const succeeded = await provider.getVideoTask(remoteTaskId);

  assert.equal(director.shots.length, 1);
  assert.equal(director.shots[0].id, "S001");
  assert.equal(running.status, "running");
  assert.equal(succeeded.status, "succeeded");
  assert.equal(succeeded.videoUrl, "/assets/seedance-demo.mp4");
});

test("provider registry selects mock adapters by default", () => {
  const registry = createProviderRegistry(loadConfig({}, "C:\\director-canvas"));

  assert.equal(registry.mode, "mock");
  assert.equal(typeof registry.director.executeDirector, "function");
  assert.equal(typeof registry.video.createVideoTask, "function");
});
