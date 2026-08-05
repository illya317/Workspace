import { diagnostics, type AmountEvidenceProvider } from "./types";

/**
 * Workbook 单元格 provider 端口（计划 §4.4 v1 清单第 4 条）。
 * Package 5 接入导入 workbook 证据；本包只保留端口形状与确定性占位行为，
 * 以便 orchestrator 的 provider 注册表和诊断结构不再变化。
 */
export function workbookCellProvider(): AmountEvidenceProvider {
  return {
    sourceKind: "workbookCell",
    async collect() {
      return {
        candidates: [],
        diagnostics: diagnostics("workbookCell", "unavailable", {
          queryCount: 0,
          fetchedCount: 0,
          candidateCount: 0,
          note: "workbook cell evidence lands in Package 5; port reserved",
        }),
      };
    },
  };
}
