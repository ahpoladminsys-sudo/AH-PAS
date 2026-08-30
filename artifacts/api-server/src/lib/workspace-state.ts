export const WORKSPACE_STATE_SCHEMA_VERSION = 1;

export type DurableWorkspaceState = {
  schemaVersion: number;
  updatedAt: Date | string;
  source: string;
  systemLog: Record<string, unknown>;
  pendingReview: Record<string, unknown> | null;
  sheetsCache: Record<string, unknown> | null;
  licensingFallback: Record<string, unknown> | null;
  canonicalIndex?: Record<string, unknown> | null;
  activeIndexSource?: Record<string, unknown> | null;
};

export function hasWorkspaceStateConflict(
  expectedModifiedTime: string | null,
  actualModifiedTime?: string,
) {
  return Boolean(expectedModifiedTime && expectedModifiedTime !== actualModifiedTime);
}

export function encodeWorkspaceState(state: DurableWorkspaceState) {
  return Buffer.from(JSON.stringify(state), "utf8").toString("base64");
}

export function decodeWorkspaceState(contentBase64: string) {
  return JSON.parse(Buffer.from(contentBase64, "base64").toString("utf8")) as unknown;
}