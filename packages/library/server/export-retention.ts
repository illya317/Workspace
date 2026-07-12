import { rm } from "node:fs/promises";
import path from "node:path";

export const LIBRARY_EXPORT_RETENTION_MS = 30 * 60 * 1000;

export function libraryExportExpiresAt(finishedAt = new Date()) {
  return new Date(finishedAt.getTime() + LIBRARY_EXPORT_RETENTION_MS);
}

export async function removeLibraryExportFiles(exportUid: string, root: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(exportUid)) {
    throw new Error("Invalid export uid");
  }
  if (!root) throw new Error("Library runtime root is not configured");
  const exportsRoot = path.resolve(root, "exports");
  const exportDirectory = path.resolve(exportsRoot, exportUid);
  if (!exportDirectory.startsWith(`${exportsRoot}${path.sep}`)) throw new Error("Unsafe export path");
  await rm(exportDirectory, { recursive: true, force: true });
}
