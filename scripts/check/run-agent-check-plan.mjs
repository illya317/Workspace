#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const SAFE_COMMAND = /^[A-Za-z0-9._/@+-]+$/;

function normalizePaths(values, location) {
  if (!Array.isArray(values) || values.some((value) => typeof value !== "string" || !value)) {
    throw new Error(`${location} must be a string array`);
  }
  const normalized = values.map((value) => value.split(path.sep).join("/"));
  if (normalized.some((value) => value.startsWith("/") || value.split("/").includes(".."))) {
    throw new Error(`${location} must contain repository-relative paths`);
  }
  if (new Set(normalized).size !== normalized.length) throw new Error(`${location} contains duplicates`);
  return normalized.sort();
}

export function validateAgentCheckPlan(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || value.schemaVersion !== 1
    || value.kind !== "workspace-agent-check-plan") {
    throw new Error("agent check plan contract is invalid");
  }
  const selectedPaths = normalizePaths(value.selectedPaths, "selectedPaths");
  const dependencyPaths = normalizePaths(value.dependencyPaths, "dependencyPaths");
  if (!Array.isArray(value.commands) || value.commands.length === 0) throw new Error("commands must not be empty");
  const commands = value.commands.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item) || typeof item.label !== "string"
      || typeof item.command !== "string" || !SAFE_COMMAND.test(item.command)
      || !Array.isArray(item.args) || item.args.some((arg) => typeof arg !== "string")) {
      throw new Error(`commands[${index}] is invalid`);
    }
    return { label: item.label, command: item.command, args: [...item.args] };
  });
  return { schemaVersion: 1, kind: value.kind, selectedPaths, dependencyPaths, commands };
}

function stagedPaths(cwd) {
  return execFileSync("git", ["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"], {
    cwd,
    encoding: "buffer",
  }).toString("utf8").split("\0").filter(Boolean).sort();
}

export function runAgentCheckPlan({
  plan,
  cwd = process.cwd(),
  execute = (command, args, env) => spawnSync(command, args, { cwd, env, stdio: "inherit" }),
  env = process.env,
}) {
  const validated = validateAgentCheckPlan(plan);
  const staged = stagedPaths(cwd);
  if (JSON.stringify(validated.selectedPaths) !== JSON.stringify(staged)) {
    throw new Error("selectedPaths must exactly match the staged tree; unrelated worktree files are ignored");
  }
  const checkEnv = {
    ...env,
    WORKSPACE_CHANGED_FILES_JSON: JSON.stringify([...new Set([
      ...validated.selectedPaths,
      ...validated.dependencyPaths,
    ])].sort()),
  };
  const results = [];
  for (const item of validated.commands) {
    process.stdout.write(`> [agent-plan] ${item.label}: ${item.command} ${item.args.join(" ")}\n`);
    const result = execute(item.command, item.args, checkEnv);
    const status = result.error || result.signal || result.status === null ? 1 : result.status;
    results.push({ label: item.label, status });
  }
  return { status: results.find((item) => item.status !== 0)?.status ?? 0, results };
}

export function main(argv = process.argv.slice(2)) {
  if (argv.length !== 2 || argv[0] !== "--plan") throw new Error("usage: run-agent-check-plan.mjs --plan FILE");
  const result = runAgentCheckPlan({ plan: JSON.parse(readFileSync(path.resolve(argv[1]), "utf8")) });
  process.exitCode = result.status;
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { main(); } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
