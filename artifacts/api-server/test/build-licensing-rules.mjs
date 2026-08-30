import { build } from "esbuild";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const testDir = resolve(fileURLToPath(new URL(".", import.meta.url)));
await build({
  entryPoints: [resolve(testDir, "licensing-rules.test.mjs")],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: resolve(testDir, ".generated-licensing-rules.test.mjs"),
  sourcemap: "inline",
});