import { defineConfig } from "vite-plus";

export default defineConfig({
  run: {
    cache: true,
  },
  lint: {},
  fmt: {
    ignorePatterns: ["docs/**", "**/*.md"],
  },
});
