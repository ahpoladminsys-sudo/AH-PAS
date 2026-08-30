import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import vm from "node:vm";
import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import {
  GetLibraryCatalogEnrichmentResponse,
  GetLibraryCatalogResponse,
  RebuildLibraryArtifactResponse,
} from "@workspace/api-zod";
import { db, sheetSyncConfigTable } from "@workspace/db";
import {
  GoogleSheetsError,
  readSpreadsheet,
  readTabs,
} from "../lib/google-sheets";
import {
  GoogleDriveError,
  listDocuments,
  type DriveDocumentMetadata,
} from "../lib/google-drive";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();
const LIBRARY_TAB = "Project Library";
const execFileAsync = promisify(execFile);

function workspaceRoot() {
  const candidates = [
    process.env.REPLIT_WORKSPACE_ROOT,
    process.cwd(),
    path.resolve(import.meta.dirname, "../../../.."),
    path.resolve(import.meta.dirname, "../../.."),
  ].filter((candidate): candidate is string => Boolean(candidate));
  return candidates.find((candidate) => fs.existsSync(path.join(candidate, "artifacts"))) ?? process.cwd();
}

const WORKSPACE_ROOT = workspaceRoot();
const ARTIFACTS_ROOT = path.join(WORKSPACE_ROOT, "artifacts");
const APPROVED_REBUILDS: Record<string, { args: string[]; basePath: string; port: string }> = {
  "stop-loss-app": {
    args: ["--filter", "@workspace/stop-loss-app", "run", "build"],
    basePath: "/",
    port: "20305",
  },
};
const rebuildLocks = new Map<string, Promise<LibraryArtifactBuild>>();

type LibraryRecord = {
  id: string;
  title: string;
  type: string;
  status: string;
  description: string;
  artifactSlug: string | null;
  artifactUrl: string | null;
  tags: string[];
  updatedAt: string | null;
  driveFileId: string | null;
  driveWebViewLink: string | null;
};

type LibraryArtifactBuild = {
  state: "current" | "stale" | "unavailable";
  message: string;
  builtAt: string | null;
  sourceModifiedAt: string | null;
  size: string | null;
  downloadUrl: string | null;
};

function tomlString(value: string) {
  const match = value.match(/^\s*"((?:\\.|[^"])*)"\s*$/);
  if (!match) return value.trim();
  return match[1].replace(/\\"/g, '"').replace(/\\\\/g, "\\");
}

function readArtifactManifest(slug: string) {
  const manifestPath = path.join(ARTIFACTS_ROOT, slug, ".replit-artifact", "artifact.toml");
  if (!fs.existsSync(manifestPath)) return null;
  const lines = fs.readFileSync(manifestPath, "utf8").split(/\r?\n/);
  let section = "root";
  let serviceName = "";
  const serviceNames: string[] = [];
  let productionConfigured = false;
  const values: Record<string, string> = {};

  for (const line of lines) {
    const sectionMatch = line.match(/^\s*(\[\[services\]\]|\[services(?:\.[a-z]+)?(?:\.[a-z]+)?\])\s*$/);
    if (sectionMatch) {
      section = sectionMatch[1].includes("services.production")
        ? "production"
        : sectionMatch[1] === "[[services]]"
          ? "service"
          : "other";
      continue;
    }
    const keyMatch = line.match(/^\s*([A-Za-z][A-Za-z0-9_]*)\s*=\s*(.+?)\s*$/);
    if (!keyMatch) continue;
    const [, key, rawValue] = keyMatch;
    if (section === "root" && ["id", "kind", "title", "description", "previewPath"].includes(key)) {
      values[key] = tomlString(rawValue);
    }
    if (section === "service" && key === "name") {
      serviceName = tomlString(rawValue);
      if (serviceName && !serviceNames.includes(serviceName)) serviceNames.push(serviceName);
    }
    if (section === "production") productionConfigured = true;
  }

  if (!values.id || !values.title || !values.previewPath) return null;
  const build = readArtifactBuild(slug);
  return {
    id: values.id,
    slug,
    kind: values.kind || "web",
    title: values.title,
    description: values.description || "",
    route: values.previewPath,
    artifactPath: `/artifacts/${slug}`,
    serviceNames,
    productionConfigured,
    build,
  };
}

function latestSourceModifiedAt(slug: string) {
  const artifactRoot = path.join(ARTIFACTS_ROOT, slug);
  const sourceRoots = ["index.html", "vite.config.ts", "package.json", "tsconfig.json", "src", "public", "scripts"];
  let latest = 0;

  const visit = (candidate: string) => {
    let stat: fs.Stats;
    try {
      stat = fs.statSync(candidate);
    } catch {
      return;
    }
    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(candidate, { withFileTypes: true })) {
        if (entry.name === "dist" || entry.name === "node_modules" || entry.name === ".replit-artifact" || entry.name.endsWith(".tsbuildinfo")) continue;
        visit(path.join(candidate, entry.name));
      }
      return;
    }
    latest = Math.max(latest, stat.mtimeMs);
  };

  for (const root of sourceRoots) {
    visit(path.isAbsolute(root) ? root : path.join(artifactRoot, root));
  }
  if (slug === "stop-loss-app") {
    const attachedRoot = path.join(WORKSPACE_ROOT, "attached_assets");
    try {
      for (const entry of fs.readdirSync(attachedRoot)) {
        if (/^Indexes_.*\.xlsx$/i.test(entry)) visit(path.join(attachedRoot, entry));
      }
    } catch {
      // The build can still be inspected when optional offline inputs are absent.
    }
  }
  return latest || null;
}

function artifactOutputPath(slug: string) {
  return path.join(ARTIFACTS_ROOT, slug, "dist", "public", "index.html");
}

function validateStandaloneHtml(contents: string) {
  if (!/<html\b/i.test(contents) || !/<body\b/i.test(contents)) {
    return "The generated output is not a complete HTML document.";
  }
  const localAsset = /<(?:script|link|img|iframe|source|video|audio|object)\b[^>]+(?:src|href|data)\s*=\s*["'](?!https?:\/\/|\/\/|data:|blob:|#|mailto:|tel:|javascript:)[^"']+/i;
  if (localAsset.test(contents)) {
    return "The generated output still depends on a local asset file.";
  }
  const scripts = Array.from(contents.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi));
  try {
    scripts
      .filter((match) => !/\bsrc\s*=/i.test(match[1]))
      .map((match) => match[2].trim())
      .filter(Boolean)
      .forEach((script, index) => {
        new vm.Script(script, { filename: `standalone-inline-script-${index + 1}.js` });
      });
  } catch {
    return "The generated output contains an invalid inline script.";
  }
  return null;
}

function inspectArtifactOutput(slug: string) {
  const outputPath = artifactOutputPath(slug);
  if (!fs.existsSync(outputPath)) return { outputPath, validation: "No generated standalone HTML build is available." };
  try {
    const contents = fs.readFileSync(outputPath, "utf8");
    return { outputPath, validation: validateStandaloneHtml(contents) };
  } catch {
    return { outputPath, validation: "The generated standalone HTML could not be read." };
  }
}

function readArtifactBuild(slug: string): LibraryArtifactBuild {
  const outputPath = artifactOutputPath(slug);
  const downloadUrl = `/api/library/artifacts/${encodeURIComponent(slug)}/export`;
  const sourceModified = latestSourceModifiedAt(slug);
  const inspected = inspectArtifactOutput(slug);
  if (!fs.existsSync(outputPath) || inspected.validation) {
    return {
      state: "unavailable",
      message: inspected.validation || "No generated standalone HTML build is available.",
      builtAt: null,
      sourceModifiedAt: sourceModified ? new Date(sourceModified).toISOString() : null,
      size: null,
      downloadUrl: null,
    };
  }

  const outputStat = fs.statSync(outputPath);
  const builtAt = new Date(outputStat.mtimeMs).toISOString();
  const sourceModifiedAt = sourceModified ? new Date(sourceModified).toISOString() : null;
  const current = !sourceModified || outputStat.mtimeMs >= sourceModified - 1000;
  return {
    state: current ? "current" : "stale",
    message: current
      ? "Current one-file HTML build."
      : "Source files changed after this build. Rebuild before distributing this export.",
    builtAt,
    sourceModifiedAt,
    size: String(outputStat.size),
    downloadUrl,
  };
}

class LibraryBuildError extends Error {
  constructor(message: string, public readonly statusCode: 409 | 422 = 409) {
    super(message);
    this.name = "LibraryBuildError";
  }
}

async function performApprovedRebuild(slug: string): Promise<LibraryArtifactBuild> {
  const approved = APPROVED_REBUILDS[slug];
  const artifact = discoverArtifacts().find((item) => item.slug === slug);
  if (!approved || !artifact || !artifact.productionConfigured) {
    throw new LibraryBuildError("This artifact is not approved for a server-side rebuild.", 409);
  }

  const artifactDir = path.join(ARTIFACTS_ROOT, slug);
  const distDir = path.join(artifactDir, "dist");
  const buildId = randomUUID();
  const tempOutputDir = path.join(distDir, `.library-rebuild-${buildId}`, "public");
  const tempOutputPath = path.join(tempOutputDir, "index.html");
  const handoffPath = path.join(artifactDir, "dist", "public", `.index.html-${buildId}.tmp`);
  const sourceAtStart = latestSourceModifiedAt(slug);

  try {
    await fs.promises.mkdir(tempOutputDir, { recursive: true });
    await execFileAsync("pnpm", approved.args, {
      cwd: WORKSPACE_ROOT,
      env: {
        ...process.env,
        NODE_ENV: "production",
        PORT: approved.port,
        BASE_PATH: approved.basePath,
        STOP_LOSS_BUILD_OUT_DIR: tempOutputDir,
      },
      timeout: 180_000,
      maxBuffer: 512 * 1024,
    });

    if (!fs.existsSync(tempOutputPath)) {
      throw new LibraryBuildError("The approved rebuild completed without producing standalone HTML.", 409);
    }
    const contents = await fs.promises.readFile(tempOutputPath, "utf8");
    const validation = validateStandaloneHtml(contents);
    if (validation) throw new LibraryBuildError(validation, 422);
    const sourceAtEnd = latestSourceModifiedAt(slug);
    if (sourceAtStart && sourceAtEnd && sourceAtEnd > sourceAtStart) {
      throw new LibraryBuildError("Source files changed during the rebuild. The previous export was kept unchanged. Retry the rebuild.", 409);
    }

    await fs.promises.mkdir(path.dirname(handoffPath), { recursive: true });
    await fs.promises.copyFile(tempOutputPath, handoffPath);
    await fs.promises.rename(handoffPath, artifactOutputPath(slug));

    const build = readArtifactBuild(slug);
    if (build.state !== "current") {
      throw new LibraryBuildError("The rebuilt HTML is not fresh against the latest source. Retry the rebuild.", 409);
    }
    return build;
  } catch (error) {
    if (error instanceof LibraryBuildError) throw error;
    throw new LibraryBuildError("The approved rebuild failed. The previous export was kept unchanged.");
  } finally {
    await fs.promises.rm(path.dirname(tempOutputDir), { recursive: true, force: true }).catch(() => undefined);
    await fs.promises.rm(handoffPath, { force: true }).catch(() => undefined);
  }
}

function queueApprovedRebuild(slug: string) {
  const prior = rebuildLocks.get(slug) ?? Promise.resolve();
  const next = prior.catch(() => undefined).then(() => performApprovedRebuild(slug));
  let tracked: Promise<LibraryArtifactBuild>;
  tracked = next.finally(() => {
    if (rebuildLocks.get(slug) === tracked) rebuildLocks.delete(slug);
  });
  rebuildLocks.set(slug, tracked);
  return tracked;
}

function discoverArtifacts() {
  if (!fs.existsSync(ARTIFACTS_ROOT)) return [];
  return fs
    .readdirSync(ARTIFACTS_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => readArtifactManifest(entry.name))
    .filter((artifact): artifact is NonNullable<ReturnType<typeof readArtifactManifest>> => Boolean(artifact))
    .sort((a, b) => a.title.localeCompare(b.title));
}

function textValue(value: unknown, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function nullableText(value: unknown) {
  const text = textValue(value);
  return text || null;
}

function tagsValue(value: unknown) {
  const text = textValue(value);
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
  } catch {
    // Accept the operator-friendly comma-separated format as well.
  }
  return text.split(",").map((tag) => tag.trim()).filter(Boolean);
}

function normalizeRecord(row: Record<string, unknown>, index: number): LibraryRecord | null {
  const title = textValue(row.title || row.name);
  if (!title) return null;
  return {
    id: textValue(row.id, `library-record-${index + 1}`),
    title,
    type: textValue(row.type, "output"),
    status: textValue(row.status, "active"),
    description: textValue(row.description),
    artifactSlug: nullableText(row.artifactSlug || row.slug),
    artifactUrl: nullableText(row.artifactUrl || row.url),
    tags: tagsValue(row.tags),
    updatedAt: nullableText(row.updatedAt || row.updated_at),
    driveFileId: nullableText(row.driveFileId || row.drive_file_id),
    driveWebViewLink: nullableText(row.driveWebViewLink || row.drive_web_view_link),
  };
}

function source(state: "connected" | "read_only" | "unavailable" | "local", message: string) {
  return { state, message };
}

async function readLibraryRecords() {
  const configRows = await db
    .select()
    .from(sheetSyncConfigTable)
    .where(eq(sheetSyncConfigTable.id, 1));
  const config = configRows[0];
  if (!config?.spreadsheetId) {
    return {
      records: [] as LibraryRecord[],
      status: source("unavailable", "Google Sheets is not configured; using local library data."),
    };
  }
  try {
    const metadata = await readSpreadsheet(config.spreadsheetId);
    const names = (metadata.sheets ?? [])
      .map((sheet) => sheet.properties?.title)
      .filter((name): name is string => Boolean(name));
    if (!names.includes(LIBRARY_TAB)) {
      return {
        records: [] as LibraryRecord[],
        status: source("read_only", "Connected to Google Sheets. The Project Library tab is empty or has not been initialized."),
      };
    }
    const tab = (await readTabs(config.spreadsheetId, [LIBRARY_TAB]))[0];
    return {
      records: (tab?.rows ?? [])
        .map((row, index) => normalizeRecord(row, index))
        .filter((record): record is LibraryRecord => Boolean(record)),
      status: source("read_only", "Connected to Google Sheets for reads. Push is deliberate and may be unavailable with this connection."),
    };
  } catch (error) {
    if (error instanceof GoogleSheetsError) {
      return { records: [] as LibraryRecord[], status: source("unavailable", error.message) };
    }
    throw error;
  }
}

function driveFile(file: DriveDocumentMetadata) {
  return {
    id: file.id,
    name: file.name,
    mimeType: file.mimeType,
    webViewLink: file.webViewLink ?? `https://drive.google.com/open?id=${file.id}`,
    size: file.size ?? null,
    modifiedTime: file.modifiedTime ?? null,
    parentIds: file.parents ?? [],
  };
}

router.get("/library/artifacts/:slug/export", requireAuth, (req, res, next) => {
  const slug = String(req.params.slug || "").trim();
  const artifact = discoverArtifacts().find((item) => item.slug === slug);
  if (!artifact) return res.status(404).json({ error: "Artifact not found." });

  const outputPath = artifactOutputPath(slug);
  if (!fs.existsSync(outputPath)) return res.status(404).json({ error: "Generated standalone HTML is not available." });
  const build = readArtifactBuild(slug);
  if (build.state !== "current") {
    return res.status(409).json({ error: build.message || "The standalone HTML export is stale and must be rebuilt." });
  }

  res.type("html");
  res.setHeader("Cache-Control", "no-store");
  const safeFilename = slug.replace(/[^A-Za-z0-9._-]/g, "-");
  res.setHeader("X-Library-Build-At", build.builtAt ?? "");
  res.setHeader("X-Library-Source-Modified-At", build.sourceModifiedAt ?? "");
  res.setHeader("Content-Disposition", `attachment; filename="${safeFilename}.html"`);
  return res.sendFile(outputPath, (error) => {
    if (error && !res.headersSent) next(error);
  });
});

router.post("/library/artifacts/:slug/rebuild", requireAuth, async (req, res): Promise<void> => {
  const slug = String(req.params.slug || "").trim();
  if (!APPROVED_REBUILDS[slug] || !discoverArtifacts().some((artifact) => artifact.slug === slug)) {
    res.status(404).json({ error: "This artifact is not registered for a controlled rebuild." });
    return;
  }
  try {
    res.json(RebuildLibraryArtifactResponse.parse(await queueApprovedRebuild(slug)));
  } catch (error) {
    const status = error instanceof LibraryBuildError ? error.statusCode : 409;
    res.status(status).json({ error: error instanceof Error ? error.message : "The artifact rebuild failed." });
  }
});

router.get("/library/catalog", (_req, res) => {
  res.json(GetLibraryCatalogResponse.parse({
    artifacts: discoverArtifacts(),
    records: [],
    driveFiles: [],
    sources: {
      sheets: source("local", "Sign in to load protected Google Sheets library records."),
      drive: source("local", "Sign in to load protected Google Drive documents."),
    },
    generatedAt: new Date().toISOString(),
  }));
});

router.get("/library/catalog/enrichment", requireAuth, async (_req, res): Promise<void> => {
  const sheetsPromise = readLibraryRecords();
  const drivePromise = listDocuments();
  const [sheetResult, driveResult] = await Promise.allSettled([sheetsPromise, drivePromise]);
  const sheets = sheetResult.status === "fulfilled"
    ? sheetResult.value
    : {
        records: [] as LibraryRecord[],
        status: source("unavailable", "Google Sheets could not be reached; local artifact metadata remains available."),
      };
  const driveFiles = driveResult.status === "fulfilled" ? driveResult.value.map(driveFile) : [];
  const driveStatus = driveResult.status === "fulfilled"
    ? source("connected", `${driveFiles.length} Drive file${driveFiles.length === 1 ? "" : "s"} available.`)
    : source(
        "unavailable",
        driveResult.reason instanceof GoogleDriveError
          ? driveResult.reason.message
          : "Google Drive could not be reached; local artifact metadata remains available.",
      );
  res.json(GetLibraryCatalogEnrichmentResponse.parse({
    records: sheets.records,
    driveFiles,
    sources: { sheets: sheets.status, drive: driveStatus },
  }));
});

export default router;
