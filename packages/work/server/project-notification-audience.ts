import "server-only";

import { z } from "zod";

import { workspaceBusinessDate } from "@workspace/platform/server/business-date";
import { prisma } from "@workspace/platform/server/prisma";

import { projectMemberHasActiveEmploymentOnDate } from "./project-access-temporal";

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

const PROJECT_ROLE_TO_RASCI: Readonly<Record<string, ProjectNotificationRasciRole>> = {
  "负责人": "A",
  "项目负责人": "A",
  "执行负责": "R",
  "支持协作": "S",
  "咨询参与": "C",
  "知会": "I",
};

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

export async function resolveProjectNotificationAudience(input: {
  projectId: number;
  policy: ProjectNotificationAudiencePolicy;
  asOf: Date;
}) {
  const requestedRoles = new Set(input.policy.roles);
  const memberships = await prisma.employeeProject.findMany({
    where: {
      projectId: input.projectId,
      recordState: "confirmed",
      role: { in: Object.keys(PROJECT_ROLE_TO_RASCI) },
    },
    select: {
      role: true,
      startDate: true,
      endDate: true,
      employee: {
        select: {
          user: { select: { username: true, canLogin: true } },
          employments: { select: { isActive: true, joinDate: true, leaveDate: true } },
        },
      },
    },
  });
  const asOfDate = workspaceBusinessDate(input.asOf);
  const usernames = memberships.flatMap((membership) => {
    const rasciRole = membership.role ? PROJECT_ROLE_TO_RASCI[membership.role] : undefined;
    const user = membership.employee.user;
    if (
      !rasciRole
      || !requestedRoles.has(rasciRole)
      || !user?.canLogin
      || !user.username
      || !projectMemberHasActiveEmploymentOnDate(membership, membership.employee.employments, asOfDate)
    ) {
      return [];
    }
    return [user.username];
  });
  return [...new Set(usernames)].sort(compareText);
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

function compareText(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}
