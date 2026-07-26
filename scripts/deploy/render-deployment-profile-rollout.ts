#!/usr/bin/env node

import { resolveDeploymentProfileRollout } from "./deployment-profile-rollout";

function argument(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

try {
  const profileId = argument("--profile");
  if (!profileId) throw new Error("--profile is required");
  const serialized = process.env.WORKSPACE_CHANGED_FILES_JSON;
  if (!serialized) throw new Error("WORKSPACE_CHANGED_FILES_JSON is required");
  const changedFiles = JSON.parse(serialized) as unknown;
  if (!Array.isArray(changedFiles) || changedFiles.some((file) => typeof file !== "string")) {
    throw new Error("WORKSPACE_CHANGED_FILES_JSON must be a JSON string array");
  }
  process.stdout.write(`${JSON.stringify(resolveDeploymentProfileRollout(profileId, changedFiles), null, 2)}\n`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
