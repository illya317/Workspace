import path from "node:path";
import { runCommand } from "./command";

export function checkAuth() {
  const checks: Array<[string, string, string[]]> = [
    ["Authorize/API gate", "node", ["scripts/check/check-authorize-usage.js"]],
    ["Notification registry", "node", ["scripts/check/check-notification-registry.js"]],
  ];

  for (const [label, command, args] of checks) {
    if (!runCommand(label, command, args)) return false;
  }

  return true;
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  process.exit(checkAuth() ? 0 : 1);
}
