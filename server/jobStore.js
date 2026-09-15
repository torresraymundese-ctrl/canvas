import * as defaultFs from "node:fs/promises";
import path from "node:path";

import { AppError } from "./errors.js";

export function createJobStore({ filePath, fs = defaultFs }) {
  const temporaryPath = `${filePath}.tmp`;

  return {
    async load() {
      let raw;
      try {
        raw = await fs.readFile(filePath, "utf8");
      } catch (error) {
        if (error?.code === "ENOENT") return [];
        throw error;
      }

      try {
        const document = JSON.parse(raw);
        if (document?.schemaVersion !== 1 || !Array.isArray(document.jobs)) throw new Error("invalid schema");
        return document.jobs;
      } catch {
        throw new AppError("JOB_STORE_CORRUPT", "本地任务记录损坏，已停止写入以保护原文件。", 500);
      }
    },

    async save(jobs) {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      const raw = JSON.stringify({ schemaVersion: 1, jobs }, null, 2);
      await fs.writeFile(temporaryPath, raw, "utf8");
      await fs.rename(temporaryPath, filePath);
      return jobs;
    },
  };
}
