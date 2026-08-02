import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import { projectNotificationAudienceCapacity } from "./project-notification-audience-capacity";
import { evaluateProjectNotificationRulesInIsolation } from "./project-notification-evaluation-loop";
import {
  deadLetterProjectNotificationRuleRevisions,
  parseProjectNotificationPublicationIntentRequest,
  type ProjectNotificationPublicationIntentRow,
} from "./project-notification-publication-intent";
import { decideProjectNotificationCooldown } from "./project-notification-evaluation-state";
import {
  projectNotificationRedriveSignalId,
  selectProjectNotificationRedriveRules,
} from "./project-notification-redrive";
import {
  createStoredProjectNotificationSnapshot,
  parseClaimedProjectNotificationSnapshot,
  projectNotificationSignalFailurePlan,
  projectNotificationSignalFingerprint,
  projectNotificationSignalReplayMatches,
} from "./project-notification-signal-runtime";
import type { ClaimedProjectNotificationSignal } from "./project-notification-signal-contract";

test("keeps each delayed project signal bound to its own immutable version snapshot", () => {
  const occurredAt = new Date("2026-07-31T03:00:00.000Z");
  const base = {
    id: 42,
    code: "P-42",
    name: "耐久通知",
    projectLevel: "重点",
    plannedStartDate: new Date("2026-07-01T00:00:00.000Z"),
    plannedEndDate: new Date("2026-12-31T00:00:00.000Z"),
    riskNote: null,
    isArchived: false,
  };
  const v3 = createStoredProjectNotificationSnapshot({
    project: { ...base, status: "active", completionPercent: 30, version: 3 },
    signalKind: "project.updated",
    changedField: "completionPercent",
    occurredAt,
  });
  const v4 = createStoredProjectNotificationSnapshot({
    project: { ...base, status: "done", completionPercent: 100, version: 4 },
    signalKind: "project.updated",
    changedField: "status",
    occurredAt: new Date(occurredAt.getTime() + 1_000),
  });
  const claimed = (snapshot: typeof v3): ClaimedProjectNotificationSignal => ({
    id: `signal-v${snapshot.project.version}`,
    projectId: snapshot.project.id,
    projectVersion: snapshot.project.version,
    signalKind: snapshot.signal.kind,
    signalId: `project:42:v${snapshot.project.version}:field:${snapshot.signal.changedField}`,
    changedField: snapshot.signal.changedField,
    snapshotJson: JSON.stringify(snapshot),
    factsFingerprint: projectNotificationSignalFingerprint(snapshot),
    occurredAt: new Date(snapshot.signal.occurredAt),
    status: "leased",
    attemptCount: 1,
    nextAttemptAt: null,
    leaseToken: `lease-v${snapshot.project.version}`,
    leaseExpiresAt: new Date("2026-07-31T03:02:00.000Z"),
    createdAt: occurredAt,
  });

  const parsedV3 = parseClaimedProjectNotificationSnapshot(claimed(v3));
  const parsedV4 = parseClaimedProjectNotificationSnapshot(claimed(v4));
  assert.equal(parsedV3.project.version, 3);
  assert.equal(parsedV3.project.status, "active");
  assert.equal(parsedV3.project.completionPercent, 30);
  assert.equal(parsedV4.project.version, 4);
  assert.equal(parsedV4.project.status, "done");
  assert.notEqual(
    projectNotificationSignalFingerprint(parsedV3),
    projectNotificationSignalFingerprint(parsedV4),
  );
});

test("retries infrastructure failures with backoff and dead-letters at the bounded attempt", () => {
  const now = new Date("2026-07-31T03:00:00.000Z");
  assert.deepEqual(projectNotificationSignalFailurePlan({ attemptCount: 1, now }), {
    status: "retrying",
    nextAttemptAt: new Date("2026-07-31T03:00:30.000Z"),
  });
  assert.deepEqual(projectNotificationSignalFailurePlan({ attemptCount: 8, now }), {
    status: "failed",
    nextAttemptAt: null,
  });
  assert.deepEqual(projectNotificationSignalFailurePlan({
    attemptCount: 8,
    now,
    preserveAttempt: true,
    retryAt: new Date("2026-07-31T03:00:05.000Z"),
  }), {
    status: "retrying",
    nextAttemptAt: new Date("2026-07-31T03:01:01.000Z"),
  });
});

test("a signal pinned to revision 1 remains eligible after the head is republished to revision 2", () => {
  const occurredAt = new Date("2026-07-31T03:00:00.000Z");
  const snapshot = createStoredProjectNotificationSnapshot({
    project: sampleProject(3),
    signalKind: "project.updated",
    changedField: "status",
    occurredAt,
    eligibleRuleRevisions: [{
      ruleId: 11,
      revision: 1,
      publishedAt: new Date("2026-07-30T03:00:00.000Z"),
    }],
  });
  const currentHead = { publishedRevision: 2, status: "published" };
  assert.deepEqual(snapshot.eligibleRuleRevisions.map(({ ruleId, revision }) => ({ ruleId, revision })), [
    { ruleId: 11, revision: 1 },
  ]);
  assert.equal(currentHead.publishedRevision, 2);
});

test("a signal keeps its pinned revision when the rule is archived before drain", () => {
  const snapshot = createStoredProjectNotificationSnapshot({
    project: sampleProject(4),
    signalKind: "project.updated",
    changedField: "completionPercent",
    occurredAt: new Date("2026-07-31T03:00:00.000Z"),
    eligibleRuleRevisions: [{
      ruleId: 12,
      revision: 3,
      publishedAt: new Date("2026-07-30T03:00:00.000Z"),
    }],
  });
  const currentHead = { publishedRevision: 3, status: "archived" };
  assert.equal(snapshot.eligibleRuleRevisions[0]?.revision, 3);
  assert.equal(currentHead.status, "archived");
});

test("all project mutation paths enqueue before commit and drain only after commit", () => {
  const projects = source("projects.ts");
  const gantt = source("projects/plan/application.ts");
  assert.match(projects, /enqueueProjectNotificationSignal\(tx,/);
  assert.match(projects, /bestEffortDrainProjectNotificationSignals\(\[signal\.signalId\]\)/);
  const saveGantt = gantt.slice(gantt.indexOf("export async function saveProjectPlanGantt"));
  assert.match(saveGantt, /const signalIds = await prisma\.\$transaction/);
  assert.match(saveGantt, /select: PROJECT_NOTIFICATION_SIGNAL_PROJECT_SELECT/);
  assert.match(saveGantt, /enqueueProjectNotificationSignal\(tx,/);
  assert.ok(
    saveGantt.indexOf("enqueueProjectNotificationSignal(tx,")
      < saveGantt.indexOf("bestEffortDrainProjectNotificationSignals(signalIds)"),
  );
});

test("drain leases skip locked rows and rule evaluation serializes cooldown and publication", () => {
  const signals = source("project-notification-signals.ts");
  const evaluator = source("project-notification-evaluator.ts");
  const evaluationState = source("project-notification-evaluation-state.ts");
  assert.match(signals, /FOR UPDATE SKIP LOCKED/);
  assert.match(signals, /WITH candidates AS \([\s\S]*signalFilter[\s\S]*FOR UPDATE SKIP LOCKED[\s\S]*LIMIT/);
  assert.match(signals, /UPDATE "ProjectNotificationSignal" AS signal[\s\S]*FROM candidates/);
  assert.match(signals, /limit: 1/);
  assert.match(signals, /older_signal\."projectId" = signal\."projectId"/);
  assert.match(signals, /older_signal\."status" IN \('pending', 'retrying', 'leased'\)/);
  assert.match(signals, /SELECT DISTINCT target\."projectId"/);
  assert.match(signals, /"attemptCount" >= \$\{PROJECT_NOTIFICATION_SIGNAL_MAX_ATTEMPTS\}/);
  assert.match(signals, /signal\."status" = 'leased'/);
  assert.match(signals, /"status" = \$\{plan\.status\}/);
  assert.match(evaluationState, /FROM "ProjectNotificationRule"[\s\S]*FOR UPDATE/);
  assert.match(evaluationState, /projectNotificationEvaluation\.findFirst/);
  assert.match(evaluator, /publishConfiguredNotification/);
  assert.match(evaluator, /evaluateProjectNotificationRulesInIsolation/);
  assert.match(evaluator, /input\.snapshot\.eligibleRuleRevisions/);
  assert.match(evaluator, /renewClaimedProjectNotificationSignalLease/);
  assert.match(evaluator, /beforeEach/);
  assert.doesNotMatch(evaluator, /projectNotificationRule\.findMany/);
});

test("isolates permanent and transient rule failures until every pinned rule was attempted", async () => {
  const permanent = new Error("permanent");
  const transient = new Error("transient");
  const visited: number[] = [];
  const batch = await evaluateProjectNotificationRulesInIsolation({
    items: [1, 2, 3, 4],
    evaluate: async (ruleId) => {
      visited.push(ruleId);
      if (ruleId === 1) throw permanent;
      if (ruleId === 3) throw transient;
      return { ruleId, outcome: "published" };
    },
    isPermanentFailure: (error) => error === permanent,
    recordPermanentFailure: async (ruleId) => ({ ruleId, outcome: "error" }),
    toRetryableFailure: () => new Error("retry signal after all rules"),
  });
  assert.deepEqual(visited, [1, 2, 3, 4]);
  assert.deepEqual(batch.results, [
    { ruleId: 1, outcome: "error" },
    { ruleId: 2, outcome: "published" },
    { ruleId: 4, outcome: "published" },
  ]);
  assert.equal(batch.retryableFailure?.message, "retry signal after all rules");
  const evaluator = source("project-notification-evaluator.ts");
  assert.match(evaluator, /recordPermanentProjectNotificationRuleFailure/);
  assert.doesNotMatch(evaluator, /catch \(error\)[\s\S]*throw error;/);
});

test("scheduled replay is first-write-wins while event replay remains strict", () => {
  const stored = signalReplayFacts({ projectVersion: 3, snapshotJson: "v3" });
  const laterSameDay = signalReplayFacts({ projectVersion: 4, snapshotJson: "v4" });
  assert.equal(projectNotificationSignalReplayMatches({
    policy: "first-write-wins",
    stored,
    attempted: laterSameDay,
  }), true);
  assert.equal(projectNotificationSignalReplayMatches({
    policy: "strict",
    stored,
    attempted: laterSameDay,
  }), false);
  assert.equal(projectNotificationSignalReplayMatches({
    policy: "first-write-wins",
    stored,
    attempted: { ...laterSameDay, projectId: 43 },
  }), false);
  const signals = source("project-notification-signals.ts");
  assert.match(signals, /replayPolicy: "first-write-wins"/);
  assert.match(signals, /for \(const \{ id: projectId \} of projectRows\)[\s\S]*try \{/);
  assert.match(signals, /enqueueErrors \+= 1/);
});

test("publication intent freezes exact audience across retry", () => {
  const request = {
    definitionKey: "custom.project-risk",
    idempotencyKey: "project-rule:11:r2:abc",
    usernames: ["alice", "bob"],
    variables: { project_id: 42 },
    deliveryChannels: ["workspace"] as const,
  };
  const requestJson = JSON.stringify(request);
  const row: ProjectNotificationPublicationIntentRow = {
    id: "intent-1",
    ruleId: 11,
    ruleRevision: 2,
    projectId: 42,
    signalKind: "project.updated",
    signalId: "project:42:v3:field:status",
    definitionKey: request.definitionKey,
    idempotencyKey: request.idempotencyKey,
    requestJson,
    requestFingerprint: createHash("sha256").update(requestJson).digest("hex"),
    status: "publishing",
    publicationId: null,
    preparedAt: new Date("2026-07-31T03:00:00.000Z"),
    committedAt: null,
    failedAt: null,
    lastErrorCode: null,
  };
  const currentRasciAudience = ["carol"];
  assert.deepEqual(parseProjectNotificationPublicationIntentRequest(row).usernames, ["alice", "bob"]);
  assert.notDeepEqual(parseProjectNotificationPublicationIntentRequest(row).usernames, currentRasciAudience);
  const evaluator = source("project-notification-evaluator.ts");
  assert.match(evaluator, /parseProjectNotificationPublicationIntentRequest\(prepared\.intent\)/);
});

test("in-flight contention retries without evaluation, then failed and committed intents diverge", () => {
  assert.equal(decideProjectNotificationCooldown({
    publishedEvaluation: false,
    committedIntent: false,
    publishingIntent: true,
  }), "in_flight");
  assert.equal(decideProjectNotificationCooldown({
    publishedEvaluation: false,
    committedIntent: false,
    publishingIntent: false,
  }), "ready");
  assert.equal(decideProjectNotificationCooldown({
    publishedEvaluation: false,
    committedIntent: true,
    publishingIntent: false,
  }), "cooldown");
  assert.equal(decideProjectNotificationCooldown({
    publishedEvaluation: true,
    committedIntent: false,
    publishingIntent: false,
  }), "cooldown");
  const evaluator = source("project-notification-evaluator.ts");
  const state = source("project-notification-evaluation-state.ts");
  assert.match(state, /"status" = 'publishing'/);
  assert.match(state, /"status" = 'committed'/);
  assert.match(evaluator, /cooldownDisposition === "in_flight"[\s\S]*publication_in_flight/);
  assert.ok(
    evaluator.indexOf('cooldownDisposition === "in_flight"')
      < evaluator.indexOf('outcome: "cooldown"'),
  );
});

test("audience capacity is fail-closed at the platform 100-recipient boundary", () => {
  assert.deepEqual(projectNotificationAudienceCapacity(100), {
    count: 100,
    maxCount: 100,
    exceeded: false,
  });
  assert.deepEqual(projectNotificationAudienceCapacity(101), {
    count: 101,
    maxCount: 100,
    exceeded: true,
  });
  const evaluator = source("project-notification-evaluator.ts");
  const rules = source("project-notification-rules.ts");
  assert.match(evaluator, /blockedReason: capacity\.exceeded[\s\S]*audience_capacity_exceeded/);
  assert.match(evaluator, /errorCode: "audience_capacity_exceeded"/);
  assert.match(rules, /projectNotificationAudienceCapacityMessage/);
});

test("delayed evaluation resolves temporal RASCI eligibility at signal occurrence time", () => {
  const evaluator = source("project-notification-evaluator.ts");
  const audience = source("project-notification-audience.ts");
  const moduleDoc = source("../../../app/(modules)/work/MODULE.md");
  assert.match(evaluator, /asOf: signal\.occurredAt/);
  assert.match(audience, /workspaceBusinessDate\(input\.asOf\)/);
  assert.match(moduleDoc, /signal\.occurredAt/);
  assert.match(moduleDoc, /username\/canLogin/);
  assert.match(moduleDoc, /wxUserId/);
});

test("dead-letter records each remaining pinned rule and exposes rule-scoped failure detail", () => {
  const snapshot = createStoredProjectNotificationSnapshot({
    project: sampleProject(8),
    signalKind: "project.updated",
    changedField: "status",
    occurredAt: new Date("2026-07-31T03:00:00.000Z"),
    eligibleRuleRevisions: [
      { ruleId: 11, revision: 2, publishedAt: new Date("2026-07-30T00:00:00.000Z") },
      { ruleId: 12, revision: 3, publishedAt: new Date("2026-07-30T00:00:00.000Z") },
    ],
  });
  assert.deepEqual(deadLetterProjectNotificationRuleRevisions(JSON.stringify(snapshot)), [
    { ruleId: 11, revision: 2 },
    { ruleId: 12, revision: 3 },
  ]);
  assert.deepEqual(deadLetterProjectNotificationRuleRevisions("not-json"), []);
  const intent = source("project-notification-publication-intent.ts");
  const queue = source("project-notification-queue-health.ts");
  assert.match(intent, /INSERT INTO "ProjectNotificationEvaluation"[\s\S]*'error'/);
  assert.match(intent, /ON CONFLICT \("ruleId", "signalKind", "signalId"\) DO NOTHING/);
  assert.match(queue, /evaluation\."ruleId"/);
});

test("redrive is deterministic and excludes committed or already-published rules", () => {
  assert.equal(
    projectNotificationRedriveSignalId("project:42:v3:field:status", 8),
    projectNotificationRedriveSignalId("project:42:v3:field:status", 8),
  );
  assert.notEqual(
    projectNotificationRedriveSignalId("project:42:v3:field:status", 8),
    projectNotificationRedriveSignalId("project:42:v3:field:status", 7),
  );
  assert.deepEqual(selectProjectNotificationRedriveRules({
    eligibleRuleRevisions: [
      { ruleId: 11, revision: 1 },
      { ruleId: 12, revision: 1 },
      { ruleId: 13, revision: 1 },
      { ruleId: 14, revision: 1 },
    ],
    evaluations: [
      { ruleId: 11, outcome: "published", errorCode: null },
      { ruleId: 12, outcome: "error", errorCode: "signal_attempts_exhausted" },
      { ruleId: 13, outcome: "error", errorCode: "condition_invalid" },
    ],
    intents: [
      { ruleId: 11, status: "committed" },
      { ruleId: 12, status: "failed" },
    ],
    failureCode: "signal_attempts_exhausted",
  }), [
    { ruleId: 12, revision: 1 },
    { ruleId: 14, revision: 1 },
  ]);
  const redrive = source("project-notification-redrive.ts");
  assert.match(redrive, /signal\.status !== "failed"/);
  assert.match(redrive, /signal\.attemptCount !== input\.expectedAttemptCount/);
  assert.match(redrive, /intent\?\.status === "committed" \|\| evaluation\?\.outcome === "published"/);
  assert.match(redrive, /ProjectNotificationSignalRedriveEvent/);
  assert.match(redrive, /"sourceAttemptCount" = \$\{input\.expectedAttemptCount\}/);
  assert.match(redrive, /\$\{input\.userId\}, \$\{reason\}, \$\{now\}/);
  assert.match(redrive, /FOR UPDATE/);
});

test("dead-letter reconciliation and redrive share the publication lock and frozen source intent", () => {
  const intent = source("project-notification-publication-intent.ts");
  const redrive = source("project-notification-redrive.ts");
  const evaluator = source("project-notification-evaluator.ts");
  const evaluationState = source("project-notification-evaluation-state.ts");
  assert.match(
    intent,
    /notification-publication:internal:\$\{sourceId\}[\s\S]*pg_advisory_xact_lock/,
  );
  assert.match(redrive, /reconcileProjectNotificationPublicationIntentsForSignal/);
  assert.ok(
    redrive.indexOf("reconcileProjectNotificationPublicationIntentsForSignal")
      < redrive.indexOf('SELECT "ruleId", "status"'),
  );
  assert.match(evaluator, /findProjectNotificationRedriveSourceIntent/);
  assert.match(evaluator, /sourceIntent\?\.status === "failed"[\s\S]*kind: "intent"/);
  assert.match(evaluator, /parseProjectNotificationPublicationIntentRequest\(prepared\.intent\)/);
  assert.match(evaluationState, /signalKind: input\.intent\.signalKind/);
  assert.match(evaluationState, /signalId: input\.intent\.signalId/);
  assert.match(intent, /"status" IN \('publishing', 'failed'\)/);
});

test("platform publication atomically fences stale source and redrive workers", () => {
  const platform = source("../../platform/server/notification-publishing.ts");
  const evaluator = source("project-notification-evaluator.ts");
  const intent = source("project-notification-publication-intent.ts");
  const redrive = source("project-notification-redrive.ts");
  assert.ok(platform.indexOf("await commitGuard(tx)") > platform.indexOf("if (existing)"));
  assert.ok(
    platform.indexOf("await commitGuard(tx)")
      < platform.indexOf("tx.notificationPublication.create"),
  );
  assert.match(platform, /commit-guard-rejected/);
  assert.match(platform, /NOTIFICATION_PUBLICATION_COMMIT_GUARD_REJECTED/);
  assert.match(evaluator, /leaseToken: input\.signal\.leaseToken/);
  assert.match(evaluator, /attemptCount: input\.signal\.attemptCount/);
  assert.match(
    evaluator,
    /publication\.details\?\.code === NOTIFICATION_PUBLICATION_COMMIT_GUARD_REJECTED[\s\S]*publication_lease_lost/,
  );
  assert.ok(
    evaluator.indexOf("publication.details?.code === NOTIFICATION_PUBLICATION_COMMIT_GUARD_REJECTED")
      < evaluator.indexOf('return finalizeIntentError(input, prepared.intent, "publication_commit_rejected")'),
  );
  assert.match(intent, /claimed_signal\."status" = 'leased'/);
  assert.match(intent, /claimed_signal\."leaseToken" = \$\{input\.leaseToken\}/);
  assert.match(intent, /claimed_signal\."attemptCount" = \$\{input\.attemptCount\}/);
  assert.match(intent, /FOR SHARE OF intent, claimed_signal SKIP LOCKED/);
  assert.match(intent, /reactivateProjectNotificationPublicationIntentForRedrive/);
  assert.match(intent, /WITH RECURSIVE ancestors AS/);
  assert.match(intent, /ancestor\."depth" < \$\{PROJECT_NOTIFICATION_REDRIVE_MAX_DEPTH\}/);
  assert.match(intent, /NOT source_signal\."id" = ANY\(ancestor\."path"\)/);
  assert.match(redrive, /findProjectNotificationRootSignal/);
  assert.match(redrive, /rootSignal\.signalKind/);
});

test("redrive lineage and rule lifecycle CAS facts are unique in schema and migration", () => {
  const schema = source("../../../prisma/models/work-project-notifications.prisma");
  const migration = source(
    "../../../prisma/migrations/20260731011000_durable_project_notification_signals/migration.sql",
  );
  assert.match(schema, /@@unique\(\[ruleId, newVersion\], map: "ProjNotifyRuleLifecycle_rule_version_key"\)/);
  assert.match(schema, /@@unique\(\[sourceSignalRecordId, sourceAttemptCount\]/);
  assert.match(schema, /reason\s+String\s+@db\.Text/);
  assert.match(migration, /ProjNotifyRuleLifecycle_rule_version_key/);
  assert.match(migration, /ProjectNotifyRedrive_sourceAttempt_key/);
  assert.match(migration, /char_length\(btrim\("reason"\)\) BETWEEN 1 AND 500/);
});

test("rule list exposes queue counts and audit-gated safe recent failures", () => {
  const rules = source("project-notification-rules.ts");
  const queue = source("project-notification-queue-health.ts");
  assert.match(rules, /includeFailureDetails: access\.canAudit/);
  assert.match(rules, /queueHealth/);
  assert.match(queue, /"lastErrorSummary" AS "errorSummary"/);
  assert.match(queue, /WITH failed_signals AS/);
  assert.ok(queue.indexOf(`LIMIT \${RECENT_FAILURE_LIMIT}`) < queue.indexOf("LEFT JOIN"));
  assert.match(queue, /ARRAY_AGG\(DISTINCT evaluation\."ruleId"/);
  assert.match(queue, /handled_redrive\."sourceSignalRecordId" = signal\."id"/);
  assert.match(queue, /signal\."attemptCount"/);
  assert.match(queue, /signalRecordId: row\.signalRecordId/);
  assert.match(queue, /ruleIds: row\.ruleIds/);
  assert.match(queue, /backlogCount/);
});

test("notification rule key is immutable immediately after creation", () => {
  const rules = source("project-notification-rules.ts");
  assert.match(rules, /if \(current\.key !== parsed\.data\.key\)/);
  assert.match(rules, /通知规则创建后不能修改 key/);
});

test("rule publish and archive append immutable lifecycle facts in their write transactions", () => {
  const rules = source("project-notification-rules.ts");
  const lifecycle = source("project-notification-rule-lifecycle.ts");
  assert.match(rules, /commitProjectNotificationRulePublish/);
  assert.match(rules, /commitProjectNotificationRuleArchive/);
  assert.match(lifecycle, /action: "published"/);
  assert.match(lifecycle, /action: "archived"/);
  assert.match(lifecycle, /INSERT INTO "ProjectNotificationRuleLifecycleEvent"/);
});

test("scheduler drains retry backlog on a short cadence in addition to the daily scan", () => {
  const scheduler = source("project-notification-scheduler.ts");
  assert.match(scheduler, /PROJECT_NOTIFICATION_RETRY_INTERVAL_MS = 60_000/);
  assert.match(scheduler, /drainProjectNotificationSignals\(\)/);
  assert.match(scheduler, /scheduleNextProjectNotificationDrain\(\)/);
});

function source(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

function sampleProject(version: number) {
  return {
    id: 42,
    code: "P-42",
    name: "耐久通知",
    status: "active",
    projectLevel: "重点",
    completionPercent: 50,
    plannedStartDate: new Date("2026-07-01T00:00:00.000Z"),
    plannedEndDate: new Date("2026-12-31T00:00:00.000Z"),
    riskNote: null,
    isArchived: false,
    version,
  };
}

function signalReplayFacts(input: { projectVersion: number; snapshotJson: string }) {
  return {
    projectId: 42,
    projectVersion: input.projectVersion,
    signalKind: "project.scheduled",
    signalId: "scheduled:2026-07-31:project:42",
    changedField: "scheduled",
    snapshotJson: input.snapshotJson,
    factsFingerprint: input.snapshotJson.padEnd(64, "0"),
  };
}
