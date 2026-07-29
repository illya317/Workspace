#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const checks = [
  ["node", ["scripts/check/check-business-code-hardcoding.mjs"]],
  ["node", ["--import", "tsx", "scripts/check/check-business-code-registry.ts"]],
];

for (const [command, args] of checks) {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.status === 0) continue;
  process.exit(result.status ?? 1);
}
