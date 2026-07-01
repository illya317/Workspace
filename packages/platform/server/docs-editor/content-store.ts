import "server-only";

import { createHash } from "crypto";
import os from "os";
import path from "path";

export type DocsEditorTemplateContentRow = {
  id: number;
  documentJson: string;
  fieldModelJson: string;
  documentContentRef: string | null;
  fieldModelContentRef: string | null;
};

export type DocsEditorTemplateContentMetadata = {
  documentContentRef: string;
  documentContentHash: string;
  documentContentBytes: number;
  fieldModelContentRef: string;
  fieldModelContentHash: string;
  fieldModelContentBytes: number;
};

export type DocsEditorTemplateContentData = {
  documentJson?: string;
  fieldModelJson?: string;
};

const CONTENT_ROOT_PARTS = ["data", "docs-editor", "templates"] as const;
const EMPTY_JSON = "{}";

export async function readTemplateContentJson(row: DocsEditorTemplateContentRow) {
  const [documentJson, fieldModelJson] = await Promise.all([
    readContentRef(row.documentContentRef).then((content) => content ?? row.documentJson),
    readContentRef(row.fieldModelContentRef).then((content) => content ?? row.fieldModelJson),
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

export async function writeTemplateContentJson(input: {
  templateId: number;
  documentJson: string;
  fieldModelJson: string;
}): Promise<DocsEditorTemplateContentMetadata> {
  const documentRef = templateContentRef(input.templateId, "document.json");
  const fieldModelRef = templateContentRef(input.templateId, "field-model.json");
  const [documentMeta, fieldModelMeta] = await Promise.all([
    writeContentRef(documentRef, input.documentJson || EMPTY_JSON),
    writeContentRef(fieldModelRef, input.fieldModelJson || EMPTY_JSON),
  ]);
  return {
    documentContentRef: documentRef,
    documentContentHash: documentMeta.hash,
    documentContentBytes: documentMeta.bytes,
    fieldModelContentRef: fieldModelRef,
    fieldModelContentHash: fieldModelMeta.hash,
    fieldModelContentBytes: fieldModelMeta.bytes,
  };
}

export function stripTemplateContentData<TData extends DocsEditorTemplateContentData>(data: TData) {
  const { documentJson: _documentJson, fieldModelJson: _fieldModelJson, ...rest } = data;
  return rest;
}

export async function writeTemplateContentUpdate(input: {
  templateId: number;
  data: DocsEditorTemplateContentData;
  existing?: DocsEditorTemplateContentRow;
}) {
  if (input.data.documentJson === undefined && input.data.fieldModelJson === undefined) return {};
  const existingContent = input.existing ? await readTemplateContentJson(input.existing) : {
    documentJson: EMPTY_JSON,
    fieldModelJson: EMPTY_JSON,
  };
  const metadata = await writeTemplateContentJson({
    templateId: input.templateId,
    documentJson: input.data.documentJson ?? existingContent.documentJson,
    fieldModelJson: input.data.fieldModelJson ?? existingContent.fieldModelJson,
  });
  return {
    ...metadata,
    ...(input.data.documentJson !== undefined ? { documentJson: EMPTY_JSON } : {}),
    ...(input.data.fieldModelJson !== undefined ? { fieldModelJson: EMPTY_JSON } : {}),
  };
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

function templateContentRef(templateId: number, fileName: "document.json" | "field-model.json") {
  return `${contentRootRef()}/${templateId}/${fileName}`;
}

async function writeContentRef(ref: string, content: string) {
  const fs = await runtimeFs();
  const filePath = resolveContentRef(ref);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const bytes = Buffer.byteLength(content, "utf8");
  const hash = createHash("sha256").update(content).digest("hex");
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tempPath, content, "utf8");
  await fs.rename(tempPath, filePath);
  return { bytes, hash };
}

async function readContentRef(ref: string | null) {
  if (!ref) return null;
  const fs = await runtimeFs();
  return fs.readFile(resolveContentRef(ref), "utf8").catch(() => null);
}

async function removeContentRef(ref: string | null) {
  if (!ref) return;
  const fs = await runtimeFs();
  await fs.rm(resolveContentRef(ref), { force: true }).catch(() => undefined);
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
