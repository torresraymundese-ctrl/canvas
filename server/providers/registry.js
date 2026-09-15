import { createArkDirector } from "./arkDirector.js";
import { createArkVideo } from "./arkVideo.js";
import { createMockProvider } from "./mockProvider.js";

export function createProviderRegistry(config, deps = {}) {
  if (config.executionMode === "mock") {
    const mock = createMockProvider(deps);
    return { mode: "mock", director: mock, video: mock };
  }
  return {
    mode: "live",
    director: createArkDirector({ config, ...deps }),
    video: createArkVideo({ config, ...deps }),
  };
}
