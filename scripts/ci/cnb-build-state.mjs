#!/usr/bin/env node

import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const ACTIVE_STATES = new Set(["created", "pending", "queued", "running", "start", "waiting"]);
const FAILURE_STATES = new Set([
  "aborted",
  "cancel",
  "canceled",
  "cancelled",
  "error",
  "failed",
  "failure",
  "terminated",
  "timeout",
]);
const SN_PATTERN = /^cnb-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SHA_PATTERN = /^[0-9a-f]{40}$/;
const REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

function parseArguments(argv) {
  const [command, ...rest] = argv;
  const options = { command };
  for (let index = 0; index < rest.length; index += 1) {
    const key = rest[index];
    if (!key?.startsWith("--")) throw new Error(`unknown argument: ${key ?? "<empty>"}`);
    const value = rest[++index];
    if (value === undefined || value.startsWith("--")) throw new Error(`missing value for ${key}`);
    options[key.slice(2).replaceAll("-", "_")] = value;
  }
  return options;
}

function loadJson(path) {
  return JSON.parse(readFileSync(resolve(path), "utf8"));
}

function writeJsonAtomic(path, value) {
  const absolute = resolve(path);
  mkdirSync(dirname(absolute), { recursive: true });
  const temporary = `${absolute}.tmp-${process.pid}`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  renameSync(temporary, absolute);
}

export function parseCnbTriggerResponse(response) {
  const sn = response?.data?.sn;
  const buildLogUrl = response?.data?.buildLogUrl;
  if (response?.status !== 200 || response?.data?.success !== true || !SN_PATTERN.test(sn ?? "")) {
    throw new Error("CNB trigger response does not prove an accepted build");
  }
  let url;
  try {
    url = new URL(buildLogUrl);
  } catch {
    throw new Error("CNB trigger response has no valid build log URL");
  }
  if (url.protocol !== "https:" || url.hostname !== "cnb.cool" || !url.pathname.endsWith(`/${sn}`)) {
    throw new Error("CNB build log URL does not match the accepted build SN");
  }
  return { schemaVersion: 1, sn, buildLogUrl };
}

export function classifyCnbBuildResponse(response) {
  if (response?.status !== 200 || typeof response?.data?.status !== "string") return "unknown";
  const state = response.data.status.toLowerCase();
  if (state === "success") return "success";
  if (ACTIVE_STATES.has(state)) return "active";
  if (FAILURE_STATES.has(state)) return "failure";
  return "unknown";
}

export function verifyLegacyCnbBuild({ historyResponse, statusResponse, repository, sn, sha }) {
  if (!REPOSITORY_PATTERN.test(repository ?? "")) throw new Error("legacy CNB repository is invalid");
  if (!SN_PATTERN.test(sn ?? "")) throw new Error("legacy CNB build SN is invalid");
  if (!SHA_PATTERN.test(sha ?? "")) throw new Error("legacy CNB commit SHA is invalid");
  const matches = historyResponse?.data?.data;
  if (historyResponse?.status !== 200
    || !/^1$/.test(String(historyResponse?.data?.total ?? ""))
    || !Array.isArray(matches)
    || matches.length !== 1) {
    throw new Error("CNB history does not contain exactly one legacy build");
  }
  const build = matches[0];
  if (build.sn !== sn
    || build.slug !== repository
    || build.sourceSlug !== repository
    || build.sha !== sha
    || build.event !== "api_trigger_manual"
    || build.sourceRef !== "cnb-release"
    || build.targetRef !== "cnb-release"
    || build.status !== "success"
    || build.pipelineTotalCount !== 1
    || build.pipelineFailCount !== 0
    || build.pipelineSuccessCount !== 1) {
    throw new Error("legacy CNB history does not bind the exact successful manual release");
  }
  if (classifyCnbBuildResponse(statusResponse) !== "success") {
    throw new Error("legacy CNB build is not terminal success");
  }
  const pipelines = Object.values(statusResponse?.data?.pipelinesStatus ?? {});
  const pipeline = pipelines.length === 1 ? pipelines[0] : null;
  const deployStages = pipeline?.stages?.filter((stage) => stage?.name === "deploy-to-server") ?? [];
  if (pipeline?.name !== "deploy-prod"
    || pipeline?.status !== "success"
    || deployStages.length !== 1
    || deployStages[0]?.status !== "success") {
    throw new Error("legacy CNB build does not prove a successful deploy-to-server stage");
  }
  return { repository, sn, sha };
}

export function main(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  if (options.command === "parse-trigger") {
    if (!options.input || !options.output) throw new Error("parse-trigger requires --input and --output");
    const result = parseCnbTriggerResponse(loadJson(options.input));
    writeJsonAtomic(options.output, result);
    process.stdout.write(`${result.sn}\n`);
    return;
  }
  if (options.command === "classify-status") {
    if (!options.input) throw new Error("classify-status requires --input");
    process.stdout.write(`${classifyCnbBuildResponse(loadJson(options.input))}\n`);
    return;
  }
  if (options.command === "verify-legacy-build") {
    for (const key of ["history", "status", "repository", "sn", "sha"]) {
      if (!options[key]) throw new Error(`verify-legacy-build requires --${key}`);
    }
    const result = verifyLegacyCnbBuild({
      historyResponse: loadJson(options.history),
      statusResponse: loadJson(options.status),
      repository: options.repository,
      sn: options.sn,
      sha: options.sha,
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }
  throw new Error("usage: cnb-build-state.mjs parse-trigger|classify-status|verify-legacy-build [options]");
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
