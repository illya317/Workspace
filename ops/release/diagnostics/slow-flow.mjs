#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export function diagnoseSlowRelease(events, {
  reviewStageAfterMs = 15 * 60 * 1000,
  reviewTotalAfterMs = 30 * 60 * 1000,
} = {}) {
  if (!Array.isArray(events)) throw new Error("release events must be an array");
  const diagnostics = [];
  const completed = events.filter((event) => Number.isFinite(event?.durationMs));
  const totalMs = completed.reduce((sum, event) => sum + event.durationMs, 0);
  for (const event of completed.filter((item) => item.durationMs >= reviewStageAfterMs)) {
    diagnostics.push({
      code: "slow-stage",
      stage: event.stage,
      durationMs: event.durationMs,
      message: `inspect ${event.stage}: stage exceeded the soft review threshold`,
    });
  }
  for (const stage of ["full-source-ci", "artifact-compile"]) {
    const count = completed.filter((event) => event.stage === stage).length;
    if (count > 1) diagnostics.push({
      code: "repeated-expensive-stage",
      stage,
      count,
      message: `inspect orchestration: ${stage} ran ${count} times`,
    });
  }
  if (events.filter((event) => event.cache === "miss").length > 1) diagnostics.push({
    code: "repeated-cache-miss",
    stage: "artifact-cache",
    message: "inspect cache inputs: multiple content-cache misses were recorded",
  });
  if (totalMs >= reviewTotalAfterMs) diagnostics.push({
    code: "slow-release-total",
    stage: "release",
    durationMs: totalMs,
    message: "inspect the release DAG: cumulative work exceeded the soft review threshold",
  });
  return { totalMs, diagnostics, blocking: false };
}

export function main(argv = process.argv.slice(2)) {
  if (argv.length !== 2 || argv[0] !== "--file") throw new Error("usage: slow-flow.mjs --file EVENTS.json");
  const report = diagnoseSlowRelease(JSON.parse(readFileSync(argv[1], "utf8")));
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { main(); } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
