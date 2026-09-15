import { createHash } from "node:crypto";

export function createMockProvider() {
  const pollCounts = new Map();

  return {
    async executeDirector(input, { expectedShotCount = input.shotCount } = {}) {
      const shots = Array.from({ length: expectedShotCount }, (_, index) => {
        const number = String(index + 1).padStart(3, "0");
        return {
          id: `S${number}`,
          title: index === 0 ? "春祭开场" : `关键镜头 ${index + 1}`,
          durationSeconds: 5,
          camera: index % 2 === 0 ? "大全景缓慢推进" : "中近景轻微手持",
          action: index === 0 ? "少女穿过雨幕走向古寺" : "人物继续调查遗骸线索",
          dialogue: "",
          continuity: "保持主角青衣、冷青暗金色调与雨夜环境一致",
          prompt: `东方悬疑短剧，雨夜古寺，镜头 ${index + 1}，电影级光影，人物动作自然，连续性一致`,
          negativePrompt: "文字，水印，畸形手指，人物闪烁，服装变化",
        };
      });
      return {
        title: "春神遗骸",
        logline: input.script.slice(0, 120),
        characters: [{ id: "character_1", name: "沈春", visual: "黑发青衣，神情警觉" }],
        visualBible: {
          tone: "东方悬疑",
          palette: ["冷青", "暗金"],
          locations: [{ id: "location_1", name: "古寺", visual: "雨夜石阶、旧木门和暗金灯火" }],
        },
        shots,
      };
    },

    async createVideoTask(input) {
      const hash = createHash("sha256").update(JSON.stringify(input)).digest("hex").slice(0, 12);
      const remoteTaskId = `mock_${hash}`;
      pollCounts.set(remoteTaskId, 0);
      return { remoteTaskId };
    },

    async getVideoTask(remoteTaskId) {
      const count = pollCounts.get(remoteTaskId) ?? 0;
      pollCounts.set(remoteTaskId, count + 1);
      if (count === 0) return { status: "running", progress: 60, videoUrl: null, error: null };
      return {
        status: "succeeded",
        progress: 100,
        videoUrl: "/assets/seedance-demo.mp4",
        error: null,
      };
    },
  };
}
