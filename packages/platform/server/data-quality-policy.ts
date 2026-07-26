import "server-only";

import { z } from "zod";

import { DATA_QUALITY_SEVERITIES, type DataQualitySeverity } from "@workspace/platform/data-quality-contract";
import { ROOT_ADMIN_USERNAME } from "./auth/root";
import { failCommand, okCommand, type DomainValidationResult } from "./domain-validation";
import { Prisma, prisma } from "./prisma";
import { getTenantProfile } from "./tenant-config";

type DataQualityConfigDbClient = Prisma.TransactionClient | typeof prisma;

const DATA_QUALITY_POLICY_KEY = "platform.dataQuality.policy.v1";

const storedPolicySchema = z.object({
  version: z.literal(1),
  schedule: z.object({
    enabled: z.boolean(),
    dailyAt: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
    timeZone: z.string().min(1),
  }),
  mutationTrigger: z.object({ enabled: z.boolean() }),
  notifications: z.object({
    minimumSeverity: z.enum(DATA_QUALITY_SEVERITIES),
    repeatAfterHours: z.number().int().min(1).max(720),
    workspace: z.object({
      enabled: z.boolean(),
      recipientUsernames: z.array(z.string().trim().min(1)).min(1).max(20),
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
  workspaceRecipientUsernames: z.array(z.string().trim().min(1)).min(1).max(20),
  wecomGroupEnabled: z.boolean(),
});

export type DataQualityPolicy = z.infer<typeof storedPolicySchema>;
export type DataQualityPolicyUpdate = z.infer<typeof dataQualityPolicyUpdateSchema>;

function defaultPolicy(): DataQualityPolicy {
  return {
    version: 1,
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
        recipientUsernames: [ROOT_ADMIN_USERNAME],
      },
      wecomGroup: { enabled: false },
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
  if (!row) return defaultPolicy();
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

export async function buildDataQualityPolicyUpdate(
  input: DataQualityPolicyUpdate,
): Promise<DomainValidationResult<DataQualityPolicy>> {
  const recipientUsernames = [...new Set(input.workspaceRecipientUsernames.map((value) => value.trim()))];
  if (input.workspaceEnabled) {
    const users = await prisma.user.findMany({
      where: { username: { in: recipientUsernames }, canLogin: true },
      select: { username: true },
    });
    const available = new Set(users.map((user) => user.username));
    const missing = recipientUsernames.filter((username) => !available.has(username));
    if (missing.length > 0) {
      return failCommand(`站内通知接收人不存在或不可登录：${missing.join("、")}`, 400, "workspaceRecipientUsernames");
    }
  }
  if (input.wecomGroupEnabled && !dataQualityWecomWebhook()) {
    return failCommand("企微群机器人未配置，请先设置 WECOM_DATA_QUALITY_WEBHOOK_URL", 409, "wecomGroupEnabled");
  }
  return okCommand({
    version: 1,
    schedule: {
      enabled: input.scheduleEnabled,
      dailyAt: input.dailyAt,
      timeZone: getTenantProfile().localization.businessTimeZone,
    },
    mutationTrigger: { enabled: input.mutationTriggerEnabled },
    notifications: {
      minimumSeverity: input.minimumSeverity,
      repeatAfterHours: input.repeatAfterHours,
      workspace: { enabled: input.workspaceEnabled, recipientUsernames },
      wecomGroup: { enabled: input.wecomGroupEnabled },
    },
  });
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
