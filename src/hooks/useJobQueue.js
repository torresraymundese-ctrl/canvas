import { useCallback, useEffect, useMemo, useState } from "react";

import { createApiClient } from "../apiClient.js";
import { getActiveJobs, sortJobs } from "../jobState.js";

const defaultClient = createApiClient();

function replaceJob(jobs, nextJob) {
  return sortJobs([nextJob, ...jobs.filter((job) => job.id !== nextJob.id)]);
}

export function useJobQueue({ projectId, client = defaultClient }) {
  const [jobs, setJobs] = useState([]);
  const [models, setModels] = useState([]);
  const [service, setService] = useState({ status: "checking" });
  const [error, setError] = useState(null);

  const refreshJobs = useCallback(async () => {
    try {
      const nextJobs = await client.listJobs(projectId);
      setJobs(sortJobs(nextJobs));
      setError(null);
      setService((current) => ({ ...current, status: "online" }));
      return nextJobs;
    } catch (requestError) {
      setError(requestError);
      setService((current) => ({ ...current, status: "offline" }));
      return [];
    }
  }, [client, projectId]);

  const refreshAll = useCallback(async () => {
    try {
      const [health, availableModels, nextJobs] = await Promise.all([
        client.getHealth(),
        client.getModels(),
        client.listJobs(projectId),
      ]);
      setService({ ...health, status: "online" });
      setModels(availableModels);
      setJobs(sortJobs(nextJobs));
      setError(null);
    } catch (requestError) {
      setError(requestError);
      setService({ status: "offline" });
    }
  }, [client, projectId]);

  useEffect(() => { refreshAll(); }, [refreshAll]);

  const pollDelay = getActiveJobs(jobs).length ? 2_000 : 10_000;
  const needsFullRefresh = service.status !== "online" || models.length === 0;
  useEffect(() => {
    let stopped = false;
    let timer;
    const poll = async () => {
      if (document.visibilityState === "visible") {
        if (needsFullRefresh) await refreshAll();
        else await refreshJobs();
      }
      if (!stopped) timer = window.setTimeout(poll, pollDelay);
    };
    timer = window.setTimeout(poll, pollDelay);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [needsFullRefresh, pollDelay, refreshAll, refreshJobs]);

  const runMutation = useCallback(async (operation) => {
    try {
      const job = await operation();
      setJobs((current) => replaceJob(current, job));
      setError(null);
      return job;
    } catch (requestError) {
      setError(requestError);
      throw requestError;
    }
  }, []);

  return {
    jobs,
    models,
    service,
    error,
    activeJobs: useMemo(() => getActiveJobs(jobs), [jobs]),
    refresh: refreshAll,
    submitDirector: (input) => runMutation(() => client.createDirectorJob(input)),
    submitVideo: (input) => runMutation(() => client.createVideoJob(input)),
    retry: (jobId) => runMutation(() => client.retryJob(jobId)),
    cancel: (jobId) => runMutation(() => client.cancelJob(jobId)),
  };
}
