import "server-only";

import { getResourceDef } from "@workspace/platform/resources";

import { authorize } from "./auth";
import { failCommand, okCommand, type DomainValidationResult } from "./domain-validation";
import {
  listRegisteredNotificationTypes,
  type RegisteredNotificationType,
} from "./notifications";
import { prisma } from "./prisma";

const WORKSPACE_CHANNEL = "workspace" as const;
const IMMEDIATE_CADENCE = "immediate" as const;

type NotificationCatalogDefinition = ReturnType<typeof listRegisteredNotificationTypes>[number];

export type NotificationSubscriptionCommand = {
  mode: "override" | "reset";
  userId: number;
  eventKey: RegisteredNotificationType;
  enabled?: boolean;
  channel: typeof WORKSPACE_CHANNEL;
  cadence: typeof IMMEDIATE_CADENCE;
};

function findCatalogDefinition(eventKey: string) {
  return listRegisteredNotificationTypes().find((definition) => definition.type === eventKey) ?? null;
}

function catalogStatus(input: {
  definition: NotificationCatalogDefinition;
  runtimeAvailable: boolean;
  eligible: boolean;
  effectiveEnabled: boolean;
}) {
  if (!input.definition.producerAvailable) return "自动触发未运行";
  if (!input.runtimeAvailable) return "无可用发送渠道";
  if (input.definition.audienceMode === "assigned") return "按职责接收";
  if (input.definition.audienceMode === "governance_required") return "按治理责任接收";
  if (!input.eligible) return "缺少读取权限";
  return input.effectiveEnabled ? "已订阅" : "未订阅";
}

async function hasCatalogReadAccess(userId: number, definition: NotificationCatalogDefinition) {
  if (!definition.ownerResourceKey) return false;
  return authorize({ user: userId, resourceKey: definition.ownerResourceKey, action: "read" });
}

export async function listNotificationSubscriptionCatalog(userId: number) {
  const [definitions, overrides] = await Promise.all([
    Promise.resolve(listRegisteredNotificationTypes()),
    prisma.notificationSubscription.findMany({
      where: { userId, channel: WORKSPACE_CHANNEL },
      select: { id: true, eventKey: true, enabled: true, channel: true, cadence: true, updatedAt: true },
    }),
  ]);
  const overrideByEventKey = new Map(overrides.map((override) => [override.eventKey, override]));
  return Promise.all(definitions.map(async (definition) => {
    const override = overrideByEventKey.get(definition.type) ?? null;
    const optional = definition.subscriptionMode === "optional";
    const deliveryAvailable = definition.availableChannels.includes(definition.defaultChannel);
    const runtimeAvailable = definition.producerAvailable && deliveryAvailable;
    const eligible = optional ? await hasCatalogReadAccess(userId, definition) : true;
    const selectedEnabled = optional
      ? override?.enabled ?? definition.defaultEnabled
      : true;
    const effectiveEnabled = optional ? runtimeAvailable && eligible && selectedEnabled : runtimeAvailable;
    const canConfigure = optional && (selectedEnabled || (runtimeAvailable && eligible));
    return {
      ...definition,
      ownerResourceLabel: definition.ownerResourceKey
        ? getResourceDef(definition.ownerResourceKey)?.name ?? definition.ownerResourceKey
        : null,
      configuredEnabled: override?.enabled ?? null,
      selectedEnabled,
      effectiveEnabled,
      eligible,
      deliveryAvailable,
      runtimeAvailable,
      canConfigure,
      statusLabel: catalogStatus({ definition, runtimeAvailable, eligible, effectiveEnabled }),
      channel: override?.channel ?? definition.defaultChannel,
      cadence: override?.cadence ?? definition.defaultCadence,
      updatedAt: override?.updatedAt.toISOString() ?? null,
    };
  }));
}

export async function buildNotificationSubscriptionCommand(input: {
  mode: "override" | "reset";
  userId: number;
  eventKey: string;
  enabled?: boolean;
}): Promise<DomainValidationResult<NotificationSubscriptionCommand>> {
  const definition = findCatalogDefinition(input.eventKey);
  if (!definition) return failCommand("通知类型不存在", 404, "eventKey");
  if (definition.subscriptionMode !== "optional") {
    return failCommand("该通知按职责或治理责任接收，不能由个人关闭", 409, "eventKey");
  }
  if (
    input.mode === "override"
    && input.enabled
    && (!definition.producerAvailable || !definition.availableChannels.includes(definition.defaultChannel))
  ) {
    return failCommand("该通知当前没有运行中的自动触发或可用发送渠道，不能订阅", 409, "eventKey");
  }
  if (input.mode === "override" && typeof input.enabled !== "boolean") {
    return failCommand("订阅状态无效", 400, "enabled");
  }
  if (input.mode === "override" && input.enabled && !await hasCatalogReadAccess(input.userId, definition)) {
    return failCommand("缺少该业务资料的读取权限，不能订阅", 403, "eventKey");
  }
  return okCommand({
    mode: input.mode,
    userId: input.userId,
    eventKey: definition.type,
    ...(input.mode === "override" ? { enabled: input.enabled } : {}),
    channel: WORKSPACE_CHANNEL,
    cadence: IMMEDIATE_CADENCE,
  });
}

export async function commitNotificationSubscriptionCommand(command: NotificationSubscriptionCommand) {
  if (command.mode === "reset") {
    await prisma.notificationSubscription.deleteMany({
      where: { userId: command.userId, eventKey: command.eventKey, channel: command.channel },
    });
    return { eventKey: command.eventKey, reset: true };
  }
  const subscription = await prisma.notificationSubscription.upsert({
    where: {
      userId_eventKey_channel: {
        userId: command.userId,
        eventKey: command.eventKey,
        channel: command.channel,
      },
    },
    update: { enabled: command.enabled!, cadence: command.cadence },
    create: {
      userId: command.userId,
      eventKey: command.eventKey,
      enabled: command.enabled!,
      channel: command.channel,
      cadence: command.cadence,
    },
    select: { id: true, eventKey: true, enabled: true, channel: true, cadence: true, updatedAt: true },
  });
  return { ...subscription, updatedAt: subscription.updatedAt.toISOString() };
}

export async function canReceiveNotificationForResource(userId: number, resourceKey: string | null) {
  if (!resourceKey) return false;
  return authorize({ user: userId, resourceKey, action: "read" });
}

export async function listEligibleNotificationSubscribers(input: {
  eventKey: RegisteredNotificationType;
  resourceKey: string | null;
}) {
  const definition = findCatalogDefinition(input.eventKey);
  if (!definition || definition.subscriptionMode !== "optional") return [];
  const resourceKey = input.resourceKey ?? definition.ownerResourceKey;
  if (!resourceKey) return [];
  const subscriptions = await prisma.notificationSubscription.findMany({
    where: {
      eventKey: input.eventKey,
      channel: WORKSPACE_CHANNEL,
      enabled: true,
      user: { canLogin: true },
    },
    select: {
      id: true,
      user: { select: { id: true, username: true } },
    },
  });
  const eligibility = await Promise.all(subscriptions.map(async (subscription) => ({
    subscription,
    allowed: await canReceiveNotificationForResource(subscription.user.id, resourceKey),
  })));
  return eligibility
    .filter((item) => item.allowed)
    .map(({ subscription }) => ({
      subscriptionId: subscription.id,
      userId: subscription.user.id,
      username: subscription.user.username,
    }));
}
