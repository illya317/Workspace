import path from "node:path";
import { runCommand } from "./command";

export function checkModules() {
  const checks: Array<[string, string, string[]]> = [
    ["Module definitions", "node", ["scripts/check/check-module-definitions.js"]],
    ["Module navigation gates", "node", ["scripts/check/check-module-nav-gates.js"]],
    ["Module navigation gate fixtures", "node", ["scripts/check/check-module-nav-gates.js", "--fixtures"]],
    ["Resource registry", "node", ["scripts/check/check-resource-registry.js"]],
    ["FK registry", "node", ["scripts/check/check-fk-registry.js"]],
    ["Module page gates", "node", ["scripts/check/check-module-page-gates.js"]],
    ["Package boundaries", "node", ["scripts/check/check-package-boundaries.js"]],
    ["API route governance", "node", ["scripts/check/check-api-routes.js"]],
    ["Architecture governance docs", "node", ["scripts/check/check-architecture-governance.js"]],
  ];

  for (const [label, command, args] of checks) {
    if (!runCommand(label, command, args)) return false;
  }

  return true;
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  process.exit(checkModules() ? 0 : 1);
}
