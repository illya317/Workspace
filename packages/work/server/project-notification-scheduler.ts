import "server-only";

import { nextPermissionReviewRunAt } from "@workspace/platform/permission-review-schedule";
import { getTenantProfile } from "@workspace/platform/server/tenant-config";

import {
  evaluateProjectNotificationSchedulerGate,
  resolveProjectNotificationSchedulerRuntime,
  type ProjectNotificationSchedulerGate,
} from "./project-notification-scheduler-gate";
import {
  drainProjectNotificationSignals,
  runScheduledProjectNotificationEvaluations,
} from "./project-notification-signals";

const PROJECT_NOTIFICATION_DAILY_AT = "00:10";
const PROJECT_NOTIFICATION_RETRY_INTERVAL_MS = 60_000;
const PROJECT_NOTIFICATION_GATE_POLL_INTERVAL_MS = 5_000;

const schedulerState = globalThis as typeof globalThis & {
  __workspaceProjectNotificationTimer?: ReturnType<typeof setTimeout>;
  __workspaceProjectNotificationDrainTimer?: ReturnType<typeof setTimeout>;
  __workspaceProjectNotificationGateTimer?: ReturnType<typeof setTimeout>;
  __workspaceProjectNotificationRunning?: boolean;
  __workspaceProjectNotificationGateActive?: boolean;
  __workspaceProjectNotificationGateReason?: ProjectNotificationSchedulerGate["reason"];
};

async function schedulerGateAllowsWork() {
  try {
    const runtime = resolveProjectNotificationSchedulerRuntime();
    return await evaluateProjectNotificationSchedulerGate(runtime);
  } catch (error) {
    console.error(JSON.stringify({
      event: "project_notification_scheduler_gate_failed",
      error: error instanceof Error ? error.message : String(error),
    }));
    return { active: false, reason: "state_unavailable" } satisfies ProjectNotificationSchedulerGate;
  }
}

async function runProjectNotificationScan(trigger: "startup" | "daily") {
  const gate = await schedulerGateAllowsWork();
  if (!gate.active || schedulerState.__workspaceProjectNotificationRunning) return;
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
  const gate = await schedulerGateAllowsWork();
  if (!gate.active || schedulerState.__workspaceProjectNotificationRunning) return;
  schedulerState.__workspaceProjectNotificationRunning = true;
  try {
    const result = await drainProjectNotificationSignals();
    if (result.claimed > 0 || result.failed > 0) {
      console.log(JSON.stringify({ event: "project_notification_drain_completed", ...result }));
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
  if (!schedulerState.__workspaceProjectNotificationGateActive) return;
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
      if (schedulerState.__workspaceProjectNotificationGateActive) {
        scheduleNextProjectNotificationScan();
      }
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
  if (!schedulerState.__workspaceProjectNotificationGateActive) return;
  schedulerState.__workspaceProjectNotificationDrainTimer = setTimeout(async () => {
    try {
      await runProjectNotificationDrain();
    } finally {
      schedulerState.__workspaceProjectNotificationDrainTimer = undefined;
      if (schedulerState.__workspaceProjectNotificationGateActive) {
        scheduleNextProjectNotificationDrain();
      }
    }
  }, PROJECT_NOTIFICATION_RETRY_INTERVAL_MS);
  schedulerState.__workspaceProjectNotificationDrainTimer.unref?.();
}

function stopProjectNotificationWorkTimers() {
  if (schedulerState.__workspaceProjectNotificationTimer) {
    clearTimeout(schedulerState.__workspaceProjectNotificationTimer);
    schedulerState.__workspaceProjectNotificationTimer = undefined;
  }
  if (schedulerState.__workspaceProjectNotificationDrainTimer) {
    clearTimeout(schedulerState.__workspaceProjectNotificationDrainTimer);
    schedulerState.__workspaceProjectNotificationDrainTimer = undefined;
  }
}

async function runActivationCatchup() {
  await runProjectNotificationScan("startup");
  await runProjectNotificationDrain();
}

async function refreshProjectNotificationSchedulerGate() {
  const gate = await schedulerGateAllowsWork();
  const wasActive = schedulerState.__workspaceProjectNotificationGateActive === true;
  const gateChanged = schedulerState.__workspaceProjectNotificationGateActive !== gate.active
    || schedulerState.__workspaceProjectNotificationGateReason !== gate.reason;
  schedulerState.__workspaceProjectNotificationGateActive = gate.active;
  schedulerState.__workspaceProjectNotificationGateReason = gate.reason;

  if (gateChanged) {
    console.log(JSON.stringify({
      event: "project_notification_scheduler_gate_changed",
      active: gate.active,
      reason: gate.reason,
    }));
  }
  if (!gate.active) {
    stopProjectNotificationWorkTimers();
    return;
  }
  if (!schedulerState.__workspaceProjectNotificationTimer) scheduleNextProjectNotificationScan();
  if (!schedulerState.__workspaceProjectNotificationDrainTimer) scheduleNextProjectNotificationDrain();
  if (!wasActive) void runActivationCatchup();
}

function scheduleNextProjectNotificationGateRefresh() {
  schedulerState.__workspaceProjectNotificationGateTimer = setTimeout(async () => {
    try {
      await refreshProjectNotificationSchedulerGate();
    } finally {
      schedulerState.__workspaceProjectNotificationGateTimer = undefined;
      if (projectNotificationSchedulerEnabled()) scheduleNextProjectNotificationGateRefresh();
    }
  }, PROJECT_NOTIFICATION_GATE_POLL_INTERVAL_MS);
  schedulerState.__workspaceProjectNotificationGateTimer.unref?.();
}

export function projectNotificationSchedulerEnabled() {
  return process.env.NODE_ENV === "production"
    && process.env.PROJECT_NOTIFICATION_SCHEDULER_DISABLED !== "1";
}

export function startProjectNotificationScheduler() {
  if (!projectNotificationSchedulerEnabled()
    || schedulerState.__workspaceProjectNotificationGateTimer) return;
  void refreshProjectNotificationSchedulerGate();
  scheduleNextProjectNotificationGateRefresh();
}
