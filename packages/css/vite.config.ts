import { defineConfig } from "vite-plus";

export default defineConfig({
  lint: {},
  fmt: {},
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
