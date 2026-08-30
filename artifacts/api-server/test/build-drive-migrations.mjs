import { build } from "esbuild";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const testDir = resolve(fileURLToPath(new URL(".", import.meta.url)));

await build({
  entryPoints: [resolve(testDir, "drive-migrations.test.mjs")],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: resolve(testDir, ".generated-drive-migrations.test.mjs"),
  sourcemap: "inline",
  external: ["@replit/connectors-sdk", "express"],
});