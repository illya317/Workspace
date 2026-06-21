import { checkAuth } from "./auth";
import { checkAppRouteHierarchy } from "./app-route-hierarchy";
import { checkDeps } from "./deps";
import { checkLevel2Ratchet } from "./level2-enforce";
import { checkModules } from "./modules";
import { scan } from "./scan";

type GateCheck = [name: string, run: () => boolean | Promise<boolean>];

export async function archGate() {
  const checks: GateCheck[] = [
    ["scan", scan],
    ["deps", checkDeps],
    ["modules", checkModules],
    ["app-route-hierarchy", checkAppRouteHierarchy],
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
