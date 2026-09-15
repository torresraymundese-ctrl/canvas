import assert from "node:assert/strict";
import test from "node:test";

import {
  cancelJob,
  createIdempotencyKey,
  createJob,
  recoverJobs,
  retryJob,
  transitionJob,
} from "../../server/jobDomain.js";

const fixedNow = "2026-08-05T10:00:00.000Z";
const directorInput = {
  projectId: "spring-god-episode-1",
  nodeId: "storyboard",
  script: "第一场：雨夜古寺",
  shotCount: 2,
  modelId: "doubao-seed-2-0-pro-260215",
};

test("job transitions follow the allowed state machine", () => {
  const queued = createJob({ type: "director", input: directorInput }, { id: "job_1", now: fixedNow });
  const running = transitionJob(queued, "running", {}, fixedNow);
  const succeeded = transitionJob(running, "succeeded", { result: { shots: [] } }, fixedNow);

  assert.equal(succeeded.status, "succeeded");
  assert.equal(succeeded.progress, 100);
  assert.throws(
    () => transitionJob(succeeded, "running", {}, fixedNow),
    (error) => error.code === "JOB_TRANSITION_INVALID",
  );
});

test("idempotency ignores object key order", () => {
  const first = createIdempotencyKey("video", {
    prompt: "雨",
    duration: 5,
    modelId: "mini",
  });
  const second = createIdempotencyKey("video", {
    modelId: "mini",
    duration: 5,
    prompt: "雨",
  });

  assert.equal(first, second);
  assert.match(first, /^[a-f0-9]{64}$/);
});

test("idempotency changes with the selected model", () => {
  const mini = createIdempotencyKey("video", { prompt: "雨", modelId: "mini" });
  const full = createIdempotencyKey("video", { prompt: "雨", modelId: "full" });

  assert.notEqual(mini, full);
});

test("queued and running jobs use different cancel states", () => {
  const queued = createJob({ type: "director", input: directorInput }, { id: "job_1", now: fixedNow });
  const running = transitionJob(queued, "running", {}, fixedNow);

  assert.equal(cancelJob(queued, fixedNow).status, "canceled");
  assert.equal(cancelJob(running, fixedNow).status, "canceled_requested");
});

test("only failed jobs can be retried", () => {
  const queued = createJob({ type: "director", input: directorInput }, { id: "job_1", now: fixedNow });
  const failed = transitionJob(
    transitionJob(queued, "running", {}, fixedNow),
    "failed",
    { error: { code: "REMOTE_ERROR", message: "失败", retryable: true } },
    fixedNow,
  );
  const retried = retryJob(failed, fixedNow);

  assert.equal(retried.status, "queued");
  assert.equal(retried.attempt, 2);
  assert.equal(retried.error, null);
  assert.throws(() => retryJob(queued, fixedNow), (error) => error.code === "JOB_NOT_RETRYABLE");
});

test("restart recovery resumes remote video polling without resubmitting", () => {
  const videoInput = {
    projectId: "spring-god-episode-1",
    nodeId: "video",
    shotId: "S001",
    prompt: "雨夜古寺",
    duration: 5,
    ratio: "16:9",
    modelId: "doubao-seedance-2-0-mini-260615",
  };
  const queued = createJob({ type: "video", input: videoInput }, { id: "job_2", now: fixedNow });
  const running = transitionJob(queued, "running", { remoteTaskId: "remote_1" }, fixedNow);
  const [recovered] = recoverJobs([running], fixedNow);

  assert.equal(recovered.status, "queued");
  assert.equal(recovered.remoteTaskId, "remote_1");
  assert.equal(recovered.resumeRemote, true);
  assert.equal(recovered.recoveryCount, 1);
});

test("restart recovery never automatically repeats an uncertain paid request", () => {
  const runningDirector = transitionJob(
    createJob({ type: "director", input: directorInput }, { id: "job_director_interrupted", now: fixedNow }),
    "running",
    {},
    fixedNow,
  );
  const videoInput = {
    projectId: "spring-god-episode-1",
    nodeId: "video",
    shotId: "S001",
    prompt: "雨夜古寺",
    duration: 5,
    ratio: "16:9",
    modelId: "doubao-seedance-2-0-mini-260615",
  };
  const runningVideoWithoutRemoteId = transitionJob(
    createJob({ type: "video", input: videoInput }, { id: "job_video_interrupted", now: fixedNow }),
    "running",
    {},
    fixedNow,
  );
  const recovered = recoverJobs([runningDirector, runningVideoWithoutRemoteId], fixedNow);

  assert.deepEqual(recovered.map((job) => job.status), ["failed", "failed"]);
  assert.equal(recovered[0].error.code, "JOB_INTERRUPTED_UNCERTAIN");
  assert.equal(recovered[1].error.code, "JOB_INTERRUPTED_UNCERTAIN");
});

test("retry resumes an existing paid remote task when the failure is local", () => {
  const videoInput = {
    projectId: "spring-god-episode-1",
    nodeId: "video",
    shotId: "S001",
    prompt: "雨夜古寺",
    duration: 5,
    ratio: "16:9",
    modelId: "doubao-seedance-2-0-mini-260615",
  };
  const running = transitionJob(
    createJob({ type: "video", input: videoInput }, { id: "job_video_retry", now: fixedNow }),
    "running",
    { remoteTaskId: "remote_paid_1" },
    fixedNow,
  );
  const failed = transitionJob(running, "failed", {
    error: { code: "VIDEO_DOWNLOAD_FAILED", message: "download failed", retryable: true },
    resumeRemote: true,
  }, fixedNow);
  const retried = retryJob(failed, fixedNow);

  assert.equal(retried.remoteTaskId, "remote_paid_1");
  assert.equal(retried.resumeRemote, true);
});

test("restart recovery finalizes an interrupted cancellation", () => {
  const queued = createJob({ type: "director", input: directorInput }, { id: "job_1", now: fixedNow });
  const cancelRequested = cancelJob(transitionJob(queued, "running", {}, fixedNow), fixedNow);
  const [recovered] = recoverJobs([cancelRequested], fixedNow);

  assert.equal(recovered.status, "canceled");
});
