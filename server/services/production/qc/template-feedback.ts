import "server-only";
import path from "path";
import { mkdir, readFile, writeFile } from "fs/promises";
import { qcRuntimeDataPath } from "./runtime-data-path";
import type {
  QcTemplateFeedbackContext,
  QcTemplateFeedbackItem,
  QcTemplateInlineFeedbackEntry,
  QcTemplateInlineFeedbackTarget,
  QcTemplateFeedbackList,
  QcTemplateFeedbackSections,
} from "./types";

interface QcTemplateFeedbackStore {
  items: QcTemplateFeedbackItem[];
}

interface FeedbackAuthor {
  userId: number;
  userName: string;
}

function dataPath() {
  return qcRuntimeDataPath("qc-template-feedback.json");
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

function userFeedbackKey(contextKey: string, userId: number) {
  return `${contextKey}#user:${userId}`;
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

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeInlineTarget(rawTarget: unknown): QcTemplateInlineFeedbackTarget | null {
  if (!rawTarget || typeof rawTarget !== "object" || Array.isArray(rawTarget)) return null;
  const data = rawTarget as Record<string, unknown>;
  const kind = String(data.kind ?? "").trim();
  const key = String(data.key ?? "").trim();
  const label = String(data.label ?? "").trim();
  if (!["heading", "field"].includes(kind) || !key || !label) return null;
  return {
    kind: kind as QcTemplateInlineFeedbackTarget["kind"],
    key,
    label,
    section: String(data.section ?? "").trim() || undefined,
    badgeKind: String(data.badgeKind ?? "").trim() || undefined,
  };
}

function inlineEntryId(target: QcTemplateInlineFeedbackTarget) {
  return [
    target.kind,
    normalizePart(target.key),
    normalizePart(target.section || ""),
    normalizePart(target.label),
  ].filter(Boolean).join("/");
}

function normalizeInlineEntries(rawEntries: unknown): QcTemplateInlineFeedbackEntry[] {
  if (!Array.isArray(rawEntries)) return [];
  return rawEntries.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const data = entry as Record<string, unknown>;
    const target = normalizeInlineTarget(data.target);
    const note = normalizeText(data.note);
    if (!target || !note) return [];
    const id = String(data.id ?? "").trim() || inlineEntryId(target);
    const createdAt = String(data.createdAt ?? "").trim() || new Date(0).toISOString();
    const updatedAt = String(data.updatedAt ?? "").trim() || createdAt;
    return [{ id, target, note, createdAt, updatedAt }];
  });
}

function normalizeSections(rawSections: unknown, rawNote?: unknown): QcTemplateFeedbackSections {
  const data = rawSections && typeof rawSections === "object" && !Array.isArray(rawSections)
    ? rawSections as Record<string, unknown>
    : {};
  const legacyNote = normalizeText(rawNote);
  return {
    descriptionText: normalizeText(data.descriptionText),
    tableLayout: normalizeText(data.tableLayout),
    formulaCalculation: normalizeText(data.formulaCalculation),
    autoFilledText: normalizeText(data.autoFilledText),
    other: normalizeText(data.other || legacyNote),
  };
}

function sectionsToNote(sections: QcTemplateFeedbackSections) {
  const labels: Array<[keyof QcTemplateFeedbackSections, string]> = [
    ["descriptionText", "描述文字"],
    ["tableLayout", "表格布局"],
    ["formulaCalculation", "公式计算"],
    ["autoFilledText", "文字自动填写"],
    ["other", "其他"],
  ];
  return labels
    .map(([key, label]) => sections[key] ? `${label}：${sections[key]}` : "")
    .filter(Boolean)
    .join("\n\n");
}

function hydrateItem(item: QcTemplateFeedbackItem): QcTemplateFeedbackItem {
  const sections = normalizeSections(item.sections, item.note);
  return {
    ...item,
    sections,
    inlineEntries: normalizeInlineEntries(item.inlineEntries),
    note: item.note || sectionsToNote(sections),
  };
}

export async function listQcTemplateFeedback(): Promise<QcTemplateFeedbackList> {
  const store = await readStore();
  const items = [...store.items].map(hydrateItem).sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  return { items, keys: Array.from(new Set(items.map((item) => item.contextKey || item.key))) };
}

export async function getQcTemplateFeedback(key: string, userId: number): Promise<QcTemplateFeedbackItem | null> {
  const store = await readStore();
  const item = store.items.find((entry) => entry.key === userFeedbackKey(key, userId))
    ?? store.items.find((entry) => !entry.contextKey && entry.key === key)
    ?? null;
  return item ? hydrateItem(item) : null;
}

export async function saveQcTemplateFeedback(
  rawContext: unknown,
  rawSections: unknown,
  author: FeedbackAuthor,
): Promise<QcTemplateFeedbackItem | null> {
  const context = normalizeContext(rawContext);
  if (!context) throw new Error("反馈上下文不完整");
  const contextKey = qcTemplateFeedbackKey(context);
  const key = userFeedbackKey(contextKey, author.userId);
  const sections = normalizeSections(rawSections);
  const note = sectionsToNote(sections);
  const store = await readStore();
  const index = store.items.findIndex((item) => item.key === key);
  const legacyIndex = store.items.findIndex((item) => !item.contextKey && item.key === contextKey);

  const hasContent = Object.values(sections).some(Boolean);
  if (!hasContent) {
    if (index >= 0) {
      store.items.splice(index, 1);
      await writeStore(store);
    } else if (legacyIndex >= 0) {
      store.items.splice(legacyIndex, 1);
      await writeStore(store);
    }
    return null;
  }

  const item: QcTemplateFeedbackItem = {
    key,
    contextKey,
    context,
    userId: author.userId,
    userName: author.userName,
    note,
    sections,
    updatedAt: new Date().toISOString(),
  };
  if (index >= 0) store.items[index] = item;
  else if (legacyIndex >= 0) store.items[legacyIndex] = item;
  else store.items.push(item);
  await writeStore(store);
  return item;
}

export async function saveQcTemplateInlineFeedback(
  rawContext: unknown,
  rawInlineEntry: unknown,
  author: FeedbackAuthor,
): Promise<QcTemplateFeedbackItem | null> {
  const context = normalizeContext(rawContext);
  if (!context) throw new Error("反馈上下文不完整");
  if (!rawInlineEntry || typeof rawInlineEntry !== "object" || Array.isArray(rawInlineEntry)) {
    throw new Error("字段反馈内容不完整");
  }
  const data = rawInlineEntry as Record<string, unknown>;
  const target = normalizeInlineTarget(data.target);
  if (!target) throw new Error("字段反馈锚点不完整");
  const note = normalizeText(data.note);
  const contextKey = qcTemplateFeedbackKey(context);
  const key = userFeedbackKey(contextKey, author.userId);
  const store = await readStore();
  const index = store.items.findIndex((item) => item.key === key);
  const legacyIndex = store.items.findIndex((item) => !item.contextKey && item.key === contextKey);
  const existing = hydrateItem(index >= 0 ? store.items[index] : legacyIndex >= 0 ? store.items[legacyIndex] : {
    key,
    contextKey,
    context,
    userId: author.userId,
    userName: author.userName,
    note: "",
    sections: normalizeSections(null),
    inlineEntries: [],
    updatedAt: new Date().toISOString(),
  } as QcTemplateFeedbackItem);
  const entryId = inlineEntryId(target);
  const nextEntries = [...(existing.inlineEntries || [])];
  const entryIndex = nextEntries.findIndex((entry) => entry.id === entryId);

  if (!note) {
    if (entryIndex >= 0) nextEntries.splice(entryIndex, 1);
  } else {
    const now = new Date().toISOString();
    const nextEntry: QcTemplateInlineFeedbackEntry = {
      id: entryId,
      target,
      note,
      createdAt: entryIndex >= 0 ? nextEntries[entryIndex].createdAt : now,
      updatedAt: now,
    };
    if (entryIndex >= 0) nextEntries[entryIndex] = nextEntry;
    else nextEntries.push(nextEntry);
  }

  const hasSections = Object.values(existing.sections || {}).some(Boolean);
  if (!hasSections && nextEntries.length === 0) {
    if (index >= 0) store.items.splice(index, 1);
    else if (legacyIndex >= 0) store.items.splice(legacyIndex, 1);
    await writeStore(store);
    return null;
  }

  const item: QcTemplateFeedbackItem = {
    ...existing,
    key,
    contextKey,
    context,
    userId: author.userId,
    userName: author.userName,
    inlineEntries: nextEntries,
    updatedAt: new Date().toISOString(),
  };

  if (index >= 0) store.items[index] = item;
  else if (legacyIndex >= 0) store.items[legacyIndex] = item;
  else store.items.push(item);
  await writeStore(store);
  return item;
}
