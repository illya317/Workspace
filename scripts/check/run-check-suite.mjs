#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";

import { prepareChangedFilesManifest } from "./changed-files-manifest.mjs";
import { createCheckTaskCache } from "./check-task-cache.mjs";

const TASKS = {
  "action-contract": npmScript("action-contract:check", "Action contract"),
  "action-registry": npmScript("action-registry:check", "Action registry"),
  "api-response-format": npmScript("check:api-response-format", "API response format"),
  "business-action-registry": npmScript("business-action-registry:check", "Business action registry"),
  "business-code-hardcoding": npmScript("business-code:check", "Business code registry and hardcoding"),
  "business-identity": npmScript("gate:business-identity", "Business identity boundary"),
  "business-temporal": npmScript("business-temporal:check", "Business Temporal registry and write seams"),
  "build-next": npmScript("build:next:after-typecheck", "Next production build", { cacheable: false }),
  "company-hardcoding-warning": npmScript("company:check", "Company hardcoding", {
    severity: "warning",
    cacheable: false,
  }),
  "core-ui-contracts": npmScript("core-ui:contracts:check", "Core UI contracts"),
  "db-generate": npmScript("db:generate", "Prisma client generation", { cacheable: false }),
  "db-migration-changed": npmScript("db:migration:changed", "Changed migration validation"),
  "db-migration-check": npmScript("db:migration:check", "Migration consistency", {
    covers: ["db-migration-changed"],
  }),
  "db-path": npmScript("db:path:check", "Database path policy"),
  "db-validate": npmScript("db:validate", "Prisma schema validation"),
  "data-release": npmScript("data:release:check", "Data release manifests"),
  "docs-action-contracts": npmScript("docs:action-contracts:check", "Generated action contract docs"),
  "docs-api-agent-guide": npmScript("docs:api-agent-guide:check", "Generated API Agent guide"),
  "docs-production-agent": npmScript("docs:production-agent:check", "Production Agent Docs catalog and copies"),
  "docs-permission-actions": npmScript("docs:permission-actions:check", "Generated permission action docs"),
  "deploy-graph": npmScript("deploy:graph:check", "Deploy unit graph"),
  "deploy-unit-apps": npmScript("deploy:apps:check", "Deploy unit apps"),
  "docs-architecture": lockedNodeScript("scripts/check/check-architecture-docs.js", "Architecture docs"),
  "docs-editor-templates": npmScript("docs-editor:official-templates:check", "Official document templates"),
  "domain-architecture": lockedTsScript("scripts/arch/domain-gate.ts", "Domain architecture", {
    coversWhenNoStagedChanges: ["domain-changed"],
  }),
  "domain-changed": npmScript("domain:changed", "Changed domain validation"),
  "env": npmScript("env:check", "Environment", { cacheable: false }),
  "history-policy": npmScript("check:history-policy", "History policy"),
  "import-reference": npmScript("import-reference:check", "Import reference governance"),
  "lint-changed": npmScript("lint:changed", "Changed lint"),
  "lint-full": npmScript("lint:full", "Full lint", { covers: ["lint-changed"] }),
  "playwright-lifecycle": npmScript("playwright:lifecycle:check", "Playwright lifecycle"),
  "playwright-processes": npmScript("playwright:processes:check", "Playwright process cleanup", {
    cacheable: false,
  }),
  "schema": npmScript("schema:check", "Schema governance"),
  "split-quality": npmScript("complexity:split-quality", "Refactor split quality"),
  "structure-domain": npmScript("arch:structure:domain", "Domain structure ratchet"),
  "structure-hygiene-warning": npmScript("arch:structure:hygiene", "Structure hygiene ratchet", {
    severity: "warning",
  }),
  "structure-ui": npmScript("arch:structure:ui", "UI structure ratchet"),
  "surface-boundaries-warning": npmScript("arch:surface-boundaries", "Core UI surface boundaries", {
    severity: "warning",
  }),
  "surface-page-adoption-warning": npmScript("arch:surface-page-adoption", "Core UI PageSurface adoption", {
    severity: "warning",
  }),
  "surface-visualization-adoption-warning": npmScript(
    "arch:surface-visualization-adoption",
    "Core UI Visualization adoption",
    { severity: "warning" },
  ),
  "test-focus": npmScript("test:focus:check", "Focused-test guard"),
  "test-node": npmScript("test:node", "Node tests"),
  "typecheck-entrypoints": npmScript("typecheck:entrypoints:check", "TypeScript entrypoint policy"),
  "typecheck-project-references": npmScript("typecheck:references:check", "TypeScript project references"),
  "typecheck-full": npmScript("typecheck:full", "Full typecheck", { covers: ["typecheck-quick"] }),
  "typecheck-quick": npmScript("typecheck:quick", "Quick typecheck"),
  "ui-architecture": lockedTsScript("scripts/arch/ui-gate.ts", "UI architecture", {
    covers: ["surface-page-adoption-warning"],
  }),
  "work-plan-governance": npmScript("work-plan-governance:check", "Work plan governance"),
  "workspace-analysis-sources": npmScript(
    "workspace-analysis-sources:check",
    "Workspace analysis source coverage",
  ),
};

const SUITES = {
  contracts: [
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
  ],
  domain: [
    "@contracts",
    "action-registry",
    "business-action-registry",
    "action-contract",
    "work-plan-governance",
    "domain-architecture",
    "structure-domain",
  ],
  ui: ["ui-architecture", "core-ui-contracts", "structure-ui"],
  blockers: ["test-focus", "business-identity", "@domain", "@ui"],
  changed: [
    "playwright-lifecycle",
    "lint-changed",
    "@contracts",
    "domain-changed",
    "db-migration-changed",
    "playwright-processes",
  ],
  precommit: ["lint-changed", "domain-changed", "db-migration-changed"],
  refactor: ["split-quality", "lint-changed", "@contracts"],
  data: ["db-validate", "schema", "db-migration-check", "data-release", "import-reference", "docs-editor-templates"],
  docs: [
    "docs-architecture",
    "docs-action-contracts",
    "docs-api-agent-guide",
    "docs-production-agent",
    "docs-permission-actions",
    "business-code-hardcoding",
  ],
  "hygiene-warning": [
    "company-hardcoding-warning",
    "structure-hygiene-warning",
    "surface-boundaries-warning",
    "surface-page-adoption-warning",
    "surface-visualization-adoption-warning",
  ],
  quick: ["env", "@changed"],
  push: ["@blockers", "@changed", "test-node"],
  ci: [
    "playwright-lifecycle",
    "@blockers",
    "env",
    "db-path",
    "@docs",
    "@data",
    "db-generate",
    "lint-full",
    "test-node",
    "typecheck-full",
    "build-next",
    "@hygiene-warning",
    "playwright-processes",
  ],
};

function npmScript(script, label, options = {}) {
  return { label, command: "npm", args: ["run", script], ...options };
}

function lockedNodeScript(script, label, options = {}) {
  return {
    label,
    command: "node",
    args: ["scripts/check/with-check-lock.js", "--", "node", script],
    ...options,
  };
}

function lockedTsScript(script, label, options = {}) {
  return {
    label,
    command: "node",
    args: ["scripts/check/with-check-lock.js", "--", "node", "--import", "tsx", script],
    ...options,
  };
}

function coveredTaskIds(tasks) {
  const present = new Set(tasks.map((task) => task.id));
  const covered = new Set();

  const visit = (taskId, active = new Set()) => {
    if (active.has(taskId)) throw new Error(`Circular check task coverage: ${[...active, taskId].join(" -> ")}`);
    const task = TASKS[taskId];
    if (!task) throw new Error(`Unknown covering check task: ${taskId}`);
    const nextActive = new Set(active).add(taskId);
    for (const coveredId of task.covers ?? []) {
      if (!TASKS[coveredId]) throw new Error(`Unknown covered check task: ${coveredId}`);
      if (present.has(coveredId)) covered.add(coveredId);
      visit(coveredId, nextActive);
    }
  };

  for (const task of tasks) visit(task.id);
  return covered;
}

function applyContextualCoverage(plan, changedFilesContext) {
  if (!changedFilesContext || changedFilesContext.hasStagedChanges) return plan;
  const present = new Set(plan.tasks.map((task) => task.id));
  const covered = new Set();
  for (const task of plan.tasks) {
    for (const coveredId of task.coversWhenNoStagedChanges ?? []) {
      if (present.has(coveredId)) covered.add(coveredId);
    }
  }
  if (covered.size === 0) return plan;
  return {
    ...plan,
    tasks: plan.tasks.filter((task) => !covered.has(task.id)),
    coveredTaskReferences: plan.coveredTaskReferences + covered.size,
  };
}

export function resolveCheckPlan(suiteNames) {
  const tasks = [];
  const seenTasks = new Set();
  const activeSuites = new Set();
  let duplicateReferences = 0;

  const visitSuite = (suiteName) => {
    const refs = SUITES[suiteName];
    if (!refs) throw new Error(`Unknown check suite: ${suiteName}`);
    if (activeSuites.has(suiteName)) throw new Error(`Circular check suite dependency: ${suiteName}`);
    activeSuites.add(suiteName);
    for (const ref of refs) {
      if (ref.startsWith("@")) {
        visitSuite(ref.slice(1));
        continue;
      }
      const task = TASKS[ref];
      if (!task) throw new Error(`Unknown check task: ${ref}`);
      if (seenTasks.has(ref)) {
        duplicateReferences += 1;
        continue;
      }
      seenTasks.add(ref);
      tasks.push({ id: ref, ...task });
    }
    activeSuites.delete(suiteName);
  };

  for (const suiteName of suiteNames) visitSuite(suiteName);
  const covered = coveredTaskIds(tasks);
  return {
    tasks: tasks.filter((task) => !covered.has(task.id)),
    duplicateReferences,
    coveredTaskReferences: covered.size,
  };
}

function formatDuration(durationMs) {
  return durationMs < 1000 ? `${Math.round(durationMs)}ms` : `${(durationMs / 1000).toFixed(2)}s`;
}

export function runCheckSuites(
  suiteNames,
  {
    cwd = process.cwd(),
    env = process.env,
    createTaskCache = createCheckTaskCache,
    prepareChangedFiles = prepareChangedFilesManifest,
    spawn = spawnSync,
    now = () => performance.now(),
    stdout = process.stdout,
    stderr = process.stderr,
    collectFailures = false,
  } = {},
) {
  let plan = resolveCheckPlan(suiteNames);
  const suiteStartedAt = now();
  const warningFailures = [];
  const blockingFailures = [];
  const taskCache = createTaskCache({ cwd, env });
  const cachedTasks = new Map(
    plan.tasks
      .map((task) => [task.id, taskCache.read(task)])
      .filter(([, cached]) => cached),
  );
  let executionEnv = env;
  let changedFilesContext = null;
  try {
    changedFilesContext = prepareChangedFiles(
      plan.tasks.filter((task) => !cachedTasks.has(task.id)).map((task) => task.id),
      { cwd, env },
    );
    if (changedFilesContext) {
      executionEnv = { ...env, WORKSPACE_CHANGED_FILES_MANIFEST: changedFilesContext.file };
    }
  } catch (error) {
    stdout.write(`Changed-file context unavailable; leaves will recompute it (${error instanceof Error ? error.message : error}).\n`);
  }
  plan = applyContextualCoverage(plan, changedFilesContext);
  const reductions = [
    plan.duplicateReferences > 0 ? `${plan.duplicateReferences} duplicate reference(s)` : null,
    plan.coveredTaskReferences > 0 ? `${plan.coveredTaskReferences} covered step(s)` : null,
  ].filter(Boolean);
  const reductionNote = reductions.length > 0 ? `; removed ${reductions.join(" and ")}` : "";
  stdout.write(`Check suite ${suiteNames.join(" + ")}: ${plan.tasks.length} effective step(s)${reductionNote}.\n`);

  for (const [index, task] of plan.tasks.entries()) {
    const executable = process.platform === "win32" && task.command === "npm" ? "npm.cmd" : task.command;
    stdout.write(`\n[${index + 1}/${plan.tasks.length}] ${task.label}\n`);
    const cached = cachedTasks.get(task.id);
    if (cached) {
      const originalDuration = Number.isFinite(cached.durationMs)
        ? `; original run ${formatDuration(cached.durationMs)}`
        : "";
      if (cached.status === "warning") {
        warningFailures.push(task.label);
        stdout.write(`↻ Reused warning result for ${task.label}${originalDuration}.\n`);
      } else {
        stdout.write(`↻ Reused successful result for ${task.label}${originalDuration}.\n`);
      }
      continue;
    }
    const taskStartedAt = now();
    const result = spawn(executable, task.args, { cwd, env: executionEnv, stdio: "inherit" });
    const durationMs = Math.max(0, now() - taskStartedAt);
    const duration = formatDuration(durationMs);
    if (result.error) {
      stderr.write(`${result.error.message}\n`);
      return 1;
    }
    if (result.signal || result.status === null) {
      stderr.write(`✗ ${task.label} was interrupted${result.signal ? ` by ${result.signal}` : ""}; result was not cached.\n`);
      return 1;
    }
    if (result.status !== 0 && task.severity === "warning") {
      warningFailures.push(task.label);
      taskCache.write(task, "warning", durationMs);
      stdout.write(`⚠ ${task.label} reported warning-only findings in ${duration}.\n`);
      continue;
    }
    if (result.status !== 0) {
      stderr.write(`✗ ${task.label} failed in ${duration}.\n`);
      if (!collectFailures) {
        stderr.write(`Check suite stopped after ${formatDuration(Math.max(0, now() - suiteStartedAt))}.\n`);
        return result.status ?? 1;
      }
      blockingFailures.push({ label: task.label, status: result.status ?? 1 });
      continue;
    }
    taskCache.write(task, "passed", durationMs);
    stdout.write(`✓ ${task.label} completed in ${duration}.\n`);
  }

  const warningNote = warningFailures.length > 0
    ? `; warning-only findings: ${warningFailures.join(", ")}`
    : "";
  if (blockingFailures.length > 0) {
    stderr.write(`\n✗ Check suite completed with ${blockingFailures.length} blocking failure(s) in ${formatDuration(Math.max(0, now() - suiteStartedAt))}.\n`);
    for (const failure of blockingFailures) {
      stderr.write(`  - ${failure.label} (exit ${failure.status})\n`);
    }
    stderr.write("Fix the complete list above, then rerun; successful exact-input tasks remain reusable.\n");
    return blockingFailures[0].status;
  }
  stdout.write(`\n✓ Check suite completed in ${formatDuration(Math.max(0, now() - suiteStartedAt))}${warningNote}.\n`);
  return 0;
}

function main(argv = process.argv.slice(2)) {
  if (argv.length === 0) {
    console.error(`Usage: node scripts/check/run-check-suite.mjs <${Object.keys(SUITES).join("|")}> [...]`);
    return 2;
  }
  if (process.env.CHECK_LOCK !== "0") {
    console.error("Check suites must run through scripts/check/with-check-lock.js so one suite owns the project check lock.");
    return 2;
  }
  try {
    return runCheckSuites(argv);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main();
}
