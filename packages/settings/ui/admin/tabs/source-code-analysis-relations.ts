import type { DataSurfaceCellState } from "@workspace/core/ui";
import type {
  SourceCodeAnalysisDependencyEdge,
  SourceCodeAnalysisRoleCounts,
} from "@workspace/platform/source-code-analysis-contract";
import {
  displayGroupKeyForRole,
  displayGroupLines,
  type SourceCodeAnalysisDisplayGroup,
  type SourceCodeAnalysisDisplayGroupKey,
} from "./source-code-analysis-display";

export interface SourceCodeAnalysisCellKey {
  moduleKey: string;
  groupKey: SourceCodeAnalysisDisplayGroupKey;
}

export interface SourceCodeAnalysisRelationSelection {
  selectedCell: SourceCodeAnalysisCellKey | null;
  onSelectCell: (cell: SourceCodeAnalysisCellKey) => void;
}

interface SourceCodeAnalysisRelationRow {
  key: string;
  rowKind: "module" | "section" | "total";
  roles: SourceCodeAnalysisRoleCounts;
}

function sameAnalysisCell(left: SourceCodeAnalysisCellKey, right: SourceCodeAnalysisCellKey) {
  return left.moduleKey === right.moduleKey && left.groupKey === right.groupKey;
}

function edgeSourceCell(edge: SourceCodeAnalysisDependencyEdge): SourceCodeAnalysisCellKey {
  return { moduleKey: edge.sourceModuleKey, groupKey: displayGroupKeyForRole(edge.sourceRole) };
}

function edgeTargetCell(edge: SourceCodeAnalysisDependencyEdge): SourceCodeAnalysisCellKey {
  return { moduleKey: edge.targetModuleKey, groupKey: displayGroupKeyForRole(edge.targetRole) };
}

export function sourceCodeAnalysisRelationCellState(
  row: SourceCodeAnalysisRelationRow,
  group: SourceCodeAnalysisDisplayGroup,
  dependencyEdges: readonly SourceCodeAnalysisDependencyEdge[],
  selectedCell: SourceCodeAnalysisCellKey | null,
): DataSurfaceCellState {
  if (row.rowKind !== "module" || displayGroupLines(row.roles, group) === 0) return "normal";
  if (!selectedCell) return "normal";

  const currentCell = { moduleKey: row.key, groupKey: group.key };
  const outgoing = dependencyEdges.some((edge) =>
    sameAnalysisCell(edgeSourceCell(edge), selectedCell)
    && sameAnalysisCell(edgeTargetCell(edge), currentCell));
  const incoming = dependencyEdges.some((edge) =>
    sameAnalysisCell(edgeSourceCell(edge), currentCell)
    && sameAnalysisCell(edgeTargetCell(edge), selectedCell));
  if (outgoing && incoming) return "success";
  if (outgoing) return "warning";
  if (incoming) return "info";
  if (sameAnalysisCell(currentCell, selectedCell)) return "normal";
  return "muted";
}

export function sourceCodeAnalysisCellSelected(
  row: SourceCodeAnalysisRelationRow,
  group: SourceCodeAnalysisDisplayGroup,
  selectedCell: SourceCodeAnalysisCellKey | null,
) {
  if (!selectedCell) return false;
  return row.rowKind === "module"
    && displayGroupLines(row.roles, group) > 0
    && sameAnalysisCell({ moduleKey: row.key, groupKey: group.key }, selectedCell);
}
