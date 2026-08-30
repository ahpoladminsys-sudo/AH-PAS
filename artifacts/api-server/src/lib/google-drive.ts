import { ReplitConnectors } from "@replit/connectors-sdk";

export const GOOGLE_DRIVE_CONNECTION = "google-drive";
export const DEFAULT_DESTINATION_EMAIL = "ahpoladminsys@gmail.com";
export const MANAGED_SYSTEM_FOLDER_NAME = "Tinubu Stop Loss System";
const SYSTEM_FOLDER_APP_PROPERTY = "tinubuSystemFolder";
const SYSTEM_FOLDER_APP_VERSION = "1";
export const OPERATION_APP_PROPERTY = "tinubuOperationId";

export class GoogleDriveError extends Error {
  constructor(
    message: string,
    public readonly statusCode = 502,
    public readonly code = "GOOGLE_PROVIDER_ERROR",
  ) {
    super(message);
    this.name = "GoogleDriveError";
  }
}

type DriveError = {
  message?: string;
  error?: { message?: string; status?: string };
};

function providerErrorMessage(payload: DriveError | undefined) {
  return payload?.error?.message ?? payload?.message ?? "";
}

function requiresReauthorization(payload: DriveError | undefined) {
  return /invalid_grant|requires re-authorization|reauthorization|required to reauthorize|connection is disconnected/i.test(
    providerErrorMessage(payload),
  );
}

function safeProviderMessage(status: number, payload?: DriveError) {
  if (requiresReauthorization(payload)) {
    return "Google Drive authorization has expired. Sign back into the application, reauthorize the Google Drive connection, then refresh protected status.";
  }
  if (status === 401 || status === 403) return "Google Drive access was denied by the connected provider. Refresh protected status or verify the Google connection.";
  if (status === 404) return "The requested Google Drive resource was not found.";
  if (status === 429) return "Google Drive is temporarily rate limited. Refresh protected status and try again.";
  return "Google Drive could not be reached right now. Refresh protected status and try again.";
}

export type DriveParent = {
  id: string;
  name: string;
  parents?: string[];
};

export type DriveDocumentMetadata = {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime?: string;
  webViewLink?: string;
  parents?: string[];
  appProperties?: Record<string, string>;
  trashed?: boolean;
};

async function driveRequest<T>(
  path: string,
  init?: { method?: string; headers?: Record<string, string>; body?: unknown },
) {
  const connectors = new ReplitConnectors();
  const response = await connectors.proxy(GOOGLE_DRIVE_CONNECTION, path, {
    method: init?.method ?? "GET",
    ...(init?.headers ? { headers: init.headers } : {}),
    ...(init?.body === undefined ? {} : { body: init.body }),
  });
  const raw = await response.text();
  let payload: T | DriveError | undefined;
  try {
    payload = raw ? (JSON.parse(raw) as T | DriveError) : undefined;
  } catch {
    payload = undefined;
  }
  if (!response.ok) {
    const providerPayload = payload as DriveError | undefined;
    const reauthorizationRequired = requiresReauthorization(providerPayload);
    const providerStatus = reauthorizationRequired
      ? "GOOGLE_REAUTH_REQUIRED"
      : response.status === 401 || response.status === 403
      ? "GOOGLE_ACCESS_DENIED"
      : response.status === 404
        ? "GOOGLE_RESOURCE_NOT_FOUND"
        : response.status === 429
          ? "GOOGLE_RATE_LIMITED"
          : "GOOGLE_PROVIDER_UNAVAILABLE";
    throw new GoogleDriveError(
      safeProviderMessage(response.status, providerPayload),
      reauthorizationRequired || response.status === 403 ? 409 : 502,
      providerStatus,
    );
  }
  return payload as T;
}

export async function uploadDocument(input: {
  name: string;
  mimeType: string;
  contentBase64: string;
  folderId?: string;
  appProperties?: Record<string, string>;
}) {
  if (input.contentBase64.length > 14_000_000) {
    throw new GoogleDriveError("Documents must be 10 MB or smaller.", 413);
  }
  const boundary = `replit-drive-${Date.now().toString(36)}`;
  const metadata = JSON.stringify({
    name: input.name,
    mimeType: input.mimeType,
    ...(input.folderId ? { parents: [input.folderId] } : {}),
    ...(input.appProperties ? { appProperties: input.appProperties } : {}),
  });
  const bytes = Buffer.from(input.contentBase64, "base64");
  const prefix = Buffer.from(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${input.mimeType}\r\n\r\n`,
  );
  const suffix = Buffer.from(`\r\n--${boundary}--`);
  const body = Buffer.concat([prefix, bytes, suffix]);
  return driveRequest<{
    id: string;
    name: string;
    mimeType: string;
    webViewLink?: string;
    modifiedTime?: string;
    appProperties?: Record<string, string>;
  }>(
    `/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,mimeType,webViewLink,modifiedTime,appProperties`,
    {
      method: "POST",
      headers: {
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
    },
  );
}

export const MANAGED_WORKSPACE_STATE_NAME = "Tinubu Stop Loss Workspace State.json";
const WORKSPACE_STATE_APP_PROPERTY = "tinubuWorkspaceState";
const WORKSPACE_STATE_APP_VERSION = "1";
const ENROLLMENT_WORKBOOK_APP_PROPERTY = "tinubuEnrollmentWorkbook";
const ENROLLMENT_POLICY_APP_PROPERTY = "tinubuEnrollmentPolicyId";
const ENROLLMENT_UPLOAD_APP_PROPERTY = "tinubuEnrollmentUploadId";

export async function findEnrollmentWorkbook(policyId: string, uploadId?: string) {
  const query = [
    "trashed = false",
    "mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'",
    `appProperties has { key = '${ENROLLMENT_WORKBOOK_APP_PROPERTY}' and value = '1' }`,
    `appProperties has { key = '${ENROLLMENT_POLICY_APP_PROPERTY}' and value = '${driveQueryValue(policyId)}' }`,
    ...(uploadId
      ? [`appProperties has { key = '${ENROLLMENT_UPLOAD_APP_PROPERTY}' and value = '${driveQueryValue(uploadId)}' }`]
      : []),
  ].join(" and ");
  const payload = await driveRequest<{ files?: DriveDocumentMetadata[] }>(
    `/drive/v3/files?q=${encodeURIComponent(query)}&orderBy=createdTime asc&pageSize=1&supportsAllDrives=true&includeItemsFromAllDrives=true&fields=files(id,name,mimeType,size,modifiedTime,webViewLink,parents,appProperties)`,
  );
  return payload.files?.[0] ?? null;
}

export async function findManagedWorkspaceState() {
  const query = [
    "trashed = false",
    "mimeType = 'application/json'",
    `appProperties has { key = '${WORKSPACE_STATE_APP_PROPERTY}' and value = '${WORKSPACE_STATE_APP_VERSION}' }`,
  ].join(" and ");
  const payload = await driveRequest<{ files?: DriveDocumentMetadata[] }>(
    `/drive/v3/files?q=${encodeURIComponent(query)}&orderBy=createdTime asc&fields=files(id,name,mimeType,size,modifiedTime,webViewLink,parents,appProperties)`,
  );
  return payload.files?.[0] ?? null;
}

export async function findDocumentByOperationId(operationId: string) {
  const query = [
    "trashed = false",
    `appProperties has { key = '${OPERATION_APP_PROPERTY}' and value = '${driveQueryValue(operationId)}' }`,
  ].join(" and ");
  const payload = await driveRequest<{ files?: DriveDocumentMetadata[] }>(
    `/drive/v3/files?q=${encodeURIComponent(query)}&orderBy=createdTime asc&pageSize=1&supportsAllDrives=true&includeItemsFromAllDrives=true&fields=files(id,name,mimeType,size,modifiedTime,webViewLink,parents,appProperties)`,
  );
  return payload.files?.[0] ?? null;
}

export async function createManagedWorkspaceState(contentBase64: string) {
  const systemFolderId = await ensureManagedSystemFolder();
  return uploadDocument({
    name: MANAGED_WORKSPACE_STATE_NAME,
    mimeType: "application/json",
    contentBase64,
    folderId: systemFolderId,
    appProperties: { [WORKSPACE_STATE_APP_PROPERTY]: WORKSPACE_STATE_APP_VERSION },
  });
}

export async function updateDocumentContent(fileId: string, contentBase64: string) {
  if (contentBase64.length > 14_000_000) {
    throw new GoogleDriveError("Workspace state must be 10 MB or smaller.", 413);
  }
  const bytes = Buffer.from(contentBase64, "base64");
  return driveRequest<DriveDocumentMetadata>(
    `/upload/drive/v3/files/${encodeURIComponent(fileId)}?uploadType=media&supportsAllDrives=true&fields=id,name,mimeType,size,modifiedTime,webViewLink,parents,appProperties`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: bytes,
    },
  );
}

const DRIVE_FOLDER_MIME = "application/vnd.google-apps.folder";

function driveQueryValue(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function findFolder(name: string, parentId?: string) {
  const clauses = [
    `name = '${driveQueryValue(name)}'`,
    `mimeType = '${DRIVE_FOLDER_MIME}'`,
    "trashed = false",
    `'${driveQueryValue(parentId ?? "root")}' in parents`,
  ];
  const payload = await driveRequest<{ files?: Array<{ id: string; name: string }> }>(
    `/drive/v3/files?q=${encodeURIComponent(clauses.join(" and "))}&pageSize=1&fields=files(id,name)`,
  );
  return payload.files?.[0] ?? null;
}

export async function findManagedSystemFolder() {
  const query = [
    `mimeType = '${DRIVE_FOLDER_MIME}'`,
    "trashed = false",
    `appProperties has { key = '${SYSTEM_FOLDER_APP_PROPERTY}' and value = '${SYSTEM_FOLDER_APP_VERSION}' }`,
  ].join(" and ");
  const payload = await driveRequest<{ files?: DriveParent[] }>(
    `/drive/v3/files?q=${encodeURIComponent(query)}&pageSize=1&supportsAllDrives=true&includeItemsFromAllDrives=true&fields=files(id,name,parents,appProperties)`,
  );
  return payload.files?.[0] ?? null;
}

export async function ensureManagedSystemFolder() {
  const existing = await findManagedSystemFolder();
  if (existing) return existing.id;
  return (
    await driveRequest<DriveParent>(
      "/drive/v3/files?supportsAllDrives=true&fields=id,name,parents,appProperties",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: {
          name: MANAGED_SYSTEM_FOLDER_NAME,
          mimeType: DRIVE_FOLDER_MIME,
          appProperties: {
            [SYSTEM_FOLDER_APP_PROPERTY]: SYSTEM_FOLDER_APP_VERSION,
          },
        },
      },
    )
  ).id;
}

export async function findFolderPath(path: string[]) {
  let parentId: string | undefined;
  const folders: DriveParent[] = [];
  for (const rawName of path) {
    const name = rawName.trim().slice(0, 180);
    if (!name) continue;
    const folder = await findFolder(name, parentId);
    if (!folder) return { folderId: null, folders };
    folders.push({ id: folder.id, name: folder.name });
    parentId = folder.id;
  }
  return { folderId: parentId ?? null, folders };
}

async function createFolder(name: string, parentId?: string) {
  return driveRequest<{ id: string; name: string }>(
    "/drive/v3/files?fields=id,name",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: {
        name,
        mimeType: DRIVE_FOLDER_MIME,
        ...(parentId ? { parents: [parentId] } : {}),
      },
    },
  );
}

export async function ensureFolderPath(path: string[]) {
  let parentId: string | undefined;
  for (const rawName of path) {
    const name = rawName.trim().slice(0, 180);
    if (!name) continue;
    const folder = (await findFolder(name, parentId)) ?? (await createFolder(name, parentId));
    parentId = folder.id;
  }
  return parentId;
}

export async function listDocuments() {
  const files: DriveDocumentMetadata[] = [];
  let pageToken: string | undefined;
  do {
    const query = new URLSearchParams({
      q: "trashed = false and mimeType != 'application/vnd.google-apps.folder'",
      orderBy: "modifiedTime desc",
      pageSize: "100",
      includeItemsFromAllDrives: "true",
      supportsAllDrives: "true",
      fields: "nextPageToken,files(id,name,mimeType,size,modifiedTime,webViewLink,parents)",
    });
    if (pageToken) query.set("pageToken", pageToken);
    const payload = await driveRequest<{
      nextPageToken?: string;
      files?: DriveDocumentMetadata[];
    }>(`/drive/v3/files?${query.toString()}`);
    files.push(...(payload.files ?? []));
    pageToken = payload.nextPageToken;
  } while (pageToken);
  return files;
}

export async function listFolders() {
  const folders: DriveParent[] = [];
  let pageToken: string | undefined;
  do {
    const query = new URLSearchParams({
      q: `trashed = false and mimeType = '${DRIVE_FOLDER_MIME}'`,
      pageSize: "1000",
      includeItemsFromAllDrives: "true",
      supportsAllDrives: "true",
      fields: "nextPageToken,files(id,name,parents)",
    });
    if (pageToken) query.set("pageToken", pageToken);
    const payload = await driveRequest<{
      nextPageToken?: string;
      files?: DriveParent[];
    }>(`/drive/v3/files?${query.toString()}`);
    folders.push(...(payload.files ?? []));
    pageToken = payload.nextPageToken;
  } while (pageToken);
  return folders;
}

export async function getDocumentMetadata(fileId: string) {
  return driveRequest<DriveDocumentMetadata>(
    `/drive/v3/files/${encodeURIComponent(fileId)}?supportsAllDrives=true&fields=id,name,mimeType,size,modifiedTime,webViewLink,parents,appProperties,trashed`,
  );
}

export async function moveDocument(
  fileId: string,
  destinationFolderId: string,
  sourceParentIds: string[],
) {
  const query = new URLSearchParams({
    addParents: destinationFolderId,
    supportsAllDrives: "true",
    fields: "id,name,mimeType,size,modifiedTime,webViewLink,parents",
  });
  if (sourceParentIds.length) query.set("removeParents", sourceParentIds.join(","));
  return driveRequest<DriveDocumentMetadata>(
    `/drive/v3/files/${encodeURIComponent(fileId)}?${query.toString()}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: {},
    },
  );
}

export async function trashDocument(fileId: string) {
  return driveRequest<DriveDocumentMetadata>(
    `/drive/v3/files/${encodeURIComponent(fileId)}?supportsAllDrives=true&fields=id,name,mimeType,size,modifiedTime,webViewLink,parents,appProperties`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: { trashed: true },
    },
  );
}

export async function downloadDocument(fileId: string) {
  const connectors = new ReplitConnectors();
  const response = await connectors.proxy(
    GOOGLE_DRIVE_CONNECTION,
    `/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`,
    { method: "GET" },
  );
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!response.ok) {
    throw new GoogleDriveError(safeProviderMessage(response.status), response.status === 403 ? 409 : 502, response.status === 401 || response.status === 403 ? "GOOGLE_ACCESS_DENIED" : "GOOGLE_PROVIDER_UNAVAILABLE");
  }
  return {
    contentBase64: bytes.toString("base64"),
    mimeType: response.headers.get("content-type") || "application/octet-stream",
  };
}

export async function shareFile(
  fileId: string,
  email: string,
  role: "writer" | "owner" = "writer",
) {
  return driveRequest<{ id?: string; emailAddress?: string; role?: string }>(
    `/drive/v3/files/${encodeURIComponent(fileId)}/permissions?sendNotificationEmail=true&supportsAllDrives=true&fields=id,emailAddress,role`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: {
        type: "user",
        role,
        emailAddress: email,
        ...(role === "owner" ? { pendingOwner: true } : {}),
      },
    },
  );
}