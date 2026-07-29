import {
  failCommand,
  okCommand,
  type DomainValidationResult,
} from "@workspace/platform/server/domain-validation";

export interface ImportCatalogRecordCommand {
  stableKey: string;
  path: string;
  checksumSha256: string;
}

export function buildImportCatalogRecordCommand(input: {
  rootKey: string;
  path: string;
  checksumSha256: string;
}): DomainValidationResult<ImportCatalogRecordCommand> {
  const rootKey = input.rootKey.trim();
  const relativePath = input.path.replace(/\\/g, "/").replace(/^\.\//, "");
  if (!rootKey || rootKey.includes("/") || rootKey.includes("\\")) return failCommand("Invalid root key", 400, "rootKey");
  if (!relativePath || relativePath.startsWith("/") || relativePath.split("/").includes("..")) {
    return failCommand("Invalid catalog path", 400, "path");
  }
  if (!/^[a-f0-9]{64}$/.test(input.checksumSha256)) return failCommand("Invalid catalog SHA256", 400, "sha256");
  return okCommand({ stableKey: `${rootKey}:${relativePath}`, path: relativePath, checksumSha256: input.checksumSha256 });
}

export function assertImportCatalogRecordCommand(
  input: ImportCatalogRecordCommand,
): ImportCatalogRecordCommand {
  const stableKeySuffix = `:${input.path}`;
  if (!input.stableKey.endsWith(stableKeySuffix)) {
    throw new Error("Catalog stable key does not match its path");
  }
  const command = buildImportCatalogRecordCommand({
    rootKey: input.stableKey.slice(0, -stableKeySuffix.length),
    path: input.path,
    checksumSha256: input.checksumSha256,
  });
  if (!command.ok) throw new Error(command.issue.message);
  if (command.data.stableKey !== input.stableKey) {
    throw new Error("Catalog stable key is not canonical");
  }
  return command.data;
}
