import assert from "node:assert/strict";
import test from "node:test";

import {
  createRelationCatalog,
  type SelectorRelationDefinition,
} from "./relation-registry";
import type { RelationPolicyReadStore } from "./relation-policy-config";
import { findRelationPolicyRuntimeGroup } from "./relation-policy-runtime";
import {
  preflightPhysicalRelationNulls,
  relationPolicyKeysForBusinessRequiredRelations,
  RelationPolicyPhysicalResolutionError,
  resolveConfiguredBusinessRequired,
  resolveConfiguredBusinessRequiredByRelation,
  validateConfiguredFkValue,
} from "./relation-policy-validation";

function readClient(rows: Array<{
  policyKey: string;
  settingsJson: unknown;
  baselineHash: string;
  version: number;
}> = []) {
  let reads = 0;
  const normalizedRows = rows.map((row) => ({
    ...row,
    updatedByUserId: 7,
    createdAt: new Date("2026-07-31T00:00:00.000Z"),
    updatedAt: new Date("2026-07-31T00:00:00.000Z"),
  }));
  const client: RelationPolicyReadStore = {
    relationPolicyConfig: {
      async findUnique({ where }) {
        return normalizedRows.find((row) => row.policyKey === where.policyKey) ?? null;
      },
      async findMany() {
        reads += 1;
        return normalizedRows;
      },
    },
  };
  return { client, reads: () => reads };
}

function selector(key: string, nullable: boolean): SelectorRelationDefinition {
  return {
    key,
    scope: "test",
    usage: "selector",
    semantics: "reference",
    physical: { sourceModel: "Source", sourceFields: ["targetId"], targetModel: "Target", targetFields: ["id"] },
    lifecycle: { targetDelete: null, targetArchive: null, targetRestore: null, sourceRelationChange: null },
    source: { entity: "Source", field: "targetId" },
    target: { entity: "Target", label: "目标" },
    nullable,
    permission: { resourceKey: "test", action: "read" },
    search: async () => [],
    resolve: async (id) => ({ id, label: `Target ${id}`, lifecycleStatus: "active" }),
  };
}

test("resolves multiple relation-level required baselines with one config read", async () => {
  const { client, reads } = readClient();
  const resolved = await resolveConfiguredBusinessRequiredByRelation([
    "work.plan.items",
    "work.plan.kpi-assignments",
  ], client);
  assert.deepEqual(resolved, {
    "work.plan.items": "required",
    "work.plan.kpi-assignments": "required",
  });
  assert.equal(reads(), 1);
  assert.equal(await resolveConfiguredBusinessRequired("work.plan.items", client), "required");
});

test("derives stable policy lock keys from business-required relation registrations", () => {
  const relationKey = "administration.contracts.owner.department";
  const group = findRelationPolicyRuntimeGroup(relationKey);
  assert.ok(group);
  assert.deepEqual(
    relationPolicyKeysForBusinessRequiredRelations([relationKey, relationKey]),
    [group.policyKey],
  );
  assert.throws(
    () => relationPolicyKeysForBusinessRequiredRelations(["unregistered.relation"]),
    /未注册业务必填运行时策略/,
  );
});

test("applies a relation-keyed configured required override", async () => {
  const relationKey = "administration.contracts.owner.department";
  const group = findRelationPolicyRuntimeGroup(relationKey);
  assert.ok(group);
  const { client } = readClient([{
    policyKey: group.policyKey,
    settingsJson: { businessRequiredByRelation: { [relationKey]: "required" } },
    baselineHash: group.baselineHash,
    version: 1,
  }]);
  assert.equal(await resolveConfiguredBusinessRequired(relationKey, client), "required");
});

test("an empty reset tombstone follows the current business-required baseline", async () => {
  const relationKey = "administration.contracts.owner.department";
  const group = findRelationPolicyRuntimeGroup(relationKey);
  assert.ok(group);
  const { client } = readClient([{
    policyKey: group.policyKey,
    settingsJson: {},
    baselineHash: "0".repeat(64),
    version: 9,
  }]);
  assert.equal(await resolveConfiguredBusinessRequired(relationKey, client), "optional");
});

test("configured FK validation overlays business required without a registry runtime import", async () => {
  const { client } = readClient();
  const catalog = createRelationCatalog([selector("work.plan.items", true)]);
  assert.deepEqual(await validateConfiguredFkValue(catalog, {
    fkKey: "work.plan.items",
    value: null,
    policyClient: client,
  }), {
    ok: false,
    error: "该字段不能为空，请先选择有效的 目标。",
    status: 400,
  });
});

test("configured FK validation fails closed when the stored baseline is stale", async () => {
  const { client } = readClient([{
    policyKey: "work.plan.items",
    settingsJson: { targetDelete: "block" },
    baselineHash: "0".repeat(64),
    version: 1,
  }]);
  const catalog = createRelationCatalog([selector("work.plan.items", true)]);
  const result = await validateConfiguredFkValue(catalog, {
    fkKey: "work.plan.items",
    value: 7,
    policyClient: client,
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 409);
    assert.match(result.error, /代码基线已变化/);
  }
});

test("physical null preflight resolves one Prisma delegate and counts any nullable source field", async () => {
  let received: unknown;
  const result = await preflightPhysicalRelationNulls({
    relationKey: "administration.contracts.owner.department",
    client: {
      contract: {
        async count(input: unknown) {
          received = input;
          return 2;
        },
      },
    },
  });
  assert.deepEqual(received, { where: { ownerDepartmentId: null } });
  assert.deepEqual(result, {
    relationKey: "administration.contracts.owner.department",
    sourceModel: "Contract",
    sourceFields: ["ownerDepartmentId"],
    nullCount: 2,
    safeToRequire: false,
  });
});

test("physical null preflight fails closed when a delegate cannot be uniquely resolved", async () => {
  await assert.rejects(preflightPhysicalRelationNulls({
    relationKey: "administration.contracts.owner.department",
    client: {
      Contract_: { count: async () => 0 },
      "contract-": { count: async () => 0 },
    },
  }), (error) => error instanceof RelationPolicyPhysicalResolutionError
    && /无法唯一解析/.test(error.message));
});
