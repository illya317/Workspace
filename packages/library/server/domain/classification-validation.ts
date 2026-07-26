import {
  failCommand,
  okCommand,
  type DomainValidationResult,
} from "@workspace/platform/server/domain-validation";

export interface EnsureLibraryDirectoryCommand {
  rootKey: string;
  relativePath: string;
}

export interface EnsureLibraryCategoryCommand {
  code: string;
  name: string;
  fullPath: string;
}

export interface CreateLibraryDirectoryCommand {
  rootKey: string;
  parentPath: string;
  name: string;
  path: string;
  userId: number;
}

export interface RenameLibraryDirectoryCommand {
  rootKey: string;
  path: string;
  name: string;
  nextPath: string;
  userId: number;
}

export interface DeleteLibraryDirectoryCommand {
  rootKey: string;
  path: string;
  userId: number;
}

function normalizeDirectoryPath(rawPath: string | null | undefined) {
  if (!rawPath || rawPath === ".") return "";
  return rawPath.replace(/\\/g, "/").split("/").filter(Boolean).join("/");
}

function validateDirectoryName(rawName: string) {
  const name = rawName.normalize("NFKC").trim();
  if (!name) return failCommand("文件夹名称不能为空", 400, "name");
  if (name.length > 80) return failCommand("文件夹名称不能超过 80 个字符", 400, "name");
  if (name === "." || name === ".." || /[\\/]/.test(name)) {
    return failCommand("文件夹名称不能包含路径分隔符", 400, "name");
  }
  return okCommand(name);
}

function validateUserId(userId: number) {
  return Number.isInteger(userId) && userId > 0
    ? okCommand(userId)
    : failCommand("用户信息无效", 400, "userId");
}

export function buildEnsureLibraryDirectoryCommand(
  rawRootKey: string,
  rawDirectoryPath: string | null | undefined,
): DomainValidationResult<EnsureLibraryDirectoryCommand> {
  const rootKey = rawRootKey.trim();
  if (!rootKey) return failCommand("rootKey is required", 400, "rootKey");
  const relativePath = normalizeDirectoryPath(rawDirectoryPath);
  if (relativePath.split("/").some((segment) => segment === "." || segment === "..")) {
    return failCommand("directoryPath must stay inside the library root", 400, "directoryPath");
  }
  return okCommand({ rootKey, relativePath });
}

export function buildCreateLibraryDirectoryCommand(input: {
  parentPath?: string | null;
  name: string;
  userId: number;
}): DomainValidationResult<CreateLibraryDirectoryCommand> {
  const validUserId = validateUserId(input.userId);
  if (!validUserId.ok) return validUserId;
  const validName = validateDirectoryName(input.name);
  if (!validName.ok) return validName;
  const parentPath = normalizeDirectoryPath(input.parentPath);
  if (parentPath.split("/").some((segment) => segment === "." || segment === "..")) {
    return failCommand("父文件夹路径无效", 400, "parentPath");
  }
  return okCommand({
    rootKey: "default",
    parentPath,
    name: validName.data,
    path: parentPath ? `${parentPath}/${validName.data}` : validName.data,
    userId: validUserId.data,
  });
}

export function buildRenameLibraryDirectoryCommand(input: {
  path: string;
  name: string;
  userId: number;
}): DomainValidationResult<RenameLibraryDirectoryCommand> {
  const validUserId = validateUserId(input.userId);
  if (!validUserId.ok) return validUserId;
  const validName = validateDirectoryName(input.name);
  if (!validName.ok) return validName;
  const path = normalizeDirectoryPath(input.path);
  if (!path || path.split("/").some((segment) => segment === "." || segment === "..")) {
    return failCommand("文件夹路径无效", 400, "path");
  }
  const parentPath = path.split("/").slice(0, -1).join("/");
  return okCommand({
    rootKey: "default",
    path,
    name: validName.data,
    nextPath: parentPath ? `${parentPath}/${validName.data}` : validName.data,
    userId: validUserId.data,
  });
}

export function buildDeleteLibraryDirectoryCommand(input: {
  path: string;
  userId: number;
}): DomainValidationResult<DeleteLibraryDirectoryCommand> {
  const validUserId = validateUserId(input.userId);
  if (!validUserId.ok) return validUserId;
  const path = normalizeDirectoryPath(input.path);
  if (!path || path.split("/").some((segment) => segment === "." || segment === "..")) {
    return failCommand("文件夹路径无效", 400, "path");
  }
  return okCommand({ rootKey: "default", path, userId: validUserId.data });
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
