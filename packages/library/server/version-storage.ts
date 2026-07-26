import { copyFile, link, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { getDefaultRoot, safeResolve } from "./config";
import { buildManagedVersionStoragePathCommand } from "./domain/version-file-validation";

const MANAGED_VERSION_ROOT = ".versions";

export interface ManagedVersionFile {
  absolutePath: string;
  relativePath: string;
}

export function isManagedVersionStoragePath(storagePath: string): boolean {
  const normalized = storagePath.replace(/\\/g, "/").replace(/^\.\//, "");
  return normalized === MANAGED_VERSION_ROOT || normalized.startsWith(`${MANAGED_VERSION_ROOT}/`);
}

export function getManagedVersionPath(documentUid: string, versionUid: string, fileName: string) {
  const command = buildManagedVersionStoragePathCommand({ documentUid, versionUid, fileName });
  if (!command.ok) throw new Error(command.issue.message);
  return path.posix.join(
    MANAGED_VERSION_ROOT,
    command.data.documentUid,
    command.data.versionUid,
    command.data.fileName,
  );
}

function resolveManagedPath(relativePath: string): ManagedVersionFile {
  const root = getDefaultRoot();
  if (!root) throw new Error("LIBRARY_ROOT not configured");
  const absolutePath = safeResolve(relativePath, root);
  if (!absolutePath || !isManagedVersionStoragePath(relativePath)) {
    throw new Error("Invalid managed version path");
  }
  return { absolutePath, relativePath };
}

export async function writeManagedVersionFile(input: {
  documentUid: string;
  versionUid: string;
  fileName: string;
  buffer: Buffer;
}): Promise<ManagedVersionFile> {
  const command = buildManagedVersionStoragePathCommand(input);
  if (!command.ok) throw new Error(command.issue.message);
  const target = resolveManagedPath(getManagedVersionPath(
    command.data.documentUid,
    command.data.versionUid,
    command.data.fileName,
  ));
  await mkdir(path.dirname(target.absolutePath), { recursive: true });
  const temporaryPath = `${target.absolutePath}.tmp-${randomUUID()}`;
  try {
    await writeFile(temporaryPath, input.buffer, { flag: "wx" });
    await link(temporaryPath, target.absolutePath);
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }
  await rm(temporaryPath, { force: true }).catch(() => undefined);
  return target;
}

export async function copyManagedVersionFile(input: {
  documentUid: string;
  versionUid: string;
  fileName: string;
  sourceAbsolutePath: string;
}): Promise<ManagedVersionFile> {
  const command = buildManagedVersionStoragePathCommand(input);
  if (!command.ok) throw new Error(command.issue.message);
  const target = resolveManagedPath(getManagedVersionPath(
    command.data.documentUid,
    command.data.versionUid,
    command.data.fileName,
  ));
  await mkdir(path.dirname(target.absolutePath), { recursive: true });
  const temporaryPath = `${target.absolutePath}.tmp-${randomUUID()}`;
  try {
    await copyFile(input.sourceAbsolutePath, temporaryPath);
    await link(temporaryPath, target.absolutePath);
    return target;
  } finally {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
  }
}

export async function removeManagedVersionFile(file: ManagedVersionFile | null | undefined) {
  if (!file) return;
  await rm(path.dirname(file.absolutePath), { recursive: true, force: true }).catch(() => undefined);
}
