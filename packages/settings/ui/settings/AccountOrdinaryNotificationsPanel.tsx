"use client";

import { useCallback, useEffect, useState } from "react";
import { workspacePath } from "@workspace/core/routing";
import {
  createListSection,
  createMasterDetailBody,
  createMessageSection,
  createPageBody,
  createPanelSection,
  PageSurface,
  type PageSurfaceTabBarSpec,
  type SurfaceToolbarItems,
  useFeedback,
} from "@workspace/core/ui";
import type { WorkflowInboxPerspective } from "./AccountWorkflowNotificationsModel";

type NotificationReadState = "all" | "unread" | "pending" | "read";
type NotificationItem = {
  id: number;
  type: string;
  title: string;
  body: string;
  href: string | null;
  recipientReason: string | null;
  resourceKey: string | null;
  scopeId: string | null;
  responseMode?: "read" | "acknowledge" | "accept_reject" | null;
  source?: string | { label?: string | null; kind?: string | null } | null;
  isImportant?: boolean;
  requiresAcknowledgement: boolean;
  readAt: string | null;
  acknowledgedAt: string | null;
  rejectedAt: string | null;
  createdAt: string;
  actor: { name: string } | null;
};

type NotificationResponse = {
  items: NotificationItem[];
  total: number;
  hasMore: boolean;
  unreadCount: number;
  tabCounts?: { ordinary: number; workflowTodo: number; workflowMine: number };
};

const PAGE_SIZE = 20;

function notifyBadgeChanged() {
  window.dispatchEvent(new CustomEvent("workspace-notifications-changed"));
}

function mergeItems(current: NotificationItem[], next: NotificationItem[]) {
  const seen = new Set<number>();
  return [...current, ...next].filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

export default function AccountOrdinaryNotificationsPanel({
  navigation,
  onShowWorkflow,
  onTabCountsChange,
}: {
  navigation: PageSurfaceTabBarSpec;
  onShowWorkflow: (perspective: WorkflowInboxPerspective) => void;
  onTabCountsChange?: (counts: { ordinary: number; workflowTodo: number; workflowMine: number }) => void;
}) {
  const feedback = useFeedback();
  const [data, setData] = useState<NotificationResponse>({ items: [], total: 0, hasMore: false, unreadCount: 0 });
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [keyword, setKeyword] = useState("");
  const [readState, setReadState] = useState<NotificationReadState>("all");
  const [mobileDetailActive, setMobileDetailActive] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [clearing, setClearing] = useState(false);
  const [markingRead, setMarkingRead] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(async (offset = 0, append = false) => {
    if (append) setLoadingMore(true);
    try {
      const query = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(offset),
        category: "ordinary",
        readState,
      });
      if (keyword.trim()) query.set("keyword", keyword.trim());
      const res = await fetch(workspacePath(`/api/settings/account/notifications?${query.toString()}`));
      if (!res.ok) throw new Error("加载通知失败");
      const next = await res.json() as NotificationResponse;
      setData((current) => append ? { ...next, items: mergeItems(current.items, next.items) } : next);
      if (!append) {
        setSelectedId((current) => next.items.some((item) => item.id === current) ? current : next.items[0]?.id ?? null);
        setMobileDetailActive(false);
      }
      if (next.tabCounts) onTabCountsChange?.(next.tabCounts);
    } catch (error) {
      feedback.error(error instanceof Error ? error.message : "加载通知失败");
    } finally {
      setLoadingMore(false);
    }
  }, [feedback, keyword, onTabCountsChange, readState]);

  useEffect(() => {
    void load();
  }, [load]);

  async function updateNotification(item: NotificationItem, action: "acknowledge" | "reject" | "clear") {
    setBusyId(item.id);
    try {
      const res = await fetch(workspacePath(`/api/settings/account/notifications/${item.id}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const result = await res.json().catch(() => ({})) as { error?: string };
      if (!res.ok) throw new Error(result.error || "处理通知失败");
      feedback.success(action === "reject" ? "已拒绝" : action === "acknowledge" ? "已确认收到" : "通知已清除");
      notifyBadgeChanged();
      await load();
    } catch (error) {
      feedback.error(error instanceof Error ? error.message : "处理通知失败");
    } finally {
      setBusyId(null);
    }
  }

  async function markRead(item: NotificationItem) {
    if (item.readAt) return;
    setData((current) => ({
      ...current,
      unreadCount: Math.max(0, current.unreadCount - 1),
      items: current.items.map((entry) => entry.id === item.id ? { ...entry, readAt: new Date().toISOString() } : entry),
    }));
    try {
      const res = await fetch(workspacePath(`/api/settings/account/notifications/${item.id}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "read" }),
      });
      if (!res.ok) throw new Error("标记已读失败");
      notifyBadgeChanged();
    } catch (error) {
      await load();
      feedback.error(error instanceof Error ? error.message : "标记已读失败");
    }
  }

  async function runBulkAction(action: "clear" | "markAllRead") {
    const setBusy = action === "clear" ? setClearing : setMarkingRead;
    setBusy(true);
    try {
      const res = await fetch(workspacePath("/api/settings/account/notifications?category=ordinary"), {
        method: action === "clear" ? "DELETE" : "PATCH",
        headers: action === "clear" ? undefined : { "Content-Type": "application/json" },
        body: action === "clear" ? undefined : JSON.stringify({ action: "markAllRead" }),
      });
      if (!res.ok) throw new Error(action === "clear" ? "清空通知失败" : "标记已读失败");
      notifyBadgeChanged();
      await load();
    } catch (error) {
      feedback.error(error instanceof Error ? error.message : "操作失败");
    } finally {
      setBusy(false);
    }
  }

  const selectedItem = data.items.find((item) => item.id === selectedId) ?? data.items[0] ?? null;
  const pending = selectedItem ? isPending(selectedItem) : false;
  const toolbarItems: SurfaceToolbarItems = [
    {
      kind: "option-group",
      key: "inbox-mode",
      ariaLabel: "收件箱分类",
      presentation: "segmented",
      value: "ordinary",
      options: [
        { value: "ordinary", label: data.tabCounts?.ordinary ? `通知 ${data.tabCounts.ordinary}` : "通知" },
        { value: "received", label: data.tabCounts?.workflowTodo ? `我收到的 ${data.tabCounts.workflowTodo}` : "我收到的" },
        { value: "originated", label: data.tabCounts?.workflowMine ? `我发起的 ${data.tabCounts.workflowMine}` : "我发起的" },
      ],
      onChange: (value) => {
        if (value === "received" || value === "originated") onShowWorkflow(value);
      },
    },
    {
      kind: "search",
      key: "notification-search",
      value: keyword,
      onChange: setKeyword,
      placeholder: "搜索标题、正文或类型",
    },
    {
      kind: "option-group",
      key: "read-state",
      ariaLabel: "阅读状态",
      value: readState,
      options: [
        { value: "all", label: "全部" },
        { value: "unread", label: "未读" },
        { value: "pending", label: "待确认" },
        { value: "read", label: "已读" },
      ],
      onChange: (value) => setReadState(value as NotificationReadState),
    },
    {
      kind: "action-group",
      key: "notification-actions",
      actions: [
        { key: "refresh", kind: "refresh", label: "刷新", onClick: () => void load() },
        {
          key: "mark-read",
          kind: "double-check",
          label: "全部已读",
          disabled: markingRead || data.items.every((item) => item.readAt),
          onClick: () => void runBulkAction("markAllRead"),
        },
        {
          key: "clear-read",
          kind: "delete-bin",
          label: "清空已读",
          variant: "danger",
          disabled: clearing || data.total === 0,
          onClick: () => void runBulkAction("clear"),
        },
      ],
    },
  ];

  const list = createListSection("notification-list", {
    presentation: "cards",
    density: "compact",
    empty: { content: "暂无符合条件的通知", compact: true },
    footerAction: data.hasMore ? {
      key: "load-more",
      label: loadingMore ? "加载中…" : "加载更多",
      icon: "refresh",
      disabled: loadingMore,
      onClick: () => void load(data.items.length, true),
    } : undefined,
    items: data.items.map((item) => ({
      key: item.id,
      title: item.title,
      description: [
        item.body,
        notificationSourceLabel(item),
        `${item.actor?.name ? `${item.actor.name} · ` : ""}${formatTime(item.createdAt)}`,
      ].filter(Boolean).join(" · "),
      unread: !item.readAt,
      badges: [
        ...(item.isImportant ? [{ key: "important", label: "重要", tone: "warning" as const }] : []),
        { key: "status", label: statusLabel(item), tone: statusTone(item) },
      ],
      tone: selectedItem?.id === item.id ? "success" as const : item.readAt ? "muted" as const : "default" as const,
      onClick: () => {
        setSelectedId(item.id);
        setMobileDetailActive(true);
        void markRead(item);
      },
    })),
  });

  const detail = selectedItem
    ? createPanelSection("notification-detail", {
        title: selectedItem.title,
        actions: [
          ...(selectedItem.href ? [{
            key: "open",
            label: selectedItem.type.startsWith("work.project.member.") ? "查看项目" : "打开",
            icon: "open" as const,
            onClick: () => window.location.assign(workspacePath(selectedItem.href!)),
          }] : []),
          ...(pending ? selectedItem.responseMode === "acknowledge"
            ? [{
                key: "acknowledge",
                label: "确认收到",
                icon: "check" as const,
                variant: "primary" as const,
                disabled: busyId === selectedItem.id,
                onClick: () => void updateNotification(selectedItem, "acknowledge"),
              }]
            : [
                { key: "acknowledge", label: "接受", icon: "check" as const, variant: "primary" as const, disabled: busyId === selectedItem.id, onClick: () => void updateNotification(selectedItem, "acknowledge") },
                { key: "reject", label: "拒绝", icon: "x" as const, variant: "danger" as const, disabled: busyId === selectedItem.id, onClick: () => void updateNotification(selectedItem, "reject") },
              ]
            : [{ key: "clear", label: "清除", icon: "delete-bin" as const, variant: "secondary" as const, disabled: busyId === selectedItem.id, onClick: () => void updateNotification(selectedItem, "clear") }]),
        ],
        sections: [
          createMessageSection("notification-meta", {
            content: [statusLabel(selectedItem), selectedItem.isImportant ? "重要" : "", notificationSourceLabel(selectedItem), formatTime(selectedItem.createdAt)].filter(Boolean).join(" · "),
            tone: selectedItem.isImportant ? "warning" : "muted",
          }),
          ...(selectedItem.recipientReason ? [createMessageSection("notification-reason", { content: `为什么收到：${selectedItem.recipientReason}`, tone: "muted" })] : []),
          createMessageSection("notification-body", { content: selectedItem.body, tone: "default" }),
        ],
      })
    : createMessageSection("notification-empty", { content: "选择一条消息查看详情", tone: "muted" });

  return (
    <PageSurface
      kind="standard"
      tabbar={navigation}
      toolbar={{ items: toolbarItems }}
      body={createMasterDetailBody({
        master: { label: "收件箱", body: createPageBody([list]) },
        detail: createPageBody([detail]),
        desktop: { ratio: [3, 7] },
        mobile: { detailActive: mobileDetailActive, onNavigateToList: () => setMobileDetailActive(false) },
      })}
    />
  );
}

function notificationSourceLabel(item: NotificationItem) {
  if (typeof item.source === "string") return item.source;
  return item.source?.label || item.source?.kind || "";
}

function isPending(item: NotificationItem) {
  return (item.responseMode === "acknowledge" || item.requiresAcknowledgement) && !item.acknowledgedAt && !item.rejectedAt;
}

function statusLabel(item: NotificationItem) {
  if (item.rejectedAt) return "已拒绝";
  if (item.acknowledgedAt) return item.responseMode === "acknowledge" ? "已确认" : "已接受";
  if (isPending(item)) return item.responseMode === "acknowledge" ? "待确认" : "待处理";
  return item.readAt ? "已读" : "未读";
}

function statusTone(item: NotificationItem) {
  if (item.rejectedAt) return "warning" as const;
  if (item.acknowledgedAt) return "success" as const;
  if (isPending(item)) return "warning" as const;
  return item.readAt ? "muted" as const : "default" as const;
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
