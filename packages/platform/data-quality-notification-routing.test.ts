import assert from "node:assert/strict";
import test from "node:test";

import type { DataQualityFinding } from "./data-quality-contract";
import {
  buildDataQualityNotificationGroups,
  type DataQualityNotificationRoute,
} from "./data-quality-notification-routing";

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

const routes: DataQualityNotificationRoute[] = [
  { id: "hr", resourceKey: "hr.roster", departmentId: null, recipientUsernames: ["hr-owner"] },
  { id: "dept-2", resourceKey: null, departmentId: 2, recipientUsernames: ["dept-2-owner"] },
  { id: "hr-dept-2", resourceKey: "hr.roster", departmentId: 2, recipientUsernames: ["hr-dept-2-owner"] },
];

test("data-quality notification routing applies exact, department, L2, then fallback precedence", () => {
  const groups = buildDataQualityNotificationGroups({
    findings: [
      finding("hr.roster", 2, "exact"),
      finding("work.tasks", 2, "department"),
      finding("hr.roster", 3, "l2"),
      finding("finance.ledger", 3, "fallback"),
    ],
    routes,
    fallbackRecipientUsernames: ["governance"],
  });

  assert.deepEqual(groups.map((group) => ({
    fingerprint: group.findings[0]?.fingerprint,
    route: group.matchedRouteId,
    recipients: group.recipientUsernames,
  })), [
    { fingerprint: "exact", route: "hr-dept-2", recipients: ["hr-dept-2-owner"] },
    { fingerprint: "department", route: "dept-2", recipients: ["dept-2-owner"] },
    { fingerprint: "l2", route: "hr", recipients: ["hr-owner"] },
    { fingerprint: "fallback", route: null, recipients: ["governance"] },
  ]);
});

test("data-quality notification routing never combines different L2 or departments", () => {
  const groups = buildDataQualityNotificationGroups({
    findings: [
      finding("hr.roster", 2, "hr-2-a"),
      finding("hr.roster", 2, "hr-2-b"),
      finding("hr.roster", 3, "hr-3"),
      finding("work.tasks", 2, "work-2"),
    ],
    fallbackRecipientUsernames: ["governance"],
  });

  assert.equal(groups.length, 3);
  assert.deepEqual(groups.map((group) => group.findings.map((item) => item.fingerprint)), [
    ["hr-2-a", "hr-2-b"],
    ["hr-3"],
    ["work-2"],
  ]);
});
