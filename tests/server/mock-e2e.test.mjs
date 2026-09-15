import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { createApiHandler } from "../../server/apiRouter.js";
import { loadConfig } from "../../server/config.js";
import { downloadVideo } from "../../server/downloadVideo.js";
import { createLocalServer } from "../../server/index.js";
import { createJobQueue } from "../../server/jobQueue.js";
import { createJobStore } from "../../server/jobStore.js";
import { listModels } from "../../server/modelCatalog.js";
import { createProviderRegistry } from "../../server/providers/registry.js";

test("the combined local app completes mock director and video jobs end to end", async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), "director-canvas-e2e-"));
  const config = loadConfig({}, rootDir);
  const store = createJobStore({ filePath: config.jobFile });
  const providers = createProviderRegistry(config);
  const queue = createJobQueue({ config, store, providers, downloadVideo, sleep: async () => {} });
  await queue.initialize();
  const apiHandler = createApiHandler({ config, queue, models: listModels(config) });
  const server = createLocalServer({
    port: 0,
    clientDir: path.resolve("dist/client"),
    outputDir: config.outputDir,
    apiHandler,
  });
  const address = await server.listen();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const page = await fetch(baseUrl);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /<div id="root"><\/div>/);

    const health = await (await fetch(`${baseUrl}/api/health`)).json();
    assert.equal(health.data.executionMode, "mock");

    const directorResponse = await fetch(`${baseUrl}/api/jobs/director`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        projectId: "spring-god-episode-1",
        nodeId: "storyboard",
        script: "第一场：雨夜古庙",
        shotCount: 2,
        modelId: "doubao-seed-2-0-pro-260215",
      }),
    });
    const directorJob = (await directorResponse.json()).data;
    assert.equal(directorResponse.status, 202);
    await queue.waitForIdle();
    const completedDirector = await (await fetch(`${baseUrl}/api/jobs/${directorJob.id}`)).json();
    assert.equal(completedDirector.data.status, "succeeded");
    assert.equal(completedDirector.data.result.shots.length, 2);

    const videoResponse = await fetch(`${baseUrl}/api/jobs/video`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        projectId: "spring-god-episode-1",
        nodeId: "video",
        shotId: "S001",
        prompt: completedDirector.data.result.shots[0].prompt,
        modelId: "doubao-seedance-2-0-mini-260615",
        ratio: "16:9",
        duration: 5,
      }),
    });
    const videoJob = (await videoResponse.json()).data;
    assert.equal(videoResponse.status, 202);
    await queue.waitForIdle();
    const completedVideo = await (await fetch(`${baseUrl}/api/jobs/${videoJob.id}`)).json();
    assert.equal(completedVideo.data.status, "succeeded");
    assert.equal(completedVideo.data.result.videoUrl, "/assets/seedance-demo.mp4");
    assert.equal((await fetch(`${baseUrl}${completedVideo.data.result.videoUrl}`)).status, 200);
  } finally {
    queue.close();
    await server.close();
    await rm(rootDir, { recursive: true, force: true });
  }
});
