import { spawnSync } from "node:child_process";

export function runCommand(label: string, command: string, args: string[]) {
  console.log(`\n▶ ${label}`);
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
    shell: false,
  });

  if (result.error) {
    console.error(`✗ ${label} failed to start: ${result.error.message}`);
    return false;
  }

  if (result.status !== 0) {
    console.error(`✗ ${label} failed with exit code ${result.status ?? "unknown"}`);
    return false;
  }

  return true;
}
