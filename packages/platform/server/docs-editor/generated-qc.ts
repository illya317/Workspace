import "server-only";

import { createHash } from "crypto";
import path from "path";
import { readFileSync } from "fs";
import { open, readdir, readFile, stat } from "fs/promises";
import type {
  DocsEditorDb,
  DocsEditorSpaceRow,
  DocsEditorTemplateRow,
} from "./db";
import {
  readTemplateContentHashes,
  writeTemplateContentJson,
} from "./content-store";
import { normalizeDocumentTemplatePayload } from "./domain/document-template-validation";
import {
  QC_OFFICIAL_TEMPLATE_PRODUCT_KEYS,
  QC_OFFICIAL_TEMPLATE_SOURCE_KIND,
  QC_OFFICIAL_TEMPLATE_STAGE_KEYS,
} from "./official-templates";

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
  documentContentHash: string;
  fieldModelContentHash: string;
  payload: GeneratedQcPayload;
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
  | "documentContentRef"
  | "fieldModelContentRef"
  | "publishedAt"
  | "publishedByUserId"
  | "version"
>;

let auditIndexCache: GeneratedQcAuditIndex | null | undefined;
const syncedSnapshotBySpaceId = new Map<number, string>();
const snapshotHashCache = new Map<string, { documentHash: string; fieldModelHash: string; mtimeMs: number; size: number }>();

export async function syncGeneratedQcTemplates(input: {
  db: DocsEditorDb;
  space: DocsEditorSpaceRow;
}) {
  const entries = await listGeneratedQcIndex();
  if (entries.length === 0) return;
  const snapshotKey = entries.map((entry) => (
    `${entry.productKey}:${entry.generatedAt?.getTime() ?? ""}:${entry.documentContentHash}:${entry.fieldModelContentHash}`
  )).join("|");
  if (syncedSnapshotBySpaceId.get(input.space.id) === snapshotKey) return;

  const existingByProductKey = await listExistingGeneratedQcTemplates(input.db, entries);
  const outOfSyncEntries: GeneratedQcIndexEntry[] = [];

  for (const entry of entries) {
    const existing = existingByProductKey.get(entry.productKey);
    if (!existing) {
      outOfSyncEntries.push(entry);
      continue;
    }
    if (isUserEditedOfficialTemplate(existing)) {
      if (existing.spaceId !== input.space.id) {
        await input.db.documentTemplate.update({
          where: { id: existing.id },
          data: { spaceId: input.space.id },
        });
      }
      continue;
    }
    if (!isGeneratedQcTemplateMetadataCurrent(input.space, entry, existing)) {
      outOfSyncEntries.push(entry);
      continue;
    }
    const runtimeHashes = await readTemplateContentHashes(existing);
    if (!runtimeHashes
      || runtimeHashes.documentHash !== entry.documentContentHash
      || runtimeHashes.fieldModelHash !== entry.fieldModelContentHash) {
      outOfSyncEntries.push(entry);
    }
  }

  if (outOfSyncEntries.length === 0) {
    syncedSnapshotBySpaceId.set(input.space.id, snapshotKey);
    return;
  }

  for (const entry of outOfSyncEntries) {
    const existing = existingByProductKey.get(entry.productKey);
    await upsertGeneratedQcTemplate(input.db, input.space, entry.payload, existing ?? null);
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
  existing: GeneratedQcExistingTemplate | null,
): Promise<boolean> {
  const normalized = normalizeDocumentTemplatePayload(payload.document, payload.fieldModel);
  if (normalized.ok === false) {
    throw new Error(`官方 QC 模板数据无效：${payload.productKey} ${normalized.issue.message}`);
  }
  const data = {
    title: `批检验记录：${payload.productName}`,
    type: "qc",
    status: "published",
    ownerUserId: null,
    spaceId: space.id,
    sourceKind: QC_OFFICIAL_TEMPLATE_SOURCE_KIND,
    sourceProductKey: payload.productKey,
    sourceStageKeys: QC_OFFICIAL_TEMPLATE_STAGE_KEYS,
    publishedAt: payload.generatedAt ? new Date(payload.generatedAt) : null,
    publishedByUserId: null,
  };
  const content = {
    documentJson: JSON.stringify(normalized.data.document),
    fieldModelJson: JSON.stringify(normalized.data.fieldModel),
  };
  if (existing) {
    if (isUserEditedOfficialTemplate(existing)) {
      if (existing.spaceId !== space.id) {
        await db.documentTemplate.update({
          where: { id: existing.id },
          data: { spaceId: space.id },
        });
      }
      return false;
    }
    const contentMetadata = await writeTemplateContentJson({
      template: {
        ...existing,
        type: data.type,
        status: data.status,
        ownerUserId: data.ownerUserId,
        sourceKind: data.sourceKind,
        sourceProductKey: data.sourceProductKey,
      },
      space,
      ...content,
      mode: "version",
    });
    await db.documentTemplate.update({
      where: { id: existing.id },
      data: {
        ...data,
        ...contentMetadata,
        version: { increment: 1 },
      },
    });
    return true;
  }
  const created = await db.documentTemplate.create({
    data,
  });
  const contentMetadata = await writeTemplateContentJson({
    template: created,
    space,
    ...content,
    mode: "version",
  });
  await db.documentTemplate.update({
    where: { id: created.id },
    data: contentMetadata,
  });
  return true;
}

function sameTime(left: Date | null, right: Date | null) {
  return (left?.getTime() ?? null) === (right?.getTime() ?? null);
}

async function listExistingGeneratedQcTemplates(
  db: DocsEditorDb,
  entries: GeneratedQcIndexEntry[],
) {
  const productKeys = entries.map((entry) => entry.productKey);
  const rows = await db.documentTemplate.findMany({
    where: {
      sourceKind: QC_OFFICIAL_TEMPLATE_SOURCE_KIND,
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
      documentContentRef: true,
      fieldModelContentRef: true,
      publishedAt: true,
      publishedByUserId: true,
      version: true,
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

function isGeneratedQcTemplateMetadataCurrent(
  space: DocsEditorSpaceRow,
  entry: GeneratedQcIndexEntry,
  existing: GeneratedQcExistingTemplate,
) {
  return existing.title === `批检验记录：${entry.productName}`
    && existing.spaceId === space.id
    && existing.sourceKind === QC_OFFICIAL_TEMPLATE_SOURCE_KIND
    && existing.sourceProductKey === entry.productKey
    && existing.sourceStageKeys === QC_OFFICIAL_TEMPLATE_STAGE_KEYS
    && sameTime(existing.publishedAt, entry.generatedAt);
}

function isUserEditedOfficialTemplate(existing: GeneratedQcExistingTemplate) {
  return existing.publishedByUserId !== null;
}

function generatedQcProductsRoot() {
  return path.resolve(process.cwd(), "generated", "production", "qc", "template-snapshots", "products");
}

function generatedQcAuditPath() {
  return path.resolve(process.cwd(), "generated", "production", "qc", "template-snapshots", "audit.json");
}

async function listGeneratedQcIndex(): Promise<GeneratedQcIndexEntry[]> {
  const files = (await readdir(generatedQcProductsRoot()).catch(() => []))
    .filter((file) => file.endsWith(".json"))
    .sort();
  const expectedKeys = new Set<string>(QC_OFFICIAL_TEMPLATE_PRODUCT_KEYS);
  const entries = (await Promise.all(files.map(async (file) => {
    const filePath = path.join(generatedQcProductsRoot(), file);
    const header = await readGeneratedQcHeader(filePath);
    const productKey = header.productKey ?? path.basename(file, ".json");
    const productName = header.productName ?? productKey;
    const payload = await readGeneratedQcPayload(filePath);
    if (!payload) return null;
    const normalized = normalizeDocumentTemplatePayload(payload.document, payload.fieldModel);
    if (normalized.ok === false) {
      throw new Error(`官方 QC 模板数据无效：${payload.productKey} ${normalized.issue.message}`);
    }
    const documentJson = JSON.stringify(normalized.data.document);
    const fieldModelJson = JSON.stringify(normalized.data.fieldModel);
    const fileStat = await stat(filePath).catch(() => null);
    const cacheKey = filePath;
    const cached = fileStat ? snapshotHashCache.get(cacheKey) : undefined;
    let documentContentHash: string;
    let fieldModelContentHash: string;
    if (cached && cached.mtimeMs >= fileStat!.mtimeMs && cached.size === fileStat!.size) {
      documentContentHash = cached.documentHash;
      fieldModelContentHash = cached.fieldModelHash;
    } else {
      documentContentHash = contentHash(documentJson);
      fieldModelContentHash = contentHash(fieldModelJson);
      if (fileStat) {
        snapshotHashCache.set(cacheKey, {
          documentHash: documentContentHash,
          fieldModelHash: fieldModelContentHash,
          mtimeMs: fileStat.mtimeMs,
          size: fileStat.size,
        });
      }
    }
    return {
      filePath,
      productKey,
      productName,
      generatedAt: header.generatedAt ? new Date(header.generatedAt) : null,
      documentContentHash,
      fieldModelContentHash,
      payload: { ...payload, document: normalized.data.document, fieldModel: normalized.data.fieldModel },
    };
  }))).filter((entry): entry is GeneratedQcIndexEntry => Boolean(entry?.productKey && entry.productName));
  const actualKeys = new Set(entries.map((entry) => entry.productKey));
  const missing = QC_OFFICIAL_TEMPLATE_PRODUCT_KEYS.filter((key) => !actualKeys.has(key));
  const extra = entries.map((entry) => entry.productKey).filter((key) => !expectedKeys.has(key));
  if (missing.length > 0 || extra.length > 0) {
    throw new Error(`官方 QC 模板快照必须固定为 ${QC_OFFICIAL_TEMPLATE_PRODUCT_KEYS.length} 个产品：missing=${missing.join(",") || "-"} extra=${extra.join(",") || "-"}`);
  }
  return entries.filter((entry) => expectedKeys.has(entry.productKey));
}

function contentHash(content: string) {
  return createHash("sha256").update(content).digest("hex");
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
