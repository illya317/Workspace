#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

function requireDuration(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} must be a non-negative integer`);
  return value;
}

export function formatDurationMs(durationMs) {
  requireDuration(durationMs, "durationMs");
  if (durationMs < 1_000) return `${durationMs}ms`;
  const totalSeconds = Math.round(durationMs / 1_000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  return `${Math.floor(totalSeconds / 60)}m ${String(totalSeconds % 60).padStart(2, "0")}s`;
}

export function summarizeCnbBuildStatus(payload) {
  const pipelines = payload?.data?.pipelinesStatus;
  if (!pipelines || typeof pipelines !== "object" || Array.isArray(pipelines)) {
    throw new Error("CNB build status has no pipelinesStatus object");
  }
  const values = Object.values(pipelines);
  if (values.length !== 1) throw new Error("CNB build status must contain exactly one pipeline");
  const pipeline = values[0];
  const stages = pipeline?.stages;
  if (!Array.isArray(stages) || stages.length === 0) throw new Error("CNB pipeline has no stages");
  const normalizedStages = stages
    .filter((stage) => stage?.status !== "skipped")
    .map((stage, index) => ({
      name: typeof stage?.name === "string" && stage.name ? stage.name : `stage-${index + 1}`,
      status: typeof stage?.status === "string" && stage.status ? stage.status : "unknown",
      durationMs: requireDuration(stage?.duration, `stage ${index + 1} duration`),
    }));
  const pipelineDurationMs = requireDuration(pipeline?.duration, "pipeline duration");
  const slowestStage = normalizedStages.reduce(
    (slowest, stage) => !slowest || stage.durationMs > slowest.durationMs ? stage : slowest,
    null,
  );
  return { pipelineDurationMs, stages: normalizedStages, slowestStage };
}

export function formatCnbBuildTimingSummary(summary) {
  const lines = [`    CNB 流水线      ${formatDurationMs(summary.pipelineDurationMs)}`];
  for (const stage of summary.stages) {
    lines.push(`      ${stage.name} [${stage.status}] ${formatDurationMs(stage.durationMs)}`);
  }
  if (summary.slowestStage) {
    const percent = summary.pipelineDurationMs === 0
      ? 0
      : Math.round((summary.slowestStage.durationMs / summary.pipelineDurationMs) * 100);
    lines.push(
      `    CNB 最慢阶段    ${summary.slowestStage.name} ${formatDurationMs(summary.slowestStage.durationMs)} (${percent}%)`,
    );
  }
  return lines.join("\n");
}

function main(argv = process.argv.slice(2)) {
  const inputIndex = argv.indexOf("--input");
  const input = inputIndex >= 0 ? argv[inputIndex + 1] : undefined;
  if (!input || argv.length !== 2) throw new Error("usage: cnb-build-timing-summary.mjs --input FILE");
  const payload = JSON.parse(fs.readFileSync(path.resolve(input), "utf8"));
  process.stdout.write(`${formatCnbBuildTimingSummary(summarizeCnbBuildStatus(payload))}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
