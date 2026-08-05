import type { AmountExplanationDb } from "./db";
import { AmountOriginQueryError, monthEndDate, monthStartDate } from "./query";
import type { ExplanationScope, NormalizedQuery, ScopeCompany } from "./types";

export type { ExplanationScope, ScopeCompany, ScopePeriod } from "./types";

const MAX_BATCH_SCOPE = 12;
const MAX_PERIOD_SCOPE = 500;

/**
 * 解析查询范围（计划 §4.4 第 4 步的强制谓词来源）。
 * - consolidated target：公司集合 = 批次 isConsolidated 主体快照；dateTo = 批次期末；
 *   dateFrom 缺省开放（合并抵销语义覆盖全历史凭证），由 amount-window + LIMIT 兜底。
 * - entity target：dateFrom/dateTo 由 periodKind 推导（monthly = 当月；cumulative = 年初至月末），
 *   显式 date 参数优先。
 * - 无 reportContext 的 ad-hoc 查询必须自带 companyIds + dateFrom + dateTo（fail closed）。
 */
export async function resolveScope(
  db: AmountExplanationDb,
  query: NormalizedQuery,
): Promise<ExplanationScope> {
  let queryCount = 0;
  const target = query.reportContext?.target ?? null;

  let companies: ScopeCompany[];
  let batchIds: number[] = [];
  let batchPeriod: { year: number; month: number } | null = null;
  let dateFrom = query.dateFrom;
  let dateTo = query.dateTo;

  if (target?.kind === "consolidated") {
    queryCount += 1;
    const batch = await db.financeConsolidationBatch.findFirst({
      where: { id: target.batchId },
      select: {
        id: true,
        year: true,
        month: true,
        entities: {
          where: { isConsolidated: true },
          select: { companyId: true, companyCode: true, companyName: true },
          orderBy: { id: "asc" },
        },
      },
    });
    if (!batch) throw new AmountOriginQueryError(`consolidation batch not found: ${target.batchId}`);
    const batchPeriodEnd = monthEndDate(batch.year, batch.month);
    if (dateTo && dateTo > batchPeriodEnd) {
      throw new AmountOriginQueryError("dateTo must not exceed the consolidation batch period end");
    }
    dateTo = dateTo ?? batchPeriodEnd;
    companies = batch.entities.map((entity) => ({
      id: entity.companyId,
      code: entity.companyCode,
      name: entity.companyName,
    }));
    batchIds = [batch.id];
    batchPeriod = { year: batch.year, month: batch.month };
  } else {
    const ids = query.companyIds ?? (target?.kind === "entity" ? [target.companyId] : null);
    if (!ids) {
      throw new AmountOriginQueryError("company scope is required (companyIds or a report context)");
    }
    queryCount += 1;
    const rows = await db.company.findMany({
      where: { id: { in: [...ids] } },
      select: { id: true, code: true, description: true },
      orderBy: { id: "asc" },
    });
    if (rows.length !== ids.length) {
      throw new AmountOriginQueryError("some companyIds do not resolve to companies");
    }
    companies = rows.map((row) => ({ id: row.id, code: row.code, name: row.description }));
    if (target?.kind === "entity") {
      dateFrom = dateFrom ?? (target.periodKind === "cumulative"
        ? monthStartDate(target.year, 1)
        : monthStartDate(target.year, target.month));
      dateTo = dateTo ?? monthEndDate(target.year, target.month);
      queryCount += 1;
      const batches = await db.financeConsolidationBatch.findMany({
        where: {
          status: { in: ["locked", "published"] },
          entities: { some: { companyId: { in: [...ids] }, isConsolidated: true } },
          OR: [
            { year: { lt: target.year } },
            { year: target.year, month: { lte: target.month } },
          ],
        },
        select: { id: true, year: true, month: true },
        orderBy: [{ year: "desc" }, { month: "desc" }, { id: "desc" }],
        take: MAX_BATCH_SCOPE,
      });
      batchIds = batches.map((batch) => batch.id);
    } else if (!dateFrom || !dateTo) {
      throw new AmountOriginQueryError("dateFrom and dateTo are required for ad hoc queries");
    }
  }

  if (!dateTo) throw new AmountOriginQueryError("dateTo could not be resolved");
  if (companies.length === 0) throw new AmountOriginQueryError("resolved company scope is empty");

  let outputSnapshotByBatch = new Map<number, number>();
  if (batchIds.length > 0) {
    queryCount += 1;
    const snapshots = await db.financeConsolidationOutputSnapshot.findMany({
      where: { batchId: { in: batchIds } },
      select: { id: true, batchId: true },
    });
    outputSnapshotByBatch = new Map(snapshots.map((snapshot) => [snapshot.batchId, snapshot.id]));
  }

  // reclass 期间范围：合并目标取批次当年 1 月至批次月；其余按 [dateFrom ?? 当年 1 月, dateTo]。
  const toYear = Number(dateTo.slice(0, 4));
  const toMonth = Number(dateTo.slice(5, 7));
  const rangeFrom = batchPeriod
    ? { year: batchPeriod.year, month: 1 }
    : dateFrom
      ? { year: Number(dateFrom.slice(0, 4)), month: Number(dateFrom.slice(5, 7)) }
      : { year: toYear, month: 1 };
  queryCount += 1;
  const periods = await db.financePeriod.findMany({
    where: {
      companyCode: { in: companies.map((company) => company.code) },
      AND: [
        { OR: [{ year: { gt: rangeFrom.year } }, { year: rangeFrom.year, month: { gte: rangeFrom.month } }] },
        { OR: [{ year: { lt: toYear } }, { year: toYear, month: { lte: toMonth } }] },
      ],
    },
    select: { id: true, year: true, month: true, companyCode: true },
    orderBy: [{ year: "asc" }, { month: "asc" }, { id: "asc" }],
    take: MAX_PERIOD_SCOPE,
  });

  return {
    companies,
    companyCodes: companies.map((company) => company.code),
    companyIds: companies.flatMap((company) => company.id === null ? [] : [company.id]),
    dateFrom,
    dateTo,
    batchIds,
    batchPeriod,
    outputSnapshotByBatch,
    periods,
    queryCount,
  };
}
