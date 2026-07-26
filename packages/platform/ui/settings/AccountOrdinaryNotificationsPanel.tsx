"use client";

import { useCallback, useEffect, useState } from "react";
import { workspacePath } from "@workspace/core/routing";
import {
  createMasterDetailBody,
  createListSection,
  createMessageSection,
  createPageBody,
  createPanelSection,
  PageSurface,
  type PageSurfaceTabBarSpec,
  type SurfaceToolbarItems,
  useFeedback,
} from "@workspace/core/ui";
import type { WorkflowInboxPerspective } from "./AccountWorkflowNotificationsModel";

type NotificationItem = {
  id: number;
  type: string;
  title: string;
  body: string;
  href: string | null;
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
  unreadCount: number;
  tabCounts?: { ordinary: number; workflowTodo: number; workflowMine: number };
};

const PAGE_SIZE = 20;

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
  const [data, setData] = useState<NotificationResponse>({ items: [], total: 0, unreadCount: 0 });
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [clearing, setClearing] = useState(false);
  const [markingRead, setMarkingRead] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(workspacePath(`/api/settings/account/notifications?limit=${PAGE_SIZE}&category=ordinary`));
      if (!res.ok) throw new Error("加载通知失败");
      const next = await res.json() as NotificationResponse;
      setData(next);
      setSelectedId((current) => next.items.some((item) => item.id === current) ? current : next.items[0]?.id ?? null);
      if (next.tabCounts) onTabCountsChange?.(next.tabCounts);
    } catch (error) {
      feedback.error(error instanceof Error ? error.message : "加载通知失败");
    }
  }, [feedback, onTabCountsChange]);

  useEffect(() => { void load(); }, [load]);

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
      feedback.success(action === "reject" ? "已拒绝项目邀请" : action === "acknowledge" ? "已接受项目邀请" : "通知已清除");
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
    await fetch(workspacePath(`/api/settings/account/notifications/${item.id}`), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "read" }),
    }).catch(() => load());
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
    empty: { content: "暂无通知", compact: true },
    items: data.items.map((item) => ({
      key: item.id,
      title: item.title,
      description: [
        item.body,
        `${item.actor?.name ? `${item.actor.name} · ` : ""}${formatTime(item.createdAt)}`,
      ].filter(Boolean).join(" · "),
      unread: !item.readAt,
      badges: [{ key: "status", label: statusLabel(item), tone: statusTone(item) }],
      tone: selectedItem?.id === item.id ? "success" as const : item.readAt ? "muted" as const : "default" as const,
      onClick: () => {
        setSelectedId(item.id);
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
          ...(pending ? [
            { key: "acknowledge", label: "接受", icon: "check" as const, variant: "primary" as const, disabled: busyId === selectedItem.id, onClick: () => void updateNotification(selectedItem, "acknowledge") },
            { key: "reject", label: "拒绝", icon: "x" as const, variant: "danger" as const, disabled: busyId === selectedItem.id, onClick: () => void updateNotification(selectedItem, "reject") },
          ] : [{ key: "clear", label: "清除", icon: "delete-bin" as const, variant: "secondary" as const, disabled: busyId === selectedItem.id, onClick: () => void updateNotification(selectedItem, "clear") }]),
        ],
        sections: [
          createMessageSection("notification-meta", { content: `${statusLabel(selectedItem)} · ${formatTime(selectedItem.createdAt)}`, tone: "muted" }),
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
      })}
    />
  );
}

function isPending(item: NotificationItem) {
  return item.requiresAcknowledgement && !item.acknowledgedAt && !item.rejectedAt;
}

function statusLabel(item: NotificationItem) {
  if (item.rejectedAt) return "已拒绝";
  if (item.acknowledgedAt) return "已接受";
  if (isPending(item)) return "待处理";
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
