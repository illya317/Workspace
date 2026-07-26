#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

import { listDeploymentProfiles, resolveDeploymentProfile } from "./deployment-profile";

function argument(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

try {
  if (process.argv.includes("--list")) {
    process.stdout.write(`${JSON.stringify(listDeploymentProfiles(), null, 2)}\n`);
  } else {
    const profileId = argument("--profile");
    if (!profileId) throw new Error("--profile is required (or use --list)");
    const profile = resolveDeploymentProfile(profileId);
    const serialized = `${JSON.stringify(profile, null, 2)}\n`;
    const output = argument("--output");
    if (output) {
      if (path.isAbsolute(output) || output.split(/[\\/]/).includes("..")) throw new Error("--output must be repository-relative");
      fs.mkdirSync(path.dirname(output), { recursive: true });
      fs.writeFileSync(output, serialized, { mode: 0o600 });
    } else {
      process.stdout.write(serialized);
    }
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
