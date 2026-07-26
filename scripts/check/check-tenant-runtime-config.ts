#!/usr/bin/env node

import path from "node:path";

import { getTenantConfig } from "../../packages/platform/server/tenant-config";

function workspaceArgument(argv: string[]) {
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--workspace") return argv[index + 1] || "";
    if (argument.startsWith("--workspace=")) return argument.slice("--workspace=".length);
    throw new Error(`unknown argument: ${argument}`);
  }
  return process.env.WORKSPACE_CONFIG_DIR?.trim() || "";
}

const workspace = workspaceArgument(process.argv.slice(2));
if (!workspace || !path.isAbsolute(workspace)) {
  throw new Error("WORKSPACE_CONFIG_DIR or --workspace must be an absolute path");
}
process.env.WORKSPACE_CONFIG_DIR = path.resolve(workspace);

const config = getTenantConfig();
process.stdout.write(
  `Tenant runtime config is valid: companies=${config.companies.length}; workforce=${config.agentWorkforce.workforce.length}\n`,
);
