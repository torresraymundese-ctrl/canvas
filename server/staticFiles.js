import { createReadStream } from "node:fs";
import * as fs from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mp4": "video/mp4",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};

function notFound() {
  return new Response("Not found", { status: 404 });
}

async function fileResponse(filePath, request, { video = false } = {}) {
  let stat;
  try {
    stat = await fs.stat(filePath);
  } catch {
    return null;
  }
  if (!stat.isFile()) return null;

  const headers = new Headers({
    "content-type": MIME_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream",
    "accept-ranges": video ? "bytes" : "none",
  });
  let start = 0;
  let end = stat.size - 1;
  let status = 200;
  if (video && request.headers.get("range")) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get("range").trim());
    if (!match) return new Response(null, { status: 416, headers: { "content-range": `bytes */${stat.size}` } });
    start = match[1] ? Number(match[1]) : 0;
    end = match[2] ? Number(match[2]) : stat.size - 1;
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || end >= stat.size) {
      return new Response(null, { status: 416, headers: { "content-range": `bytes */${stat.size}` } });
    }
    status = 206;
    headers.set("content-range", `bytes ${start}-${end}/${stat.size}`);
  }
  headers.set("content-length", String(end - start + 1));
  if (request.method === "HEAD") return new Response(null, { status, headers });
  return new Response(Readable.toWeb(createReadStream(filePath, { start, end })), { status, headers });
}

export function createStaticHandler({ clientDir, outputDir, apiOnly = false }) {
  const resolvedClientDir = clientDir ? path.resolve(clientDir) : null;
  const resolvedOutputDir = path.resolve(outputDir);

  return async function handleStaticRequest(request) {
    if (!['GET', 'HEAD'].includes(request.method)) return notFound();
    const url = new URL(request.url);
    let pathname;
    try {
      pathname = decodeURIComponent(url.pathname);
    } catch {
      return notFound();
    }
    const outputMatch = /^\/outputs\/(job_[a-zA-Z0-9_-]+)\.mp4$/.exec(pathname);
    if (outputMatch) {
      return await fileResponse(path.join(resolvedOutputDir, `${outputMatch[1]}.mp4`), request, { video: true }) ?? notFound();
    }
    if (pathname.startsWith("/outputs/") || pathname.startsWith("/api/") || apiOnly || !resolvedClientDir) return notFound();

    const relativePath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
    const candidate = path.resolve(resolvedClientDir, relativePath);
    if (candidate !== resolvedClientDir && !candidate.startsWith(`${resolvedClientDir}${path.sep}`)) return notFound();
    const direct = await fileResponse(candidate, request);
    if (direct) return direct;
    if (request.headers.get("accept")?.includes("text/html")) {
      return await fileResponse(path.join(resolvedClientDir, "index.html"), request) ?? notFound();
    }
    return notFound();
  };
}
