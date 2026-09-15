import { AppError } from "../errors.js";
import { parseDirectorResult } from "../directorResult.js";
import { fetchWithTimeout } from "./fetchWithTimeout.js";
import { withRetry } from "./retry.js";

function directorSystemPrompt(expectedShotCount) {
  return [
    "你是一名短剧导演。请把用户剧本拆成严格 JSON，不要输出解释或 Markdown。",
    `必须输出 ${expectedShotCount} 个镜头，镜头编号从 S001 连续递增。`,
    "JSON 顶层字段必须是 title、logline、characters、visualBible、shots。",
    "characters 每项包含 id、name、visual。",
    "visualBible 包含 tone、palette、locations；location 每项包含 id、name、visual。",
    "shots 每项包含 id、title、durationSeconds、camera、action、dialogue、continuity、prompt、negativePrompt。",
    "每个 prompt 必须能直接用于视频生成，明确主体、场景、动作、镜头、光线、风格和连续性。",
  ].join("\n");
}

function extractOutputText(response) {
  if (typeof response?.output_text === "string") return response.output_text;
  for (const item of response?.output ?? []) {
    if (item?.type !== "message") continue;
    for (const content of item.content ?? []) {
      if (content?.type === "output_text" && typeof content.text === "string") return content.text;
    }
  }
  throw new AppError("ARK_DIRECTOR_OUTPUT_MISSING", "导演模型没有返回可解析内容。", 502);
}

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

export function createArkDirector({
  config,
  fetch = globalThis.fetch,
  sleep,
  requestTimeoutMs = 30_000,
  retryAttempts = 3,
} = {}) {
  return {
    async executeDirector(input, { expectedShotCount = input.shotCount } = {}) {
      const responseBody = await withRetry(async () => {
        const response = await fetchWithTimeout(fetch, `${config.baseUrl}/responses`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: input.modelId,
            input: [
              { type: "message", role: "system", content: directorSystemPrompt(expectedShotCount) },
              { type: "message", role: "user", content: input.script },
            ],
          }),
        }, requestTimeoutMs);
        if (!response.ok) throw await readError(response);
        return response.json();
      }, { sleep, maxAttempts: retryAttempts });

      return parseDirectorResult(extractOutputText(responseBody), { expectedShotCount });
    },
  };
}
