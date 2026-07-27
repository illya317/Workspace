import assert from "node:assert/strict";
import test from "node:test";

import type { DataQualityFinding } from "./data-quality-contract";
import { buildDataQualityNotificationGroups } from "./data-quality-notification-routing";

function finding(resourceKey: string, departmentId: number | null, fingerprint: string): DataQualityFinding {
  return {
    fingerprint,
    checkKey: "test.check",
    domain: resourceKey.split(".")[0] ?? "test",
    severity: "warning",
    title: "测试异常",
    summary: "测试摘要",
    count: 1,
    resourceKey,
    departmentId,
    href: "/test",
    samples: [],
  };
}

test("data-quality notification delivery groups only by resource and department scope", () => {
  const groups = buildDataQualityNotificationGroups([
    finding("hr.roster", 2, "hr-2-a"),
    finding("hr.roster", 2, "hr-2-b"),
    finding("hr.roster", 3, "hr-3"),
    finding("work.tasks", 2, "work-2"),
  ]);

  assert.equal(groups.length, 3);
  assert.deepEqual(groups.map((group) => ({
    resourceKey: group.resourceKey,
    departmentId: group.departmentId,
    findings: group.findings.map((item) => item.fingerprint),
  })), [
    { resourceKey: "hr.roster", departmentId: 2, findings: ["hr-2-a", "hr-2-b"] },
    { resourceKey: "hr.roster", departmentId: 3, findings: ["hr-3"] },
    { resourceKey: "work.tasks", departmentId: 2, findings: ["work-2"] },
  ]);
});
