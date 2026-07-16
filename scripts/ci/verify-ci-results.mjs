#!/usr/bin/env node

import { pathToFileURL } from "node:url";

const JOBS = ["static", "node", "type", "postgresql", "build", "e2e"];
const TERMINAL_RESULTS = new Set(["success", "failure", "cancelled", "skipped"]);

function parseObject(raw, name) {
  let value;
  try {
    value = JSON.parse(raw);
  } catch (error) {
    throw new Error(`${name} must be valid JSON: ${error instanceof Error ? error.message : error}`);
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${name} must be a JSON object`);
  }
  return value;
}

export function verifyCiResults({ expectations, results }) {
  const expectedKeys = new Set(JOBS);
  const unknownExpectations = Object.keys(expectations).filter((key) => !expectedKeys.has(key));
  const expectedResultKeys = new Set(["classify", ...JOBS]);
  const unknownResults = Object.keys(results).filter((key) => !expectedResultKeys.has(key));
  if (unknownExpectations.length > 0) throw new Error(`unknown expected jobs: ${unknownExpectations.join(", ")}`);
  if (unknownResults.length > 0) throw new Error(`unknown result jobs: ${unknownResults.join(", ")}`);
  if (results.classify !== "success") {
    throw new Error(`classification must succeed; received ${String(results.classify || "missing")}`);
  }

  const verified = [];
  for (const job of JOBS) {
    if (typeof expectations[job] !== "boolean") {
      throw new Error(`expectation for ${job} must be boolean`);
    }
    const actual = results[job];
    if (!TERMINAL_RESULTS.has(actual)) {
      throw new Error(`result for ${job} is missing or unknown: ${String(actual)}`);
    }
    const requiredResult = expectations[job] ? "success" : "skipped";
    if (actual !== requiredResult) {
      throw new Error(`${job} expected ${requiredResult} but received ${actual}`);
    }
    verified.push({ job, expected: expectations[job], result: actual });
  }
  return verified;
}

export function main(env = process.env) {
  const expectations = parseObject(env.CI_EXPECTATIONS_JSON || "", "CI_EXPECTATIONS_JSON");
  const results = parseObject(env.CI_RESULTS_JSON || "", "CI_RESULTS_JSON");
  const verified = verifyCiResults({ expectations, results });
  for (const item of verified) {
    process.stdout.write(`${item.job}: ${item.result} (${item.expected ? "required" : "expected skip"})\n`);
  }
  process.stdout.write("All CI job results match the trusted classification.\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
