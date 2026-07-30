import assert from "node:assert/strict";
import test from "node:test";

import {
  applyRelationPolicyOverride,
  compactRelationPolicyOverride,
  findRelationBusinessRequiredRuntimePolicy,
  findRelationPolicyRuntimeGroup,
  listRelationPolicyRuntimeGroups,
  relationPolicyRuntimeRevision,
} from "./relation-policy-runtime";

test("builds only explicitly configurable adapter groups and keeps shared adapters atomic", () => {
  const groups = listRelationPolicyRuntimeGroups();
  const keys = new Set(groups.map((group) => group.policyKey));
  for (const key of [
    "work.plan.items",
    "work.plan.kpi-assignments",
    "work.item.owned-details",
    "work.plan.owned-details",
    "work.report-item.work-item",
    "work.report-item.work-plan",
    "work.project.owned-children",
  ]) {
    assert.equal(keys.has(key), true, `missing configurable group ${key}`);
  }

  const projectChildren = findRelationPolicyRuntimeGroup("work.project.owned-children");
  assert.ok(projectChildren);
  assert.ok(projectChildren.relationKeys.length > 1);
  assert.equal(projectChildren.relationKeys.includes("work.projects.member.project"), false);
  assert.equal(projectChildren.relationKeys.includes("work.projects.enabling-department.project"), true);
  assert.equal(findRelationPolicyRuntimeGroup("work.project.memberships"), null);
  assert.deepEqual(projectChildren.configurableLifecycle.targetDelete, [
    "block",
    "auto_cascade_owned",
  ]);
  assert.deepEqual(projectChildren.configurableTargetDelete, [
    "block",
    "auto_cascade_owned",
  ]);
  assert.equal(
    projectChildren.businessRequiredByRelation["work.projects.enabling-department.project"]?.baseline,
    "required",
  );
  assert.match(projectChildren.baselineHash, /^[a-f0-9]{64}$/);
});

test("keeps legacy Work baseline hashes stable when no business-required choice is declared", () => {
  assert.deepEqual(Object.fromEntries(listRelationPolicyRuntimeGroups()
    .filter((group) => group.moduleKey === "work")
    .map((group) => [group.policyKey, group.baselineHash])), {
    "work.item.owned-details": "588445d1f71ae7980bb24eb2783d39a5a8b41eab149766f1013b455d751e19f1",
    "work.plan.items": "8e93470940df80bcdb12fc27e2bb11da51d8cd925098d23018027b72b82a243c",
    "work.plan.kpi-assignments": "b7ef010681ade942f21db93b091b36865b39a5c456c6c6b6b3ed6daafa75ec55",
    "work.plan.owned-details": "e049d1fc992889f4e547e4b8de7a60a68fa5698fdd05e26ff2326904bbaf8d5f",
    "work.project.owned-children": "3026c70ea1af6c77716a13437002fb5124cf7fd5a57a9461f32103bfc10bc69a",
    "work.report-item.work-item": "407f3b8b3411a00772282dc62caee98748e5e20bb5d8489188d05ea8d7bcb5a8",
    "work.report-item.work-plan": "09d9e42e57d70cab32e3512b3f664c0015af890aebd846b42d7c40cb2df516ed",
  });
});

test("does not promote an undeclared nullable relation into a business-required contract", () => {
  assert.equal(findRelationBusinessRequiredRuntimePolicy("work.report-item.work-item"), null);
  assert.equal(findRelationBusinessRequiredRuntimePolicy("work.plan.items")?.baseline, "required");
});

test("applies only current, allowed overrides and compacts code-baseline values", () => {
  const group = findRelationPolicyRuntimeGroup("work.plan.items");
  assert.ok(group);
  const settings = compactRelationPolicyOverride(group, {
    targetDelete: "block",
  });
  assert.deepEqual(settings, { targetDelete: "block" });

  const applied = applyRelationPolicyOverride(group, {
    policyKey: group.policyKey,
    settings,
    baselineHash: group.baselineHash,
    version: 1,
  });
  assert.equal(applied.stale, false);
  assert.equal(applied.overridden, true);
  assert.equal(applied.lifecycle.targetDelete, "block");
  assert.equal(applied.lifecycle.targetArchive, group.baseline.targetArchive);
  assert.equal(applied.businessRequiredByRelation["work.plan.items"], "required");

  const stale = applyRelationPolicyOverride(group, {
    policyKey: group.policyKey,
    settings,
    baselineHash: "0".repeat(64),
    version: 2,
  });
  assert.equal(stale.stale, true);
  assert.deepEqual(stale.lifecycle, group.baseline);
  assert.throws(
    () => compactRelationPolicyOverride(group, { sourceRelationChange: "block" }),
    /未知配置字段/,
  );
});

test("fails closed for legacy stored lifecycle fields hidden from Settings", () => {
  const group = findRelationPolicyRuntimeGroup("work.plan.items");
  assert.ok(group);
  const applied = applyRelationPolicyOverride(group, {
    policyKey: group.policyKey,
    settings: { targetArchive: "block" },
    baselineHash: group.baselineHash,
    version: 3,
  });
  assert.equal(applied.stale, true);
  assert.equal(applied.overridden, false);
  assert.equal(applied.lifecycle.targetArchive, group.baseline.targetArchive);
  assert.match(applied.error ?? "", /未知配置字段 targetArchive/);
});

test("changes the runtime revision when a persisted policy version changes", () => {
  const groups = listRelationPolicyRuntimeGroups();
  const group = findRelationPolicyRuntimeGroup("work.report-item.work-item");
  assert.ok(group);
  const first = relationPolicyRuntimeRevision(groups, [{
    policyKey: group.policyKey,
    settings: { targetDelete: "block" },
    baselineHash: group.baselineHash,
    version: 1,
  }]);
  const second = relationPolicyRuntimeRevision(groups, [{
    policyKey: group.policyKey,
    settings: { targetDelete: "block" },
    baselineHash: group.baselineHash,
    version: 2,
  }]);
  assert.notEqual(first, second);
});
