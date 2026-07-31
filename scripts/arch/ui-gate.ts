import { checkCoreUiGuard } from "./core-ui-guard";
import { checkCoreUiRegistry } from "./core-ui-registry";
import { checkCreateSurfaceEntries } from "./create-surface-entry";
import { checkBodyCommandRenderer } from "./body-command-renderer";
import { checkFeedbackApi } from "./feedback-api";
import { checkFieldLayoutDebt } from "./field-layout";
import { checkFormSurfaceActions } from "./form-surface-actions";
import { checkInputSurfaceAdoption } from "./input-surface-adoption";
import { checkPageSurfaceDirectoryRenderer } from "./page-surface-directory";
import { checkPageSurfaceAdoption } from "./surface-page-adoption";
import { checkSurfaceRawContentWarnings } from "./surface-raw-content";
import { checkSurfaceDeclareBoundaries } from "./surface-boundaries";
import { checkUiHelperPurityWarnings } from "./ui-helper-purity";
import { checkActionRuntimeUi } from "./action-runtime-ui";

export type UiGateCheck = [name: string, run: () => boolean | Promise<boolean>];

export const uiGateChecks: UiGateCheck[] = [
  ["create-surface-entry", checkCreateSurfaceEntries],
  ["field-layout-debt", checkFieldLayoutDebt],
  ["form-surface-actions", checkFormSurfaceActions],
  ["feedback-api", checkFeedbackApi],
  ["input-surface-adoption", checkInputSurfaceAdoption],
  ["page-surface-directory", checkPageSurfaceDirectoryRenderer],
  ["page-surface-adoption", checkPageSurfaceAdoption],
  ["surface-raw-content", checkSurfaceRawContentWarnings],
  ["surface-declare-boundaries", checkSurfaceDeclareBoundaries],
  ["ui-helper-purity", checkUiHelperPurityWarnings],
  ["body-command-renderer", checkBodyCommandRenderer],
  ["action-runtime-ui", checkActionRuntimeUi],
  ["core-ui-guard", checkCoreUiGuard],
  ["core-ui-registry", checkCoreUiRegistry],
];

export async function uiGate(checks: UiGateCheck[] = uiGateChecks) {
  const failed: string[] = [];
  for (const [name, run] of checks) {
    let ok = false;
    try {
      ok = await run();
    } catch (error) {
      console.error(`UI gate ${name} threw:`, error instanceof Error ? error.message : error);
    }
    if (!ok) {
      console.error("❌ UI GATE FAILED:", name);
      failed.push(name);
    }
  }

  if (failed.length > 0) {
    console.error(`❌ UI GATE COMPLETE: ${failed.length} failure(s): ${failed.join(", ")}`);
    return false;
  }
  console.log("✅ UI GATE PASSED");
  return true;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/"))) {
  uiGate().then((ok) => process.exit(ok ? 0 : 1));
}
