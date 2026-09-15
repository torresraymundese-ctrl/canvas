import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("the Windows installer copies the packaged app and returns success", async (context) => {
  if (process.platform !== "win32") {
    context.skip("Windows batch installer");
    return;
  }

  const sandbox = await mkdtemp(path.join(tmpdir(), "canvas-installer-"));
  const delivery = path.join(sandbox, "delivery");
  const app = path.join(delivery, "app");
  const target = path.join(sandbox, "target");
  const installer = path.join(delivery, "install.cmd");

  await mkdir(path.join(app, "server"), { recursive: true });
  await writeFile(path.join(app, "package.json"), "{}\n", "utf8");
  await writeFile(path.join(app, "server", "index.js"), "export {};\n", "utf8");
  await copyFile(path.join(projectRoot, "scripts", "install-to-canvas.cmd"), installer);

  const result = spawnSync(
    "cmd.exe",
    ["/d", "/c", `call ${installer} ${target}`],
    { encoding: "utf8", input: "\r\n", timeout: 15_000 },
  );

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.equal(
    await readFile(path.join(target, "server", "index.js"), "utf8"),
    "export {};\n",
  );
});
