import assert from "node:assert/strict";
import test from "node:test";

import { resolveCheckPlan, runCheckSuites } from "./run-check-suite.mjs";

test("push suite flattens blockers and changed checks without repeating contracts", () => {
  const plan = resolveCheckPlan(["push"]);
  const ids = plan.tasks.map((task) => task.id);

  assert.equal(ids.filter((id) => id === "api-response-format").length, 1);
  assert.equal(ids.filter((id) => id === "business-code-hardcoding").length, 1);
  assert.equal(ids.filter((id) => id === "history-policy").length, 1);
  assert.equal(ids.filter((id) => id === "business-temporal").length, 1);
  assert.equal(ids.filter((id) => id === "deploy-graph").length, 1);
  assert.equal(ids.filter((id) => id === "workspace-analysis-sources").length, 1);
  assert.equal(ids.filter((id) => id === "typecheck-entrypoints").length, 1);
  assert.equal(ids.filter((id) => id === "typecheck-project-references").length, 1);
  assert.ok(ids.filter((id) => id.startsWith("test-node.")).length > 1);
  assert.equal(ids.includes("domain-changed"), true);
  assert.ok(ids.filter((id) => id.startsWith("domain-architecture.")).length > 1);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(plan.duplicateReferences, 10);
  assert.equal(plan.coveredTaskReferences, 0);
});

test("overlapping suite requests resolve to one stable task plan", () => {
  const blockers = resolveCheckPlan(["blockers"]);
  const overlapping = resolveCheckPlan(["blockers", "domain", "ui"]);

  assert.deepEqual(overlapping.tasks, blockers.tasks);
  assert.ok(overlapping.duplicateReferences > 0);
});

test("suite runner executes each resolved task once and stops on the first failure", () => {
  const calls = [];
  const status = runCheckSuites(["contracts", "contracts"], {
    createTaskCache: () => ({ read() { return null; }, write() {} }),
    spawn: (command, args) => {
      calls.push([command, args]);
      return { status: calls.length === 2 ? 9 : 0 };
    },
    stdout: { write() {} },
    stderr: { write() {} },
    env: { ...process.env, CHECK_SUITE_COLLECT_FAILURES: "0" },
  });

  assert.equal(status, 9);
  assert.equal(calls.length, 2);
});

test("release source suite is the complete CI gate without duplicate artifact build or E2E cleanup", () => {
  const staticIds = resolveCheckPlan(["release-static"]).tasks.map((task) => task.id);
  const sourceIds = resolveCheckPlan(["release-source"]).tasks.map((task) => task.id);
  const ciIds = resolveCheckPlan(["ci"]).tasks.map((task) => task.id);

  assert.deepEqual(ciIds, [...sourceIds, "build-next", "playwright-processes"]);
  assert.deepEqual(sourceIds.slice(0, staticIds.length), staticIds);
  assert.ok(sourceIds.filter((id) => id.startsWith("test-node.")).length > 1);
  assert.ok(sourceIds.filter((id) => id.startsWith("typecheck.")).length > 1);
  const firstTypecheck = sourceIds.findIndex((id) => id.startsWith("typecheck."));
  const lastNodeShard = sourceIds.findLastIndex((id) => id.startsWith("test-node."));
  assert.ok(firstTypecheck > lastNodeShard);
  assert.ok(sourceIds.includes("docs-action-contracts"));
  assert.ok(sourceIds.includes("lint-full"));
});

test("aggregate suite mode runs every independent task and summarizes all blocking failures", () => {
  const calls = [];
  const output = [];
  const status = runCheckSuites(["contracts"], {
    createTaskCache: () => ({ read() { return null; }, write() {} }),
    spawn: () => {
      calls.push(calls.length + 1);
      return { status: calls.length === 2 ? 7 : calls.length === 5 ? 9 : 0 };
    },
    stdout: { write(value) { output.push(value); } },
    stderr: { write(value) { output.push(value); } },
    collectFailures: true,
  });

  assert.equal(status, 7);
  assert.equal(calls.length, resolveCheckPlan(["contracts"]).tasks.length);
  assert.match(output.join(""), /2 blocking failure\(s\)/);
  assert.match(output.join(""), /Fix the complete list above/);
});
test("release environment enables aggregate suite mode without a caller-only option", () => {
  const calls = [];
  const output = [];
  const status = runCheckSuites(["contracts"], {
    env: { ...process.env, CHECK_SUITE_COLLECT_FAILURES: "1" },
    createTaskCache: () => ({ read() { return null; }, write() {} }),
    spawn: () => {
      calls.push(calls.length + 1);
      return { status: calls.length === 1 || calls.length === 3 ? 8 : 0 };
    },
    stdout: { write(value) { output.push(value); } },
    stderr: { write(value) { output.push(value); } },
  });

  assert.equal(status, 8);
  assert.equal(calls.length, resolveCheckPlan(["contracts"]).tasks.length);
  assert.match(output.join(""), /2 blocking failure\(s\)/);
});


test("suite runner skips reusable tasks and preserves cached warning semantics", () => {
  const calls = [];
  const writes = [];
  const output = [];
  const status = runCheckSuites(["hygiene-warning"], {
    createTaskCache: () => ({
      read(task) {
        if (task.id === "structure-hygiene-warning") return { status: "warning", durationMs: 900 };
        if (task.id === "surface-boundaries-warning") return { status: "passed", durationMs: 1200 };
        return null;
      },
      write(task, result) { writes.push([task.id, result]); },
    }),
    spawn: (command, args) => {
      calls.push([command, args]);
      return { status: 0 };
    },
    stdout: { write(value) { output.push(value); } },
    stderr: { write(value) { output.push(value); } },
  });

  assert.equal(status, 0);
  assert.equal(calls.length, 3);
  assert.equal(writes.length, 3);
  assert.match(output.join(""), /Reused warning result/);
  assert.match(output.join(""), /warning-only findings: Structure hygiene ratchet/);
});

test("domain full scan covers changed validation only when both see the same worktree", () => {
  for (const hasStagedChanges of [false, true]) {
    const calls = [];
    const status = runCheckSuites(["push"], {
      prepareChangedFiles: () => ({
        file: "/tmp/changed-files.json",
        hasStagedChanges,
        source: hasStagedChanges ? "staged" : "worktree",
      }),
      createTaskCache: () => ({ read() { return null; }, write() {} }),
      spawn: (command, args) => {
        calls.push([command, args]);
        return { status: 0 };
      },
      stdout: { write() {} },
      stderr: { write() {} },
    });
    assert.equal(status, 0);
    const ranChangedDomain = calls.some(([, args]) => args.includes("domain:changed"));
    assert.equal(ranChangedDomain, hasStagedChanges);
  }
});

test("ci keeps warning checks visible but removes work already covered by the UI gate", () => {
  const plan = resolveCheckPlan(["ci"]);
  const ids = plan.tasks.map((task) => task.id);

  assert.equal(ids.includes("surface-page-adoption-warning"), false);
  assert.equal(ids.includes("surface-boundaries-warning"), true);
  assert.equal(ids.includes("surface-visualization-adoption-warning"), true);
  assert.equal(ids.includes("structure-hygiene-warning"), true);
  assert.equal(plan.coveredTaskReferences, 1);
});

test("warning-only tasks do not block the suite and timings are reported", () => {
  const calls = [];
  const output = [];
  let currentTime = 0;
  const status = runCheckSuites(["hygiene-warning"], {
    createTaskCache: () => ({ read() { return null; }, write() {} }),
    spawn: (command, args) => {
      calls.push([command, args]);
      return { status: calls.length === 2 ? 7 : 0 };
    },
    now: () => {
      currentTime += 250;
      return currentTime;
    },
    stdout: { write(value) { output.push(value); } },
    stderr: { write(value) { output.push(value); } },
  });

  assert.equal(status, 0);
  assert.equal(calls.length, 5);
  assert.match(output.join(""), /warning-only findings/);
  assert.match(output.join(""), /Check suite completed in/);
});

test("an interrupted warning task blocks and is never cached as a finding", () => {
  const writes = [];
  const output = [];
  const status = runCheckSuites(["hygiene-warning"], {
    createTaskCache: () => ({
      read() { return null; },
      write(task, result) { writes.push([task.id, result]); },
    }),
    spawn: () => ({ status: null, signal: "SIGTERM" }),
    stdout: { write(value) { output.push(value); } },
    stderr: { write(value) { output.push(value); } },
  });

  assert.equal(status, 1);
  assert.deepEqual(writes, []);
  assert.match(output.join(""), /interrupted by SIGTERM/);
});

test("suite coverage snapshots keep the intended fast-path contents explicit", () => {
  assert.deepEqual(resolveCheckPlan(["changed"]).tasks.map((task) => task.id), [
    "playwright-lifecycle",
    "lint-changed",
    "api-response-format",
    "business-code-hardcoding",
    "history-policy",
    "import-reference",
    "business-temporal",
    "deploy-graph",
    "deploy-unit-apps",
    "workspace-analysis-sources",
    "typecheck-entrypoints",
    "typecheck-project-references",
    "domain-changed",
    "db-migration-changed",
    "playwright-processes",
  ]);
  assert.deepEqual(resolveCheckPlan(["precommit"]).tasks.map((task) => task.id), [
    "lint-changed",
    "domain-changed",
    "db-migration-changed",
  ]);
  assert.equal(resolveCheckPlan(["precommit"]).tasks.some((task) => task.id === "typecheck-quick"), false);
  const pushIds = resolveCheckPlan(["push"]).tasks.map((task) => task.id);
  assert.deepEqual(pushIds.filter((id) => !/^(?:domain-architecture|ui-architecture|test-node)\./.test(id)), [
    "test-focus",
    "business-identity",
    "api-response-format",
    "business-code-hardcoding",
    "history-policy",
    "import-reference",
    "business-temporal",
    "deploy-graph",
    "deploy-unit-apps",
    "workspace-analysis-sources",
    "typecheck-entrypoints",
    "typecheck-project-references",
    "action-registry",
    "business-action-registry",
    "action-contract",
    "work-plan-governance",
    "structure-domain",
    "core-ui-contracts",
    "structure-ui",
    "playwright-lifecycle",
    "lint-changed",
    "domain-changed",
    "db-migration-changed",
    "playwright-processes",
  ]);
  assert.ok(pushIds.filter((id) => id.startsWith("domain-architecture.")).length > 1);
  assert.ok(pushIds.filter((id) => id.startsWith("ui-architecture.")).length > 1);
  assert.ok(pushIds.filter((id) => id.startsWith("test-node.")).length > 1);
  assert.equal(resolveCheckPlan(["refactor"]).tasks.some((task) => task.id === "typecheck-quick"), false);
  assert.equal(resolveCheckPlan(["ci"]).tasks.some((task) => task.id.startsWith("typecheck.")), true);
});

test("CI runs the authoritative full typecheck before a Next build that skips only the duplicate traversal", () => {
  const tasks = resolveCheckPlan(["ci"]).tasks;
  const typecheckIndexes = tasks.flatMap((task, index) => task.id.startsWith("typecheck.") ? [index] : []);
  const buildIndex = tasks.findIndex((task) => task.id === "build-next");
  assert.ok(typecheckIndexes.length > 1);
  assert.ok(buildIndex > Math.max(...typecheckIndexes));
  assert.deepEqual(tasks[buildIndex]?.args, ["run", "build:next:after-typecheck"]);
});

test("explicit fast mode freezes every gate as skipped and executes none", () => {
  const output = [];
  let graph;
  const status = runCheckSuites(["contracts"], {
    env: { ...process.env, CHECK_RELEASE_MODE: "fast" },
    createTaskCache: () => ({
      freezeTaskGraph(tasks) {
        graph = { graphDigest: "a".repeat(64), tasks: tasks.map((task) => ({ taskKey: task.id, status: "skipped_by_fast" })) };
        return graph;
      },
      read() { return null; },
      write() {},
    }),
    spawn: () => { throw new Error("fast mode must not execute checks"); },
    stdout: { write(value) { output.push(value); } },
    stderr: { write(value) { output.push(value); } },
  });
  assert.equal(status, 0);
  assert.ok(graph.tasks.length > 0);
  assert.match(output.join(""), /skipped_by_fast=/);
});

test("unknown suites fail before any command can run", () => {
  assert.throws(() => resolveCheckPlan(["missing"]), /Unknown check suite/);
});
