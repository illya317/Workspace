#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { classifyRepositoryDiff } from "./classify-risk.mjs";
import { validateLocalFullCiReceipt } from "./local-full-ci-receipt.mjs";

const RECEIPT_NAME = "workspace-local-full-ci.json";

function git(cwd, args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr.trim()}`);
  return result.stdout.trim();
}

function gitMaybe(cwd, args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : null;
}

export function selectLocalPushCommands(classification, forceFull = false, reuseFullCi = false) {
  const { riskClass, reasonCodes = [] } = classification;
  if (forceFull) return [
    ["npm", ["run", "db:migration:policy"]],
    ["npm", ["run", "check:ci"]],
  ];
  if (reuseFullCi) return [["npm", ["run", "db:migration:policy"]]];
  if (riskClass === "C0") return [["npm", ["run", "docs:check:light"]]];
  if (riskClass === "C1" && reasonCodes.includes("presentation-only")) {
    return [["npm", ["run", "db:migration:policy"]]];
  }
  return [
    ["npm", ["run", "db:migration:policy"]],
    ["npm", ["run", "check:push:code"]],
  ];
}

export function hasReusableFullCiReceipt({
  cwd = process.cwd(),
  headSha,
  env = process.env,
  gitCommand = git,
  readFile = readFileSync,
} = {}) {
  try {
    if (env.PRE_PUSH_FULL === "1") return false;
    const currentHead = gitCommand(cwd, ["rev-parse", "HEAD^{commit}"]);
    if (headSha !== currentHead) return false;
    const treeSha = gitCommand(cwd, ["rev-parse", "HEAD^{tree}"]);
    const repositoryPath = gitCommand(cwd, ["rev-parse", "--git-path", RECEIPT_NAME]);
    const receiptPath = path.isAbsolute(repositoryPath) ? repositoryPath : path.resolve(cwd, repositoryPath);
    const receipt = JSON.parse(readFile(receiptPath, "utf8"));
    validateLocalFullCiReceipt(receipt, { treeSha });
    return true;
  } catch {
    return false;
  }
}

function parseArguments(argv) {
  const options = { cwd: process.cwd(), dryRun: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--base") options.baseSha = argv[++index];
    else if (argument === "--head") options.headSha = argv[++index];
    else if (argument === "--cwd") options.cwd = argv[++index];
    else if (argument === "--dry-run") options.dryRun = true;
    else throw new Error(`unknown argument: ${argument}`);
  }
  return options;
}

function resolveRevisions(options, env) {
  const headSha = options.headSha || env.WORKSPACE_DIFF_HEAD || git(options.cwd, ["rev-parse", "HEAD"]);
  let baseSha = options.baseSha || env.WORKSPACE_DIFF_BASE;
  if (!baseSha) {
    const upstream = gitMaybe(options.cwd, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"]);
    const comparisonRef = upstream || (gitMaybe(options.cwd, ["rev-parse", "--verify", "origin/main"]) ? "origin/main" : null);
    baseSha = comparisonRef
      ? git(options.cwd, ["merge-base", headSha, comparisonRef])
      : gitMaybe(options.cwd, ["rev-parse", `${headSha}^`]) || headSha;
  }
  return {
    baseSha: git(options.cwd, ["rev-parse", `${baseSha}^{commit}`]),
    headSha: git(options.cwd, ["rev-parse", `${headSha}^{commit}`]),
  };
}

export function main(argv = process.argv.slice(2), env = process.env) {
  const options = parseArguments(argv);
  const { baseSha, headSha } = resolveRevisions(options, env);
  const forceFull = env.PRE_PUSH_FULL === "1";
  const classification = classifyRepositoryDiff({
    cwd: options.cwd,
    baseSha,
    headSha,
    eventName: "local-push",
    forceFull,
    finalCandidate: true,
  });
  process.stdout.write(`Local push risk: ${classification.riskClass} (${classification.reasonCodes.join(", ")})\n`);
  const reuseFullCi = hasReusableFullCiReceipt({ cwd: options.cwd, headSha, env });
  if (reuseFullCi) {
    process.stdout.write("Reusing exact-tree full CI receipt; only base-dependent push checks remain.\n");
  }
  const commands = selectLocalPushCommands(classification, forceFull, reuseFullCi);
  for (const [command, args] of commands) {
    process.stdout.write(`> ${command} ${args.join(" ")}\n`);
    if (options.dryRun) continue;
    const executable = process.platform === "win32" && command === "npm" ? "npm.cmd" : command;
    const result = spawnSync(executable, args, {
      cwd: options.cwd,
      env: { ...env, WORKSPACE_DIFF_BASE: baseSha, WORKSPACE_DIFF_HEAD: headSha },
      stdio: "inherit",
    });
    if (result.error) throw result.error;
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
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
