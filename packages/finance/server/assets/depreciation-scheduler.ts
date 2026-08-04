import "server-only";

import { nextPermissionReviewRunAt } from "@workspace/platform/permission-review-schedule";

import {
  ASSET_DEPRECIATION_SCHEDULE_TIME_ZONE,
  runAssetDepreciationAutoRecalculation,
} from "./depreciation-auto-recalculation";

const DAILY_AT = "02:30";

const schedulerState = globalThis as typeof globalThis & {
  __workspaceAssetDepreciationTimer?: ReturnType<typeof setTimeout>;
};

export function assetDepreciationSchedulerEnabled() {
  return process.env.NODE_ENV !== "test" && process.env.ASSET_DEPRECIATION_SCHEDULER_DISABLED !== "1";
}

function scheduleNextDailyRun() {
  const now = new Date();
  const scheduledAt = nextPermissionReviewRunAt(now, DAILY_AT, ASSET_DEPRECIATION_SCHEDULE_TIME_ZONE);
  const delay = Math.max(1_000, scheduledAt.getTime() - now.getTime());
  schedulerState.__workspaceAssetDepreciationTimer = setTimeout(async () => {
    try {
      await runAssetDepreciationAutoRecalculation(new Date());
    } catch (error) {
      console.error(JSON.stringify({
        event: "asset_depreciation_auto_recalculation_failed",
        scheduledAt: scheduledAt.toISOString(),
        error: error instanceof Error ? error.message : String(error),
      }));
    } finally {
      schedulerState.__workspaceAssetDepreciationTimer = undefined;
      scheduleNextDailyRun();
    }
  }, delay);
  schedulerState.__workspaceAssetDepreciationTimer.unref?.();
  console.log(JSON.stringify({
    event: "asset_depreciation_auto_recalculation_scheduled",
    scheduledAt: scheduledAt.toISOString(),
    dailyAt: DAILY_AT,
    timeZone: ASSET_DEPRECIATION_SCHEDULE_TIME_ZONE,
  }));
}

export function startAssetDepreciationScheduler() {
  if (!assetDepreciationSchedulerEnabled()) return;
  if (!schedulerState.__workspaceAssetDepreciationTimer) scheduleNextDailyRun();
}
