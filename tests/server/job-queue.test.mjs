import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createJob, transitionJob } from "../../server/jobDomain.js";
import { createJobQueue } from "../../server/jobQueue.js";
import { createJobStore } from "../../server/jobStore.js";
import { downloadVideo } from "../../server/downloadVideo.js";

const fixedNow = "2026-08-05T10:00:00.000Z";
const directorResult = {
  title: "春神遗骸",
  logline: "少女在春祭发现苏醒遗骸。",
  characters: [{ id: "character_1", name: "沈春", visual: "黑发青衣" }],
  visualBible: {
    tone: "东方悬疑",
    palette: ["冷青", "暗金"],
    locations: [{ id: "location_1", name: "古寺", visual: "雨夜石阶" }],
  },
  shots: [{
    id: "S001", title: "春祭开场", durationSeconds: 5,
    camera: "大全景缓慢推进", action: "人群穿过雨幕", dialogue: "",
    continuity: "主角青衣保持一致", prompt: "电影感雨夜古寺",
    negativePrompt: "文字，水印",
  }],
};
const directorInput = {
  projectId: "spring-god-episode-1",
  nodeId: "storyboard",
  script: "第一场：雨夜古寺",
  shotCount: 1,
  modelId: "doubao-seed-2-0-pro-260215",
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

async function createQueueFixture(t, overrides = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "director-job-queue-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const store = createJobStore({ filePath: path.join(directory, "jobs.json") });
  const providers = overrides.providers ?? {
    director: { executeDirector: async () => directorResult },
    video: {
      createVideoTask: async () => ({ remoteTaskId: "remote_1" }),
      getVideoTask: async () => ({
        status: "succeeded",
        progress: 100,
        videoUrl: "https://cdn.example.test/video.mp4",
        error: null,
      }),
    },
  };
  const queue = createJobQueue({
    config: { jobConcurrency: 1, outputDir: path.join(directory, "outputs") },
    store,
    providers,
    downloadVideo: overrides.downloadVideo ?? (async ({ jobId }) => `/outputs/${jobId}.mp4`),
    now: overrides.now ?? (() => fixedNow),
    sleep: overrides.sleep ?? (async () => {}),
    maxVideoWaitMs: overrides.maxVideoWaitMs ?? 20 * 60 * 1000,
  });
  await queue.initialize();
  t.after(() => queue.close());
  return { queue, store, directory, providers };
}

test("duplicate active submissions return the same job", async (t) => {
  let release;
  const blocker = new Promise((resolve) => { release = resolve; });
  const { queue } = await createQueueFixture(t, {
    providers: {
      director: { executeDirector: async () => { await blocker; return directorResult; } },
      video: {},
    },
  });

  const first = await queue.submitDirector(directorInput);
  const second = await queue.submitDirector(directorInput);

  assert.equal(second.id, first.id);
  release();
  await queue.waitForIdle();
});

test("a failed durable save never leaves a hidden billable job in memory", async (t) => {
  let providerCalls = 0;
  const queue = createJobQueue({
    config: { jobConcurrency: 1, outputDir: "unused" },
    store: {
      load: async () => [],
      save: async () => { throw new Error("disk unavailable"); },
    },
    providers: {
      director: { executeDirector: async () => { providerCalls += 1; return directorResult; } },
      video: {},
    },
    downloadVideo: async () => "unused",
  });
  await queue.initialize();
  t.after(() => queue.close());

  await assert.rejects(() => queue.submitDirector(directorInput), (error) => error.code === "JOB_STORE_UNAVAILABLE");
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(queue.list().length, 0);
  assert.equal(providerCalls, 0);
});

test("a failed running transition stops before calling the provider", async (t) => {
  let saves = 0;
  let providerCalls = 0;
  const stored = [];
  const queue = createJobQueue({
    config: { jobConcurrency: 1, outputDir: "unused" },
    store: {
      load: async () => stored,
      save: async (jobs) => {
        saves += 1;
        if (saves === 2) throw new Error("disk unavailable");
        stored.splice(0, stored.length, ...structuredClone(jobs));
      },
    },
    providers: {
      director: { executeDirector: async () => { providerCalls += 1; return directorResult; } },
      video: {},
    },
    downloadVideo: async () => "unused",
  });
  await queue.initialize();
  t.after(() => queue.close());

  const submitted = await queue.submitDirector(directorInput);
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(queue.get(submitted.id).status, "queued");
  assert.equal(providerCalls, 0);
});

test("a failed retry save keeps the original failed job unchanged", async (t) => {
  const failed = transitionJob(
    transitionJob(createJob({ type: "director", input: directorInput }, { id: "job_failed_save", now: fixedNow }), "running", {}, fixedNow),
    "failed",
    { error: { code: "FAILED", message: "failed", retryable: true } },
    fixedNow,
  );
  const queue = createJobQueue({
    config: { jobConcurrency: 1, outputDir: "unused" },
    store: { load: async () => [failed], save: async () => { throw new Error("disk unavailable"); } },
    providers: { director: {}, video: {} },
    downloadVideo: async () => "unused",
  });
  await queue.initialize();
  t.after(() => queue.close());

  await assert.rejects(() => queue.retry(failed.id), (error) => error.code === "JOB_STORE_UNAVAILABLE");
  assert.equal(queue.get(failed.id).status, "failed");
  assert.equal(queue.get(failed.id).attempt, 1);
});

test("the queue runs only one provider operation at a time", async (t) => {
  let active = 0;
  let maximum = 0;
  const { queue } = await createQueueFixture(t, {
    providers: {
      director: {
        executeDirector: async () => {
          active += 1;
          maximum = Math.max(maximum, active);
          await new Promise((resolve) => setImmediate(resolve));
          active -= 1;
          return directorResult;
        },
      },
      video: {},
    },
  });

  await Promise.all([
    queue.submitDirector(directorInput),
    queue.submitDirector({ ...directorInput, nodeId: "story", script: "第二场" }),
  ]);
  await queue.waitForIdle();

  assert.equal(maximum, 1);
  assert.equal(queue.list().filter((job) => job.status === "succeeded").length, 2);
});

test("a succeeded remote video is attached as a local output", async (t) => {
  const { queue } = await createQueueFixture(t);
  const submitted = await queue.submitVideo(videoInput);
  await queue.waitForIdle();

  const completed = queue.get(submitted.id);
  assert.equal(completed.status, "succeeded");
  assert.equal(completed.result.videoUrl, `/outputs/${submitted.id}.mp4`);
});

test("a queued job can be canceled before provider execution", async (t) => {
  let release;
  const blocker = new Promise((resolve) => { release = resolve; });
  const { queue } = await createQueueFixture(t, {
    providers: {
      director: { executeDirector: async () => { await blocker; return directorResult; } },
      video: {},
    },
  });
  await queue.submitDirector(directorInput);
  const second = await queue.submitDirector({ ...directorInput, nodeId: "story", script: "第二场" });

  const canceled = await queue.cancel(second.id);

  assert.equal(canceled.status, "canceled");
  release();
  await queue.waitForIdle();
});

test("restart recovery polls an existing remote task without creating another", async (t) => {
  let creates = 0;
  let gets = 0;
  const { queue, store, directory, providers } = await createQueueFixture(t, {
    providers: {
      director: {},
      video: {
        createVideoTask: async () => { creates += 1; return { remoteTaskId: "remote_new" }; },
        getVideoTask: async () => {
          gets += 1;
          return { status: "succeeded", progress: 100, videoUrl: "/assets/seedance-demo.mp4", error: null };
        },
      },
    },
  });
  queue.close();
  const running = transitionJob(
    createJob({ type: "video", input: videoInput }, { id: "job_recovered", now: fixedNow }),
    "running",
    { remoteTaskId: "remote_existing" },
    fixedNow,
  );
  await store.save([running]);

  const recoveredQueue = createJobQueue({
    config: { jobConcurrency: 1, outputDir: path.join(directory, "outputs") },
    store,
    providers,
    downloadVideo: async ({ videoUrl }) => videoUrl,
    now: () => fixedNow,
    sleep: async () => {},
  });
  await recoveredQueue.initialize();
  await recoveredQueue.waitForIdle();
  t.after(() => recoveredQueue.close());

  assert.equal(creates, 0);
  assert.equal(gets, 1);
  assert.equal(recoveredQueue.get("job_recovered").status, "succeeded");
});

test("a video that never completes reaches a timeout failure", async (t) => {
  let time = 0;
  const { queue } = await createQueueFixture(t, {
    providers: {
      director: {},
      video: {
        createVideoTask: async () => ({ remoteTaskId: "remote_1" }),
        getVideoTask: async () => ({ status: "running", progress: 50, videoUrl: null, error: null }),
      },
    },
    now: () => new Date(time).toISOString(),
    sleep: async (milliseconds) => { time += milliseconds; },
    maxVideoWaitMs: 20,
  });
  const submitted = await queue.submitVideo(videoInput);
  await queue.waitForIdle();

  assert.equal(queue.get(submitted.id).status, "failed");
  assert.equal(queue.get(submitted.id).error.code, "REMOTE_TIMEOUT");
});

test("video downloader rejects non-HTTPS and non-video responses", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "director-download-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));

  await assert.rejects(
    () => downloadVideo({ url: "http://example.test/video.mp4", jobId: "job_1", outputDir: directory }),
    (error) => error.code === "VIDEO_DOWNLOAD_URL_INVALID",
  );
  await assert.rejects(
    () => downloadVideo({
      url: "https://example.test/not-video",
      jobId: "job_1",
      outputDir: directory,
      fetch: async () => new Response("hello", { headers: { "content-type": "text/plain" } }),
    }),
    (error) => error.code === "VIDEO_DOWNLOAD_TYPE_INVALID",
  );
});

test("video downloader streams an MP4 to the exact job path", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "director-download-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const bytes = new Uint8Array([0, 1, 2, 3, 4]);

  const localUrl = await downloadVideo({
    url: "https://example.test/video.mp4",
    jobId: "job_safe_1",
    outputDir: directory,
    fetch: async () => new Response(bytes, {
      headers: { "content-type": "video/mp4", "content-length": String(bytes.byteLength) },
    }),
    maxBytes: 10,
  });

  assert.equal(localUrl, "/outputs/job_safe_1.mp4");
  assert.deepEqual(new Uint8Array(await fs.readFile(path.join(directory, "job_safe_1.mp4"))), bytes);
});

test("video downloader stops when a stream exceeds the byte limit", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "director-download-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));

  await assert.rejects(
    () => downloadVideo({
      url: "https://example.test/video.mp4",
      jobId: "job_safe_1",
      outputDir: directory,
      fetch: async () => new Response(new Uint8Array([0, 1, 2, 3, 4]), {
        headers: { "content-type": "video/mp4" },
      }),
      maxBytes: 4,
    }),
    (error) => error.code === "VIDEO_DOWNLOAD_TOO_LARGE",
  );
  await assert.rejects(() => fs.access(path.join(directory, "job_safe_1.mp4")));
});

test("video downloader timeout covers the response body stream", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "director-download-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));

  await assert.rejects(
    () => downloadVideo({
      url: "https://example.test/slow-video.mp4",
      jobId: "job_slow_1",
      outputDir: directory,
      timeoutMs: 5,
      fetch: async (_url, { signal }) => new Response(new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array([0, 1]));
          const finish = setTimeout(() => controller.close(), 40);
          signal.addEventListener("abort", () => {
            clearTimeout(finish);
            controller.error(new DOMException("aborted", "AbortError"));
          });
        },
      }), { headers: { "content-type": "video/mp4" } }),
    }),
    (error) => error.code === "VIDEO_DOWNLOAD_FAILED" && /超时/.test(error.message),
  );
  await assert.rejects(() => fs.access(path.join(directory, "job_slow_1.mp4")));
});
