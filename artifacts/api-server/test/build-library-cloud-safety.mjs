import { build } from "esbuild";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const testDir = resolve(fileURLToPath(new URL(".", import.meta.url)));

const dbStub = "\0library-cloud-safety-db";
const drizzleStub = "\0library-cloud-safety-drizzle";

await build({
  entryPoints: [resolve(testDir, "library-cloud-safety.test.mjs")],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: resolve(testDir, ".generated-library-cloud-safety.test.mjs"),
  sourcemap: "inline",
  external: [
    "@clerk/*",
    "@replit/connectors-sdk",
    "express",
  ],
  banner: {
    js: `
      import { createRequire as __testCreateRequire } from "node:module";
      globalThis.require = __testCreateRequire(import.meta.url);
    `,
  },
  plugins: [
    {
      name: "library-cloud-safety-test-stubs",
      setup(pluginBuild) {
        pluginBuild.onResolve({ filter: /^@workspace\/db$/ }, () => ({
          path: dbStub,
          namespace: "library-cloud-safety",
        }));
        pluginBuild.onLoad(
          { filter: /.*/, namespace: "library-cloud-safety" },
          ({ path }) => {
            if (path === dbStub) {
              return {
                contents: `
                  export const sheetSyncConfigTable = { id: "id" };
                  export const testDbState = { config: null };
                  export const db = {
                    select() {
                      return {
                        from() {
                          return {
                            where: async () => testDbState.config ? [{ ...testDbState.config }] : [],
                          };
                        },
                      };
                    },
                    insert() {
                      return {
                        values(values) {
                          return {
                            onConflictDoUpdate: async ({ set }) => {
                              testDbState.config = {
                                ...(testDbState.config || {}),
                                ...values,
                                ...set,
                              };
                            },
                          };
                        },
                      };
                    },
                  };
                `,
                loader: "js",
              };
            }
            return null;
          },
        );
        pluginBuild.onResolve({ filter: /^drizzle-orm$/ }, () => ({
          path: drizzleStub,
          namespace: "library-cloud-safety",
        }));
        pluginBuild.onLoad(
          { filter: /.*/, namespace: "library-cloud-safety" },
          ({ path }) => path === drizzleStub
            ? { contents: "export const eq = () => undefined;", loader: "js" }
            : null,
        );
      },
    },
  ],
});