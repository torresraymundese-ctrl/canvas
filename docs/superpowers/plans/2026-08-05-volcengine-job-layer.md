# Volcengine Director and Video Job Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This workspace is not a Git repository, so verified local checkpoints replace commits.

**Goal:** Add a safe local execution service that converts imported scripts into structured director output, queues confirmed Seedance video jobs, tracks them durably, and returns playable local results to the canvas.

**Architecture:** A Node.js service bound to `127.0.0.1` owns configuration, Ark credentials, provider adapters, job persistence, polling, downloads, and static production serving. The React frontend uses same-origin `/api` calls, keeps only UI preferences in browser storage, and derives generation status from the server job store. Mock execution is the default; live execution is opt-in through `D:\画布\.env`.

**Tech Stack:** Node.js 24 built-ins (`http`, `fetch`, `fs/promises`, `crypto`), React 19, Vite 6, `@xyflow/react` 12, Node built-in test runner, Volcengine Ark REST APIs.

## Global Constraints

- Preserve the approved Director Agent visual direction and infinite-canvas interactions.
- Store runtime job metadata and generated output under `D:\画布\runtime`.
- Never send, log, persist, build, or sync `ARK_API_KEY` outside the local process environment.
- Default `MODEL_EXECUTION_MODE` to `mock`; live work happens only after explicit confirmation.
- Default video concurrency to one and use `doubao-seedance-2-0-mini-260615` for the first five-second live test.
- Keep Director, image, and video model selection independent.
- Keep `.openai/hosting.json`, `worker/index.js`, Sites packaging, and existing worker tests intact.
- Every production behavior starts with a failing test and ends with a green full test run.

---

### Task 1: Validated configuration, model catalog, and request inputs

**Files:**
- Create: `.env.example`
- Create: `.gitignore`
- Create: `server/config.js`
- Create: `server/modelCatalog.js`
- Create: `server/inputValidation.js`
- Create: `tests/server/config-and-validation.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces `loadConfig(env, cwd) -> AppConfig`.
- Produces `listModels(config)`, `getModel(config, role, modelId)`.
- Produces `validateDirectorInput(body, config)` and `validateVideoInput(body, config)`.
- Produces `AppError` with `code`, `message`, and `httpStatus`.

- [ ] **Step 1: Make the test runner discover all test files**

Change the package script to:

```json
"test": "node --test"
```

- [ ] **Step 2: Write failing configuration and validation tests**

```js
test("mock mode supplies safe model defaults without a key", () => {
  const config = loadConfig({}, "C:/project");
  assert.equal(config.executionMode, "mock");
  assert.equal(config.directorModel, "doubao-seed-2-0-pro-260215");
  assert.equal(config.videoModel, "doubao-seedance-2-0-mini-260615");
  assert.equal(config.credentialsConfigured, false);
});

test("live mode requires a key without revealing it", () => {
  assert.throws(
    () => loadConfig({ MODEL_EXECUTION_MODE: "live" }, "C:/project"),
    (error) => error.code === "CONFIG_ARK_API_KEY_REQUIRED"
      && !error.message.includes("undefined"),
  );
});

test("director input requires a real script and bounded shot count", () => {
  assert.equal(validateDirectorInput({
    projectId: "spring-god-episode-1",
    nodeId: "storyboard",
    script: "第一场：雨夜古寺",
    shotCount: 6,
  }, config).shotCount, 6);
  assert.throws(() => validateDirectorInput({ script: " ", shotCount: 6 }, config));
  assert.throws(() => validateDirectorInput({ script: "场景", shotCount: 61 }, config));
});

test("video input allows only catalog models and supported generation parameters", () => {
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
  assert.equal(input.duration, 5);
  assert.throws(() => validateVideoInput({ ...input, modelId: "unknown" }, config));
});
```

- [ ] **Step 3: Run the new test and verify RED**

Run: `npm.cmd test -- tests/server/config-and-validation.test.mjs`

Expected: fail because `server/config.js`, `server/modelCatalog.js`, and `server/inputValidation.js` do not exist.

- [ ] **Step 4: Implement minimal validated configuration and catalog**

Use these fixed catalog entries:

```js
export const MODEL_CATALOG = [
  { role: "director", id: "doubao-seed-2-0-pro-260215", label: "Doubao Seed 2.0 Pro", provider: "volcengine-ark" },
  { role: "video", id: "doubao-seedance-2-0-mini-260615", label: "Seedance 2.0 Mini", provider: "volcengine-ark", ratios: ["16:9", "9:16", "1:1"], durations: [5, 10] },
  { role: "video", id: "doubao-seedance-2-0-260128", label: "Seedance 2.0", provider: "volcengine-ark", ratios: ["16:9", "9:16", "1:1"], durations: [5, 10] },
];
```

`loadConfig` must normalize `mock|live`, parse concurrency as `1..3`, resolve `runtime/jobs.json` and `runtime/outputs`, require HTTPS for the Ark base URL, and never include the API key in serialized health/model responses.

- [ ] **Step 5: Add secret-safe local templates**

`.env.example` contains names and defaults only:

```dotenv
MODEL_EXECUTION_MODE=mock
ARK_API_KEY=
ARK_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
ARK_DIRECTOR_MODEL=doubao-seed-2-0-pro-260215
ARK_VIDEO_MODEL=doubao-seedance-2-0-mini-260615
JOB_CONCURRENCY=1
LOCAL_APP_PORT=4173
```

`.gitignore` must include `.env`, `runtime/jobs.json`, `runtime/jobs.json.tmp`, and `runtime/outputs/*`, while keeping `runtime/outputs/.gitkeep` possible.

- [ ] **Step 6: Run the focused and full tests**

Run: `npm.cmd test -- tests/server/config-and-validation.test.mjs`

Run: `npm.cmd test`

Expected: all tests pass.

### Task 2: Strict director-result parsing

**Files:**
- Create: `server/directorResult.js`
- Create: `tests/server/director-result.test.mjs`

**Interfaces:**
- Consumes raw model output text and expected shot count.
- Produces `parseDirectorResult(rawText, options) -> DirectorResult`.
- Throws `DIRECTOR_RESULT_INVALID` with field-level `details`.

- [ ] **Step 1: Write failing result-schema tests**

```js
const valid = {
  title: "春神遗骸",
  logline: "少女在春祭发现苏醒遗骸。",
  characters: [{ id: "character_1", name: "沈春", visual: "黑发青衣" }],
  visualBible: {
    tone: "东方悬疑",
    palette: ["冷青", "暗金"],
    locations: [{ id: "location_1", name: "古寺", visual: "雨夜石阶" }],
  },
  shots: [{
    id: "S001", title: "春祭开场", durationSeconds: 5,
    camera: "大全景缓慢推进", action: "人群穿过雨幕", dialogue: "",
    continuity: "主角青衣保持一致", prompt: "电影感雨夜古寺",
    negativePrompt: "文字，水印",
  }],
};

test("a valid director result is normalized", () => {
  const result = parseDirectorResult(JSON.stringify(valid), { expectedShotCount: 1 });
  assert.equal(result.shots[0].id, "S001");
});

test("code fences are accepted but duplicate shot ids are rejected", () => {
  assert.equal(parseDirectorResult(`\`\`\`json\n${JSON.stringify(valid)}\n\`\`\``, { expectedShotCount: 1 }).shots.length, 1);
  assert.throws(
    () => parseDirectorResult(JSON.stringify({ ...valid, shots: [valid.shots[0], valid.shots[0]] }), { expectedShotCount: 2 }),
    (error) => error.code === "DIRECTOR_RESULT_INVALID",
  );
});
```

- [ ] **Step 2: Run and verify RED**

Run: `npm.cmd test -- tests/server/director-result.test.mjs`

Expected: module-not-found failure.

- [ ] **Step 3: Implement strict normalization**

Validate non-empty strings, unique ids, `S001`-style shot ids, duration `1..30`, arrays for palette/characters/locations/shots, exact requested shot count, and a maximum serialized result size of 2 MB. Strip one outer Markdown JSON fence before parsing. Return new objects with trimmed strings; do not retain unknown fields.

- [ ] **Step 4: Run focused and full tests**

Run both the focused test and `npm.cmd test`; expect green.

### Task 3: Job domain, idempotency, atomic storage, and restart recovery

**Files:**
- Create: `server/jobDomain.js`
- Create: `server/jobStore.js`
- Create: `tests/server/job-domain.test.mjs`
- Create: `tests/server/job-store.test.mjs`

**Interfaces:**
- Produces `createJob(input, deps)`, `transitionJob(job, nextStatus, patch, now)`, `retryJob(job, now)`, `cancelJob(job, now)`, `recoverJobs(jobs, now)`.
- Produces `createIdempotencyKey(type, input)` using SHA-256 over a canonical payload.
- Produces `createJobStore({ filePath, fs })` with `load()` and `save(jobs)`.

- [ ] **Step 1: Write failing state-machine tests**

```js
test("job transitions follow the allowed state machine", () => {
  const queued = createJob(directorInput, { id: "job_1", now: fixedNow });
  const running = transitionJob(queued, "running", {}, fixedNow);
  const succeeded = transitionJob(running, "succeeded", { result: { shots: [] } }, fixedNow);
  assert.equal(succeeded.status, "succeeded");
  assert.throws(() => transitionJob(succeeded, "running", {}, fixedNow));
});

test("idempotency ignores object key order but includes model and payload", () => {
  assert.equal(
    createIdempotencyKey("video", { prompt: "雨", duration: 5, modelId: "mini" }),
    createIdempotencyKey("video", { modelId: "mini", duration: 5, prompt: "雨" }),
  );
});

test("restart recovery resumes remote video polling instead of resubmitting", () => {
  const [recovered] = recoverJobs([{ ...runningVideo, remoteTaskId: "remote_1" }], fixedNow);
  assert.equal(recovered.status, "queued");
  assert.equal(recovered.resumeRemote, true);
});
```

- [ ] **Step 2: Write failing atomic-store tests**

Use `mkdtemp` under the operating-system temporary directory. Save two jobs, load them with a fresh store, and assert equality. Inject an `fs` wrapper that throws during rename; verify the prior `jobs.json` remains parseable.

- [ ] **Step 3: Run and verify RED**

Run: `npm.cmd test -- tests/server/job-domain.test.mjs tests/server/job-store.test.mjs`

- [ ] **Step 4: Implement the pure job domain**

Keep the transition table literal and reject every undeclared transition. Normalize errors to `{ code, message, retryable }`. `retryJob` must accept only failed jobs, increment `attempt`, clear `error`, keep input, and clear a failed remote task id.

- [ ] **Step 5: Implement atomic persistence**

Persist exactly:

```json
{ "schemaVersion": 1, "jobs": [] }
```

Ensure the parent directory exists, write UTF-8 JSON to `.tmp`, then rename. A missing file loads as `[]`; invalid JSON raises `JOB_STORE_CORRUPT` and never overwrites the corrupt file automatically.

- [ ] **Step 6: Run focused and full tests**

Expect all green.

### Task 4: Retry utility and mock/Ark provider adapters

**Files:**
- Create: `server/providers/retry.js`
- Create: `server/providers/mockProvider.js`
- Create: `server/providers/arkDirector.js`
- Create: `server/providers/arkVideo.js`
- Create: `server/providers/registry.js`
- Create: `tests/server/providers.test.mjs`

**Interfaces:**
- Produces `withRetry(operation, options)`.
- Produces `createMockProvider(deps)`, `createArkDirector(deps)`, `createArkVideo(deps)`.
- Produces `createProviderRegistry(config, deps)` selecting mock or live adapters.

- [ ] **Step 1: Write failing retry and director-adapter tests**

```js
test("retry handles 429 and 5xx but not authentication failures", async () => {
  let calls = 0;
  const result = await withRetry(async () => {
    calls += 1;
    if (calls < 3) throw Object.assign(new Error("limited"), { status: 429 });
    return "ok";
  }, { sleep: async () => {}, random: () => 0, maxAttempts: 3 });
  assert.equal(result, "ok");
  assert.equal(calls, 3);
});

test("Ark director sends the configured model and parses response output", async () => {
  const requests = [];
  const adapter = createArkDirector({
    config,
    fetch: async (url, init) => {
      requests.push({ url, body: JSON.parse(init.body), authorization: init.headers.Authorization });
      return Response.json({ output: [{ type: "message", content: [{ type: "output_text", text: validDirectorJson }] }] });
    },
    sleep: async () => {},
  });
  const result = await adapter.executeDirector(directorInput, { expectedShotCount: 1 });
  assert.equal(requests[0].body.model, "doubao-seed-2-0-pro-260215");
  assert.equal(result.shots.length, 1);
});
```

- [ ] **Step 2: Write failing Seedance contract tests**

Assert `POST /contents/generations/tasks` contains the Mini model and ordered content, with `--ratio` and `--dur` controls appended to the text prompt according to the current Ark contract. Assert the selected audio preference is represented in the prompt without adding an undocumented top-level field. Assert `GET /contents/generations/tasks/remote_1` maps remote states and extracts `content.video_url` only on success.

- [ ] **Step 3: Write failing deterministic mock-provider test**

Submit a one-shot director request and one video request. Assert the director result has exactly one valid shot and the video moves from running to succeeded with `/assets/seedance-demo.mp4`.

- [ ] **Step 4: Run and verify RED**

Run: `npm.cmd test -- tests/server/providers.test.mjs`

- [ ] **Step 5: Implement minimal providers**

Use `Authorization: Bearer ${config.apiKey}` only inside live adapters. Director requests go to `${baseUrl}/responses`. Video create/get use `${baseUrl}/contents/generations/tasks` and `${baseUrl}/contents/generations/tasks/:id`. Normalize remote errors without returning response headers or request authorization.

- [ ] **Step 6: Run focused and full tests**

Expect green and verify no test fixture contains a realistic secret.

### Task 5: Durable single-concurrency job queue and local output download

**Files:**
- Create: `server/downloadVideo.js`
- Create: `server/jobQueue.js`
- Create: `tests/server/job-queue.test.mjs`

**Interfaces:**
- Consumes config, job store, provider registry, `downloadVideo`, clock, and sleep.
- Produces `createJobQueue(deps)` with `initialize`, `submitDirector`, `submitVideo`, `list`, `get`, `retry`, `cancel`, `waitForIdle`, and `close`.

- [ ] **Step 1: Write failing queue behavior tests**

```js
test("duplicate active submissions return the same job", async () => {
  const first = await queue.submitDirector(directorInput);
  const second = await queue.submitDirector(directorInput);
  assert.equal(second.id, first.id);
});

test("the queue runs only one provider operation at a time", async () => {
  await Promise.all([queue.submitVideo(videoA), queue.submitVideo(videoB)]);
  await queue.waitForIdle();
  assert.equal(maxObservedConcurrency, 1);
});

test("a succeeded video is attached as a local output", async () => {
  const job = await queue.submitVideo(videoInput);
  await queue.waitForIdle();
  assert.equal(queue.get(job.id).result.videoUrl, `/outputs/${job.id}.mp4`);
});
```

Also test queued cancellation, running `canceled_requested`, failed retry, remote-task resume after restart, and a 20-minute timeout using injected time/sleep.

- [ ] **Step 2: Write failing safe-download tests**

Reject HTTP URLs, non-video content types, missing content length over the streaming cap, bodies beyond 500 MB, and redirects to HTTP. Verify a successful HTTPS MP4 is written to a temporary output directory and returned as `/outputs/<job>.mp4`.

- [ ] **Step 3: Run and verify RED**

Run: `npm.cmd test -- tests/server/job-queue.test.mjs`

- [ ] **Step 4: Implement the queue pump**

Persist every externally visible transition. Director execution completes in one provider call. Video execution creates a remote task unless `resumeRemote` and `remoteTaskId` are present, polls with injected delays, updates progress, downloads success output, and stops when cancel was requested.

- [ ] **Step 5: Implement constrained download streaming**

Use a temporary `.part` file, stream with an accumulated byte count, rename only after successful completion, and remove only the exact `.part` file on failure. Never delete broad directories.

- [ ] **Step 6: Run focused and full tests**

Expect green.

### Task 6: Local API router, combined app server, and health contract

**Files:**
- Create: `server/apiRouter.js`
- Create: `server/staticFiles.js`
- Create: `server/index.js`
- Create: `tests/server/api-router.test.mjs`
- Create: `tests/server/local-server.test.mjs`
- Modify: `vite.config.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces `createApiHandler({ config, queue, models }) -> (Request) => Promise<Response>`.
- Produces `createLocalServer(deps)` serving `/api`, `/outputs`, and the built SPA.

- [ ] **Step 1: Write failing router tests**

Test `GET /api/health`, `GET /api/models`, director/video `POST` returning HTTP 202, list/get, retry/cancel, invalid JSON, 2 MB body limit, unknown route, and error redaction. Assert the health body contains `credentialsConfigured` but not the key.

- [ ] **Step 2: Write failing static/output tests**

Start the server on port `0`, request `/`, an SPA route, a built JS asset, and a known output MP4. Verify traversal attempts such as `/outputs/..%2F.env` return 404.

- [ ] **Step 3: Run and verify RED**

Run: `npm.cmd test -- tests/server/api-router.test.mjs tests/server/local-server.test.mjs`

- [ ] **Step 4: Implement the API handler**

Return `{ data }` on success and `{ error: { code, message, details? } }` on failure. API responses set `cache-control: no-store`. Route ids are decoded once and validated against `job_[a-zA-Z0-9_-]+`.

- [ ] **Step 5: Implement the local production server and dev proxy**

Add scripts:

```json
"start:local": "node --env-file-if-exists=.env server/index.js",
"dev:api": "node --env-file-if-exists=.env server/index.js --api-only --port=4174"
```

Add a Vite dev proxy from `/api` and `/outputs` to `http://127.0.0.1:4174`. The combined server binds `127.0.0.1`, serves `dist/client`, and falls back to `index.html` only for HTML GET/HEAD requests outside `/api` and `/outputs`.

- [ ] **Step 6: Run focused tests, full tests, and build**

Run `npm.cmd test` and `npm.cmd run build`; expect green.

### Task 7: Browser API client, script import, job polling, and Task Center

**Files:**
- Create: `src/apiClient.js`
- Create: `src/jobState.js`
- Create: `src/hooks/useJobQueue.js`
- Create: `src/components/TaskCenter.jsx`
- Create: `src/components/GenerationConfirmDialog.jsx`
- Create: `tests/client/job-state.test.mjs`
- Modify: `src/canvasState.js`
- Modify: `src/projectPersistence.js`
- Modify: `src/components/DirectorPanel.jsx`
- Modify: `src/components/TopBar.jsx`
- Modify: `src/styles.css`

**Interfaces:**
- Produces `createApiClient(fetch)` with health/models/jobs/create/retry/cancel methods.
- Produces pure `sortJobs`, `getActiveJobs`, `getNodeJobStatus`, and `getJobActionAvailability`.
- Produces `useJobQueue({ projectId })` with jobs, service state, submit/retry/cancel, refresh, and Task Center state.

- [ ] **Step 1: Write failing client job-state tests**

```js
test("active jobs are ordered before recent terminal jobs", () => {
  assert.deepEqual(sortJobs([succeededOld, runningNew, queuedOld]).map((job) => job.id), [runningNew.id, queuedOld.id, succeededOld.id]);
});

test("job actions match status safety rules", () => {
  assert.deepEqual(getJobActionAvailability({ status: "queued" }), { canCancel: true, canRetry: false });
  assert.deepEqual(getJobActionAvailability({ status: "failed" }), { canCancel: false, canRetry: true });
});
```

- [ ] **Step 2: Write failing reducer tests for real imported scripts**

Dispatch `set-script` with `{ name, size, content }`; assert it becomes durable canvas state. Reject empty content without replacing the prior script. Add `set-run-state` and job-derived node-status actions without embedding full server jobs in local storage.

- [ ] **Step 3: Run and verify RED**

Run: `npm.cmd test -- tests/client/job-state.test.mjs tests/canvas-state.test.mjs`

- [ ] **Step 4: Implement the API client and pure selectors**

The client must parse the normalized error envelope, throw errors carrying `code`, and never retry POST submissions in the browser. Poll active jobs every two seconds and terminal-only lists every ten seconds; pause polling when the document is hidden.

- [ ] **Step 5: Replace the fake imported-script control**

`DirectorPanel` gets an accessible `.txt,.md,.json` file input. Read text as UTF-8, limit to 1.5 MB, dispatch `set-script`, show the real filename/size, and expose a “更换剧本” action. Keep the current sample script as an explicit demo value so mock mode works immediately.

- [ ] **Step 6: Implement Task Center and confirmation dialog**

Task Center shows service mode, credentials status, job type, model, node/shot, status, elapsed time, progress, retry/cancel actions, and terminal errors. `GenerationConfirmDialog` shows model, shot count or duration, ratio, execution mode, and a red live-cost warning before calling submit.

- [ ] **Step 7: Enable top-bar actions without changing layout hierarchy**

Replace the fake run mutation with `onRequestDirectorRun`; add a compact Task Center toggle and active-job count. Preserve undo/redo and autosave controls.

- [ ] **Step 8: Run tests and build**

Expect all green.

### Task 8: Director result and Seedance result integration with the graph

**Files:**
- Create: `src/workflowResults.js`
- Create: `tests/client/workflow-results.test.mjs`
- Modify: `src/App.jsx`
- Modify: `src/components/CanvasStage.jsx`
- Modify: `src/components/ContentViewer.jsx`
- Modify: `src/components/WorkflowNode.jsx`
- Modify: `src/canvasFeatures.js`

**Interfaces:**
- Produces `applyDirectorResult(graph, result) -> graph`.
- Produces `attachVideoResult(graph, job) -> graph`.
- Consumes `useJobQueue` and commits each result only once through `useProjectGraph.commitGraph`.

- [ ] **Step 1: Write failing graph-result tests**

```js
test("director output updates workflow viewers in one graph snapshot", () => {
  const next = applyDirectorResult(initialGraph, directorResult);
  assert.equal(next.nodes.find((node) => node.id === "story").data.viewer.title, directorResult.title);
  assert.equal(next.nodes.find((node) => node.id === "storyboard").data.viewer.shots.length, directorResult.shots.length);
});

test("a succeeded video job becomes a playable node result", () => {
  const next = attachVideoResult(initialGraph, succeededVideoJob);
  const video = next.nodes.find((node) => node.id === "video");
  assert.equal(video.data.viewer.mediaType, "video");
  assert.equal(video.data.viewer.src, succeededVideoJob.result.videoUrl);
});
```

Also assert repeated application of the same job id is idempotent and unknown node ids do not mutate the graph.

- [ ] **Step 2: Run and verify RED**

Run: `npm.cmd test -- tests/client/workflow-results.test.mjs`

- [ ] **Step 3: Implement result transformations**

Store `appliedJobIds` in graph metadata or node data, update the story/world/characters/storyboard viewers, preserve positions and edges, and generate storyboard shot entries with confirmation state. Video attachment updates viewer and preview while preserving node contracts.

- [ ] **Step 4: Integrate App orchestration**

Initialize `useJobQueue`, open confirmation from the top bar, submit the imported script, append job messages to Director Agent, apply newly succeeded director jobs through one `commitGraph`, and apply newly succeeded video jobs once. Server jobs, not optimistic reducer actions, drive queued/running/failed/succeeded node statuses.

- [ ] **Step 5: Add individual shot generation**

In the storyboard viewer, each shot has a confirmation checkbox and “生成视频” action. Submitting a shot uses its prompt, current video model, 5 seconds, and selected ratio. Disable duplicate submission while an active job exists for the same shot.

- [ ] **Step 6: Run focused and full tests plus build**

Expect all green.

### Task 9: Mock integration, documentation, final-folder verification, and safe live handoff

**Files:**
- Create: `tests/server/mock-integration.test.mjs`
- Create: `runtime/outputs/.gitkeep`
- Modify: `AGENTS.md`
- Modify: `design-qa.md`
- Modify: `README.md` if present; otherwise create it
- Sync verified files to: `D:\画布`

**Interfaces:**
- Preserves the Sites packaging contract and provides a local `start:local` entry point.

- [ ] **Step 1: Write the failing mock integration test**

Start the combined server on port `0` with a temporary runtime directory, submit a two-shot director job, wait for terminal status, submit one video job from the first shot, wait for success, and fetch the returned local video URL. Assert both HTTP responses and the final MP4 route succeed.

- [ ] **Step 2: Run and verify RED, then implement missing integration glue**

Only implement behavior needed to make this test pass; do not contact Volcengine.

- [ ] **Step 3: Run complete verification in the staging directory**

Run:

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run test:sites
```

Expected: zero failures. Treat the existing Vite chunk-size warning as non-blocking unless it grows materially.

- [ ] **Step 4: Start the combined local app in mock mode**

Run `npm.cmd run start:local` from the verified project and confirm:

- `/` returns HTTP 200.
- `/api/health` reports `executionMode: "mock"` and `credentialsConfigured: false`.
- One mock director job and one mock video job reach `succeeded`.
- The returned video URL is playable from the local server.

- [ ] **Step 5: Update durable documentation**

Record model ids, runtime directories, mock-default rule, live-cost confirmation, commands, generated artifacts, and the fact that `.env` is local-only. Record the browser local-URL visual-QA limitation separately from functional HTTP verification.

- [ ] **Step 6: Sync verified files to `D:\画布` and rerun all checks there**

Copy only project files and safe runtime scaffolding; never copy `.env`, `runtime/jobs.json`, temporary files, or generated outputs from staging. Run all three verification commands in `D:\画布`, then start the final local service and confirm HTTP 200.

- [ ] **Step 7: Prepare, but do not execute, the live smoke test**

The user locally creates `D:\画布\.env` from `.env.example`, changes `MODEL_EXECUTION_MODE=live`, and fills `ARK_API_KEY`. After explicit confirmation, submit one five-second `doubao-seedance-2-0-mini-260615` shot. Do not submit the live job during implementation or verification without that confirmation.
