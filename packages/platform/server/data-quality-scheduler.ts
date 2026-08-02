import "server-only";

import { nextPermissionReviewRunAt } from "@workspace/platform/permission-review-schedule";
import { runDataQuality, runPendingDataQualityEvaluations } from "./data-quality";
import { getDataQualityPolicy } from "./data-quality-policy";

const schedulerState = globalThis as typeof globalThis & {
  __workspaceDataQualityDailyTimer?: ReturnType<typeof setTimeout>;
  __workspaceDataQualityMutationTimer?: ReturnType<typeof setInterval>;
  __workspaceDataQualityMutationRunning?: boolean;
};

async function scheduleNextDailyRun() {
  const policy = await getDataQualityPolicy();
  if (!policy.schedule.enabled) return;
  const now = new Date();
  const scheduledAt = nextPermissionReviewRunAt(now, policy.schedule.dailyAt, policy.schedule.timeZone);
  const delay = Math.max(1_000, scheduledAt.getTime() - now.getTime());
  schedulerState.__workspaceDataQualityDailyTimer = setTimeout(async () => {
    try {
      await runDataQuality({ trigger: "scheduled" });
    } catch (error) {
      console.error(JSON.stringify({
        event: "data_quality_daily_failed",
        scheduledAt: scheduledAt.toISOString(),
        error: error instanceof Error ? error.message : String(error),
      }));
    } finally {
      schedulerState.__workspaceDataQualityDailyTimer = undefined;
      void scheduleNextDailyRun();
    }
  }, delay);
  schedulerState.__workspaceDataQualityDailyTimer.unref?.();
  console.log(JSON.stringify({
    event: "data_quality_daily_scheduled",
    scheduledAt: scheduledAt.toISOString(),
    dailyAt: policy.schedule.dailyAt,
    timeZone: policy.schedule.timeZone,
  }));
}

async function pollMutationRequests() {
  if (schedulerState.__workspaceDataQualityMutationRunning) return;
  schedulerState.__workspaceDataQualityMutationRunning = true;
  try {
    await runPendingDataQualityEvaluations();
  } catch (error) {
    console.error(JSON.stringify({
      event: "data_quality_mutation_evaluation_failed",
      error: error instanceof Error ? error.message : String(error),
    }));
  } finally {
    schedulerState.__workspaceDataQualityMutationRunning = false;
  }
}

export function dataQualitySchedulerEnabled() {
  return process.env.NODE_ENV !== "test" && process.env.DATA_QUALITY_SCHEDULER_DISABLED !== "1";
}

export function startDataQualityScheduler() {
  if (!dataQualitySchedulerEnabled()) return;
  if (!schedulerState.__workspaceDataQualityDailyTimer) void scheduleNextDailyRun();
  if (!schedulerState.__workspaceDataQualityMutationTimer) {
    schedulerState.__workspaceDataQualityMutationTimer = setInterval(() => void pollMutationRequests(), 60_000);
    schedulerState.__workspaceDataQualityMutationTimer.unref?.();
    void pollMutationRequests();
  }
}
