import assert from "node:assert/strict";
import test from "node:test";

import { loadConfig } from "../../server/config.js";
import { getModel, listModels } from "../../server/modelCatalog.js";
import { validateDirectorInput, validateVideoInput } from "../../server/inputValidation.js";

const projectRoot = "C:\\director-canvas";

test("mock mode supplies safe defaults without a key", () => {
  const config = loadConfig({}, projectRoot);

  assert.equal(config.executionMode, "mock");
  assert.equal(config.directorModel, "doubao-seed-2-0-pro-260215");
  assert.equal(config.videoModel, "doubao-seedance-2-0-mini-260615");
  assert.equal(config.credentialsConfigured, false);
  assert.equal(config.jobConcurrency, 1);
});

test("live mode requires an API key", () => {
  assert.throws(
    () => loadConfig({ MODEL_EXECUTION_MODE: "live" }, projectRoot),
    (error) => error.code === "CONFIG_ARK_API_KEY_REQUIRED"
      && error.httpStatus === 500
      && !error.message.includes("undefined"),
  );
});

test("the Ark base URL must use HTTPS", () => {
  assert.throws(
    () => loadConfig({ ARK_BASE_URL: "http://ark.example.test" }, projectRoot),
    (error) => error.code === "CONFIG_ARK_BASE_URL_INVALID",
  );
});

test("browser model metadata never contains the API key", () => {
  const config = loadConfig({ ARK_API_KEY: "test-secret-value" }, projectRoot);
  const serialized = JSON.stringify(listModels(config));

  assert.equal(serialized.includes("test-secret-value"), false);
  assert.equal(getModel(config, "video", "doubao-seedance-2-0-mini-260615").role, "video");
});

test("director input requires a real script", () => {
  const config = loadConfig({}, projectRoot);
  const input = validateDirectorInput({
    projectId: "spring-god-episode-1",
    nodeId: "storyboard",
    script: "第一场：雨夜古寺",
    shotCount: 6,
  }, config);

  assert.equal(input.script, "第一场：雨夜古寺");
  assert.equal(input.shotCount, 6);
  assert.throws(
    () => validateDirectorInput({ ...input, script: " " }, config),
    (error) => error.code === "DIRECTOR_SCRIPT_REQUIRED" && error.httpStatus === 400,
  );
});

test("director shot count is limited to sixty", () => {
  const config = loadConfig({}, projectRoot);

  assert.throws(
    () => validateDirectorInput({
      projectId: "spring-god-episode-1",
      nodeId: "storyboard",
      script: "场景",
      shotCount: 61,
    }, config),
    (error) => error.code === "DIRECTOR_SHOT_COUNT_INVALID",
  );
});

test("video input accepts the opened Mini model", () => {
  const config = loadConfig({}, projectRoot);
  const input = validateVideoInput({
    projectId: "spring-god-episode-1",
    nodeId: "video",
    shotId: "S001",
    prompt: "雨夜古寺，镜头缓慢推进",
    modelId: "doubao-seedance-2-0-mini-260615",
    ratio: "16:9",
    duration: 5,
    generateAudio: true,
  }, config);

  assert.equal(input.modelId, "doubao-seedance-2-0-mini-260615");
  assert.equal(input.duration, 5);
  assert.equal(input.generateAudio, true);
});

test("video input rejects unknown models and unsupported parameters", () => {
  const config = loadConfig({}, projectRoot);
  const base = {
    projectId: "spring-god-episode-1",
    nodeId: "video",
    shotId: "S001",
    prompt: "雨夜古寺",
    modelId: "doubao-seedance-2-0-mini-260615",
    ratio: "16:9",
    duration: 5,
  };

  assert.throws(
    () => validateVideoInput({ ...base, modelId: "unknown" }, config),
    (error) => error.code === "MODEL_NOT_FOUND",
  );
  assert.throws(
    () => validateVideoInput({ ...base, ratio: "3:2" }, config),
    (error) => error.code === "VIDEO_RATIO_UNSUPPORTED",
  );
  assert.throws(
    () => validateVideoInput({ ...base, duration: 12 }, config),
    (error) => error.code === "VIDEO_DURATION_UNSUPPORTED",
  );
});
