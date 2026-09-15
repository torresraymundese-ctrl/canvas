import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

test("storyboard viewer renders confirmation controls without runtime errors", async (t) => {
  const vite = await createServer({ root: process.cwd(), appType: "custom", logLevel: "silent", server: { middlewareMode: true } });
  t.after(() => vite.close());
  const { ContentViewer } = await vite.ssrLoadModule("/src/components/ContentViewer.jsx");
  const html = renderToStaticMarkup(createElement(ContentViewer, {
    node: {
      id: "storyboard",
      data: {
        viewer: {
          mediaType: "storyboard",
          title: "分镜规划",
          shots: [{ id: "S001", name: "S001 雨夜入庙", image: "/shot.png", note: "大全景", prompt: "雨夜古庙" }],
        },
      },
    },
    jobs: [],
    onGenerateShot: () => {},
    onClose: () => {},
  }));

  assert.match(html, /确认该镜头提示词/);
  assert.match(html, /type="checkbox"/);
  assert.match(html, /disabled=""/);
});
