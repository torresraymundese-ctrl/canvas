import { Buffer } from "node:buffer";

import { AppError } from "./errors.js";
import { getModel } from "./modelCatalog.js";

const ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/;
const SHOT_ID_PATTERN = /^S\d{3}$/;

function requiredString(value, code, message, { pattern, maxBytes = 1_500_000 } = {}) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) throw new AppError(code, message, 400);
  if (Buffer.byteLength(normalized, "utf8") > maxBytes) {
    throw new AppError(`${code}_TOO_LARGE`, "输入内容超过允许大小。", 413);
  }
  if (pattern && !pattern.test(normalized)) throw new AppError(code, message, 400);
  return normalized;
}

function validateBaseInput(body) {
  return {
    projectId: requiredString(body?.projectId, "PROJECT_ID_REQUIRED", "缺少有效的项目编号。", { pattern: ID_PATTERN, maxBytes: 128 }),
    nodeId: requiredString(body?.nodeId, "NODE_ID_REQUIRED", "缺少有效的节点编号。", { pattern: ID_PATTERN, maxBytes: 128 }),
  };
}

export function validateDirectorInput(body, config) {
  const base = validateBaseInput(body);
  const script = requiredString(body?.script, "DIRECTOR_SCRIPT_REQUIRED", "请先导入有效剧本。", { maxBytes: 1_500_000 });
  const shotCount = Number(body?.shotCount);
  if (!Number.isInteger(shotCount) || shotCount < 1 || shotCount > 60) {
    throw new AppError("DIRECTOR_SHOT_COUNT_INVALID", "镜头数量必须是 1 到 60。", 400);
  }
  const modelId = body?.modelId || config.directorModel;
  getModel(config, "director", modelId);

  return { ...base, script, shotCount, modelId };
}

export function validateVideoInput(body, config) {
  const base = validateBaseInput(body);
  const shotId = requiredString(body?.shotId, "VIDEO_SHOT_ID_REQUIRED", "缺少有效的镜头编号。", { pattern: SHOT_ID_PATTERN, maxBytes: 16 });
  const prompt = requiredString(body?.prompt, "VIDEO_PROMPT_REQUIRED", "视频提示词不能为空。", { maxBytes: 100_000 });
  const modelId = body?.modelId || config.videoModel;
  const model = getModel(config, "video", modelId);
  const ratio = body?.ratio || "16:9";
  if (!model.ratios.includes(ratio)) {
    throw new AppError("VIDEO_RATIO_UNSUPPORTED", "当前模型不支持该画面比例。", 400, { supported: model.ratios });
  }
  const duration = Number(body?.duration ?? 5);
  if (!model.durations.includes(duration)) {
    throw new AppError("VIDEO_DURATION_UNSUPPORTED", "当前模型不支持该视频时长。", 400, { supported: model.durations });
  }
  const referenceImages = body?.referenceImages ?? [];
  if (!Array.isArray(referenceImages) || referenceImages.length > 4) {
    throw new AppError("VIDEO_REFERENCE_IMAGES_INVALID", "参考图最多只能添加 4 张。", 400);
  }
  for (const reference of referenceImages) {
    let url;
    try {
      url = new URL(reference);
    } catch {
      throw new AppError("VIDEO_REFERENCE_URL_INVALID", "参考图必须是可公开访问的 HTTPS 地址。", 400);
    }
    if (url.protocol !== "https:") {
      throw new AppError("VIDEO_REFERENCE_URL_INVALID", "参考图必须是可公开访问的 HTTPS 地址。", 400);
    }
  }

  return {
    ...base,
    shotId,
    prompt,
    modelId,
    ratio,
    duration,
    generateAudio: body?.generateAudio !== false,
    referenceImages: [...referenceImages],
  };
}
