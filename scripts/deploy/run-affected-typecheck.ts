#!/usr/bin/env node

import { spawnSync } from "node:child_process";
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

function runTypecheck(arguments_: string[]) {
  const result = spawnSync(process.execPath, ["scripts/check/run-typecheck.js", ...arguments_], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

export function main() {
  const impact = resolveDeployUnitImpact(changedFilesFromEnvironment());
  process.stdout.write(`${JSON.stringify(impact, null, 2)}\n`);
  if (impact.typecheckScopes.length === 0) return impact;
  if (impact.fullTypecheckRequired) {
    runTypecheck(["--build", "--pretty", "false"]);
    return impact;
  }
  for (const scope of impact.typecheckScopes) runTypecheck(["--scope", scope]);
  return impact;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
