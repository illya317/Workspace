import assert from "node:assert/strict";
import test from "node:test";

import type { ImpactPlan, MutationImpactGroup } from "../mutation-impact-contract";
import type { Prisma } from "./prisma";
import type { MutationImpactAttemptAuditInput, MutationImpactAuditInput } from "./mutation-impact";
import { recordMutationImpactAttempt, recordMutationImpactLedger } from "./mutation-impact-ledger";

function group(
  relationKey: string,
  policy: MutationImpactGroup["policy"],
): MutationImpactGroup {
  return {
    relationKey,
    sourceEntity: "Plan",
    targetEntities: ["WorkItem"],
    policy,
    count: 1,
    samples: [],
    idsDigest: "digest",
    pathCount: 1,
    reason: "test",
    requiresPerItemPermission: false,
    hasNestedImpact: false,
    allowedResolutions: policy === "confirm_unlink" ? ["unlink"] : ["cascade"],
  };
}

function auditInput(): MutationImpactAuditInput<{ name: string }> {
  const plan: ImpactPlan = {
    token: "token",
    fingerprint: "fingerprint-v1",
    policyRevision: "policy-v3",
    expiresAt: "2026-07-17T01:00:00.000Z",
    root: {
      entity: "WorkPlan",
      id: "P1",
      label: "年度计划",
      intent: "restore",
      expectedVersion: 7,
    },
    blockers: [],
    confirmableEffects: [
      group("plan.children", "confirm_cascade"),
      group("plan.references", "confirm_unlink"),
    ],
    informationalEffects: [],
    allowedResolutions: ["return", "unlink", "cascade"],
    totals: { affected: 3, unlink: 1, cascade: 2, transition: 0, blocked: 0, retained: 0 },
  };
  return {
    context: { name: "caller-transaction" },
    actorKey: "user:9",
    scopeKey: "department:D1:team",
    root: plan.root,
    plan,
    selectedResolutions: [
      { relationKey: "plan.references", resolution: "unlink" },
      { relationKey: "plan.children", resolution: "cascade" },
    ],
    executedEffects: [
      {
        relationKey: "plan.references",
        resolution: "unlink",
        entity: "WorkReference",
        id: "R1",
        beforeRevision: "r2",
        depth: 1,
        relationPath: ["plan.references"],
      },
      {
        relationKey: "plan.children",
        resolution: "cascade",
        entity: "WorkItem",
        id: "C2",
        beforeRevision: 4,
        depth: 1,
        relationPath: ["plan.children"],
      },
      {
        relationKey: "plan.children",
        resolution: "cascade",
        entity: "WorkItem",
        id: "C1",
        beforeRevision: 3,
        depth: 1,
        relationPath: ["plan.children"],
      },
    ],
  };
}

interface CapturedCreate {
  data: {
    actorUserId: number | null;
    actorLabel: string | null;
    scopeType: string | null;
    scopeId: string | null;
    requestId: string | null;
    rootEntityType: string;
    rootEntityId: string;
    intent: string;
    policyRevision: string;
    impactFingerprint: string;
    resolutionsJson: string;
    status: string;
    sourceBatchId: string | null;
    startedAt: Date;
    finishedAt: Date;
    effects: { create: CapturedEffect[] };
  };
  select: { id: true };
}

interface CapturedEffect {
  sequence: number;
  relationKey: string;
  relationPathJson: string;
  policyKey: string;
  entityType: string;
  entityId: string;
  operation: string;
  beforeRevision: string | null;
  afterRevision: string | null;
  beforeSummaryJson: string | null;
  afterSummaryJson: string | null;
  changedInBatch: boolean;
}

function capturingTransaction(calls: CapturedCreate[]) {
  return {
    mutationImpactBatch: {
      create(input: CapturedCreate) {
        calls.push(input);
        return Promise.resolve({ id: "batch-1" });
      },
    },
  } as unknown as Prisma.TransactionClient;
}

test("records root and deterministic related effects in one caller transaction write", async () => {
  const calls: CapturedCreate[] = [];
  const result = await recordMutationImpactLedger({
    transaction: capturingTransaction(calls),
    audit: auditInput(),
    actorUserId: 9,
    actorLabel: "测试用户",
    requestId: "request-1",
    sourceBatchId: "archive-source",
    resolveAfterState(entity, id) {
      if (entity === "WorkReference") return null;
      return {
        revision: `${entity}:${id}:after`,
        summary: { status: "active", archived: false },
      };
    },
  });

  assert.deepEqual(result, { id: "batch-1" });
  assert.equal(calls.length, 1);
  const batch = calls[0]?.data;
  assert.ok(batch);
  assert.equal(batch.status, "succeeded");
  assert.equal(batch.actorUserId, 9);
  assert.equal(batch.actorLabel, "测试用户");
  assert.equal(batch.scopeType, "department");
  assert.equal(batch.scopeId, "D1:team");
  assert.equal(batch.requestId, "request-1");
  assert.equal(batch.sourceBatchId, "archive-source");
  assert.equal(batch.policyRevision, "policy-v3");
  assert.equal(batch.impactFingerprint, "fingerprint-v1");
  assert.equal(batch.startedAt, batch.finishedAt);
  assert.deepEqual(JSON.parse(batch.resolutionsJson), [
    { relationKey: "plan.children", resolution: "cascade" },
    { relationKey: "plan.references", resolution: "unlink" },
  ]);

  assert.deepEqual(batch.effects.create.map((effect) => [
    effect.sequence,
    effect.relationKey,
    effect.entityId,
    effect.operation,
    effect.beforeRevision,
    effect.afterRevision,
  ]), [
    [0, "$root", "P1", "restore", "7", "WorkPlan:P1:after"],
    [1, "plan.children", "C1", "restore", "3", "WorkItem:C1:after"],
    [2, "plan.children", "C2", "restore", "4", "WorkItem:C2:after"],
    [3, "plan.references", "R1", "unlink", "r2", null],
  ]);
  assert.equal(batch.effects.create[0]?.policyKey, "root_intent");
  assert.equal(batch.effects.create[1]?.policyKey, "confirm_cascade");
  assert.equal(batch.effects.create[3]?.policyKey, "confirm_unlink");
  assert.equal(batch.effects.create[1]?.afterSummaryJson, '{"archived":false,"status":"active"}');
  assert.ok(batch.effects.create.every((effect) => effect.changedInBatch));
});

test("rejects resolver summaries outside the scalar allowlist before writing", async () => {
  const calls: CapturedCreate[] = [];
  await assert.rejects(
    recordMutationImpactLedger({
      transaction: capturingTransaction(calls),
      audit: auditInput(),
      resolveAfterState() {
        return {
          revision: "after",
          summary: { secret: { token: "must-not-persist" } } as unknown as Record<string, string>,
        };
      },
    }),
    /只允许命名的有限标量字段/,
  );
  assert.equal(calls.length, 0);
});

test("records stale confirmation outside the business transaction with a minimal result", async () => {
  let captured: unknown;
  const successAudit = auditInput();
  const audit: MutationImpactAttemptAuditInput<{ name: string }> = {
    context: { name: "rolled-back-business-transaction" },
    actorKey: successAudit.actorKey,
    scopeKey: successAudit.scopeKey,
    root: successAudit.root,
    plan: successAudit.plan,
    status: "stale_confirmation",
    resultCode: "MUTATION_IMPACT_CONFIRMATION_STALE",
    resultMessage: "影响已变化",
  };

  await recordMutationImpactAttempt({
    audit,
    actorUserId: 9,
    requestId: "request-stale-1",
    database: {
      mutationImpactBatch: {
        create: async (input: unknown) => {
          captured = input;
          return { id: "attempt-1" };
        },
      } as Prisma.TransactionClient["mutationImpactBatch"],
    },
  });

  const data = (captured as { data: Record<string, unknown> }).data;
  assert.equal(data.status, "stale_confirmation");
  assert.equal(data.resultCode, "MUTATION_IMPACT_CONFIRMATION_STALE");
  assert.equal(data.impactFingerprint, "fingerprint-v1");
  assert.equal(data.effects, undefined);
});
