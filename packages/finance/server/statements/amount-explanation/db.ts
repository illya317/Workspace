import type { PrismaClient } from "@workspace/platform/server/prisma";

/**
 * 解释引擎注入的数据库句柄：只读方法的最小结构子集。
 * 生产传入 @workspace/platform/server/prisma 的单例；测试传入 fake。
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
>;
