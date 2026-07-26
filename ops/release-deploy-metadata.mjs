#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

function fail(message) { throw new Error(message); }

export function readReleaseDeployMetadata(file) {
  const metadata = JSON.parse(readFileSync(file, "utf8"));
  const deployment = metadata?.deployment;
  const timing = deployment?.localTiming;
  if (!Number.isSafeInteger(deployment?.startedAtEpochSeconds) || deployment.startedAtEpochSeconds < 0) {
    fail("release deployment start time is invalid");
  }
  if (!Number.isSafeInteger(timing?.releaseProcessSeconds) || timing.releaseProcessSeconds < 0) {
    fail("release process duration is invalid");
  }
  if (!Number.isSafeInteger(timing?.releaseAttemptCount) || timing.releaseAttemptCount < 1) {
    fail("release attempt count is invalid");
  }
  if (typeof timing?.releaseProcessStartedAt !== "string"
    || !Number.isFinite(Date.parse(timing.releaseProcessStartedAt))) {
    fail("release process start time is invalid");
  }
  return {
    startedAtEpochSeconds: deployment.startedAtEpochSeconds,
    releaseProcessSeconds: timing.releaseProcessSeconds,
    releaseAttemptCount: timing.releaseAttemptCount,
    releaseProcessStartedAt: new Date(timing.releaseProcessStartedAt).toISOString(),
  };
}

export function main(argv = process.argv.slice(2)) {
  const [command, file] = argv;
  if (command !== "lines" || !file) fail("usage: release-deploy-metadata.mjs lines FILE");
  const value = readReleaseDeployMetadata(file);
  process.stdout.write(`${[
    value.startedAtEpochSeconds,
    value.releaseProcessSeconds,
    value.releaseAttemptCount,
    value.releaseProcessStartedAt,
  ].join("\n")}\n`);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try { main(); } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
