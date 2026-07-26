#!/usr/bin/env node

import "dotenv/config";

import process from "node:process";
import {
  inspectPermissionReview,
  runPermissionReview,
} from "@workspace/platform/server/permission-review";

async function main() {
  const notify = process.argv.includes("--notify");
  if (notify) {
    const result = await runPermissionReview("manual");
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  const findings = await inspectPermissionReview();
  process.stdout.write(`${JSON.stringify({
    check: findings.length === 0,
    findingCount: findings.length,
    criticalCount: findings.filter((finding) => finding.severity === "critical").length,
    alertCount: findings.filter((finding) => finding.severity !== "warning").length,
    advisoryCount: findings.filter((finding) => finding.severity === "warning").length,
    findings,
  }, null, 2)}\n`);
  if (findings.length > 0) process.exitCode = 2;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
