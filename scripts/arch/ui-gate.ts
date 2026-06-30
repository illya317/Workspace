import { checkCoreUiGuard } from "./core-ui-guard";
import { checkCoreUiRegistry } from "./core-ui-registry";
import { checkBodyCommandRenderer } from "./body-command-renderer";
import { checkFeedbackApi } from "./feedback-api";
import { checkFieldLayoutDebt } from "./field-layout";
import { checkInputSurfaceAdoption } from "./input-surface-adoption";
import { checkPageSurfaceDirectoryRenderer } from "./page-surface-directory";
import { checkPageSurfaceAdoption } from "./surface-page-adoption";
import { checkSurfaceRawContentWarnings } from "./surface-raw-content";

type GateCheck = [name: string, run: () => boolean | Promise<boolean>];

export const uiGateChecks: GateCheck[] = [
  ["field-layout-debt", checkFieldLayoutDebt],
  ["feedback-api", checkFeedbackApi],
  ["input-surface-adoption", checkInputSurfaceAdoption],
  ["page-surface-directory", checkPageSurfaceDirectoryRenderer],
  ["page-surface-adoption", checkPageSurfaceAdoption],
  ["surface-raw-content", checkSurfaceRawContentWarnings],
  ["body-command-renderer", checkBodyCommandRenderer],
  ["core-ui-guard", checkCoreUiGuard],
  ["core-ui-registry", checkCoreUiRegistry],
];

export async function uiGate() {
  for (const [name, run] of uiGateChecks) {
    const ok = await run();
    if (!ok) {
      console.error("❌ UI GATE FAILED:", name);
      return false;
    }
  }

  console.log("✅ UI GATE PASSED");
  return true;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/"))) {
  uiGate().then((ok) => process.exit(ok ? 0 : 1));
}
