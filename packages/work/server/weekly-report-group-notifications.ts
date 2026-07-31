import "server-only";

import { isChinaHoliday } from "@workspace/platform/calendar";
import {
  listActiveWeeklyReportGroupPolicies,
  publishWeeklyReportNotificationToManagedGroup,
  type ActiveWeeklyReportGroupPolicy,
} from "@workspace/platform/server/wecom-group-notification-scheduler-api";

const SHANGHAI_TIME_ZONE = "Asia/Shanghai";
const processedSlots = new Set<string>();

export type WeeklyReportGroupNotificationRun = {
  considered: number;
  enqueued: number;
  replayed: number;
  skippedHoliday: number;
  failed: number;
};

export async function runScheduledWeeklyReportGroupNotifications(
  now = new Date(),
): Promise<WeeklyReportGroupNotificationRun> {
  const policies = await listActiveWeeklyReportGroupPolicies();
  const earliestTimeByGroupAndWeekday = new Map<string, string>();
  for (const policy of policies) {
    const groupSlot = `${policy.groupKey}:${policy.schedule.weekday}`;
    const current = earliestTimeByGroupAndWeekday.get(groupSlot);
    if (!current || policy.schedule.time < current) {
      earliestTimeByGroupAndWeekday.set(groupSlot, policy.schedule.time);
    }
  }

  const result: WeeklyReportGroupNotificationRun = {
    considered: policies.length,
    enqueued: 0,
    replayed: 0,
    skippedHoliday: 0,
    failed: 0,
  };
  for (const policy of policies) {
    const slot = resolveWeeklyReportNotificationSlot(now, policy, {
      followUp: policy.schedule.time > (
        earliestTimeByGroupAndWeekday.get(`${policy.groupKey}:${policy.schedule.weekday}`)
        ?? policy.schedule.time
      ),
    });
    if (!slot) continue;
    const cacheKey = `${policy.id}:${slot.idempotencyKey}`;
    if (processedSlots.has(cacheKey)) continue;
    if (isChinaHoliday(slot.dateKey)) {
      processedSlots.add(cacheKey);
      result.skippedHoliday += 1;
      continue;
    }
    const publication = await publishWeeklyReportNotificationToManagedGroup(
      policy.id,
      slot.message,
      slot.idempotencyKey,
    );
    if (!publication.ok) {
      result.failed += 1;
      console.error(JSON.stringify({
        event: "weekly_report_group_notification_failed",
        policyId: policy.id,
        dateKey: slot.dateKey,
        scheduledTime: policy.schedule.time,
        error: publication.error,
      }));
      continue;
    }
    processedSlots.add(cacheKey);
    if (publication.data.replayed) result.replayed += 1;
    else result.enqueued += 1;
  }
  pruneProcessedSlots(now);
  return result;
}

export function resolveWeeklyReportNotificationSlot(
  now: Date,
  policy: Pick<ActiveWeeklyReportGroupPolicy, "schedule">,
  options: { followUp: boolean },
) {
  const local = shanghaiDateTime(now);
  if (local.weekday !== policy.schedule.weekday || local.time < policy.schedule.time) return null;
  return {
    dateKey: local.dateKey,
    idempotencyKey: `weekly-report:${local.dateKey}:${policy.schedule.time.replace(":", "")}`,
    message: formatWeeklyReportMessage(local.dateKey, options.followUp),
  };
}

function formatWeeklyReportMessage(fridayDateKey: string, followUp: boolean) {
  const friday = dateKeyToUtcDate(fridayDateKey);
  const monday = addDays(friday, -4);
  const nextMonday = addDays(friday, 3);
  const nextFriday = addDays(friday, 7);
  const monthly = nextFriday.getUTCMonth() !== friday.getUTCMonth();
  const salutation = followUp
    ? "各重点项目及部门负责人：再次提醒！"
    : "各重点项目及部门负责人：上午好！";
  const summary = monthly
    ? `${formatChineseDate(nextMonday)}（星期一）召开月度例会，请在新系统中完成本月工作总结及下月工作计划的填报（${formatChineseDate(monthStart(friday))}—${formatChineseDate(monthEnd(friday))}），谢谢！`
    : `下周一（${formatChineseDate(nextMonday)}）召开周例会，请在新系统中完成本周工作总结及下周工作计划的填报（${formatChineseDate(monday)}—${formatChineseDate(friday)}），谢谢！`;
  const reportTab = monthly ? "月报" : "周报";
  return [
    salutation,
    "",
    summary,
    "",
    `部门/项目负责人请先在顶部「工作空间」切换至本人负责的部门或项目空间，再选择「工作汇报 → ${reportTab}」。`,
    "负责多个空间的，请逐一切换并填报；如未显示对应空间，请先在「个人设置」中配置「常用部门/常用项目」。",
    "手机端如提示扫码登录，可先截图，再从相册中识别二维码。",
  ].join("\n");
}

function shanghaiDateTime(input: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SHANGHAI_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(input);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  const weekday = ({ Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 } as const)[
    value("weekday") as "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun"
  ];
  return {
    dateKey: `${value("year")}-${value("month")}-${value("day")}`,
    time: `${value("hour")}:${value("minute")}`,
    weekday,
  };
}

function dateKeyToUtcDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function addDays(value: Date, amount: number) {
  const next = new Date(value);
  next.setUTCDate(next.getUTCDate() + amount);
  return next;
}

function monthStart(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1));
}

function monthEnd(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + 1, 0));
}

function formatChineseDate(value: Date) {
  return `${value.getUTCMonth() + 1}月${value.getUTCDate()}日`;
}

function pruneProcessedSlots(now: Date) {
  const currentDateKey = shanghaiDateTime(now).dateKey;
  for (const key of processedSlots) {
    if (!key.includes(currentDateKey)) processedSlots.delete(key);
  }
}
