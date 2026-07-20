import assert from "node:assert/strict";
import test from "node:test";

import type {
  ImpactResolutionInput,
  MutationImpactPolicy,
  MutationImpactResolution,
  MutationImpactRoot,
  MutationIntent,
} from "../../mutation-impact-contract";
import {
  createMutationImpactEngine,
  MutationImpactConfirmationError,
  MutationImpactLimitError,
  MutationImpactRequiredError,
  type MutationImpactAdapter,
  type MutationImpactEngineOptions,
  type MutationImpactRecord,
  type MutationImpactTokenClaims,
} from "./index";

interface TestRelationData {
  policy: MutationImpactPolicy;
  records: MutationImpactRecord[];
}

interface TestContext {
  relations: Map<string, TestRelationData>;
  events: string[];
  failRelation?: string;
}

const ROOT: MutationImpactRoot = {
  entity: "Plan",
  id: "P1",
  label: "年度计划",
  intent: "delete",
  expectedVersion: 3,
};

function relationDataKey(entity: string, id: string, relationKey: string) {
  return `${entity}:${id}:${relationKey}`;
}

function setRelation(
  context: TestContext,
  source: Pick<MutationImpactRoot, "entity" | "id">,
  relationKey: string,
  policy: MutationImpactPolicy,
  records: MutationImpactRecord[],
) {
  context.relations.set(relationDataKey(source.entity, source.id, relationKey), { policy, records });
}

function makeAdapter(input: {
  relationKey: string;
  sourceEntity: string;
  intents?: readonly MutationIntent[];
  executionPriority?: number;
}): MutationImpactAdapter<TestContext> {
  const execute = async (resolution: MutationImpactResolution, context: TestContext, records: readonly MutationImpactRecord[]) => {
    context.events.push(`${resolution}:${input.relationKey}:${records.map((record) => record.id).join(",")}`);
    if (context.failRelation === input.relationKey) throw new Error(`adapter failed: ${input.relationKey}`);
  };
  return {
    relationKey: input.relationKey,
    sourceEntity: input.sourceEntity,
    intents: input.intents ?? ["delete", "archive", "restore", "transition"],
    executionPriority: input.executionPriority,
    inspect({ context, current }) {
      const data = context.relations.get(relationDataKey(current.entity, current.id, input.relationKey));
      return data ? { ...data, reason: `${input.relationKey} impact` } : null;
    },
    unlink: ({ context, effects }) => execute("unlink", context, effects.map((effect) => effect.record)),
    cascade: ({ context, effects }) => execute("cascade", context, effects.map((effect) => effect.record)),
    transition: ({ context, effects }) => execute("transition_related", context, effects.map((effect) => effect.record)),
  };
}

function deterministicTokenCodec() {
  return {
    seal(claims: MutationImpactTokenClaims) {
      return Buffer.from(JSON.stringify(claims)).toString("base64url");
    },
    open(token: string) {
      return JSON.parse(Buffer.from(token, "base64url").toString("utf8")) as unknown;
    },
  };
}

function testEngine(
  context: TestContext,
  adapters: readonly MutationImpactAdapter<TestContext>[],
  overrides: Partial<MutationImpactEngineOptions<TestContext>> = {},
) {
  return createMutationImpactEngine<TestContext>({
    adapters,
    tokenCodec: deterministicTokenCodec(),
    getPolicyRevision: () => "policy-v1",
    now: () => new Date("2026-07-17T00:00:00.000Z"),
    ...overrides,
    resolvePolicy: overrides.resolvePolicy ?? (({ context: currentContext, relationKey }) => {
      const suffix = `:${relationKey}`;
      return [...currentContext.relations.entries()]
        .find(([key]) => key.endsWith(suffix))?.[1].policy ?? "retain";
    }),
  });
}

function request(context: TestContext, root = ROOT) {
  return { context, actorKey: "user:7", scopeKey: "department:3", root };
}

function confirmation(impactToken: string, resolutions: ImpactResolutionInput["resolutions"]): ImpactResolutionInput {
  return { impactToken, resolutions };
}

test("no-impact execution commits directly in the caller context", async () => {
  const context: TestContext = { relations: new Map(), events: [] };
  const engine = testEngine(context, []);
  const impact = await engine.plan(request(context));
  assert.deepEqual(impact.totals, {
    affected: 0,
    unlink: 0,
    cascade: 0,
    transition: 0,
    blocked: 0,
    retained: 0,
  });
  const result = await engine.execute({ ...request(context), commitRoot: () => "committed" });
  assert.equal(result, "committed");
});

test("plan is pure, stable, grouped, and counts targets by entity and id", async () => {
  const context: TestContext = { relations: new Map(), events: [] };
  const adapters = [
    makeAdapter({ relationKey: "plan.transition", sourceEntity: "Plan" }),
    makeAdapter({ relationKey: "plan.retain", sourceEntity: "Plan" }),
    makeAdapter({ relationKey: "plan.cascade", sourceEntity: "Plan" }),
    makeAdapter({ relationKey: "plan.unlink", sourceEntity: "Plan" }),
    makeAdapter({ relationKey: "plan.block", sourceEntity: "Plan" }),
  ];
  const shared = { entity: "Reference", id: "R1", label: "共享引用" };
  setRelation(context, ROOT, "plan.block", "block", [shared]);
  setRelation(context, ROOT, "plan.unlink", "confirm_unlink", [shared]);
  setRelation(context, ROOT, "plan.cascade", "confirm_cascade", [
    { entity: "Child", id: "C2", label: "子项 2" },
    { entity: "Child", id: "C1", label: "子项 1" },
  ]);
  setRelation(context, ROOT, "plan.transition", "confirm_transition_related", [
    { entity: "Goal", id: "G1", label: "目标", intent: "transition" },
  ]);
  setRelation(context, ROOT, "plan.retain", "retain", [
    { entity: "Snapshot", id: "S1", label: "历史快照" },
  ]);

  const engine = testEngine(context, adapters);
  const first = await engine.plan(request(context));
  context.relations.get(relationDataKey("Plan", "P1", "plan.cascade"))?.records.reverse();
  const second = await engine.plan(request(context));

  assert.equal(first.fingerprint, second.fingerprint);
  assert.deepEqual(first.blockers.map((group) => group.relationKey), ["plan.block"]);
  assert.deepEqual(first.confirmableEffects.map((group) => group.relationKey), [
    "plan.cascade",
    "plan.transition",
    "plan.unlink",
  ]);
  assert.deepEqual(first.informationalEffects.map((group) => group.relationKey), ["plan.retain"]);
  assert.deepEqual(first.allowedResolutions, ["return"]);
  assert.deepEqual(first.totals, {
    affected: 5,
    unlink: 1,
    cascade: 2,
    transition: 1,
    blocked: 1,
    retained: 1,
  });
  assert.deepEqual(first.confirmableEffects[0]?.samples.map((sample) => sample.id), ["C1", "C2"]);
  assert.deepEqual(context.events, []);
});

test("planner terminates cycles and deduplicates multi-path targets", async () => {
  const context: TestContext = { relations: new Map(), events: [] };
  const adapter = makeAdapter({ relationKey: "node.children", sourceEntity: "Node", intents: ["delete"] });
  const root = { ...ROOT, entity: "Node", id: "A", label: "A" };
  setRelation(context, root, adapter.relationKey, "confirm_cascade", [
    { entity: "Node", id: "C", label: "C" },
    { entity: "Node", id: "B", label: "B" },
  ]);
  setRelation(context, { entity: "Node", id: "B" }, adapter.relationKey, "confirm_cascade", [
    { entity: "Node", id: "D", label: "D" },
    { entity: "Node", id: "A", label: "A" },
  ]);
  setRelation(context, { entity: "Node", id: "C" }, adapter.relationKey, "confirm_cascade", [
    { entity: "Node", id: "D", label: "D" },
  ]);

  const impact = await testEngine(context, [adapter]).plan(request(context, root));
  const group = impact.confirmableEffects[0];
  assert.equal(group?.count, 4);
  assert.equal(group?.pathCount, 5);
  assert.equal(group?.hasNestedImpact, true);
  assert.equal(impact.fingerprint.length, 64);
});

test("planner fails closed at depth and node limits", async () => {
  const context: TestContext = { relations: new Map(), events: [] };
  const adapter = makeAdapter({ relationKey: "node.children", sourceEntity: "Node", intents: ["delete"] });
  const root = { ...ROOT, entity: "Node", id: "A", label: "A" };
  setRelation(context, root, adapter.relationKey, "confirm_cascade", [{ entity: "Node", id: "B", label: "B" }]);
  setRelation(context, { entity: "Node", id: "B" }, adapter.relationKey, "confirm_cascade", [
    { entity: "Node", id: "C", label: "C" },
  ]);

  const depthEngine = testEngine(context, [adapter], { limits: { maxDepth: 1 } });
  await assert.rejects(depthEngine.plan(request(context, root)), MutationImpactLimitError);
  const nodeEngine = testEngine(context, [adapter], { limits: { maxNodes: 2 } });
  await assert.rejects(nodeEngine.plan(request(context, root)), MutationImpactLimitError);
});

function configuredExecutionContext() {
  const context: TestContext = { relations: new Map(), events: [] };
  const adapters = [
    makeAdapter({ relationKey: "plan.refs", sourceEntity: "Plan" }),
    makeAdapter({ relationKey: "plan.children", sourceEntity: "Plan" }),
    makeAdapter({ relationKey: "child.details", sourceEntity: "Child" }),
    makeAdapter({ relationKey: "plan.transition", sourceEntity: "Plan" }),
    makeAdapter({ relationKey: "plan.history", sourceEntity: "Plan" }),
  ];
  setRelation(context, ROOT, "plan.refs", "confirm_unlink", [{ entity: "Reference", id: "R1", label: "引用" }]);
  setRelation(context, ROOT, "plan.children", "confirm_cascade", [
    { entity: "Child", id: "C1", label: "子项", expectedVersion: 11 },
  ]);
  setRelation(context, { entity: "Child", id: "C1" }, "child.details", "auto_cascade_owned", [
    { entity: "Detail", id: "D1", label: "明细", expectedVersion: 7 },
  ]);
  setRelation(context, ROOT, "plan.transition", "confirm_transition_related", [
    { entity: "Goal", id: "G1", label: "目标", intent: "transition" },
  ]);
  setRelation(context, ROOT, "plan.history", "retain", [{ entity: "Snapshot", id: "S1", label: "快照" }]);
  return { context, adapters };
}

const VALID_CHOICES = [
  { relationKey: "plan.children", resolution: "cascade" as const },
  { relationKey: "plan.refs", resolution: "unlink" as const },
  { relationKey: "plan.transition", resolution: "transition_related" as const },
];

test("execute requires confirmation, then runs unlink, deep effects, root commit, and audit", async () => {
  const { context, adapters } = configuredExecutionContext();
  const engine = testEngine(context, adapters, {
    audit({ context: auditContext, selectedResolutions, executedEffects }) {
      assert.deepEqual(selectedResolutions, VALID_CHOICES);
      assert.equal(executedEffects.length, 4);
      assert.equal(executedEffects.find((effect) => effect.id === "C1")?.beforeRevision, 11);
      assert.equal(executedEffects.find((effect) => effect.id === "D1")?.beforeRevision, 7);
      auditContext.events.push("audit");
    },
  });
  const impact = await engine.plan(request(context));
  await assert.rejects(
    engine.execute({ ...request(context), commitRoot: () => context.events.push("root") }),
    (error) => error instanceof MutationImpactRequiredError && error.reason === "confirmation_required",
  );
  assert.deepEqual(context.events, []);

  const result = await engine.execute({
    ...request(context),
    confirmation: confirmation(impact.token, VALID_CHOICES),
    commitRoot: () => {
      context.events.push("root");
      return "done";
    },
  });
  assert.equal(result, "done");
  assert.deepEqual(context.events, [
    "unlink:plan.refs:R1",
    "cascade:child.details:D1",
    "cascade:plan.children:C1",
    "transition_related:plan.transition:G1",
    "root",
    "audit",
  ]);
});

test("blockers can never execute", async () => {
  const context: TestContext = { relations: new Map(), events: [] };
  const adapter = makeAdapter({ relationKey: "plan.block", sourceEntity: "Plan" });
  setRelation(context, ROOT, adapter.relationKey, "block", [{ entity: "Task", id: "T1", label: "未完成任务" }]);
  const engine = testEngine(context, [adapter]);
  const impact = await engine.plan(request(context));
  await assert.rejects(
    engine.execute({
      ...request(context),
      confirmation: confirmation(impact.token, []),
      commitRoot: () => context.events.push("root"),
    }),
    (error) => error instanceof MutationImpactRequiredError && error.reason === "blocked",
  );
  assert.deepEqual(context.events, []);
});

test("unlink-or-cascade only expands the selected cascade branch", async () => {
  const context: TestContext = { relations: new Map(), events: [] };
  const dual = makeAdapter({ relationKey: "plan.flexible", sourceEntity: "Plan" });
  const childBlock = makeAdapter({ relationKey: "child.block", sourceEntity: "Child" });
  setRelation(context, ROOT, dual.relationKey, "confirm_unlink_or_cascade", [
    { entity: "Child", id: "C1", label: "可解除子项" },
  ]);
  setRelation(context, { entity: "Child", id: "C1" }, childBlock.relationKey, "block", [
    { entity: "Fact", id: "F1", label: "深层事实" },
  ]);
  const engine = testEngine(context, [dual, childBlock]);
  const impact = await engine.plan(request(context));
  assert.deepEqual(impact.blockers, []);

  await engine.execute({
    ...request(context),
    confirmation: confirmation(impact.token, [{ relationKey: dual.relationKey, resolution: "unlink" }]),
    commitRoot: () => context.events.push("root"),
  });
  assert.deepEqual(context.events, ["unlink:plan.flexible:C1", "root"]);

  context.events.length = 0;
  await assert.rejects(
    engine.execute({
      ...request(context),
      confirmation: confirmation(impact.token, [{ relationKey: dual.relationKey, resolution: "cascade" }]),
      commitRoot: () => context.events.push("root"),
    }),
    (error) => error instanceof MutationImpactRequiredError
      && error.reason === "blocked"
      && error.impact.blockers[0]?.relationKey === "child.block",
  );
  assert.deepEqual(context.events, []);
});

test("cascade branch issues a refreshed token before executing newly discovered effects", async () => {
  const context: TestContext = { relations: new Map(), events: [] };
  const dual = makeAdapter({ relationKey: "plan.flexible", sourceEntity: "Plan" });
  const details = makeAdapter({ relationKey: "child.details", sourceEntity: "Child" });
  setRelation(context, ROOT, dual.relationKey, "confirm_unlink_or_cascade", [
    { entity: "Child", id: "C1", label: "可级联子项" },
  ]);
  setRelation(context, { entity: "Child", id: "C1" }, details.relationKey, "auto_cascade_owned", [
    { entity: "Detail", id: "D1", label: "技术明细" },
  ]);
  const engine = testEngine(context, [dual, details]);
  const first = await engine.plan(request(context));
  let branched: MutationImpactRequiredError | undefined;
  await assert.rejects(
    engine.execute({
      ...request(context),
      confirmation: confirmation(first.token, [{ relationKey: dual.relationKey, resolution: "cascade" }]),
      commitRoot: () => context.events.push("root"),
    }),
    (error) => {
      if (!(error instanceof MutationImpactRequiredError)) return false;
      branched = error;
      return error.reason === "confirmation_required" && error.impact.informationalEffects.length === 1;
    },
  );
  assert.ok(branched);
  await engine.execute({
    ...request(context),
    confirmation: confirmation(branched.impact.token, [
      { relationKey: dual.relationKey, resolution: "cascade" },
    ]),
    commitRoot: () => context.events.push("root"),
  });
  assert.deepEqual(context.events, [
    "cascade:child.details:D1",
    "cascade:plan.flexible:C1",
    "root",
  ]);
});

test("auto cascade executes without confirmation and restore commits parent first", async () => {
  const context: TestContext = { relations: new Map(), events: [] };
  const adapter = makeAdapter({ relationKey: "plan.children", sourceEntity: "Plan", intents: ["restore"] });
  const root = { ...ROOT, intent: "restore" as const };
  setRelation(context, root, adapter.relationKey, "auto_cascade_owned", [{ entity: "Child", id: "C1", label: "子项" }]);
  const result = await testEngine(context, [adapter]).execute({
    ...request(context, root),
    commitRoot: () => {
      context.events.push("root");
      return 42;
    },
  });
  assert.equal(result, 42);
  assert.deepEqual(context.events, ["root", "cascade:plan.children:C1"]);
});

test("same-depth execution priority preserves declared FK-safe order", async () => {
  const context: TestContext = { relations: new Map(), events: [] };
  const ordinary = makeAdapter({ relationKey: "plan.items", sourceEntity: "Plan" });
  const prerequisite = makeAdapter({
    relationKey: "plan.assignments",
    sourceEntity: "Plan",
    executionPriority: -10,
  });
  setRelation(context, ROOT, ordinary.relationKey, "auto_cascade_owned", [
    { entity: "Item", id: "I1", label: "工作项" },
  ]);
  setRelation(context, ROOT, prerequisite.relationKey, "auto_cascade_owned", [
    { entity: "Assignment", id: "A1", label: "限制引用" },
  ]);
  await testEngine(context, [ordinary, prerequisite]).execute({
    ...request(context),
    commitRoot: () => context.events.push("root"),
  });
  assert.deepEqual(context.events, [
    "cascade:plan.assignments:A1",
    "cascade:plan.items:I1",
    "root",
  ]);
});

test("confirmation is stale when effects, policy, or allowed resolutions change", async () => {
  const { context, adapters } = configuredExecutionContext();
  let policyRevision = "policy-v1";
  const engine = testEngine(context, adapters, { getPolicyRevision: () => policyRevision });
  const impact = await engine.plan(request(context));
  setRelation(context, ROOT, "plan.refs", "confirm_unlink", [
    { entity: "Reference", id: "R1", label: "引用" },
    { entity: "Reference", id: "R2", label: "新引用" },
  ]);
  await assert.rejects(
    engine.execute({
      ...request(context),
      confirmation: confirmation(impact.token, VALID_CHOICES),
      commitRoot: () => context.events.push("root"),
    }),
    (error) => error instanceof MutationImpactConfirmationError && error.code === "MUTATION_IMPACT_CONFIRMATION_STALE",
  );
  context.relations.get(relationDataKey("Plan", "P1", "plan.refs"))?.records.pop();
  policyRevision = "policy-v2";
  await assert.rejects(
    engine.execute({
      ...request(context),
      confirmation: confirmation(impact.token, VALID_CHOICES),
      commitRoot: () => context.events.push("root"),
    }),
    (error) => error instanceof MutationImpactConfirmationError && error.code === "MUTATION_IMPACT_CONFIRMATION_STALE",
  );
  assert.deepEqual(context.events, []);
});

test("confirmation binds actor, scope, root, intent, expiry, and selected resolutions", async () => {
  const { context, adapters } = configuredExecutionContext();
  let currentTime = Date.parse("2026-07-17T00:00:00.000Z");
  const engine = testEngine(context, adapters, { now: () => new Date(currentTime), tokenTtlMs: 1_000 });
  const impact = await engine.plan(request(context));
  const execute = (changes: Partial<ReturnType<typeof request>>, choices = VALID_CHOICES) => engine.execute({
    ...request(context),
    ...changes,
    confirmation: confirmation(impact.token, choices),
    commitRoot: () => context.events.push("root"),
  });

  await assert.rejects(execute({ actorKey: "user:8" }), MutationImpactConfirmationError);
  await assert.rejects(execute({ scopeKey: "department:4" }), MutationImpactConfirmationError);
  await assert.rejects(execute({ root: { ...ROOT, id: "P2" } }), MutationImpactConfirmationError);
  await assert.rejects(execute({ root: { ...ROOT, intent: "archive" } }), MutationImpactConfirmationError);
  await assert.rejects(execute({}, [{ relationKey: "plan.refs", resolution: "cascade" as const }]), MutationImpactConfirmationError);
  const codec = deterministicTokenCodec();
  const claims = await codec.open(impact.token) as MutationImpactTokenClaims;
  const alteredToken = await codec.seal({ ...claims, allowedResolutions: [] });
  await assert.rejects(
    engine.execute({
      ...request(context),
      confirmation: confirmation(alteredToken, VALID_CHOICES),
      commitRoot: () => context.events.push("root"),
    }),
    (error) => error instanceof MutationImpactConfirmationError && error.code === "MUTATION_IMPACT_CONFIRMATION_STALE",
  );
  currentTime += 1_001;
  await assert.rejects(
    execute({}),
    (error) => error instanceof MutationImpactConfirmationError && error.code === "MUTATION_IMPACT_CONFIRMATION_STALE",
  );
  assert.deepEqual(context.events, []);
});

test("adapter failures escape so the caller-owned transaction can roll back", async () => {
  const { context: previewContext, adapters } = configuredExecutionContext();
  const engine = testEngine(previewContext, adapters);
  const impact = await engine.plan(request(previewContext));
  await assert.rejects(
    (async () => {
      const transactionContext: TestContext = {
        relations: previewContext.relations,
        events: [...previewContext.events],
        failRelation: "plan.children",
      };
      try {
        const result = await engine.execute({
          ...request(transactionContext),
          confirmation: confirmation(impact.token, VALID_CHOICES),
          commitRoot: () => transactionContext.events.push("root"),
        });
        previewContext.events.splice(0, previewContext.events.length, ...transactionContext.events);
        return result;
      } catch (error) {
        // The caller discards its staged context, exactly as a DB transaction rolls back on throw.
        throw error;
      }
    })(),
    /adapter failed: plan.children/,
  );
  assert.deepEqual(previewContext.events, []);
});
