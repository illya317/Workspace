import "server-only";

import { prisma } from "../prisma";
import {
  readTemplateContent,
} from "./content-store";

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
    where: {
      sourceKind: "production.qc.official",
      status: "published",
      deletedAt: null,
    },
    select: {
      id: true,
      title: true,
      version: true,
      sourceProductKey: true,
    },
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
    where: {
      sourceKind: "production.qc.official",
      sourceProductKey: productKey,
      status: "published",
      deletedAt: null,
    },
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
