import { checkAppRouteHierarchy } from "./app-route-hierarchy";
import { checkAuth } from "./auth";
import { checkDeps } from "./deps";
import { checkDomainValidation } from "./domain-validation";
import { checkFinanceWorkbookFormulaGate } from "./finance-workbook-formula-gate";
import { checkModules } from "./modules";
import { checkOpenApi } from "./open-api";
import { scan } from "./scan";
import { checkSplitPriority } from "./split-priority";

export type DomainGateCheck = [name: string, run: () => boolean | Promise<boolean>];

export const domainGateChecks: DomainGateCheck[] = [
  ["scan", scan],
  ["deps", checkDeps],
  ["modules", checkModules],
  ["open-api", checkOpenApi],
  ["app-route-hierarchy", checkAppRouteHierarchy],
  ["split-priority", checkSplitPriority],
  ["domain-validation", checkDomainValidation],
  ["finance-workbook-formulas", checkFinanceWorkbookFormulaGate],
  ["auth", checkAuth],
];

export async function domainGate(checks: DomainGateCheck[] = domainGateChecks) {
  const failed: string[] = [];
  for (const [name, run] of checks) {
    let ok = false;
    try {
      ok = await run();
    } catch (error) {
      console.error(`Domain gate ${name} threw:`, error instanceof Error ? error.message : error);
    }
    if (!ok) {
      console.error("❌ DOMAIN GATE FAILED:", name);
      failed.push(name);
    }
  }

  if (failed.length > 0) {
    console.error(`❌ DOMAIN GATE COMPLETE: ${failed.length} failure(s): ${failed.join(", ")}`);
    return false;
  }
  console.log("✅ DOMAIN GATE PASSED");
  return true;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/"))) {
  domainGate().then((ok) => process.exit(ok ? 0 : 1));
}
