import fs from "node:fs";
import path from "node:path";

import {
  createDomainValidationReport,
  createDomainValidationWarnings,
  type Violation,
  type ViolationKind,
} from "./domain-validation-engine";

const ROOT = path.resolve(__dirname, "../..");
const BASELINE_PATH = path.join(ROOT, "scripts/arch/domain-validation-baseline.json");
const VIOLATION_KINDS: ViolationKind[] = [
  "missingDomainValidatorImport",
  "serviceUsesLowLevelRule",
  "routeImportsDomainValidator",
  "serverRootReexportsDomainValidator",
];

type DomainValidationBaseline = Record<ViolationKind, string[]>;

function emptyBaseline(): DomainValidationBaseline {
  return {
    missingDomainValidatorImport: [],
    serviceUsesLowLevelRule: [],
    routeImportsDomainValidator: [],
    serverRootReexportsDomainValidator: [],
  };
}

function readBaseline(): DomainValidationBaseline {
  if (!fs.existsSync(BASELINE_PATH)) return emptyBaseline();
  const parsed = JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8")) as Partial<DomainValidationBaseline>;
  return {
    missingDomainValidatorImport: parsed.missingDomainValidatorImport ?? [],
    serviceUsesLowLevelRule: parsed.serviceUsesLowLevelRule ?? [],
    routeImportsDomainValidator: parsed.routeImportsDomainValidator ?? [],
    serverRootReexportsDomainValidator: parsed.serverRootReexportsDomainValidator ?? [],
  };
}

function uniqueSorted(items: string[]) {
  return [...new Set(items)].sort();
}

function diff(left: string[], right: string[]) {
  const rightSet = new Set(right);
  return left.filter((item) => !rightSet.has(item));
}

function violationsByKind(violations: Violation[]): DomainValidationBaseline {
  const grouped = emptyBaseline();
  for (const violation of violations) grouped[violation.kind].push(violation.key);
  return {
    missingDomainValidatorImport: uniqueSorted(grouped.missingDomainValidatorImport),
    serviceUsesLowLevelRule: uniqueSorted(grouped.serviceUsesLowLevelRule),
    routeImportsDomainValidator: uniqueSorted(grouped.routeImportsDomainValidator),
    serverRootReexportsDomainValidator: uniqueSorted(grouped.serverRootReexportsDomainValidator),
  };
}

function printViolation(violation: Violation, prefix: string) {
  console.error(`  ${prefix} ${violation.key}`);
  console.error(`    file: ${violation.file}`);
  console.error(`    fix: ${violation.recommendation}`);
}

function printWarnings() {
  const warnings = createDomainValidationWarnings();
  if (warnings.length === 0) return;
  const shown = warnings.slice(0, 10);
  console.warn(`⚠ domain validation command-route warnings (${warnings.length}; showing ${shown.length}).`);
  for (const warning of shown) {
    console.warn(`  - ${warning.key}`);
    console.warn(`    file: ${warning.file}`);
    console.warn(`    hint: ${warning.recommendation}`);
  }
}

function checkRatchet(kind: ViolationKind, current: Violation[], baseline: string[]) {
  const currentKeys = uniqueSorted(current.map((violation) => violation.key));
  const baselineKeys = uniqueSorted(baseline);
  const additions = diff(currentKeys, baselineKeys);
  const stale = diff(baselineKeys, currentKeys);

  if (additions.length > 0) {
    console.error(`✗ Domain validation ratchet failed: new ${kind} violation(s).`);
    for (const key of additions) {
      const violation = current.find((item) => item.key === key);
      if (violation) printViolation(violation, "+");
      else console.error(`  + ${key}`);
    }
    return false;
  }

  if (stale.length > 0) {
    console.error(`✗ Domain validation ratchet failed: stale ${kind} baseline item(s).`);
    console.error("  Remove migrated items from scripts/arch/domain-validation-baseline.json.");
    for (const key of stale) console.error(`  - ${key}`);
    return false;
  }

  return true;
}

export function checkDomainValidation() {
  try {
    const baseline = readBaseline();
    const current = createDomainValidationReport();
    const grouped = violationsByKind(current);
    const byKind = new Map<ViolationKind, Violation[]>();
    for (const violation of current) {
      byKind.set(violation.kind, [...(byKind.get(violation.kind) ?? []), violation]);
    }

    for (const kind of VIOLATION_KINDS) {
      if (!checkRatchet(kind, byKind.get(kind) ?? [], baseline[kind])) return false;
    }

    const total = Object.values(grouped).reduce((sum, items) => sum + items.length, 0);
    printWarnings();
    console.log(`✓ domain validation boundaries passed (${total} baseline item${total === 1 ? "" : "s"}).`);
    return true;
  } catch (error) {
    console.error("✗ domain validation boundary check failed.");
    console.error(error instanceof Error ? `  ${error.message}` : error);
    return false;
  }
}

if (process.argv.includes("--print-baseline")) {
  process.stdout.write(`${JSON.stringify(violationsByKind(createDomainValidationReport()), null, 2)}\n`);
  process.exit(0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  process.exit(checkDomainValidation() ? 0 : 1);
}
