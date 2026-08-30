import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { createHash } from "node:crypto";
import {
  ConfigureSheetsBody,
  GetSheetsSnapshotResponse,
  GetSheetsStatusResponse,
  InitializeSheetsBody,
  InitializeSheetsResponse,
  SyncSheetsBody,
  SyncSheetsResponse,
} from "@workspace/api-zod";
import { db, sheetSyncConfigTable } from "@workspace/db";
import {
  GoogleSheetsError,
  createSpreadsheet,
  getSpreadsheetId,
  overwriteTabs,
  readSpreadsheet,
  readTabs,
  type SheetStatus,
} from "../lib/google-sheets";

const router: IRouter = Router();
const connectionName = "Google Sheets";
let sheetsMutationQueue = Promise.resolve();

type RevisionTab = { name: string; rows: Array<Record<string, unknown>> };

function canonicalRevisionValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalRevisionValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonicalRevisionValue(nested)]),
    );
  }
  return value;
}

function sheetRevision(tabs: RevisionTab[]) {
  const canonical = tabs
    .map((tab) => ({
      name: tab.name,
      rows: tab.rows.map(canonicalRevisionValue),
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
  return createHash("sha256").update(JSON.stringify(canonical)).digest("base64url");
}

function canonicalIndexContract(tabs: RevisionTab[]) {
  const names = tabs.map((tab) => tab.name);
  const expected = ["Broker", "Brokerages", "Agent", "Agents", "Branch", "Program", "Sales reps", "Policyholder", "Association"];
  const hasCanonicalSalesReps = names.includes("Sales reps");
  return {
    schemaVersion: 1,
    sourcePolicy: "verified-August-2026-preferred; no v10 mixing",
    availableTabs: names,
    unavailableLookups: expected
      .filter((name) => !names.includes(name))
      .map((name) => ({ name, available: false, reason: "Workbook tab is unavailable" })),
    excludedAliases: hasCanonicalSalesReps && names.includes("Sales reps (2)")
      ? [{ name: "Sales reps (2)", reason: "Compatibility alias excluded in favor of Sales reps." }]
      : [],
  };
}

function serializeSheetMutation<T>(operation: () => Promise<T>): Promise<T> {
  const next = sheetsMutationQueue.then(operation, operation);
  sheetsMutationQueue = next.then(() => undefined, () => undefined);
  return next;
}

async function config() {
  const rows = await db
    .select()
    .from(sheetSyncConfigTable)
    .where(eq(sheetSyncConfigTable.id, 1));
  return rows[0] ?? null;
}

function statusFor(
  record: Awaited<ReturnType<typeof config>>,
  message?: string,
  accessState: SheetStatus["accessState"] = "connected",
  errorCode: string | null = null,
): SheetStatus {
  return {
    configured: Boolean(record?.spreadsheetId),
    writable: Boolean(record?.spreadsheetId && record?.writeVerifiedAt),
    connection: connectionName,
    accessState,
    errorCode,
    ...(message ? { message } : {}),
    lastSyncedAt: record?.lastSyncedAt ?? null,
    spreadsheetId: record?.spreadsheetId ?? null,
    spreadsheetUrl: record?.spreadsheetUrl ?? null,
  };
}

async function saveConfig(input: {
  spreadsheetId: string;
  spreadsheetUrl?: string | null;
  title?: string | null;
  lastSyncedAt?: string | null;
  writeVerifiedAt?: string | null;
}) {
  await db
    .insert(sheetSyncConfigTable)
    .values({
      id: 1,
      spreadsheetId: input.spreadsheetId,
      spreadsheetUrl:
        input.spreadsheetUrl ??
        `https://docs.google.com/spreadsheets/d/${input.spreadsheetId}/edit`,
      title: input.title ?? null,
      lastSyncedAt: input.lastSyncedAt ?? null,
      writeVerifiedAt: input.writeVerifiedAt ?? null,
    })
    .onConflictDoUpdate({
      target: sheetSyncConfigTable.id,
      set: {
        spreadsheetId: input.spreadsheetId,
        spreadsheetUrl:
          input.spreadsheetUrl ??
          `https://docs.google.com/spreadsheets/d/${input.spreadsheetId}/edit`,
        title: input.title ?? null,
        lastSyncedAt: input.lastSyncedAt ?? null,
        writeVerifiedAt: input.writeVerifiedAt ?? null,
      },
    });
}

router.get("/sheets/status", async (_req, res, next) => {
  try {
    const record = await config();
    if (!record?.spreadsheetId) {
      return res.status(409).json({ error: "Google Sheets is not configured." });
    }
    try {
      const metadata = await readSpreadsheet(record.spreadsheetId);
      return res.json(
        GetSheetsStatusResponse.parse(
          statusFor(
            record,
            record.writeVerifiedAt
              ? `Connected to ${metadata.properties?.title ?? "Google Sheets"} for reads and verified writes.`
              : `Connected to ${metadata.properties?.title ?? "Google Sheets"} for reads. Write access has not been verified.`,
          ),
        ),
      );
    } catch (error) {
      if (error instanceof GoogleSheetsError) {
        return res.json(GetSheetsStatusResponse.parse({
          ...statusFor(record, `Unavailable: ${error.message}`),
          writable: false,
          accessState: "provider_error",
          errorCode: error.code,
        }));
      }
      throw error;
    }
  } catch (error) {
    return next(error);
  }
});

router.get("/sheets/snapshot", async (_req, res, next) => {
  try {
    const record = await config();
    if (!record?.spreadsheetId) {
      return res.status(409).json({ error: "Google Sheets is not configured." });
    }
    const metadata = await readSpreadsheet(record.spreadsheetId);
    const names = (metadata.sheets ?? [])
      .map((sheet) => sheet.properties?.title)
      .filter((name): name is string => Boolean(name));
    const tabs = await readTabs(record.spreadsheetId, names);
    return res.json(
      GetSheetsSnapshotResponse.parse({
        status: statusFor(record, "Snapshot retrieved from Google Sheets."),
        tabs,
        revision: sheetRevision(tabs),
        canonicalIndex: canonicalIndexContract(tabs),
      }),
    );
  } catch (error) {
    return next(error);
  }
});

router.post("/sheets/configure", async (req, res, next) => {
  try {
    const input = ConfigureSheetsBody.parse(req.body);
    const spreadsheetId = getSpreadsheetId(input.spreadsheetId ?? input.spreadsheetUrl ?? "");
    if (!spreadsheetId) {
      return res.status(400).json({ error: "Enter a valid Google Sheets URL or spreadsheet ID." });
    }
    const metadata = await readSpreadsheet(spreadsheetId);
    await saveConfig({
      spreadsheetId,
      spreadsheetUrl: metadata.spreadsheetUrl ?? input.spreadsheetUrl,
      title: metadata.properties?.title ?? input.title,
    });
    return res.json(
      statusFor(await config(), `Connected to ${metadata.properties?.title ?? "Google Sheets"}.`),
    );
  } catch (error) {
    return next(error);
  }
});

router.post("/sheets/initialize", async (req, res, next) => {
  try {
    const input = InitializeSheetsBody.parse(req.body);
    let spreadsheetId = input.spreadsheetId
      ? getSpreadsheetId(input.spreadsheetId)
      : (await config())?.spreadsheetId ?? null;
    let spreadsheetUrl: string | undefined;
    let title = input.title;
    if (!spreadsheetId) {
      const created = await createSpreadsheet(input.title);
      spreadsheetId = created.spreadsheetId;
      spreadsheetUrl = created.spreadsheetUrl;
    }
    if (!spreadsheetId) throw new GoogleSheetsError("Google Sheets did not return a spreadsheet ID.", 502);
    const metadata = await readSpreadsheet(spreadsheetId);
    title = metadata.properties?.title ?? title;
      spreadsheetUrl = metadata.spreadsheetUrl ?? spreadsheetUrl;
    const rows = await serializeSheetMutation(() => overwriteTabs(spreadsheetId, input.tabs));
    const lastSyncedAt = new Date().toISOString();
    await saveConfig({ spreadsheetId, spreadsheetUrl, title, lastSyncedAt, writeVerifiedAt: lastSyncedAt });
    return res.json(
      InitializeSheetsResponse.parse({
        ...statusFor(await config(), `Initialized ${title} with ${rows} records.`),
        writable: true,
      }),
    );
  } catch (error) {
    return next(error);
  }
});

router.post("/sheets/sync", async (req, res, next) => {
  try {
    const parsed = SyncSheetsBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "A current Google Sheets revision is required. Pull the latest workbook before pushing; no workbook data was changed.",
      });
    }
    const input = parsed.data;
    const record = await config();
    if (!record?.spreadsheetId) {
      return res.status(409).json({ error: "Configure Google Sheets before saving records." });
    }
    const spreadsheetId = record.spreadsheetId;
    const result = await serializeSheetMutation(async () => {
      const metadata = await readSpreadsheet(spreadsheetId);
      const names = (metadata.sheets ?? [])
        .map((sheet) => sheet.properties?.title)
        .filter((name): name is string => Boolean(name));
      const currentTabs = await readTabs(spreadsheetId, names);
      const currentRevision = sheetRevision(currentTabs);
      if (input.expectedRevision !== currentRevision) {
        throw new GoogleSheetsError(
          "Newer Google Sheets data was found. This push was not applied. Pull the latest workbook before retrying; your local records remain available.",
          409,
        );
      }
      const rows = await overwriteTabs(spreadsheetId, input.tabs);
      const persistedMetadata = await readSpreadsheet(spreadsheetId);
      const persistedNames = (persistedMetadata.sheets ?? [])
        .map((sheet) => sheet.properties?.title)
        .filter((name): name is string => Boolean(name));
      const persistedTabs = await readTabs(
        spreadsheetId,
        persistedNames,
      );
      return {
        rows,
        revision: sheetRevision(persistedTabs),
        canonicalIndex: canonicalIndexContract(persistedTabs),
      };
    });
    const lastSyncedAt = new Date().toISOString();
    await saveConfig({
      spreadsheetId: record.spreadsheetId,
      spreadsheetUrl: record.spreadsheetUrl,
      title: record.title,
      lastSyncedAt,
      writeVerifiedAt: lastSyncedAt,
    });
    return res.json(
      SyncSheetsResponse.parse({
        status: statusFor(await config(), `Saved ${result.rows} records to Google Sheets.`),
        updatedTabs: input.tabs.length,
        updatedRows: result.rows,
        revision: result.revision,
        canonicalIndex: result.canonicalIndex,
      }),
    );
  } catch (error) {
    return next(error);
  }
});

router.use((error: unknown, _req: unknown, res: { status: (code: number) => { json: (body: unknown) => void }; json: (body: unknown) => void }, next: (error: unknown) => void) => {
  if (error instanceof GoogleSheetsError) {
    return res.status(error.statusCode).json({
      error: error.message,
      code: error.code,
      category: "provider",
      recoverable: error.code === "GOOGLE_REAUTH_REQUIRED" || error.statusCode >= 500,
    });
  }
  next(error);
});

export default router;
