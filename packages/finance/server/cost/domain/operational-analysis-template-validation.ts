import type { OperationalAnalysisDefinition } from "@workspace/finance/types";

import type { OperationalAnalysisTemplateInput } from "../operational-analysis-template-schema";

export type OperationalAnalysisTemplateValidationResult<TInput extends OperationalAnalysisTemplateInput = OperationalAnalysisTemplateInput> =
  | { ok: true; data: TInput & { description: string | null; code: string } }
  | { ok: false; error: string };

export function validateOperationalAnalysisTemplate<TInput extends OperationalAnalysisTemplateInput>(
  input: TInput,
  validateSourcePath: (path: string) => string | null,
): OperationalAnalysisTemplateValidationResult<TInput> {
  if (input.scopeType === "project" && input.definition.dataset === "sales.shipments") {
    return { ok: false, error: "项目尚未建立销售归集关系，不能创建项目销售模板" };
  }
  if (!containsBusinessOutput(input.definition)) {
    return { ok: false, error: "模板至少需要一个指标、图表或表格区块" };
  }
  if (input.definition.dataset === "workspace.api") {
    for (const source of input.definition.sources) {
      const error = validateSourcePath(source.path);
      if (error) return { ok: false, error: `数据源 ${source.key}：${error}` };
    }
  }
  return {
    ok: true,
    data: {
      ...input,
      description: input.description?.trim() || null,
      code: `${JSON.stringify(input.definition, null, 2)}\n`,
    },
  };
}

function containsBusinessOutput(definition: OperationalAnalysisDefinition) {
  return definition.blocks.some((block) => block.kind !== "note");
}
