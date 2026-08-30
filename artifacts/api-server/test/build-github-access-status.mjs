import { build } from "esbuild";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const testDir = resolve(fileURLToPath(new URL(".", import.meta.url)));

await build({
  entryPoints: [resolve(testDir, "github-access-status.test.ts")],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: resolve(testDir, ".generated-github-access-status.test.mjs"),
  sourcemap: "inline",
  banner: {
    js: `
      import { createRequire as __testCreateRequire } from "node:module";
      globalThis.require = __testCreateRequire(import.meta.url);
    `,
  },
  external: [
    "@clerk/*",
    "@replit/connectors-sdk",
    "express",
  ],
});