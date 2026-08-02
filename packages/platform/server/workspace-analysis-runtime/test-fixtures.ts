import type { WorkspaceSourcesOperationalAnalysisDefinition } from "../../workspace-analysis-source-contract";

export function twoSourceCountDefinition(
  firstSourceKey: string,
  secondSourceKey: string,
): WorkspaceSourcesOperationalAnalysisDefinition {
  return {
    schemaVersion: 3,
    dataset: "workspace.sources",
    sources: [
      { key: "first", sourceKey: firstSourceKey, sourceVersion: 1 },
      { key: "second", sourceKey: secondSourceKey, sourceVersion: 1 },
    ],
    filters: [],
    blocks: [
      { key: "firstCount", kind: "metrics", source: "first", metrics: [{ key: "count", label: "数量", operation: "count" }] },
      { key: "secondCount", kind: "metrics", source: "second", metrics: [{ key: "count", label: "数量", operation: "count" }] },
    ],
  };
}

export function countChartBlock(key: string, sourceAlias: string, limit: number) {
  return {
    key,
    kind: "chart" as const,
    source: sourceAlias,
    title: key,
    dimension: { field: "productName" },
    metrics: [{ key: "count", label: "数量", operation: "count" as const }],
    comparison: "none" as const,
    limit,
  };
}
