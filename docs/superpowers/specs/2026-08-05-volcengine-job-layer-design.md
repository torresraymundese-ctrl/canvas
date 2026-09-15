# Volcengine Director and Video Job Layer Design

**Date:** 2026-08-05
**Status:** Approved architecture, pending written-spec review

## Goal

Turn the locally persistent director canvas into an executable workflow that can send scripts to a Volcengine director model, turn the structured result into storyboard tasks, submit confirmed shots to Seedance, track asynchronous work, and write final media back into the canvas without exposing credentials to the browser.

## Confirmed models

- Director default: `doubao-seed-2-0-pro-260215`.
- Low-cost video test default: `doubao-seedance-2-0-mini-260615`.
- Higher-quality selectable video model: `doubao-seedance-2-0-260128`.
- API base URL: `https://ark.cn-beijing.volces.com/api/v3`.
- The browser receives model labels and capability metadata, never `ARK_API_KEY`.

## Chosen architecture

Use a local Node.js service bound to `127.0.0.1`, with the React canvas calling same-origin `/api/*` routes through the Vite development proxy or through the local production server. The service owns configuration, Volcengine adapters, the task queue, polling, local result downloads, and durable job metadata.

This phase remains local-first because the user explicitly requires runtime and final project data under `D:\画布`. The Sites worker remains buildable for the existing frontend handoff, but live model execution is not exposed by that hosted worker in this phase. A future hosted version will map structured state to D1 and media bytes to R2 rather than copying the local file implementation into cloud code.

## Alternatives rejected

1. Direct browser-to-Ark requests were rejected because they expose the API key and make cost controls unenforceable.
2. Immediate Cloudflare Worker, D1, and R2 deployment was deferred because it conflicts with the current local-file requirement and adds account/storage setup before the workflow is validated.

## Runtime layout

```text
D:\画布
├── .env                         # local secret values; ignored by source control
├── .env.example                 # variable names and safe defaults only
├── runtime
│   ├── jobs.json                # authoritative local job records
│   ├── jobs.json.tmp            # atomic-write staging file
│   └── outputs
│       └── <job-id>.mp4         # downloaded completed videos
├── server
│   ├── index.js                 # local HTTP/static entry point
│   ├── config.js                # validated environment configuration
│   ├── apiRouter.js             # request validation and response mapping
│   ├── jobStore.js              # atomic job persistence
│   ├── jobQueue.js              # concurrency, transitions, retry, cancel
│   └── providers
│       ├── registry.js           # provider lookup by role and model id
│       ├── mockProvider.js       # no-cost end-to-end test provider
│       ├── arkDirector.js        # script-to-storyboard adapter
│       └── arkVideo.js           # Seedance create/get adapter
└── src
    ├── apiClient.js              # browser API wrapper
    ├── jobState.js               # pure client job transformations
    ├── hooks/useJobQueue.js      # polling and user actions
    └── components/TaskCenter.jsx # compact queue UI
```

## Configuration

The local process reads these environment variables:

- `ARK_API_KEY`: required only in live mode.
- `ARK_BASE_URL`: defaults to `https://ark.cn-beijing.volces.com/api/v3`.
- `ARK_DIRECTOR_MODEL`: defaults to `doubao-seed-2-0-pro-260215`.
- `ARK_VIDEO_MODEL`: defaults to `doubao-seedance-2-0-mini-260615`.
- `MODEL_EXECUTION_MODE`: either `mock` or `live`; defaults to `mock` so opening the project never spends money.
- `JOB_CONCURRENCY`: defaults to `1` to prevent accidental parallel video charges.
- `LOCAL_APP_PORT`: defaults to `4173` for the combined local production server.

Configuration validation fails at process startup when live mode lacks an API key or uses a non-HTTPS Ark base URL. Errors name the missing variable without printing its value.

## Job model and state machine

Every director or video call is represented by a durable job:

```json
{
  "id": "job_<uuid>",
  "type": "director",
  "status": "queued",
  "provider": "volcengine-ark",
  "modelId": "doubao-seed-2-0-pro-260215",
  "nodeId": "storyboard",
  "projectId": "spring-god-episode-1",
  "idempotencyKey": "project:node:payload-hash",
  "attempt": 1,
  "createdAt": "2026-08-05T00:00:00.000Z",
  "updatedAt": "2026-08-05T00:00:00.000Z",
  "input": {},
  "remoteTaskId": null,
  "progress": 0,
  "result": null,
  "error": null
}
```

Allowed transitions are:

```text
queued -> running -> succeeded
queued -> canceled
running -> failed
running -> canceled_requested -> canceled
failed -> queued (explicit retry; attempt increments)
```

The first implementation runs one job at a time. Duplicate active submissions with the same idempotency key return the existing job. Jobs are written by serializing to `jobs.json.tmp` and renaming it to `jobs.json`, so a process interruption cannot leave a partially written primary file.

Queued jobs cancel immediately. A running Seedance task cannot be assumed to support upstream cancellation, so cancel marks it `canceled_requested`, stops local polling, and prevents result attachment; the UI explicitly says the provider may still charge for work already submitted.

## API surface

All request bodies have a 2 MB maximum and JSON content type.

- `GET /api/health` returns service status, execution mode, and whether credentials are configured; it never returns secrets.
- `GET /api/models` returns role, label, model id, selected default, provider, and capabilities.
- `GET /api/jobs?projectId=<id>` returns newest jobs first.
- `GET /api/jobs/:id` returns one job.
- `POST /api/jobs/director` accepts `projectId`, `nodeId`, `script`, `shotCount`, and optional `modelId`.
- `POST /api/jobs/video` accepts `projectId`, `nodeId`, `shotId`, `prompt`, `ratio`, `duration`, `generateAudio`, optional public reference-image URLs, and optional `modelId`.
- `POST /api/jobs/:id/retry` retries only a failed job.
- `POST /api/jobs/:id/cancel` cancels a queued or running job according to the state rules above.

Invalid JSON, missing fields, unknown models, unsupported ratios/durations, illegal state transitions, and oversized scripts return stable error codes plus Chinese user-facing messages.

## Provider boundaries

All providers implement the same small interface:

```js
{
  executeDirector(input, context): Promise<DirectorResult>,
  createVideoTask(input, context): Promise<{ remoteTaskId: string }>,
  getVideoTask(remoteTaskId, context): Promise<VideoTaskResult>
}
```

`mockProvider` implements the interface without network access. It returns deterministic storyboard JSON and a local demo video, which allows all queue and UI behavior to be exercised before the API key is placed in `.env`.

`arkDirector` sends the script and a strict output contract to the Ark text-generation API. It accepts only a parsed object matching the director result schema; prose, missing shots, duplicate shot ids, or malformed durations fail the job instead of silently creating corrupt canvas nodes.

The director result contains:

```json
{
  "title": "string",
  "logline": "string",
  "characters": [{ "id": "character_1", "name": "string", "visual": "string" }],
  "visualBible": {
    "tone": "string",
    "palette": ["string"],
    "locations": [{ "id": "location_1", "name": "string", "visual": "string" }]
  },
  "shots": [{
    "id": "S001",
    "title": "string",
    "durationSeconds": 5,
    "camera": "string",
    "action": "string",
    "dialogue": "string",
    "continuity": "string",
    "prompt": "string",
    "negativePrompt": "string"
  }]
}
```

`arkVideo` submits `model` plus the ordered text/image content to `/contents/generations/tasks`, then polls `/contents/generations/tasks/:id`. Ark's current create-task contract expresses ratio and duration as `--ratio` and `--dur` controls in the text prompt, so the adapter appends those controls there instead of inventing unsupported top-level fields. The current contract does not document a top-level audio switch; the user's audio preference is therefore expressed as a clear prompt instruction. A successful remote URL is downloaded immediately to `runtime/outputs/<job-id>.mp4` because provider URLs can expire. The canvas uses the local `/outputs/<job-id>.mp4` URL.

## Polling, retry, and failure handling

- Seedance status polling starts at 3 seconds and backs off to 10 seconds.
- One video job may poll for at most 20 minutes before becoming `failed` with `REMOTE_TIMEOUT`.
- Ark create/get requests retry network errors, HTTP 429, and HTTP 5xx up to three attempts with jittered exponential backoff.
- HTTP 400/401/403 errors are never automatically retried.
- Failed jobs retain the safe request metadata and normalized error, but never store authorization headers or API keys.
- The queue resumes `queued` jobs after restart. Jobs that were `running` during an unclean shutdown are returned to `queued` with an incremented recovery count; the video adapter first resumes polling when a remote task id exists rather than submitting a duplicate task.

## Cost and user-control rules

- Mock mode is the default.
- Script analysis requires an explicit “开始拆分” action.
- Video generation requires explicit confirmation for selected shots; opening a project or restoring state never submits work.
- The first live test submits one five-second shot to `doubao-seedance-2-0-mini-260615`.
- The queue default concurrency is one.
- The UI shows the selected model, duration, resolution/ratio, and an “将产生真实费用” warning before a live submission.
- Cost displayed before the API reports real usage is labeled “预估”, never presented as a settled charge.

## Canvas integration

- The existing top-bar generate button opens a confirmation step instead of directly mutating fake node statuses.
- A compact Task Center opens from the top bar and lists active/recent jobs with model, node, elapsed time, progress, retry, and cancel actions.
- Director jobs append status messages to the existing Director Agent timeline.
- A successful director job updates story, world, character, and storyboard content through one undoable canvas transaction.
- Each returned shot produces a storyboard item with a confirmed/unconfirmed state.
- Confirmed shots create Seedance jobs individually in this phase; automatic whole-episode and batch submission remain outside the delivery boundary.
- Video nodes show queued, generating, failed, or playable states derived from their linked job.
- Refreshing the canvas reconnects to durable server jobs instead of treating browser local storage as the authoritative source for generation state.

## Security boundary

- `.env` is excluded from all sync, build, and hosting artifacts.
- The server binds to `127.0.0.1` by default.
- Browser responses expose only `credentialsConfigured: true|false`.
- Logs redact authorization headers and common secret fields.
- Remote media downloads enforce HTTPS, a 500 MB limit, a video content-type allowlist, and a 10-minute download timeout.
- User-supplied reference URLs must be HTTPS and are sent only to the selected provider.
- No API credential is written to browser storage, `runtime/jobs.json`, test fixtures, logs, or screenshots.

## Testing strategy

1. Pure tests cover configuration validation, request validation, director result parsing, job state transitions, idempotency, retry eligibility, and client job selectors.
2. Store tests use a temporary directory and verify atomic save/load plus restart recovery.
3. Provider contract tests inject `fetch`, time, and sleep functions; they assert real request/response transformation without contacting Volcengine.
4. Router tests call the local handler with `Request` objects and verify status codes and secret redaction.
5. Existing canvas/state and Sites worker tests remain green.
6. Mock-mode integration starts the local server, submits a director job and a video job, waits for success, and verifies the local playable output route.
7. Live smoke testing is opt-in, uses one five-second Mini video, and runs only after the user creates `D:\画布\.env` locally.

## Delivery boundary

This phase delivers the local service, provider adapters, mock/live switch, durable task queue, Task Center UI, director-to-storyboard execution, individual video submission, local output serving, tests, and safe environment templates.

It does not deliver multi-user authentication, cloud D1/R2 persistence, webhooks exposed to the public internet, automatic generation of an entire episode without confirmation, payment settlement, or long-term cloud media hosting.
