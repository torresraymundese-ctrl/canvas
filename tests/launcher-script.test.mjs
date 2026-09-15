import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function reserveLoopbackPort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function waitForFile(filePath, timeoutMs = 5_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      await readFile(filePath, "utf8");
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }
  throw new Error(`Timed out waiting for ${filePath}`);
}

test("the root launcher starts one healthy service across repeated launches", async (context) => {
  if (process.platform !== "win32") {
    context.skip("Windows batch launcher");
    return;
  }

  const sandbox = await mkdtemp(path.join(tmpdir(), "canvas-launcher-"));
  const delivery = path.join(sandbox, "delivery");
  const scripts = path.join(delivery, "scripts");
  const serverDir = path.join(delivery, "server");
  const wrapper = path.join(delivery, "启动画布.cmd");
  const port = await reserveLoopbackPort();

  await mkdir(scripts, { recursive: true });
  await mkdir(serverDir, { recursive: true });
  await writeFile(path.join(delivery, "package.json"), '{"type":"module"}\n', "utf8");
  await writeFile(
    path.join(serverDir, "index.js"),
    `import { readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
const countFile = new URL("../startup-count.txt", import.meta.url);
let count = 0;
try { count = Number(readFileSync(countFile, "utf8")); } catch {}
writeFileSync(countFile, String(count + 1));
writeFileSync(new URL("../server.pid", import.meta.url), String(process.pid));
createServer((request, response) => {
  if (request.url === "/api/health") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ data: { status: "ok" } }));
    return;
  }
  response.writeHead(200, { "content-type": "text/html" });
  response.end("<div id=\\\"root\\\"></div>");
}).listen(Number(process.env.LOCAL_APP_PORT), "127.0.0.1");
`,
    "utf8",
  );
  await writeFile(
    path.join(delivery, "foreign-server.mjs"),
    `import { writeFileSync } from "node:fs";
import { createServer } from "node:http";
const server = createServer((_request, response) => {
  response.writeHead(200, { "content-type": "text/html" });
  response.end("not the canvas service");
  server.close(() => process.exit(0));
});
server.listen(Number(process.env.LOCAL_APP_PORT), "127.0.0.1", () => {
  writeFileSync(new URL("./foreign-ready.txt", import.meta.url), "ready");
});
`,
    "utf8",
  );

  await copyFile(path.join(projectRoot, "scripts", "start-canvas.cmd"), path.join(scripts, "start-canvas.cmd"));
  await copyFile(path.join(projectRoot, "启动画布.cmd"), wrapper);

  context.after(async () => {
    try {
      const pid = Number(await readFile(path.join(delivery, "server.pid"), "utf8"));
      if (Number.isInteger(pid) && pid > 0) process.kill(pid);
    } catch {}
  });

  const environment = { ...process.env, LOCAL_APP_PORT: String(port) };
  const foreign = spawn("node", [path.join(delivery, "foreign-server.mjs")], {
    cwd: delivery,
    detached: false,
    env: environment,
    stdio: "ignore",
    windowsHide: true,
  });
  context.after(() => {
    if (!foreign.killed) foreign.kill();
  });
  await waitForFile(path.join(delivery, "foreign-ready.txt"));

  const command = `call ${wrapper} --no-browser`;
  const first = spawnSync("cmd.exe", ["/d", "/c", command], {
    env: environment,
    stdio: "ignore",
    timeout: 15_000,
    windowsHide: true,
  });

  assert.equal(first.status, 0, first.error?.message);
  assert.equal(await readFile(path.join(delivery, "startup-count.txt"), "utf8"), "1");
  assert.equal((await fetch(`http://127.0.0.1:${port}/api/health`)).status, 200);

  const second = spawnSync("cmd.exe", ["/d", "/c", command], {
    env: environment,
    stdio: "ignore",
    timeout: 15_000,
    windowsHide: true,
  });

  assert.equal(second.status, 0, second.error?.message);
  assert.equal(await readFile(path.join(delivery, "startup-count.txt"), "utf8"), "1");
});
