import "server-only";
import path from "path";
import { mkdir, readFile, writeFile } from "fs/promises";
import { qcRuntimeDataPath } from "./runtime-data-path";
import type {
  QcTemplateFeedbackContext,
  QcTemplateFeedbackItem,
  QcTemplateFeedbackSectionKey,
  QcTemplateFeedbackSections,
  QcTemplateFeedbackState,
  QcTemplateInlineFeedbackEntry,
  QcTemplateInlineFeedbackTarget,
} from "./types";
import { buildWriteTemplateFeedbackStoreCommand } from "./domain/template-feedback-store-validation";

interface QcTemplateFeedbackStore {
  items: QcTemplateFeedbackItem[];
}

export function dataPath() {
  return qcRuntimeDataPath("qc-template-feedback.json");
}

export function normalizePart(value: unknown) {
  return String(value ?? "").trim().replace(/\s+/g, "_");
}

export function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

export function normalizeContext(value: unknown): QcTemplateFeedbackContext | null {
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

export async function readStore(): Promise<QcTemplateFeedbackStore> {
  try {
    const raw = JSON.parse(await readFile(dataPath(), "utf8")) as Partial<QcTemplateFeedbackStore>;
    return { items: Array.isArray(raw.items) ? raw.items : [] };
  } catch {
    return { items: [] };
  }
}

export async function writeStore(store: QcTemplateFeedbackStore) {
  const command = buildWriteTemplateFeedbackStoreCommand(store);
  if (!command.ok) throw new Error(command.issue.message);
  const filePath = dataPath();
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

export function normalizeInlineTarget(rawTarget: unknown): QcTemplateInlineFeedbackTarget | null {
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

export function inlineEntryId(target: QcTemplateInlineFeedbackTarget) {
  return [
    target.kind,
    normalizePart(target.key),
    normalizePart(target.section || ""),
    normalizePart(target.label),
  ].filter(Boolean).join("/");
}

export function normalizeInlineEntries(rawEntries: unknown): QcTemplateInlineFeedbackEntry[] {
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

export function normalizeSections(rawSections: unknown, rawNote?: unknown): QcTemplateFeedbackSections {
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

export function sectionsToNote(sections: QcTemplateFeedbackSections) {
  return FEEDBACK_SECTION_LABELS
    .map(([key, label]) => sections[key] ? `${label}：${sections[key]}` : "")
    .filter(Boolean)
    .join("\n\n");
}

export const FEEDBACK_SECTION_LABELS: Array<[QcTemplateFeedbackSectionKey, string]> = [
  ["descriptionText", "描述文字"],
  ["tableLayout", "表格布局"],
  ["formulaCalculation", "公式计算"],
  ["autoFilledText", "文字自动填写"],
  ["other", "其他"],
];

export function hydrateItem(item: QcTemplateFeedbackItem): QcTemplateFeedbackItem {
  const sections = normalizeSections(item.sections, item.note);
  return {
    ...item,
    sections,
    inlineEntries: normalizeInlineEntries(item.inlineEntries),
    note: item.note || sectionsToNote(sections),
    resolved: item.resolved === true,
  };
}

export function itemContextKey(item: QcTemplateFeedbackItem) {
  return item.contextKey || item.key;
}

export function isFeedbackLineResolved(item: QcTemplateFeedbackItem, type: "section" | "inline", id: string) {
  if (type === "section") return item.sectionResolved?.[id as QcTemplateFeedbackSectionKey] ?? item.resolved === true;
  return item.inlineResolved?.[id] ?? item.resolved === true;
}

export function hasOpenFeedbackLine(item: QcTemplateFeedbackItem) {
  const hydrated = hydrateItem(item);
  for (const [key] of FEEDBACK_SECTION_LABELS) {
    if (hydrated.sections?.[key]?.trim() && !isFeedbackLineResolved(hydrated, "section", key)) return true;
  }
  return (hydrated.inlineEntries || []).some((entry) => !isFeedbackLineResolved(hydrated, "inline", entry.id));
}

export function allFeedbackLinesResolved(item: QcTemplateFeedbackItem) {
  const hydrated = hydrateItem(item);
  const hasSection = FEEDBACK_SECTION_LABELS.some(([key]) => Boolean(hydrated.sections?.[key]?.trim()));
  const hasInline = (hydrated.inlineEntries || []).length > 0;
  if (!hasSection && !hasInline) return hydrated.resolved === true;
  return !hasOpenFeedbackLine(hydrated);
}

export function feedbackStates(items: QcTemplateFeedbackItem[]) {
  const grouped = new Map<string, QcTemplateFeedbackItem[]>();
  for (const item of items) {
    const key = itemContextKey(item);
    grouped.set(key, [...(grouped.get(key) || []), item]);
  }
  const states: Record<string, QcTemplateFeedbackState> = {};
  for (const [key, entries] of grouped.entries()) {
    states[key] = entries.some(hasOpenFeedbackLine) ? "open" : "resolved";
  }
  return states;
}
