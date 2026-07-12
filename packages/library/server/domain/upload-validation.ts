import path from "node:path";

import {
  failCommand,
  okCommand,
  type DomainValidationResult,
} from "@workspace/platform/server/domain-validation";

import { getLibraryUploadMaxBytes } from "./version-file-validation";
import { canonicalizeLibraryTagNames } from "./tag-taxonomy";

export interface UploadLibraryDocumentCommand {
  userId: number;
  file: File;
  fileName: string;
  directoryPath: string;
  title: string;
  summary?: string;
  tags: string[];
  confidentialityLevel: number;
}

function optionalText(value: FormDataEntryValue | undefined, maxLength: number) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") return null;
  const normalized = value.normalize("NFC").trim();
  if (!normalized) return undefined;
  return normalized.length <= maxLength ? normalized : null;
}

function fileName(value: string) {
  const normalized = value.normalize("NFC").trim();
  if (!normalized || normalized === "." || normalized === "..") return null;
  if (normalized.length > 255 || /[\u0000-\u001f\u007f]/.test(normalized)) return null;
  if (normalized.includes("/") || normalized.includes("\\") || path.basename(normalized) !== normalized) return null;
  return normalized;
}

function directoryPath(value: FormDataEntryValue | undefined) {
  if (typeof value !== "string") return null;
  const normalized = value.normalize("NFC").trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  if (!normalized || normalized.length > 500) return null;
  if (normalized.split("/").some((part) => !part || part === "." || part === "..")) return null;
  return normalized;
}

function tagNames(value: FormDataEntryValue | undefined) {
  if (value === undefined || value === null || value === "") return [];
  if (typeof value !== "string") return null;
  let source: unknown;
  try {
    source = JSON.parse(value);
  } catch {
    return null;
  }
  if (!Array.isArray(source) || source.length > 30) return null;
  const tags = new Map<string, string>();
  for (const item of source) {
    if (typeof item !== "string") return null;
    const name = item.normalize("NFKC").trim();
    if (!name || name.length > 80) return null;
    tags.set(name.toLocaleLowerCase("zh-CN"), name);
  }
  return canonicalizeLibraryTagNames([...tags.values()]);
}

export function buildUploadLibraryDocumentCommand(input: {
  userId: number;
  file?: FormDataEntryValue;
  directoryPath?: FormDataEntryValue;
  title?: FormDataEntryValue;
  summary?: FormDataEntryValue;
  tags?: FormDataEntryValue;
  confidentialityLevel?: FormDataEntryValue;
}): DomainValidationResult<UploadLibraryDocumentCommand> {
  if (!Number.isInteger(input.userId) || input.userId <= 0) return failCommand("用户无效", 400, "userId");
  if (!(input.file instanceof File)) return failCommand("请选择要上传的文件", 400, "file");
  if (input.file.size <= 0) return failCommand("上传文件不能为空", 400, "file");
  if (input.file.size > getLibraryUploadMaxBytes()) return failCommand("上传文件超过大小限制", 413, "file");
  const normalizedFileName = fileName(input.file.name);
  if (!normalizedFileName) return failCommand("文件名无效", 400, "file");
  const normalizedDirectoryPath = directoryPath(input.directoryPath);
  if (!normalizedDirectoryPath) return failCommand("请选择文件夹", 400, "directoryPath");
  const normalizedTitle = optionalText(input.title, 300)
    ?? path.basename(normalizedFileName, path.extname(normalizedFileName));
  if (normalizedTitle === null) return failCommand("标题不能超过 300 个字符", 400, "title");
  const summary = optionalText(input.summary, 5000);
  if (summary === null) return failCommand("简介不能超过 5000 个字符", 400, "summary");
  const tags = tagNames(input.tags);
  if (!tags) return failCommand("标签格式无效", 400, "tags");
  const confidentialityLevel = Number(input.confidentialityLevel ?? 2);
  if (!Number.isInteger(confidentialityLevel) || confidentialityLevel < 0 || confidentialityLevel > 4) {
    return failCommand("保密等级必须为 0 到 4", 400, "confidentialityLevel");
  }
  return okCommand({
    userId: input.userId,
    file: input.file,
    fileName: normalizedFileName,
    directoryPath: normalizedDirectoryPath,
    title: normalizedTitle,
    summary,
    tags,
    confidentialityLevel,
  });
}

export function buildReviewLibraryDocumentCommand(input: { id: number; userId: number }) {
  if (!Number.isInteger(input.id) || input.id <= 0) return failCommand("资料编号无效", 400, "id");
  if (!Number.isInteger(input.userId) || input.userId <= 0) return failCommand("用户无效", 400, "userId");
  return okCommand(input);
}
