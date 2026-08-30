import { ReplitConnectors } from "@replit/connectors-sdk";

export const GOOGLE_SHEETS_CONNECTION = "google-sheet";

type JsonRecord = Record<string, unknown>;
type SheetTab = { name: string; rows: JsonRecord[] };

export type SheetStatus = {
  configured: boolean;
  writable: boolean;
  connection: string;
  accessState: "connected" | "not_configured" | "provider_error";
  errorCode?: string | null;
  message?: string;
  lastSyncedAt: string | null;
  spreadsheetId: string | null;
  spreadsheetUrl: string | null;
};

export type SheetApiError = {
  code?: number;
  message?: string;
  status?: string;
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
};

export class GoogleSheetsError extends Error {
  constructor(
    message: string,
    public readonly statusCode = 502,
    public readonly code = "GOOGLE_PROVIDER_ERROR",
  ) {
    super(message);
    this.name = "GoogleSheetsError";
  }
}

export function getSpreadsheetId(value: string) {
  const trimmed = value.trim();
  if (/^[a-zA-Z0-9-_]{10,}$/.test(trimmed)) return trimmed;
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match?.[1] ?? null;
}

function apiPath(path: string) {
  return `/v4/spreadsheets${path}`;
}

function providerErrorMessage(payload: SheetApiError | undefined) {
  return payload?.error?.message ?? payload?.message ?? "";
}

function requiresReauthorization(payload: SheetApiError | undefined) {
  return /invalid_grant|requires re-authorization|reauthorization|required to reauthorize|connection is disconnected/i.test(
    providerErrorMessage(payload),
  );
}

function safeProviderMessage(status: number, payload?: SheetApiError) {
  if (requiresReauthorization(payload)) {
    return "Google Sheets authorization has expired. Sign back into the application, reauthorize the Google Sheets connection, then refresh protected status.";
  }
  if (status === 401 || status === 403) return "Google Sheets access was denied by the connected provider. The workbook remains read-only until access is verified; refresh protected status or verify the Google connection.";
  if (status === 404) return "The requested Google Sheets workbook was not found.";
  if (status === 429) return "Google Sheets is temporarily rate limited. Refresh protected status and try again.";
  return "Google Sheets could not be reached right now. Refresh protected status and try again.";
}

async function sheetsRequest<T>(
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<T> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const connectors = new ReplitConnectors();
    const response = await connectors.proxy(GOOGLE_SHEETS_CONNECTION, apiPath(path), {
      method: init?.method ?? "GET",
      ...(init?.body === undefined
        ? {}
        : {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(init.body),
          }),
    });

    const raw = await response.text();
    let payload: T | SheetApiError | undefined;
    try {
      payload = raw ? (JSON.parse(raw) as T | SheetApiError) : undefined;
    } catch {
      payload = undefined;
    }
    if (response.ok) return payload as T;
    if ((response.status === 429 || response.status >= 500) && attempt < 4) {
      await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
      continue;
    }
    const providerPayload = payload as SheetApiError | undefined;
    const reauthorizationRequired = requiresReauthorization(providerPayload);
    const detail = safeProviderMessage(response.status, providerPayload);
    const statusCode = reauthorizationRequired || response.status === 403 ? 409 : 502;
    const code = reauthorizationRequired
      ? "GOOGLE_REAUTH_REQUIRED"
      : response.status === 401 || response.status === 403
      ? "GOOGLE_ACCESS_DENIED"
      : response.status === 404
        ? "GOOGLE_RESOURCE_NOT_FOUND"
        : response.status === 429
          ? "GOOGLE_RATE_LIMITED"
          : "GOOGLE_PROVIDER_UNAVAILABLE";
    throw new GoogleSheetsError(detail, statusCode, code);
  }
  throw new GoogleSheetsError("Google Sheets request exhausted its retry budget");
}

export async function readSpreadsheet(spreadsheetId: string) {
  return sheetsRequest<{
    properties?: { title?: string; spreadsheetUrl?: string };
    spreadsheetUrl?: string;
    sheets?: Array<{ properties?: { title?: string } }>;
  }>(
    `/${encodeURIComponent(spreadsheetId)}?fields=properties.title,spreadsheetUrl,sheets.properties`,
  );
}

export async function createSpreadsheet(title: string) {
  return sheetsRequest<{ spreadsheetId: string; spreadsheetUrl?: string }>("", {
    method: "POST",
    body: { properties: { title } },
  });
}

export async function addSheets(
  spreadsheetId: string,
  names: string[],
) {
  if (!names.length) return;
  await sheetsRequest(`/${encodeURIComponent(spreadsheetId)}:batchUpdate`, {
    method: "POST",
    body: {
      requests: names.map((title) => ({
        addSheet: { properties: { title } },
      })),
    },
  });
}

function columnName(number: number) {
  let value = "";
  let current = number;
  while (current > 0) {
    const remainder = (current - 1) % 26;
    value = String.fromCharCode(65 + remainder) + value;
    current = Math.floor((current - 1) / 26);
  }
  return value || "A";
}

function flattenCell(value: unknown): string | number | boolean {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  return JSON.stringify(value);
}

function tabValues(tab: SheetTab) {
  const keys = Array.from(
    new Set(tab.rows.flatMap((row) => Object.keys(row))),
  );
  if (!keys.length) return { keys: ["Status"], values: [["No records loaded"]] };
  return {
    keys,
    values: [
      keys,
      ...tab.rows.map((row) => keys.map((key) => flattenCell(row[key]))),
    ],
  };
}

export async function overwriteTabs(
  spreadsheetId: string,
  tabs: SheetTab[],
) {
  const metadata = await readSpreadsheet(spreadsheetId);
  const existing = new Set(
    (metadata.sheets ?? [])
      .map((sheet) => sheet.properties?.title)
      .filter((title): title is string => Boolean(title)),
  );
  await addSheets(
    spreadsheetId,
    tabs.map((tab) => tab.name).filter((name) => !existing.has(name)),
  );

  const data = tabs.map((tab) => {
    const { keys, values } = tabValues(tab);
    return {
      range: `'${tab.name.replace(/'/g, "''")}'!A1:${columnName(keys.length)}${values.length}`,
      values,
    };
  });
  await sheetsRequest(`/${encodeURIComponent(spreadsheetId)}/values:batchClear`, {
    method: "POST",
    body: {
      ranges: tabs.map((tab) => `'${tab.name.replace(/'/g, "''")}'`),
    },
  });
  await sheetsRequest(`/${encodeURIComponent(spreadsheetId)}/values:batchUpdate`, {
    method: "POST",
    body: { valueInputOption: "USER_ENTERED", data },
  });
  return tabs.reduce((count, tab) => count + tab.rows.length, 0);
}

export async function readTabs(spreadsheetId: string, names: string[]) {
  if (!names.length) return [];
  const query = names
    .map((name) => `ranges=${encodeURIComponent(`'${name.replace(/'/g, "''")}'`)}`)
    .join("&");
  const payload = await sheetsRequest<{
    valueRanges?: Array<{ values?: Array<Array<string | number | boolean>> }>;
  }>(
    `/${encodeURIComponent(spreadsheetId)}/values:batchGet?${query}&valueRenderOption=UNFORMATTED_VALUE`,
  );
  return names.map((name, index) => {
    const values = payload.valueRanges?.[index]?.values ?? [];
    const [headerRow = [], ...dataRows] = values;
    const headers = headerRow.map(String);
    return {
      name,
      rows: dataRows.map((row) =>
        Object.fromEntries(
          headers.map((header, column) => [header, row[column] ?? ""]),
        ),
      ),
    };
  });
}