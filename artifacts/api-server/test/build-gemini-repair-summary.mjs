import { build } from "esbuild";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const testDir = resolve(fileURLToPath(new URL(".", import.meta.url)));

await build({
  entryPoints: [resolve(testDir, "gemini-repair-summary.test.mjs")],
  bundle: true,
  format: "esm",
  platform: "node",
  external: ["express", "pino", "pino-pretty", "thread-stream"],
  outfile: resolve(testDir, ".generated-gemini-repair-summary.test.mjs"),
  sourcemap: "inline",
  plugins: [
    {
      name: "gemini-repair-summary-stub",
      setup(pluginBuild) {
        pluginBuild.onResolve(
          { filter: /^@workspace\/integrations-gemini-ai$/ },
          () => ({ path: "gemini-ai-stub", namespace: "gemini-repair-summary" }),
        );
        pluginBuild.onLoad(
          { filter: /.*/, namespace: "gemini-repair-summary" },
          () => ({
            contents: `
              export const ai = {
                models: {
                  generateContent: async (request) => globalThis.__geminiRepairSummaryGenerate(request),
                },
              };
            `,
            loader: "js",
          }),
        );
      },
    },
  ],
});