#!/usr/bin/env node

import { readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { verifyBootstrapContext } from "../scripts/ci/production-bootstrap-receipt.mjs";
import { validateLocalFullCiReceipt } from "../scripts/ci/local-full-ci-receipt.mjs";

const SHA_PATTERN = /^[0-9a-f]{40}$/;
const REF_PATTERN = /^[A-Za-z0-9._/-]+$/;
const REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

function fail(message) {
  throw new Error(message);
}

function requireSha(value, label) {
  if (!SHA_PATTERN.test(value ?? "")) fail(`${label} must be a full lowercase Git SHA`);
  return value;
}

function requireRef(value) {
  if (!REF_PATTERN.test(value ?? "") || value.includes("..") || value.startsWith("/") || value.endsWith("/")) {
    fail("CNB source ref is invalid");
  }
  return value;
}

function requireRepository(value) {
  if (!REPOSITORY_PATTERN.test(value ?? "")) fail("CNB repository is invalid");
  return value;
}

async function gitOutput(cwd, args) {
  const { spawnSync } = await import("node:child_process");
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) fail(`git ${args.join(" ")} failed${result.stderr?.trim() ? `: ${result.stderr.trim()}` : ""}`);
  return result.stdout.trim();
}

export async function validateRequest({ cwd, request, expectedSourceSha, expectedSourceTree, expectedSourceRef, expectedRepository }) {
  if (!request || request.schemaVersion !== 2) fail("CNB deploy request schemaVersion must be 2");
  const sourceSha = requireSha(request.source?.commitSha, "CNB deploy source SHA");
  const sourceTree = requireSha(request.source?.treeSha, "CNB deploy source tree");
  const sourceRef = requireRef(request.source?.ref);
  const repository = requireRepository(request.cnb?.repository);
  if (expectedSourceSha && sourceSha !== expectedSourceSha) fail("CNB deploy request source SHA does not match release parent");
  if (expectedSourceTree && sourceTree !== expectedSourceTree) fail("CNB deploy request source tree does not match release parent");
  if (expectedSourceRef && sourceRef !== expectedSourceRef) fail("CNB deploy request source ref does not match configured ref");
  if (expectedRepository && repository !== expectedRepository) fail("CNB deploy request repository does not match configured repository");
  const actualTree = await gitOutput(cwd, ["rev-parse", `${sourceSha}^{tree}`]);
  if (actualTree !== sourceTree) fail("CNB deploy request source tree is not bound to its source SHA");
  validateLocalFullCiReceipt(request.localFullCi, {
    treeSha: sourceTree,
    requireRuntimeMatch: false,
  });
  if (request.bootstrap !== null) {
    if (!request.bootstrap || typeof request.bootstrap !== "object" || Array.isArray(request.bootstrap)) {
      fail("CNB deploy request bootstrap must be an object or null");
    }
    verifyBootstrapContext({ cwd, candidateSha: sourceSha, context: request.bootstrap });
  }
  return request;
}

export async function createRequest({ cwd, sourceSha, sourceRef, repository, bootstrapContext, localFullCi }) {
  const commitSha = requireSha(sourceSha, "CNB deploy source SHA");
  const treeSha = await gitOutput(cwd, ["rev-parse", `${commitSha}^{tree}`]);
  const request = {
    schemaVersion: 2,
    source: { commitSha, treeSha, ref: requireRef(sourceRef) },
    cnb: { repository: requireRepository(repository) },
    localFullCi,
    bootstrap: bootstrapContext ?? null,
  };
  return validateRequest({ cwd, request });
}

function parseArguments(argv) {
  const [command, ...rest] = argv;
  const options = { command };
  for (let index = 0; index < rest.length; index += 1) {
    const key = rest[index];
    if (!key?.startsWith("--")) fail(`unknown argument: ${key ?? "<empty>"}`);
    const value = rest[++index];
    if (value === undefined || value.startsWith("--")) fail(`missing value for ${key}`);
    options[key.slice(2).replaceAll("-", "_")] = value;
  }
  return options;
}

function required(options, key) {
  if (!options[key]) fail(`--${key.replaceAll("_", "-")} is required`);
  return options[key];
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  const cwd = path.resolve(options.cwd ?? process.cwd());
  if (options.command === "create") {
    const bootstrapContext = options.bootstrap_context
      ? JSON.parse(readFileSync(path.resolve(options.bootstrap_context), "utf8"))
      : null;
    const request = await createRequest({
      cwd,
      sourceSha: required(options, "source_sha"),
      sourceRef: required(options, "source_ref"),
      repository: required(options, "repository"),
      bootstrapContext,
      localFullCi: JSON.parse(readFileSync(path.resolve(required(options, "local_ci_receipt")), "utf8")),
    });
    const output = path.resolve(required(options, "output"));
    const temporary = `${output}.tmp-${process.pid}`;
    writeFileSync(temporary, `${JSON.stringify(request, null, 2)}\n`, { mode: 0o600 });
    renameSync(temporary, output);
    return;
  }
  if (options.command === "validate") {
    const request = JSON.parse(readFileSync(path.resolve(required(options, "request")), "utf8"));
    await validateRequest({
      cwd,
      request,
      expectedSourceSha: options.source_sha,
      expectedSourceTree: options.source_tree,
      expectedSourceRef: options.source_ref,
      expectedRepository: options.repository,
    });
    if (options.format === "lines") {
      const bootstrap = request.bootstrap;
      const values = [
        request.source.commitSha,
        request.source.treeSha,
        request.source.ref,
        request.cnb.repository,
        bootstrap?.baselineSha ?? "",
        bootstrap?.legacy?.cnbCommitSha ?? "",
        bootstrap?.legacy?.releaseId ?? "",
        bootstrap?.legacy?.cnbBuildSn ?? "",
        bootstrap?.legacy?.runtimeVersion ?? "",
        bootstrap?.legacy?.buildId ?? "",
        bootstrap?.legacy?.cnbRepository ?? "",
        bootstrap?.database?.migrationCount ?? "",
        bootstrap?.database?.migrationSetSha256 ?? "",
      ];
      process.stdout.write(`${values.join("\n")}\n`);
    } else {
      process.stdout.write(`${JSON.stringify(request)}\n`);
    }
    return;
  }
  fail("usage: cnb-deploy-request.mjs create|validate [options]");
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
