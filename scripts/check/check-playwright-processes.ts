import { execFileSync } from "node:child_process";

if (process.platform === "win32") {
  console.log("✓ Playwright process check skipped on Windows.");
  process.exit(0);
}

let processTable: string;
try {
  processTable = execFileSync("ps", ["-axo", "pid=,command="], { encoding: "utf8" });
} catch (error) {
  if ((error as NodeJS.ErrnoException).code === "EPERM") {
    console.warn("⚠ Playwright process check skipped: this sandbox denies process-table access (ps EPERM).");
    console.warn("  Source lifecycle enforcement still ran; local and CI environments with process access remain strict.");
    process.exit(0);
  }
  console.error("Unable to inspect the process table for leaked Playwright browsers.");
  console.error(error);
  process.exitCode = 1;
  process.exit();
}

const leakedProcesses = processTable
  .split(/\r?\n/)
  .filter((line) => /--headless/.test(line) && /playwright_(?:chromium|firefox|webkit)dev_profile/i.test(line));

if (leakedProcesses.length > 0) {
  console.error("Playwright process check failed: headless browser processes remain.");
  for (const processLine of leakedProcesses) console.error(`- ${processLine.trim().slice(0, 280)}`);
  console.error("Close the Browser in finally, then rerun this check.");
  process.exitCode = 1;
} else {
  console.log("✓ No leaked Playwright headless browser processes.");
}
