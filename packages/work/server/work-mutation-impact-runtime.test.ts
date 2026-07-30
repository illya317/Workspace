import assert from "node:assert/strict";
import test from "node:test";

import {
  MutationImpactConfigurationError,
  MutationImpactConfirmationError,
} from "@workspace/platform/server/mutation-impact";
import type { Prisma } from "@workspace/platform/server/prisma";
import { relationPolicyAdvisoryLockKey } from "@workspace/platform/server/relation-policy-config";
import {
  findRelationPolicyRuntimeGroup,
  listRelationPolicyRuntimeGroups,
} from "@workspace/platform/server/relation-policy-runtime";
import {
  buildWorkMutationImpactEngine,
  type WorkMutationImpactContext,
} from "./work-mutation-impact";
import {
  getWorkMutationImpactPolicyRevision,
  resolveWorkMutationImpactPolicy,
} from "./work-mutation-impact-runtime";

interface StoredConfigRow {
  policyKey: string;
  settingsJson: unknown;
  baselineHash: string;
  version: number;
  updatedByUserId: number | null;
  createdAt: Date;
  updatedAt: Date;
}

function configRow(input: {
  policyKey: string;
  settings: unknown;
  baselineHash: string;
  version: number;
}): StoredConfigRow {
  return {
    policyKey: input.policyKey,
    settingsJson: input.settings,
    baselineHash: input.baselineHash,
    version: input.version,
    updatedByUserId: 7,
    createdAt: new Date("2026-07-30T00:00:00.000Z"),
    updatedAt: new Date(Date.UTC(2026, 6, 30, 0, 0, input.version)),
  };
}

function contextWithConfigs(
  rows: StoredConfigRow[],
  onRead: () => void = () => undefined,
  onLock: (query: unknown) => void = () => undefined,
): WorkMutationImpactContext {
  const tx = {
    async $queryRaw(query: unknown) {
      onLock(query);
      return [];
    },
    relationPolicyConfig: {
      async findMany() {
        onRead();
        return rows;
      },
    },
  } as unknown as Prisma.TransactionClient;
  return {
    tx,
    actorUserId: 7,
    scopeType: "department",
    scopeId: "3",
  };
}

function runtimeGroup(policyKey: string) {
  const group = findRelationPolicyRuntimeGroup(policyKey);
  assert.ok(group, `missing runtime group ${policyKey}`);
  return group;
}

test("uses one transaction snapshot and applies an allowed lifecycle override", async () => {
  const group = runtimeGroup("work.plan.items");
  let reads = 0;
  const lockKeys: string[] = [];
  const expectedLockKeys = listRelationPolicyRuntimeGroups()
    .filter((item) => item.moduleKey === "work" && item.configurableTargetDelete.length > 1)
    .map((item) => relationPolicyAdvisoryLockKey(item.policyKey))
    .sort();
  const context = contextWithConfigs([
    configRow({
      policyKey: group.policyKey,
      settings: { targetDelete: "block" },
      baselineHash: group.baselineHash,
      version: 1,
    }),
  ], () => {
    assert.equal(lockKeys.length, expectedLockKeys.length, "policy locks must precede the config read");
    reads += 1;
  }, (query) => {
    const value = (query as { values?: unknown[] }).values?.[0];
    lockKeys.push(String(value));
  });

  assert.equal(await resolveWorkMutationImpactPolicy(context, group.policyKey, "delete"), "block");
  assert.equal(
    await resolveWorkMutationImpactPolicy(context, group.policyKey, "archive"),
    group.baseline.targetArchive,
  );
  assert.match(await getWorkMutationImpactPolicyRevision(context), /^work-mutation-impact-v2:relation-policy-/);
  assert.equal(reads, 1);
  assert.deepEqual(lockKeys, expectedLockKeys);
});

test("fails closed for stale baselines and disallowed overrides", async () => {
  const group = runtimeGroup("work.plan.items");
  const staleContext = contextWithConfigs([
    configRow({
      policyKey: group.policyKey,
      settings: { targetDelete: "block" },
      baselineHash: "0".repeat(64),
      version: 1,
    }),
  ]);
  await assert.rejects(
    resolveWorkMutationImpactPolicy(staleContext, group.policyKey, "delete"),
    (error) => error instanceof MutationImpactConfigurationError
      && /Settings 中复核/.test(error.message),
  );

  const invalidContext = contextWithConfigs([
    configRow({
      policyKey: group.policyKey,
      settings: { targetDelete: "retain" },
      baselineHash: group.baselineHash,
      version: 1,
    }),
  ]);
  await assert.rejects(
    resolveWorkMutationImpactPolicy(invalidContext, group.policyKey, "delete"),
    (error) => error instanceof MutationImpactConfigurationError
      && /不允许设置为 retain/.test(error.message),
  );
});

test("fails closed for non-empty retired overrides and accepts an audited empty reset", async () => {
  const context = contextWithConfigs([
    configRow({
      policyKey: "work.tasks.kpi-assignment.item",
      settings: { targetDelete: "retain" },
      baselineHash: "0".repeat(64),
      version: 9,
    }),
  ]);
  await assert.rejects(
    resolveWorkMutationImpactPolicy(context, "work.tasks.kpi-assignment.item", "delete"),
    (error) => error instanceof MutationImpactConfigurationError
      && /已退出可配置运行时/.test(error.message)
      && /Settings 中恢复系统预设/.test(error.message),
  );

  const resetContext = contextWithConfigs([
    configRow({
      policyKey: "work.tasks.kpi-assignment.item",
      settings: {},
      baselineHash: "0".repeat(64),
      version: 10,
    }),
  ]);
  assert.equal(
    await resolveWorkMutationImpactPolicy(resetContext, "work.tasks.kpi-assignment.item", "delete"),
    "block",
  );
});

test("invalidates an issued confirmation token when the persisted policy revision changes", async () => {
  const group = runtimeGroup("work.plan.items");
  const firstContext = contextWithConfigs([
    configRow({
      policyKey: group.policyKey,
      settings: { targetDelete: "block" },
      baselineHash: group.baselineHash,
      version: 1,
    }),
  ]);
  const changedContext = contextWithConfigs([
    configRow({
      policyKey: group.policyKey,
      settings: { targetDelete: "auto_cascade_owned" },
      baselineHash: group.baselineHash,
      version: 2,
    }),
  ]);
  const engine = buildWorkMutationImpactEngine({ secret: "work-runtime-test-secret" });
  const root = {
    entity: "NoImpactFixture",
    id: "1",
    label: "无影响测试对象",
    intent: "delete" as const,
    expectedVersion: 1,
  };
  const firstImpact = await engine.plan({
    context: firstContext,
    actorKey: "user:7",
    scopeKey: "department:3",
    root,
  });
  assert.notEqual(
    firstImpact.policyRevision,
    await getWorkMutationImpactPolicyRevision(changedContext),
  );

  let committed = false;
  await assert.rejects(
    engine.execute({
      context: changedContext,
      actorKey: "user:7",
      scopeKey: "department:3",
      root,
      confirmation: { impactToken: firstImpact.token, resolutions: [] },
      commitRoot() {
        committed = true;
        return "committed";
      },
    }),
    (error) => error instanceof MutationImpactConfirmationError
      && error.code === "MUTATION_IMPACT_CONFIRMATION_STALE",
  );
  assert.equal(committed, false);
});
