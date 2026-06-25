import path from "node:path";
import { runCommand } from "./command";

export function checkCoreUiGuard() {
  return runCommand("Core UI guard", "node", [
    "scripts/check/check-core-ui-guard.js",
    "--working-tree",
  ]);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  process.exit(checkCoreUiGuard() ? 0 : 1);
}
