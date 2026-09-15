function createRequestError(error, response) {
  const requestError = new Error(error?.message || `请求失败（HTTP ${response.status}）`);
  requestError.name = "ApiError";
  requestError.code = error?.code || "HTTP_ERROR";
  requestError.status = response.status;
  requestError.details = error?.details;
  return requestError;
}

export function createApiClient(fetchImpl = globalThis.fetch) {
  async function request(path, init) {
    const response = await fetchImpl(path, init);
    let payload;
    try {
      payload = await response.json();
    } catch {
      throw createRequestError({
        code: "INVALID_RESPONSE",
        message: "本地任务服务返回了无法识别的数据。",
      }, response);
    }

    if (!response.ok || payload?.error) {
      throw createRequestError(payload?.error, response);
    }
    return payload?.data;
  }

  const post = (path, body) => request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  return {
    getHealth: () => request("/api/health"),
    getModels: () => request("/api/models"),
    listJobs: (projectId) => {
      const query = new URLSearchParams({ projectId });
      return request(`/api/jobs?${query}`);
    },
    getJob: (jobId) => request(`/api/jobs/${encodeURIComponent(jobId)}`),
    createDirectorJob: (input) => post("/api/jobs/director", input),
    createVideoJob: (input) => post("/api/jobs/video", input),
    retryJob: (jobId) => post(`/api/jobs/${encodeURIComponent(jobId)}/retry`, {}),
    cancelJob: (jobId) => post(`/api/jobs/${encodeURIComponent(jobId)}/cancel`, {}),
  };
}
