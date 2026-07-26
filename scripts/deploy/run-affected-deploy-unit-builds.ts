#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { resolveDeployUnitImpact } from "./deploy-unit-impact";

function changedFilesFromEnvironment() {
  const serialized = process.env.WORKSPACE_CHANGED_FILES_JSON;
  if (!serialized) throw new Error("WORKSPACE_CHANGED_FILES_JSON is required");
  const value = JSON.parse(serialized) as unknown;
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error("WORKSPACE_CHANGED_FILES_JSON must be a JSON string array");
  }
  return value as string[];
}

function parseArguments(argv: string[]) {
  let execute = false;
  let output: string | null = null;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--execute") {
      execute = true;
      continue;
    }
    if (argument === "--output") {
      output = argv[index + 1] ?? null;
      if (!output) throw new Error("--output requires a repository-relative path");
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }
  return { execute, output };
}

function safeOutputPath(repositoryRoot: string, candidate: string) {
  if (path.isAbsolute(candidate) || candidate.split(/[\\/]/).includes("..")) {
    throw new Error("--output must stay inside the repository");
  }
  const resolved = path.resolve(repositoryRoot, candidate);
  if (resolved !== repositoryRoot && !resolved.startsWith(`${repositoryRoot}${path.sep}`)) {
    throw new Error("--output must stay inside the repository");
  }
  return resolved;
}

export function createAffectedDeployUnitBuildPlan(changedFiles: readonly string[]) {
  const impact = resolveDeployUnitImpact(changedFiles);
  return {
    schemaVersion: 1 as const,
    kind: "workspace-affected-deploy-unit-build-plan" as const,
    changedFiles: [...new Set(changedFiles)].sort(),
    affectedUnitIds: impact.affectedUnitIds,
    buildUnitIds: impact.buildableUnitIds,
    fullGraphFanout: impact.fullTypecheckRequired,
    failClosed: impact.failClosed,
    reasons: impact.reasons,
  };
}

function runBuild(unitId: string) {
  const result = spawnSync("bash", ["ops/build-deploy-unit-artifact.sh", unitId], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${unitId} deploy-unit artifact build failed with status ${result.status ?? "unknown"}`);
}

export function main(argv = process.argv.slice(2)) {
  const { execute, output } = parseArguments(argv);
  const plan = createAffectedDeployUnitBuildPlan(changedFilesFromEnvironment());
  const serialized = `${JSON.stringify(plan, null, 2)}\n`;
  process.stdout.write(serialized);
  if (output) {
    const target = safeOutputPath(process.cwd(), output);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, serialized, { mode: 0o600 });
  }
  if (execute) {
    for (const unitId of plan.buildUnitIds) runBuild(unitId);
  }
  return plan;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
