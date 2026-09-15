import { Buffer } from "node:buffer";

import { AppError } from "./errors.js";

const MAX_RESULT_BYTES = 2 * 1024 * 1024;
const ENTITY_ID_PATTERN = /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/;
const SHOT_ID_PATTERN = /^S\d{3}$/;

function invalid(details) {
  return new AppError(
    "DIRECTOR_RESULT_INVALID",
    "导演模型返回的分镜结构不完整，请重试或更换模型。",
    502,
    details,
  );
}

function stripOuterFence(rawText) {
  const trimmed = rawText.trim();
  const match = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  return match ? match[1] : trimmed;
}

function normalizeString(value, path, details, { allowEmpty = false, pattern } = {}) {
  if (typeof value !== "string") {
    details.push({ path, message: "必须是文本。" });
    return "";
  }
  const normalized = value.trim();
  if (!allowEmpty && !normalized) details.push({ path, message: "不能为空。" });
  if (normalized && pattern && !pattern.test(normalized)) details.push({ path, message: "格式不正确。" });
  return normalized;
}

function normalizeEntityList(value, path, details) {
  if (!Array.isArray(value) || value.length === 0) {
    details.push({ path, message: "必须至少包含一项。" });
    return [];
  }

  const ids = new Set();
  return value.map((entity, index) => {
    const itemPath = `${path}.${index}`;
    const id = normalizeString(entity?.id, `${itemPath}.id`, details, { pattern: ENTITY_ID_PATTERN });
    if (id && ids.has(id)) details.push({ path: `${itemPath}.id`, message: "编号不能重复。" });
    ids.add(id);
    return {
      id,
      name: normalizeString(entity?.name, `${itemPath}.name`, details),
      visual: normalizeString(entity?.visual, `${itemPath}.visual`, details),
    };
  });
}

function normalizePalette(value, details) {
  if (!Array.isArray(value) || value.length === 0) {
    details.push({ path: "visualBible.palette", message: "必须至少包含一种颜色。" });
    return [];
  }
  return value.map((color, index) => normalizeString(color, `visualBible.palette.${index}`, details));
}

function normalizeShots(value, expectedShotCount, details) {
  if (!Array.isArray(value) || value.length === 0) {
    details.push({ path: "shots", message: "必须至少包含一个镜头。" });
    return [];
  }
  if (Number.isInteger(expectedShotCount) && value.length !== expectedShotCount) {
    details.push({ path: "shots", message: `应返回 ${expectedShotCount} 个镜头，实际返回 ${value.length} 个。` });
  }

  const ids = new Set();
  return value.map((shot, index) => {
    const path = `shots.${index}`;
    const id = normalizeString(shot?.id, `${path}.id`, details, { pattern: SHOT_ID_PATTERN });
    if (id && ids.has(id)) details.push({ path: `${path}.id`, message: "镜头编号不能重复。" });
    ids.add(id);

    const durationSeconds = Number(shot?.durationSeconds);
    if (!Number.isInteger(durationSeconds) || durationSeconds < 1 || durationSeconds > 30) {
      details.push({ path: `${path}.durationSeconds`, message: "镜头时长必须是 1 到 30 秒的整数。" });
    }

    return {
      id,
      title: normalizeString(shot?.title, `${path}.title`, details),
      durationSeconds,
      camera: normalizeString(shot?.camera, `${path}.camera`, details),
      action: normalizeString(shot?.action, `${path}.action`, details),
      dialogue: normalizeString(shot?.dialogue, `${path}.dialogue`, details, { allowEmpty: true }),
      continuity: normalizeString(shot?.continuity, `${path}.continuity`, details),
      prompt: normalizeString(shot?.prompt, `${path}.prompt`, details),
      negativePrompt: normalizeString(shot?.negativePrompt, `${path}.negativePrompt`, details, { allowEmpty: true }),
    };
  });
}

export function parseDirectorResult(rawText, { expectedShotCount } = {}) {
  if (typeof rawText !== "string" || Buffer.byteLength(rawText, "utf8") > MAX_RESULT_BYTES) {
    throw invalid([{ path: "$", message: "返回内容为空或超过 2 MB。" }]);
  }

  let parsed;
  try {
    parsed = JSON.parse(stripOuterFence(rawText));
  } catch {
    throw invalid([{ path: "$", message: "返回内容不是有效 JSON。" }]);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw invalid([{ path: "$", message: "返回内容必须是 JSON 对象。" }]);
  }

  const details = [];
  const visualBible = parsed.visualBible && typeof parsed.visualBible === "object"
    ? parsed.visualBible
    : {};
  if (!parsed.visualBible || typeof parsed.visualBible !== "object" || Array.isArray(parsed.visualBible)) {
    details.push({ path: "visualBible", message: "视觉设定必须是对象。" });
  }

  const result = {
    title: normalizeString(parsed.title, "title", details),
    logline: normalizeString(parsed.logline, "logline", details),
    characters: normalizeEntityList(parsed.characters, "characters", details),
    visualBible: {
      tone: normalizeString(visualBible.tone, "visualBible.tone", details),
      palette: normalizePalette(visualBible.palette, details),
      locations: normalizeEntityList(visualBible.locations, "visualBible.locations", details),
    },
    shots: normalizeShots(parsed.shots, expectedShotCount, details),
  };

  if (details.length > 0) throw invalid(details);
  return result;
}
