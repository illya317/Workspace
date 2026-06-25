import { checkAuth } from "./auth";
import { checkAppRouteHierarchy } from "./app-route-hierarchy";
import { checkCoreUiGuard } from "./core-ui-guard";
import { checkCoreUiRegistry } from "./core-ui-registry";
import { checkDeps } from "./deps";
import { checkDomainValidation } from "./domain-validation";
import { checkLevel2Ratchet } from "./level2-enforce";
import { checkModules } from "./modules";
import { checkOpenApi } from "./open-api";
import { scan } from "./scan";

type GateCheck = [name: string, run: () => boolean | Promise<boolean>];

export async function archGate() {
  const checks: GateCheck[] = [
    ["scan", scan],
    ["core-ui-guard", checkCoreUiGuard],
    ["deps", checkDeps],
    ["core-ui-registry", checkCoreUiRegistry],
    ["modules", checkModules],
    ["open-api", checkOpenApi],
    ["app-route-hierarchy", checkAppRouteHierarchy],
    ["domain-validation", checkDomainValidation],
    ["level2-ratchet", checkLevel2Ratchet],
    ["auth", checkAuth],
  ];

  for (const [name, run] of checks) {
    const ok = await run();
    if (!ok) {
      console.error("❌ ARCH GATE FAILED:", name);
      process.exit(1);
    }
  }

  console.log("✅ ARCH GATE PASSED");
}

void archGate();
