import { build } from "esbuild";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const testDir = resolve(fileURLToPath(new URL(".", import.meta.url)));
const clerkStub = "\0index-drive-authenticated-clerk";

await build({
  entryPoints: [resolve(testDir, "index-drive-authenticated.test.mjs")],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: resolve(testDir, ".generated-index-drive-authenticated.test.mjs"),
  sourcemap: "inline",
  external: [
    "@replit/connectors-sdk",
    "@clerk/shared/*",
    "express",
    "http-proxy-middleware",
  ],
  plugins: [{
    name: "index-drive-authenticated-clerk-stub",
    setup(pluginBuild) {
      pluginBuild.onResolve({ filter: /^@clerk\/express$/ }, () => ({
        path: clerkStub,
        namespace: "index-drive-authenticated",
      }));
      pluginBuild.onLoad(
        { filter: /.*/, namespace: "index-drive-authenticated" },
        ({ path }) => path === clerkStub
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
  }],
});