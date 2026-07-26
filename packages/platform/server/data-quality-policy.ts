import "server-only";

import { z } from "zod";

import { DATA_QUALITY_SEVERITIES, type DataQualitySeverity } from "@workspace/platform/data-quality-contract";
import type { DataQualityNotificationRoute } from "../data-quality-notification-routing";
import { registeredModuleDefinitions } from "../module-registry";
import { portalEntriesFromModules } from "../portal-preferences";
import { ROOT_ADMIN_USERNAME } from "./auth/root";
import { failCommand, okCommand, type DomainValidationResult } from "./domain-validation";
import { Prisma, prisma } from "./prisma";
import { getTenantProfile } from "./tenant-config";

type DataQualityConfigDbClient = Prisma.TransactionClient | typeof prisma;

const DATA_QUALITY_POLICY_KEY = "platform.dataQuality.policy.v2";
const LEGACY_DATA_QUALITY_POLICY_KEY = "platform.dataQuality.policy.v1";

const recipientUsernamesSchema = z.array(z.string().trim().min(1)).min(1).max(20);
const recipientUsernamesUpdateSchema = z.array(z.string().trim().min(1)).max(20);
const notificationRouteSchema = z.object({
  id: z.string().trim().min(1).max(80),
  resourceKey: z.string().trim().min(1).nullable(),
  departmentId: z.number().int().positive().nullable(),
  recipientUsernames: recipientUsernamesSchema,
});
const notificationRouteUpdateSchema = notificationRouteSchema.extend({
  recipientUsernames: recipientUsernamesUpdateSchema,
});

const sharedPolicyFields = {
  schedule: z.object({
    enabled: z.boolean(),
    dailyAt: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
    timeZone: z.string().min(1),
  }),
  mutationTrigger: z.object({ enabled: z.boolean() }),
} as const;

const storedPolicyV1Schema = z.object({
  version: z.literal(1),
  ...sharedPolicyFields,
  notifications: z.object({
    minimumSeverity: z.enum(DATA_QUALITY_SEVERITIES),
    repeatAfterHours: z.number().int().min(1).max(720),
    workspace: z.object({
      enabled: z.boolean(),
      recipientUsernames: recipientUsernamesSchema,
    }),
    wecomGroup: z.object({ enabled: z.boolean() }),
  }),
});

const storedPolicySchema = z.object({
  version: z.literal(2),
  ...sharedPolicyFields,
  notifications: z.object({
    minimumSeverity: z.enum(DATA_QUALITY_SEVERITIES),
    repeatAfterHours: z.number().int().min(1).max(720),
    workspace: z.object({
      enabled: z.boolean(),
      fallbackRecipientUsernames: recipientUsernamesSchema,
      routes: z.array(notificationRouteSchema).max(100),
    }),
    wecomGroup: z.object({ enabled: z.boolean() }),
  }),
});

export const dataQualityPolicyUpdateSchema = z.object({
  scheduleEnabled: z.boolean(),
  dailyAt: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
  mutationTriggerEnabled: z.boolean(),
  minimumSeverity: z.enum(DATA_QUALITY_SEVERITIES),
  repeatAfterHours: z.number().int().min(1).max(720),
  workspaceEnabled: z.boolean(),
  workspaceFallbackRecipientUsernames: recipientUsernamesUpdateSchema,
  workspaceRoutes: z.array(notificationRouteUpdateSchema).max(100),
  wecomGroupEnabled: z.boolean(),
});

export type DataQualityPolicy = z.infer<typeof storedPolicySchema>;
export type DataQualityPolicyUpdate = z.infer<typeof dataQualityPolicyUpdateSchema>;

function defaultPolicy(): DataQualityPolicy {
  return {
    version: 2,
    schedule: {
      enabled: true,
      dailyAt: "08:30",
      timeZone: getTenantProfile().localization.businessTimeZone,
    },
    mutationTrigger: { enabled: true },
    notifications: {
      minimumSeverity: "warning",
      repeatAfterHours: 24,
      workspace: {
        enabled: true,
        fallbackRecipientUsernames: [ROOT_ADMIN_USERNAME],
        routes: [],
      },
      wecomGroup: { enabled: false },
    },
  };
}

function migrateLegacyPolicy(legacy: z.infer<typeof storedPolicyV1Schema>): DataQualityPolicy {
  return {
    version: 2,
    schedule: legacy.schedule,
    mutationTrigger: legacy.mutationTrigger,
    notifications: {
      minimumSeverity: legacy.notifications.minimumSeverity,
      repeatAfterHours: legacy.notifications.repeatAfterHours,
      workspace: {
        enabled: legacy.notifications.workspace.enabled,
        fallbackRecipientUsernames: legacy.notifications.workspace.recipientUsernames,
        routes: [],
      },
      wecomGroup: legacy.notifications.wecomGroup,
    },
  };
}

export function dataQualityWecomWebhook() {
  const raw = process.env.WECOM_DATA_QUALITY_WEBHOOK_URL?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.hostname !== "qyapi.weixin.qq.com" || !url.pathname.endsWith("/cgi-bin/webhook/send")) {
      return null;
    }
    if (!url.searchParams.get("key")) return null;
    return url;
  } catch {
    return null;
  }
}

export function getDataQualityChannelAvailability() {
  return {
    workspace: { configured: true },
    wecomGroup: { configured: Boolean(dataQualityWecomWebhook()) },
  };
}

export async function getDataQualityPolicy(
  client: DataQualityConfigDbClient = prisma,
): Promise<DataQualityPolicy> {
  const row = await client.systemConfig.findUnique({ where: { key: DATA_QUALITY_POLICY_KEY } });
  if (row) {
    try {
      const parsed = storedPolicySchema.safeParse(JSON.parse(row.value));
      if (!parsed.success) return defaultPolicy();
      return {
        ...parsed.data,
        schedule: {
          ...parsed.data.schedule,
          timeZone: getTenantProfile().localization.businessTimeZone,
        },
      };
    } catch {
      return defaultPolicy();
    }
  }
  const legacyRow = await client.systemConfig.findUnique({ where: { key: LEGACY_DATA_QUALITY_POLICY_KEY } });
  if (!legacyRow) return defaultPolicy();
  try {
    const parsed = storedPolicyV1Schema.safeParse(JSON.parse(legacyRow.value));
    if (!parsed.success) return defaultPolicy();
    const policy = migrateLegacyPolicy(parsed.data);
    return {
      ...policy,
      schedule: {
        ...policy.schedule,
        timeZone: getTenantProfile().localization.businessTimeZone,
      },
    };
  } catch {
    return defaultPolicy();
  }
}

export async function buildDataQualityPolicyUpdate(
  input: DataQualityPolicyUpdate,
): Promise<DomainValidationResult<DataQualityPolicy>> {
  const fallbackRecipientUsernames = uniqueUsernames(input.workspaceFallbackRecipientUsernames);
  const routes: DataQualityNotificationRoute[] = input.workspaceRoutes.map((route) => ({
    ...route,
    id: route.id.trim(),
    resourceKey: route.resourceKey?.trim() || null,
    recipientUsernames: uniqueUsernames(route.recipientUsernames),
  }));
  if (fallbackRecipientUsernames.length === 0) {
    return failCommand("未匹配提醒必须至少选择一个接收人", 400, "workspaceFallbackRecipientUsernames");
  }
  const routeError = validateRoutes(routes);
  if (routeError) return failCommand(routeError, 400, "workspaceRoutes");
  const departmentIds = [...new Set(routes.flatMap((route) => route.departmentId ? [route.departmentId] : []))];
  if (departmentIds.length > 0) {
    const departments = await prisma.department.findMany({
      where: { id: { in: departmentIds }, isArchived: false },
      select: { id: true },
    });
    const available = new Set(departments.map((department) => department.id));
    const missing = departmentIds.filter((departmentId) => !available.has(departmentId));
    if (missing.length > 0) {
      return failCommand(`提醒分流规则引用了不存在或已归档的部门：${missing.join("、")}`, 400, "workspaceRoutes");
    }
  }
  if (input.workspaceEnabled) {
    const recipientUsernames = uniqueUsernames([
      ...fallbackRecipientUsernames,
      ...routes.flatMap((route) => route.recipientUsernames),
    ]);
    const users = await prisma.user.findMany({
      where: { username: { in: recipientUsernames }, canLogin: true },
      select: { username: true },
    });
    const available = new Set(users.map((user) => user.username));
    const missing = recipientUsernames.filter((username) => !available.has(username));
    if (missing.length > 0) {
      return failCommand(`站内通知接收人不存在或不可登录：${missing.join("、")}`, 400, "workspaceRoutes");
    }
  }
  if (input.wecomGroupEnabled && !dataQualityWecomWebhook()) {
    return failCommand("企微群机器人未配置，请先设置 WECOM_DATA_QUALITY_WEBHOOK_URL", 409, "wecomGroupEnabled");
  }
  return okCommand({
    version: 2,
    schedule: {
      enabled: input.scheduleEnabled,
      dailyAt: input.dailyAt,
      timeZone: getTenantProfile().localization.businessTimeZone,
    },
    mutationTrigger: { enabled: input.mutationTriggerEnabled },
    notifications: {
      minimumSeverity: input.minimumSeverity,
      repeatAfterHours: input.repeatAfterHours,
      workspace: {
        enabled: input.workspaceEnabled,
        fallbackRecipientUsernames,
        routes,
      },
      wecomGroup: { enabled: input.wecomGroupEnabled },
    },
  });
}

function uniqueUsernames(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function registeredL2ResourceKeys() {
  return new Set(listDataQualityRoutingResourceOptions().map((option) => option.value));
}

export function listDataQualityRoutingResourceOptions() {
  const modules = registeredModuleDefinitions.flatMap((definition) => definition.moduleDef ? [definition.moduleDef] : []);
  return portalEntriesFromModules(modules).flatMap((entry) => (
    entry.level === 2 && entry.resourceKey && entry.parentKey && entry.parentLabel
      ? [{
          value: entry.resourceKey,
          label: `${entry.parentLabel} / ${entry.label}`,
          l1Value: entry.parentKey,
          l1Label: entry.parentLabel,
          l2Label: entry.label,
        }]
      : []
  ));
}

function validateRoutes(routes: DataQualityNotificationRoute[]) {
  const ids = new Set<string>();
  const matchers = new Set<string>();
  const resourceKeys = registeredL2ResourceKeys();
  for (const route of routes) {
    if (ids.has(route.id)) return "提醒分流规则标识重复";
    ids.add(route.id);
    if (!route.resourceKey && !route.departmentId) return "提醒分流规则必须至少选择一个 L2 或部门";
    if (route.recipientUsernames.length === 0) return "每条提醒分流规则必须至少选择一个接收人";
    if (route.resourceKey && !resourceKeys.has(route.resourceKey)) return `提醒分流规则引用了未知 L2：${route.resourceKey}`;
    const matcher = `${route.resourceKey ?? "*"}:${route.departmentId ?? "*"}`;
    if (matchers.has(matcher)) return "相同 L2 和部门的提醒分流规则不能重复";
    matchers.add(matcher);
  }
  return null;
}

export async function saveDataQualityPolicy(policy: DataQualityPolicy) {
  await prisma.systemConfig.upsert({
    where: { key: DATA_QUALITY_POLICY_KEY },
    update: { value: JSON.stringify(policy) },
    create: { key: DATA_QUALITY_POLICY_KEY, value: JSON.stringify(policy) },
  });
  return policy;
}

const severityRank: Record<DataQualitySeverity, number> = {
  info: 0,
  warning: 1,
  critical: 2,
};

export function dataQualitySeverityMeetsThreshold(
  severity: DataQualitySeverity,
  minimumSeverity: DataQualitySeverity,
) {
  return severityRank[severity] >= severityRank[minimumSeverity];
}

export function dataQualitySeverityIncreased(previous: string, current: DataQualitySeverity) {
  return severityRank[current] > (severityRank[previous as DataQualitySeverity] ?? -1);
}
