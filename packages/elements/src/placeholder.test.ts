import { expect, test } from "vite-plus/test";

test("browser mode is wired", () => {
  expect(typeof document).toBe("object");
});
