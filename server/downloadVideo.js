import * as defaultFs from "node:fs/promises";
import path from "node:path";

import { AppError } from "./errors.js";

const DEFAULT_MAX_BYTES = 500 * 1024 * 1024;
const JOB_ID_PATTERN = /^job_[a-zA-Z0-9_-]+$/;

function timeoutError() {
  return new AppError("VIDEO_DOWNLOAD_FAILED", "视频下载超时。", 502);
}

export async function downloadVideo({
  url,
  jobId,
  outputDir,
  fetch = globalThis.fetch,
  fs = defaultFs,
  maxBytes = DEFAULT_MAX_BYTES,
  timeoutMs = 10 * 60 * 1000,
}) {
  if (!JOB_ID_PATTERN.test(jobId)) {
    throw new AppError("VIDEO_DOWNLOAD_JOB_ID_INVALID", "视频任务编号不安全。", 400);
  }
  let remoteUrl;
  try {
    remoteUrl = new URL(url);
  } catch {
    throw new AppError("VIDEO_DOWNLOAD_URL_INVALID", "视频下载地址无效。", 502);
  }
  if (remoteUrl.protocol !== "https:") {
    throw new AppError("VIDEO_DOWNLOAD_URL_INVALID", "视频下载地址必须使用 HTTPS。", 502);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let temporaryPath;
  let handle;
  try {
    let response;
    try {
      response = await fetch(remoteUrl, { redirect: "manual", signal: controller.signal });
    } catch (error) {
      if (error?.name === "AbortError") throw timeoutError();
      throw new AppError("VIDEO_DOWNLOAD_FAILED", "无法下载生成视频。", 502);
    }

    if (!response.ok || (response.status >= 300 && response.status < 400)) {
      throw new AppError("VIDEO_DOWNLOAD_FAILED", `视频下载失败（HTTP ${response.status}）。`, 502);
    }
    const contentType = response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
    if (!contentType?.startsWith("video/")) {
      throw new AppError("VIDEO_DOWNLOAD_TYPE_INVALID", "生成结果不是可识别的视频文件。", 502);
    }
    const contentLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > maxBytes) {
      throw new AppError("VIDEO_DOWNLOAD_TOO_LARGE", "生成视频超过 500 MB 限制。", 413);
    }
    if (!response.body) throw new AppError("VIDEO_DOWNLOAD_FAILED", "视频下载响应为空。", 502);

    await fs.mkdir(outputDir, { recursive: true });
    const finalPath = path.join(outputDir, `${jobId}.mp4`);
    temporaryPath = `${finalPath}.part`;
    handle = await fs.open(temporaryPath, "w");
    const reader = response.body.getReader();
    let received = 0;
    while (true) {
      let chunk;
      try {
        chunk = await reader.read();
      } catch (error) {
        if (error?.name === "AbortError") throw timeoutError();
        throw error;
      }
      if (chunk.done) break;
      received += chunk.value.byteLength;
      if (received > maxBytes) {
        await reader.cancel();
        throw new AppError("VIDEO_DOWNLOAD_TOO_LARGE", "生成视频超过 500 MB 限制。", 413);
      }
      await handle.write(chunk.value);
    }
    await handle.close();
    handle = null;
    await fs.rename(temporaryPath, finalPath);
    temporaryPath = null;
    return `/outputs/${jobId}.mp4`;
  } finally {
    clearTimeout(timeout);
    if (handle) await handle.close().catch(() => {});
    if (temporaryPath) await fs.rm(temporaryPath, { force: true }).catch(() => {});
  }
}
