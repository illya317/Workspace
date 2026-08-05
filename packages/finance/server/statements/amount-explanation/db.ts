import type { PrismaClient } from "@workspace/platform/server/prisma";

/**
 * 解释引擎注入的数据库句柄：只读方法的最小结构子集（persistence 接缝）。
 * 生产传入 @workspace/platform/server/prisma 的单例；测试传入 fake。
 * comparison package/mapping 只被 workbookCell provider 只读访问（Package 5）。
 */
export type AmountExplanationDb = Pick<
  PrismaClient,
  | "$queryRaw"
  | "company"
  | "financePeriod"
  | "financeConsolidationBatch"
  | "financeConsolidationOutputSnapshot"
  | "financeConsolidationMatchSource"
  | "reclassResult"
  | "financeStatementComparisonPackage"
  | "financeStatementComparisonMapping"
>;

/** 注入句柄必须覆盖的只读 delegate 键（与 AmountExplanationDb 一一对应，fake 构造时按此核对）。 */
export const AMOUNT_EXPLANATION_DB_DELEGATES = [
  "$queryRaw",
  "company",
  "financePeriod",
  "financeConsolidationBatch",
  "financeConsolidationOutputSnapshot",
  "financeConsolidationMatchSource",
  "reclassResult",
  "financeStatementComparisonPackage",
  "financeStatementComparisonMapping",
] as const;
