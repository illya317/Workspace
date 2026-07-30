import { z } from "zod";

export const PROJECT_NOTIFICATION_RASCI_ROLES = ["R", "A", "S", "C", "I"] as const;
export const PROJECT_NOTIFICATION_CHANNELS = ["workspace", "wecom"] as const;

export type ProjectNotificationRasciRole = (typeof PROJECT_NOTIFICATION_RASCI_ROLES)[number];
export type ProjectNotificationChannel = (typeof PROJECT_NOTIFICATION_CHANNELS)[number];

export const projectNotificationAudiencePolicySchema = z.object({
  roles: z.array(z.enum(PROJECT_NOTIFICATION_RASCI_ROLES))
    .min(1)
    .max(PROJECT_NOTIFICATION_RASCI_ROLES.length)
    .refine((roles) => new Set(roles).size === roles.length, "RASCI 角色不能重复"),
}).strict();

export const projectNotificationChannelPolicySchema = z.object({
  channels: z.array(z.enum(PROJECT_NOTIFICATION_CHANNELS))
    .min(1)
    .max(PROJECT_NOTIFICATION_CHANNELS.length)
    .refine((channels) => new Set(channels).size === channels.length, "通知渠道不能重复"),
}).strict();

export type ProjectNotificationAudiencePolicy = z.infer<typeof projectNotificationAudiencePolicySchema>;
export type ProjectNotificationChannelPolicy = z.infer<typeof projectNotificationChannelPolicySchema>;

export function parseProjectNotificationAudiencePolicy(input: unknown):
  | { ok: true; data: ProjectNotificationAudiencePolicy }
  | { ok: false; error: string } {
  const parsed = projectNotificationAudiencePolicySchema.safeParse(input);
  return parsed.success
    ? { ok: true, data: parsed.data }
    : { ok: false, error: parsed.error.issues[0]?.message ?? "通知受众策略无效" };
}

export function parseProjectNotificationChannelPolicy(input: unknown):
  | { ok: true; data: ProjectNotificationChannelPolicy }
  | { ok: false; error: string } {
  const parsed = projectNotificationChannelPolicySchema.safeParse(input);
  return parsed.success
    ? { ok: true, data: parsed.data }
    : { ok: false, error: parsed.error.issues[0]?.message ?? "通知渠道策略无效" };
}

export function parseStoredProjectNotificationAudiencePolicy(json: string) {
  return parseProjectNotificationAudiencePolicy(parseJson(json));
}

export function parseStoredProjectNotificationChannelPolicy(json: string) {
  return parseProjectNotificationChannelPolicy(parseJson(json));
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
