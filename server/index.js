import { createServer } from "node:http";
import path from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";

import { createApiHandler } from "./apiRouter.js";
import { loadConfig } from "./config.js";
import { downloadVideo } from "./downloadVideo.js";
import { createJobQueue } from "./jobQueue.js";
import { createJobStore } from "./jobStore.js";
import { listModels } from "./modelCatalog.js";
import { createProviderRegistry } from "./providers/registry.js";
import { createStaticHandler } from "./staticFiles.js";

function toWebRequest(request, host, port) {
  const url = new URL(request.url, `http://${host}:${port}`);
  const init = { method: request.method, headers: request.headers };
  if (!['GET', 'HEAD'].includes(request.method)) {
    init.body = Readable.toWeb(request);
    init.duplex = "half";
  }
  return new Request(url, init);
}

async function sendWebResponse(nodeResponse, webResponse, method) {
  nodeResponse.writeHead(webResponse.status, Object.fromEntries(webResponse.headers.entries()));
  if (method === "HEAD" || !webResponse.body) {
    nodeResponse.end();
    return;
  }
  Readable.fromWeb(webResponse.body).pipe(nodeResponse);
}

export function createLocalServer({
  host = "127.0.0.1",
  port = 4173,
  clientDir,
  outputDir,
  apiHandler,
  apiOnly = false,
}) {
  const staticHandler = createStaticHandler({ clientDir, outputDir, apiOnly });
  const server = createServer(async (request, response) => {
    try {
      const activePort = server.address()?.port ?? port;
      const hostHeader = request.headers.host ?? "";
      const hostName = hostHeader.startsWith("[")
        ? hostHeader.slice(1, hostHeader.indexOf("]"))
        : hostHeader.split(":", 1)[0];
      const allowedLocalHosts = new Set(["127.0.0.1", "localhost", "::1", "terminal.local"]);
      if (!allowedLocalHosts.has(hostName)) {
        response.writeHead(403, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
        response.end(JSON.stringify({ error: { code: "LOCAL_HOST_FORBIDDEN", message: "本地服务拒绝了未知主机请求。" } }));
        return;
      }
      const origin = request.headers.origin;
      if (origin && !['GET', 'HEAD'].includes(request.method)) {
        let originAllowed = false;
        try {
          const parsedOrigin = new URL(origin);
          originAllowed = ["http:", "https:"].includes(parsedOrigin.protocol) && allowedLocalHosts.has(parsedOrigin.hostname);
        } catch {
          originAllowed = false;
        }
        if (!originAllowed) {
          response.writeHead(403, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
          response.end(JSON.stringify({ error: { code: "LOCAL_ORIGIN_FORBIDDEN", message: "本地服务拒绝了跨站写入请求。" } }));
          return;
        }
      }
      const webRequest = toWebRequest(request, host, activePort);
      const pathname = new URL(webRequest.url).pathname;
      const webResponse = pathname === "/api" || pathname.startsWith("/api/")
        ? await apiHandler(webRequest)
        : await staticHandler(webRequest);
      await sendWebResponse(response, webResponse, request.method);
    } catch {
      response.writeHead(500, { "content-type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: { code: "INTERNAL_ERROR", message: "本地服务出现异常。" } }));
    }
  });

  return {
    listen() {
      return new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, host, () => {
          server.off("error", reject);
          resolve(server.address());
        });
      });
    },
    close() {
      if (!server.listening) return Promise.resolve();
      return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    },
  };
}

async function startFromCommandLine() {
  const config = loadConfig(process.env, process.cwd());
  const portArgument = process.argv.find((argument) => argument.startsWith("--port="));
  const port = portArgument ? Number(portArgument.split("=", 2)[1]) : config.localAppPort;
  const apiOnly = process.argv.includes("--api-only");
  const store = createJobStore({ filePath: config.jobFile });
  const providers = createProviderRegistry(config);
  const queue = createJobQueue({ config, store, providers, downloadVideo });
  await queue.initialize();
  const apiHandler = createApiHandler({ config, queue, models: listModels(config) });
  const server = createLocalServer({
    host: "127.0.0.1",
    port,
    clientDir: path.join(config.rootDir, "dist", "client"),
    outputDir: config.outputDir,
    apiHandler,
    apiOnly,
  });
  const address = await server.listen();
  console.log(`Director canvas local service: http://127.0.0.1:${address.port}`);

  const close = async () => {
    queue.close();
    await server.close();
    process.exit(0);
  };
  process.once("SIGINT", close);
  process.once("SIGTERM", close);
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(currentFile)) {
  startFromCommandLine().catch((error) => {
    console.error(error?.message || "Unable to start local service.");
    process.exitCode = 1;
  });
}
