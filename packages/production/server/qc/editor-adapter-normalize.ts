import type { QcLayoutBlock, QcTemplateDetail } from "./types";
import type { LegacyQcInput } from "./editor-adapter-types";

export function normalizeLegacyInput(input: LegacyQcInput): QcTemplateDetail {
  if (Array.isArray(input)) {
    return {
      source: { root: "", configRoot: "", available: true },
      id: "layout-blocks",
      fileName: "layout-blocks.json",
      productName: "QC Layout Blocks",
      stages: [{
        key: "default",
        label: "默认",
        precheckItemCount: 0,
        documentCount: 0,
        precheckInfo: {},
        precheckFiles: [],
        precheckItems: [],
        tests: [{
          sequence: "1",
          name: "Layout",
          englishName: "layout",
          methodName: "",
          hasNumericConclusion: false,
          methodGroups: [],
          layoutBlocks: input,
        }],
      }],
      methodFileCount: 0,
      layoutAssignmentCount: input.length,
    };
  }
  if ("stages" in input && input.stages) return input as QcTemplateDetail;
  const blocks = (input as { blocks?: QcLayoutBlock[] }).blocks || [];
  return normalizeLegacyInput(blocks);
}
