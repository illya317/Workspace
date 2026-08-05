import { createCombinationSolver, type CombinationSolverAdapter } from "@workspace/platform/server/combination-solver";
import { prisma } from "@workspace/platform/server/prisma";
import type { AmountOriginQuery, AmountOriginResult } from "@workspace/finance/types/statement-explanation";

import type { AmountExplanationDb } from "./db";
import {
  DEFAULT_AMOUNT_EXPLANATION_BUDGETS,
  orchestrateAmountOrigin,
  type AmountExplanationBudgetConfig,
} from "./orchestrator";
import type { AmountEvidenceProvider } from "./providers/index";

/** 编排器合同版本：输出指纹包含该版本，行为变化必须升版本。 */
export const AMOUNT_EXPLANATION_ORCHESTRATOR_VERSION = "finance-amount-explanation-orchestrator-v1";

export interface ExplainAmountOriginInput {
  query: AmountOriginQuery;
  /** factory 注入；单测换 fake adapter，默认 bounded reference adapter。 */
  solver?: CombinationSolverAdapter;
  /** 注入数据库句柄；默认平台 prisma 单例（只读使用）。 */
  db?: AmountExplanationDb;
  /** 测试可注入 fake providers；默认注册表见 providers/index。 */
  providers?: readonly AmountEvidenceProvider[];
  /** 测试/诊断可收紧预算；默认见 DEFAULT_AMOUNT_EXPLANATION_BUDGETS。 */
  budgets?: Partial<AmountExplanationBudgetConfig>;
}

/**
 * 只读服务入口（Package 3 交付物）：金额来源调查。
 * 不做任何持久化；不返回 raw Prisma 对象；恒为 accountingTreatment: "not_evaluated"。
 */
export async function explainAmountOrigin(input: ExplainAmountOriginInput): Promise<AmountOriginResult> {
  return orchestrateAmountOrigin({
    query: input.query,
    db: input.db ?? prisma,
    solver: input.solver ?? createCombinationSolver(),
    providers: input.providers,
    budgets: input.budgets,
    orchestratorVersion: AMOUNT_EXPLANATION_ORCHESTRATOR_VERSION,
  });
}

export { DEFAULT_AMOUNT_EXPLANATION_BUDGETS };
