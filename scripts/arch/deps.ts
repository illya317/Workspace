import path from "node:path";
import { runCommand } from "./command";

export function checkDeps() {
  return runCommand("Dependency DAG", "npx", [
    "depcruise",
    "--config",
    "dependency-cruiser.config.cjs",
    "packages",
  ]);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  process.exit(checkDeps() ? 0 : 1);
}
