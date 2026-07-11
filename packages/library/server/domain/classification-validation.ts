import {
  failCommand,
  okCommand,
  type DomainValidationResult,
} from "@workspace/platform/server/domain-validation";

export interface EnsureLibraryDirectoryCommand {
  rootKey: string;
  relativePath: string;
  name: string;
}

export interface EnsureLibraryCategoryCommand {
  code: string;
  name: string;
  fullPath: string;
}

export function buildEnsureLibraryDirectoryCommand(
  rawRootKey: string,
  rawDirectoryPath: string | null | undefined,
): DomainValidationResult<EnsureLibraryDirectoryCommand> {
  const rootKey = rawRootKey.trim();
  if (!rootKey) return failCommand("rootKey is required", 400, "rootKey");
  const relativePath = !rawDirectoryPath || rawDirectoryPath === "."
    ? ""
    : rawDirectoryPath.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  if (relativePath.split("/").some((segment) => segment === "..")) {
    return failCommand("directoryPath must stay inside the library root", 400, "directoryPath");
  }
  const segments = relativePath.split("/").filter(Boolean);
  return okCommand({ rootKey, relativePath, name: segments.at(-1) ?? "/" });
}

export function buildEnsureLibraryCategoryCommand(
  rawCode?: string | null,
  rawName?: string | null,
): DomainValidationResult<EnsureLibraryCategoryCommand | null> {
  const code = rawCode?.trim();
  if (!code) return okCommand(null);
  const name = rawName?.trim() || code;
  return okCommand({ code, name, fullPath: `${code} ${name}` });
}
