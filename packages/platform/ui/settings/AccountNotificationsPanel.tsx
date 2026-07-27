"use client";

import { useCallback, useEffect, useRef, useState, type ComponentType } from "react";
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
import { getWorkflowFlowTypeLabel, getWorkflowStatusView, type WorkflowFlowType, type WorkflowStatus } from "../WorkflowStatusBadge";
import AccountOrdinaryNotificationsPanel from "./AccountOrdinaryNotificationsPanel";
import {
  groupWorkflowItems,
  workflowPerspectiveCountText,
  workflowPerspectiveEmptyText,
  type WorkflowCategoryDto,
  type WorkflowInboxPerspective,
} from "./AccountWorkflowNotificationsModel";

export type AccountNotificationTabCounts = {
  ordinary: number;
  workflowTodo: number;
  workflowMine: number;
};
export type NotificationWorkflow = {
  requestId: number | null;
  flowType: WorkflowFlowType;
  status: WorkflowStatus;
  role: "todo" | "originated" | "watching";
  title: string;
  summary: string;
  href: string | null;
  eventType: string | null;
  businessActionKey: string | null;
  categoryKey: string | null;
  categoryLabel: string | null;
  resourceKey: string | null;
  scopeId: string | null;
};
export type NotificationItem = {
  id: number;
  type: string;
  category: "ordinary" | "workflow";
  workflow: NotificationWorkflow | null;
  title: string;
  body: string;
  href: string | null;
  recipientReason: string | null;
  resourceKey: string | null;
  scopeId: string | null;
  isImportant: boolean;
  requiresAcknowledgement: boolean;
  readAt: string | null;
  acknowledgedAt: string | null;
  rejectedAt: string | null;
  createdAt: string;
  actor: { name: string } | null;
};
export type AccountWorkflowDetailRendererProps = {
  item: NotificationItem;
  currentUserId: number;
  onChanged: () => void;
  onBack: () => void;
};
export type AccountWorkflowDetailRenderer = ComponentType<AccountWorkflowDetailRendererProps> & {
  supports?: (item: NotificationItem) => boolean;
};
type NotificationResponse = {
  items: NotificationItem[];
  total: number;
  hasMore: boolean;
  unreadCount: number;
  pendingCount: number;
  tabCounts?: AccountNotificationTabCounts;
  workflowCategories?: WorkflowCategoryDto[];
};

const PAGE_SIZE = 20;
const RECENT_TIME_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const WEEKDAY_LABELS = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"] as const;

function formatClock(date: Date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function formatNotificationTime(value: string) {
  const date = new Date(value);
  const timestamp = date.getTime();
  if (Number.isNaN(timestamp)) return "";
  const now = new Date();
  const diff = now.getTime() - timestamp;
  const clock = formatClock(date);
  if (diff >= 0 && diff < RECENT_TIME_WINDOW_MS) return `${WEEKDAY_LABELS[date.getDay()]} ${clock}`;
  if (date.getFullYear() === now.getFullYear()) return `${date.getMonth() + 1}-${date.getDate()} ${clock}`;
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()} ${clock}`;
}

function emptyNotificationResponse(): NotificationResponse {
  return { items: [], total: 0, hasMore: false, unreadCount: 0, pendingCount: 0 };
}

function workflowQuery(perspective: WorkflowInboxPerspective, offset?: number) {
  const query = new URLSearchParams();
  if (offset !== undefined) query.set("offset", String(offset));
  query.set("limit", String(PAGE_SIZE));
  query.set("category", "workflow");
  query.set("filter", perspective === "received" ? "todo" : "originated");
  return query;
}

function workflowTodoActionQuery() {
  const query = new URLSearchParams();
  query.set("category", "workflow");
  query.set("filter", "todo");
  return query;
}

function mergeNotificationItems(current: NotificationItem[], next: NotificationItem[]) {
  const seen = new Set<number>();
  const merged: NotificationItem[] = [];
  for (const item of [...current, ...next]) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    merged.push(item);
  }
  return merged;
}

interface AccountNotificationsPanelProps {
  navigation: PageSurfaceTabBarSpec;
  currentUserId: number;
  onTabCountsChange?: (counts: AccountNotificationTabCounts) => void;
  workflowDetailRenderer?: AccountWorkflowDetailRenderer;
}

export default function AccountNotificationsPanel({
  navigation,
  currentUserId,
  onTabCountsChange,
  workflowDetailRenderer,
}: AccountNotificationsPanelProps) {
  const [mode, setMode] = useState<"ordinary" | "workflow">("ordinary");
  const [workflowPerspective, setWorkflowPerspective] = useState<WorkflowInboxPerspective>("received");
  if (mode === "ordinary") {
    return (
      <AccountOrdinaryNotificationsPanel
        navigation={navigation}
        onShowWorkflow={(perspective) => {
          setWorkflowPerspective(perspective);
          setMode("workflow");
        }}
        onTabCountsChange={onTabCountsChange}
      />
    );
  }
  return (
    <WorkflowNotificationsPanel
      navigation={navigation}
      currentUserId={currentUserId}
      perspective={workflowPerspective}
      onPerspectiveChange={setWorkflowPerspective}
      onShowOrdinary={() => setMode("ordinary")}
      onTabCountsChange={onTabCountsChange}
      workflowDetailRenderer={workflowDetailRenderer}
    />
  );
}

function WorkflowNotificationsPanel({
  navigation,
  currentUserId,
  onShowOrdinary,
  onTabCountsChange,
  workflowDetailRenderer: WorkflowDetailRenderer,
  perspective,
  onPerspectiveChange,
}: AccountNotificationsPanelProps & {
  onShowOrdinary: () => void;
  perspective: WorkflowInboxPerspective;
  onPerspectiveChange: (perspective: WorkflowInboxPerspective) => void;
}) {
  const [data, setData] = useState<NotificationResponse>(emptyNotificationResponse());
  const [selectedCategoryKey, setSelectedCategoryKey] = useState<string | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const selectedCategoryKeyRef = useRef<string | null>(null);
  const [clearing, setClearing] = useState(false);
  const [clearingItemId, setClearingItemId] = useState<number | null>(null);
  const [markingRead, setMarkingRead] = useState(false);
  const feedback = useFeedback();

  useEffect(() => {
    selectedCategoryKeyRef.current = selectedCategoryKey;
  }, [selectedCategoryKey]);

  const load = useCallback(async (offset = 0, append = false) => {
    try {
      const res = await fetch(workspacePath(`/api/settings/account/notifications?${workflowQuery(perspective, offset).toString()}`));
      if (!res.ok) return;
      const next = (await res.json()) as NotificationResponse;
      if (next.tabCounts) onTabCountsChange?.(next.tabCounts);
      if (append) {
        setData((current) => ({ ...next, items: mergeNotificationItems(current.items, next.items) }));
      } else {
        setData(next);
        const nextGroups = groupWorkflowItems(next.items, next.workflowCategories ?? []);
        const currentCategoryKey = selectedCategoryKeyRef.current;
        const nextCategoryKey = nextGroups.some((group) => group.key === currentCategoryKey)
          ? currentCategoryKey
          : nextGroups[0]?.key ?? null;
        setSelectedCategoryKey(nextCategoryKey);
        const nextSelectedGroup = nextGroups.find((group) => group.key === nextCategoryKey) ?? nextGroups[0] ?? null;
        setSelectedItemId((current) => (
          nextSelectedGroup?.items.some((item) => item.id === current)
            ? current
            : nextSelectedGroup?.items[0]?.id ?? null
        ));
        setDetailOpen((current) => current && Boolean(nextSelectedGroup?.items.length));
      }
    } catch {
      // Keep current state.
    }
  }, [onTabCountsChange, perspective]);

  useEffect(() => {
    void load(0);
  }, [load]);

  async function markNotificationRead(item: NotificationItem) {
    if (item.readAt) return;
    setData((current) => ({
      ...current,
      unreadCount: Math.max(0, current.unreadCount - 1),
      items: current.items.map((entry) => entry.id === item.id ? { ...entry, readAt: new Date().toISOString() } : entry),
    }));
    await fetch(workspacePath(`/api/settings/account/notifications/${item.id}`), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "read" })
    }).catch(() => load(0));
  }

  async function clearNotifications() {
    setClearing(true);
    try {
      await fetch(workspacePath(`/api/settings/account/notifications?${workflowTodoActionQuery().toString()}`), { method: "DELETE" });
      await load(0);
    } finally {
      setClearing(false);
    }
  }

  async function clearWorkflowItem(item: NotificationItem) {
    setClearingItemId(item.id);
    try {
      const res = await fetch(workspacePath(`/api/settings/account/notifications/${item.id}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "clear" }),
      });
      const result = await res.json().catch(() => ({})) as { error?: string };
      if (!res.ok) throw new Error(result.error || "删除通知失败");
      feedback.success("通知已删除");
      await load(0);
    } catch (error) {
      feedback.error(error instanceof Error ? error.message : "删除通知失败");
    } finally {
      setClearingItemId(null);
    }
  }

  async function markAllRead() {
    setMarkingRead(true);
    try {
      await fetch(workspacePath(`/api/settings/account/notifications?${workflowTodoActionQuery().toString()}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "markAllRead" })
      });
      await load(0);
    } finally {
      setMarkingRead(false);
    }
  }

  function itemTitle(item: NotificationItem) {
    return item.workflow?.title ?? item.title;
  }

  function itemDescription(item: NotificationItem) {
    return item.workflow?.summary ?? item.body;
  }

  function itemMeta(item: NotificationItem) {
    const actor = item.actor ? `${item.actor.name} · ` : "";
    if (!item.workflow) return `${actor}${formatNotificationTime(item.createdAt)}`;
    return `${actor}${getWorkflowFlowTypeLabel(item.workflow.flowType)} · ${formatNotificationTime(item.createdAt)}`;
  }

  const activeUnreadCount = data.items.filter((item) => !item.readAt).length;
  const toolbarItems: SurfaceToolbarItems = [
    {
      kind: "option-group",
      key: "inbox-mode",
      ariaLabel: "收件箱分类",
      presentation: "segmented",
      value: perspective,
      options: [
        { value: "ordinary", label: data.tabCounts?.ordinary ? `通知 ${data.tabCounts.ordinary}` : "通知" },
        { value: "received", label: data.tabCounts?.workflowTodo ? `我收到的 ${data.tabCounts.workflowTodo}` : "我收到的" },
        { value: "originated", label: data.tabCounts?.workflowMine ? `我发起的 ${data.tabCounts.workflowMine}` : "我发起的" },
      ],
      onChange: (value) => {
        if (value === "ordinary") onShowOrdinary();
        if (value === "received" || value === "originated") onPerspectiveChange(value);
      },
    },
    {
      kind: "action-group",
      key: "notification-actions",
      actions: [
        {
          key: "refresh",
          kind: "refresh",
          label: "刷新",
          onClick: () => void load(0),
        },
        ...(perspective === "received" ? [{
          key: "mark-read",
          kind: "double-check" as const,
          label: "全部已读",
          disabled: markingRead || activeUnreadCount === 0,
          onClick: () => void markAllRead(),
        },
        {
          key: "clear-read",
          kind: "delete-bin" as const,
          label: "清空已读",
          variant: "danger" as const,
          disabled: clearing || data.total === 0,
          onClick: () => void clearNotifications(),
        }] : []),
      ],
    },
  ];
  const groupedItems = groupWorkflowItems(data.items, data.workflowCategories ?? []);
  const selectedGroup = groupedItems.find((group) => group.key === selectedCategoryKey) ?? groupedItems[0] ?? null;
  const selectedItem = selectedGroup?.items.find((item) => item.id === selectedItemId) ?? selectedGroup?.items[0] ?? null;
  const workflowDetailContent = perspective === "received" && detailOpen && selectedItem && WorkflowDetailRenderer
    && (WorkflowDetailRenderer.supports?.(selectedItem) ?? true)
    ? <WorkflowDetailRenderer item={selectedItem} currentUserId={currentUserId} onChanged={() => void load(0)} onBack={() => setDetailOpen(false)} />
    : null;
  function openBusinessItem(item: NotificationItem) {
    const href = item.workflow?.href ?? item.href;
    if (href) window.location.assign(workspacePath(href));
  }
  function selectWorkflowItem(item: NotificationItem) {
    setSelectedItemId(item.id);
    const canRenderInline = perspective === "received"
      && Boolean(WorkflowDetailRenderer)
      && (WorkflowDetailRenderer?.supports?.(item) ?? true);
    setDetailOpen(canRenderInline);
    if (perspective === "received") void markNotificationRead(item);
    if (!canRenderInline) openBusinessItem(item);
  }
  const emptyText = workflowPerspectiveEmptyText(perspective);
  const leftSections = groupedItems.length > 0
    ? [createListSection("workflow-category-list", {
      presentation: "cards",
      density: "compact",
      empty: { content: emptyText, compact: true },
      items: groupedItems.map((group) => ({
        key: group.key,
        title: group.label,
        description: workflowPerspectiveCountText(perspective, group.items.length),
        unread: perspective === "received" && group.items.some((item) => !item.readAt),
        badges: [{ key: "count", label: String(group.items.length), tone: group.key === selectedGroup?.key ? "success" : "muted" }],
        tone: group.key === selectedGroup?.key ? "success" : "default",
        onClick: () => {
          setSelectedCategoryKey(group.key);
          setSelectedItemId(group.items[0]?.id ?? null);
          setDetailOpen(false);
        },
      })),
    })]
    : [createMessageSection("notification-list-empty", { content: emptyText, tone: "muted" })];
  const rightSections = selectedGroup
    ? workflowDetailContent
      ? [createMessageSection(`workflow-detail-${selectedItem.id}`, {
          content: workflowDetailContent,
          presentation: "plain",
        })]
      : [createPanelSection(`workflow-items-${selectedGroup.key}`, {
      title: selectedGroup.label,
      sections: [createListSection(`workflow-item-list-${selectedGroup.key}`, {
          presentation: "cards",
          density: "compact",
          empty: { content: emptyText, compact: true },
          items: selectedGroup.items.map((item) => {
            const status = getWorkflowStatusView(item.workflow?.status ?? "failed", item.workflow?.flowType ?? "approval");
            return {
              key: item.id,
              title: itemTitle(item),
              description: [itemDescription(item), itemMeta(item)].filter(Boolean).join(" · "),
              unread: perspective === "received" && !item.readAt,
              badges: [{ key: "status", label: status.label, tone: status.tone }],
              actions: item.id > 0 ? [{
                key: "delete-notification",
                label: "删除",
                icon: "delete-bin" as const,
                variant: "danger" as const,
                disabled: clearingItemId === item.id,
                onClick: () => void clearWorkflowItem(item),
              }] : [],
              tone: item.id === selectedItem?.id ? "success" as const : item.readAt ? "muted" as const : "default" as const,
              onClick: () => selectWorkflowItem(item),
            };
          }),
        })],
      })]
    : [createMessageSection("notification-empty", {
        content: perspective === "received" ? "选择左侧分类查看收到的流程" : "选择左侧分类查看发起记录",
        tone: "muted",
      })];
  const body = createMasterDetailBody({
    master: { label: "收件箱", body: createPageBody(leftSections) },
    detail: createPageBody(rightSections),
    desktop: { ratio: [2, 8] },
  });
  return (
    <PageSurface
      kind="standard"
      tabbar={navigation}
      toolbar={{ items: toolbarItems }}
      body={body}
    />
  );
}
