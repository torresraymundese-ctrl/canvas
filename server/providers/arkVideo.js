import { AppError } from "../errors.js";
import { fetchWithTimeout } from "./fetchWithTimeout.js";
import { withRetry } from "./retry.js";

async function readError(response) {
  let body;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  const error = new AppError(
    "ARK_REQUEST_FAILED",
    body?.error?.message || body?.message || `火山方舟请求失败（HTTP ${response.status}）。`,
    response.status >= 500 ? 502 : response.status,
    { providerStatus: response.status, providerCode: body?.error?.code || body?.code },
  );
  error.status = response.status;
  return error;
}

function normalizeVideoTask(body) {
  const status = String(body?.status || "").toLowerCase();
  if (["queued", "pending", "in_queue"].includes(status)) {
    return { status: "queued", progress: Number(body?.progress ?? 10), videoUrl: null, error: null };
  }
  if (["running", "generating", "processing"].includes(status)) {
    return { status: "running", progress: Number(body?.progress ?? 55), videoUrl: null, error: null };
  }
  if (["succeeded", "success", "done"].includes(status)) {
    const videoUrl = body?.content?.video_url || body?.content?.videoUrl || body?.video_url;
    if (!videoUrl) {
      return {
        status: "failed",
        progress: 100,
        videoUrl: null,
        error: { code: "ARK_VIDEO_URL_MISSING", message: "生成任务成功，但没有返回视频地址。", retryable: false },
      };
    }
    return { status: "succeeded", progress: 100, videoUrl, error: null };
  }
  if (["failed", "error"].includes(status)) {
    return {
      status: "failed",
      progress: Number(body?.progress ?? 100),
      videoUrl: null,
      error: {
        code: body?.error?.code || body?.code || "ARK_VIDEO_FAILED",
        message: body?.error?.message || body?.message || "视频生成失败。",
        retryable: false,
      },
    };
  }
  if (["canceled", "cancelled"].includes(status)) {
    return { status: "canceled", progress: Number(body?.progress ?? 0), videoUrl: null, error: null };
  }
  return {
    status: "failed",
    progress: Number(body?.progress ?? 0),
    videoUrl: null,
    error: {
      code: "ARK_VIDEO_STATUS_UNKNOWN",
      message: `火山引擎返回了未知的视频任务状态：${status || "empty"}。`,
      retryable: true,
    },
  };
}

function createPrompt(input) {
  const withoutControls = input.prompt
    .replace(/\s+--ratio\s+\S+/gi, "")
    .replace(/\s+--(?:dur|duration)\s+\d+/gi, "")
    .trim();
  const audioInstruction = input.generateAudio === false
    ? "无声视频，不生成对白、环境音或音乐"
    : "生成与画面同步的对白、环境音和音效";
  return `${withoutControls}，${audioInstruction} --ratio ${input.ratio} --dur ${input.duration}`;
}

export function createArkVideo({
  config,
  fetch = globalThis.fetch,
  sleep,
  requestTimeoutMs = 30_000,
  retryAttempts = 3,
} = {}) {
  const request = async (url, init) => withRetry(async () => {
    const response = await fetchWithTimeout(fetch, url, init, requestTimeoutMs);
    if (!response.ok) throw await readError(response);
    return response.json();
  }, { sleep, maxAttempts: retryAttempts });

  return {
    async createVideoTask(input) {
      const content = [{ type: "text", text: createPrompt(input) }];
      for (const referenceUrl of input.referenceImages ?? []) {
        content.push({
          type: "image_url",
          image_url: { url: referenceUrl },
          role: "reference_image",
        });
      }
      const body = await request(`${config.baseUrl}/contents/generations/tasks`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: input.modelId,
          content,
        }),
      });
      if (!body?.id) throw new AppError("ARK_VIDEO_TASK_ID_MISSING", "火山方舟没有返回视频任务编号。", 502);
      return { remoteTaskId: body.id };
    },

    async getVideoTask(remoteTaskId) {
      const body = await request(`${config.baseUrl}/contents/generations/tasks/${encodeURIComponent(remoteTaskId)}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${config.apiKey}` },
      });
      return normalizeVideoTask(body);
    },
  };
}
