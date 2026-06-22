import "server-only";
import {
  allFeedbackLinesResolved,
  FEEDBACK_SECTION_LABELS,
  feedbackStates,
  hydrateItem,
  itemContextKey,
  normalizeSections,
  readStore,
  writeStore,
} from "./template-feedback-store";
import {
  buildSaveTemplateFeedbackCommand,
  buildSaveTemplateInlineFeedbackCommand,
  buildUpdateTemplateFeedbackResolvedCommand,
  qcTemplateFeedbackContextKey,
} from "./domain/template-feedback-validation";
import type {
  QcTemplateFeedbackContext,
  QcTemplateFeedbackItem,
  QcTemplateFeedbackList,
} from "./types";

interface FeedbackAuthor {
  userId: number;
  userName: string;
}

interface ResolveTarget { type?: "section" | "inline"; id?: string }

export function qcTemplateFeedbackKey(context: QcTemplateFeedbackContext) {
  return qcTemplateFeedbackContextKey(context);
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
  const command = buildSaveTemplateFeedbackCommand(rawContext, rawSections, author);
  if (!command.ok) throw new Error(command.issue.message);
  const { context, contextKey, key, sections, note } = command.data;
  const store = await readStore();
  const index = store.items.findIndex((item) => item.key === key);
  const legacyIndex = store.items.findIndex((item) => !item.contextKey && item.key === contextKey);
  const existing = hydrateItem(index >= 0 ? store.items[index] : legacyIndex >= 0 ? store.items[legacyIndex] : {
    key, contextKey, context, userId: author.userId, userName: author.userName,
    note: "", sections: normalizeSections(null), inlineEntries: [],
    updatedAt: new Date().toISOString(),
  } as QcTemplateFeedbackItem);

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

  const sectionResolved = { ...(existing.sectionResolved || {}) };
  for (const [sectionKey] of FEEDBACK_SECTION_LABELS) {
    const nextValue = sections[sectionKey];
    const previousValue = existing.sections?.[sectionKey];
    if (!nextValue) delete sectionResolved[sectionKey];
    else if (nextValue !== previousValue) sectionResolved[sectionKey] = false;
  }

  const item: QcTemplateFeedbackItem = {
    key,
    contextKey,
    context,
    userId: author.userId,
    userName: author.userName,
    note,
    sections,
    inlineEntries: existing.inlineEntries || [],
    sectionResolved,
    inlineResolved: existing.inlineResolved || {},
    resolved: false,
    resolvedAt: undefined,
    resolvedBy: undefined,
    updatedAt: new Date().toISOString(),
  };
  item.resolved = allFeedbackLinesResolved(item);
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
  const command = buildSaveTemplateInlineFeedbackCommand(rawContext, rawInlineEntry, author);
  if (!command.ok) throw new Error(command.issue.message);
  const { context, contextKey, key, target, note, entryId } = command.data;
  const store = await readStore();
  const index = store.items.findIndex((item) => item.key === key);
  const legacyIndex = store.items.findIndex((item) => !item.contextKey && item.key === contextKey);
  const existing = hydrateItem(index >= 0 ? store.items[index] : legacyIndex >= 0 ? store.items[legacyIndex] : {
    key, contextKey, context, userId: author.userId, userName: author.userName,
    note: "", sections: normalizeSections(null), inlineEntries: [],
    updatedAt: new Date().toISOString(),
  } as QcTemplateFeedbackItem);
  const nextEntries = [...(existing.inlineEntries || [])];
  const entryIndex = nextEntries.findIndex((entry) => entry.id === entryId);
  const previousNote = entryIndex >= 0 ? nextEntries[entryIndex].note : "";

  if (!note) {
    if (entryIndex >= 0) nextEntries.splice(entryIndex, 1);
  } else {
    const now = new Date().toISOString();
    const nextEntry = {
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

  const inlineResolved = { ...(existing.inlineResolved || {}) };
  if (!note) delete inlineResolved[entryId];
  else if (entryIndex < 0 || previousNote !== note) inlineResolved[entryId] = false;

  const item: QcTemplateFeedbackItem = {
    ...existing,
    key,
    contextKey,
    context,
    userId: author.userId,
    userName: author.userName,
    inlineEntries: nextEntries,
    inlineResolved,
    resolved: false,
    resolvedAt: undefined,
    resolvedBy: undefined,
    updatedAt: new Date().toISOString(),
  };
  item.resolved = allFeedbackLinesResolved(item);

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
  target?: ResolveTarget,
): Promise<QcTemplateFeedbackItem> {
  const command = buildUpdateTemplateFeedbackResolvedCommand(key, resolved, author, target);
  if (!command.ok) throw new Error(command.issue.message);
  const store = await readStore();
  const index = store.items.findIndex((item) => item.key === command.data.key);
  if (index < 0) throw new Error("反馈不存在");
  const existing = hydrateItem(store.items[index]);
  const sectionResolved = { ...(existing.sectionResolved || {}) };
  const inlineResolved = { ...(existing.inlineResolved || {}) };
  const commandTarget = command.data.target;
  if (commandTarget?.type === "section" && commandTarget.id) {
    sectionResolved[commandTarget.id as keyof typeof sectionResolved] = command.data.resolved;
  } else if (commandTarget?.type === "inline" && commandTarget.id) {
    inlineResolved[commandTarget.id] = command.data.resolved;
  } else {
    for (const [sectionKey] of FEEDBACK_SECTION_LABELS) {
      if (existing.sections?.[sectionKey]?.trim()) sectionResolved[sectionKey] = command.data.resolved;
    }
    for (const entry of existing.inlineEntries || []) inlineResolved[entry.id] = command.data.resolved;
  }
  const item: QcTemplateFeedbackItem = {
    ...existing,
    sectionResolved,
    inlineResolved,
    resolved: false,
    updatedAt: new Date().toISOString(),
  };
  item.resolved = allFeedbackLinesResolved(item);
  item.resolvedAt = item.resolved ? new Date().toISOString() : undefined;
  item.resolvedBy = item.resolved ? command.data.author.userName : undefined;
  store.items[index] = item;
  await writeStore(store);
  return item;
}
