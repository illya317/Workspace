import path from "node:path";
import { runCommand } from "./command";

export function checkAuth() {
  return runCommand("Authorize/API gate", "node", ["scripts/check/check-authorize-usage.js"]);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  process.exit(checkAuth() ? 0 : 1);
}
