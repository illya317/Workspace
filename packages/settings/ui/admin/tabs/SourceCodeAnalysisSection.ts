import type { BodySurfaceSectionSpec } from "@workspace/core/ui";
import type { SourceCodeAnalysisSnapshot } from "@workspace/platform/source-code-analysis-contract";
import {
  parseSourceCodeAnalysisNavigationKey,
} from "./source-code-analysis-capabilities";
import {
  createSourceCodeAnalysisDrilldownSection,
  type SourceCodeAnalysisSectionOptions,
} from "./source-code-analysis-drilldown";
import { createSourceCodeAnalysisRootSection } from "./source-code-analysis-l1";

export {
  capabilityAnalysisTableRows,
  createCapabilityAnalysisColumns,
  parseSourceCodeAnalysisNavigationKey,
  sourceCodeAnalysisCapabilityRowsForParent,
  type SourceCodeAnalysisColumnDisclosure,
} from "./source-code-analysis-capabilities";
export { analysisTableRows, createSourceCodeAnalysisColumns } from "./source-code-analysis-l1";
export type { SourceCodeAnalysisSectionOptions } from "./source-code-analysis-drilldown";

export function createSourceCodeAnalysisSection(
  snapshot: SourceCodeAnalysisSnapshot | null,
  options: SourceCodeAnalysisSectionOptions = {},
): BodySurfaceSectionSpec {
  if (!snapshot) return createSourceCodeAnalysisRootSection(null);
  const selection = parseSourceCodeAnalysisNavigationKey(options.selectedNavigationKey ?? "view:source");
  if (!selection || selection.kind === "root") {
    return createSourceCodeAnalysisRootSection(
      snapshot,
      options.disclosure,
      options.relationSelection,
      options.onNavigate,
    );
  }
  return createSourceCodeAnalysisDrilldownSection(snapshot, selection, options);
}
