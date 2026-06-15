import "server-only";
import path from "path";
import { mkdir, readFile, writeFile } from "fs/promises";
import type {
  QcTemplateFeedbackContext,
  QcTemplateFeedbackItem,
  QcTemplateFeedbackList,
} from "./types";

interface QcTemplateFeedbackStore {
  items: QcTemplateFeedbackItem[];
}

function dataPath() {
  const root = process.env.WORKSPACE_CONFIG_DIR
    ? path.join(process.env.WORKSPACE_CONFIG_DIR, "data")
    : path.join(process.cwd(), "data");
  return path.join(root, "qc-template-feedback.json");
}

function normalizePart(value: unknown) {
  return String(value ?? "").trim().replace(/\s+/g, "_");
}

export function qcTemplateFeedbackKey(context: QcTemplateFeedbackContext) {
  return [
    normalizePart(context.productKey),
    normalizePart(context.stageKey),
    normalizePart(context.itemType),
    normalizePart(context.testNameEn || context.sequence || context.templateId || context.testName),
  ].filter(Boolean).join("/");
}

function normalizeContext(value: unknown): QcTemplateFeedbackContext | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  const productKey = normalizePart(data.productKey);
  const productName = String(data.productName ?? "").trim();
  const itemType = data.itemType;
  if (!productKey || !productName || !["precheck", "experiment", "test"].includes(String(itemType))) return null;
  return {
    productKey,
    productName,
    itemType: itemType as QcTemplateFeedbackContext["itemType"],
    stageKey: String(data.stageKey ?? "").trim() || undefined,
    stageLabel: String(data.stageLabel ?? "").trim() || undefined,
    sequence: String(data.sequence ?? "").trim() || undefined,
    testName: String(data.testName ?? "").trim() || undefined,
    testNameEn: String(data.testNameEn ?? "").trim() || undefined,
    methodName: String(data.methodName ?? "").trim() || undefined,
    layoutKey: String(data.layoutKey ?? "").trim() || undefined,
    templateId: String(data.templateId ?? "").trim() || undefined,
  };
}

async function readStore(): Promise<QcTemplateFeedbackStore> {
  try {
    const raw = JSON.parse(await readFile(dataPath(), "utf8")) as Partial<QcTemplateFeedbackStore>;
    return { items: Array.isArray(raw.items) ? raw.items : [] };
  } catch {
    return { items: [] };
  }
}

async function writeStore(store: QcTemplateFeedbackStore) {
  const filePath = dataPath();
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

export async function listQcTemplateFeedback(): Promise<QcTemplateFeedbackList> {
  const store = await readStore();
  const items = [...store.items].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  return { items, keys: items.map((item) => item.key) };
}

export async function getQcTemplateFeedback(key: string): Promise<QcTemplateFeedbackItem | null> {
  const store = await readStore();
  return store.items.find((item) => item.key === key) ?? null;
}

export async function saveQcTemplateFeedback(
  rawContext: unknown,
  rawNote: unknown,
): Promise<QcTemplateFeedbackItem | null> {
  const context = normalizeContext(rawContext);
  if (!context) throw new Error("反馈上下文不完整");
  const key = qcTemplateFeedbackKey(context);
  const note = String(rawNote ?? "").trim();
  const store = await readStore();
  const index = store.items.findIndex((item) => item.key === key);

  if (!note) {
    if (index >= 0) {
      store.items.splice(index, 1);
      await writeStore(store);
    }
    return null;
  }

  const item: QcTemplateFeedbackItem = {
    key,
    context,
    note,
    updatedAt: new Date().toISOString(),
  };
  if (index >= 0) store.items[index] = item;
  else store.items.push(item);
  await writeStore(store);
  return item;
}
