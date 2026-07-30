import { authorize } from "@workspace/platform/server/auth";
import { serviceError, serviceOk } from "@workspace/platform/server/api";
import { prisma } from "@workspace/platform/server/prisma";

import type { NewsBriefing, NewsReactionKind, NewsWorkspaceDto } from "../types";
import { buildSaveNewsReactionCommand } from "./domain/news-reaction-validation";
import {
  HotsearchHtmlAdapter,
  resolveNewsProviderUrl,
  type NewsSourcePort,
} from "./integrations/hotsearch-html-adapter";

const RESOURCE_KEY = "news";
const provider: NewsSourcePort = new HotsearchHtmlAdapter();

function unavailableBriefing(): NewsBriefing {
  const sourceUrl = resolveNewsProviderUrl() ?? "";
  return {
    reportId: "unavailable",
    title: "每日简报",
    generatedAt: null,
    sourceUrl,
    freshness: "unavailable",
    items: [],
    reactions: {},
    message: "资讯源暂时不可用，请稍后刷新。",
  };
}

export async function loadNewsWorkspace(command: { userId: number }) {
  if (!(await authorize({ user: command.userId, resourceKey: RESOURCE_KEY, action: "read" }))) {
    return serviceError("无权限", 403);
  }
  const sourceResult = await provider.getLatestBriefing().catch(() => null);
  let briefing = unavailableBriefing();
  if (sourceResult) {
    const reactions = sourceResult.items.length
      ? await prisma.newsReaction.findMany({
          where: { userId: command.userId, itemKey: { in: sourceResult.items.map((item) => item.itemKey) }, kind: { not: null } },
          select: { itemKey: true, kind: true },
        })
      : [];
    briefing = {
      ...sourceResult,
      reactions: Object.fromEntries(reactions.map((reaction) => [reaction.itemKey, reaction.kind as NewsReactionKind])),
    };
  }
  return serviceOk<NewsWorkspaceDto>({ briefing });
}

export async function commitNewsReactionCommand(input: {
  userId: number;
  body: Record<string, unknown>;
}) {
  if (!(await authorize({ user: input.userId, resourceKey: RESOURCE_KEY, action: "create" }))) {
    return serviceError("无权限", 403);
  }
  const validated = buildSaveNewsReactionCommand(input);
  if (!validated.ok) return serviceError(validated.issue.message, validated.issue.status);
  const data = validated.data;
  const reaction = await prisma.newsReaction.upsert({
    where: { userId_itemKey: { userId: data.userId, itemKey: data.itemKey } },
    create: {
      userId: data.userId,
      itemKey: data.itemKey,
      reportId: data.reportId,
      title: data.title,
      source: data.source,
      url: data.url,
      kind: data.reaction,
    },
    update: {
      reportId: data.reportId,
      title: data.title,
      source: data.source,
      url: data.url,
      kind: data.reaction,
    },
  });
  return serviceOk({ itemKey: reaction.itemKey, reaction: reaction.kind });
}
