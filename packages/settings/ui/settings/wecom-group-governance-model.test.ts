import assert from "node:assert/strict";
import test from "node:test";

import {
  groupPolicyScheduleLabel,
  isManagedGroupReadyForPolicy,
  managedGroupGovernanceStage,
  managedGroupStatusView,
  managedGroupVerificationView,
  type ManagedWeComGroupRow,
} from "./wecom-group-governance-model";

function groupState(overrides: Partial<ManagedWeComGroupRow> = {}): ManagedWeComGroupRow {
  return {
    id: 1,
    groupKey: "group_test",
    displayName: null,
    status: "discovered",
    ownerUser: null,
    ownerPosition: null,
    discoveredAt: "2026-07-31T00:00:00.000Z",
    lastSeenAt: "2026-07-31T00:00:00.000Z",
    lastVerifiedAt: null,
    verificationStatus: "pending",
    version: 1,
    ...overrides,
  };
}

test("managed groups remain visibly fail closed until claimed and verified", () => {
  assert.equal(managedGroupStatusView("discovered").label, "待认领");
  assert.equal(managedGroupStatusView("unclaimed").label, "待验证");
  assert.equal(managedGroupVerificationView("pending").label, "待验证");
  assert.equal(managedGroupStatusView("active").label, "已启用");
});

test("group schedules expose the weekly Agent cadence", () => {
  assert.equal(groupPolicyScheduleLabel({ mode: "manual" }), "手动触发");
  assert.equal(groupPolicyScheduleLabel({ mode: "weekly", timezone: "Asia/Shanghai", weekday: 5, time: "17:30" }), "周五 17:30");
});

test("group governance follows directory, claim, verification, then policy", () => {
  const discovered = groupState();
  const claimed = groupState({
    displayName: "运营周报群",
    ownerUser: { id: 7, username: "owner", displayName: "负责人" },
    status: "unclaimed",
  });
  const ready = groupState({
    displayName: "运营周报群",
    ownerUser: { id: 7, username: "owner", displayName: "负责人" },
    status: "active",
    verificationStatus: "verified",
  });

  assert.equal(managedGroupGovernanceStage(discovered), "待认领：命名并指定负责人");
  assert.equal(managedGroupGovernanceStage(claimed), "已认领：等待验证 Bot 在群");
  assert.equal(isManagedGroupReadyForPolicy(claimed), false);
  assert.equal(managedGroupGovernanceStage(ready), "已就绪：配置每群策略与周报绑定");
  assert.equal(isManagedGroupReadyForPolicy(ready), true);
});
