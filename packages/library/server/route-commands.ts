import {
  failCommand,
  okCommand,
  type DomainValidationResult,
} from "@workspace/platform/server/domain-validation";
import { serviceError } from "@workspace/platform/server/api";

import { readDirectory } from "./config";
import { listDirectories } from "./directories";
import { validateBody } from "./document-validation";
import { getLibraryFileByDocumentId, getLibraryFileByRelativePath } from "./file-access";
import { getGeneratedSourceForRun, listEnabledGeneratedSources } from "./generated-sources";
import { getGenerator } from "./generators/registry";
import { upsertGeneratedDocument } from "./generators/generated-document";
import {
  buildConfidentialityFilter,
  checkLibraryAdmin,
  checkLibraryDelete,
  checkLibraryWrite,
  getMaxConfidentialityLevel,
} from "./permissions";
import { archiveDocument, getDocument, listCategories, listDocuments, updateDocumentMetadata } from "./metadata";
import { scanLibrary } from "./scan";
import { getDocumentVersions } from "./versions";

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

export async function executeUpdateLibraryDocumentCommand(command: { id: number; body: unknown; userId: number }) {
  const check = await checkDocAccess(command.id, command.userId);
  if (!check.ok) return check;
  const validated = validateBody(command.body);
  if (!validated.ok) return serviceError(validated.error, 400);
  const body = validated.body;
  const writeFields = ["title", "summary", "docId", "tags", "categoryCode", "categoryName", "subcategoryPath", "status"] as const;
  const hasWriteField = writeFields.some((field) => body[field] !== undefined);
  const hasAdminField = body.confidentialityLevel !== undefined;

  if (hasWriteField && !(await checkLibraryWrite(command.userId))) return serviceError("No write permission", 403);
  if (hasAdminField && !(await checkLibraryAdmin(command.userId))) return serviceError("No admin permission", 403);
  if (body.confidentialityLevel !== undefined) {
    const maxLevel = await getMaxConfidentialityLevel(command.userId);
    if (body.confidentialityLevel > maxLevel) {
      return serviceError(`Cannot set confidentialityLevel above your access level (${maxLevel})`, 403);
    }
  }

  return updateDocumentMetadata(command.id, body, command.userId);
}

export async function executeArchiveLibraryDocumentCommand(command: { id: number; userId: number }) {
  const check = await checkDocAccess(command.id, command.userId);
  if (!check.ok) return check;
  if (!(await checkLibraryDelete(command.userId))) return serviceError("No delete permission", 403);
  await archiveDocument(command.id, command.userId);
  return { ok: true };
}

export async function executeDownloadLibraryDocumentCommand(command: { id: number; userId: number }) {
  try {
    return fileResponse(await getLibraryFileByDocumentId(command.id, command.userId));
  } catch (error) {
    return libraryFileError(error);
  }
}

export async function executeLibraryDocumentVersionsCommand(command: { id: number; userId: number }) {
  const check = await checkDocAccess(command.id, command.userId);
  if (!check.ok) return check;
  return { versions: await getDocumentVersions(command.id) };
}

export function executeLibraryGeneratedSourcesCommand() {
  return listEnabledGeneratedSources();
}
