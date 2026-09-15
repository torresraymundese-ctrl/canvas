import { createHash, randomUUID } from "node:crypto";

import { AppError } from "./errors.js";

const ALLOWED_TRANSITIONS = {
  queued: new Set(["running", "canceled"]),
  running: new Set(["succeeded", "failed", "canceled_requested"]),
  canceled_requested: new Set(["canceled"]),
  failed: new Set(["queued"]),
  succeeded: new Set(),
  canceled: new Set(),
};

function canonicalize(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function createIdempotencyKey(type, input) {
  return createHash("sha256").update(canonicalize({ type, input })).digest("hex");
}

export function createJob({ type, input, provider = "volcengine-ark" }, { id, now } = {}) {
  if (!['director', 'video'].includes(type)) {
    throw new AppError("JOB_TYPE_INVALID", "任务类型不受支持。", 400);
  }
  const timestamp = now ?? new Date().toISOString();
  return {
    id: id ?? `job_${randomUUID().replaceAll("-", "")}`,
    type,
    status: "queued",
    provider,
    modelId: input.modelId,
    nodeId: input.nodeId,
    projectId: input.projectId,
    idempotencyKey: createIdempotencyKey(type, input),
    attempt: 1,
    recoveryCount: 0,
    resumeRemote: false,
    createdAt: timestamp,
    updatedAt: timestamp,
    input,
    remoteTaskId: null,
    progress: 0,
    result: null,
    error: null,
  };
}

export function transitionJob(job, nextStatus, patch = {}, now = new Date().toISOString()) {
  if (!ALLOWED_TRANSITIONS[job.status]?.has(nextStatus)) {
    throw new AppError(
      "JOB_TRANSITION_INVALID",
      `任务不能从 ${job.status} 变为 ${nextStatus}。`,
      409,
      { currentStatus: job.status, nextStatus },
    );
  }
  return {
    ...job,
    ...patch,
    status: nextStatus,
    progress: nextStatus === "succeeded" ? 100 : (patch.progress ?? job.progress),
    updatedAt: now,
  };
}

export function cancelJob(job, now = new Date().toISOString()) {
  if (job.status === "queued") return transitionJob(job, "canceled", {}, now);
  if (job.status === "running") return transitionJob(job, "canceled_requested", {}, now);
  if (job.status === "canceled_requested") return job;
  throw new AppError("JOB_NOT_CANCELABLE", "当前任务状态无法取消。", 409, { status: job.status });
}

export function retryJob(job, now = new Date().toISOString()) {
  if (job.status !== "failed") {
    throw new AppError("JOB_NOT_RETRYABLE", "只有失败任务可以重试。", 409, { status: job.status });
  }
  const resumeRemote = job.type === "video" && Boolean(job.remoteTaskId) && job.resumeRemote === true;
  return transitionJob(job, "queued", {
    attempt: job.attempt + 1,
    error: null,
    result: null,
    remoteTaskId: resumeRemote ? job.remoteTaskId : null,
    progress: 0,
    resumeRemote,
  }, now);
}

export function recoverJobs(jobs, now = new Date().toISOString()) {
  return jobs.map((job) => {
    if (job.status === "running") {
      if (job.type !== "video" || !job.remoteTaskId) {
        return {
          ...job,
          status: "failed",
          updatedAt: now,
          recoveryCount: (job.recoveryCount ?? 0) + 1,
          resumeRemote: false,
          error: {
            code: "JOB_INTERRUPTED_UNCERTAIN",
            message: "任务在本地服务中断时状态不确定，为避免重复计费，未自动重新提交。请确认后手动重试。",
            retryable: true,
          },
        };
      }
      return {
        ...job,
        status: "queued",
        updatedAt: now,
        recoveryCount: (job.recoveryCount ?? 0) + 1,
        resumeRemote: job.type === "video" && Boolean(job.remoteTaskId),
      };
    }
    if (job.status === "canceled_requested") {
      return transitionJob(job, "canceled", {}, now);
    }
    return job;
  });
}
