import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

import { prisma } from "./prisma";
import { resolveTenantConfigPath } from "./tenant-config";

const CONTENT_ROOT = "data/docs-editor/templates/";

async function readContentRef(ref: string | null) {
  if (!ref || path.isAbsolute(ref) || ref.includes("..") || !ref.startsWith(CONTENT_ROOT)) return null;
  return readFile(resolveTenantConfigPath(ref), "utf8").catch(() => null);
}

async function readTemplateContent(row: { documentContentRef: string | null; fieldModelContentRef: string | null }) {
  const [documentJson, fieldModelJson] = await Promise.all([
    readContentRef(row.documentContentRef),
    readContentRef(row.fieldModelContentRef),
  ]);
  return {
    document: parseJson(documentJson, {}),
    fieldModel: parseJson(fieldModelJson, {}),
  };
}

function parseJson(value: string | null, fallback: unknown) {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return fallback;
  }
}

export interface PublishedQcOfficialTemplate {
  templateId: number;
  templateVersion: number;
  productKey: string;
  productName: string;
  document: unknown;
  fieldModel: unknown;
  updatedAt: string;
}

export interface PublishedQcOfficialTemplateSummary {
  productKey: string;
  productName: string;
  templateId: number;
  templateVersion: number;
}

export async function listPublishedQcOfficialTemplateSummaries(): Promise<PublishedQcOfficialTemplateSummary[]> {
  const rows = await prisma.documentTemplate.findMany({
    where: { sourceKind: "production.qc.official", status: "published", deletedAt: null },
    select: { id: true, title: true, version: true, sourceProductKey: true },
    orderBy: [{ title: "asc" }, { version: "desc" }, { updatedAt: "desc" }, { id: "desc" }],
  });
  const seen = new Set<string>();
  return rows.flatMap((row) => {
    if (!row.sourceProductKey || seen.has(row.sourceProductKey)) return [];
    seen.add(row.sourceProductKey);
    return [{
      productKey: row.sourceProductKey,
      productName: row.title.replace(/^批检验记录：/, ""),
      templateId: row.id,
      templateVersion: row.version,
    }];
  });
}

export async function getPublishedQcOfficialTemplateByProductKey(productKey: string): Promise<PublishedQcOfficialTemplate | null> {
  const row = await prisma.documentTemplate.findFirst({
    where: { sourceKind: "production.qc.official", sourceProductKey: productKey, status: "published", deletedAt: null },
    orderBy: [{ version: "desc" }, { updatedAt: "desc" }, { id: "desc" }],
  });
  if (!row?.sourceProductKey) return null;
  const content = await readTemplateContent(row);
  return {
    templateId: row.id,
    templateVersion: row.version,
    productKey: row.sourceProductKey,
    productName: row.title.replace(/^批检验记录：/, ""),
    document: content.document,
    fieldModel: content.fieldModel,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function getPublishedHrPositionDescriptionOfficialTemplate() {
  const row = await prisma.documentTemplate.findFirst({
    where: {
      sourceKind: "hr.position-description.official",
      sourceProductKey: "hr.position-description.default",
      status: "published",
      deletedAt: null,
    },
    orderBy: [{ version: "desc" }, { updatedAt: "desc" }, { id: "desc" }],
  });
  if (!row) return null;
  const content = await readTemplateContent(row);
  return { id: row.id, version: row.version, title: row.title, ...content };
}
