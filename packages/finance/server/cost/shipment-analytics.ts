import { prisma } from "@workspace/platform/server/prisma";
import type {
  FinanceShipmentAggregateMetric,
  FinanceShipmentAmountLeader,
  FinanceShipmentAnalyticsResponse,
  FinanceShipmentAnalyticsTotals,
  FinanceShipmentGroupBy,
  FinanceShipmentGroupRow,
  FinanceShipmentMetricKey,
  FinanceShipmentTimeGrain,
  FinanceShipmentTrendPoint,
} from "@workspace/finance/types";
import type { CostQueryParams, ShipmentSortOrder } from "./common";
import { buildShipmentWhere } from "./common";
import { resolveShipmentDepartmentScope } from "./shipment-department-scope";

interface ShipmentAnalyticsParams extends CostQueryParams {
  grain?: FinanceShipmentTimeGrain;
  groupBy?: FinanceShipmentGroupBy;
  comparison?: "none" | "previousYear";
  sortBy?: "date" | FinanceShipmentMetricKey;
  sortOrder?: ShipmentSortOrder;
}

type AggregateInput = {
  quantity: number | null;
  amount: number | null;
  receivedAmount: number | null;
};

type GroupAggregate = AggregateInput & {
  key: string;
  label: string;
  productName: string | null;
  spec: string | null;
};

export async function getShipmentAnalytics(
  params: ShipmentAnalyticsParams,
): Promise<FinanceShipmentAnalyticsResponse> {
  const grain = params.grain ?? "month";
  const groupBy = params.groupBy ?? "productSpec";
  const comparison = params.comparison ?? "previousYear";
  const scopedParams = await resolveShipmentDepartmentScope(params);
  const where = buildShipmentWhere(scopedParams);
  const comparisonParams = comparison === "previousYear" ? previousYearParams(params) : null;
  const comparisonScopedParams = comparisonParams ? await resolveShipmentDepartmentScope(comparisonParams) : null;
  const comparisonWhere = comparisonScopedParams ? buildShipmentWhere(comparisonScopedParams) : null;

  const [
    totalsAggregate,
    rowCount,
    datedRowCount,
    currentGroups,
    trend,
    previousTotalsAggregate,
    previousRowCount,
    previousGroups,
    productGroups,
    salespersonGroups,
    customerGroups,
  ] = await Promise.all([
    prisma.financeShipment.aggregate({ where, _sum: metricSum, _count: { _all: true } }),
    prisma.financeShipment.count({ where }),
    prisma.financeShipment.count({ where: { ...where, date: { not: null } } }),
    aggregateGroups(where, groupBy),
    aggregateTrend(where, grain),
    comparisonWhere ? prisma.financeShipment.aggregate({ where: comparisonWhere, _sum: metricSum }) : null,
    comparisonWhere ? prisma.financeShipment.count({ where: comparisonWhere }) : Promise.resolve(0),
    comparisonWhere ? aggregateGroups(comparisonWhere, groupBy) : Promise.resolve([]),
    aggregateGroups(where, "product"),
    aggregateGroups(where, "salesperson"),
    aggregateGroups(where, "customer"),
  ]);

  const previousByKey = new Map(previousGroups.map((row) => [row.key, toMetric(row)]));
  const sortBy = params.sortBy === "date" ? "amount" : params.sortBy ?? "amount";
  const sortOrder = params.sortOrder ?? "desc";
  const groups = currentGroups
    .map((row): FinanceShipmentGroupRow => ({
      ...row,
      ...toMetric(row),
      previousYear: previousByKey.get(row.key) ?? null,
    }))
    .sort((left, right) => compareMetric(left[sortBy], right[sortBy], sortOrder));

  const monthlyRowCount = Math.max(0, rowCount - datedRowCount);
  return {
    scope: {
      dateFrom: params.dateFrom ?? null,
      dateTo: params.dateTo ?? null,
      grain,
      groupBy,
      comparison,
    },
    totals: toTotals(totalsAggregate._sum, rowCount),
    previousYearTotals: previousTotalsAggregate ? toTotals(previousTotalsAggregate._sum, previousRowCount) : null,
    trend,
    groups: groups.slice(0, 20),
    groupCount: groups.length,
    leaders: {
      product: amountLeader(productGroups),
      salesperson: salespersonAmountLeader(salespersonGroups),
      customer: amountLeader(customerGroups),
    },
    coverage: {
      datedRowCount,
      monthlyRowCount,
      precision: rowCount === 0 ? "none" : datedRowCount === 0 ? "month" : monthlyRowCount === 0 ? "day" : "mixed",
    },
  };
}

export function amountLeader(rows: GroupAggregate[]): FinanceShipmentAmountLeader | null {
  const leader = rows
    .filter((row): row is GroupAggregate & { amount: number } => row.amount !== null)
    .sort((left, right) => right.amount - left.amount || left.label.localeCompare(right.label, "zh-CN"))[0];
  return leader ? { key: leader.key, label: leader.label, amount: leader.amount } : null;
}

export function salespersonAmountLeader(rows: GroupAggregate[]): FinanceShipmentAmountLeader | null {
  return amountLeader(rows.filter((row) => row.key.startsWith("employee:") || row.key.startsWith("__unlinked_employee__:")));
}

const metricSum = { quantity: true, amount: true, receivedAmount: true } as const;

async function aggregateGroups(
  where: ReturnType<typeof buildShipmentWhere>,
  groupBy: FinanceShipmentGroupBy,
): Promise<GroupAggregate[]> {
  if (groupBy === "customer") {
    const rows = await prisma.financeShipment.groupBy({ by: ["customerName"], where, _sum: metricSum });
    return rows.map((row) => ({
      key: row.customerName ?? "__unknown_customer__",
      label: row.customerName ?? "未标注客户",
      productName: null,
      spec: null,
      ...row._sum,
    }));
  }
  if (groupBy === "salesperson") {
    const rows = await prisma.financeShipment.groupBy({
      by: ["salesChannel", "employeeId", "salespersonName"],
      where,
      _sum: metricSum,
    });
    const employeeIds = rows.map((row) => row.employeeId).filter((id): id is number => id !== null);
    const employees = employeeIds.length > 0
      ? await prisma.employee.findMany({ where: { id: { in: employeeIds } }, select: { id: true, name: true } })
      : [];
    const names = new Map(employees.map((employee) => [employee.id, employee.name]));
    return rows.map((row) => {
      if (row.salesChannel === "factory_direct") {
        return { key: "__factory_direct__", label: "厂家直销", productName: null, spec: null, ...row._sum };
      }
      if (row.salesChannel === "employee") {
        return {
          key: row.employeeId === null
            ? `__unlinked_employee__:${row.salespersonName ?? ""}`
            : `employee:${row.employeeId}`,
          label: row.employeeId === null
            ? `${row.salespersonName ?? "未注明姓名"}（待关联员工）`
            : names.get(row.employeeId) ?? row.salespersonName ?? "未知员工",
          productName: null,
          spec: null,
          ...row._sum,
        };
      }
      return {
        key: `__unknown_sales__:${row.salespersonName ?? ""}`,
        label: row.salespersonName ?? "未注明销售归属",
        productName: null,
        spec: null,
        ...row._sum,
      };
    });
  }
  if (groupBy === "product") {
    const rows = await prisma.financeShipment.groupBy({ by: ["productName"], where, _sum: metricSum });
    return rows.map((row) => ({
      key: row.productName ?? "__unknown_product__",
      label: row.productName ?? "未标注存货",
      productName: row.productName,
      spec: null,
      ...row._sum,
    }));
  }
  const rows = await prisma.financeShipment.groupBy({ by: ["productName", "spec"], where, _sum: metricSum });
  return rows.map((row) => ({
    key: `${row.productName ?? ""}\u0000${row.spec ?? ""}`,
    label: `${row.productName ?? "未标注存货"} · ${row.spec ?? "未标注规格"}`,
    productName: row.productName,
    spec: row.spec,
    ...row._sum,
  }));
}

async function aggregateTrend(
  where: ReturnType<typeof buildShipmentWhere>,
  grain: FinanceShipmentTimeGrain,
): Promise<FinanceShipmentTrendPoint[]> {
  const rows = await prisma.financeShipment.groupBy({
    by: grain === "day" ? ["year", "month", "date"] : ["year", "month"],
    where,
    _sum: metricSum,
    orderBy: [{ year: "asc" }, { month: "asc" }, ...(grain === "day" ? [{ date: "asc" as const }] : [])],
  });
  const buckets = new Map<string, AggregateInput>();
  for (const row of rows) {
    const key = trendKey(row.year, row.month, "date" in row ? row.date : null, grain);
    const current = buckets.get(key) ?? { quantity: null, amount: null, receivedAmount: null };
    buckets.set(key, mergeAggregate(current, row._sum));
  }
  return [...buckets.entries()].map(([key, value]) => ({ key, label: trendLabel(key, grain), ...toMetric(value) }));
}

function trendKey(year: number, month: number | null, date: string | null, grain: FinanceShipmentTimeGrain) {
  if (grain === "day") return date ?? `${year}-${String(month ?? 1).padStart(2, "0")}`;
  if (grain === "year") return String(year);
  if (grain === "quarter") return `${year}-Q${Math.floor(((month ?? 1) - 1) / 3) + 1}`;
  return `${year}-${String(month ?? 1).padStart(2, "0")}`;
}

function trendLabel(key: string, grain: FinanceShipmentTimeGrain) {
  if (grain === "day") return key.length === 10 ? `${Number(key.slice(5, 7))}/${Number(key.slice(8, 10))}` : key;
  if (grain === "month") return `${Number(key.slice(5, 7))}月`;
  if (grain === "quarter") return key.replace("-Q", "年Q");
  return `${key}年`;
}

function mergeAggregate(left: AggregateInput, right: AggregateInput): AggregateInput {
  return {
    quantity: addNullable(left.quantity, right.quantity),
    amount: addNullable(left.amount, right.amount),
    receivedAmount: addNullable(left.receivedAmount, right.receivedAmount),
  };
}

function addNullable(left: number | null, right: number | null) {
  if (left === null) return right;
  if (right === null) return left;
  return left + right;
}

export function toMetric(input: AggregateInput): FinanceShipmentAggregateMetric {
  const amount = input.amount;
  const receivedAmount = input.receivedAmount;
  return {
    quantity: input.quantity,
    amount,
    receivedAmount,
    unreceivedAmount: amount === null || receivedAmount === null ? null : amount - receivedAmount,
    collectionRate: amount === null || receivedAmount === null || amount === 0 ? null : receivedAmount / amount,
  };
}

function toTotals(input: AggregateInput, rowCount: number): FinanceShipmentAnalyticsTotals {
  return { rowCount, ...toMetric(input) };
}

function compareMetric(left: number | null, right: number | null, order: ShipmentSortOrder) {
  if (left === null) return right === null ? 0 : 1;
  if (right === null) return -1;
  return order === "asc" ? left - right : right - left;
}

function previousYearParams(params: ShipmentAnalyticsParams): ShipmentAnalyticsParams | null {
  if (!params.dateFrom || !params.dateTo) return null;
  return {
    ...params,
    dateFrom: shiftIsoYear(params.dateFrom, -1),
    dateTo: shiftIsoYear(params.dateTo, -1),
  };
}

function shiftIsoYear(value: string, offset: number) {
  const [year, month, day] = value.split("-").map(Number);
  const targetYear = year + offset;
  const lastDay = new Date(Date.UTC(targetYear, month, 0)).getUTCDate();
  return `${targetYear}-${String(month).padStart(2, "0")}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
}
