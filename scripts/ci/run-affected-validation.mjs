#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";

function run(command, args, env) {
  process.stdout.write(`> ${command} ${args.join(" ")}\n`);
  const executable = process.platform === "win32" && command === "npm" ? "npm.cmd" : command;
  const result = spawnSync(executable, args, { env, stdio: "inherit" });
  return {
    status: result.error || result.signal || result.status === null ? 1 : result.status,
    error: result.error?.message ?? null,
    signal: result.signal ?? null,
  };
}

function options(argv) {
  const parsed = { phase: "source" };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--classification") parsed.classification = argv[++index];
    else if (argument === "--phase") parsed.phase = argv[++index];
    else if (argument === "--result-file") parsed.resultFile = argv[++index];
    else throw new Error(`unknown argument: ${argument}`);
  }
  if (!parsed.classification) throw new Error("--classification is required");
  if (!["source", "post-build"].includes(parsed.phase)) throw new Error("--phase must be source or post-build");
  return parsed;
}

export function selectedCommands(classification, phase, { deployUnitId = "" } = {}) {
  if (phase === "post-build") {
    if (!classification.runE2e || deployUnitId) return [];
    return [["bash", ["./ops/run-release-e2e.sh"]]];
  }

  const commands = [];
  const runsFullSourceSuite = classification.riskClass === "C3";
  if (runsFullSourceSuite) {
    commands.push(["node", [
      "scripts/check/with-check-lock.js",
      "--",
      "node",
      "scripts/check/run-check-suite.mjs",
      "release-source",
    ]]);
  } else if (classification.runStatic) {
    if (classification.riskClass === "C0") commands.push(["node", ["scripts/check/check-architecture-docs.js"]]);
    else {
      commands.push(["npm", ["run", "db:generate"]]);
      commands.push(["npm", ["run", "lint:changed"]]);
      commands.push(["npm", ["run", "domain:changed"]]);
      commands.push(["npm", ["run", "db:migration:changed"]]);
    }
  }
  if (!runsFullSourceSuite && classification.runNode) commands.push(["npm", ["run", "test:node:affected"]]);
  if (!runsFullSourceSuite && classification.runType) commands.push(["npm", ["run", "typecheck:affected"]]);
  if (classification.runPostgresql) {
    if (!runsFullSourceSuite) commands.push(["npm", ["run", "check:data"]]);
    commands.push(["npx", ["prisma", "migrate", "deploy", "--schema=./prisma"]]);
    commands.push(["npm", ["run", "db:seed:resources"]]);
    commands.push(["npm", ["run", "test:integration:postgresql"]]);
  }
  return commands;
}

function commandLabel([command, args]) {
  return `${command} ${args.join(" ")}`;
}

function isPostgresqlRuntimeCommand([command, args]) {
  return (command === "npx" && args[0] === "prisma" && args[1] === "migrate")
    || (command === "npm" && ["db:seed:resources", "test:integration:postgresql"].includes(args[1]));
}

export function selectedCommandGroups(classification, phase, options = {}) {
  const groups = [];
  for (const command of selectedCommands(classification, phase, options)) {
    if (isPostgresqlRuntimeCommand(command)) {
      const existing = groups.find((group) => group.id === "postgresql-runtime");
      if (existing) existing.commands.push(command);
      else groups.push({ id: "postgresql-runtime", commands: [command] });
      continue;
    }
    groups.push({ id: commandLabel(command), commands: [command] });
  }
  return groups;
}

export function runCommandGroups(
  groups,
  env,
  { execute = run, stdout = process.stdout, stderr = process.stderr } = {},
) {
  const passed = [];
  const failed = [];
  const blocked = [];

  for (const group of groups) {
    if (group.preconditionFailure) {
      const failure = {
        group: group.id,
        command: group.preconditionFailure.command,
        status: group.preconditionFailure.status,
        error: group.preconditionFailure.error ?? null,
        signal: null,
      };
      failed.push(failure);
      for (const command of group.commands) {
        blocked.push({ group: group.id, command: commandLabel(command), blockedBy: failure.command });
      }
      continue;
    }
    let blockedBy = null;
    for (const command of group.commands) {
      const label = commandLabel(command);
      if (blockedBy) {
        blocked.push({ group: group.id, command: label, blockedBy });
        continue;
      }
      const result = execute(command[0], command[1], env) ?? { status: 1 };
      if (result.status === 0) {
        passed.push({ group: group.id, command: label });
        continue;
      }
      failed.push({
        group: group.id,
        command: label,
        status: result.status ?? 1,
        error: result.error ?? null,
        signal: result.signal ?? null,
      });
      blockedBy = label;
    }
  }

  stdout.write("\n==> 受影响门禁完整结果\n");
  stdout.write(`    passed: ${passed.length}\n`);
  stdout.write(`    failed: ${failed.length}\n`);
  stdout.write(`    blocked: ${blocked.length}\n`);
  for (const failure of failed) {
    stderr.write(`    FAILED [${failure.group}] ${failure.command} (exit ${failure.status}${failure.signal ? `, ${failure.signal}` : ""})${failure.error ? `: ${failure.error}` : ""}\n`);
  }
  for (const item of blocked) {
    stderr.write(`    BLOCKED [${item.group}] ${item.command} by ${item.blockedBy}\n`);
  }

  return {
    schemaVersion: 1,
    kind: "workspace-affected-validation-result",
    status: failed.length === 0 ? 0 : failed[0].status,
    passed,
    failed,
    blocked,
  };
}

export function main(argv = process.argv.slice(2), env = process.env) {
  const parsed = options(argv);
  const classification = JSON.parse(readFileSync(parsed.classification, "utf8"));
  const executionEnv = {
    ...env,
    WORKSPACE_DIFF_BASE: classification.baseSha,
    WORKSPACE_DIFF_HEAD: classification.headSha,
    WORKSPACE_CHANGED_FILES_JSON: JSON.stringify(classification.changedFiles),
    WORKSPACE_AFFECTED_MODULES_JSON: JSON.stringify(classification.affectedModules),
    E2E_MODE: classification.e2eMode,
    E2E_SPECS_JSON: JSON.stringify(classification.e2eSpecs),
    CHECK_SUITE_COLLECT_FAILURES: "1",
  };
  const groups = selectedCommandGroups(classification, parsed.phase, {
    deployUnitId: env.DEPLOY_UNIT_ID ?? "",
  });
  const databaseStartStatus = Number.parseInt(env.RELEASE_DATABASE_START_STATUS ?? "0", 10);
  if (parsed.phase === "source" && Number.isInteger(databaseStartStatus) && databaseStartStatus !== 0) {
    const postgresqlGroup = groups.find((group) => group.id === "postgresql-runtime");
    if (postgresqlGroup) {
      postgresqlGroup.preconditionFailure = {
        command: "start disposable PostgreSQL",
        status: databaseStartStatus,
        error: "database precondition failed",
      };
    }
  }
  const result = runCommandGroups(groups, executionEnv);
  if (parsed.resultFile) {
    mkdirSync(dirname(parsed.resultFile), { recursive: true });
    const temporaryResultFile = `${parsed.resultFile}.${process.pid}.tmp`;
    writeFileSync(temporaryResultFile, `${JSON.stringify({ classification, result }, null, 2)}\n`, { mode: 0o600 });
    renameSync(temporaryResultFile, parsed.resultFile);
  }
  return { classification, result };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const { result } = main();
    process.exitCode = result.status;
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
