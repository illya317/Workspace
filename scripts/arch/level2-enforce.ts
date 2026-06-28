import fs from "node:fs";
import path from "node:path";

import { collectLevel2RatchetChecks, type Level2Baseline } from "./level2-detectors";
import { createLevel2Report } from "./level2";

const ROOT = path.resolve(__dirname, "../..");
const BASELINE_PATH = path.join(ROOT, "scripts/arch/level2-baseline.json");

function readBaseline(): Level2Baseline {
  return JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8")) as Level2Baseline;
}

function uniqueSorted(items: string[]) {
  return [...new Set(items)].sort();
}

function diff(left: string[], right: string[]) {
  const rightSet = new Set(right);
  return left.filter((item) => !rightSet.has(item));
}

function checkRatchet(name: string, current: string[], baseline: string[]) {
  const normalizedCurrent = uniqueSorted(current);
  const normalizedBaseline = uniqueSorted(baseline);
  const additions = diff(normalizedCurrent, normalizedBaseline);
  const stale = diff(normalizedBaseline, normalizedCurrent);

  if (additions.length > 0) {
    console.error(`✗ Level 2 baseline ratchet failed: new ${name} item(s) detected.`);
    for (const item of additions) console.error(`  + ${item}`);
    return false;
  }

  if (stale.length > 0) {
    console.error(`✗ Level 2 baseline ratchet failed: stale ${name} baseline item(s).`);
    console.error("  Remove migrated items from scripts/arch/level2-baseline.json.");
    for (const item of stale) console.error(`  - ${item}`);
    return false;
  }

  return true;
}

export function checkLevel2Ratchet() {
  try {
    const baseline = readBaseline();
    const report = createLevel2Report();

    for (const { name, current } of collectLevel2RatchetChecks(report)) {
      if (!checkRatchet(name, current, baseline[name] ?? [])) return false;
    }

    console.log("✓ Level 2 baseline ratchet passed.");
    return true;
  } catch (error) {
    console.error("✗ Level 2 baseline ratchet failed.");
    console.error(error instanceof Error ? `  ${error.message}` : error);
    return false;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  process.exit(checkLevel2Ratchet() ? 0 : 1);
}
