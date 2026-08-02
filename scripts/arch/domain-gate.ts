import { checkAppRouteHierarchy } from "./app-route-hierarchy";
import { checkAuth } from "./auth";
import { checkDeps } from "./deps";
import { checkDomainValidation } from "./domain-validation";
import { checkFinanceWorkbookFormulaGate } from "./finance-workbook-formula-gate";
import { checkModules } from "./modules";
import { checkOpenApi } from "./open-api";
import { scan } from "./scan";
import { checkSplitPriority } from "./split-priority";
import { runAggregateGate, type AggregateGateCheck } from "./aggregate-gate";
import { DOMAIN_GATE_CHECK_NAMES } from "./gate-check-contracts.mjs";

export const domainGateChecks: AggregateGateCheck[] = [
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

export function domainGate(checks: AggregateGateCheck[] = domainGateChecks) {
  return runAggregateGate({ checks, displayName: "Domain", logName: "DOMAIN" });
}

export function selectDomainGateChecks(name?: string) {
  if (!name) return domainGateChecks;
  if (!DOMAIN_GATE_CHECK_NAMES.includes(name)) throw new Error(`unknown Domain detector: ${name}`);
  return domainGateChecks.filter(([candidate]) => candidate === name);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/"))) {
  const checkIndex = process.argv.indexOf("--check");
  const selected = checkIndex < 0 ? undefined : process.argv[checkIndex + 1];
  domainGate(selectDomainGateChecks(selected))
    .then((ok) => process.exit(ok ? 0 : 1))
    .catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exit(2); });
}
