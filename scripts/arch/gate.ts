import { checkAuth } from "./auth";
import { checkAppRouteHierarchy } from "./app-route-hierarchy";
import { checkCoreUiGuard } from "./core-ui-guard";
import { checkCoreUiRegistry } from "./core-ui-registry";
import { checkDeps } from "./deps";
import { checkDomainValidation } from "./domain-validation";
import { checkFieldLayoutDebt } from "./field-layout";
import { checkFeedbackApi } from "./feedback-api";
import { checkInputControlAdoption } from "./input-control-adoption";
import { checkModules } from "./modules";
import { checkOpenApi } from "./open-api";
import { scan } from "./scan";
import { checkSplitPriority } from "./split-priority";

type GateCheck = [name: string, run: () => boolean | Promise<boolean>];

export async function archGate() {
  const checks: GateCheck[] = [
    ["scan", scan],
    ["field-layout-debt", checkFieldLayoutDebt],
    ["feedback-api", checkFeedbackApi],
    ["input-control-adoption", checkInputControlAdoption],
    ["core-ui-guard", checkCoreUiGuard],
    ["deps", checkDeps],
    ["core-ui-registry", checkCoreUiRegistry],
    ["modules", checkModules],
    ["open-api", checkOpenApi],
    ["app-route-hierarchy", checkAppRouteHierarchy],
    ["split-priority", checkSplitPriority],
    ["domain-validation", checkDomainValidation],
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
