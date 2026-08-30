import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("enrollment workbook response uses the successful write revision without a stale reread", () => {
  const source = readFileSync(
    resolve(process.cwd(), "artifacts/api-server/src/routes/drive.ts"),
    "utf8",
  );
  const route = source.slice(
    source.indexOf('router.post("/drive/enrollment-workbook"'),
    source.indexOf('router.post("/drive/transfer-sheet"'),
  );

  assert.match(route, /modifiedTime:\s*metadata\.modifiedTime/);
  assert.doesNotMatch(
    route.slice(route.indexOf("const { metadata, action } = saved")),
    /getDocumentMetadata\(/,
  );
  assert.match(
    route,
    /if\s*\(!metadata\.modifiedTime\)[\s\S]*did not return the workbook revision/,
  );
});