import type { DataSurfaceCellState } from "@workspace/core/ui";
import type {
  SourceCodeAnalysisDependencyEdge,
  SourceCodeAnalysisDependencyFileCycle,
  SourceCodeAnalysisRole,
  SourceCodeAnalysisRoleCounts,
} from "@workspace/platform/source-code-analysis-contract";
import {
  SOURCE_CODE_ANALYSIS_DISPLAY_GROUPS,
  displayGroupLines,
  type SourceCodeAnalysisDisplayGroup,
  type SourceCodeAnalysisDisplayGroupKey,
} from "./source-code-analysis-display";

export interface SourceCodeAnalysisCellKey {
  moduleKey: string;
  groupKey: SourceCodeAnalysisDisplayGroupKey;
  role: SourceCodeAnalysisRole | null;
}

export interface SourceCodeAnalysisRelationSelection {
  selectedCell: SourceCodeAnalysisCellKey | null;
  onSelectCell: (cell: SourceCodeAnalysisCellKey) => void;
  onHoverCell?: (cell: SourceCodeAnalysisCellKey | null) => void;
}

interface SourceCodeAnalysisRelationRow {
  key: string;
  rowKind: "module" | "section" | "total";
  roles: SourceCodeAnalysisRoleCounts;
}

function sameAnalysisCell(left: SourceCodeAnalysisCellKey, right: SourceCodeAnalysisCellKey) {
  return left.moduleKey === right.moduleKey && left.groupKey === right.groupKey && left.role === right.role;
}

export function sourceCodeAnalysisSelectionAfterClick(
  current: SourceCodeAnalysisCellKey | null,
  next: SourceCodeAnalysisCellKey,
) {
  return current && sameAnalysisCell(current, next) ? null : next;
}

function sameAnalysisScope(left: SourceCodeAnalysisCellKey, right: SourceCodeAnalysisCellKey) {
  return left.moduleKey === right.moduleKey
    && left.groupKey === right.groupKey
    && (left.role === null || right.role === null || left.role === right.role);
}

function cellRoles(cell: SourceCodeAnalysisCellKey, group: SourceCodeAnalysisDisplayGroup) {
  return cell.role ? [cell.role] : group.roles;
}

function edgeStartsInCell(
  edge: SourceCodeAnalysisDependencyEdge,
  cell: SourceCodeAnalysisCellKey,
  group: SourceCodeAnalysisDisplayGroup,
) {
  return edge.sourceModuleKey === cell.moduleKey && cellRoles(cell, group).includes(edge.sourceRole);
}

function edgeEndsInCell(
  edge: SourceCodeAnalysisDependencyEdge,
  cell: SourceCodeAnalysisCellKey,
  group: SourceCodeAnalysisDisplayGroup,
) {
  return edge.targetModuleKey === cell.moduleKey && cellRoles(cell, group).includes(edge.targetRole);
}

function cycleContainsCell(
  cycle: SourceCodeAnalysisDependencyFileCycle,
  cell: SourceCodeAnalysisCellKey,
  group: SourceCodeAnalysisDisplayGroup,
) {
  return cycle.cells.some((candidate) =>
    candidate.moduleKey === cell.moduleKey && cellRoles(cell, group).includes(candidate.role));
}

export function sourceCodeAnalysisRelationCellState(
  row: SourceCodeAnalysisRelationRow,
  group: SourceCodeAnalysisDisplayGroup,
  role: SourceCodeAnalysisRole | null,
  dependencyEdges: readonly SourceCodeAnalysisDependencyEdge[],
  dependencyFileCycles: readonly SourceCodeAnalysisDependencyFileCycle[],
  selectedCell: SourceCodeAnalysisCellKey | null,
): DataSurfaceCellState {
  if (row.rowKind !== "module" || displayGroupLines(row.roles, group) === 0) return "normal";
  if (!selectedCell) return "normal";

  const currentCell = { moduleKey: row.key, groupKey: group.key, role };
  if (sameAnalysisScope(currentCell, selectedCell)) return "normal";
  const selectedGroup = SOURCE_CODE_ANALYSIS_DISPLAY_GROUPS.find((candidate) => candidate.key === selectedCell.groupKey);
  if (!selectedGroup) return "normal";
  const cyclic = dependencyFileCycles.some((cycle) =>
    cycleContainsCell(cycle, selectedCell, selectedGroup) && cycleContainsCell(cycle, currentCell, group));
  if (cyclic) return "success";
  const outgoing = dependencyEdges.some((edge) =>
    edgeStartsInCell(edge, selectedCell, selectedGroup) && edgeEndsInCell(edge, currentCell, group));
  const incoming = dependencyEdges.some((edge) =>
    edgeStartsInCell(edge, currentCell, group) && edgeEndsInCell(edge, selectedCell, selectedGroup));
  if (outgoing && incoming) return "warning";
  if (outgoing) return "warning";
  if (incoming) return "info";
  return "muted";
}

export function sourceCodeAnalysisCellSelected(
  row: SourceCodeAnalysisRelationRow,
  group: SourceCodeAnalysisDisplayGroup,
  role: SourceCodeAnalysisRole | null,
  selectedCell: SourceCodeAnalysisCellKey | null,
) {
  if (!selectedCell) return false;
  return row.rowKind === "module"
    && displayGroupLines(row.roles, group) > 0
    && sameAnalysisCell({ moduleKey: row.key, groupKey: group.key, role }, selectedCell);
}
