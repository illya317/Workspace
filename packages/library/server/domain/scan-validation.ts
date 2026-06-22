import {
  failCommand,
  okCommand,
  type DomainValidationResult,
} from "@workspace/platform/server/domain-validation";

export interface ScanLibraryCommand {
  rootKey: string;
}

export function buildScanLibraryCommand(rootKey?: string): DomainValidationResult<ScanLibraryCommand> {
  const key = (rootKey || "default").trim();
  if (!key) return failCommand("rootKey is required", 400, "rootKey");
  if (key.includes("/") || key.includes("\\")) return failCommand("rootKey must be a key, not a path", 400, "rootKey");
  return okCommand({ rootKey: key });
}
