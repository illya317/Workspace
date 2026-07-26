import "server-only";

import { nextPermissionReviewRunAt } from "@workspace/platform/permission-review-schedule";
import { getTenantPermissionReview } from "./tenant-config";
import { runPermissionReview } from "./permission-review";

const schedulerState = globalThis as typeof globalThis & {
  __workspacePermissionReviewTimer?: ReturnType<typeof setTimeout>;
};

function scheduleNextRun() {
  const policy = getTenantPermissionReview();
  const now = new Date();
  const scheduledAt = nextPermissionReviewRunAt(now, policy.schedule.dailyAt, policy.schedule.timeZone);
  const delay = Math.max(1_000, scheduledAt.getTime() - now.getTime());
  schedulerState.__workspacePermissionReviewTimer = setTimeout(async () => {
    try {
      await runPermissionReview("daily");
    } catch (error) {
      console.error(JSON.stringify({
        event: "permission_review_daily_failed",
        scheduledAt: scheduledAt.toISOString(),
        error: error instanceof Error ? error.message : String(error),
      }));
    } finally {
      scheduleNextRun();
    }
  }, delay);
  schedulerState.__workspacePermissionReviewTimer.unref?.();
  console.log(JSON.stringify({
    event: "permission_review_scheduled",
    scheduledAt: scheduledAt.toISOString(),
    dailyAt: policy.schedule.dailyAt,
    timeZone: policy.schedule.timeZone,
  }));
}

export function startPermissionReviewScheduler() {
  if (process.env.NODE_ENV !== "production") return;
  if (process.env.PERMISSION_REVIEW_SCHEDULER_DISABLED === "1") return;
  if (schedulerState.__workspacePermissionReviewTimer) return;
  scheduleNextRun();
}
