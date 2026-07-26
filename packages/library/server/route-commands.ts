import {
  failCommand,
  okCommand,
  type DomainValidationResult,
} from "@workspace/platform/server/domain-validation";
import { serviceError, serviceOk } from "@workspace/platform/server/api";

import { readDirectory } from "./config";
import { createLibraryDirectory, deleteLibraryDirectory, listDirectories, renameLibraryDirectory } from "./directories";
import { deleteLibraryDocument, LibraryDeletionError } from "./deletion";
import {
  getLibraryFileByDocumentId,
  getLibraryFileByRelativePath,
  getLibraryFileByVersionId,
} from "./file-access";
import { getGeneratedSourceForRun, listEnabledGeneratedSources } from "./generated-sources";
import { getGenerator } from "./generators/registry";
import { upsertGeneratedDocument } from "./generators/generated-document";
import {
  checkLibraryArchive,
  checkLibraryConfigure,
  checkLibraryExport,
  checkLibraryGeneratedSourceRead,
  checkLibraryImport,
  checkLibraryUpdate,
  getLibraryDocumentAccessPolicy,
  getMaxConfidentialityLevel,
} from "./permissions";
import { getDocument, listCategories, listDocuments, setDocumentLifecycle, updateDocumentMetadata } from "./metadata";
import { scanLibrary } from "./scan";
import {
  getDocumentVersionState,
  LibraryVersionError,
  uploadDocumentVersion,
} from "./versions";
import { buildLibraryVersionUploadCommand } from "./domain/version-file-validation";
import {
  buildReviewLibraryDocumentCommand,
  buildUploadLibraryDocumentCommand,
} from "./domain/upload-validation";
import {
  buildDeleteLibraryDirectoryCommand,
  buildCreateLibraryDirectoryCommand,
  buildRenameLibraryDirectoryCommand,
} from "./domain/classification-validation";
import { buildDeleteLibraryDocumentCommand } from "./domain/metadata-validation";
import { buildCreateLibraryExportCommand } from "./domain/export-validation";
import { buildSearchLibraryDocumentSetCommand } from "./domain/search-validation";
import { createLibraryExport, getLibraryExportFile } from "./export";
import { searchLibraryDocumentSet } from "./search";
import {
  LibraryUploadError,
  reviewLibraryDocument,
  uploadLibraryDocument,
} from "./uploads";
import type {
  LibraryDirectoryCreateInput,
  LibraryDirectoryDeleteInput,
  LibraryDirectoryRenameInput,
  LibraryMetadataUpdateInput,
} from "./schemas";

export type GenerateLibraryDocumentCommand = {
  key: string;
  title: string;
  summary?: string;
  confidentialityLevel: number;
  categoryCode?: string | null;
  categoryName?: string | null;
  userId: number;
  body: Record<string, unknown>;
  generator: NonNullable<ReturnType<typeof getGenerator>>;
};

export function buildCreateLibraryExportRouteCommand(input: Parameters<typeof buildCreateLibraryExportCommand>[0]) {
  return buildCreateLibraryExportCommand(input);
}

export function executeCreateLibraryExportCommand(command: Parameters<typeof createLibraryExport>[0]) {
  return createLibraryExport(command);
}

export function buildSearchLibraryDocumentSetRouteCommand(input: Parameters<typeof buildSearchLibraryDocumentSetCommand>[0]) {
  return buildSearchLibraryDocumentSetCommand(input);
}

export function executeSearchLibraryDocumentSetCommand(command: Parameters<typeof searchLibraryDocumentSet>[0]) {
  return searchLibraryDocumentSet(command);
}

export async function executeDownloadLibraryExportCommand(command: { exportUid: string; userId: number }) {
  try {
    return fileResponse(await getLibraryExportFile(command.exportUid, command.userId));
  } catch (error) {
    return libraryFileError(error);
  }
}

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
  if (!(await checkLibraryGeneratedSourceRead(input.userId, input.key))) {
    return failCommand("No source read permission", 403);
  }

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
    categoryCode: generator.categoryCode ?? source.outputCategory,
    categoryName: generator.categoryName ?? source.outputCategory,
    userId: input.userId,
    body: input.body,
    generator,
  });
}

export async function executeGenerateLibraryDocumentCommand(command: GenerateLibraryDocumentCommand) {
  const generated = await command.generator.generate({
    ...command.body,
    title: command.title,
    summary: command.summary,
  });
  const outputs = Array.isArray(generated) ? generated : [generated];
  const documents = [];
  for (const output of outputs) {
    documents.push(await upsertGeneratedDocument({
      generatorKey: command.key,
      title: command.title,
      summary: command.summary,
      confidentialityLevel: command.confidentialityLevel,
      categoryCode: command.categoryCode ?? undefined,
      categoryName: command.categoryName ?? undefined,
      userId: command.userId,
    }, output));
  }
  return { documents };
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
  const accessPolicy = await getLibraryDocumentAccessPolicy(userId);
  if (!accessPolicy.allows(doc)) return serviceError("Forbidden", 403);
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
  return listCategories((await getLibraryDocumentAccessPolicy(command.userId)).where);
}

export async function executeLibraryDirectoriesCommand(command: { userId: number }) {
  const accessPolicy = await getLibraryDocumentAccessPolicy(command.userId);
  return listDirectories(
    accessPolicy.where,
    await checkLibraryConfigure(command.userId),
  );
}

export function buildCreateLibraryDirectoryRouteCommand(input: { body: LibraryDirectoryCreateInput; userId: number }) {
  return buildCreateLibraryDirectoryCommand({ ...input.body, userId: input.userId });
}

export async function executeCreateLibraryDirectoryCommand(command: Parameters<typeof createLibraryDirectory>[0]) {
  if (!(await checkLibraryConfigure(command.userId))) return serviceError("没有文件夹配置权限", 403);
  try {
    return await createLibraryDirectory(command);
  } catch (error) {
    return serviceError(error instanceof Error ? error.message : "新建文件夹失败", 400);
  }
}

export function buildRenameLibraryDirectoryRouteCommand(input: { body: LibraryDirectoryRenameInput; userId: number }) {
  return buildRenameLibraryDirectoryCommand({ ...input.body, userId: input.userId });
}

export async function executeRenameLibraryDirectoryCommand(command: Parameters<typeof renameLibraryDirectory>[0]) {
  if (!(await checkLibraryConfigure(command.userId))) return serviceError("没有文件夹配置权限", 403);
  try {
    return await renameLibraryDirectory(command);
  } catch (error) {
    return serviceError(error instanceof Error ? error.message : "重命名文件夹失败", 400);
  }
}

export function buildDeleteLibraryDirectoryRouteCommand(input: { body: LibraryDirectoryDeleteInput; userId: number }) {
  return buildDeleteLibraryDirectoryCommand({ ...input.body, userId: input.userId });
}

export async function executeDeleteLibraryDirectoryCommand(command: Parameters<typeof deleteLibraryDirectory>[0]) {
  if (!(await checkLibraryConfigure(command.userId))) return serviceError("没有文件夹配置权限", 403);
  try {
    return await deleteLibraryDirectory(command);
  } catch (error) {
    return serviceError(error instanceof Error ? error.message : "删除文件夹失败", 400);
  }
}

export function executeLibraryReadDirectoryCommand(command: { path: string }) {
  return readDirectory(command.path);
}

export async function executeListLibraryDocumentsCommand(command: Parameters<typeof listDocuments>[0] & { userId: number }) {
  const { userId, ...filters } = command;
  return listDocuments(filters, (await getLibraryDocumentAccessPolicy(userId)).where);
}

export async function buildUploadLibraryDocumentRouteCommand(input: {
  userId: number;
  body: {
    file?: FormDataEntryValue;
    directoryPath?: FormDataEntryValue;
    title?: FormDataEntryValue;
    summary?: FormDataEntryValue;
    tags?: FormDataEntryValue;
    confidentialityLevel?: FormDataEntryValue;
  };
}) {
  const validated = buildUploadLibraryDocumentCommand({ ...input.body, userId: input.userId });
  if (!validated.ok) return validated;
  if (!(await checkLibraryImport(input.userId))) return failCommand("没有资料导入权限", 403);
  const maxLevel = await getMaxConfidentialityLevel(input.userId);
  if (validated.data.confidentialityLevel > maxLevel) {
    return failCommand(`保密等级不能高于当前可访问等级（${maxLevel}）`, 403, "confidentialityLevel");
  }
  return validated;
}

export async function executeUploadLibraryDocumentCommand(command: Parameters<typeof uploadLibraryDocument>[0]) {
  try {
    return await uploadLibraryDocument(command);
  } catch (error) {
    if (error instanceof LibraryUploadError) return serviceError(error.message, error.status);
    return serviceError(error instanceof Error ? error.message : "资料上传失败", 500);
  }
}

export async function buildReviewLibraryDocumentRouteCommand(input: { id: number; userId: number }) {
  const validated = buildReviewLibraryDocumentCommand(input);
  if (!validated.ok) return validated;
  if (!(await checkLibraryImport(input.userId))) return failCommand("没有资料导入确认权限", 403);
  const access = await checkDocAccess(input.id, input.userId);
  if (!access.ok) return failCommand(access.error, access.status || 400);
  return validated;
}

export async function executeReviewLibraryDocumentCommand(command: Parameters<typeof reviewLibraryDocument>[0]) {
  try {
    await reviewLibraryDocument(command);
    return await getDocument(command.id);
  } catch (error) {
    if (error instanceof LibraryUploadError) return serviceError(error.message, error.status);
    return serviceError(error instanceof Error ? error.message : "确认入库失败", 500);
  }
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
  const updateFields = ["title", "summary", "tags", "categoryCode", "categoryName", "directoryPath", "subcategoryPath"] as const;
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

export async function buildDeleteLibraryDocumentRouteCommand(input: { id: number; userId: number }) {
  const validated = buildDeleteLibraryDocumentCommand(input.id, input.userId);
  if (!validated.ok) return validated;
  if (!(await checkLibraryConfigure(input.userId))) return failCommand("没有资料删除权限", 403);
  const access = await checkDocAccess(input.id, input.userId);
  if (!access.ok) return failCommand(access.error, access.status || 400);
  return validated;
}

export async function executeDeleteLibraryDocumentCommand(command: Parameters<typeof deleteLibraryDocument>[0]) {
  try {
    return await deleteLibraryDocument(command);
  } catch (error) {
    if (error instanceof LibraryDeletionError) return serviceError(error.message, error.status);
    return serviceError(error instanceof Error ? error.message : "删除资料失败", 500);
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
  return getDocumentVersionState(command.id);
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

export async function executeLibraryGeneratedSourcesCommand(command: { userId: number }) {
  const sources = await listEnabledGeneratedSources();
  const visibility = await Promise.all(sources.map((source) => checkLibraryGeneratedSourceRead(command.userId, source.key)));
  return sources.filter((_, index) => visibility[index]);
}
