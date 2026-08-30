import { Router, type IRouter } from "express";
import { randomUUID } from "node:crypto";
import {
  GetDriveStatusResponse,
  PreviewDriveMigrationBody,
  PreviewDriveMigrationResponse,
  ExecuteDriveMigrationBody,
  ExecuteDriveMigrationResponse,
  GetDriveDocumentsResponse,
  TransferSheetToDriveBody,
  TransferSheetToDriveResponse,
  UploadDriveDocumentBody,
  UploadDriveDocumentResponse,
  SaveDriveEnrollmentWorkbookBody,
  SaveDriveEnrollmentWorkbookResponse,
  GetDriveWorkspaceStateResponse,
  SaveDriveWorkspaceStateBody,
  SaveDriveWorkspaceStateResponse,
  PreviewDriveDuplicatesBody,
  PreviewDriveDuplicatesResponse,
  ExecuteDriveDuplicatesBody,
  ExecuteDriveDuplicatesResponse,
} from "@workspace/api-zod";
import {
  DEFAULT_DESTINATION_EMAIL,
  GoogleDriveError,
  MANAGED_SYSTEM_FOLDER_NAME,
  OPERATION_APP_PROPERTY,
  downloadDocument,
  createManagedWorkspaceState,
  ensureManagedSystemFolder,
  ensureFolderPath,
  findEnrollmentWorkbook,
  findManagedWorkspaceState,
  findDocumentByOperationId,
  findFolderPath,
  getDocumentMetadata,
  listDocuments,
  listFolders,
  moveDocument,
  shareFile,
  trashDocument,
  uploadDocument,
  updateDocumentContent,
} from "../lib/google-drive";
import { getSpreadsheetId } from "../lib/google-sheets";
import {
  decodeWorkspaceState,
  encodeWorkspaceState,
  hasWorkspaceStateConflict,
} from "../lib/workspace-state";

const router: IRouter = Router();
const enrollmentWorkbookWrites = new Map<string, Promise<unknown>>();

async function serializeEnrollmentWorkbookWrite<T>(
  policyId: string,
  work: () => Promise<T>,
): Promise<T> {
  const previous = enrollmentWorkbookWrites.get(policyId) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(work);
  enrollmentWorkbookWrites.set(policyId, current);
  try {
    return await current;
  } finally {
    if (enrollmentWorkbookWrites.get(policyId) === current) {
      enrollmentWorkbookWrites.delete(policyId);
    }
  }
}

router.get("/drive/status", async (_req, res, next) => {
  try {
    await listDocuments();
    return res.json(
      GetDriveStatusResponse.parse({
        configured: true,
         accessState: "connected",
        connection: "Google Drive",
        destinationEmail: DEFAULT_DESTINATION_EMAIL,
        message: "Google Drive access was verified with a live read.",
      }),
    );
  } catch (error) {
    return next(error);
  }
});

router.get("/drive/documents", async (_req, res, next) => {
  try {
    const files = await listDocuments();
    return res.json(GetDriveDocumentsResponse.parse({
      files: files.map((file) => ({
        id: file.id,
        name: file.name,
        mimeType: file.mimeType,
        webViewLink:
          file.webViewLink ?? `https://drive.google.com/open?id=${file.id}`,
        size: file.size,
        modifiedTime: file.modifiedTime,
        parentIds: file.parents ?? [],
      })),
    }));
  } catch (error) {
    return next(error);
  }
});

router.get("/drive/index-workbooks", async (_req, res, next) => {
  try {
    const files = await listDocuments();
    const indexFiles = files
      .filter((file) => /^Indexes_/i.test(file.name) && file.mimeType !== "application/vnd.google-apps.folder")
      .map((file) => {
        const verifiedAugust = /^Indexes[_ -]*8[-_]2026/i.test(file.name ?? "");
        const legacyV10 = /^Indexes_v10\b/i.test(file.name ?? "");
        return {
          id: file.id,
          name: file.name,
          mimeType: file.mimeType,
          webViewLink: file.webViewLink ?? `https://drive.google.com/open?id=${file.id}`,
          size: file.size,
          modifiedTime: file.modifiedTime,
          parentIds: file.parents ?? [],
          sourceId: file.appProperties?.tinubuSourceId,
          verifiedAugust,
          excluded: legacyV10,
          exclusionReason: legacyV10 ? "Legacy Indexes_v10 structure is excluded from canonical selection." : undefined,
          canonicalRank: verifiedAugust ? 0 : legacyV10 ? 2 : 1,
        };
      })
      .sort((left, right) =>
        left.canonicalRank - right.canonicalRank
        || String(right.modifiedTime ?? "").localeCompare(String(left.modifiedTime ?? ""))
        || left.name.localeCompare(right.name));
    return res.json({ files: indexFiles });
  } catch (error) {
    return next(error);
  }
});

router.put("/drive/documents/:documentId/content", async (req, res, next) => {
  try {
    const fileId = req.params.documentId.trim();
    const contentBase64 = typeof req.body?.contentBase64 === "string"
      ? req.body.contentBase64.replace(/\s/g, "")
      : "";
    if (!fileId || !contentBase64 || !/^[A-Za-z0-9+/]*={0,2}$/.test(contentBase64)) {
      return res.status(400).json({ error: "A Drive file ID and valid base64 content are required." });
    }
    const current = await getDocumentMetadata(fileId);
    const expectedModifiedTime = typeof req.body?.expectedModifiedTime === "string"
      ? req.body.expectedModifiedTime.trim()
      : "";
    if (expectedModifiedTime && current.modifiedTime && expectedModifiedTime !== current.modifiedTime) {
      return res.status(409).json({
        error: "The Google Drive workbook changed after it was loaded. Refresh the index and review the newer version before saving.",
        expectedModifiedTime,
        actualModifiedTime: current.modifiedTime,
      });
    }
    const updated = await updateDocumentContent(fileId, contentBase64);
    const refreshed = await getDocumentMetadata(updated.id);
    return res.json({
      id: refreshed.id,
      name: refreshed.name || current.name,
      mimeType: refreshed.mimeType || current.mimeType,
      webViewLink: refreshed.webViewLink ?? `https://drive.google.com/open?id=${refreshed.id}`,
      modifiedTime: refreshed.modifiedTime ?? new Date().toISOString(),
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/drive/documents/:documentId/share", async (req, res, next) => {
  try {
    const fileId = req.params.documentId.trim();
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const role = req.body?.role === "owner" ? "owner" : "writer";
    if (!fileId || !email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return res.status(400).json({ error: "A Drive file ID and valid recipient email are required." });
    }
    await shareFile(fileId, email, role);
    return res.json({
      id: fileId,
      email,
      role,
      message: role === "owner"
        ? `Ownership transfer was requested for ${email}. Google may require the recipient to accept the transfer.`
        : `The file is now shared with ${email}.`,
    });
  } catch (error) {
    return next(error);
  }
});

type MigrationPolicy = {
  id: string;
  name: string;
  effectiveYear: string;
  documentFileIds?: string[];
};

type MigrationMove = {
  sourceFileId: string;
  destinationPath: string[];
  destinationFolderId?: string;
  expectedSourceParentIds: string[];
};

const DOCUMENT_CATEGORIES = ["Billing", "Enrollment", "Quote Docs", "UW Docs"];
const MIGRATION_PREVIEW_TTL_MS = 15 * 60 * 1000;
const migrationPreviews = new Map<string, {
  expiresAt: number;
  operationId: string;
  moves: Map<string, MigrationMove>;
}>();
type DuplicateCandidate = {
  fileId: string;
  fileName: string;
  modifiedTime: string;
  parentFolderId: string;
  parentPath: string[];
  retainedFileId: string;
  retainedModifiedTime: string;
  reason: string;
};
const duplicatePreviews = new Map<string, {
  expiresAt: number;
  folderId: string;
  candidates: Map<string, DuplicateCandidate>;
}>();

function safeFolderName(value: string) {
  return value
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

function normalizeMatch(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function documentCategory(name: string, sourcePath: string[]) {
  const lowerName = name.toLowerCase();
  const byName = /invoice|billing|premium|statement|ledger/.test(lowerName)
    ? "Billing"
    : /enroll|census|eligib|member roster/.test(lowerName)
      ? "Enrollment"
      : /quote|rfp|proposal|sbc|loss run|claims report|plan design/.test(lowerName)
        ? "Quote Docs"
        : /policy|endorsement|certificate|schedule of benefits|declaration/.test(lowerName)
          ? "UW Docs"
          : null;
  if (byName) return byName;
  const pathCategory = sourcePath.find((part) =>
    DOCUMENT_CATEGORIES.some((category) => normalizeMatch(category) === normalizeMatch(part)),
  );
  return pathCategory ?? null;
}

function parentPath(parentId: string | undefined, foldersById: Map<string, { id: string; name: string; parents?: string[] }>) {
  const path: string[] = [];
  const seen = new Set<string>();
  let currentId = parentId;
  while (currentId && !seen.has(currentId)) {
    seen.add(currentId);
    const folder = foldersById.get(currentId);
    if (!folder) break;
    path.unshift(folder.name);
    currentId = folder.parents?.[0];
  }
  return path;
}

function policyCandidates(
  file: { id: string; name: string },
  sourcePath: string[],
  policies: MigrationPolicy[],
) {
  const fileName = normalizeMatch(file.name);
  const sourceRoot = normalizeMatch(sourcePath[0] ?? "");
  return policies.filter((policy) => {
    const policyId = normalizeMatch(policy.id);
    const policyName = normalizeMatch(policy.name);
    const root = normalizeMatch(`${policy.id} - ${policy.name}`);
    return (policy.documentFileIds ?? []).includes(file.id)
      || sourceRoot === root
      || (policyId.length >= 6 && fileName.includes(policyId))
      || (policyName.length >= 6 && fileName.includes(policyName));
  });
}

router.post("/drive/migrations/preview", async (req, res, next): Promise<void> => {
  try {
    const input = PreviewDriveMigrationBody.parse(req.body);
    const policies = input.policies as MigrationPolicy[];
    const [files, folders] = await Promise.all([listDocuments(), listFolders()]);
    const foldersById = new Map(folders.map((folder) => [folder.id, folder]));
    const destinationCache = new Map<string, string | null>();
    const previewFiles = [];
    const proposedMoves = new Map<string, MigrationMove>();

    for (const file of files) {
      const sourceParentIds = file.parents ?? [];
      const sourcePath = parentPath(sourceParentIds[0], foldersById);
      const candidates = policyCandidates(file, sourcePath, policies);
      const policy = candidates.length === 1 ? candidates[0] : undefined;
      const category = policy ? documentCategory(file.name, sourcePath) : null;
      const destinationPath = policy && category
        ? [
            safeFolderName(`${policy.id} - ${policy.name}`),
            safeFolderName(policy.effectiveYear),
            safeFolderName(category),
          ]
        : [];
      let destinationFolderId: string | null = null;
      if (destinationPath.length) {
        const cacheKey = destinationPath.join("\u0000");
        if (destinationCache.has(cacheKey)) {
          destinationFolderId = destinationCache.get(cacheKey) ?? null;
        } else {
          destinationFolderId = (await findFolderPath(destinationPath)).folderId;
          destinationCache.set(cacheKey, destinationFolderId);
        }
      }
      const ambiguousReason = candidates.length > 1
        ? "Multiple policies match this file."
        : !policy
          ? "No policy could be matched from the file reference or name."
          : !category
            ? "A policy matched, but the document category is unclear."
            : !/^\d{4}$/.test(policy.effectiveYear)
              ? "The policy effective year is missing or invalid."
              : "";
      const alreadyInDestination = Boolean(
        destinationFolderId && sourceParentIds.includes(destinationFolderId),
      );
      const decision = ambiguousReason
        ? "ambiguous"
        : alreadyInDestination
          ? "already_in_destination"
          : "proposed";
      previewFiles.push({
        sourceFileId: file.id,
        sourceName: file.name,
        sourceMimeType: file.mimeType,
        sourceWebViewLink: file.webViewLink ?? `https://drive.google.com/open?id=${file.id}`,
        sourceModifiedTime: file.modifiedTime ?? null,
        decision,
        reason: ambiguousReason || (alreadyInDestination
          ? "The file is already in the proposed destination folder."
          : policy?.documentFileIds?.includes(file.id)
            ? "Matched by the policy document's Drive file reference."
            : "Matched by a unique policy reference and document category."),
        policyId: policy?.id ?? null,
        category,
        sourceParentIds,
        sourcePath,
        destinationFolderId,
        destinationPath,
      });
      if (decision === "proposed") {
        proposedMoves.set(file.id, {
          sourceFileId: file.id,
          destinationPath,
          destinationFolderId: destinationFolderId ?? undefined,
          expectedSourceParentIds: sourceParentIds,
        });
      }
    }

    const previewId = randomUUID();
    const operationId = randomUUID();
    migrationPreviews.set(previewId, {
      expiresAt: Date.now() + MIGRATION_PREVIEW_TTL_MS,
      operationId,
      moves: proposedMoves,
    });
    res.json(
      PreviewDriveMigrationResponse.parse({
        previewId,
        operationId,
        generatedAt: new Date().toISOString(),
        files: previewFiles,
        proposedCount: previewFiles.filter((file) => file.decision === "proposed").length,
        ambiguousCount: previewFiles.filter((file) => file.decision === "ambiguous").length,
        alreadyInDestinationCount: previewFiles.filter(
          (file) => file.decision === "already_in_destination",
        ).length,
      }),
    );
  } catch (error) {
    return next(error);
  }
});

function sameIds(left: string[], right: string[]) {
  if (left.length !== right.length) return false;
  const rightSet = new Set(right);
  return left.every((id) => rightSet.has(id));
}

function validDriveTimestamp(value: string | null | undefined): value is string {
  return typeof value === "string" && value.length > 0 && !Number.isNaN(Date.parse(value));
}

router.post("/drive/migrations/execute", async (req, res, next): Promise<void> => {
  try {
    const input = ExecuteDriveMigrationBody.parse(req.body);
    if (!input.approved) {
      res.status(400).json({ error: "Explicit approval is required before Drive files can be moved." });
      return;
    }
    const preview = migrationPreviews.get(input.previewId);
    if (!preview || preview.expiresAt < Date.now()) {
      migrationPreviews.delete(input.previewId);
      res.status(409).json({ error: "This migration preview has expired. Run a new dry-run before approving moves." });
      return;
    }
    const moves = input.moves as MigrationMove[];
    if (moves.some((move, index) => moves.findIndex((candidate) => candidate.sourceFileId === move.sourceFileId) !== index)) {
      res.status(400).json({ error: "Each Drive file can appear only once in an approved migration." });
      return;
    }
    for (const move of moves) {
      const proposedMove = preview.moves.get(move.sourceFileId);
      if (!proposedMove
        || JSON.stringify(proposedMove.destinationPath) !== JSON.stringify(move.destinationPath)
        || (proposedMove.destinationFolderId ?? null) !== (move.destinationFolderId ?? null)
        || !sameIds(proposedMove.expectedSourceParentIds, move.expectedSourceParentIds)) {
        res.status(400).json({ error: "Approved moves must match the exact proposed files, destinations, and source folders from the dry-run." });
        return;
      }
    }
    const folders = await listFolders();
    const foldersById = new Map(folders.map((folder) => [folder.id, folder]));
    const results: Array<Record<string, unknown>> = [];
    const operationId = randomUUID();
    for (const move of moves) {
      const decidedAt = new Date().toISOString();
      let metadata;
      try {
        metadata = await getDocumentMetadata(move.sourceFileId);
      } catch (error) {
        results.push({ operationId, decidedAt, sourceFileId: move.sourceFileId, sourceName: "Unavailable Drive file", status: "failed", message: error instanceof Error ? error.message : "Drive metadata could not be read.", destinationFolderId: move.destinationFolderId ?? null, destinationPath: move.destinationPath, beforeParentIds: [], beforePath: [], afterParentIds: [], afterPath: [] });
        continue;
      }
      const beforeParentIds = metadata.parents ?? [];
      const beforePath = parentPath(beforeParentIds[0], foldersById);
      try {
        const destinationFolderId = move.destinationFolderId || await ensureFolderPath(move.destinationPath);
        if (!destinationFolderId) throw new GoogleDriveError("The destination folder could not be resolved.", 409);
        if (beforeParentIds.includes(destinationFolderId)) {
          results.push({ operationId, decidedAt, sourceFileId: move.sourceFileId, sourceName: metadata.name, status: "already_in_destination", message: "The file is already in the requested destination folder.", destinationFolderId, destinationPath: move.destinationPath, beforeParentIds, beforePath, afterParentIds: beforeParentIds, afterPath: beforePath });
          continue;
        }
        if (!sameIds(beforeParentIds, move.expectedSourceParentIds)) {
          results.push({
            sourceFileId: metadata.id,
            sourceName: metadata.name,
            operationId,
            decidedAt,
            status: "conflict",
            message: "The file's current folder changed after the preview. Review it again before moving.",
            destinationFolderId,
            destinationPath: move.destinationPath,
            beforeParentIds,
            beforePath,
            afterParentIds: beforeParentIds,
            afterPath: beforePath,
          });
          continue;
        }
        const moved = await moveDocument(metadata.id, destinationFolderId, beforeParentIds);
        const afterParentIds = moved.parents ?? [destinationFolderId];
        results.push({ operationId, decidedAt, sourceFileId: move.sourceFileId, sourceName: metadata.name, status: "moved", message: "File moved to the reviewed destination.", destinationFolderId, destinationPath: move.destinationPath, beforeParentIds, beforePath, afterParentIds, afterPath: move.destinationPath });
      } catch (error) {
        results.push({ operationId, decidedAt, sourceFileId: move.sourceFileId, sourceName: metadata.name, status: "failed", message: error instanceof Error ? error.message : "Drive migration failed.", destinationFolderId: move.destinationFolderId ?? null, destinationPath: move.destinationPath, beforeParentIds, beforePath, afterParentIds: metadata.parents ?? [], afterPath: beforePath });
      }
    }
    res.json(ExecuteDriveMigrationResponse.parse({
      approved: true,
      previewId: input.previewId,
      operationId,
      decidedAt: new Date().toISOString(),
      movedCount: results.filter((result) => result.status === "moved").length,
      alreadyInDestinationCount: results.filter((result) => result.status === "already_in_destination").length,
      conflictCount: results.filter((result) => result.status === "conflict").length,
      failedCount: results.filter((result) => result.status === "failed").length,
      results,
    }));
  } catch (error) {
    next(error);
  }
});

router.post("/drive/duplicates/preview", async (req, res, next): Promise<void> => {
  try {
    const input = PreviewDriveDuplicatesBody.parse(req.body);
    const folderId = await ensureManagedSystemFolder();
    if (input.folderId && input.folderId !== folderId) {
      res.status(400).json({ error: "Duplicate cleanup is limited to the managed System Folder." });
      return;
    }
    const files = (await listDocuments()).filter((file) =>
      file.mimeType !== "application/vnd.google-apps.folder"
      && sameIds(file.parents ?? [], [folderId]),
    );
    const groups = new Map<string, typeof files>();
    for (const file of files) {
      const group = groups.get(file.name) ?? [];
      group.push(file);
      groups.set(file.name, group);
    }

    const previewFiles = [];
    const candidates = new Map<string, DuplicateCandidate>();
    let groupCount = 0;
    for (const [fileName, group] of groups) {
      if (group.length < 2) continue;
      groupCount += 1;
      const parentPath = [MANAGED_SYSTEM_FOLDER_NAME];
      if (group.some((file) => !validDriveTimestamp(file.modifiedTime))) {
        for (const file of group) {
          previewFiles.push({
            fileId: file.id,
            fileName,
            modifiedTime: file.modifiedTime ?? "",
            parentFolderId: folderId,
            parentPath,
            decision: "metadata_uncertain" as const,
            retainedFileId: "",
            reason: "At least one same-name file has a missing or invalid modified timestamp; no file in this group is eligible for trash.",
          });
        }
        continue;
      }
      const ordered = [...group].sort((left, right) =>
        Date.parse(right.modifiedTime!) - Date.parse(left.modifiedTime!)
        || left.id.localeCompare(right.id));
      const retained = ordered[0];
      previewFiles.push({
        fileId: retained.id,
        fileName,
        modifiedTime: retained.modifiedTime ?? "",
        parentFolderId: folderId,
        parentPath,
        decision: "retain" as const,
        retainedFileId: retained.id,
        reason: "Newest same-name file in the managed System Folder; this file will be retained.",
      });
      for (const older of ordered.slice(1)) {
        const reason = "Older same-name file in the same managed System Folder; eligible only after explicit review.";
        const candidate = {
          fileId: older.id,
          fileName,
          modifiedTime: older.modifiedTime ?? "",
          parentFolderId: folderId,
          parentPath,
          retainedFileId: retained.id,
          retainedModifiedTime: retained.modifiedTime ?? "",
          reason,
        };
        candidates.set(older.id, candidate);
        previewFiles.push({
          ...candidate,
          decision: "trash_candidate" as const,
        });
      }
    }

    const previewId = randomUUID();
    const operationId = randomUUID();
    duplicatePreviews.set(previewId, {
      expiresAt: Date.now() + MIGRATION_PREVIEW_TTL_MS,
      folderId,
      candidates,
    });
    res.json(PreviewDriveDuplicatesResponse.parse({
      previewId,
      operationId,
      generatedAt: new Date().toISOString(),
      folderId,
      folderPath: [MANAGED_SYSTEM_FOLDER_NAME],
      files: previewFiles,
      candidateCount: candidates.size,
      groupCount,
    }));
  } catch (error) {
    next(error);
  }
});

router.post("/drive/duplicates/execute", async (req, res, next): Promise<void> => {
  try {
    const input = ExecuteDriveDuplicatesBody.parse(req.body);
    if (!input.approved) {
      res.status(400).json({ error: "Explicit reviewed approval is required before duplicate files can be trashed." });
      return;
    }
    const preview = duplicatePreviews.get(input.previewId);
    if (!preview || preview.expiresAt < Date.now()) {
      duplicatePreviews.delete(input.previewId);
      res.status(409).json({ error: "This duplicate cleanup preview has expired. Run a new review before approving cleanup." });
      return;
    }
    if (new Set(input.fileIds).size !== input.fileIds.length) {
      res.status(400).json({ error: "Each duplicate file can be approved only once." });
      return;
    }
    if (input.fileIds.some((fileId) => !preview.candidates.has(fileId))) {
      res.status(400).json({ error: "Approved cleanup files must exactly match older candidates from the reviewed preview." });
      return;
    }

    const results = [];
    const operationId = randomUUID();
    for (const fileId of input.fileIds) {
      const candidate = preview.candidates.get(fileId)!;
      const decidedAt = new Date().toISOString();
      try {
        const [metadata, retained] = await Promise.all([
          getDocumentMetadata(candidate.fileId),
          getDocumentMetadata(candidate.retainedFileId),
        ]);
        const candidateMatches = metadata.name === candidate.fileName
          && metadata.modifiedTime === candidate.modifiedTime
          && sameIds(metadata.parents ?? [], [candidate.parentFolderId]);
        const retainedMatches = retained.name === candidate.fileName
          && retained.modifiedTime === candidate.retainedModifiedTime
          && sameIds(retained.parents ?? [], [candidate.parentFolderId])
          && !retained.trashed;
        if (metadata.trashed) {
          results.push({
            ...candidate,
            operationId,
            status: "already_trashed" as const,
            reason: "The reviewed older duplicate was already in trash; no additional change was made.",
            decidedAt,
          });
          continue;
        }
        if (!candidateMatches || !retainedMatches) {
          results.push({
            ...candidate,
            operationId,
            status: "conflict" as const,
            reason: "File name, timestamp, folder, or retained-copy metadata changed after review; nothing was trashed.",
            decidedAt,
          });
          continue;
        }
        await trashDocument(candidate.fileId);
        const result = {
          ...candidate,
          operationId,
          status: "trashed" as const,
          reason: "The reviewed older duplicate was moved to trash.",
          decidedAt,
        };
        results.push(result);
        req.log.info(
          {
            fileId: candidate.fileId,
            fileName: candidate.fileName,
            retainedFileId: candidate.retainedFileId,
            folderId: candidate.parentFolderId,
            folderPath: candidate.parentPath,
            reason: result.reason,
            decidedAt,
          },
          "Drive duplicate cleanup trashed an approved older file",
        );
      } catch (error) {
        const result = {
          ...candidate,
          operationId,
          status: "failed" as const,
          reason: error instanceof Error ? error.message : "Drive duplicate cleanup failed.",
          decidedAt,
        };
        results.push(result);
        req.log.error(
          {
            err: error,
            fileId: candidate.fileId,
            fileName: candidate.fileName,
            retainedFileId: candidate.retainedFileId,
            folderId: candidate.parentFolderId,
            folderPath: candidate.parentPath,
            reason: result.reason,
            decidedAt,
          },
          "Drive duplicate cleanup failed",
        );
      }
    }
    res.json(ExecuteDriveDuplicatesResponse.parse({
      approved: true,
      previewId: input.previewId,
      operationId,
      decidedAt: new Date().toISOString(),
      trashedCount: results.filter((result) => result.status === "trashed").length,
      conflictCount: results.filter((result) => result.status === "conflict").length,
      failedCount: results.filter((result) => result.status === "failed").length,
      results,
    }));
  } catch (error) {
    next(error);
  }
});

router.get("/drive/documents/:documentId/content", async (req, res, next) => {
  try {
    const fileId = req.params.documentId.trim();
    if (!fileId) return res.status(400).json({ error: "A Drive file ID is required." });
    const metadata = (await listDocuments()).find((file) => file.id === fileId);
    if (!metadata) return res.status(404).json({ error: "Drive file was not found." });
    const content = await downloadDocument(fileId);
    return res.json({
      id: fileId,
      name: metadata.name,
      mimeType: content.mimeType || metadata.mimeType,
      contentBase64: content.contentBase64,
      webViewLink:
        metadata.webViewLink ?? `https://drive.google.com/open?id=${fileId}`,
      modifiedTime: metadata.modifiedTime ?? new Date().toISOString(),
    });
  } catch (error) {
    return next(error);
  }
});

async function readManagedWorkspaceState() {
  const metadata = await findManagedWorkspaceState();
  if (!metadata) return null;
  const content = await downloadDocument(metadata.id);
  let state: unknown;
  try {
    state = decodeWorkspaceState(content.contentBase64);
  } catch {
    throw new GoogleDriveError("The managed workspace-state file is not valid JSON.", 409);
  }
  return {
    fileId: metadata.id,
    name: metadata.name,
    mimeType: metadata.mimeType,
    modifiedTime: metadata.modifiedTime ?? new Date().toISOString(),
    state,
  };
}

router.get("/drive/workspace-state", async (_req, res, next): Promise<void> => {
  try {
    const state = await readManagedWorkspaceState();
    if (!state) {
      res.status(404).json({ error: "No managed workspace-state file exists yet." });
      return;
    }
    const managedFolder = await findFolderPath([MANAGED_SYSTEM_FOLDER_NAME]);
    const metadata = await getDocumentMetadata(state.fileId);
    const currentFolderId = metadata.parents?.[0];
    res.json(GetDriveWorkspaceStateResponse.parse({
      ...state,
      folderId: managedFolder.folderId ?? undefined,
      folderPath: currentFolderId && currentFolderId === managedFolder.folderId
        ? [MANAGED_SYSTEM_FOLDER_NAME]
        : [],
      parentIds: metadata.parents ?? [],
      movedToSystemFolder: false,
    }));
  } catch (error) {
    next(error);
  }
});

router.put("/drive/workspace-state", async (req, res, next): Promise<void> => {
  try {
    const input = SaveDriveWorkspaceStateBody.parse(req.body);
    const current = await findManagedWorkspaceState();
    const expectedModifiedTime = input.expectedModifiedTime?.toISOString() ?? null;
    if (hasWorkspaceStateConflict(expectedModifiedTime, current?.modifiedTime)) {
      res.status(409).json({
        error: "The managed workspace state changed in Google Drive. Reload it before saving again.",
      });
      return;
    }

    const contentBase64 = encodeWorkspaceState(input.state);
    const systemFolderId = await ensureManagedSystemFolder();
    let metadata;
    let movedToSystemFolder = false;
    const operationId = randomUUID();
    const decidedAt = new Date().toISOString();
    if (current) {
      if (!sameIds(current.parents ?? [], [systemFolderId])) {
        await moveDocument(current.id, systemFolderId, current.parents ?? []);
        movedToSystemFolder = true;
      }
      metadata = await updateDocumentContent(current.id, contentBase64);
    } else {
      metadata = await createManagedWorkspaceState(contentBase64);
    }
    const refreshed = await getDocumentMetadata(metadata.id);
    const result = {
      fileId: refreshed.id,
      name: refreshed.name,
      mimeType: refreshed.mimeType,
      modifiedTime: refreshed.modifiedTime ?? new Date().toISOString(),
      folderId: systemFolderId,
      folderPath: [MANAGED_SYSTEM_FOLDER_NAME],
      parentIds: refreshed.parents ?? [systemFolderId],
      movedToSystemFolder,
      operationId,
      decidedAt,
      state: input.state,
    };
    res.json(SaveDriveWorkspaceStateResponse.parse(result));
  } catch (error) {
    next(error);
  }
});

router.post("/drive/documents", async (req, res, next) => {
  try {
    const input = UploadDriveDocumentBody.parse(req.body);
    if (input.operationId) {
      const existing = await findDocumentByOperationId(input.operationId);
      if (existing) {
        return res.json(
          UploadDriveDocumentResponse.parse({
            id: existing.id,
            name: existing.name,
            mimeType: existing.mimeType,
            webViewLink:
              existing.webViewLink ??
              `https://drive.google.com/open?id=${existing.id}`,
            sharedWithEmail: null,
            folderId: existing.parents?.[0],
            folderPath: input.systemOwned
              ? [MANAGED_SYSTEM_FOLDER_NAME]
              : input.folderPath ?? [],
          }),
        );
      }
    }
    const folderPath = (input.folderPath ?? []).map((part) => part.trim()).filter(Boolean);
    const systemOwned = input.systemOwned === true;
    const folderId = systemOwned
      ? await ensureManagedSystemFolder()
      : input.folderId ?? (folderPath.length ? await ensureFolderPath(folderPath) : undefined);
    const resolvedFolderPath = systemOwned ? [MANAGED_SYSTEM_FOLDER_NAME] : folderPath;
    const uploaded = await uploadDocument({
      name: input.name,
      mimeType: input.mimeType,
      contentBase64: input.contentBase64,
      folderId,
      appProperties: input.operationId
        ? { [OPERATION_APP_PROPERTY]: input.operationId }
        : undefined,
    });
    let sharedWithEmail: string | null = null;
    if (input.shareWithEmail) {
      await shareFile(uploaded.id, input.shareWithEmail);
      sharedWithEmail = input.shareWithEmail;
    }
    return res.json(
      UploadDriveDocumentResponse.parse({
        id: uploaded.id,
        name: uploaded.name,
        mimeType: uploaded.mimeType,
        webViewLink:
          uploaded.webViewLink ??
          `https://drive.google.com/open?id=${uploaded.id}`,
        sharedWithEmail,
        folderId,
        folderPath: resolvedFolderPath,
      }),
    );
  } catch (error) {
    return next(error);
  }
});

router.post("/drive/enrollment-workbook", async (req, res, next) => {
  try {
    const input = SaveDriveEnrollmentWorkbookBody.parse(req.body);
    const folderPath = input.folderPath.map((part: string) => part.trim()).filter(Boolean);
    const folderId = await ensureFolderPath(folderPath);
    if (!folderId) {
      return res.status(400).json({ error: "The policy enrollment folder could not be resolved." });
    }

    const writeKey = input.workbookFileId ? `file:${input.workbookFileId}` : `policy:${input.policyId}`;
    const saved = await serializeEnrollmentWorkbookWrite(writeKey, async () => {
      if (input.workbookFileId) {
        if (!input.expectedModifiedTime) {
          return { invalid: "An expected modified time is required when updating an enrollment workbook." };
        }
        const current = await getDocumentMetadata(input.workbookFileId);
        if (
          current.mimeType !== "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          || current.appProperties?.tinubuEnrollmentWorkbook !== "1"
          || current.appProperties?.tinubuEnrollmentPolicyId !== input.policyId
        ) {
          return { invalid: "The selected Drive file is not this policy's managed enrollment workbook." };
        }
        if (
          input.expectedModifiedTime
          && current.modifiedTime
          && input.expectedModifiedTime !== current.modifiedTime
        ) {
          return { conflict: current.modifiedTime };
        }
        return {
          metadata: await updateDocumentContent(input.workbookFileId, input.contentBase64),
          action: "updated" as const,
        };
      }
      const replay = await findEnrollmentWorkbook(input.policyId, input.uploadId);
      if (replay) {
        return { metadata: replay, action: "created" as const };
      }
      const canonical = await findEnrollmentWorkbook(input.policyId);
      if (canonical) {
        return { existing: canonical };
      }
      return {
        metadata: await uploadDocument({
          name: input.name,
          mimeType: input.mimeType,
          contentBase64: input.contentBase64,
          folderId,
          appProperties: {
            tinubuEnrollmentWorkbook: "1",
            tinubuEnrollmentPolicyId: input.policyId,
            tinubuEnrollmentUploadId: input.uploadId,
          },
        }),
        action: "created" as const,
      };
    });
    if ("invalid" in saved) {
      return res.status(400).json({ error: saved.invalid });
    }
    if ("existing" in saved && saved.existing) {
      return res.status(409).json({
        error: "This policy already has an enrollment history workbook. Refresh workspace state before uploading.",
        workbookFileId: saved.existing.id,
        actualModifiedTime: saved.existing.modifiedTime,
      });
    }
    if ("conflict" in saved) {
      return res.status(409).json({
        error: "The enrollment history workbook changed in Google Drive. Refresh it before saving this census.",
        expectedModifiedTime: input.expectedModifiedTime,
        actualModifiedTime: saved.conflict,
      });
    }
    const { metadata, action } = saved;
    if (!metadata.modifiedTime) {
      throw new GoogleDriveError(
        "Google Drive did not return the workbook revision after saving.",
      );
    }
    return res.json(
      SaveDriveEnrollmentWorkbookResponse.parse({
        id: metadata.id,
        name: metadata.name || input.name,
        mimeType: metadata.mimeType || input.mimeType,
        webViewLink:
          metadata.webViewLink ?? `https://drive.google.com/open?id=${metadata.id}`,
        modifiedTime: metadata.modifiedTime,
        folderId,
        folderPath,
        uploadId: input.uploadId,
        reportMonth: input.reportMonth,
        lastChangedAt: input.lastChangedAt,
        changeDescription: input.changeDescription,
        action,
      }),
    );
  } catch (error) {
    return next(error);
  }
});

router.post("/drive/transfer-sheet", async (req, res, next) => {
  try {
    const input = TransferSheetToDriveBody.parse(req.body);
    const spreadsheetId = getSpreadsheetId(input.spreadsheetId);
    if (!spreadsheetId) {
      return res.status(400).json({ error: "Enter a valid spreadsheet ID." });
    }
    const destinationEmail = input.destinationEmail.trim().toLowerCase();
    const role = input.role ?? "writer";
    await shareFile(spreadsheetId, destinationEmail, role);
    const message =
      role === "owner"
        ? `Ownership transfer was requested for ${destinationEmail}. Google may require the recipient to accept the transfer.`
        : `The workbook is now shared with ${destinationEmail}.`;
    return res.json(
      TransferSheetToDriveResponse.parse({
        spreadsheetId,
        destinationEmail,
        role,
        message,
      }),
    );
  } catch (error) {
    return next(error);
  }
});

router.use((error: unknown, _req: unknown, res: { status: (code: number) => { json: (body: unknown) => void }; json: (body: unknown) => void }, next: (error: unknown) => void) => {
  if (error instanceof GoogleDriveError) {
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
