"use client";

import type { SurfaceToolbarItems } from "@workspace/core/ui";
import type { CostFiltersState, ShipmentPeriodMode, ShipmentWorkspaceState } from "../types";

interface Props {
  filters: CostFiltersState;
  onChange: (filters: CostFiltersState) => void;
}

export function useCostFilterToolbarItems({ filters, onChange }: Props): SurfaceToolbarItems {
  const value = filters.year && filters.month
    ? `${filters.year}-${String(filters.month).padStart(2, "0")}`
    : null;
  return [{
    kind: "period",
    key: "period",
    mode: "month",
    value,
    placeholder: "选择年月",
    onChange: (nextValue: string | null) => {
      const match = nextValue?.match(/^(\d{4})-(\d{2})$/);
      onChange({
        ...filters,
        year: match ? Number(match[1]) : undefined,
        month: match ? Number(match[2]) : undefined,
      });
    },
  }];
}

const PERIOD_MODES = [
  { value: "week", label: "按周" },
  { value: "month", label: "按月" },
  { value: "quarter", label: "按季度" },
  { value: "year", label: "按年" },
];

const GROUP_OPTIONS = [
  { value: "customer", label: "按客户" },
  { value: "salesperson", label: "按销售归属" },
  { value: "product", label: "按存货名称" },
  { value: "productSpec", label: "按存货名称+规格" },
];

const METRIC_OPTIONS = [
  { value: "quantity", label: "发货数量" },
  { value: "amount", label: "发货金额" },
  { value: "receivedAmount", label: "回款金额" },
];

const PAGE_SIZE_OPTIONS = [20, 50, 100].map((size) => ({ value: String(size), label: `${size}条/页` }));

export function useShipmentToolbarItems({
  value,
  onChange,
}: {
  value: ShipmentWorkspaceState;
  onChange: (value: ShipmentWorkspaceState) => void;
}): SurfaceToolbarItems {
  const set = <Key extends keyof ShipmentWorkspaceState>(key: Key, next: ShipmentWorkspaceState[Key]) => {
    onChange({ ...value, [key]: next });
  };
  const items: SurfaceToolbarItems = [
    {
      kind: "option-group",
      key: "period-mode",
      value: value.periodMode,
      options: PERIOD_MODES,
      ariaLabel: "期间",
      presentation: "accordion",
      accordionTrigger: "active",
      onChange: (next) => {
        const periodMode = next as ShipmentPeriodMode;
        onChange({
          ...value,
          periodMode,
          periodValue: defaultPeriodValue(periodMode),
        });
      },
    },
  ];

  items.push({
    kind: "period",
    key: "period-value",
    mode: "nav",
    label: periodLabel(value.periodMode, value.periodValue),
    onPrevious: () => set("periodValue", adjacentPeriod(value.periodMode, value.periodValue, -1)),
    onNext: () => set("periodValue", adjacentPeriod(value.periodMode, value.periodValue, 1)),
    picker: {
      precision: value.periodMode,
      value: value.periodValue,
      onChange: (next) => set("periodValue", next),
      ariaLabel: "选择发货期间",
    },
  });

  items.push(
    { kind: "select", key: "group-by", label: "汇总维度", value: value.groupBy, options: GROUP_OPTIONS, onChange: (next) => set("groupBy", (next || "productSpec") as ShipmentWorkspaceState["groupBy"]) },
    { kind: "select", key: "sort-by", label: "分析指标", value: value.sortBy, options: METRIC_OPTIONS, onChange: (next) => set("sortBy", (next || "amount") as ShipmentWorkspaceState["sortBy"]) },
    { kind: "select", key: "sort-order", label: "排序", value: value.sortOrder, options: [{ value: "desc", label: "从高到低" }, { value: "asc", label: "从低到高" }], onChange: (next) => set("sortOrder", (next || "desc") as ShipmentWorkspaceState["sortOrder"]) },
    { kind: "page-size", key: "page-size", value: String(value.pageSize), options: PAGE_SIZE_OPTIONS, onChange: (next) => set("pageSize", Number(next) as ShipmentWorkspaceState["pageSize"]) },
  );
  return items;
}

export function shipmentDateRange(value: ShipmentWorkspaceState) {
  if (value.periodMode === "year") return { dateFrom: `${value.periodValue}-01-01`, dateTo: `${value.periodValue}-12-31` };
  if (value.periodMode === "quarter") {
    const match = value.periodValue.match(/^(\d{4})-Q([1-4])$/);
    if (!match) return { dateFrom: null, dateTo: null };
    const year = Number(match[1]);
    const startMonth = (Number(match[2]) - 1) * 3;
    return { dateFrom: isoDate(new Date(year, startMonth, 1)), dateTo: isoDate(new Date(year, startMonth + 3, 0)) };
  }
  if (value.periodMode === "week") {
    const start = isoWeekStart(value.periodValue);
    if (!start) return { dateFrom: null, dateTo: null };
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 6);
    return { dateFrom: isoUtcDate(start), dateTo: isoUtcDate(end) };
  }
  const [year, month] = value.periodValue.split("-").map(Number);
  return { dateFrom: isoDate(new Date(year, month - 1, 1)), dateTo: isoDate(new Date(year, month, 0)) };
}

export function shipmentTrendGrain(value: ShipmentWorkspaceState) {
  if (value.periodMode === "week" || value.periodMode === "month") return "day" as const;
  return "month" as const;
}

function defaultPeriodValue(mode: ShipmentPeriodMode) {
  const now = new Date();
  if (mode === "week") return formatIsoWeek(now);
  if (mode === "year") return String(now.getFullYear());
  if (mode === "quarter") return `${now.getFullYear()}-Q${Math.floor(now.getMonth() / 3) + 1}`;
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function adjacentPeriod(mode: ShipmentPeriodMode, value: string, delta: number) {
  if (mode === "year") return String(Number(value) + delta);
  if (mode === "quarter") {
    const match = value.match(/^(\d{4})-Q([1-4])$/);
    const index = Number(match?.[1] ?? new Date().getFullYear()) * 4 + Number(match?.[2] ?? 1) - 1 + delta;
    return `${Math.floor(index / 4)}-Q${(index % 4) + 1}`;
  }
  if (mode === "week") {
    const start = isoWeekStart(value) ?? isoWeekStart(formatIsoWeek(new Date()))!;
    start.setUTCDate(start.getUTCDate() + delta * 7);
    return formatIsoWeekUtc(start);
  }
  const [year, month] = value.split("-").map(Number);
  const next = new Date(year, month - 1 + delta, 1);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`;
}

function periodLabel(mode: ShipmentPeriodMode, value: string) {
  if (mode === "year") return `${value}年`;
  if (mode === "quarter") return value.replace("-Q", "年第") + "季度";
  if (mode === "week") {
    const match = value.match(/^(\d{4})-W(\d{2})$/);
    return match ? `${match[1]}年第${Number(match[2])}周` : value;
  }
  const [year, month] = value.split("-");
  return `${year}年${Number(month)}月`;
}

function isoDate(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
function isoUtcDate(date: Date) { return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`; }

function formatIsoWeek(date: Date) {
  return formatIsoWeekParts(date.getFullYear(), date.getMonth(), date.getDate());
}

function formatIsoWeekUtc(date: Date) {
  return formatIsoWeekParts(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function formatIsoWeekParts(year: number, monthIndex: number, day: number) {
  const working = new Date(Date.UTC(year, monthIndex, day));
  const weekday = working.getUTCDay() || 7;
  working.setUTCDate(working.getUTCDate() + 4 - weekday);
  const isoYear = working.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const week = Math.ceil((((working.getTime() - yearStart.getTime()) / 86_400_000) + 1) / 7);
  return `${isoYear}-W${String(week).padStart(2, "0")}`;
}

function isoWeekStart(value: string) {
  const match = value.match(/^(\d{4})-W(\d{2})$/);
  if (!match) return null;
  const isoYear = Number(match[1]);
  const week = Number(match[2]);
  if (week < 1 || week > 53) return null;
  const januaryFourth = new Date(Date.UTC(isoYear, 0, 4));
  const weekday = januaryFourth.getUTCDay() || 7;
  januaryFourth.setUTCDate(januaryFourth.getUTCDate() - weekday + 1 + (week - 1) * 7);
  return formatIsoWeekUtc(januaryFourth) === value ? januaryFourth : null;
}

export default function CostFilters(props: Props) {
  useCostFilterToolbarItems(props);
  return null;
}
