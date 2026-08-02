import path from "node:path";
import { runCommand } from "./command";

export function sourceCodeAnalysisCheckArgs(environment = process.env) {
  return environment.RELEASE_SOURCE_SNAPSHOT_RECEIPT_FILE
    ? ["ops/release/candidate/source-snapshot.mjs", "verify"]
    : ["--import", "tsx", "scripts/arch/source-code-analysis/cli.ts", "--check", "--write"];
}

export function checkModules() {
  const checks: Array<[string, string, string[]]> = [
    ["Module definitions", "node", ["scripts/check/check-module-definitions.js"]],
    ["Module navigation gates", "node", ["scripts/check/check-module-nav-gates.js"]],
    ["Module navigation gate fixtures", "node", ["scripts/check/check-module-nav-gates.js", "--fixtures"]],
    ["Resource registry", "node", ["scripts/check/check-resource-registry.js"]],
    ["Relation Catalog registrations", "node", ["scripts/check/check-fk-registry.js"]],
    ["Relation Policy coverage", "node", ["--conditions=react-server", "--import", "tsx", "scripts/check/check-relation-policy-coverage.ts"]],
    ["Module page gates", "node", ["scripts/check/check-module-page-gates.js"]],
    ["Package boundaries", "node", ["scripts/check/check-package-boundaries.js"]],
    ["Source code module declarations", "node", sourceCodeAnalysisCheckArgs()],
    ["API route governance", "node", ["scripts/check/check-api-routes.js"]],
    ["Architecture governance docs", "node", ["scripts/check/check-architecture-governance.js"]],
  ];

  let passed = true;
  for (const [label, command, args] of checks) {
    if (!runCommand(label, command, args)) passed = false;
  }

  return passed;
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  process.exit(checkModules() ? 0 : 1);
}
