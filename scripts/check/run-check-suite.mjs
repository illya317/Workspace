#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";

import { DOMAIN_GATE_CHECK_NAMES, UI_GATE_CHECK_NAMES } from "../arch/gate-check-contracts.mjs";
import { discoverNodeTests, groupNodeTestsByShard, selectAffectedNodeTests } from "../testing/run-node-tests.mjs";
import { prepareChangedFilesManifest } from "./changed-files-manifest.mjs";
import { createCheckTaskCache } from "./check-task-cache.mjs";
import { checkTaskInputContract } from "./check-task-contracts.mjs";
import { resolveReleaseUnitSourceClosure } from "./deploy/release-unit-source-plan.mjs";

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
    reusableWarning: true,
  }),
  "core-ui-contracts": npmScript("core-ui:contracts:check", "Core UI contracts"),
  "db-generate": npmScript("db:generate", "Prisma client generation"),
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
  "env": npmScript("env:check", "Environment"),
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
    reusableWarning: true,
  }),
  "structure-ui": npmScript("arch:structure:ui", "UI structure ratchet"),
  "surface-boundaries-warning": npmScript("arch:surface-boundaries", "Core UI surface boundaries", {
    severity: "warning",
    reusableWarning: true,
  }),
  "surface-page-adoption-warning": npmScript("arch:surface-page-adoption", "Core UI PageSurface adoption", {
    severity: "warning",
    reusableWarning: true,
  }),
  "surface-visualization-adoption-warning": npmScript(
    "arch:surface-visualization-adoption",
    "Core UI Visualization adoption",
    { severity: "warning", reusableWarning: true },
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
  "release-static": [
    "playwright-lifecycle",
    "@blockers",
    "env",
    "db-path",
    "@docs",
    "@data",
    "db-generate",
    "lint-full",
    "@hygiene-warning",
  ],
  "release-source": ["@release-static", "test-node", "typecheck-full"],
  ci: [
    "@release-source",
    "build-next",
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

function typecheckProjects(cwd) {
  const projects = [];
  const packagesDirectory = path.join(cwd, "packages");
  for (const entry of fs.readdirSync(packagesDirectory, { withFileTypes: true })) {
    if (entry.isDirectory() && fs.existsSync(path.join(packagesDirectory, entry.name, "tsconfig.json"))) {
      projects.push({ scope: entry.name, project: `packages/${entry.name}` });
    }
  }
  const appsDirectory = path.join(cwd, "apps");
  if (fs.existsSync(appsDirectory)) {
    for (const entry of fs.readdirSync(appsDirectory, { withFileTypes: true })) {
      if (entry.isDirectory() && fs.existsSync(path.join(appsDirectory, entry.name, "tsconfig.json"))) {
        projects.push({ scope: `app-${entry.name}`, project: `apps/${entry.name}` });
      }
    }
  }
  projects.push(
    { scope: "app", project: "tsconfig.app.json" },
    { scope: "prisma-client", project: "tsconfig.prisma-client.json" },
    { scope: "tooling", project: "tsconfig.tooling.json" },
  );
  return projects.sort((left, right) => left.scope.localeCompare(right.scope));
}

function releaseUnitLintTask(task, releaseClosure) {
  return {
    ...task,
    id: `lint-unit.${releaseClosure.targetId}`,
    label: `Lint · deploy unit ${releaseClosure.targetId}`,
    args: [
      "run",
      "lint",
      "--",
      "--no-warn-ignored",
      "--max-warnings=0",
      ...releaseClosure.lintRoots,
    ],
    covers: ["lint-changed"],
    input: { kind: "files", roots: releaseClosure.lintRoots },
  };
}

function expandTask(taskId, task, cwd, releaseClosure = null) {
  if (taskId === "domain-architecture") {
    return DOMAIN_GATE_CHECK_NAMES.map((name) => ({
      ...task,
      id: `domain-architecture.${name}`,
      label: `Domain architecture · ${name}`,
      args: [...task.args, "--check", name],
    }));
  }
  if (taskId === "ui-architecture") {
    return UI_GATE_CHECK_NAMES.map((name) => ({
      ...task,
      id: `ui-architecture.${name}`,
      label: `UI architecture · ${name}`,
      args: [...task.args, "--check", name],
    }));
  }
  if (taskId === "test-node") {
    const allTests = discoverNodeTests(cwd);
    const selectedTests = releaseClosure
      ? selectAffectedNodeTests(allTests, releaseClosure.node)
      : allTests;
    return groupNodeTestsByShard(selectedTests).map(({ key, files }) => ({
      id: `test-node.${key}`,
      label: `Node tests · ${key}`,
      command: "node",
      args: ["scripts/check/with-check-lock.js", "--", "node", "scripts/testing/run-node-tests.mjs", "shard", key],
      shard: key,
      testFiles: files,
    }));
  }
  if (taskId === "typecheck-full") {
    const projects = typecheckProjects(cwd);
    const selectedProjects = releaseClosure
      ? releaseClosure.typecheckScopes.map((scope) => {
        const project = projects.find((candidate) => candidate.scope === scope);
        if (!project) throw new Error(`deploy graph references unknown typecheck scope: ${scope}`);
        return project;
      })
      : projects;
    return selectedProjects.map(({ scope, project }) => ({
      id: `typecheck.${scope}`,
      label: `TypeScript · ${scope}`,
      command: "npm",
      args: ["run", "typecheck:scope", "--", scope],
      project,
    }));
  }
  if (taskId === "lint-full" && releaseClosure) return [releaseUnitLintTask(task, releaseClosure)];
  return [{ id: taskId, ...task }];
}

function coveredTaskIds(tasks) {
  const present = new Map(tasks.map((task) => [task.id, task]));
  const covered = new Set();

  const visit = (taskId, active = new Set()) => {
    if (active.has(taskId)) throw new Error(`Circular check task coverage: ${[...active, taskId].join(" -> ")}`);
    const task = present.get(taskId) ?? TASKS[taskId];
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

export function resolveCheckPlan(suiteNames, { cwd = process.cwd(), releaseTarget = "monolith", deployGraph } = {}) {
  if (releaseTarget !== "monolith" && !/^[a-z][a-z0-9-]*$/.test(releaseTarget)) {
    throw new Error(`invalid release validation target: ${releaseTarget}`);
  }
  const releaseClosure = releaseTarget === "monolith"
    ? null
    : resolveReleaseUnitSourceClosure({ cwd, targetId: releaseTarget, graph: deployGraph });
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
      for (const expanded of expandTask(ref, task, cwd, releaseClosure)) {
        checkTaskInputContract(expanded);
        tasks.push(expanded);
      }
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
    collectFailures = env.CHECK_SUITE_COLLECT_FAILURES === "1",
  } = {},
) {
  let plan = resolveCheckPlan(suiteNames, {
    cwd,
    releaseTarget: env.RELEASE_VALIDATION_TARGET_ID?.trim() || "monolith",
  });
  const suiteStartedAt = now();
  const warningFailures = [];
  const blockingFailures = [];
  const taskCache = createTaskCache({ cwd, env });
  let executionEnv = env;
  let changedFilesContext = null;
  try {
    changedFilesContext = prepareChangedFiles(plan.tasks.map((task) => task.id), { cwd, env });
    if (changedFilesContext) {
      executionEnv = { ...env, WORKSPACE_CHANGED_FILES_MANIFEST: changedFilesContext.file };
    }
  } catch (error) {
    stdout.write(`Changed-file context unavailable; leaves will recompute it (${error instanceof Error ? error.message : error}).\n`);
  }
  plan = applyContextualCoverage(plan, changedFilesContext);

  const taskGraph = taskCache.freezeTaskGraph?.(plan.tasks, {
    file: env.CHECK_TASK_GRAPH_FILE?.trim() || null,
    sourceRunId: env.CHECK_SOURCE_RUN_ID?.trim() || null,
  }) ?? null;
  const blockedTasks = taskGraph?.tasks.filter((task) => task.status === "blocked") ?? [];
  if (blockedTasks.length > 0) {
    stderr.write(`Check task graph contains blocked inputs; independent tasks will still run: ${blockedTasks.map((task) => task.taskKey).join(", ")}\n`);
  }
  const cachedTasks = new Map();
  const graphBlockedTasks = new Set();
  for (const task of plan.tasks) {
    const graphTask = taskGraph?.tasks.find((item) => item.taskKey === task.id);
    if (graphTask?.status === "blocked") graphBlockedTasks.add(task.id);
    if (taskGraph && graphTask?.status !== "reused") continue;
    const receipt = taskCache.read(task);
    if (taskGraph && !receipt) {
      throw new Error(`frozen task graph marked ${task.id} reused without a valid receipt`);
    }
    if (receipt) cachedTasks.set(task.id, receipt);
  }
  if (taskGraph) {
    const counts = taskGraph.tasks.reduce((result, task) => {
      result[task.status] = (result[task.status] ?? 0) + 1;
      return result;
    }, {});
    stdout.write(
      `Frozen task graph ${taskGraph.graphDigest}: reused=${counts.reused ?? 0}, pending=${counts.pending ?? 0}, blocked=${counts.blocked ?? 0}.\n`,
    );
  }
  executionEnv = { ...executionEnv, CHECK_TASK_RECEIPTS_ACTIVE: "1" };

  const reductions = [
    plan.duplicateReferences > 0 ? `${plan.duplicateReferences} duplicate reference(s)` : null,
    plan.coveredTaskReferences > 0 ? `${plan.coveredTaskReferences} covered step(s)` : null,
  ].filter(Boolean);
  const reductionNote = reductions.length > 0 ? `; removed ${reductions.join(" and ")}` : "";
  stdout.write(`Check suite ${suiteNames.join(" + ")}: ${plan.tasks.length} effective step(s)${reductionNote}.\n`);

  for (const [index, task] of plan.tasks.entries()) {
    const executable = process.platform === "win32" && task.command === "npm" ? "npm.cmd" : task.command;
    stdout.write(`\n[${index + 1}/${plan.tasks.length}] ${task.label}\n`);
    if (graphBlockedTasks.has(task.id)) {
      stdout.write(`⇥ ${task.label} input could not be resolved and remains visibly blocked.\n`);
      blockingFailures.push({ label: `${task.label} (blocked input)`, status: 2 });
      continue;
    }
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
