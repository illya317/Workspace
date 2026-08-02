"use client";

import { useCallback, useEffect, useState } from "react";
import {
  createEmptySection,
  createMasterDetailBody,
  createMessageSection,
  createPageBody,
  createPanelSection,
  createStatusSection,
  PageSurface,
  useFeedback,
} from "@workspace/core/ui";
import type { SelectorSurfaceProps, SurfaceToolbarItems } from "@workspace/core/ui";
import { directCommandFetch, requestJson } from "@workspace/platform/ui/api-client";

import type { NewsItem, NewsReactionKind, NewsWorkspaceDto } from "../types";

type NewsFilter = "featured" | "brief" | "all";

function formatDateTime(value: string | null) {
  if (!value) return "时间未知";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function openExternal(url: string) {
  const opened = window.open(url, "_blank", "noopener,noreferrer");
  if (opened) opened.opener = null;
}

async function responseError(response: Response, fallback: string) {
  const body = await response.json().catch(() => null) as { error?: string; message?: string } | null;
  return body?.error || body?.message || `${fallback} (${response.status})`;
}

function itemKindLabel(item: NewsItem) {
  return item.kind === "featured" ? "精选" : "快讯";
}

function NewsLoadingSurface({
  loading,
  loadError,
  onReload,
}: {
  loading: boolean;
  loadError: string;
  onReload: () => void;
}) {
  return (
    <PageSurface
      kind="standard"
      toolbar={{
        items: [{
          kind: "action-group",
          key: "news-load-actions",
          actions: [{ key: "refresh", kind: "refresh", label: "重新加载", disabled: loading, onClick: onReload }],
        }],
      }}
      body={createPageBody([
        createStatusSection("news-load-status", {
          kind: loadError ? "error" : "loading",
          content: loadError || "正在加载资讯…",
        }),
      ])}
    />
  );
}

export default function NewsWorkspaceClient() {
  const { error: showError, success: showSuccess } = useFeedback();
  const [newsFilter, setNewsFilter] = useState<NewsFilter>("featured");
  const [workspace, setWorkspace] = useState<NewsWorkspaceDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [reactionBusyKey, setReactionBusyKey] = useState<string | null>(null);
  const [selectedItemKey, setSelectedItemKey] = useState<string | null>(null);
  const [mobileDetailActive, setMobileDetailActive] = useState(false);

  const loadWorkspace = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const next = await requestJson<NewsWorkspaceDto>("/api/modules/news", {
        cache: "no-store",
        fallbackMessage: "加载资讯失败",
      });
      setWorkspace(next);
      setSelectedItemKey((current) => (
        next.briefing.items.some((item) => item.itemKey === current)
          ? current
          : next.briefing.items[0]?.itemKey ?? null
      ));
    } catch (error) {
      const message = error instanceof Error ? error.message : "加载资讯失败";
      setLoadError(message);
      showError(message);
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  async function saveReaction(item: NewsItem, reaction: NewsReactionKind) {
    if (!workspace || reactionBusyKey) return;
    const current = workspace.briefing.reactions[item.itemKey];
    const nextReaction = current === reaction ? null : reaction;
    setReactionBusyKey(item.itemKey);
    try {
      const response = await directCommandFetch("/api/modules/news/reactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemKey: item.itemKey,
          reportId: item.reportId,
          title: item.title,
          source: item.source,
          url: item.url,
          reaction: nextReaction,
        }),
      });
      if (!response.ok) throw new Error(await responseError(response, "保存资讯偏好失败"));
      const result = await response.json() as { itemKey: string; reaction: NewsReactionKind | null };
      setWorkspace((currentWorkspace) => currentWorkspace ? {
        ...currentWorkspace,
        briefing: {
          ...currentWorkspace.briefing,
          reactions: Object.fromEntries([
            ...Object.entries(currentWorkspace.briefing.reactions).filter(([key]) => key !== result.itemKey),
            ...(result.reaction ? [[result.itemKey, result.reaction]] : []),
          ]),
        },
      } : currentWorkspace);
      showSuccess(result.reaction ? "已记录资讯偏好" : "已取消资讯偏好");
    } catch (error) {
      showError(error instanceof Error ? error.message : "保存资讯偏好失败");
    } finally {
      setReactionBusyKey(null);
    }
  }

  if (!workspace) {
    return <NewsLoadingSurface loading={loading} loadError={loadError} onReload={() => void loadWorkspace()} />;
  }

  const filteredItems = workspace.briefing.items.filter((item) => newsFilter === "all" || item.kind === newsFilter);
  const selectedItem = filteredItems.find((item) => item.itemKey === selectedItemKey) ?? filteredItems[0] ?? null;
  const selector: SelectorSurfaceProps<NewsItem> = {
    kind: "list",
    title: "每日简报",
    items: filteredItems.map((item) => ({
      key: item.itemKey,
      value: item,
      card: {
        title: item.title,
        subtitle: item.source,
        code: itemKindLabel(item),
        status: item.score === null ? undefined : { label: `热度 ${item.score}`, tone: item.kind === "featured" ? "warning" : "muted" },
        active: selectedItem?.itemKey === item.itemKey,
      },
    })),
    selectedId: selectedItem?.itemKey ?? null,
    onSelect: (item) => {
      setSelectedItemKey(item.itemKey);
      setMobileDetailActive(true);
    },
    emptyText: "当前筛选下暂无资讯",
  };

  const detail = selectedItem
    ? createPageBody([
        ...(workspace.briefing.message ? [createMessageSection("briefing-message", {
          content: workspace.briefing.message,
          tone: "warning" as const,
        })] : []),
        createPanelSection("briefing-detail", {
          title: selectedItem.title,
          actions: [
            {
              key: "like",
              label: workspace.briefing.reactions[selectedItem.itemKey] === "like" ? "取消喜欢" : "喜欢",
              icon: "check",
              variant: workspace.briefing.reactions[selectedItem.itemKey] === "like" ? "primary" : "secondary",
              disabled: reactionBusyKey === selectedItem.itemKey,
              onClick: () => void saveReaction(selectedItem, "like"),
            },
            {
              key: "dislike",
              label: workspace.briefing.reactions[selectedItem.itemKey] === "dislike" ? "取消不喜欢" : "不喜欢",
              icon: "x",
              variant: workspace.briefing.reactions[selectedItem.itemKey] === "dislike" ? "danger" : "secondary",
              disabled: reactionBusyKey === selectedItem.itemKey,
              onClick: () => void saveReaction(selectedItem, "dislike"),
            },
            ...(selectedItem.url ? [{
              key: "open",
              label: "查看原文",
              icon: "open" as const,
              onClick: () => openExternal(selectedItem.url!),
            }] : []),
          ],
          sections: [
            createMessageSection("briefing-meta", {
              content: [
                selectedItem.source,
                itemKindLabel(selectedItem),
                `生成于 ${formatDateTime(workspace.briefing.generatedAt)}`,
                selectedItem.score === null ? "" : `热度 ${selectedItem.score}`,
              ].filter(Boolean).join(" · "),
              tone: workspace.briefing.freshness === "fresh" ? "muted" : "warning",
            }),
            createMessageSection("briefing-content", {
              content: selectedItem.summary || "这条资讯暂无摘要，可打开原文查看完整内容。",
              tone: "default",
            }),
            ...(selectedItem.tags.length ? [createMessageSection("briefing-tags", {
              content: selectedItem.tags.join(" · "),
              tone: "muted" as const,
            })] : []),
          ],
        }),
      ])
    : createPageBody([createEmptySection("briefing-detail-empty", {
        content: "从左侧选择一条资讯查看内容",
        presentation: "card",
      })]);

  const toolbarItems: SurfaceToolbarItems = [
    {
      kind: "option-group",
      key: "news-filter",
      value: newsFilter,
      presentation: "segmented",
      ariaLabel: "资讯范围",
      options: [
        { value: "featured", label: "精选" },
        { value: "brief", label: "快讯" },
        { value: "all", label: "全部" },
      ],
      onChange: (value) => {
        setNewsFilter(value as NewsFilter);
        setMobileDetailActive(false);
      },
    },
    { kind: "text", key: "news-count", content: `显示 ${filteredItems.length} / ${workspace.briefing.items.length} 条` },
    { kind: "action-group", key: "news-actions", actions: [
      { key: "refresh", kind: "refresh", label: "刷新资讯", disabled: loading, onClick: () => void loadWorkspace() },
      ...(workspace.briefing.sourceUrl ? [{ key: "source", kind: "open" as const, label: "打开资讯来源", onClick: () => openExternal(workspace.briefing.sourceUrl) }] : []),
    ] },
  ];

  return (
    <PageSurface
      kind="standard"
      toolbar={{ items: toolbarItems }}
      body={createMasterDetailBody({
        master: { label: "资讯标题", presentation: "compact", body: { kind: "selector", selector } },
        detail,
        desktop: { ratio: [3, 7] },
        mobile: { detailActive: mobileDetailActive, onNavigateToList: () => setMobileDetailActive(false) },
      })}
    />
  );
}
