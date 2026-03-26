import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "packages/**/*.test.ts",
      "plugins/**/*.test.ts",
      "workers/**/*.test.ts",
    ],
    coverage: {
      reporter: ["text", "html"],
    },
  },
});
