import path from "node:path";

import { AppError } from "./errors.js";
import { getModel } from "./modelCatalog.js";

const DEFAULT_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3";
const DEFAULT_DIRECTOR_MODEL = "doubao-seed-2-0-pro-260215";
const DEFAULT_VIDEO_MODEL = "doubao-seedance-2-0-mini-260615";

function parseBoundedInteger(value, fallback, { min, max, code, label }) {
  const parsed = value === undefined || value === "" ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new AppError(code, `${label}必须是 ${min} 到 ${max} 之间的整数。`, 500);
  }
  return parsed;
}

export function loadConfig(env = process.env, cwd = process.cwd()) {
  const executionMode = (env.MODEL_EXECUTION_MODE || "mock").trim().toLowerCase();
  if (!['mock', 'live'].includes(executionMode)) {
    throw new AppError("CONFIG_EXECUTION_MODE_INVALID", "MODEL_EXECUTION_MODE 只能是 mock 或 live。", 500);
  }

  const apiKey = (env.ARK_API_KEY || "").trim();
  if (executionMode === "live" && !apiKey) {
    throw new AppError("CONFIG_ARK_API_KEY_REQUIRED", "真实模式需要在本机配置 ARK_API_KEY。", 500);
  }

  const baseUrl = (env.ARK_BASE_URL || DEFAULT_BASE_URL).trim().replace(/\/$/, "");
  let parsedBaseUrl;
  try {
    parsedBaseUrl = new URL(baseUrl);
  } catch {
    throw new AppError("CONFIG_ARK_BASE_URL_INVALID", "ARK_BASE_URL 不是有效网址。", 500);
  }
  if (parsedBaseUrl.protocol !== "https:") {
    throw new AppError("CONFIG_ARK_BASE_URL_INVALID", "ARK_BASE_URL 必须使用 HTTPS。", 500);
  }

  const rootDir = path.resolve(cwd);
  const runtimeDir = path.join(rootDir, "runtime");
  const config = {
    executionMode,
    apiKey,
    credentialsConfigured: Boolean(apiKey),
    baseUrl,
    directorModel: (env.ARK_DIRECTOR_MODEL || DEFAULT_DIRECTOR_MODEL).trim(),
    videoModel: (env.ARK_VIDEO_MODEL || DEFAULT_VIDEO_MODEL).trim(),
    jobConcurrency: parseBoundedInteger(env.JOB_CONCURRENCY, 1, {
      min: 1,
      max: 3,
      code: "CONFIG_JOB_CONCURRENCY_INVALID",
      label: "JOB_CONCURRENCY",
    }),
    localAppPort: parseBoundedInteger(env.LOCAL_APP_PORT, 4173, {
      min: 1,
      max: 65535,
      code: "CONFIG_LOCAL_APP_PORT_INVALID",
      label: "LOCAL_APP_PORT",
    }),
    rootDir,
    runtimeDir,
    jobFile: path.join(runtimeDir, "jobs.json"),
    outputDir: path.join(runtimeDir, "outputs"),
  };

  getModel(config, "director", config.directorModel);
  getModel(config, "video", config.videoModel);
  return config;
}
