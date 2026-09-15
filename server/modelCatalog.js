import { AppError } from "./errors.js";

export const MODEL_CATALOG = [
  {
    role: "director",
    id: "doubao-seed-2-0-pro-260215",
    label: "Doubao Seed 2.0 Pro",
    provider: "volcengine-ark",
    capabilities: ["script-analysis", "storyboard"],
  },
  {
    role: "video",
    id: "doubao-seedance-2-0-mini-260615",
    label: "Seedance 2.0 Mini",
    provider: "volcengine-ark",
    ratios: ["16:9", "9:16", "1:1"],
    durations: [5, 10],
    capabilities: ["text-to-video", "image-to-video", "audio"],
  },
  {
    role: "video",
    id: "doubao-seedance-2-0-260128",
    label: "Seedance 2.0",
    provider: "volcengine-ark",
    ratios: ["16:9", "9:16", "1:1"],
    durations: [5, 10],
    capabilities: ["text-to-video", "image-to-video", "audio"],
  },
];

export function listModels(config) {
  return MODEL_CATALOG.map((model) => ({
    ...model,
    selected: model.id === (model.role === "director" ? config.directorModel : config.videoModel),
  }));
}

export function getModel(_config, role, modelId) {
  const model = MODEL_CATALOG.find((entry) => entry.role === role && entry.id === modelId);
  if (!model) {
    throw new AppError("MODEL_NOT_FOUND", "所选模型不存在或尚未开放。", 400, { role, modelId });
  }
  return model;
}
