import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  beginReleaseStage,
  createReleasePlan,
  finishReleaseStage,
  readCurrentPlan,
  releasePlanSnapshot,
} from "./release-plan.mjs";
import { validateReleasePlanSnapshot } from "./snapshot-contract.mjs";


const source = {
  commitSha: "a".repeat(40),
  treeId: "b".repeat(40),
  contentDigest: "c".repeat(64),
};
const configurationDigest = "d".repeat(64);
const localExecutors = { prepare: "local", validate: "local", build: "local", deploy: "local" };

function fixture(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), "workspace-release-plan-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

test("standard plan advances once and reuses completed evidence", (t) => {
  const root = fixture(t);
  const created = createReleasePlan({
    root, source, configurationDigest, executors: localExecutors,
    now: () => "2026-08-01T01:02:03.000Z",
    uuid: () => "12345678-1234-1234-1234-123456789abc",
  });
  assert.equal(created.reused, false);
  assert.equal(releasePlanSnapshot(root).stages.prepare, "succeeded");

  assert.equal(beginReleaseStage({ root, stage: "validate", executor: "local" }).action, "run");
  assert.throws(
    () => beginReleaseStage({ root, stage: "validate", executor: "local" }),
    /already running/,
  );
  finishReleaseStage({ root, stage: "validate", status: "succeeded", evidence: { receipt: "source" } });
  assert.equal(beginReleaseStage({ root, stage: "validate", executor: "local" }).action, "reuse");

  assert.equal(beginReleaseStage({ root, stage: "build", executor: "local" }).action, "run");
  finishReleaseStage({ root, stage: "build", status: "succeeded", evidence: { receipt: "artifact" } });
  assert.equal(beginReleaseStage({ root, stage: "deploy", executor: "local" }).action, "run");
  finishReleaseStage({ root, stage: "deploy", status: "succeeded", evidence: { receipt: "production" } });
  assert.equal(beginReleaseStage({ root, stage: "deploy", executor: "local" }).action, "reuse");

  const events = readFileSync(path.join(root, "plans", created.plan.planId, "events.ndjson"), "utf8")
    .trim().split("\n").map(JSON.parse);
  assert.equal(events.length, 7);
  assert.equal(events.at(-1).previousHash, events.at(-2).hash);
});

test("fast plan records validation as an explicit terminal skip but still requires build", (t) => {
  const root = fixture(t);
  createReleasePlan({
    root,
    source,
    configurationDigest,
    mode: "fast",
    fastReason: "restore customer access immediately",
    executors: localExecutors,
  });
  const snapshot = releasePlanSnapshot(root);
  assert.equal(snapshot.stages.validate, "skipped_by_fast");
  assert.throws(() => beginReleaseStage({ root, stage: "deploy" }), /build must succeed/);
  beginReleaseStage({ root, stage: "build" });
  finishReleaseStage({ root, stage: "build", status: "succeeded" });
  assert.equal(beginReleaseStage({ root, stage: "deploy" }).action, "run");
});

test("failed stage is terminal and a new plan is explicit", (t) => {
  const root = fixture(t);
  const original = createReleasePlan({ root, source, configurationDigest, executors: localExecutors });
  beginReleaseStage({ root, stage: "validate" });
  finishReleaseStage({ root, stage: "validate", status: "failed", evidence: { exitCode: 2 } });
  assert.throws(() => beginReleaseStage({ root, stage: "validate" }), /create a new plan/);
  assert.throws(
    () => createReleasePlan({ root, source, configurationDigest, executors: localExecutors }),
    /terminal failed/,
  );
  const replacement = createReleasePlan({
    root,
    source,
    configurationDigest,
    executors: localExecutors,
    forceNew: true,
  });
  assert.notEqual(replacement.plan.planId, original.plan.planId);
  assert.equal(readCurrentPlan(root).planId, replacement.plan.planId);
});

test("executor topology can move to CNB once and never returns local", (t) => {
  const root = fixture(t);
  const executors = { prepare: "local", validate: "local", build: "cnb", deploy: "cnb" };
  createReleasePlan({ root, source, configurationDigest, executors });
  assert.throws(
    () => createReleasePlan({
      root: `${root}-invalid`,
      source,
      configurationDigest,
      executors: { prepare: "local", validate: "cnb", build: "local", deploy: "cnb" },
    }),
    /cannot return from cnb to local/,
  );
  assert.throws(
    () => createReleasePlan({
      root: `${root}-missing-handoff`,
      source,
      configurationDigest,
      executors: { prepare: "local", validate: "local", build: "local", deploy: "cnb" },
    }),
    /artifact capsule handoff adapter/,
  );
  assert.throws(() => beginReleaseStage({ root, stage: "validate", executor: "cnb" }), /sealed to executor local/);
});

test("candidate and private configuration identities remain frozen", (t) => {
  const root = fixture(t);
  createReleasePlan({ root, source, configurationDigest, executors: localExecutors });
  assert.throws(() => beginReleaseStage({
    root,
    stage: "validate",
    expected: { contentDigest: "e".repeat(64) },
  }), /differs from the frozen candidate/);
  assert.throws(() => beginReleaseStage({
    root,
    stage: "validate",
    expected: { configurationDigest: "f".repeat(64) },
  }), /private configuration digest has changed/);
});

test("portable snapshot binds the running action and executor", (t) => {
  const root = fixture(t);
  createReleasePlan({ root, source, configurationDigest, executors: localExecutors });
  beginReleaseStage({ root, stage: "build", executor: "local" });
  const snapshot = releasePlanSnapshot(root);
  assert.equal(validateReleasePlanSnapshot(snapshot, {
    action: "build",
    executor: "local",
    sourceSha: source.commitSha,
    treeId: source.treeId,
    contentDigest: source.contentDigest,
  }), snapshot);
  assert.throws(() => validateReleasePlanSnapshot(snapshot, { action: "build", executor: "cnb" }), /executor differs/);
});
