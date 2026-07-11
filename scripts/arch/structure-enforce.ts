import fs from "node:fs";
import path from "node:path";

import {
  collectStructureRatchetChecks,
  type StructureBaseline,
  type StructureDetectorScope,
} from "./structure-detectors";
import { createStructureReport } from "./structure";

const ROOT = path.resolve(__dirname, "../..");
const BASELINE_PATH = path.join(ROOT, "scripts/arch/structure-baseline.json");

function readBaseline(): StructureBaseline {
  return JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8")) as StructureBaseline;
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
    console.error(`✗ Structure baseline ratchet failed: new ${name} item(s) detected.`);
    for (const item of additions) console.error(`  + ${item}`);
    return false;
  }

  if (stale.length > 0) {
    console.error(`✗ Structure baseline ratchet failed: stale ${name} baseline item(s).`);
    console.error("  Remove migrated items from scripts/arch/structure-baseline.json.");
    for (const item of stale) console.error(`  - ${item}`);
    return false;
  }

  return true;
}

function parseScope(argv: string[]): StructureDetectorScope {
  const scopeArg = argv.find((arg) => arg.startsWith("--scope="));
  if (!scopeArg) return "all";
  const scope = scopeArg.slice("--scope=".length);
  if (
    scope === "all" ||
    scope === "domain-blocker" ||
    scope === "ui-blocker" ||
    scope === "hygiene"
  ) {
    return scope;
  }
  throw new Error(`Unknown structure ratchet scope: ${scope}`);
}

export function checkStructureRatchet(scope: StructureDetectorScope = "all") {
  try {
    const baseline = readBaseline();
    const report = createStructureReport();

    for (const { name, current } of collectStructureRatchetChecks(report, scope)) {
      if (!checkRatchet(name, current, baseline[name] ?? [])) return false;
    }

    console.log(`✓ Structure ${scope} baseline ratchet passed.`);
    return true;
  } catch (error) {
    console.error(`✗ Structure ${scope} baseline ratchet failed.`);
    console.error(error instanceof Error ? `  ${error.message}` : error);
    return false;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  const scope = parseScope(process.argv.slice(2));
  process.exit(checkStructureRatchet(scope) ? 0 : 1);
}
