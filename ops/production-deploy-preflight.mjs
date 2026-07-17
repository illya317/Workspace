#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

import { checkMigrationPolicy } from "../scripts/ci/check-migration-policy.mjs";
import { readDeployedRelease } from "./release-receipt.mjs";
import { validateDeployOrder } from "./verify-deploy-order.mjs";

const SHA_PATTERN = /^[0-9a-f]{40}$/;

function requireSha(value, label) {
  if (!SHA_PATTERN.test(value ?? "")) throw new Error(`${label} must be a full lowercase Git SHA`);
  return value;
}

function runGit(cwd, args, { allowNoMergeBase = false } = {}) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (allowNoMergeBase && result.status === 1) return "";
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed${result.stderr?.trim() ? `: ${result.stderr.trim()}` : ""}`);
  }
  return result.stdout.trim();
}

function requireExactCommit(cwd, sha, label) {
  const resolved = runGit(cwd, ["rev-parse", "--verify", `${sha}^{commit}`]);
  if (resolved !== sha) throw new Error(`${label} did not resolve exactly: ${sha}`);
}

function buildComparison(cwd, baseSha, headSha) {
  if (baseSha === headSha) return undefined;
  const mergeBase = runGit(cwd, ["merge-base", baseSha, headSha], { allowNoMergeBase: true });
  const aheadBy = Number(runGit(cwd, ["rev-list", "--count", `${baseSha}..${headSha}`]));
  return {
    status: mergeBase === baseSha ? "ahead" : "diverged",
    ahead_by: aheadBy,
    base_commit: { sha: baseSha },
    merge_base_commit: { sha: mergeBase },
    head_commit: { sha: headSha },
  };
}

export function preflightProductionDeploy({
  cwd,
  receiptFile,
  candidateSha,
  candidateTreeSha,
  expectedRepository,
}) {
  const repositoryRoot = cwd || process.cwd();
  const candidate = requireSha(candidateSha, "candidate SHA");
  const candidateTree = requireSha(candidateTreeSha, "candidate tree SHA");
  const receipt = readDeployedRelease(receiptFile, { expectedRepository });
  if (receipt.schemaVersion !== 3) {
    throw new Error(`production receipt schema v3 is required; received v${receipt.schemaVersion}`);
  }

  requireExactCommit(repositoryRoot, candidate, "candidate SHA");
  requireExactCommit(repositoryRoot, receipt.canonicalSource.commitSha, "production canonical SHA");
  const actualCandidateTree = runGit(repositoryRoot, ["rev-parse", `${candidate}^{tree}`]);
  if (actualCandidateTree !== candidateTree) {
    throw new Error(`candidate tree changed: expected ${candidateTree}, received ${actualCandidateTree}`);
  }
  const actualCanonicalTree = runGit(repositoryRoot, [
    "rev-parse",
    `${receipt.canonicalSource.commitSha}^{tree}`,
  ]);
  if (actualCanonicalTree !== receipt.canonicalSource.treeSha) {
    throw new Error(
      `production canonical tree changed: expected ${receipt.canonicalSource.treeSha}, received ${actualCanonicalTree}`,
    );
  }

  const comparison = buildComparison(repositoryRoot, receipt.canonicalSource.commitSha, candidate);
  const order = validateDeployOrder({
    candidateSha: candidate,
    currentHeadSha: candidate,
    deployedSha: receipt.runtimeSource.commitSha,
    deployedCanonicalSha: receipt.canonicalSource.commitSha,
    deployedTransport: receipt.transport,
    candidateTransport: "cnb",
    comparison,
  });
  const migration = checkMigrationPolicy({
    cwd: repositoryRoot,
    baseSha: receipt.canonicalSource.commitSha,
    headSha: candidate,
    diffMode: "two-dot",
  });

  return {
    schemaVersion: 1,
    production: {
      runtimeSha: receipt.runtimeSource.commitSha,
      canonicalSha: receipt.canonicalSource.commitSha,
      transport: receipt.transport,
    },
    candidate: { commitSha: candidate, treeSha: candidateTree },
    order,
    migration,
  };
}

function parseArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument?.startsWith("--")) throw new Error(`unknown argument: ${argument ?? "<empty>"}`);
    const value = argv[++index];
    if (value === undefined || value.startsWith("--")) throw new Error(`missing value for ${argument}`);
    options[argument.slice(2).replaceAll("-", "_")] = value;
  }
  return options;
}

function requireOption(options, key) {
  const value = options[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`--${key.replaceAll("_", "-")} is required`);
  }
  return value;
}

export function main(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  const result = preflightProductionDeploy({
    cwd: options.cwd || process.cwd(),
    receiptFile: requireOption(options, "receipt"),
    candidateSha: requireOption(options, "candidate"),
    candidateTreeSha: requireOption(options, "candidate_tree"),
    expectedRepository: requireOption(options, "expected_repository"),
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
