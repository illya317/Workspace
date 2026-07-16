#!/usr/bin/env node

import { pathToFileURL } from "node:url";

const SHA_PATTERN = /^[0-9a-f]{40}$/;
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;

function requireSha(value, label) {
  if (!SHA_PATTERN.test(value ?? "")) throw new Error(`${label} must be a full lowercase Git SHA`);
  return value;
}

export function validateDeployOrder({
  candidateSha,
  candidateArtifactDigest,
  currentHeadSha,
  bootstrapBase,
  deployedSha,
  deployedArtifactDigest,
  comparison,
}) {
  requireSha(candidateSha, "candidate SHA");
  if (!DIGEST_PATTERN.test(candidateArtifactDigest ?? "")) throw new Error("candidate artifact digest is invalid");
  requireSha(currentHeadSha, "current CNB source SHA");
  if (candidateSha !== currentHeadSha) {
    throw new Error(`candidate ${candidateSha} is stale; CNB source is ${currentHeadSha}`);
  }
  if (bootstrapBase) {
    requireSha(bootstrapBase, "production bootstrap baseline");
    if (deployedSha) throw new Error("production bootstrap evidence is forbidden after a deployed record exists");
    if (!comparison
      || !["ahead", "identical"].includes(comparison.status)
      || comparison.base_commit?.sha !== bootstrapBase
      || comparison.merge_base_commit?.sha !== bootstrapBase
      || comparison.head_commit?.sha !== candidateSha
      || !Number.isInteger(comparison.ahead_by)
      || comparison.ahead_by < 0) {
      throw new Error(`candidate ${candidateSha} is not proven to descend from bootstrap baseline ${bootstrapBase}`);
    }
    return { action: "deploy", reason: "audited-production-bootstrap" };
  }
  if (!deployedSha) throw new Error("initial deployment requires audited production bootstrap evidence");
  requireSha(deployedSha, "deployed SHA");
  if (!DIGEST_PATTERN.test(deployedArtifactDigest ?? "")) throw new Error("deployed artifact digest is invalid");
  if (deployedSha === candidateSha) {
    return { action: "noop", reason: "source-already-deployed" };
  }
  if (!comparison || comparison.status !== "ahead"
    || comparison.base_commit?.sha !== deployedSha
    || comparison.merge_base_commit?.sha !== deployedSha
    || comparison.head_commit?.sha !== candidateSha
    || !Number.isInteger(comparison.ahead_by)
    || comparison.ahead_by < 1) {
    throw new Error(`candidate ${candidateSha} is not a proven descendant of deployed ${deployedSha}`);
  }
  return { action: "deploy", reason: "monotonic-upgrade" };
}

function parseArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key?.startsWith("--")) throw new Error(`unknown argument: ${key ?? "<empty>"}`);
    const value = argv[++index];
    if (value === undefined || value.startsWith("--")) throw new Error(`missing value for ${key}`);
    options[key.slice(2).replaceAll("-", "_")] = value;
  }
  return options;
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  let comparison;
  if (options.comparison_json) {
    try {
      comparison = JSON.parse(options.comparison_json);
    } catch {
      throw new Error("comparison JSON is invalid");
    }
  }
  const result = validateDeployOrder({
    candidateSha: options.candidate,
    candidateArtifactDigest: options.candidate_artifact_digest,
    currentHeadSha: options.current_head,
    bootstrapBase: options.bootstrap_base,
    deployedSha: options.deployed,
    deployedArtifactDigest: options.deployed_artifact_digest,
    comparison,
  });
  process.stdout.write(`${result.action}\n`);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
