#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

function run(command, args, env) {
  process.stdout.write(`> ${command} ${args.join(" ")}\n`);
  const executable = process.platform === "win32" && command === "npm" ? "npm.cmd" : command;
  const result = spawnSync(executable, args, { env, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed with status ${result.status ?? "unknown"}`);
}

function options(argv) {
  const parsed = { phase: "source" };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--classification") parsed.classification = argv[++index];
    else if (argument === "--phase") parsed.phase = argv[++index];
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
  if (classification.runStatic) {
    if (classification.riskClass === "C0") commands.push(["node", ["scripts/check/check-architecture-docs.js"]]);
    else {
      commands.push(["npm", ["run", "db:generate"]]);
      commands.push(["npm", ["run", "lint:changed"]]);
      commands.push(["npm", ["run", "domain:changed"]]);
      commands.push(["npm", ["run", "db:migration:changed"]]);
    }
  }
  if (classification.runNode) commands.push(["npm", ["run", "test:node:affected"]]);
  if (classification.runType) commands.push(["npm", ["run", "typecheck:affected"]]);
  if (classification.runPostgresql) {
    commands.push(["npm", ["run", "check:data"]]);
    commands.push(["npx", ["prisma", "migrate", "deploy", "--schema=./prisma"]]);
    commands.push(["npm", ["run", "db:seed:resources"]]);
    commands.push(["npm", ["run", "test:integration:postgresql"]]);
  }
  return commands;
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
  };
  for (const [command, args] of selectedCommands(classification, parsed.phase, {
    deployUnitId: env.DEPLOY_UNIT_ID ?? "",
  })) run(command, args, executionEnv);
  return classification;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
