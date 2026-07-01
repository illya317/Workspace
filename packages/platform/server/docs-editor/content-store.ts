import { createHash } from "crypto";
import os from "os";
import path from "path";

import { prisma } from "../prisma";
import type {
  DocsEditorSpaceRow,
  DocsEditorTemplateRow,
} from "./db";

export type DocsEditorTemplateContentRow = {
  id: number;
  documentContentRef: string | null;
  fieldModelContentRef: string | null;
};

export type DocsEditorTemplateContentMetadata = {
  documentContentRef: string;
  fieldModelContentRef: string;
};

export type DocsEditorTemplateContentData = {
  documentJson?: string;
  fieldModelJson?: string;
};

export type DocsEditorTemplateContentHashes = {
  documentHash: string;
  fieldModelHash: string;
};

export type DocsEditorTemplateStorageMode = "draft" | "version";

export type DocsEditorTemplateStorageTemplate = Pick<
  DocsEditorTemplateRow,
  "id" | "title" | "type" | "status" | "ownerUserId" | "sourceKind" | "sourceProductKey"
>;

export type DocsEditorTemplateStorageContext = {
  template: DocsEditorTemplateStorageTemplate;
  space: Pick<DocsEditorSpaceRow, "targetType" | "targetId" | "title">;
};

export type DocsEditorTemplateContentFileStatus = {
  documentExists: boolean;
  fieldModelExists: boolean;
};

const CONTENT_ROOT_PARTS = ["data", "docs-editor", "templates"] as const;
const EMPTY_JSON = "{}";
const STRUCTURED_REF_PATTERN = /^data\/docs-editor\/templates\/(?:department|personal|company|committee)\//;

const hashCache = new Map<string, { documentHash: string; fieldModelHash: string; mtimeMs: number }>();

export async function readTemplateContentJson(row: DocsEditorTemplateContentRow) {
  const [documentJson, fieldModelJson] = await Promise.all([
    readContentRef(row.documentContentRef),
    readContentRef(row.fieldModelContentRef),
  ]);
  return {
    documentJson: documentJson || EMPTY_JSON,
    fieldModelJson: fieldModelJson || EMPTY_JSON,
  };
}

export async function readTemplateContent(row: DocsEditorTemplateContentRow) {
  const content = await readTemplateContentJson(row);
  return {
    document: parseJson(content.documentJson, {}),
    fieldModel: parseJson(content.fieldModelJson, {}),
  };
}

export async function readTemplateContentHashes(row: DocsEditorTemplateContentRow): Promise<DocsEditorTemplateContentHashes | null> {
  if (!row.documentContentRef || !row.fieldModelContentRef) return null;
  const fs = await runtimeFs();
  const documentPath = resolveContentRef(row.documentContentRef);
  const fieldModelPath = resolveContentRef(row.fieldModelContentRef);

  const [documentStat, fieldModelStat] = await Promise.all([
    fs.stat(documentPath).catch(() => null),
    fs.stat(fieldModelPath).catch(() => null),
  ]);
  if (!documentStat || !fieldModelStat) return null;

  const cacheKey = `${row.documentContentRef}|${row.fieldModelContentRef}`;
  const mtimeMs = Math.max(documentStat.mtimeMs, fieldModelStat.mtimeMs);
  const cached = hashCache.get(cacheKey);
  if (cached && cached.mtimeMs >= mtimeMs) {
    return { documentHash: cached.documentHash, fieldModelHash: cached.fieldModelHash };
  }

  const [documentContent, fieldModelContent] = await Promise.all([
    fs.readFile(documentPath, "utf8"),
    fs.readFile(fieldModelPath, "utf8"),
  ]);
  const documentHash = contentHash(documentContent);
  const fieldModelHash = contentHash(fieldModelContent);
  hashCache.set(cacheKey, { documentHash, fieldModelHash, mtimeMs });
  return { documentHash, fieldModelHash };
}

export async function templateContentFilesStatus(row: DocsEditorTemplateContentRow): Promise<DocsEditorTemplateContentFileStatus> {
  const fs = await runtimeFs();
  const [documentExists, fieldModelExists] = await Promise.all([
    row.documentContentRef ? fs.stat(resolveContentRef(row.documentContentRef)).then((stat) => stat.isFile()).catch(() => false) : false,
    row.fieldModelContentRef ? fs.stat(resolveContentRef(row.fieldModelContentRef)).then((stat) => stat.isFile()).catch(() => false) : false,
  ]);
  return { documentExists, fieldModelExists };
}

export async function planTemplateContentRefs(input: DocsEditorTemplateStorageContext & {
  mode: DocsEditorTemplateStorageMode;
  now?: Date;
}): Promise<DocsEditorTemplateContentMetadata> {
  const baseRef = await templateContentBaseRef(input);
  const targetRef = input.mode === "draft"
    ? `${baseRef}/draft`
    : `${baseRef}/versions/${await nextVersionLabel(baseRef, input.now ?? new Date())}`;
  return {
    documentContentRef: `${targetRef}/document.json`,
    fieldModelContentRef: `${targetRef}/field-model.json`,
  };
}

export async function writeTemplateContentJson(input: DocsEditorTemplateStorageContext & {
  documentJson: string;
  fieldModelJson: string;
  mode: DocsEditorTemplateStorageMode;
  now?: Date;
}): Promise<DocsEditorTemplateContentMetadata> {
  const refs = await planTemplateContentRefs(input);

  await Promise.all([
    writeContentRef(refs.documentContentRef, input.documentJson || EMPTY_JSON),
    writeContentRef(refs.fieldModelContentRef, input.fieldModelJson || EMPTY_JSON),
  ]);

  invalidateHashCache(input.template.id);
  return refs;
}

export function stripTemplateContentData<TData extends DocsEditorTemplateContentData>(data: TData) {
  const { documentJson: _documentJson, fieldModelJson: _fieldModelJson, ...rest } = data;
  return rest;
}

export async function writeTemplateContentUpdate(input: DocsEditorTemplateStorageContext & {
  data: DocsEditorTemplateContentData;
  existing?: DocsEditorTemplateContentRow;
  mode: DocsEditorTemplateStorageMode;
}) {
  if (input.data.documentJson === undefined && input.data.fieldModelJson === undefined) return {};
  const existingContent = input.existing ? await readTemplateContentJson(input.existing) : {
    documentJson: EMPTY_JSON,
    fieldModelJson: EMPTY_JSON,
  };
  return writeTemplateContentJson({
    template: input.template,
    space: input.space,
    documentJson: input.data.documentJson ?? existingContent.documentJson,
    fieldModelJson: input.data.fieldModelJson ?? existingContent.fieldModelJson,
    mode: input.mode,
  });
}

export async function deleteTemplateContentFiles(row: Pick<DocsEditorTemplateContentRow, "documentContentRef" | "fieldModelContentRef">) {
  await Promise.all([
    removeContentRef(row.documentContentRef),
    removeContentRef(row.fieldModelContentRef),
  ]);
}

export function docsEditorTemplateContentRoot() {
  return path.join(workspaceConfigDir(), ...CONTENT_ROOT_PARTS);
}

export function isStructuredTemplateContentRef(ref: string | null | undefined) {
  return !!ref && STRUCTURED_REF_PATTERN.test(ref);
}

export function invalidateHashCache(_templateId: number) {
  hashCache.clear();
}

async function templateContentBaseRef(input: DocsEditorTemplateStorageContext) {
  const targetType = normalizeTargetType(input.space.targetType);
  const [spaceLabel, templateLabel] = await Promise.all([
    resolveSpaceLabel(targetType, input.space.targetId, input.space.title),
    resolveTemplateLabel(input.template),
  ]);
  return [
    contentRootRef(),
    targetType,
    `${input.space.targetId}-${spaceLabel}`,
    `template-${padId(input.template.id)}-${templateLabel}`,
  ].join("/");
}

async function resolveSpaceLabel(targetType: "department" | "personal" | "company" | "committee", targetId: number, fallback: string) {
  if (targetType === "department" || targetType === "committee") {
    const department = await prisma.department.findUnique({
      where: { id: targetId },
      select: { code: true, name: true },
    });
    return slug(department?.code || department?.name || fallback || targetType);
  }
  if (targetType === "personal") {
    const user = await prisma.user.findUnique({
      where: { id: targetId },
      select: {
        username: true,
        nickname: true,
        employees: { select: { name: true }, take: 1 },
      },
    });
    return slug(user?.username || user?.nickname || user?.employees[0]?.name || fallback || "user");
  }
  const company = await prisma.company.findUnique({
    where: { id: targetId },
    select: { name: true },
  });
  return slug(company?.name || fallback || "company");
}

async function resolveTemplateLabel(template: DocsEditorTemplateStorageTemplate) {
  return slug(template.sourceProductKey || template.title || template.type || "template");
}

async function nextVersionLabel(baseRef: string, now: Date) {
  const datePrefix = shanghaiYymmdd(now);
  const fs = await runtimeFs();
  const versionsPath = resolveContentRef(`${baseRef}/versions`);
  const entries = await fs.readdir(versionsPath).catch(() => []);
  const maxVersion = entries.reduce((max, entry) => {
    const match = entry.match(new RegExp(`^${datePrefix}_v(\\d+)$`));
    if (!match) return max;
    return Math.max(max, Number(match[1]));
  }, 0);
  return `${datePrefix}_v${maxVersion + 1}`;
}

async function writeContentRef(ref: string, content: string) {
  const fs = await runtimeFs();
  const filePath = resolveContentRef(ref);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tempPath, content, "utf8");
  await fs.rename(tempPath, filePath);
}

async function readContentRef(ref: string | null) {
  if (!ref) return null;
  const fs = await runtimeFs();
  return fs.readFile(resolveContentRef(ref), "utf8").catch(() => null);
}

async function removeContentRef(ref: string | null) {
  if (!ref) return;
  const fs = await runtimeFs();
  await fs.rm(resolveContentRef(ref), { force: true, recursive: true }).catch(() => undefined);
}

function resolveContentRef(ref: string) {
  const rootRef = contentRootRef();
  if (path.isAbsolute(ref) || ref.includes("..") || !ref.startsWith(`${rootRef}/`)) {
    throw new Error("Invalid docs editor content ref");
  }
  return path.join(workspaceConfigDir(), ...ref.split("/"));
}

function workspaceConfigDir() {
  const configured = process.env["WORKSPACE_CONFIG_DIR"]?.trim();
  if (!configured) throw new Error("WORKSPACE_CONFIG_DIR is required for docs editor content storage");
  return expandTilde(configured);
}

function expandTilde(input: string) {
  if (input === "~") return os.homedir();
  if (input.startsWith("~/")) return path.join(os.homedir(), input.slice(2));
  return input;
}

function parseJson(value: string, fallback: unknown) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

async function runtimeFs() {
  return import("node:fs/promises");
}

function contentRootRef() {
  return CONTENT_ROOT_PARTS.join("/");
}

function normalizeTargetType(value: string): "department" | "personal" | "company" | "committee" {
  if (value === "personal" || value === "company" || value === "committee") return value;
  return "department";
}

function padId(id: number) {
  return String(id).padStart(6, "0");
}

function slug(value: string) {
  const normalized = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return normalized || "item";
}

function shanghaiYymmdd(now: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const byType = new Map(parts.map((part) => [part.type, part.value]));
  return `${byType.get("year")}${byType.get("month")}${byType.get("day")}`;
}

function contentHash(content: string) {
  return createHash("sha256").update(content).digest("hex");
}
