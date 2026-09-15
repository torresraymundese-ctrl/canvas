import { AppError } from "./errors.js";
import {
  cancelJob,
  createJob,
  recoverJobs,
  retryJob as resetFailedJob,
  transitionJob,
} from "./jobDomain.js";

const ACTIVE_STATUSES = new Set(["queued", "running", "canceled_requested"]);

function normalizeExecutionError(error) {
  return {
    code: error?.code || "JOB_EXECUTION_FAILED",
    message: error?.message || "任务执行失败。",
    retryable: error?.status === undefined || error.status === 429 || error.status >= 500,
  };
}

function storeUnavailable() {
  return new AppError(
    "JOB_STORE_UNAVAILABLE",
    "本地任务记录无法安全写入，任务队列已停止，以避免产生未记录的模型费用。",
    503,
  );
}

export function createJobQueue({
  config,
  store,
  providers,
  downloadVideo,
  now = () => new Date().toISOString(),
  sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  maxVideoWaitMs = 20 * 60 * 1000,
}) {
  let jobs = [];
  let initialized = false;
  let closed = false;
  let storageError = null;
  let activeCount = 0;
  let pumpScheduled = false;
  let mutationChain = Promise.resolve();
  const claimedJobs = new Set();
  const idleResolvers = new Set();

  const snapshot = (source = jobs) => source.map((job) => structuredClone(job));
  const findIndex = (id) => jobs.findIndex((job) => job.id === id);
  const current = (id) => jobs[findIndex(id)] ?? null;
  const hasQueued = () => jobs.some((job) => job.status === "queued");

  const publishAfterSave = async (nextJobs) => {
    try {
      await store.save(snapshot(nextJobs));
    } catch (error) {
      storageError = error;
      throw storeUnavailable();
    }
    jobs = nextJobs;
    return nextJobs;
  };

  const mutate = (operation) => {
    const pending = mutationChain.then(async () => {
      if (storageError) throw storeUnavailable();
      return operation();
    });
    mutationChain = pending.catch(() => {});
    return pending;
  };

  const replaceAndPersist = (jobId, updater) => mutate(async () => {
    const index = findIndex(jobId);
    if (index === -1) throw new AppError("JOB_NOT_FOUND", "任务不存在。", 404);
    const previous = jobs[index];
    const nextJob = updater(previous);
    if (nextJob === previous) return structuredClone(previous);
    await publishAfterSave(jobs.with(index, nextJob));
    return structuredClone(nextJob);
  });

  const notifyIdle = () => {
    if (activeCount !== 0) return;
    if (hasQueued() && !storageError && !closed) return;
    for (const resolve of idleResolvers) resolve();
    idleResolvers.clear();
  };

  const finalizeCancellation = async (jobId) => {
    const job = await replaceAndPersist(jobId, (latest) => (
      latest.status === "canceled_requested"
        ? transitionJob(latest, "canceled", {}, now())
        : latest
    ));
    return job.status === "canceled";
  };

  const completeOrCancel = (jobId, patch) => replaceAndPersist(jobId, (latest) => {
    if (latest.status === "canceled_requested") return transitionJob(latest, "canceled", {}, now());
    if (latest.status !== "running") return latest;
    return transitionJob(latest, "succeeded", patch, now());
  });

  const processDirector = async (jobId) => {
    const job = current(jobId);
    const result = await providers.director.executeDirector(job.input, {
      expectedShotCount: job.input.shotCount,
    });
    await completeOrCancel(jobId, { result });
  };

  const processVideo = async (jobId) => {
    let job = current(jobId);
    if (!(job.resumeRemote && job.remoteTaskId)) {
      const created = await providers.video.createVideoTask(job.input);
      job = await replaceAndPersist(jobId, (latest) => ({
        ...latest,
        remoteTaskId: created.remoteTaskId,
        resumeRemote: false,
        updatedAt: now(),
      }));
    }

    const startedAt = Date.parse(now());
    let delayMs = 3_000;
    while (Date.parse(now()) - startedAt <= maxVideoWaitMs) {
      if (await finalizeCancellation(jobId)) return;
      const remote = await providers.video.getVideoTask(current(jobId).remoteTaskId);
      if (await finalizeCancellation(jobId)) return;

      if (remote.status === "failed") {
        await replaceAndPersist(jobId, (latest) => transitionJob(latest, "failed", {
          error: remote.error,
          resumeRemote: false,
        }, now()));
        return;
      }
      if (remote.status === "canceled") {
        await replaceAndPersist(jobId, (latest) => transitionJob(latest, "failed", {
          error: { code: "ARK_VIDEO_CANCELED", message: "火山引擎视频任务已取消。", retryable: true },
          resumeRemote: false,
        }, now()));
        return;
      }
      if (remote.status === "succeeded") {
        const videoUrl = remote.videoUrl.startsWith("/")
          ? remote.videoUrl
          : await downloadVideo({ url: remote.videoUrl, jobId, outputDir: config.outputDir });
        await completeOrCancel(jobId, { progress: 100, result: { videoUrl } });
        return;
      }

      job = await replaceAndPersist(jobId, (latest) => ({
        ...latest,
        progress: Math.max(0, Math.min(99, Number(remote.progress ?? 0))),
        updatedAt: now(),
      }));
      await sleep(delayMs);
      delayMs = Math.min(10_000, Math.round(delayMs * 1.5));
    }
    const error = new AppError("REMOTE_TIMEOUT", "视频生成超过 20 分钟，请稍后重试。", 504);
    error.resumeRemote = true;
    throw error;
  };

  const processJob = async (jobId) => {
    const queued = current(jobId);
    if (!queued || queued.status !== "queued") return;
    try {
      await replaceAndPersist(jobId, (latest) => (
        latest.status === "queued" ? transitionJob(latest, "running", {}, now()) : latest
      ));
    } catch {
      return;
    }
    try {
      if (queued.type === "director") await processDirector(jobId);
      else await processVideo(jobId);
    } catch (error) {
      if (storageError) return;
      const job = current(jobId);
      try {
        if (job?.status === "canceled_requested") {
          await finalizeCancellation(jobId);
        } else if (job?.status === "running") {
          await replaceAndPersist(jobId, (latest) => transitionJob(latest, "failed", {
            error: normalizeExecutionError(error),
            resumeRemote: latest.type === "video" && Boolean(latest.remoteTaskId),
          }, now()));
        }
      } catch {
        // publishAfterSave already stopped further work when durable state failed.
      }
    }
  };

  const runPump = () => {
    pumpScheduled = false;
    if (closed || storageError) return notifyIdle();
    while (activeCount < config.jobConcurrency) {
      const next = jobs.find((job) => job.status === "queued" && !claimedJobs.has(job.id));
      if (!next) break;
      claimedJobs.add(next.id);
      activeCount += 1;
      processJob(next.id).finally(() => {
        claimedJobs.delete(next.id);
        activeCount -= 1;
        schedulePump();
        notifyIdle();
      });
    }
    notifyIdle();
  };

  const schedulePump = () => {
    if (closed || storageError || pumpScheduled) return;
    pumpScheduled = true;
    queueMicrotask(runPump);
  };

  const submit = (type, input) => mutate(async () => {
    if (!initialized) throw new AppError("JOB_QUEUE_NOT_INITIALIZED", "任务队列尚未初始化。", 503);
    const candidate = createJob({ type, input }, { now: now() });
    const duplicate = jobs.find((job) => ACTIVE_STATUSES.has(job.status) && job.idempotencyKey === candidate.idempotencyKey);
    if (duplicate) return structuredClone(duplicate);
    await publishAfterSave([...jobs, candidate]);
    schedulePump();
    return structuredClone(candidate);
  });

  return {
    async initialize() {
      if (initialized) return;
      const stored = await store.load();
      const recovered = recoverJobs(stored, now());
      if (JSON.stringify(stored) !== JSON.stringify(recovered)) {
        try {
          await store.save(snapshot(recovered));
        } catch {
          storageError = true;
          throw storeUnavailable();
        }
      }
      jobs = recovered;
      initialized = true;
      schedulePump();
    },

    submitDirector(input) {
      return submit("director", input);
    },

    submitVideo(input) {
      return submit("video", input);
    },

    list({ projectId } = {}) {
      const filtered = projectId ? jobs.filter((job) => job.projectId === projectId) : jobs;
      return [...filtered].reverse().map((job) => structuredClone(job));
    },

    get(id) {
      const job = current(id);
      return job ? structuredClone(job) : null;
    },

    cancel(id) {
      return replaceAndPersist(id, (job) => cancelJob(job, now())).then((next) => {
        schedulePump();
        notifyIdle();
        return next;
      });
    },

    retry(id) {
      return replaceAndPersist(id, (job) => resetFailedJob(job, now())).then((next) => {
        schedulePump();
        return next;
      });
    },

    waitForIdle() {
      if (activeCount === 0 && (!hasQueued() || storageError || closed)) return Promise.resolve();
      return new Promise((resolve) => idleResolvers.add(resolve));
    },

    close() {
      closed = true;
      notifyIdle();
    },
  };
}
