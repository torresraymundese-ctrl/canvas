# Director Canvas One-Click Launcher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Windows launcher that starts the installed director canvas in a minimized service window, waits for readiness, opens the browser, and avoids duplicate services.

**Architecture:** A small ASCII-only batch implementation in `scripts/start-canvas.cmd` owns validation, health checks, process launch, readiness waiting, and browser opening. A root-level `启动画布.cmd` delegates to that implementation with its own directory as the target. Tests execute the real wrapper and launcher against a temporary fake local server.

**Tech Stack:** Windows `cmd.exe`, Node.js 24, PowerShell `Invoke-WebRequest` for loopback health checks, Node built-in test runner.

## Global Constraints

- The normal entry point is exactly `D:\画布\启动画布.cmd`.
- The service binds only to `127.0.0.1:4187` and opens `http://127.0.0.1:4187/`; this avoids the legacy Vite preview on 4173.
- The service window starts minimized and remains available for the user to close.
- Repeated launches open the page without creating a second service process.
- Launcher file contents remain ASCII-only to prevent `cmd.exe` from corrupting UTF-8 Chinese commands.
- The launcher never creates, reads, displays, or modifies an API key.
- Existing `.env` and `runtime/jobs.json` files are preserved.
- This directory has no Git repository, so each task ends with a verified filesystem checkpoint rather than a Git commit.

---

### Task 1: Executable Launcher Contract

**Files:**
- Create: `tests/launcher-script.test.mjs`
- Create: `scripts/start-canvas.cmd`
- Create: `启动画布.cmd`

**Interfaces:**
- Consumes: `node server/index.js --port=<port>` and `GET /api/health`.
- Produces: `scripts/start-canvas.cmd [targetDir] [--no-browser]`; root wrapper `启动画布.cmd [--no-browser]`.

- [ ] **Step 1: Write the failing integration test**

Create a temporary delivery directory containing the real root wrapper and launcher plus a fake `server/index.js`. The fake server must increment `startup-count.txt`, write its PID to `server.pid`, and return HTTP 200 from `/api/health`. Reserve an unused loopback port and pass it through `LOCAL_APP_PORT`.

```js
const result = spawnSync("cmd.exe", ["/d", "/c", `call ${wrapper} --no-browser`], {
  env: { ...process.env, LOCAL_APP_PORT: String(port) },
  encoding: "utf8",
  timeout: 15_000,
});
assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
assert.equal(await readFile(path.join(delivery, "startup-count.txt"), "utf8"), "1");

const second = spawnSync("cmd.exe", ["/d", "/c", `call ${wrapper} --no-browser`], {
  env: { ...process.env, LOCAL_APP_PORT: String(port) },
  encoding: "utf8",
  timeout: 15_000,
});
assert.equal(second.status, 0);
assert.equal(await readFile(path.join(delivery, "startup-count.txt"), "utf8"), "1");
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test tests/launcher-script.test.mjs`

Expected: FAIL because `启动画布.cmd` and `scripts/start-canvas.cmd` do not exist.

- [ ] **Step 3: Implement the minimal ASCII launcher**

The implementation must:

```bat
@echo off
setlocal
set "TARGET=%~1"
set "MODE=%~2"
if not defined LOCAL_APP_PORT set "LOCAL_APP_PORT=4187"
set "CANVAS_URL=http://127.0.0.1:%LOCAL_APP_PORT%/"
set "HEALTH_URL=http://127.0.0.1:%LOCAL_APP_PORT%/api/health"
```

If `TARGET` is absent, construct `D:\画布` using PowerShell `[char]30011` and `[char]24067`. Validate `package.json`, `server\index.js`, and `node.exe`. Probe `HEALTH_URL`; when already healthy, skip process creation. Otherwise launch:

```bat
start "Director Canvas Service" /min /D "%TARGET%" cmd.exe /c node.exe --env-file-if-exists=.env server/index.js --port=%LOCAL_APP_PORT%
```

Poll for up to 15 seconds. On success, open `CANVAS_URL` unless `MODE` is `--no-browser`. Every error branch prints an ASCII error code, calls `pause`, and exits non-zero.

The root wrapper delegates without duplicating logic:

```bat
@echo off
call "%~dp0scripts\start-canvas.cmd" "%~dp0" %*
exit /b %ERRORLEVEL%
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `node --test tests/launcher-script.test.mjs`

Expected: PASS; `startup-count.txt` remains `1` after two launches.

- [ ] **Step 5: Record the filesystem checkpoint**

Run: `Get-FileHash scripts\start-canvas.cmd, 启动画布.cmd; npm.cmd test`

Expected: both launchers have stable hashes and the full suite reports zero failures.

### Task 2: Documentation and Delivery Package

**Files:**
- Modify: `README.md`
- Modify: `D:\Codex干活\画布交付包-20260805-安全版\app\scripts\start-canvas.cmd`
- Create: `D:\Codex干活\画布交付包-20260805-安全版\app\启动画布.cmd`
- Create: `D:\Codex干活\画布交付包-20260805-安全版\启动画布.cmd`
- Modify: `D:\Codex干活\画布交付包-20260805-安全版\请先看这里.txt`

**Interfaces:**
- Consumes: the verified files produced by Task 1.
- Produces: a delivery package whose installer copies the root launcher and implementation into `D:\画布`.

- [ ] **Step 1: Add the user instructions**

Document the exact usage:

```text
双击 D:\画布\启动画布.cmd。
后台服务窗口会自动最小化，浏览器会在服务就绪后打开。
关闭标题为 Director Canvas Service 的窗口即可停止服务。
```

State that mock mode remains free and that the launcher does not touch `.env`.

- [ ] **Step 2: Refresh the delivery package mechanically**

Copy the verified root wrapper, launcher implementation, launcher test, README, and design/plan documents into the existing safe delivery package. Do not copy `.env`, `runtime/jobs.json`, generated videos, logs, `node_modules`, or temporary files.

- [ ] **Step 3: Verify the delivery package**

Run the package launcher against a fresh writable verification directory with `--no-browser`. Confirm `server/index.js`, `README.md`, and `启动画布.cmd` exist, and confirm `.env` and `runtime/jobs.json` do not exist.

- [ ] **Step 4: Run full verification**

Run:

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run test:sites
```

Expected: zero failures; the existing Vite large-chunk warning may remain non-blocking.

- [ ] **Step 5: Record the filesystem checkpoint**

Compare SHA-256 hashes for `scripts/start-canvas.cmd`, `启动画布.cmd`, `README.md`, and `dist/client/index.html` between the source tree and delivery package.

### Task 3: Install and Validate in `D:\画布`

**Files:**
- Create through the approved installer: `D:\画布\启动画布.cmd`
- Create through the approved installer: `D:\画布\scripts\start-canvas.cmd`

**Interfaces:**
- Consumes: the safe delivery package from Task 2.
- Produces: the user-visible one-click start entry in the installed canvas.

- [ ] **Step 1: Install without deleting user data**

Run the corrected `安装到D盘画布.cmd`. Its `robocopy /E` behavior merges verified program files without `/MIR` or deletion. Confirm any existing `.env` and `runtime/jobs.json` hashes remain unchanged.

- [ ] **Step 2: Verify installed hashes**

Compare installed `启动画布.cmd`, `scripts/start-canvas.cmd`, `server/index.js`, and `dist/client/index.html` with the delivery package. All hashes must match.

- [ ] **Step 3: Verify one-click startup without opening a browser**

Run:

```powershell
cmd.exe /d /c "call D:\画布\启动画布.cmd --no-browser"
Invoke-RestMethod http://127.0.0.1:4187/api/health
```

Expected: HTTP 200, `executionMode` equals `mock`, and `credentialsConfigured` equals `false`.

- [ ] **Step 4: Verify duplicate protection**

Run the launcher a second time with `--no-browser`, then check the listener on port 4187. Exactly one service process must own the listener.

- [ ] **Step 5: User acceptance**

Ask the user to double-click `D:\画布\启动画布.cmd`. Expected: a minimized `Director Canvas Service` window remains running and the default browser opens the canvas. Closing that service window must stop the local service.
