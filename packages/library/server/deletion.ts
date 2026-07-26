import { randomUUID } from "node:crypto";
import { access, mkdir, rename, rm } from "node:fs/promises";
import path from "node:path";

import { guardedDelete } from "@workspace/platform/server/delete-guard";
import { prisma } from "@workspace/platform/server/prisma";

import { getDefaultRoot, safeResolve } from "./config";
import {
  buildDeleteLibraryDocumentCommand,
  type DeleteLibraryDocumentCommand,
} from "./domain/metadata-validation";

interface StagedPath {
  source: string;
  staged: string;
}

export class LibraryDeletionError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message);
    this.name = "LibraryDeletionError";
  }
}

async function exists(filePath: string) {
  try {
    await access(filePath);
    return true;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return false;
    throw error;
  }
}

async function stageOwnedPaths(paths: string[], trashRoot: string) {
  const staged: StagedPath[] = [];
  try {
    for (const [index, source] of paths.entries()) {
      if (!(await exists(source))) continue;
      const stagedPath = path.join(trashRoot, `${index}-${path.basename(source)}`);
      await mkdir(path.dirname(stagedPath), { recursive: true });
      await rename(source, stagedPath);
      staged.push({ source, staged: stagedPath });
    }
    return staged;
  } catch (error) {
    await restoreStagedPaths(staged);
    throw error;
  }
}

async function restoreStagedPaths(staged: StagedPath[]) {
  for (const entry of [...staged].reverse()) {
    if (!(await exists(entry.staged))) continue;
    await mkdir(path.dirname(entry.source), { recursive: true });
    await rename(entry.staged, entry.source);
  }
}

function ownedRuntimePaths(input: {
  runtimeRoot: string;
  documentUid: string;
  origin: string;
  relativePath: string;
}) {
  const relativePaths = [
    path.posix.join(".versions", input.documentUid),
    path.posix.join("artifacts", input.documentUid),
  ];
  const normalizedSourcePath = input.relativePath.replace(/\\/g, "/").replace(/^\.\//, "");
  if (input.origin === "generated" && normalizedSourcePath.startsWith("generated/")) {
    relativePaths.push(normalizedSourcePath);
  }
  return relativePaths.map((relativePath) => safeResolve(relativePath, input.runtimeRoot)).filter((value): value is string => Boolean(value));
}

export async function deleteLibraryDocument(rawCommand: DeleteLibraryDocumentCommand) {
  const validated = buildDeleteLibraryDocumentCommand(rawCommand.id, rawCommand.userId);
  if (!validated.ok) throw new LibraryDeletionError(validated.issue.message, validated.issue.status);
  const command = validated.data;
  const document = await prisma.libraryDocument.findUnique({
    where: { id: command.id },
    select: { id: true, documentUid: true, origin: true, relativePath: true },
  });
  if (!document) throw new LibraryDeletionError("资料不存在", 404);

  const runtimeRoot = getDefaultRoot();
  if (!runtimeRoot) throw new LibraryDeletionError("资料库存储未配置", 500);
  const trashRoot = safeResolve(path.posix.join(".trash", "library-delete", randomUUID()), runtimeRoot);
  if (!trashRoot) throw new LibraryDeletionError("资料库回收路径无效", 500);
  const staged = await stageOwnedPaths(ownedRuntimePaths({ runtimeRoot, ...document }), trashRoot);

  try {
    const result = await guardedDelete({
      entityType: "LibraryDocument",
      modelKey: "libraryDocument",
      id: document.id,
      userId: command.userId,
      actionLabel: "删除资料",
      deleteMode: "hard",
      references: [
        {
          label: "评测证据",
          count: (tx) => tx.libraryEvaluationEvidence.count({ where: { version: { documentId: document.id } } }),
        },
      ],
      referencePolicy: "checked",
      onBeforeDelete: async (_id, { tx }) => {
        await tx.libraryDocument.update({ where: { id: document.id }, data: { currentVersionId: null } });
        return { ok: true };
      },
    });
    if (!result.ok) throw new LibraryDeletionError(result.error, result.status || 400);
  } catch (error) {
    await restoreStagedPaths(staged);
    if (error instanceof LibraryDeletionError) throw error;
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    if (code === "P2003") throw new LibraryDeletionError("该资料仍被其他记录引用，不能删除", 409);
    throw error;
  }

  const cleanupPending = await rm(trashRoot, { recursive: true, force: true })
    .then(() => false)
    .catch(() => true);
  return { success: true, cleanupPending };
}
