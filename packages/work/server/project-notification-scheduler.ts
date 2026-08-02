import "server-only";

import { nextPermissionReviewRunAt } from "@workspace/platform/permission-review-schedule";
import { getTenantProfile } from "@workspace/platform/server/tenant-config";

import {
  drainProjectNotificationSignals,
  runScheduledProjectNotificationEvaluations,
} from "./project-notification-signals";
import { runScheduledWeeklyReportGroupNotifications } from "./weekly-report-group-notifications";

const PROJECT_NOTIFICATION_DAILY_AT = "00:10";
const PROJECT_NOTIFICATION_RETRY_INTERVAL_MS = 60_000;

const schedulerState = globalThis as typeof globalThis & {
  __workspaceProjectNotificationTimer?: ReturnType<typeof setTimeout>;
  __workspaceProjectNotificationDrainTimer?: ReturnType<typeof setTimeout>;
  __workspaceProjectNotificationRunning?: boolean;
};

async function runProjectNotificationScan(trigger: "startup" | "daily") {
  if (schedulerState.__workspaceProjectNotificationRunning) return;
  schedulerState.__workspaceProjectNotificationRunning = true;
  try {
    const result = await runScheduledProjectNotificationEvaluations();
    console.log(JSON.stringify({
      event: "project_notification_scan_completed",
      trigger,
      ...result,
    }));
  } catch (error) {
    console.error(JSON.stringify({
      event: "project_notification_scan_failed",
      trigger,
      error: error instanceof Error ? error.message : String(error),
    }));
  } finally {
    schedulerState.__workspaceProjectNotificationRunning = false;
  }
}

async function runProjectNotificationDrain() {
  if (schedulerState.__workspaceProjectNotificationRunning) return;
  schedulerState.__workspaceProjectNotificationRunning = true;
  try {
    const result = await drainProjectNotificationSignals();
    const weeklyReportGroups = await runScheduledWeeklyReportGroupNotifications();
    if (result.claimed > 0 || result.failed > 0) {
      console.log(JSON.stringify({ event: "project_notification_drain_completed", ...result }));
    }
    if (
      weeklyReportGroups.enqueued > 0
      || weeklyReportGroups.replayed > 0
      || weeklyReportGroups.skippedHoliday > 0
      || weeklyReportGroups.failed > 0
    ) {
      console.log(JSON.stringify({
        event: "weekly_report_group_notification_scan_completed",
        ...weeklyReportGroups,
      }));
    }
  } catch (error) {
    console.error(JSON.stringify({
      event: "project_notification_drain_failed",
      error: error instanceof Error ? error.message : String(error),
    }));
  } finally {
    schedulerState.__workspaceProjectNotificationRunning = false;
  }
}

function scheduleNextProjectNotificationScan() {
  const timeZone = getTenantProfile().localization.businessTimeZone;
  const now = new Date();
  const scheduledAt = nextPermissionReviewRunAt(
    now,
    PROJECT_NOTIFICATION_DAILY_AT,
    timeZone,
  );
  const delay = Math.max(1_000, scheduledAt.getTime() - now.getTime());
  schedulerState.__workspaceProjectNotificationTimer = setTimeout(async () => {
    try {
      await runProjectNotificationScan("daily");
    } finally {
      schedulerState.__workspaceProjectNotificationTimer = undefined;
      scheduleNextProjectNotificationScan();
    }
  }, delay);
  schedulerState.__workspaceProjectNotificationTimer.unref?.();
  console.log(JSON.stringify({
    event: "project_notification_scan_scheduled",
    scheduledAt: scheduledAt.toISOString(),
    dailyAt: PROJECT_NOTIFICATION_DAILY_AT,
    timeZone,
  }));
}

function scheduleNextProjectNotificationDrain() {
  schedulerState.__workspaceProjectNotificationDrainTimer = setTimeout(async () => {
    try {
      await runProjectNotificationDrain();
    } finally {
      schedulerState.__workspaceProjectNotificationDrainTimer = undefined;
      scheduleNextProjectNotificationDrain();
    }
  }, PROJECT_NOTIFICATION_RETRY_INTERVAL_MS);
  schedulerState.__workspaceProjectNotificationDrainTimer.unref?.();
}

export function projectNotificationSchedulerEnabled() {
  return process.env.NODE_ENV === "production"
    && process.env.PROJECT_NOTIFICATION_SCHEDULER_DISABLED !== "1";
}

async function runStartupCatchup() {
  await runProjectNotificationScan("startup");
  await runProjectNotificationDrain();
}

export function startProjectNotificationScheduler() {
  if (!projectNotificationSchedulerEnabled()
    || schedulerState.__workspaceProjectNotificationTimer
    || schedulerState.__workspaceProjectNotificationDrainTimer) return;
  scheduleNextProjectNotificationScan();
  scheduleNextProjectNotificationDrain();
  void runStartupCatchup();
}
