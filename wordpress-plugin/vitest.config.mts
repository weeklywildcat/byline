import { defineConfig } from "vitest/config";
import { createRequire } from "node:module";
import { fileURLToPath, URL } from "node:url";

const configRequire = createRequire(import.meta.url);
const blocksRuntime = configRequire.resolve("@wordpress/blocks");

export default defineConfig({
  resolve: {
    // @wordpress/blocks' browser ESM build imports JSON without an import
    // attribute under the Node/Vitest runtime. The CJS build is the same
    // published package API and matches WordPress' bundled execution model.
    alias: {
      "@wordpress/blocks": blocksRuntime,
      "@wordpress/block-editor": fileURLToPath(new URL("./tests-js/block-editor-mock.ts", import.meta.url))
    }
  },
  test: {
    environment: "node",
    include: ["tests-js/**/*.test.ts"]
  }
});
