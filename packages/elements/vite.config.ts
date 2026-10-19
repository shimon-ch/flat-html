import { defineConfig } from "vite-plus";
import { playwright } from "vite-plus/test/browser-playwright";
import { commands } from "./tests/commands.ts";

export default defineConfig({
  lint: {},
  fmt: {},
  test: {
    include: ["src/**/*.test.ts"],
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [{ browser: "chromium" }],
      commands,
    },
  },
});
