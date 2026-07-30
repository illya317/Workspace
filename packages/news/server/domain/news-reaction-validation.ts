import { failCommand, okCommand } from "@workspace/platform/server/domain-validation";

import type { NewsReactionKind } from "../../types";

const REACTIONS = new Set<NewsReactionKind>(["like", "dislike"]);

function text(value: unknown) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized || null;
}

function boundedText(value: unknown, maxLength: number, label: string, field?: string) {
  const normalized = text(value);
  if (normalized && normalized.length > maxLength) {
    return failCommand(`${label}不能超过 ${maxLength} 个字符`, 400, field);
  }
  return okCommand<string | null>(normalized);
}

function safeExternalUrl(value: unknown) {
  const normalized = boundedText(value, 2_000, "资讯原文链接", "url");
  if (!normalized.ok) return normalized;
  if (!normalized.data) return okCommand<string | null>(null);
  try {
    const url = new URL(normalized.data);
    return url.protocol === "http:" || url.protocol === "https:"
      ? okCommand<string | null>(url.toString())
      : failCommand("资讯原文链接无效", 400, "url");
  } catch {
    return failCommand("资讯原文链接无效", 400, "url");
  }
}

export function buildSaveNewsReactionCommand(input: {
  userId: number;
  body: Record<string, unknown>;
}) {
  const itemKey = text(input.body.itemKey);
  if (!itemKey || !/^[a-f0-9]{64}$/.test(itemKey)) return failCommand("资讯标识无效", 400, "itemKey");
  const title = boundedText(input.body.title, 500, "资讯标题", "title");
  if (!title.ok) return title;
  if (!title.data) return failCommand("资讯标题不能为空", 400, "title");
  const rawReaction = input.body.reaction;
  const reaction = rawReaction === null || rawReaction === "" ? null : String(rawReaction);
  if (reaction !== null && !REACTIONS.has(reaction as NewsReactionKind)) {
    return failCommand("偏好类型无效", 400, "reaction");
  }
  const url = safeExternalUrl(input.body.url);
  if (!url.ok) return url;
  const reportId = boundedText(input.body.reportId, 100, "简报标识", "reportId");
  if (!reportId.ok) return reportId;
  const source = boundedText(input.body.source, 200, "资讯来源", "source");
  if (!source.ok) return source;
  return okCommand({
    userId: input.userId,
    itemKey,
    reportId: reportId.data,
    title: title.data,
    source: source.data,
    url: url.data,
    reaction: reaction as NewsReactionKind | null,
  });
}
