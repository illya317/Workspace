import { checkAppRouteHierarchy } from "./app-route-hierarchy";
import { checkAuth } from "./auth";
import { checkDeps } from "./deps";
import { checkDomainValidation } from "./domain-validation";
import { checkModules } from "./modules";
import { checkOpenApi } from "./open-api";
import { scan } from "./scan";
import { checkSplitPriority } from "./split-priority";

type GateCheck = [name: string, run: () => boolean | Promise<boolean>];

export const domainGateChecks: GateCheck[] = [
  ["scan", scan],
  ["deps", checkDeps],
  ["modules", checkModules],
  ["open-api", checkOpenApi],
  ["app-route-hierarchy", checkAppRouteHierarchy],
  ["split-priority", checkSplitPriority],
  ["domain-validation", checkDomainValidation],
  ["auth", checkAuth],
];

export async function domainGate() {
  for (const [name, run] of domainGateChecks) {
    const ok = await run();
    if (!ok) {
      console.error("❌ DOMAIN GATE FAILED:", name);
      return false;
    }
  }

  console.log("✅ DOMAIN GATE PASSED");
  return true;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/"))) {
  domainGate().then((ok) => process.exit(ok ? 0 : 1));
}
