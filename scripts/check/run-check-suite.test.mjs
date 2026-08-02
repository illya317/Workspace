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
  assert.equal(ids.filter((id) => id === "workspace-analysis-sources").length, 1);
  assert.equal(ids.filter((id) => id === "typecheck-entrypoints").length, 1);
  assert.equal(ids.filter((id) => id === "typecheck-project-references").length, 1);
  assert.ok(ids.filter((id) => id.startsWith("test-node.")).length > 1);
  assert.equal(ids.includes("domain-changed"), true);
  assert.ok(ids.filter((id) => id.startsWith("domain-architecture.")).length > 1);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(plan.duplicateReferences, 8);
  assert.equal(plan.coveredTaskReferences, 0);
});

test("overlapping suite requests resolve to one stable task plan", () => {
  const blockers = resolveCheckPlan(["blockers"]);
  const overlapping = resolveCheckPlan(["blockers", "domain", "ui"]);

  assert.deepEqual(overlapping.tasks, blockers.tasks);
  assert.ok(overlapping.duplicateReferences > 0);
});

test("precommit scans staged new shell sources for unclassified errexit", () => {
  assert.equal(resolveCheckPlan(["precommit"]).tasks[0].id, "shell-errexit-policy");
});

test("suite runner executes each resolved task once and stops on the first failure", () => {
  const calls = [];
  const status = runCheckSuites(["contracts", "contracts"], {
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

test("aggregate suite mode runs every independent task and summarizes all blocking failures", () => {
  const calls = [];
  const output = [];
  const status = runCheckSuites(["contracts"], {
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


test("domain full scan covers changed validation only when both see the same worktree", () => {
  for (const hasStagedChanges of [false, true]) {
    const calls = [];
    const status = runCheckSuites(["push"], {
      prepareChangedFiles: () => ({
        file: "/tmp/changed-files.json",
        hasStagedChanges,
        source: hasStagedChanges ? "staged" : "worktree",
      }),
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

test("CNB static lane keeps warning checks visible but removes work already covered by the UI gate", () => {
  const plan = resolveCheckPlan(["cnb-static"]);
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

test("an interrupted warning task blocks the suite", () => {
  const output = [];
  const status = runCheckSuites(["hygiene-warning"], {
    spawn: () => ({ status: null, signal: "SIGTERM" }),
    stdout: { write(value) { output.push(value); } },
    stderr: { write(value) { output.push(value); } },
  });

  assert.equal(status, 1);
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
    "workspace-analysis-sources",
    "typecheck-entrypoints",
    "typecheck-project-references",
    "domain-changed",
    "db-migration-changed",
    "playwright-processes",
  ]);
  assert.deepEqual(resolveCheckPlan(["precommit"]).tasks.map((task) => task.id), [
    "shell-errexit-policy",
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
  assert.equal(resolveCheckPlan(["cnb-static"]).tasks.some((task) => task.id === "typecheck-full"), false);
});

test("unknown suites fail before any command can run", () => {
  assert.throws(() => resolveCheckPlan(["missing"]), /Unknown check suite/);
});
