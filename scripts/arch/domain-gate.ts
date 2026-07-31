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

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/"))) {
  domainGate().then((ok) => process.exit(ok ? 0 : 1));
}
