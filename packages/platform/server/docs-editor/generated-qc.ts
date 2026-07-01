import "server-only";

import path from "path";
import { readFileSync } from "fs";
import { open, readdir, readFile } from "fs/promises";
import type {
  DocsEditorDb,
  DocsEditorSpaceRow,
  DocsEditorTemplateRow,
} from "./db";
import {
  writeTemplateContentJson,
} from "./content-store";

type GeneratedQcMetrics = {
  stageCount?: number;
  fieldCount?: number;
  formulaCount?: number;
  tableCount?: number;
};

type GeneratedQcPayload = {
  productKey: string;
  productName: string;
  generatedAt?: string;
  document: unknown;
  fieldModel: unknown;
  audit?: {
    stages?: number;
    fields?: number;
    formulas?: number;
    tables?: number;
  };
};

type GeneratedQcIndexEntry = {
  filePath: string;
  productKey: string;
  productName: string;
  generatedAt: Date | null;
};

type GeneratedQcAuditProduct = {
  productKey?: string;
  productName?: string;
  stages?: number;
  fields?: number;
  formulas?: number;
  tables?: number;
};

type GeneratedQcAuditPayload = {
  products?: GeneratedQcAuditProduct[];
};

type GeneratedQcAuditIndex = {
  metricsByProductKey: Map<string, GeneratedQcMetrics>;
};

type GeneratedQcExistingTemplate = Pick<
  DocsEditorTemplateRow,
  | "id"
  | "title"
  | "spaceId"
  | "sourceKind"
  | "sourceProductKey"
  | "sourceStageKeys"
  | "publishedAt"
  | "publishedByUserId"
>;

const SOURCE_KIND = "production.qc.official";
const SOURCE_STAGE_KEYS = JSON.stringify(["intermediate", "packaging", "finished"]);

let auditIndexCache: GeneratedQcAuditIndex | null | undefined;
const syncedSnapshotBySpaceId = new Map<number, string>();

export async function syncGeneratedQcTemplates(input: {
  db: DocsEditorDb;
  space: DocsEditorSpaceRow;
}) {
  const entries = await listGeneratedQcIndex();
  if (entries.length === 0) return;
  const snapshotKey = entries.map((entry) => (
    `${entry.productKey}:${entry.generatedAt?.getTime() ?? ""}`
  )).join("|");
  if (syncedSnapshotBySpaceId.get(input.space.id) === snapshotKey) return;

  const existingByProductKey = await listExistingGeneratedQcTemplates(input.db, input.space, entries);
  if (entries.every((entry) => isGeneratedQcTemplateCurrent(entry, existingByProductKey.get(entry.productKey)))) {
    syncedSnapshotBySpaceId.set(input.space.id, snapshotKey);
    return;
  }

  for (const entry of entries) {
    const existing = existingByProductKey.get(entry.productKey);
    if (isGeneratedQcTemplateCurrent(entry, existing)) continue;
    const payload = await readGeneratedQcPayload(entry.filePath);
    if (!payload) continue;
    await upsertGeneratedQcTemplate(input.db, input.space, payload);
  }
  syncedSnapshotBySpaceId.set(input.space.id, snapshotKey);
}

export function getGeneratedQcTemplateMetrics(productKey: string | null | undefined): GeneratedQcMetrics | null {
  if (!productKey) return null;
  return getGeneratedQcAuditIndex()?.metricsByProductKey.get(productKey) ?? null;
}

async function upsertGeneratedQcTemplate(
  db: DocsEditorDb,
  space: DocsEditorSpaceRow,
  payload: GeneratedQcPayload,
): Promise<boolean> {
  const existing = await db.documentTemplate.findFirst({
    where: {
      spaceId: space.id,
      sourceKind: SOURCE_KIND,
      sourceProductKey: payload.productKey,
      deletedAt: null,
    },
    orderBy: { id: "asc" },
  });
  const data = {
    title: `批检验记录：${payload.productName}`,
    type: "qc",
    status: "published",
    ownerUserId: null,
    spaceId: space.id,
    sourceKind: SOURCE_KIND,
    sourceProductKey: payload.productKey,
    sourceStageKeys: SOURCE_STAGE_KEYS,
    publishedAt: payload.generatedAt ? new Date(payload.generatedAt) : null,
    publishedByUserId: null,
  };
  const content = {
    documentJson: JSON.stringify(payload.document),
    fieldModelJson: JSON.stringify(payload.fieldModel),
  };
  if (existing) {
    if (existing.publishedByUserId !== null) return false;
    const contentMetadata = await writeTemplateContentJson({ templateId: existing.id, ...content });
    await db.documentTemplate.update({
      where: { id: existing.id },
      data: {
        ...data,
        ...contentMetadata,
        documentJson: "{}",
        fieldModelJson: "{}",
        version: { increment: 1 },
      },
    });
    return true;
  }
  const created = await db.documentTemplate.create({
    data: {
      ...data,
      ...content,
    },
  });
  const contentMetadata = await writeTemplateContentJson({ templateId: created.id, ...content });
  await db.documentTemplate.update({
    where: { id: created.id },
    data: {
      ...contentMetadata,
      documentJson: "{}",
      fieldModelJson: "{}",
    },
  });
  return true;
}

function sameTime(left: Date | null, right: Date | null) {
  return (left?.getTime() ?? null) === (right?.getTime() ?? null);
}

async function listExistingGeneratedQcTemplates(
  db: DocsEditorDb,
  space: DocsEditorSpaceRow,
  entries: GeneratedQcIndexEntry[],
) {
  const productKeys = entries.map((entry) => entry.productKey);
  const rows = await db.documentTemplate.findMany({
    where: {
      spaceId: space.id,
      sourceKind: SOURCE_KIND,
      sourceProductKey: { in: productKeys },
      deletedAt: null,
    },
    select: {
      id: true,
      title: true,
      spaceId: true,
      sourceKind: true,
      sourceProductKey: true,
      sourceStageKeys: true,
      publishedAt: true,
      publishedByUserId: true,
    },
  }) as GeneratedQcExistingTemplate[];
  const byProductKey = new Map<string, GeneratedQcExistingTemplate>();
  rows.forEach((row) => {
    if (row.sourceProductKey && !byProductKey.has(row.sourceProductKey)) {
      byProductKey.set(row.sourceProductKey, row);
    }
  });
  return byProductKey;
}

function isGeneratedQcTemplateCurrent(
  entry: GeneratedQcIndexEntry,
  existing: GeneratedQcExistingTemplate | undefined,
) {
  if (!existing) return false;
  if (existing.publishedByUserId !== null) return true;
  return existing.title === `批检验记录：${entry.productName}`
    && existing.sourceKind === SOURCE_KIND
    && existing.sourceProductKey === entry.productKey
    && existing.sourceStageKeys === SOURCE_STAGE_KEYS
    && sameTime(existing.publishedAt, entry.generatedAt);
}

function generatedQcProductsRoot() {
  return path.resolve(process.cwd(), "generated", "docs-editor", "qc", "products");
}

function generatedQcAuditPath() {
  return path.resolve(process.cwd(), "generated", "docs-editor", "qc", "audit.json");
}

async function listGeneratedQcIndex(): Promise<GeneratedQcIndexEntry[]> {
  const files = (await readdir(generatedQcProductsRoot()).catch(() => []))
    .filter((file) => file.endsWith(".json"))
    .sort();
  const entries = await Promise.all(files.map(async (file) => {
    const filePath = path.join(generatedQcProductsRoot(), file);
    const header = await readGeneratedQcHeader(filePath);
    const productKey = header.productKey ?? path.basename(file, ".json");
    const productName = header.productName ?? productKey;
    return {
      filePath,
      productKey,
      productName,
      generatedAt: header.generatedAt ? new Date(header.generatedAt) : null,
    };
  }));
  return entries.filter((entry) => entry.productKey && entry.productName);
}

async function readGeneratedQcHeader(filePath: string) {
  const handle = await open(filePath, "r").catch(() => null);
  if (!handle) return {};
  try {
    const buffer = Buffer.alloc(2048);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    const header = buffer.subarray(0, bytesRead).toString("utf8");
    return {
      generatedAt: matchJsonStringProperty(header, "generatedAt"),
      productKey: matchJsonStringProperty(header, "productKey"),
      productName: matchJsonStringProperty(header, "productName"),
    };
  } finally {
    await handle.close();
  }
}

function matchJsonStringProperty(source: string, key: string) {
  const match = new RegExp(`"${key}"\\s*:\\s*"([^"]+)"`).exec(source);
  return match?.[1];
}

function getGeneratedQcAuditIndex() {
  if (auditIndexCache !== undefined) return auditIndexCache;
  const raw = safeReadFileSync(generatedQcAuditPath());
  if (!raw) {
    auditIndexCache = null;
    return auditIndexCache;
  }
  try {
    const parsed = JSON.parse(raw) as GeneratedQcAuditPayload;
    const metricsByProductKey = new Map<string, GeneratedQcMetrics>();
    for (const product of parsed.products ?? []) {
      if (!product.productKey) continue;
      metricsByProductKey.set(product.productKey, {
        stageCount: product.stages,
        fieldCount: product.fields,
        formulaCount: product.formulas,
        tableCount: product.tables,
      });
    }
    auditIndexCache = { metricsByProductKey };
    return auditIndexCache;
  } catch {
    auditIndexCache = null;
    return auditIndexCache;
  }
}

function safeReadFileSync(filePath: string) {
  try {
    return readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
}

async function readGeneratedQcPayload(filePath: string): Promise<GeneratedQcPayload | null> {
  const raw = await readFile(filePath, "utf8").catch(() => "");
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<GeneratedQcPayload>;
    return typeof parsed.productKey === "string" && typeof parsed.productName === "string"
      ? parsed as GeneratedQcPayload
      : null;
  } catch {
    return null;
  }
}
