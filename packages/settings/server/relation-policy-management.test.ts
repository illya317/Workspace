import assert from "node:assert/strict";
import test from "node:test";

import {
  RelationPolicyConfigConflictError,
  type RelationPolicyConfigSnapshot,
  type ResetRelationPolicyConfigInput,
  type WriteRelationPolicyConfigInput,
} from "@workspace/platform/server/relation-policy-config";
import type { RelationPolicyRuntimeGroup } from "@workspace/platform/server/relation-policy-runtime";
import type { RelationRegistration } from "@workspace/platform/server/relation-targets";

import type { DatabaseSchemaCatalog } from "../database-schema-contract";
import {
  RelationPolicyManagementConflictError,
  RelationPolicyManagementNotFoundError,
  RelationPolicyManagementValidationError,
  buildRelationPolicyManagementService,
} from "./relation-policy-management";
import { retiredPolicyRelationKey } from "./relation-policy-catalog";

const BASELINE_HASH = "a".repeat(64);
const STALE_HASH = "b".repeat(64);
const NOW = new Date("2026-07-30T03:00:00.000Z");

const registration: RelationRegistration = {
  key: "admin.employee.department",
  scope: "administration",
  source: { entity: "Employee", field: "departmentId" },
  target: "department",
  targetLabel: "所属部门",
  nullable: true,
  businessRequired: "optional",
  configurableBusinessRequired: ["optional", "required"],
  semantics: "reference",
  lifecycle: { targetDelete: "block" },
  configurableLifecycle: { targetDelete: ["block", "confirm_unlink"] },
  physical: { sourceModel: "Employee", sourceFields: ["departmentId"], targetModel: "Department", targetFields: ["id"] },
  adapterKey: "admin.employee.department",
  permission: { resourceKey: "administration.contracts", action: "read" },
};

const unknownRequiredRegistration: RelationRegistration = {
  key: "admin.employee.company",
  scope: "administration",
  source: { entity: "Employee", field: "companyId" },
  target: "company",
  targetLabel: "所属公司",
  nullable: true,
  semantics: "reference",
  lifecycle: { targetDelete: "block" },
  physical: null,
  permission: { resourceKey: "administration.contracts", action: "read" },
};

const runtimeGroup: RelationPolicyRuntimeGroup = {
  policyKey: "admin.employee.department",
  scope: "administration",
  moduleKey: "administration",
  title: "所属部门",
  relationKeys: [registration.key],
  references: [{
    relationKey: registration.key,
    sourceEntity: "Employee",
    sourceField: "departmentId",
    targetEntity: "Department",
    targetField: "id",
    targetLabel: "所属部门",
    nullable: true,
    semantics: "reference",
  }],
  baseline: {
    targetDelete: "block",
    targetArchive: "retain",
    targetRestore: "retain",
    sourceRelationChange: "retain",
  },
  configurableLifecycle: { targetDelete: ["block", "confirm_unlink"] },
  configurableTargetDelete: ["block", "confirm_unlink"],
  businessRequiredByRelation: {
    [registration.key]: {
      relationKey: registration.key,
      policyKey: "admin.employee.department",
      baseline: "optional",
      configurable: ["optional", "required"],
      physical: { sourceModel: "Employee", sourceFields: ["departmentId"] },
    },
  },
  baselineHash: BASELINE_HASH,
};

const schema: DatabaseSchemaCatalog = {
  databaseName: "workspace",
  schemaName: "public",
  generatedAt: NOW.toISOString(),
  groups: [],
  modules: [{
    key: "administration",
    label: "管理",
    level: "L1",
    directTableCount: 2,
    totalTableCount: 2,
    children: [],
  }],
  unassignedTableNames: ["LooseChild"],
  tables: [{
    name: "Employee",
    groupKey: "administration",
    moduleKey: "administration",
    columnCount: 2,
    inboundRelationCount: 0,
    outboundRelationCount: 1,
    columns: [
      { name: "id", type: "Int", required: true, primaryKey: true, foreignKey: false, ordinal: 1 },
      { name: "departmentId", type: "Int", required: false, primaryKey: false, foreignKey: true, ordinal: 2 },
    ],
  }, {
    name: "LooseChild",
    groupKey: "unassigned",
    moduleKey: null,
    columnCount: 1,
    inboundRelationCount: 0,
    outboundRelationCount: 1,
    columns: [{ name: "parentId", type: "Int", required: false, primaryKey: false, foreignKey: true, ordinal: 1 }],
  }],
  relations: [{
    key: "employee_department",
    constraintName: "Employee_departmentId_fkey",
    sourceTable: "Employee",
    sourceColumns: ["departmentId"],
    targetTable: "Department",
    targetColumns: ["id"],
    onDelete: "restrict",
  }, {
    key: "loose_parent",
    constraintName: "LooseChild_parentId_fkey",
    sourceTable: "LooseChild",
    sourceColumns: ["parentId"],
    targetTable: "LooseParent",
    targetColumns: ["id"],
    onDelete: "set-null",
  }],
};

function snapshot(
  settings: RelationPolicyConfigSnapshot["settings"],
  baselineHash = BASELINE_HASH,
  version = 2,
  policyKey = runtimeGroup.policyKey,
) {
  return {
    policyKey,
    settings,
    baselineHash,
    version,
    updatedByUserId: 7,
    createdAt: new Date("2026-07-30T01:00:00.000Z"),
    updatedAt: new Date("2026-07-30T02:00:00.000Z"),
  } satisfies RelationPolicyConfigSnapshot;
}

function mockService(initialConfigs: RelationPolicyConfigSnapshot[] = []) {
  let configs = [...initialConfigs];
  const writes: WriteRelationPolicyConfigInput[] = [];
  const resets: ResetRelationPolicyConfigInput[] = [];
  const preflights: string[] = [];
  const transactionClient = { kind: "relation-policy-test-transaction" };
  let preflightResult = { ok: true, blockingCount: 0 };
  const service = buildRelationPolicyManagementService({
    listRuntimeGroups: () => [runtimeGroup],
    findRuntimeGroup: (policyKey) => policyKey === runtimeGroup.policyKey ? runtimeGroup : null,
    listConfigs: async () => configs,
    listDatabaseSchema: async () => schema,
    listRegisteredRelations: () => [
      { moduleKey: "administration", registration },
      { moduleKey: "administration", registration: unknownRequiredRegistration },
    ],
    listModules: () => [
      { key: "administration", label: "管理" },
      { key: "zero", label: "零关系模块" },
    ],
    async writeConfig(input, options) {
      await options?.beforePersist?.(transactionClient);
      writes.push(input);
      const next = snapshot(input.settings, input.baselineHash, input.expectedVersion + 1, input.policyKey);
      configs = [next];
      return next;
    },
    async resetConfig(input, options) {
      await options?.beforePersist?.(transactionClient);
      resets.push(input);
      const next = snapshot({}, input.baselineHash, input.expectedVersion + 1, input.policyKey);
      configs = [next];
      return next;
    },
    async preflightBusinessRequired(input) {
      assert.equal(input.client, transactionClient);
      preflights.push(input.relationKey);
      return preflightResult;
    },
    now: () => NOW,
  });
  return {
    service,
    writes,
    resets,
    preflights,
    setPreflight: (result: typeof preflightResult) => { preflightResult = result; },
  };
}

test("catalog merges registrations, runtime policies, physical evidence, zero modules, and orphan FKs", async () => {
  const { service } = mockService([snapshot({
    targetDelete: "confirm_unlink",
    businessRequiredByRelation: { [registration.key]: "required" },
  })]);
  const catalog = await service.listCatalog();
  assert.equal(catalog.generatedAt, NOW.toISOString());
  assert.equal(catalog.modules.find((module) => module.key === "zero")?.relationCount, 0);

  const managed = catalog.relations.find((relation) => relation.relationKey === registration.key)!;
  assert.equal(managed.deleteLinkage.mode, "editable");
  assert.equal(managed.deleteLinkage.effective, "confirm_unlink");
  assert.equal(managed.businessRequired.mode, "editable");
  assert.equal(managed.businessRequired.effective, "required");
  assert.equal(managed.physicalEvidence?.constraintName, "Employee_departmentId_fkey");

  const unknown = catalog.relations.find((relation) => relation.relationKey === unknownRequiredRegistration.key)!;
  assert.equal(unknown.businessRequired.mode, "invalid");
  assert.equal(unknown.businessRequired.baseline, null);
  assert.equal(unknown.deleteLinkage.mode, "fixed");

  const orphan = catalog.relations.find((relation) => relation.orphanPhysical)!;
  assert.equal(orphan.moduleKey, "unassigned");
  assert.equal(orphan.deleteLinkage.mode, "invalid");
  assert.equal(orphan.businessRequired.mode, "invalid");
  assert.equal(orphan.physicalEvidence?.onDelete, "set-null");
});

test("empty reset tombstones use the current code baseline even with an old hash", async () => {
  const { service } = mockService([snapshot({}, STALE_HASH, 3)]);
  const item = (await service.listCatalog()).relations
    .find((relation) => relation.relationKey === registration.key)!;
  assert.equal(item.policyGroup?.stale, false);
  assert.equal(item.policyGroup?.overridden, false);
  assert.equal(item.deleteLinkage.effective, runtimeGroup.baseline.targetDelete);
  assert.equal(item.businessRequired.effective, "optional");
  assert.deepEqual(item.issues, []);
});

test("unregistered retired configs remain visible and allow reset only", async () => {
  const policyKey = "retired.missing.registration";
  const retired = snapshot({ targetDelete: "retain" }, STALE_HASH, 4, policyKey);
  const { service, writes, resets } = mockService([retired]);
  const relationKey = retiredPolicyRelationKey(policyKey);
  const item = (await service.listCatalog()).relations.find((relation) => relation.relationKey === relationKey);
  assert.equal(relationKey, policyKey);
  assert.equal(item?.moduleKey, "unassigned");
  assert.equal(item?.policyGroup?.policyKey, policyKey);
  assert.equal(item?.policyGroup?.stale, true);
  assert.equal(item?.deleteLinkage.mode, "invalid");

  await assert.rejects(service.mutate({
    relationKey,
    policyKey,
    baselineHash: STALE_HASH,
    expectedVersion: 4,
    settings: { targetDelete: "block" },
    reason: "不能写回退役策略",
  }, 7), /只允许恢复系统预设/);
  await assert.rejects(service.mutate({
    relationKey,
    policyKey,
    baselineHash: BASELINE_HASH,
    expectedVersion: 4,
    reset: true,
    reason: "错误哈希不能重置",
  }, 7), RelationPolicyManagementConflictError);
  assert.equal(writes.length, 0);
  assert.equal(resets.length, 0);

  const catalog = await service.mutate({
    relationKey,
    policyKey,
    baselineHash: STALE_HASH,
    expectedVersion: 4,
    reset: true,
    reason: "清理无登记的退役配置",
  }, 7);
  assert.equal(resets.length, 1);
  assert.equal(resets[0]?.policyKey, policyKey);
  assert.equal(resets[0]?.baselineHash, STALE_HASH);
  assert.equal(resets[0]?.expectedVersion, 4);
  assert.equal(catalog.relations.some((relation) => relation.relationKey === relationKey), false);
});

test("patch merges writable settings and preflights optional-to-required changes", async () => {
  const { service, writes, preflights } = mockService([snapshot({ targetDelete: "confirm_unlink" })]);
  const catalog = await service.mutate({
    relationKey: registration.key,
    policyKey: runtimeGroup.policyKey,
    baselineHash: BASELINE_HASH,
    expectedVersion: 2,
    settings: { businessRequired: "required" },
    reason: "  管理员确认无空值  ",
  }, 7);
  assert.deepEqual(preflights, [registration.key]);
  assert.equal(catalog.relations.find((item) => item.relationKey === registration.key)?.businessRequired.effective, "required");
  assert.deepEqual(writes[0]?.settings, {
    targetDelete: "confirm_unlink",
    businessRequiredByRelation: { [registration.key]: "required" },
  });
  assert.equal(writes[0]?.reason, "管理员确认无空值");
});

test("failed required preflight and hidden legacy overrides fail closed; reset remains available", async () => {
  const blocked = mockService();
  blocked.setPreflight({ ok: false, blockingCount: 3 });
  await assert.rejects(blocked.service.mutate({
    relationKey: registration.key,
    policyKey: runtimeGroup.policyKey,
    baselineHash: BASELINE_HASH,
    expectedVersion: 0,
    settings: { businessRequired: "required" },
    reason: "尝试设为必填",
  }, 7), /3 条空值记录/);
  assert.equal(blocked.writes.length, 0);
  await assert.rejects(blocked.service.mutate({
    relationKey: registration.key,
    policyKey: runtimeGroup.policyKey,
    baselineHash: BASELINE_HASH,
    expectedVersion: 0,
    settings: { targetArchive: "block" } as never,
    reason: "尝试写隐藏字段",
  }, 7), /不可写字段/);

  const legacy = mockService([snapshot({ targetArchive: "block" })]);
  const item = (await legacy.service.listCatalog()).relations.find((relation) => relation.relationKey === registration.key)!;
  assert.equal(item.policyGroup?.stale, true);
  assert.equal(item.deleteLinkage.mode, "invalid");
  await assert.rejects(legacy.service.mutate({
    relationKey: registration.key,
    policyKey: runtimeGroup.policyKey,
    baselineHash: BASELINE_HASH,
    expectedVersion: 2,
    settings: { targetDelete: "confirm_unlink" },
    reason: "不能覆盖隐藏字段",
  }, 7), RelationPolicyManagementValidationError);
  await legacy.service.mutate({
    relationKey: registration.key,
    policyKey: runtimeGroup.policyKey,
    baselineHash: BASELINE_HASH,
    expectedVersion: 2,
    reset: true,
    reason: "恢复代码基线",
  }, 7);
  assert.equal(legacy.resets.length, 1);
});

test("reset preflights required baselines when stored required state is stale or legacy", async () => {
  const requiredRegistration: RelationRegistration = {
    ...registration,
    key: "admin.employee.required-department",
    adapterKey: "admin.employee.required-department",
    businessRequired: "required",
    configurableBusinessRequired: ["required", "optional"],
  };
  const requiredGroup: RelationPolicyRuntimeGroup = {
    ...runtimeGroup,
    policyKey: requiredRegistration.adapterKey!,
    relationKeys: [requiredRegistration.key],
    references: runtimeGroup.references.map((reference) => ({
      ...reference,
      relationKey: requiredRegistration.key,
    })),
    configurableLifecycle: {
      ...runtimeGroup.configurableLifecycle,
      targetArchive: ["retain", "block"],
    },
    businessRequiredByRelation: {
      [requiredRegistration.key]: {
        relationKey: requiredRegistration.key,
        policyKey: requiredRegistration.adapterKey!,
        baseline: "required",
        configurable: ["required", "optional"],
        physical: { sourceModel: "Employee", sourceFields: ["departmentId"] },
      },
    },
  };
  const invalidConfigs = [
    snapshot({
      businessRequiredByRelation: { [requiredRegistration.key]: "required" },
    }, STALE_HASH, 2, requiredGroup.policyKey),
    snapshot({
      targetArchive: "block",
      businessRequiredByRelation: { [requiredRegistration.key]: "required" },
    }, BASELINE_HASH, 2, requiredGroup.policyKey),
  ];

  for (const current of invalidConfigs) {
    const preflights: string[] = [];
    const resets: ResetRelationPolicyConfigInput[] = [];
    const transactionClient = { kind: "required-reset-transaction" };
    const service = buildRelationPolicyManagementService({
      listRuntimeGroups: () => [requiredGroup],
      findRuntimeGroup: (policyKey) => policyKey === requiredGroup.policyKey ? requiredGroup : null,
      listConfigs: async () => [current],
      listDatabaseSchema: async () => schema,
      listRegisteredRelations: () => [{ moduleKey: "administration", registration: requiredRegistration }],
      listModules: () => [{ key: "administration", label: "管理" }],
      async writeConfig() { throw new Error("unexpected write"); },
      async resetConfig(input, options) {
        await options?.beforePersist?.(transactionClient);
        resets.push(input);
        return snapshot({}, input.baselineHash, input.expectedVersion + 1, input.policyKey);
      },
      async preflightBusinessRequired(input) {
        assert.equal(input.client, transactionClient);
        preflights.push(input.relationKey);
        return { ok: false, blockingCount: 1 };
      },
      now: () => NOW,
    });

    await assert.rejects(service.mutate({
      relationKey: requiredRegistration.key,
      policyKey: requiredGroup.policyKey,
      baselineHash: BASELINE_HASH,
      expectedVersion: 2,
      reset: true,
      reason: "恢复必填基线",
    }, 7), /1 条空值记录/);
    assert.deepEqual(preflights, [requiredRegistration.key]);
    assert.equal(resets.length, 0);
  }
});

test("identity, baseline and storage conflicts remain typed at the service boundary", async () => {
  const { service } = mockService();
  await assert.rejects(service.mutate({
    relationKey: "unknown",
    policyKey: "unknown",
    baselineHash: BASELINE_HASH,
    expectedVersion: 0,
    reset: true,
    reason: "未知关系",
  }, 7), RelationPolicyManagementNotFoundError);
  await assert.rejects(service.mutate({
    relationKey: registration.key,
    policyKey: runtimeGroup.policyKey,
    baselineHash: STALE_HASH,
    expectedVersion: 0,
    reset: true,
    reason: "旧基线",
  }, 7), RelationPolicyManagementConflictError);

  const conflict = buildRelationPolicyManagementService({
    listRuntimeGroups: () => [runtimeGroup],
    findRuntimeGroup: () => runtimeGroup,
    listConfigs: async () => [],
    listDatabaseSchema: async () => schema,
    listRegisteredRelations: () => [{ moduleKey: "administration", registration }],
    listModules: () => [],
    async writeConfig() { throw new RelationPolicyConfigConflictError(runtimeGroup.policyKey, 0, 1); },
    async resetConfig() { throw new Error("unexpected reset"); },
    async preflightBusinessRequired() { return { ok: true }; },
    now: () => NOW,
  });
  await assert.rejects(conflict.mutate({
    relationKey: registration.key,
    policyKey: runtimeGroup.policyKey,
    baselineHash: BASELINE_HASH,
    expectedVersion: 0,
    settings: { targetDelete: "confirm_unlink" },
    reason: "并发更新",
  }, 7), (error) => error instanceof RelationPolicyManagementConflictError && error.actualVersion === 1);
});
