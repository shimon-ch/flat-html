import { defineConfig } from "vite-plus";

export default defineConfig({
  run: {
    cache: true,
  },
  lint: {
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  fmt: {
    ignorePatterns: ["docs/**", "**/*.md"],
  },
});
