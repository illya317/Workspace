import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRedriveProjectNotificationSignalCommand,
  redriveProjectNotificationSignalSchema,
} from "./project-notification-route-commands";

test("project notification signal redrive command normalizes the signal id and preserves the CAS attempt", () => {
  const result = buildRedriveProjectNotificationSignalCommand({
    userId: 7,
    projectId: 17,
    body: {
      signalId: "  project:17:event:23  ",
      expectedAttemptCount: 8,
      reason: "  已确认上游投递恢复，重新驱动失败信号  ",
    },
  });

  assert.deepEqual(result, {
    ok: true,
    data: {
      userId: 7,
      projectId: 17,
      signalId: "project:17:event:23",
      expectedAttemptCount: 8,
      reason: "已确认上游投递恢复，重新驱动失败信号",
    },
  });
});

test("project notification signal redrive schema rejects stale-shape inputs", () => {
  for (const body of [
    { signalId: "", expectedAttemptCount: 1, reason: "重试" },
    { signalId: "signal-1", expectedAttemptCount: 0, reason: "重试" },
    { signalId: "signal-1", expectedAttemptCount: 1.5, reason: "重试" },
    { signalId: "signal-1", expectedAttemptCount: 1 },
    { signalId: "signal-1", expectedAttemptCount: 1, reason: "   " },
    { signalId: "signal-1", expectedAttemptCount: 1, reason: "x".repeat(501) },
    { signalId: "signal-1", expectedAttemptCount: 1, reason: "重试", force: true },
  ]) {
    assert.equal(redriveProjectNotificationSignalSchema.safeParse(body).success, false);
  }
});
