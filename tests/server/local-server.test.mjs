import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import { request as httpRequest } from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createLocalServer } from "../../server/index.js";

async function createFixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "director-local-server-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const clientDir = path.join(directory, "client");
  const outputDir = path.join(directory, "outputs");
  await fs.mkdir(path.join(clientDir, "assets"), { recursive: true });
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(path.join(clientDir, "index.html"), "<!doctype html><title>Director</title>");
  await fs.writeFile(path.join(clientDir, "assets", "app.js"), "console.log('app')");
  await fs.writeFile(path.join(outputDir, "job_1.mp4"), new Uint8Array([0, 1, 2, 3]));
  const server = createLocalServer({
    host: "127.0.0.1",
    port: 0,
    clientDir,
    outputDir,
    apiHandler: async () => Response.json({ data: { status: "ok" } }),
  });
  const address = await server.listen();
  t.after(() => server.close());
  return { baseUrl: `http://127.0.0.1:${address.port}` };
}

test("local server serves the app shell and static assets", async (t) => {
  const { baseUrl } = await createFixture(t);
  const root = await fetch(`${baseUrl}/`, { headers: { accept: "text/html" } });
  const route = await fetch(`${baseUrl}/project/episode-1`, { headers: { accept: "text/html" } });
  const asset = await fetch(`${baseUrl}/assets/app.js`);

  assert.equal(root.status, 200);
  assert.match(await root.text(), /Director/);
  assert.equal(route.status, 200);
  assert.match(await route.text(), /Director/);
  assert.equal(asset.headers.get("content-type"), "text/javascript; charset=utf-8");
});

test("local server forwards API requests", async (t) => {
  const { baseUrl } = await createFixture(t);
  const response = await fetch(`${baseUrl}/api/health`);

  assert.equal(response.status, 200);
  assert.equal((await response.json()).data.status, "ok");
});

test("local server streams generated video with range-safe metadata", async (t) => {
  const { baseUrl } = await createFixture(t);
  const response = await fetch(`${baseUrl}/outputs/job_1.mp4`);
  const partial = await fetch(`${baseUrl}/outputs/job_1.mp4`, {
    headers: { range: "bytes=1-2" },
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "video/mp4");
  assert.equal(Number(response.headers.get("content-length")), 4);
  assert.equal(partial.status, 206);
  assert.equal(partial.headers.get("content-range"), "bytes 1-2/4");
  assert.deepEqual(new Uint8Array(await partial.arrayBuffer()), new Uint8Array([1, 2]));
});

test("local server blocks output traversal and missing API fallback", async (t) => {
  const { baseUrl } = await createFixture(t);
  const traversal = await fetch(`${baseUrl}/outputs/..%2F.env`);
  const missingApi = await fetch(`${baseUrl}/api/missing`);

  assert.equal(traversal.status, 404);
  assert.equal(missingApi.status, 200);
  assert.equal(missingApi.headers.get("content-type"), "application/json");
});

test("local server rejects hostile Host and cross-origin mutation requests", async (t) => {
  const { baseUrl } = await createFixture(t);
  const target = new URL(`${baseUrl}/api/health`);
  const hostileHostStatus = await new Promise((resolve, reject) => {
    const request = httpRequest({
      hostname: target.hostname,
      port: target.port,
      path: target.pathname,
      headers: { host: "attacker.example" },
    }, (response) => {
      response.resume();
      resolve(response.statusCode);
    });
    request.on("error", reject);
    request.end();
  });
  const hostileOrigin = await fetch(`${baseUrl}/api/jobs/director`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://attacker.example" },
    body: "{}",
  });

  assert.equal(hostileHostStatus, 403);
  assert.equal(hostileOrigin.status, 403);
});
