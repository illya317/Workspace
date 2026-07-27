"use client";

import { useCallback, useEffect, useState } from "react";

import { workspacePath } from "@workspace/core/routing";
import {
  createListSection,
  createMessageSection,
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
  audienceMode: "assigned" | "governance_required" | "optional";
  subscriptionMode: "required" | "optional";
  ownerResourceKey: string | null;
  ownerResourceLabel: string | null;
  supportedChannels: string[];
  details: string[];
  selectedEnabled: boolean;
  effectiveEnabled: boolean;
  eligible: boolean;
  canConfigure: boolean;
  statusLabel: string;
  channel: string;
  cadence: string;
};

type CatalogResponse = { items: NotificationCatalogItem[] };

const GROUP_ORDER = ["work", "workflow", "business", "security"] as const;

function statusTone(item: NotificationCatalogItem) {
  if (!item.eligible) return "warning" as const;
  if (item.effectiveEnabled) return "success" as const;
  return "muted" as const;
}

function deliveryLabel(item: NotificationCatalogItem) {
  if (item.channel === "workspace" && item.cadence === "immediate") return "站内 · 即时";
  return `${item.channel} · ${item.cadence}`;
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

  const sections: BodySurfaceSectionSpec[] = [
    createMessageSection("subscription-intro", {
      content: "可选提醒按你当前拥有的业务资料读取权限开放；流程、协作和安全治理职责通知不能关闭。",
      tone: "muted",
    }),
    ...GROUP_ORDER.flatMap((groupKey) => {
      const groupItems = items.filter((item) => item.groupKey === groupKey);
      if (groupItems.length === 0) return [];
      const section = createListSection(`notification-subscription-${groupKey}`, {
        presentation: "cards",
        density: "compact",
        items: groupItems.map((item) => ({
          key: item.type,
          title: item.label,
          description: [
            item.triggerDescription,
            item.recipientDescription,
            item.details.length ? `包含：${item.details.join("；")}` : null,
            item.ownerResourceLabel ? `权限依据：${item.ownerResourceLabel} · read` : null,
          ].filter(Boolean).join(" · "),
          badges: [
            { key: "status", label: item.statusLabel, tone: statusTone(item) },
            { key: "delivery", label: deliveryLabel(item), tone: "default" },
          ],
          tone: item.effectiveEnabled ? "success" : item.eligible ? "default" : "muted",
          actions: [{
            key: `subscription-${item.type}`,
            label: item.subscriptionMode === "required"
              ? item.statusLabel
              : item.selectedEnabled ? "取消订阅" : "订阅",
            disabled: item.subscriptionMode === "required" || !item.canConfigure || busyEventKey !== null,
            variant: item.subscriptionMode === "optional" && !item.selectedEnabled ? "primary" : "secondary",
            onClick: () => void setSubscription(item),
          }],
        })),
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
