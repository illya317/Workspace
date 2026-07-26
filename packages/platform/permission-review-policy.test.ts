import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluatePermissionReview,
  shouldRepeatPermissionReviewFinding,
  type PermissionReviewSnapshot,
  type TenantPermissionReviewPolicy,
} from "./permission-review-policy";

test("workflow separation advisories notify once but do not enter daily escalation", () => {
  assert.equal(shouldRepeatPermissionReviewFinding("warning", "daily", 48, 24), false);
  assert.equal(shouldRepeatPermissionReviewFinding("high", "daily", 24, 24), true);
  assert.equal(shouldRepeatPermissionReviewFinding("critical", "permission_mutation", 48, 24), false);
});

const policy: TenantPermissionReviewPolicy = {
  version: 1,
  schedule: { dailyAt: "08:00", timeZone: "Etc/UTC" },
  actorUsername: "ci-release-operator",
  notificationRecipientUsernames: ["admin"],
  remindOpenAfterHours: 24,
  expectedResourceTopology: [
    { resourceKey: "production", parentResourceKey: null },
    { resourceKey: "production.qc", parentResourceKey: "production" },
  ],
  expectedGrants: [{
    subjectType: "position",
    subjectKey: "GW-QC-01",
    resourceKey: "production.qc",
    actionKey: "approve",
    scopeId: null,
  }],
  expectedDirectGrantUserRoles: [],
  expectedGrantSubjectAssignments: [],
  expectedImplicitGrantManagerPositionCodes: ["GW-IT-01"],
  separationOfDuties: [{
    key: "qc-maker-reviewer",
    resourceKey: "production.qc",
    leftActionKey: "update",
    rightActionKey: "approve",
    description: "填报人与复核人分离",
  }],
};

function cleanSnapshot(): PermissionReviewSnapshot {
  return {
    resourceTopology: policy.expectedResourceTopology,
    grants: [{
      ...policy.expectedGrants[0]!,
      subjectLabel: "质量经理",
      subjectOperational: true,
      resourceEnabled: true,
      actionValid: true,
      actionSupported: true,
    }],
    directGrantUserRoles: [],
    grantSubjectAssignments: [],
    implicitGrantManagerPositionCodes: ["GW-IT-01"],
    separationCollisions: [],
  };
}

test("approved topology and grants produce no findings", () => {
  assert.deepEqual(evaluatePermissionReview(policy, cleanSnapshot()), []);
});

test("detects moved resources and both missing and unexpected grants", () => {
  const snapshot = cleanSnapshot();
  snapshot.resourceTopology = [
    { resourceKey: "production", parentResourceKey: null },
    { resourceKey: "production.qc", parentResourceKey: "inventory" },
  ];
  snapshot.grants = [{
    ...snapshot.grants[0]!,
    subjectKey: "GW-WRONG-01",
    subjectLabel: "无关岗位",
  }];
  const codes = evaluatePermissionReview(policy, snapshot).map((item) => item.code);
  assert.ok(codes.includes("resource_moved"));
  assert.ok(codes.includes("unexpected_grant"));
  assert.ok(codes.includes("expected_grant_missing"));
});

test("detects an unexpected basic read grant, not only high-risk actions", () => {
  const snapshot = cleanSnapshot();
  snapshot.grants.push({
    subjectType: "user",
    subjectKey: "unrelated-user",
    subjectLabel: "无关人员",
    subjectOperational: true,
    resourceKey: "production.qc",
    actionKey: "read",
    scopeId: null,
    resourceEnabled: true,
    actionValid: true,
    actionSupported: true,
  });
  const finding = evaluatePermissionReview(policy, snapshot)
    .find((item) => item.code === "unexpected_grant");
  assert.equal(finding?.actionKey, "read");
  assert.equal(finding?.subjectKey, "unrelated-user");
});

test("detects inactive subjects, unsupported actions and separation conflicts", () => {
  const snapshot = cleanSnapshot();
  snapshot.grants[0] = {
    ...snapshot.grants[0]!,
    subjectOperational: false,
    actionSupported: false,
  };
  snapshot.separationCollisions = [{
    ruleKey: "qc-maker-reviewer",
    userKey: "someone",
    userLabel: "某员工",
    resourceKey: "production.qc",
    scopeId: null,
    leftActionKey: "update",
    rightActionKey: "approve",
  }];
  const codes = evaluatePermissionReview(policy, snapshot).map((item) => item.code);
  assert.ok(codes.includes("inactive_subject_has_grant"));
  assert.ok(codes.includes("unsupported_permission_action"));
  assert.ok(codes.includes("separation_of_duties_conflict"));
  assert.equal(
    evaluatePermissionReview(policy, snapshot)
      .find((item) => item.code === "separation_of_duties_conflict")?.severity,
    "warning",
  );
});
