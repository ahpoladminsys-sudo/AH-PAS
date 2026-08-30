import assert from "node:assert/strict";
import test from "node:test";
import { classifyRepositoryConnection } from "../src/routes/health";

const verifiedRepository = {
  full_name: "ahpoladminsys-sudo/AH-PAS",
  private: false,
  visibility: "public",
  default_branch: "main",
  permissions: { pull: true, push: true, admin: false },
  size: 0,
};

test("reports the approved public writable main repository as connected", () => {
  const result = classifyRepositoryConnection(200, verifiedRepository);
  assert.equal(result.status, "connected");
  assert.equal(result.defaultBranch, "main");
  assert.equal(result.historyStatus, "empty");
});

test("rejects private, read-only, wrong-branch, or mismatched repositories", () => {
  for (const repository of [
    { ...verifiedRepository, private: true, visibility: "private" },
    { ...verifiedRepository, permissions: { pull: true, push: false } },
    { ...verifiedRepository, default_branch: "master" },
    { ...verifiedRepository, full_name: "another/repository" },
  ]) {
    assert.equal(classifyRepositoryConnection(200, repository).status, "not_connected");
  }
});

test("distinguishes an inaccessible repository from provider unavailability", () => {
  assert.equal(classifyRepositoryConnection(404, null).status, "not_connected");
  assert.equal(classifyRepositoryConnection(503, null).status, "unavailable");
});