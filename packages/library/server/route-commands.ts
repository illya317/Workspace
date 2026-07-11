import {
  failCommand,
  okCommand,
  type DomainValidationResult,
} from "@workspace/platform/server/domain-validation";
import { serviceError, serviceOk } from "@workspace/platform/server/api";

import { readDirectory } from "./config";
import { listDirectories } from "./directories";
import {
  getLibraryFileByDocumentId,
  getLibraryFileByRelativePath,
  getLibraryFileByVersionId,
} from "./file-access";
import { getGeneratedSourceForRun, listEnabledGeneratedSources } from "./generated-sources";
import { getGenerator } from "./generators/registry";
import { upsertGeneratedDocument } from "./generators/generated-document";
import {
  buildConfidentialityFilter,
  checkLibraryArchive,
  checkLibraryConfigure,
  checkLibraryExport,
  checkLibraryImport,
  checkLibraryUpdate,
  getMaxConfidentialityLevel,
} from "./permissions";
import { getDocument, listCategories, listDocuments, setDocumentLifecycle, updateDocumentMetadata } from "./metadata";
import { scanLibrary } from "./scan";
import {
  getDocumentVersions,
  LibraryVersionError,
  uploadDocumentVersion,
} from "./versions";
import { buildLibraryVersionUploadCommand } from "./domain/version-file-validation";
import type { LibraryMetadataUpdateInput } from "./schemas";

export type GenerateLibraryDocumentCommand = {
  key: string;
  title: string;
  summary?: string;
  confidentialityLevel: number;
  category?: string | null;
  userId: number;
  body: Record<string, unknown>;
  generator: NonNullable<ReturnType<typeof getGenerator>>;
};

export async function buildGenerateLibraryDocumentCommand(input: {
  key: string;
  userId: number;
  body: Record<string, unknown> & {
    title: string;
    summary?: string;
    confidentialityLevel?: number;
  };
}): Promise<DomainValidationResult<GenerateLibraryDocumentCommand>> {
  const generator = getGenerator(input.key);
  if (!generator) return failCommand("Generator not found", 404);

  const source = await getGeneratedSourceForRun(input.key);
  if (!source || !source.enabled) return failCommand("Generator disabled", 403);

  const maxLevel = await getMaxConfidentialityLevel(input.userId);
  const rawLevel = input.body.confidentialityLevel ?? source.defaultConfidentialityLevel;
  if (!Number.isInteger(rawLevel) || rawLevel < 0 || rawLevel > 4) {
    return failCommand("confidentialityLevel must be 0..4", 400, "confidentialityLevel");
  }
  if (
    input.body.confidentialityLevel !== undefined
    && input.body.confidentialityLevel !== source.defaultConfidentialityLevel
    && !(await checkLibraryConfigure(input.userId))
  ) {
    return failCommand("No configure permission", 403, "confidentialityLevel");
  }
  if (rawLevel > maxLevel) {
    return failCommand("confidentialityLevel exceeds your access level", 403, "confidentialityLevel");
  }

  return okCommand({
    key: input.key,
    title: input.body.title,
    summary: input.body.summary,
    confidentialityLevel: rawLevel,
    category: source.outputCategory,
    userId: input.userId,
    body: input.body,
    generator,
  });
}

export async function executeGenerateLibraryDocumentCommand(command: GenerateLibraryDocumentCommand) {
  const output = await command.generator.generate({
    ...command.body,
    title: command.title,
    summary: command.summary,
  });
  return upsertGeneratedDocument({
    generatorKey: command.key,
    title: command.title,
    summary: command.summary,
    confidentialityLevel: command.confidentialityLevel,
    categoryCode: command.category ?? undefined,
    categoryName: command.category ?? undefined,
    userId: command.userId,
  }, output);
}

export function buildScanLibraryCommand() {
  return okCommand({});
}

export function executeScanLibraryCommand() {
  return scanLibrary();
}

function libraryFileError(error: unknown) {
  const message = error instanceof Error ? error.message : "File not found";
  const status = message === "Not found" || message === "File missing" || message === "File not found"
      || message === "Version not found" || message === "File unavailable"
    ? 404
    : message === "Forbidden" || message === "Higher confidentiality required" || message === "File not indexed - run scan first"
      ? 403
      : 400;
  return serviceError(message, status);
}

function fileResponse(file: Awaited<ReturnType<typeof getLibraryFileByDocumentId>>) {
  return new Response(new Uint8Array(file.buffer), {
    headers: {
      "Content-Type": file.contentType,
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
      "Content-Length": String(file.size),
    },
  });
}

async function checkDocAccess(docId: number, userId: number) {
  const doc = await getDocument(docId);
  if (!doc) return serviceError("Not found", 404);
  const maxLevel = await getMaxConfidentialityLevel(userId);
  if (doc.confidentialityLevel > maxLevel) return serviceError("Higher confidentiality required", 403);
  return { ok: true as const, data: doc };
}

export async function executeLibraryPathFileCommand(command: { path: string[]; userId: number }) {
  if (!(await checkLibraryExport(command.userId))) return serviceError("No export permission", 403);
  try {
    return fileResponse(await getLibraryFileByRelativePath(command.path.join("/"), command.userId));
  } catch (error) {
    return libraryFileError(error);
  }
}

export async function executeLibraryCategoriesCommand(command: { userId: number }) {
  const confFilter = await buildConfidentialityFilter(command.userId);
  return listCategories(
    typeof confFilter.confidentialityLevel === "object" ? confFilter.confidentialityLevel : undefined,
  );
}

export async function executeLibraryDirectoriesCommand(command: { userId: number }) {
  const confFilter = await buildConfidentialityFilter(command.userId);
  return listDirectories(
    typeof confFilter.confidentialityLevel === "object" ? confFilter.confidentialityLevel : undefined,
  );
}

export function executeLibraryReadDirectoryCommand(command: { path: string }) {
  return readDirectory(command.path);
}

export async function executeListLibraryDocumentsCommand(command: Parameters<typeof listDocuments>[0] & { userId: number }) {
  const { userId, ...filters } = command;
  const confFilter = await buildConfidentialityFilter(userId);
  return listDocuments({ ...filters, ...confFilter });
}

export async function executeGetLibraryDocumentCommand(command: { id: number; userId: number }) {
  const check = await checkDocAccess(command.id, command.userId);
  if (!check.ok) return check;
  return check.data;
}

export async function executeUpdateLibraryDocumentCommand(command: {
  id: number;
  body: LibraryMetadataUpdateInput;
  userId: number;
}) {
  const check = await checkDocAccess(command.id, command.userId);
  if (!check.ok) return check;
  const body = command.body;
  const updateFields = ["title", "summary", "tags", "categoryCode", "categoryName", "subcategoryPath"] as const;
  const hasUpdateField = updateFields.some((field) => body[field] !== undefined);
  const hasAdminField = body.confidentialityLevel !== undefined;

  if (hasUpdateField && !(await checkLibraryUpdate(command.userId))) return serviceError("No update permission", 403);
  if (hasAdminField && !(await checkLibraryConfigure(command.userId))) return serviceError("No configure permission", 403);
  if (body.confidentialityLevel !== undefined) {
    const maxLevel = await getMaxConfidentialityLevel(command.userId);
    if (body.confidentialityLevel > maxLevel) {
      return serviceError(`Cannot set confidentialityLevel above your access level (${maxLevel})`, 403);
    }
  }

  try {
    return await updateDocumentMetadata({ id: command.id, userId: command.userId, body });
  } catch (error) {
    return serviceError(error instanceof Error ? error.message : "Update failed", 400);
  }
}

export async function executeSetLibraryDocumentLifecycleCommand(command: {
  id: number;
  userId: number;
  archived: boolean;
}) {
  const check = await checkDocAccess(command.id, command.userId);
  if (!check.ok) return check;
  if (!(await checkLibraryArchive(command.userId))) return serviceError("No archive permission", 403);
  try {
    const document = await setDocumentLifecycle(command);
    return serviceOk({ success: true, document });
  } catch (error) {
    return serviceError(error instanceof Error ? error.message : "Lifecycle update failed", 400);
  }
}

export async function executeDownloadLibraryDocumentCommand(command: { id: number; userId: number }) {
  if (!(await checkLibraryExport(command.userId))) return serviceError("No export permission", 403);
  try {
    return fileResponse(await getLibraryFileByDocumentId(command.id, command.userId));
  } catch (error) {
    return libraryFileError(error);
  }
}

export async function executeDownloadLibraryDocumentVersionCommand(command: {
  id: number;
  versionId: number;
  userId: number;
}) {
  if (!(await checkLibraryExport(command.userId))) return serviceError("No export permission", 403);
  try {
    return fileResponse(await getLibraryFileByVersionId(command.id, command.versionId, command.userId));
  } catch (error) {
    return libraryFileError(error);
  }
}

export async function executeLibraryDocumentVersionsCommand(command: { id: number; userId: number }) {
  const check = await checkDocAccess(command.id, command.userId);
  if (!check.ok) return check;
  return { versions: await getDocumentVersions(command.id) };
}

export async function buildUploadLibraryDocumentVersionCommand(input: {
  id: number;
  userId: number;
  body: {
    file?: FormDataEntryValue;
    versionLabel?: FormDataEntryValue;
    changeNote?: FormDataEntryValue;
  };
}) {
  const validated = buildLibraryVersionUploadCommand({
    documentId: input.id,
    userId: input.userId,
    ...input.body,
  });
  if (!validated.ok) return validated;
  if (!(await checkLibraryImport(input.userId))) return failCommand("No import permission", 403);

  const access = await checkDocAccess(input.id, input.userId);
  if (!access.ok) return failCommand(access.error, access.status || 400);
  if (access.data.status !== "active") {
    return failCommand("Only active documents can receive a new version", 409);
  }
  return validated;
}

export async function executeUploadLibraryDocumentVersionCommand(
  command: Parameters<typeof uploadDocumentVersion>[0],
) {
  try {
    return await uploadDocumentVersion(command);
  } catch (error) {
    if (error instanceof LibraryVersionError) return serviceError(error.message, error.status);
    return serviceError(error instanceof Error ? error.message : "Upload failed", 500);
  }
}

export function executeLibraryGeneratedSourcesCommand() {
  return listEnabledGeneratedSources();
}
