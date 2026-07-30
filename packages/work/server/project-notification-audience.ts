import "server-only";

import { workspaceBusinessDate } from "@workspace/platform/server/business-date";
import { prisma } from "@workspace/platform/server/prisma";

import { projectMemberHasActiveEmploymentOnDate } from "./project-access-temporal";
import {
  type ProjectNotificationAudiencePolicy,
  type ProjectNotificationRasciRole,
} from "./domain/project-notification-audience-validation";

export {
  parseProjectNotificationAudiencePolicy,
  parseProjectNotificationChannelPolicy,
  parseStoredProjectNotificationAudiencePolicy,
  parseStoredProjectNotificationChannelPolicy,
  PROJECT_NOTIFICATION_CHANNELS,
  PROJECT_NOTIFICATION_RASCI_ROLES,
  projectNotificationAudiencePolicySchema,
  projectNotificationChannelPolicySchema,
} from "./domain/project-notification-audience-validation";
export type {
  ProjectNotificationAudiencePolicy,
  ProjectNotificationChannel,
  ProjectNotificationChannelPolicy,
  ProjectNotificationRasciRole,
} from "./domain/project-notification-audience-validation";

const PROJECT_ROLE_TO_RASCI: Readonly<Record<string, ProjectNotificationRasciRole>> = {
  "负责人": "A",
  "项目负责人": "A",
  "执行负责": "R",
  "支持协作": "S",
  "咨询参与": "C",
  "知会": "I",
};

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

function compareText(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}
