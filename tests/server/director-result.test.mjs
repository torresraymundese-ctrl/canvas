import assert from "node:assert/strict";
import test from "node:test";

import { parseDirectorResult } from "../../server/directorResult.js";

const valid = {
  title: " 春神遗骸 ",
  logline: "少女在春祭发现苏醒遗骸。",
  characters: [{ id: "character_1", name: "沈春", visual: "黑发青衣", ignored: true }],
  visualBible: {
    tone: "东方悬疑",
    palette: ["冷青", "暗金"],
    locations: [{ id: "location_1", name: "古寺", visual: "雨夜石阶" }],
  },
  shots: [{
    id: "S001",
    title: "春祭开场",
    durationSeconds: 5,
    camera: "大全景缓慢推进",
    action: "人群穿过雨幕",
    dialogue: "",
    continuity: "主角青衣保持一致",
    prompt: "电影感雨夜古寺",
    negativePrompt: "文字，水印",
    ignored: true,
  }],
  ignored: true,
};

test("a valid director result is normalized", () => {
  const result = parseDirectorResult(JSON.stringify(valid), { expectedShotCount: 1 });

  assert.equal(result.title, "春神遗骸");
  assert.equal(result.shots[0].id, "S001");
  assert.equal("ignored" in result, false);
  assert.equal("ignored" in result.characters[0], false);
  assert.equal("ignored" in result.shots[0], false);
});

test("one outer Markdown JSON fence is accepted", () => {
  const result = parseDirectorResult(`\`\`\`json\n${JSON.stringify(valid)}\n\`\`\``, {
    expectedShotCount: 1,
  });

  assert.equal(result.shots.length, 1);
});

test("duplicate shot ids are rejected", () => {
  const duplicate = { ...valid, shots: [valid.shots[0], valid.shots[0]] };

  assert.throws(
    () => parseDirectorResult(JSON.stringify(duplicate), { expectedShotCount: 2 }),
    (error) => error.code === "DIRECTOR_RESULT_INVALID"
      && error.details.some((detail) => detail.path === "shots.1.id"),
  );
});

test("the director result must contain the requested number of shots", () => {
  assert.throws(
    () => parseDirectorResult(JSON.stringify(valid), { expectedShotCount: 2 }),
    (error) => error.code === "DIRECTOR_RESULT_INVALID"
      && error.details.some((detail) => detail.path === "shots"),
  );
});

test("malformed shot duration is rejected", () => {
  const malformed = {
    ...valid,
    shots: [{ ...valid.shots[0], durationSeconds: 45 }],
  };

  assert.throws(
    () => parseDirectorResult(JSON.stringify(malformed), { expectedShotCount: 1 }),
    (error) => error.code === "DIRECTOR_RESULT_INVALID"
      && error.details.some((detail) => detail.path === "shots.0.durationSeconds"),
  );
});

test("invalid JSON is reported as an invalid director result", () => {
  assert.throws(
    () => parseDirectorResult("{broken", { expectedShotCount: 1 }),
    (error) => error.code === "DIRECTOR_RESULT_INVALID",
  );
});
