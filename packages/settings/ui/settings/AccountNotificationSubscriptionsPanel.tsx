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
  type BodySurfaceSectionSpec,
  type PageSurfaceTabBarSpec,
  useFeedback,
} from "@workspace/core/ui";

type NotificationCatalogItem = {
  type: string;
  label: string;
  description: string;
  groupKey: string;
  groupLabel: string;
  triggerDescription: string;
  recipientDescription: string;
  producerMode: "event" | "scheduled" | "scheduled_and_event";
  producerAvailable: boolean;
  audienceMode: "assigned" | "governance_required" | "optional";
  subscriptionMode: "required" | "optional";
  ownerResourceKey: string | null;
  ownerResourceLabel: string | null;
  supportedChannels: string[];
  availableChannels: string[];
  details: string[];
  selectedEnabled: boolean;
  effectiveEnabled: boolean;
  eligible: boolean;
  deliveryAvailable: boolean;
  runtimeAvailable: boolean;
  canConfigure: boolean;
  statusLabel: string;
  channel: string;
  cadence: string;
};

type CatalogResponse = { items: NotificationCatalogItem[] };

const GROUP_ORDER: string[] = ["work", "workflow", "business", "security"];

function subscriptionPriority(item: NotificationCatalogItem) {
  if (item.subscriptionMode === "optional" && item.canConfigure && !item.selectedEnabled) return 0;
  if (item.subscriptionMode === "optional" && item.canConfigure && item.selectedEnabled) return 1;
  if (item.subscriptionMode === "required") return 2;
  return 3;
}

function sortBySubscriptionPriority(items: NotificationCatalogItem[]) {
  return items
    .map((item, index) => ({ item, index }))
    .sort((left, right) => subscriptionPriority(left.item) - subscriptionPriority(right.item) || left.index - right.index)
    .map(({ item }) => item);
}

function statusTone(item: NotificationCatalogItem) {
  if (!item.runtimeAvailable || !item.eligible) return "warning" as const;
  if (item.effectiveEnabled) return "success" as const;
  return "muted" as const;
}

function deliveryLabel(item: NotificationCatalogItem) {
  if (!item.deliveryAvailable) return "无可用发送渠道";
  if (item.channel === "workspace" && item.cadence === "immediate") return "站内";
  return `${item.channel} · ${item.cadence}`;
}

function producerLabel(item: NotificationCatalogItem) {
  if (!item.producerAvailable) return "自动触发未运行";
  if (item.producerMode === "scheduled_and_event") return "定时 + 事件";
  if (item.producerMode === "scheduled") return "定时";
  return "事件";
}

export default function AccountNotificationSubscriptionsPanel({
  navigation,
}: {
  navigation: PageSurfaceTabBarSpec;
}) {
  const feedback = useFeedback();
  const [items, setItems] = useState<NotificationCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyEventKey, setBusyEventKey] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [mobileDetailActive, setMobileDetailActive] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(workspacePath("/api/modules/settings/account/notification-subscriptions"));
      const result = await response.json().catch(() => ({})) as CatalogResponse & { error?: string };
      if (!response.ok) throw new Error(result.error || "加载通知订阅失败");
      const nextItems = result.items ?? [];
      setItems(nextItems);
      setSelectedType((current) => nextItems.some((item) => item.type === current)
        ? current
        : nextItems[0]?.type ?? null);
    } catch (error) {
      feedback.error(error instanceof Error ? error.message : "加载通知订阅失败");
    } finally {
      setLoading(false);
    }
  }, [feedback]);

  useEffect(() => { void load(); }, [load]);

  async function setSubscription(item: NotificationCatalogItem) {
    if (!item.canConfigure || busyEventKey) return;
    const enabled = !item.selectedEnabled;
    setBusyEventKey(item.type);
    try {
      const response = await fetch(workspacePath(`/api/modules/settings/account/notification-subscriptions/${encodeURIComponent(item.type)}`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(result.error || "设置通知订阅失败");
      feedback.success(enabled ? "已订阅通知" : "已取消订阅");
      await load();
    } catch (error) {
      feedback.error(error instanceof Error ? error.message : "设置通知订阅失败");
    } finally {
      setBusyEventKey(null);
    }
  }

  const subscribableItems = sortBySubscriptionPriority(items.filter((item) => subscriptionPriority(item) === 0));
  const remainingItems = items.filter((item) => subscriptionPriority(item) !== 0);
  const customGroupKeys = [...new Set(remainingItems.map((item) => item.groupKey))]
    .filter((groupKey) => !GROUP_ORDER.includes(groupKey));
  const orderedGroupKeys = [...GROUP_ORDER, ...customGroupKeys];
  const groups = [
    ...(subscribableItems.length > 0 ? [{
      key: "available",
      label: "可订阅",
      items: subscribableItems,
    }] : []),
    ...orderedGroupKeys.flatMap((groupKey) => {
      const groupItems = sortBySubscriptionPriority(
        remainingItems.filter((item) => item.groupKey === groupKey),
      );
      if (groupItems.length === 0) return [];
      return [{ key: groupKey, label: groupItems[0]!.groupLabel, items: groupItems }];
    }),
  ];
  const selectedItem = items.find((item) => item.type === selectedType) ?? groups[0]?.items[0] ?? null;
  const sections: BodySurfaceSectionSpec[] = groups.length > 0
    ? groups.map((group) => ({
      ...createListSection(`notification-subscription-${group.key}`, {
        presentation: "cards",
        density: "compact",
        items: group.items.map((item) => ({
          key: item.type,
          title: item.label,
          description: [item.description, deliveryLabel(item)].filter(Boolean).join(" · "),
          badges: [{ key: "status", label: item.statusLabel, tone: statusTone(item) }],
          tone: selectedItem?.type === item.type
            ? "success" as const
            : item.eligible ? "default" as const : "muted" as const,
          onClick: () => {
            setSelectedType(item.type);
            setMobileDetailActive(true);
          },
        })),
      }),
      header: { title: group.label },
    }))
    : [createListSection("notification-subscription-empty", {
      presentation: "cards",
      density: "compact",
      empty: { content: loading ? "正在加载通知订阅…" : "暂无可用通知订阅", compact: true },
      items: [],
    })];
  const detail = selectedItem
    ? createPanelSection("notification-subscription-detail", {
        title: selectedItem.label,
        actions: [{
          key: `subscription-${selectedItem.type}`,
          label: selectedItem.subscriptionMode === "required"
            ? selectedItem.statusLabel
            : selectedItem.selectedEnabled ? "取消订阅" : "订阅",
          icon: selectedItem.subscriptionMode === "required"
            ? "check"
            : selectedItem.selectedEnabled ? "cancel" : "add",
          disabled: selectedItem.subscriptionMode === "required" || !selectedItem.canConfigure || busyEventKey !== null,
          variant: selectedItem.subscriptionMode === "optional" && !selectedItem.selectedEnabled ? "primary" : "secondary",
          onClick: () => void setSubscription(selectedItem),
        }],
        sections: [
          createMessageSection("notification-subscription-status", {
            content: `${selectedItem.statusLabel} · ${producerLabel(selectedItem)} · ${deliveryLabel(selectedItem)}`,
            tone: statusTone(selectedItem),
          }),
          createMessageSection("notification-subscription-description", {
            content: selectedItem.description,
          }),
          createMessageSection("notification-subscription-trigger", {
            content: `触发条件：${selectedItem.triggerDescription}`,
            tone: "muted",
          }),
          createMessageSection("notification-subscription-recipient", {
            content: `接收规则：${selectedItem.recipientDescription}`,
            tone: "muted",
          }),
          ...(selectedItem.ownerResourceLabel || selectedItem.ownerResourceKey ? [
            createMessageSection("notification-subscription-owner", {
              content: `负责资源：${selectedItem.ownerResourceLabel || selectedItem.ownerResourceKey}`,
              tone: "muted",
            }),
          ] : []),
          ...(selectedItem.supportedChannels.length > 0 ? [
            createMessageSection("notification-subscription-channels", {
              content: `支持渠道：${selectedItem.supportedChannels.join("、")} · 当前可用：${selectedItem.availableChannels.join("、") || "无"}`,
              tone: "muted",
            }),
          ] : []),
          ...(selectedItem.details.length > 0 ? [
            createMessageSection("notification-subscription-details", {
              content: selectedItem.details.join(" · "),
              tone: "muted",
            }),
          ] : []),
        ],
      })
    : createMessageSection("notification-subscription-detail-empty", {
        content: loading ? "正在加载通知订阅…" : "从左侧选择一项通知查看详情",
        tone: "muted",
      });

  return (
    <PageSurface
      kind="standard"
      tabbar={navigation}
      toolbar={{ items: [{ kind: "action-group", key: "subscription-actions", actions: [{ key: "refresh", kind: "refresh", label: "刷新", disabled: loading, onClick: () => void load() }] }] }}
      body={createMasterDetailBody({
        master: { label: "通知与订阅", body: createPageBody(sections) },
        detail: createPageBody([detail]),
        desktop: { ratio: [3, 7] },
        mobile: { detailActive: mobileDetailActive, onNavigateToList: () => setMobileDetailActive(false) },
      })}
    />
  );
}
