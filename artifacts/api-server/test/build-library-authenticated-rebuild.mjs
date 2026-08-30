import { build } from "esbuild";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const testDir = resolve(fileURLToPath(new URL(".", import.meta.url)));

await build({
  entryPoints: [resolve(testDir, "library-authenticated-rebuild.test.mjs")],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: resolve(testDir, ".generated-library-authenticated-rebuild.test.mjs"),
  sourcemap: "inline",
  external: [
    "@replit/connectors-sdk",
    "@clerk/shared/*",
    "express",
    "http-proxy-middleware",
  ],
  banner: {
    js: `
      import { createRequire as __testCreateRequire } from "node:module";
      globalThis.require = __testCreateRequire(import.meta.url);
    `,
  },
  plugins: [
    {
      name: "library-authenticated-rebuild-db-stub",
      setup(pluginBuild) {
        pluginBuild.onResolve({ filter: /^@workspace\/db$/ }, () => ({
          path: "\0library-authenticated-rebuild-db",
          namespace: "library-authenticated-rebuild",
        }));
        pluginBuild.onLoad(
          { filter: /.*/, namespace: "library-authenticated-rebuild" },
          ({ path }) => path === "\0library-authenticated-rebuild-db"
            ? {
                contents: `
                  export const sheetSyncConfigTable = { id: "id" };
                  export const db = {
                    select() {
                      return {
                        from() {
                          return {
                            where: async () => [{
                              id: 1,
                              spreadsheetId: "authenticated-library-sheet",
                            }],
                          };
                        },
                      };
                    },
                  };
                `,
                loader: "js",
              }
            : null,
        );
      },
    },
    {
      name: "library-authenticated-rebuild-clerk-stub",
      setup(pluginBuild) {
        pluginBuild.onResolve({ filter: /^@clerk\/express$/ }, () => ({
          path: "\0library-authenticated-rebuild-clerk",
          namespace: "library-authenticated-rebuild-clerk",
        }));
        pluginBuild.onLoad(
          { filter: /.*/, namespace: "library-authenticated-rebuild-clerk" },
          ({ path }) => path === "\0library-authenticated-rebuild-clerk"
            ? {
                contents: `
                  export function getAuth() { return {}; }
                  export const clerkClient = {
                    users: {
                      async getUser() {
                        return {
                          emailAddresses: [{
                            emailAddress: "operator@example.com",
                            verification: { status: "verified" }
                          }],
                          publicMetadata: {},
                          privateMetadata: {}
                        };
                      }
                    }
                  };
                `,
                loader: "js",
              }
            : null,
        );
      },
    },
    {
      name: "library-authenticated-rebuild-drizzle-stub",
      setup(pluginBuild) {
        pluginBuild.onResolve({ filter: /^drizzle-orm$/ }, () => ({
          path: "\0library-authenticated-rebuild-drizzle",
          namespace: "library-authenticated-rebuild-drizzle",
        }));
        pluginBuild.onLoad(
          { filter: /.*/, namespace: "library-authenticated-rebuild-drizzle" },
          ({ path }) => path === "\0library-authenticated-rebuild-drizzle"
            ? { contents: "export const eq = () => undefined;", loader: "js" }
            : null,
        );
      },
    },
  ],
});