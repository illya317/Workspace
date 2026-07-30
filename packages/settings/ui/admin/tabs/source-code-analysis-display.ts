import type {
  SourceCodeAnalysisRole,
  SourceCodeAnalysisRoleCounts,
} from "@workspace/platform/source-code-analysis-contract";

export interface SourceCodeAnalysisDisplayGroup {
  key: SourceCodeAnalysisDisplayGroupKey;
  label: string;
  roles: readonly SourceCodeAnalysisRole[];
}

export type SourceCodeAnalysisDisplayGroupKey = "ui" | "boundary" | "domain" | "persistence" | "other";

export const SOURCE_CODE_ANALYSIS_DISPLAY_GROUPS: readonly SourceCodeAnalysisDisplayGroup[] = [
  { key: "ui", label: "UI", roles: ["ui"] },
  { key: "boundary", label: "边界", roles: ["input", "domainValidation", "contract"] },
  { key: "domain", label: "业务", roles: ["domain"] },
  { key: "persistence", label: "数据访问", roles: ["persistence"] },
  { key: "other", label: "其他", roles: ["integration", "composition", "test", "tooling"] },
];

export function displayGroupLines(
  roles: SourceCodeAnalysisRoleCounts,
  group: SourceCodeAnalysisDisplayGroup,
) {
  return group.roles.reduce((sum, role) => sum + roles[role], 0);
}

export function displayGroupKeyForRole(role: SourceCodeAnalysisRole): SourceCodeAnalysisDisplayGroupKey {
  const group = SOURCE_CODE_ANALYSIS_DISPLAY_GROUPS.find((candidate) => candidate.roles.includes(role));
  if (!group) throw new Error(`Unknown source code analysis role: ${role}`);
  return group.key;
}
