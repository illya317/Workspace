import assert from "node:assert/strict";
import test from "node:test";

import type { Prisma } from "@workspace/platform/server/prisma";

import { projectMutationImpactAdapters } from "./work-project-mutation-impact-adapters";

function inspection(tx: Prisma.TransactionClient) {
  const current = {
    entity: "Project",
    id: "42",
    label: "测试项目",
    intent: "delete" as const,
    expectedVersion: 1,
  };
  return {
    context: { tx },
    actorKey: "user:7",
    scopeKey: "project:42",
    root: current,
    current,
    depth: 0,
    relationPath: [],
  };
}

test("keeps Restrict project memberships out of the configurable physical-cascade group", async () => {
  const tx = {
    employeeProject: { findMany: async () => [{ id: 11 }] },
    projectEnablingDepartment: { findMany: async () => [{ id: 21 }] },
    projectPlanPhase: { findMany: async () => [] },
    projectPlanDependency: { findMany: async () => [] },
    projectPlanBaseline: { findMany: async () => [] },
    projectWorkAssignee: { findMany: async () => [] },
  } as unknown as Prisma.TransactionClient;
  const adapters = projectMutationImpactAdapters({ workItemRevision: () => "revision" });
  const memberships = adapters.find((adapter) => adapter.relationKey === "work.project.memberships");
  const ownedChildren = adapters.find((adapter) => adapter.relationKey === "work.project.owned-children");
  assert.ok(memberships);
  assert.ok(ownedChildren);

  const membershipImpact = await memberships.inspect(inspection(tx));
  assert.equal(membershipImpact?.policy, "block");
  assert.deepEqual(membershipImpact?.records.map((record) => record.entity), ["EmployeeProject"]);

  const ownedImpact = await ownedChildren.inspect(inspection(tx));
  assert.deepEqual(ownedImpact?.records.map((record) => record.entity), ["ProjectEnablingDepartment"]);
});
