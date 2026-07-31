#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

import { RELEASE_STAGES, validateReleasePlan } from "./release-plan.mjs";

const DIGEST_PATTERN = /^[0-9a-f]{64}$/;

function exactKeys(value, expected, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...expected].sort())) {
    throw new Error(`${label} has unsupported or missing fields`);
  }
  return value;
}

export function validateReleasePlanSnapshot(snapshot, expected = {}) {
  exactKeys(snapshot, ["schemaVersion", "kind", "plan", "stages", "ledgerHead"], "release plan snapshot");
  if (snapshot.schemaVersion !== 1 || snapshot.kind !== "workspace-release-plan-snapshot"
    || !DIGEST_PATTERN.test(snapshot.ledgerHead ?? "")) {
    throw new Error("release plan snapshot contract is invalid");
  }
  const plan = validateReleasePlan(snapshot.plan);
  exactKeys(snapshot.stages, RELEASE_STAGES, "release plan snapshot stages");
  for (const status of Object.values(snapshot.stages)) {
    if (!new Set(["pending", "running", "succeeded", "failed", "cancelled", "skipped_by_fast"]).has(status)) {
      throw new Error("release plan snapshot contains an invalid stage status");
    }
  }
  if (expected.sourceSha && plan.source.commitSha !== expected.sourceSha) throw new Error("release plan snapshot source differs");
  if (expected.treeId && plan.source.treeId !== expected.treeId) throw new Error("release plan snapshot tree differs");
  if (expected.contentDigest && plan.source.contentDigest !== expected.contentDigest) throw new Error("release plan snapshot content differs");
  if (expected.action) {
    if (!RELEASE_STAGES.includes(expected.action) || expected.action === "prepare") throw new Error("release snapshot action is invalid");
    if (snapshot.stages[expected.action] !== "running") throw new Error(`release stage ${expected.action} is not running`);
    if (expected.executor && plan.executors[expected.action] !== expected.executor) {
      throw new Error(`release stage ${expected.action} executor differs from transport`);
    }
    if (expected.action === "deploy") {
      if (snapshot.stages.build !== "succeeded") throw new Error("deploy snapshot lacks completed build evidence");
      const validation = plan.mode === "fast" ? "skipped_by_fast" : "succeeded";
      if (snapshot.stages.validate !== validation) throw new Error("deploy snapshot lacks the sealed validation decision");
    }
  }
  return snapshot;
}

function parse(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || value === undefined) throw new Error(`invalid argument: ${key ?? ""}`);
    options[key.slice(2).replaceAll("-", "_")] = value;
  }
  return options;
}

export function main(argv = process.argv.slice(2)) {
  const options = parse(argv);
  if (!options.file && !options.metadata) throw new Error("--file or --metadata is required");
  const document = JSON.parse(readFileSync(options.file ?? options.metadata, "utf8"));
  const snapshot = options.metadata ? document.releasePlan : document;
  const validated = validateReleasePlanSnapshot(snapshot, {
    action: options.action,
    executor: options.executor,
    sourceSha: options.source,
    treeId: options.tree,
    contentDigest: options.content,
  });
  if (options.metadata) {
    if (document.transport?.kind !== options.executor || document.validation?.action !== options.action) {
      throw new Error("release metadata action or transport differs from the sealed plan");
    }
    if (JSON.stringify(document.deployment?.target) !== JSON.stringify(validated.plan.target)) {
      throw new Error("release metadata target differs from the sealed plan");
    }
  }
  process.stdout.write(`${JSON.stringify({ planId: validated.plan.planId, action: options.action ?? null })}\n`);
  return validated;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { main(); } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
