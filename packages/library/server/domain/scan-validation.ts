import {
  failCommand,
  okCommand,
  type DomainValidationResult,
} from "@workspace/platform/server/domain-validation";

export interface ScanLibraryCommand {
  rootKey: string;
}

export interface ProcessLibraryScanFileCommand {
  rootKey: string;
  absolutePath: string;
  relativePath: string;
  fileName: string;
  size: number;
}

export interface WriteLibraryScanManifestCommand {
  runtimeRoot: string;
  rootKey: string;
  entryCount: number;
}

export function buildScanLibraryCommand(rootKey?: string): DomainValidationResult<ScanLibraryCommand> {
  const key = (rootKey || "default").trim();
  if (!key) return failCommand("rootKey is required", 400, "rootKey");
  if (key.includes("/") || key.includes("\\")) return failCommand("rootKey must be a key, not a path", 400, "rootKey");
  return okCommand({ rootKey: key });
}

function validRelativePath(value: string) {
  const normalized = value.replace(/\\/g, "/");
  return Boolean(normalized && !normalized.startsWith("/") && !normalized.split("/").includes(".."));
}

export function buildProcessLibraryScanFileCommand(input: ProcessLibraryScanFileCommand) {
  const root = buildScanLibraryCommand(input.rootKey);
  if (!root.ok) return root;
  if (!input.absolutePath.startsWith("/")) return failCommand("absolutePath must be absolute", 400, "absolutePath");
  if (!validRelativePath(input.relativePath)) return failCommand("relativePath must stay inside source root", 400, "relativePath");
  if (!input.fileName.trim()) return failCommand("fileName is required", 400, "fileName");
  if (!Number.isSafeInteger(input.size) || input.size < 0) return failCommand("size must be a non-negative safe integer", 400, "size");
  return okCommand({ ...input, rootKey: root.data.rootKey });
}

export function buildWriteLibraryScanManifestCommand(input: WriteLibraryScanManifestCommand) {
  const root = buildScanLibraryCommand(input.rootKey);
  if (!root.ok) return root;
  if (!input.runtimeRoot.startsWith("/")) return failCommand("runtimeRoot must be absolute", 400, "runtimeRoot");
  if (!Number.isSafeInteger(input.entryCount) || input.entryCount < 0) {
    return failCommand("entryCount must be a non-negative safe integer", 400, "entryCount");
  }
  return okCommand({ ...input, rootKey: root.data.rootKey });
}
