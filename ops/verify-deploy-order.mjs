#!/usr/bin/env node

import { pathToFileURL } from "node:url";

const SHA_PATTERN = /^[0-9a-f]{40}$/;

function requireSha(value, label) {
  if (!SHA_PATTERN.test(value ?? "")) throw new Error(`${label} must be a full lowercase Git SHA`);
  return value;
}

export function validateDeployOrder({
  candidateSha,
  currentHeadSha,
  bootstrapBase,
  deployedSha,
  deployedCanonicalSha,
  deployedTransport = "cnb",
  candidateTransport = "cnb",
  comparison,
}) {
  requireSha(candidateSha, "candidate SHA");
  requireSha(currentHeadSha, "current CNB source SHA");
  if (!new Set(["cnb", "ssh-hotfix"]).has(candidateTransport)) {
    throw new Error(`unsupported candidate transport: ${candidateTransport}`);
  }
  if (!new Set(["cnb", "ssh-hotfix"]).has(deployedTransport)) {
    throw new Error(`unsupported deployed transport: ${deployedTransport}`);
  }
  if (candidateSha !== currentHeadSha) {
    throw new Error(`candidate ${candidateSha} is stale; checked-out source is ${currentHeadSha}`);
  }
  if (bootstrapBase) {
    requireSha(bootstrapBase, "production bootstrap baseline");
    if (deployedSha) throw new Error("production bootstrap metadata is forbidden after a deployed record exists");
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
  if (!deployedSha) throw new Error("initial deployment requires audited production bootstrap metadata");
  requireSha(deployedSha, "deployed SHA");
  const orderingBase = candidateTransport === "cnb"
    ? (deployedCanonicalSha ?? deployedSha)
    : deployedSha;
  requireSha(orderingBase, "deployment ordering baseline");
  const formalReplacesHotfix = candidateTransport === "cnb" && deployedTransport === "ssh-hotfix";
  if (orderingBase === candidateSha) {
    if (formalReplacesHotfix) {
      return { action: "deploy", reason: "formal-replaces-hotfix" };
    }
    return { action: "noop", reason: "source-already-deployed" };
  }
  if (!comparison || comparison.status !== "ahead"
    || comparison.base_commit?.sha !== orderingBase
    || comparison.merge_base_commit?.sha !== orderingBase
    || comparison.head_commit?.sha !== candidateSha
    || !Number.isInteger(comparison.ahead_by)
    || comparison.ahead_by < 1) {
    throw new Error(`candidate ${candidateSha} is not a proven descendant of deployment baseline ${orderingBase}`);
  }
  if (formalReplacesHotfix) return { action: "deploy", reason: "formal-replaces-hotfix" };
  return {
    action: "deploy",
    reason: candidateTransport === "ssh-hotfix" ? "hotfix-monotonic-upgrade" : "monotonic-upgrade",
  };
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
    currentHeadSha: options.current_head,
    bootstrapBase: options.bootstrap_base,
    deployedSha: options.deployed,
    deployedCanonicalSha: options.deployed_canonical,
    deployedTransport: options.deployed_transport ?? "cnb",
    candidateTransport: options.candidate_transport ?? "cnb",
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
