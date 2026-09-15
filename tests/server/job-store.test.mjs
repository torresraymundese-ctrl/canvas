import assert from "node:assert/strict";
import * as realFs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createJobStore } from "../../server/jobStore.js";

const jobs = [
  {
    id: "job_1",
    type: "director",
    status: "queued",
    projectId: "spring-god-episode-1",
    input: { script: "第一场" },
  },
];

async function createTemporaryStore(t) {
  const directory = await realFs.mkdtemp(path.join(os.tmpdir(), "director-job-store-"));
  t.after(() => realFs.rm(directory, { recursive: true, force: true }));
  return {
    directory,
    filePath: path.join(directory, "runtime", "jobs.json"),
  };
}

test("jobs survive a fresh store instance", async (t) => {
  const { filePath } = await createTemporaryStore(t);
  await createJobStore({ filePath }).save(jobs);

  const restored = await createJobStore({ filePath }).load();

  assert.deepEqual(restored, jobs);
});

test("a missing job file loads as an empty list", async (t) => {
  const { filePath } = await createTemporaryStore(t);

  assert.deepEqual(await createJobStore({ filePath }).load(), []);
});

test("failed rename leaves the prior primary file readable", async (t) => {
  const { filePath } = await createTemporaryStore(t);
  const store = createJobStore({ filePath });
  await store.save(jobs);
  const failingFs = {
    mkdir: realFs.mkdir,
    readFile: realFs.readFile,
    writeFile: realFs.writeFile,
    rename: async () => { throw new Error("rename failed"); },
  };

  await assert.rejects(
    () => createJobStore({ filePath, fs: failingFs }).save([{ ...jobs[0], id: "job_2" }]),
    /rename failed/,
  );
  assert.deepEqual(await store.load(), jobs);
});

test("corrupt job JSON is reported without replacing it", async (t) => {
  const { filePath } = await createTemporaryStore(t);
  await realFs.mkdir(path.dirname(filePath), { recursive: true });
  await realFs.writeFile(filePath, "{broken", "utf8");

  await assert.rejects(
    () => createJobStore({ filePath }).load(),
    (error) => error.code === "JOB_STORE_CORRUPT",
  );
  assert.equal(await realFs.readFile(filePath, "utf8"), "{broken");
});
