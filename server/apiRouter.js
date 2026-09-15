import { Buffer } from "node:buffer";

import { AppError } from "./errors.js";
import { validateDirectorInput, validateVideoInput } from "./inputValidation.js";

const MAX_BODY_BYTES = 2 * 1024 * 1024;
const JOB_ID_PATTERN = /^job_[a-zA-Z0-9_-]+$/;

function jsonResponse(data, status = 200) {
  return Response.json({ data }, { status, headers: { "cache-control": "no-store" } });
}

function errorResponse(error) {
  if (error instanceof AppError) {
    return Response.json({
      error: {
        code: error.code,
        message: error.message,
        ...(error.details === undefined ? {} : { details: error.details }),
      },
    }, { status: error.httpStatus, headers: { "cache-control": "no-store" } });
  }
  return Response.json({
    error: { code: "INTERNAL_ERROR", message: "本地服务出现异常，请查看服务日志。" },
  }, { status: 500, headers: { "cache-control": "no-store" } });
}

async function readJson(request) {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    throw new AppError("REQUEST_BODY_TOO_LARGE", "请求内容不能超过 2 MB。", 413);
  }
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    throw new AppError("REQUEST_CONTENT_TYPE_INVALID", "请求必须使用 application/json。", 415);
  }

  const chunks = [];
  let received = 0;
  if (request.body) {
    const reader = request.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > MAX_BODY_BYTES) {
        await reader.cancel().catch(() => {});
        throw new AppError("REQUEST_BODY_TOO_LARGE", "请求内容不能超过 2 MB。", 413);
      }
      chunks.push(Buffer.from(value.buffer, value.byteOffset, value.byteLength));
    }
  }
  const raw = Buffer.concat(chunks, received).toString("utf8");
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    throw new AppError("REQUEST_JSON_INVALID", "请求不是有效 JSON。", 400);
  }
}

function routeJobId(pathname, suffix = "") {
  const match = new RegExp(`^/api/jobs/(job_[a-zA-Z0-9_-]+)${suffix}$`).exec(pathname);
  return match && JOB_ID_PATTERN.test(match[1]) ? match[1] : null;
}

function summarizeJob(job) {
  const input = job.type === "director"
    ? { shotCount: job.input?.shotCount }
    : {
        shotId: job.input?.shotId,
        ratio: job.input?.ratio,
        duration: job.input?.duration,
        generateAudio: job.input?.generateAudio,
      };
  const result = job.result ? { ...job.result } : null;
  if (result) delete result.remoteVideoUrl;
  return { ...job, input, result };
}

export function createApiHandler({ config, queue, models }) {
  return async function handleApiRequest(request) {
    try {
      const url = new URL(request.url);
      let pathname;
      try {
        pathname = decodeURIComponent(url.pathname);
      } catch {
        throw new AppError("ROUTE_NOT_FOUND", "接口不存在。", 404);
      }

      if (request.method === "GET" && pathname === "/api/health") {
        return jsonResponse({
          status: "ok",
          executionMode: config.executionMode,
          credentialsConfigured: config.credentialsConfigured,
          directorModel: config.directorModel,
          videoModel: config.videoModel,
        });
      }
      if (request.method === "GET" && pathname === "/api/models") return jsonResponse(models);
      if (request.method === "GET" && pathname === "/api/jobs") {
        const requestedLimit = Number(url.searchParams.get("limit") ?? 100);
        const limit = Number.isInteger(requestedLimit) ? Math.max(1, Math.min(200, requestedLimit)) : 100;
        return jsonResponse(
          queue.list({ projectId: url.searchParams.get("projectId") || undefined })
            .slice(0, limit)
            .map(summarizeJob),
        );
      }
      if (request.method === "POST" && pathname === "/api/jobs/director") {
        const input = validateDirectorInput(await readJson(request), config);
        return jsonResponse(await queue.submitDirector(input), 202);
      }
      if (request.method === "POST" && pathname === "/api/jobs/video") {
        const input = validateVideoInput(await readJson(request), config);
        return jsonResponse(await queue.submitVideo(input), 202);
      }

      const detailId = request.method === "GET" ? routeJobId(pathname) : null;
      if (detailId) {
        const job = queue.get(detailId);
        if (!job) throw new AppError("JOB_NOT_FOUND", "任务不存在。", 404);
        return jsonResponse(job);
      }
      const retryId = request.method === "POST" ? routeJobId(pathname, "/retry") : null;
      if (retryId) {
        await readJson(request);
        return jsonResponse(await queue.retry(retryId));
      }
      const cancelId = request.method === "POST" ? routeJobId(pathname, "/cancel") : null;
      if (cancelId) {
        await readJson(request);
        return jsonResponse(await queue.cancel(cancelId));
      }
      throw new AppError("ROUTE_NOT_FOUND", "接口不存在。", 404);
    } catch (error) {
      return errorResponse(error);
    }
  };
}
