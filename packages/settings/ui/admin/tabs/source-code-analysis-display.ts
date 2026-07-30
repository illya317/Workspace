import type {
  SourceCodeAnalysisRole,
  SourceCodeAnalysisRoleCounts,
} from "@workspace/platform/source-code-analysis-contract";

export interface SourceCodeAnalysisDisplayGroup {
  key: SourceCodeAnalysisDisplayGroupKey;
  label: string;
  roles: readonly SourceCodeAnalysisRole[];
}

export type SourceCodeAnalysisDisplayGroupKey = "entry" | "business" | "adapter" | "contract" | "assurance";

export const SOURCE_CODE_ANALYSIS_DISPLAY_GROUPS: readonly SourceCodeAnalysisDisplayGroup[] = [
  { key: "entry", label: "入口", roles: ["composition", "ui", "input"] },
  { key: "business", label: "业务", roles: ["domain", "domainValidation"] },
  { key: "adapter", label: "适配", roles: ["persistence", "integration"] },
  { key: "contract", label: "契约", roles: ["contract"] },
  { key: "assurance", label: "保障", roles: ["test", "tooling"] },
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
