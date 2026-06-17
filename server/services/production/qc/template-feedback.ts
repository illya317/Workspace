import "server-only";
import {
  feedbackStates,
  hydrateItem,
  inlineEntryId,
  itemContextKey,
  normalizeContext,
  normalizeInlineTarget,
  normalizePart,
  normalizeSections,
  normalizeText,
  readStore,
  sectionsToNote,
  writeStore,
} from "./template-feedback-store";
import type {
  QcTemplateFeedbackContext,
  QcTemplateFeedbackItem,
  QcTemplateInlineFeedbackEntry,
  QcTemplateFeedbackList,
} from "./types";

interface FeedbackAuthor {
  userId: number;
  userName: string;
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

export async function listQcTemplateFeedback(): Promise<QcTemplateFeedbackList> {
  const store = await readStore();
  const items = [...store.items].map(hydrateItem).sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  return {
    items,
    keys: Array.from(new Set(items.map(itemContextKey))),
    states: feedbackStates(items),
  };
}

export async function getQcTemplateFeedback(key: string, userId: number): Promise<QcTemplateFeedbackItem | null> {
  const store = await readStore();
  const item = store.items.find((entry) => entry.key === userFeedbackKey(key, userId))
    ?? store.items.find((entry) => !entry.contextKey && entry.key === key)
    ?? null;
  return item ? hydrateItem(item) : null;
}

export async function listQcTemplateFeedbackByContext(key: string) {
  const store = await readStore();
  return [...store.items]
    .map(hydrateItem)
    .filter((item) => itemContextKey(item) === key)
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
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
    resolved: false,
    resolvedAt: undefined,
    resolvedBy: undefined,
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
    resolved: false,
    resolvedAt: undefined,
    resolvedBy: undefined,
    updatedAt: new Date().toISOString(),
  };

  if (index >= 0) store.items[index] = item;
  else if (legacyIndex >= 0) store.items[legacyIndex] = item;
  else store.items.push(item);
  await writeStore(store);
  return item;
}

export async function updateQcTemplateFeedbackResolved(
  key: string,
  resolved: boolean,
  author: FeedbackAuthor,
): Promise<QcTemplateFeedbackItem> {
  const store = await readStore();
  const index = store.items.findIndex((item) => item.key === key);
  if (index < 0) throw new Error("反馈不存在");
  const existing = hydrateItem(store.items[index]);
  const item: QcTemplateFeedbackItem = {
    ...existing,
    resolved,
    resolvedAt: resolved ? new Date().toISOString() : undefined,
    resolvedBy: resolved ? author.userName : undefined,
    updatedAt: new Date().toISOString(),
  };
  store.items[index] = item;
  await writeStore(store);
  return item;
}
