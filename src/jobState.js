export const ACTIVE_JOB_STATUSES = new Set([
  "queued",
  "running",
  "canceled_requested",
]);

function jobTimestamp(job) {
  return Date.parse(job.updatedAt ?? job.createdAt ?? 0) || 0;
}

export function sortJobs(jobs = []) {
  return [...jobs].sort((left, right) => {
    const leftActive = ACTIVE_JOB_STATUSES.has(left.status);
    const rightActive = ACTIVE_JOB_STATUSES.has(right.status);
    if (leftActive !== rightActive) return leftActive ? -1 : 1;
    return jobTimestamp(right) - jobTimestamp(left);
  });
}

export function getActiveJobs(jobs = []) {
  return sortJobs(jobs).filter((job) => ACTIVE_JOB_STATUSES.has(job.status));
}

export function getJobActionAvailability(job) {
  return {
    canCancel: job?.status === "queued" || job?.status === "running",
    canRetry: job?.status === "failed",
  };
}

export function getNodeJobStatus(jobs = [], nodeId) {
  return sortJobs(jobs.filter((job) => job.nodeId === nodeId))[0]?.status ?? null;
}

export function getActiveJobForTarget(jobs = [], { nodeId, shotId } = {}) {
  return getActiveJobs(jobs).find((job) => (
    (!nodeId || job.nodeId === nodeId)
    && (!shotId || job.input?.shotId === shotId)
  )) ?? null;
}

export function resolveModelId(models = [], role, selection) {
  const available = models.filter((model) => model.role === role);
  const normalized = String(selection ?? "").trim().toLowerCase();
  const exact = available.find((model) => model.id === selection || model.label.toLowerCase() === normalized);
  if (exact) return exact.id;
  if (role === "video" && normalized.includes("seedance")) {
    const wantsMini = normalized.includes("mini");
    const alias = available.find((model) => model.id.includes("mini") === wantsMini);
    if (alias) return alias.id;
  }
  return (available.find((model) => model.selected) ?? available[0])?.id ?? "";
}
