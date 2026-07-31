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
import { runAggregateGate, type AggregateGateCheck } from "./aggregate-gate";

export const uiGateChecks: AggregateGateCheck[] = [
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

export function uiGate(checks: AggregateGateCheck[] = uiGateChecks) {
  return runAggregateGate({ checks, displayName: "UI", logName: "UI" });
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/"))) {
  uiGate().then((ok) => process.exit(ok ? 0 : 1));
}
