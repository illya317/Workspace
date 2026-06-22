import {
  failCommand,
  okCommand,
  type DomainValidationResult,
} from "@workspace/platform/server/domain-validation";
import {
  inlineEntryId,
  normalizeContext,
  normalizeInlineTarget,
  normalizePart,
  normalizeSections,
  normalizeText,
  sectionsToNote,
} from "../template-feedback-store";
import type {
  QcTemplateFeedbackContext,
  QcTemplateFeedbackSections,
  QcTemplateInlineFeedbackTarget,
} from "../types";

interface FeedbackAuthor {
  userId: number;
  userName: string;
}

export interface SaveTemplateFeedbackCommand {
  context: QcTemplateFeedbackContext;
  contextKey: string;
  key: string;
  sections: QcTemplateFeedbackSections;
  note: string;
}

export interface SaveTemplateInlineFeedbackCommand {
  context: QcTemplateFeedbackContext;
  contextKey: string;
  key: string;
  target: QcTemplateInlineFeedbackTarget;
  note: string;
  entryId: string;
}

export interface UpdateTemplateFeedbackResolvedCommand {
  key: string;
  resolved: boolean;
  author: FeedbackAuthor;
  target?: { type?: "section" | "inline"; id?: string };
}

export function qcTemplateFeedbackContextKey(context: QcTemplateFeedbackContext) {
  return [
    normalizePart(context.productKey),
    normalizePart(context.stageKey),
    normalizePart(context.itemType),
    normalizePart(context.testNameEn || context.sequence || context.templateId || context.testName),
  ].filter(Boolean).join("/");
}

export function userTemplateFeedbackKey(contextKey: string, userId: number) {
  return `${contextKey}#user:${userId}`;
}

function validateAuthor(author: FeedbackAuthor) {
  if (!Number.isInteger(author.userId) || author.userId <= 0) return failCommand("用户无效", 400, "userId");
  if (!author.userName.trim()) return failCommand("用户名不能为空", 400, "userName");
  return okCommand({ userId: author.userId, userName: author.userName.trim() });
}

export function buildSaveTemplateFeedbackCommand(
  rawContext: unknown,
  rawSections: unknown,
  author: FeedbackAuthor,
): DomainValidationResult<SaveTemplateFeedbackCommand> {
  const normalizedAuthor = validateAuthor(author);
  if (!normalizedAuthor.ok) return normalizedAuthor;
  const context = normalizeContext(rawContext);
  if (!context) return failCommand("反馈上下文不完整");
  const contextKey = qcTemplateFeedbackContextKey(context);
  const sections = normalizeSections(rawSections);
  return okCommand({
    context,
    contextKey,
    key: userTemplateFeedbackKey(contextKey, normalizedAuthor.data.userId),
    sections,
    note: sectionsToNote(sections),
  });
}

export function buildSaveTemplateInlineFeedbackCommand(
  rawContext: unknown,
  rawInlineEntry: unknown,
  author: FeedbackAuthor,
): DomainValidationResult<SaveTemplateInlineFeedbackCommand> {
  const normalizedAuthor = validateAuthor(author);
  if (!normalizedAuthor.ok) return normalizedAuthor;
  const context = normalizeContext(rawContext);
  if (!context) return failCommand("反馈上下文不完整");
  if (!rawInlineEntry || typeof rawInlineEntry !== "object" || Array.isArray(rawInlineEntry)) {
    return failCommand("字段反馈内容不完整");
  }
  const data = rawInlineEntry as Record<string, unknown>;
  const target = normalizeInlineTarget(data.target);
  if (!target) return failCommand("字段反馈锚点不完整");
  const note = normalizeText(data.note);
  const contextKey = qcTemplateFeedbackContextKey(context);
  return okCommand({
    context,
    contextKey,
    key: userTemplateFeedbackKey(contextKey, normalizedAuthor.data.userId),
    target,
    note,
    entryId: inlineEntryId(target),
  });
}

export function buildUpdateTemplateFeedbackResolvedCommand(
  key: string,
  resolved: boolean,
  author: FeedbackAuthor,
  target?: { type?: "section" | "inline"; id?: string },
): DomainValidationResult<UpdateTemplateFeedbackResolvedCommand> {
  const normalizedAuthor = validateAuthor(author);
  if (!normalizedAuthor.ok) return normalizedAuthor;
  const normalizedKey = key.trim();
  if (!normalizedKey) return failCommand("反馈 key 不能为空", 400, "key");
  return okCommand({
    key: normalizedKey,
    resolved,
    author: normalizedAuthor.data,
    target,
  });
}
