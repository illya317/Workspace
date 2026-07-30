#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
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

function runGitBuffer(cwd, args) {
  const result = spawnSync("git", args, { cwd });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed${result.stderr?.length ? `: ${result.stderr.toString("utf8").trim()}` : ""}`);
  }
  return result.stdout;
}

export function migrationSetSha256AtCommit(cwd, sha) {
  const files = runGit(cwd, ["ls-tree", "-r", "--name-only", sha, "--", "prisma/migrations"])
    .split("\n")
    .filter(Boolean)
    .sort();
  if (files.length === 0) throw new Error(`migration set is empty at ${sha}`);
  const hash = createHash("sha256");
  for (const file of files) {
    hash.update(file);
    hash.update("\0");
    hash.update(runGitBuffer(cwd, ["show", `${sha}:${file}`]));
    hash.update("\0");
  }
  return hash.digest("hex");
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
  genesisFromSha,
  recoverLocalReceiptBaseSha,
}) {
  const repositoryRoot = cwd || process.cwd();
  const candidate = requireSha(candidateSha, "candidate SHA");
  const candidateTree = requireSha(candidateTreeSha, "candidate tree SHA");
  const receipt = readDeployedRelease(receiptFile, { expectedRepository });
  if (receipt.schemaVersion !== 3) {
    throw new Error(`production receipt schema v3 is required; received v${receipt.schemaVersion}`);
  }

  requireExactCommit(repositoryRoot, candidate, "candidate SHA");
  const actualCandidateTree = runGit(repositoryRoot, ["rev-parse", `${candidate}^{tree}`]);
  if (actualCandidateTree !== candidateTree) {
    throw new Error(`candidate tree changed: expected ${candidateTree}, received ${actualCandidateTree}`);
  }

  let validationBase = receipt.runtimeSource.commitSha;
  let receiptRecovery;
  if (recoverLocalReceiptBaseSha) {
    if (genesisFromSha) throw new Error("local receipt recovery and genesis reset are mutually exclusive");
    if (receipt.transport !== "local"
      || receipt.runtimeSource.commitSha !== receipt.canonicalSource.commitSha
      || receipt.runtimeSource.treeSha !== receipt.canonicalSource.treeSha
      || receipt.runtimeSource.commitSha !== receipt.cnb.injectionSha) {
      throw new Error("production receipt is not the legacy local injection-as-source shape");
    }
    validationBase = requireSha(recoverLocalReceiptBaseSha, "local receipt recovery base");
    requireExactCommit(repositoryRoot, validationBase, "local receipt recovery base");
    if (validationBase === candidate) {
      throw new Error("local receipt recovery candidate must advance beyond the recovery base");
    }
    const baseMigrationSetSha256 = migrationSetSha256AtCommit(repositoryRoot, validationBase);
    if (baseMigrationSetSha256 !== receipt.migrationSetSha256) {
      throw new Error(
        `local receipt recovery migration set ${baseMigrationSetSha256} does not match production ${receipt.migrationSetSha256}`,
      );
    }
    receiptRecovery = {
      kind: "legacy-local-injection-source",
      baseSha: validationBase,
      sourceSha: receipt.runtimeSource.commitSha,
      treeSha: receipt.runtimeSource.treeSha,
      migrationSetSha256: receipt.migrationSetSha256,
    };
  } else {
    requireExactCommit(repositoryRoot, receipt.runtimeSource.commitSha, "deployed production SHA");
    const actualDeployedTree = runGit(repositoryRoot, [
      "rev-parse",
      `${receipt.runtimeSource.commitSha}^{tree}`,
    ]);
    if (actualDeployedTree !== receipt.runtimeSource.treeSha) {
      throw new Error(
        `deployed production tree changed: expected ${receipt.runtimeSource.treeSha}, received ${actualDeployedTree}`,
      );
    }
  }

  if (genesisFromSha) {
    const genesisFrom = requireSha(genesisFromSha, "genesis production baseline");
    if (receipt.runtimeSource.commitSha !== genesisFrom) {
      throw new Error(`production is ${receipt.runtimeSource.commitSha}, not the authorized genesis baseline ${genesisFrom}`);
    }
    const roots = runGit(repositoryRoot, ["rev-list", "--max-parents=0", candidate]).split("\n").filter(Boolean);
    if (roots.length !== 1) throw new Error("genesis candidate lineage must contain exactly one root");
    const mergeCommits = runGit(repositoryRoot, ["rev-list", "--min-parents=2", candidate]);
    if (mergeCommits) throw new Error("genesis candidate lineage must remain linear");
    const migrationFiles = runGit(repositoryRoot, ["ls-tree", "-r", "--name-only", candidate, "--", "prisma/migrations"])
      .split("\n")
      .filter(Boolean)
      .sort();
    const baseline = "00000000000000_sanitized_baseline";
    const expectedMigrationFiles = [
      `prisma/migrations/${baseline}/migration.sql`,
      "prisma/migrations/migration_lock.toml",
    ].sort();
    if (JSON.stringify(migrationFiles) !== JSON.stringify(expectedMigrationFiles)) {
      throw new Error("genesis candidate must contain only the sanitized Prisma baseline");
    }
    const baselineBody = runGit(repositoryRoot, ["show", `${candidate}:prisma/migrations/${baseline}/migration.sql`]);
    if (!baselineBody.startsWith("-- workspace:migration-mode=maintenance\n")) {
      throw new Error("sanitized Prisma baseline must declare maintenance migration mode");
    }
    return {
      schemaVersion: 1,
      production: { deployedSha: receipt.runtimeSource.commitSha, validationBaseSha: receipt.runtimeSource.commitSha },
      candidate: { commitSha: candidate, treeSha: candidateTree },
      order: { action: "deploy", reason: "audited-genesis-reset" },
      migration: { diffMode: "genesis", changedMigrations: [baseline], requiresMaintenance: true },
    };
  }

  const comparison = buildComparison(repositoryRoot, validationBase, candidate);
  const order = validateDeployOrder({
    candidateSha: candidate,
    currentHeadSha: candidate,
    deployedSha: validationBase,
    comparison,
  });
  const migration = checkMigrationPolicy({
    cwd: repositoryRoot,
    baseSha: validationBase,
    headSha: candidate,
    diffMode: "two-dot",
  });

  return {
    schemaVersion: 1,
    production: {
      deployedSha: receipt.runtimeSource.commitSha,
      validationBaseSha: validationBase,
    },
    candidate: { commitSha: candidate, treeSha: candidateTree },
    order,
    migration,
    ...(receiptRecovery ? { receiptRecovery } : {}),
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
    genesisFromSha: options.genesis_from,
    recoverLocalReceiptBaseSha: options.recover_local_receipt_base,
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
