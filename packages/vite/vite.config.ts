import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    deps: { resolveDepSubpath: true },
    dts: {
      generator: "tsgo",
    },
    exports: true,
  },
  lint: {},
  fmt: {},
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
