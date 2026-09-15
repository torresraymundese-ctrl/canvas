import assert from "node:assert/strict";
import test from "node:test";

import { createApiClient } from "../../src/apiClient.js";
import {
  getActiveJobs,
  getJobActionAvailability,
  getNodeJobStatus,
  resolveModelId,
  sortJobs,
} from "../../src/jobState.js";

const succeededOld = {
  id: "job_succeeded",
  nodeId: "video",
  status: "succeeded",
  updatedAt: "2026-08-05T10:00:00.000Z",
};
const runningNew = {
  id: "job_running",
  nodeId: "video",
  status: "running",
  updatedAt: "2026-08-05T10:03:00.000Z",
};
const queuedOld = {
  id: "job_queued",
  nodeId: "storyboard",
  status: "queued",
  updatedAt: "2026-08-05T10:01:00.000Z",
};

test("active jobs are ordered before terminal jobs", () => {
  assert.deepEqual(
    sortJobs([succeededOld, runningNew, queuedOld]).map((job) => job.id),
    [runningNew.id, queuedOld.id, succeededOld.id],
  );
});

test("active job filtering includes cancel requests", () => {
  const canceling = { ...runningNew, id: "job_canceling", status: "canceled_requested" };

  assert.deepEqual(
    getActiveJobs([succeededOld, canceling, queuedOld]).map((job) => job.id),
    [canceling.id, queuedOld.id],
  );
});

test("job actions match queue safety rules", () => {
  assert.deepEqual(getJobActionAvailability({ status: "queued" }), {
    canCancel: true,
    canRetry: false,
  });
  assert.deepEqual(getJobActionAvailability({ status: "failed" }), {
    canCancel: false,
    canRetry: true,
  });
  assert.deepEqual(getJobActionAvailability({ status: "succeeded" }), {
    canCancel: false,
    canRetry: false,
  });
});

test("the newest active node job drives its visible status", () => {
  assert.equal(getNodeJobStatus([succeededOld, queuedOld, runningNew], "video"), "running");
  assert.equal(getNodeJobStatus([succeededOld], "video"), "succeeded");
  assert.equal(getNodeJobStatus([], "video"), null);
});

test("API client unwraps successful response envelopes", async () => {
  const requests = [];
  const client = createApiClient(async (url, init) => {
    requests.push({ url, init });
    return Response.json({ data: { status: "ok" } });
  });

  assert.deepEqual(await client.getHealth(), { status: "ok" });
  assert.equal(requests[0].url, "/api/health");
});

test("API client preserves stable error codes", async () => {
  const client = createApiClient(async () => Response.json({
    error: { code: "JOB_NOT_RETRYABLE", message: "只有失败任务可以重试。" },
  }, { status: 409 }));

  await assert.rejects(
    () => client.retryJob("job_1"),
    (error) => error.code === "JOB_NOT_RETRYABLE"
      && error.status === 409
      && error.message === "只有失败任务可以重试。",
  );
});

test("API client encodes project filters", async () => {
  let requestedUrl;
  const client = createApiClient(async (url) => {
    requestedUrl = url;
    return Response.json({ data: [] });
  });

  await client.listJobs("spring god/episode 1");

  assert.equal(requestedUrl, "/api/jobs?projectId=spring+god%2Fepisode+1");
});

test("persisted canvas model labels resolve to the intended service model", () => {
  const models = [
    { role: "video", id: "doubao-seedance-2-0-mini-260615", label: "Seedance 2.0 Mini", selected: true },
    { role: "video", id: "doubao-seedance-2-0-260128", label: "Seedance 2.0", selected: false },
  ];

  assert.equal(resolveModelId(models, "video", "Seedance Mini"), "doubao-seedance-2-0-mini-260615");
  assert.equal(resolveModelId(models, "video", "Seedance 2.0 Pro"), "doubao-seedance-2-0-260128");
});
