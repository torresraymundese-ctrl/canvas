import assert from "node:assert/strict";
import test from "node:test";

import { createApiHandler } from "../../server/apiRouter.js";
import { loadConfig } from "../../server/config.js";
import { listModels } from "../../server/modelCatalog.js";

const config = loadConfig({ ARK_API_KEY: "test-secret-not-real" }, "C:\\director-canvas");
const directorBody = {
  projectId: "spring-god-episode-1",
  nodeId: "storyboard",
  script: "第一场：雨夜古寺",
  shotCount: 2,
};
const videoBody = {
  projectId: "spring-god-episode-1",
  nodeId: "video",
  shotId: "S001",
  prompt: "雨夜古寺",
  ratio: "16:9",
  duration: 5,
};

function createQueue(overrides = {}) {
  return {
    list: () => [{ id: "job_1", projectId: "spring-god-episode-1", status: "queued" }],
    get: (id) => id === "job_1" ? { id, status: "queued" } : null,
    submitDirector: async (input) => ({ id: "job_director", type: "director", status: "queued", input }),
    submitVideo: async (input) => ({ id: "job_video", type: "video", status: "queued", input }),
    retry: async (id) => ({ id, status: "queued", attempt: 2 }),
    cancel: async (id) => ({ id, status: "canceled" }),
    ...overrides,
  };
}

function jsonRequest(pathname, body) {
  return new Request(`http://127.0.0.1${pathname}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("health exposes mode and credential state without the API key", async () => {
  const handler = createApiHandler({ config, queue: createQueue(), models: listModels(config) });
  const response = await handler(new Request("http://127.0.0.1/api/health"));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.data.executionMode, "mock");
  assert.equal(body.data.credentialsConfigured, true);
  assert.equal(JSON.stringify(body).includes("test-secret-not-real"), false);
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("models endpoint returns safe selectable metadata", async () => {
  const handler = createApiHandler({ config, queue: createQueue(), models: listModels(config) });
  const response = await handler(new Request("http://127.0.0.1/api/models"));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.data.some((model) => model.id === "doubao-seedance-2-0-mini-260615"), true);
});

test("director and video submissions return accepted jobs", async () => {
  const handler = createApiHandler({ config, queue: createQueue(), models: listModels(config) });
  const directorResponse = await handler(jsonRequest("/api/jobs/director", directorBody));
  const videoResponse = await handler(jsonRequest("/api/jobs/video", videoBody));

  assert.equal(directorResponse.status, 202);
  assert.equal((await directorResponse.json()).data.input.modelId, "doubao-seed-2-0-pro-260215");
  assert.equal(videoResponse.status, 202);
  assert.equal((await videoResponse.json()).data.input.modelId, "doubao-seedance-2-0-mini-260615");
});

test("job list, detail, retry, and cancel use stable routes", async () => {
  const handler = createApiHandler({ config, queue: createQueue(), models: listModels(config) });
  const list = await handler(new Request("http://127.0.0.1/api/jobs?projectId=spring-god-episode-1"));
  const detail = await handler(new Request("http://127.0.0.1/api/jobs/job_1"));
  const retry = await handler(jsonRequest("/api/jobs/job_1/retry", {}));
  const cancel = await handler(jsonRequest("/api/jobs/job_1/cancel", {}));

  assert.equal((await list.json()).data.length, 1);
  assert.equal((await detail.json()).data.id, "job_1");
  assert.equal((await retry.json()).data.attempt, 2);
  assert.equal((await cancel.json()).data.status, "canceled");
});

test("job list summaries never repeat full scripts or remote signed URLs", async () => {
  const job = {
    id: "job_1",
    type: "director",
    projectId: "spring-god-episode-1",
    nodeId: "storyboard",
    status: "succeeded",
    modelId: "doubao-seed-2-0-pro-260215",
    input: { script: "very large private script", shotCount: 2 },
    result: { shots: [], remoteVideoUrl: "https://signed.example/secret" },
  };
  const handler = createApiHandler({
    config,
    queue: createQueue({ list: () => [job] }),
    models: listModels(config),
  });
  const response = await handler(new Request("http://127.0.0.1/api/jobs?projectId=spring-god-episode-1"));
  const [summary] = (await response.json()).data;

  assert.equal(summary.input.script, undefined);
  assert.equal(summary.input.shotCount, 2);
  assert.equal(summary.result.remoteVideoUrl, undefined);
});

test("invalid JSON and oversized bodies return stable errors", async () => {
  const handler = createApiHandler({ config, queue: createQueue(), models: listModels(config) });
  const invalid = await handler(new Request("http://127.0.0.1/api/jobs/director", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{broken",
  }));
  const oversized = await handler(new Request("http://127.0.0.1/api/jobs/director", {
    method: "POST",
    headers: { "content-type": "application/json", "content-length": String(2 * 1024 * 1024 + 1) },
    body: "{}",
  }));

  assert.equal(invalid.status, 400);
  assert.equal((await invalid.json()).error.code, "REQUEST_JSON_INVALID");
  assert.equal(oversized.status, 413);
  assert.equal((await oversized.json()).error.code, "REQUEST_BODY_TOO_LARGE");
});

test("chunked oversized bodies are stopped before the full stream is buffered", async () => {
  const handler = createApiHandler({ config, queue: createQueue(), models: listModels(config) });
  let pulls = 0;
  const chunk = new TextEncoder().encode("x".repeat(512 * 1024));
  const request = new Request("http://127.0.0.1/api/jobs/director", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: new ReadableStream({
      pull(controller) {
        pulls += 1;
        if (pulls <= 10) controller.enqueue(chunk);
        else controller.close();
      },
    }),
    duplex: "half",
  });

  const response = await handler(request);

  assert.equal(response.status, 413);
  assert.equal((await response.json()).error.code, "REQUEST_BODY_TOO_LARGE");
  assert.ok(pulls <= 5, `expected early stream cancellation, received ${pulls} chunks`);
});

test("unknown and unsafe job ids return not found", async () => {
  const handler = createApiHandler({ config, queue: createQueue(), models: listModels(config) });
  const missing = await handler(new Request("http://127.0.0.1/api/jobs/job_missing"));
  const unsafe = await handler(new Request("http://127.0.0.1/api/jobs/..%2F.env"));

  assert.equal(missing.status, 404);
  assert.equal(unsafe.status, 404);
});

test("unexpected failures never echo secret-bearing error messages", async () => {
  const handler = createApiHandler({
    config,
    queue: createQueue({ list: () => { throw new Error("Bearer test-secret-not-real"); } }),
    models: listModels(config),
  });
  const response = await handler(new Request("http://127.0.0.1/api/jobs"));
  const body = await response.json();

  assert.equal(response.status, 500);
  assert.equal(body.error.code, "INTERNAL_ERROR");
  assert.equal(JSON.stringify(body).includes("test-secret-not-real"), false);
});
