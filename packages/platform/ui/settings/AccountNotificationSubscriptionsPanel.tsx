"use client";

import { useCallback, useEffect, useState } from "react";

import { workspacePath } from "@workspace/core/routing";
import {
  createListSection,
  createPageBody,
  PageSurface,
  type BodySurfaceSectionSpec,
  type PageSurfaceTabBarSpec,
  useFeedback,
} from "@workspace/core/ui";

type NotificationCatalogItem = {
  type: string;
  label: string;
  description: string;
  groupKey: "work" | "workflow" | "business" | "security";
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

const GROUP_ORDER = ["work", "workflow", "business", "security"] as const;

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

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(workspacePath("/api/modules/settings/account/notification-subscriptions"));
      const result = await response.json().catch(() => ({})) as CatalogResponse & { error?: string };
      if (!response.ok) throw new Error(result.error || "加载通知订阅失败");
      setItems(result.items ?? []);
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

  const subscriptionCard = (item: NotificationCatalogItem) => ({
    key: item.type,
    title: item.label,
    badges: [
      { key: "status", label: item.statusLabel, tone: statusTone(item) },
      { key: "producer", label: producerLabel(item), tone: item.producerAvailable ? "default" as const : "warning" as const },
      { key: "delivery", label: deliveryLabel(item), tone: "default" as const },
    ],
    tone: item.effectiveEnabled ? "success" as const : item.eligible ? "default" as const : "muted" as const,
    actions: [{
      key: `subscription-${item.type}`,
      label: item.subscriptionMode === "required"
        ? item.statusLabel
        : item.selectedEnabled ? "取消订阅" : "订阅",
      icon: item.subscriptionMode === "required" ? "check" as const : item.selectedEnabled ? "cancel" as const : "add" as const,
      disabled: item.subscriptionMode === "required" || !item.canConfigure || busyEventKey !== null,
      variant: item.subscriptionMode === "optional" && !item.selectedEnabled ? "primary" as const : "secondary" as const,
      onClick: () => void setSubscription(item),
    }],
  });
  const subscribableItems = sortBySubscriptionPriority(items.filter((item) => subscriptionPriority(item) === 0));
  const remainingItems = items.filter((item) => subscriptionPriority(item) !== 0);
  const sections: BodySurfaceSectionSpec[] = [
    ...(subscribableItems.length > 0 ? [{
      ...createListSection("notification-subscription-available", {
        presentation: "cards",
        density: "compact",
        items: subscribableItems.map((item) => subscriptionCard(item)),
      }),
      header: { title: "可订阅" },
    }] : []),
    ...GROUP_ORDER.flatMap((groupKey) => {
      const groupItems = sortBySubscriptionPriority(remainingItems.filter((item) => item.groupKey === groupKey));
      if (groupItems.length === 0) return [];
      const section = createListSection(`notification-subscription-${groupKey}`, {
        presentation: "cards",
        density: "compact",
        items: groupItems.map((item) => subscriptionCard(item)),
      });
      return [{ ...section, header: { title: groupItems[0]!.groupLabel } }];
    }),
  ];

  return (
    <PageSurface
      kind="standard"
      tabbar={navigation}
      toolbar={{ items: [{ kind: "action-group", key: "subscription-actions", actions: [{ key: "refresh", kind: "refresh", label: "刷新", disabled: loading, onClick: () => void load() }] }] }}
      body={createPageBody(sections)}
    />
  );
}
