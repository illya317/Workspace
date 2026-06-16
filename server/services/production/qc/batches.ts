import "server-only";
import path from "path";
import { mkdir, readFile, writeFile } from "fs/promises";
import { getQcTemplateDetail } from "./record-structure";
import { qcRuntimeDataPath } from "./runtime-data-path";
import type { QcBatchCreateInput, QcBatchList, QcBatchSummary, QcBatchStatus } from "./types";

interface QcBatchStore {
  nextId: number;
  batches: QcBatchSummary[];
}

function dataPath() {
  return qcRuntimeDataPath("qc-batches.json");
}

function emptyStore(): QcBatchStore {
  return { nextId: 1, batches: [] };
}

async function readStore(): Promise<QcBatchStore> {
  try {
    const raw = JSON.parse(await readFile(dataPath(), "utf8")) as Partial<QcBatchStore>;
    return {
      nextId: Number.isInteger(raw.nextId) ? raw.nextId! : 1,
      batches: Array.isArray(raw.batches) ? raw.batches : [],
    };
  } catch {
    return emptyStore();
  }
}

async function writeStore(store: QcBatchStore) {
  const filePath = dataPath();
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

function normalizeStatus(value: unknown): QcBatchStatus {
  return value === "submitted" ? "submitted" : "draft";
}

function sortBatches(batches: QcBatchSummary[]) {
  return [...batches].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

export async function listQcBatches(): Promise<QcBatchList> {
  const store = await readStore();
  const batches = sortBatches(store.batches.map((batch) => ({ ...batch, status: normalizeStatus(batch.status) })));
  return {
    batches,
    counts: {
      total: batches.length,
      draft: batches.filter((batch) => batch.status === "draft").length,
      submitted: batches.filter((batch) => batch.status === "submitted").length,
    },
  };
}

export async function createQcBatch(input: QcBatchCreateInput): Promise<QcBatchSummary> {
  const productKey = input.productKey.trim();
  const batchNumber = input.batchNumber.trim();
  if (!productKey || !batchNumber) throw new Error("productKey and batchNumber are required");

  const detail = await getQcTemplateDetail(productKey);
  if (!detail.source.available || detail.stages.length === 0) throw new Error("QC product template not found");

  const store = await readStore();
  const now = new Date().toISOString();
  const batch: QcBatchSummary = {
    id: store.nextId,
    batchNumber,
    productKey,
    productName: detail.productName,
    inspector: "",
    status: "draft",
    createdAt: now,
    updatedAt: now,
    fields: {},
  };
  store.nextId += 1;
  store.batches.push(batch);
  await writeStore(store);
  return batch;
}

export async function getQcBatch(batchId: number): Promise<QcBatchSummary | null> {
  const store = await readStore();
  return store.batches.find((batch) => batch.id === batchId) ?? null;
}

export async function updateQcBatch(batchId: number, fields: Record<string, unknown>): Promise<QcBatchSummary | null> {
  const store = await readStore();
  const batch = store.batches.find((item) => item.id === batchId);
  if (!batch) return null;
  if (typeof fields.batchNumber === "string") batch.batchNumber = fields.batchNumber.trim();
  if (typeof fields.inspector === "string") batch.inspector = fields.inspector.trim();
  if (fields.fields && typeof fields.fields === "object" && !Array.isArray(fields.fields)) {
    for (const [key, value] of Object.entries(fields.fields)) {
      batch.fields[key] = value == null ? "" : String(value);
    }
  }
  batch.updatedAt = new Date().toISOString();
  await writeStore(store);
  return batch;
}

export async function submitQcBatch(batchId: number): Promise<QcBatchSummary | null> {
  const store = await readStore();
  const batch = store.batches.find((item) => item.id === batchId);
  if (!batch) return null;
  batch.status = "submitted";
  batch.updatedAt = new Date().toISOString();
  await writeStore(store);
  return batch;
}

export async function deleteQcBatch(batchId: number): Promise<boolean> {
  const store = await readStore();
  const next = store.batches.filter((batch) => batch.id !== batchId);
  if (next.length === store.batches.length) return false;
  store.batches = next;
  await writeStore(store);
  return true;
}
