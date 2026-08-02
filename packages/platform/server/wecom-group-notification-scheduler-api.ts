import "server-only";

import { notificationGroupScheduleSchema } from "./wecom-group-notification-contract";
import { prisma, Prisma } from "./prisma";

export { publishWeeklyReportNotificationToManagedGroup } from "./wecom-group-notifications";
export {
  WEEKLY_REPORT_DEFAULT_MESSAGE_TEMPLATE,
  WEEKLY_REPORT_MESSAGE_VARIABLES,
} from "./wecom-group-notification-contract";

export type ActiveWeeklyReportGroupPolicy = {
  id: string;
  key: string;
  groupKey: string;
  messageTemplate: string | null;
  schedule: {
    mode: "weekly";
    timezone: "Asia/Shanghai";
    weekday: number;
    time: string;
  };
};

export async function listActiveWeeklyReportGroupPolicies(): Promise<ActiveWeeklyReportGroupPolicy[]> {
  const rows = await prisma.$queryRaw<Array<{
    id: string;
    key: string;
    groupKey: string;
    scheduleJson: string;
    messageTemplate: string | null;
  }>>(Prisma.sql`
    SELECT
      policy."id", policy."key", group_row."groupKey", policy."scheduleJson", policy."messageTemplate"
    FROM "NotificationGroupPolicy" AS policy
    INNER JOIN "NotificationManagedGroup" AS group_row ON group_row."id" = policy."groupId"
    WHERE policy."weeklyAgentKey" = 'work.weekly-report'
      AND policy."enabled" = true
      AND group_row."status" = 'active'
      AND group_row."verificationStatus" = 'verified'
    ORDER BY group_row."groupKey", policy."key"
  `);
  return rows.flatMap((row) => {
    const schedule = notificationGroupScheduleSchema.safeParse(parseSchedule(row.scheduleJson));
    if (!schedule.success || schedule.data.mode !== "weekly") return [];
    return [{ id: row.id, key: row.key, groupKey: row.groupKey, schedule: schedule.data, messageTemplate: row.messageTemplate }];
  });
}

function parseSchedule(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}
