"use client";

import { workspacePath } from "@workspace/core/routing";
import {
  PageSurface,
  createPageBody,
  createPageTableSection,
  createStatusSection,
  type BodySurfaceSectionSpec,
  type DataSurfaceColumnSpec,
  type PageSurfaceTabBarSpec,
} from "@workspace/core/ui";
import type {
  FinanceCounterpartyBalanceCategory,
  FinanceCounterpartyObjectKind,
  FinanceCounterpartyBalanceResponse,
  FinanceCounterpartyBalanceRow,
  FinanceCounterpartyRelatedPartyType,
  FinanceCounterpartyRelationScope,
} from "../../types/ledger";
import type { StatementPeriodKind } from "@workspace/finance/types/statement-period";
import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { useFinanceFilterToolbarItems } from "../components/FinanceFilters";
import { formatFinanceAmount } from "../formatters";
import type { FinanceLedgerDefaultScope } from "./defaultScope";
import { useLedgerExportAction } from "./useLedgerExportAction";
import { consolidationPeriodLabel } from "../statements/consolidation-period";

const CATEGORY_LABELS: Record<FinanceCounterpartyBalanceCategory, {
  name: string;
  empty: string;
}> = {
  ar: { name: "客户名称", empty: "当前期间没有应收账款明细" },
  ap: { name: "供应商名称", empty: "当前期间没有应付账款明细" },
  otherAr: { name: "往来对象名称", empty: "当前期间没有其他应收款明细" },
  otherAp: { name: "往来对象名称", empty: "当前期间没有其他应付款明细" },
};

const RELATION_SCOPE_OPTIONS = [
  { value: "all", label: "全部" },
  { value: "related", label: "关联方" },
  { value: "other", label: "其他" },
] as const;

const OBJECT_TYPE_LABELS: Record<FinanceCounterpartyObjectKind, string> = {
  groupCompany: "集团公司",
  customer: "客户",
  supplier: "供应商",
  employee: "员工",
  department: "部门",
  other: "其他单位/个人",
};

const RELATED_PARTY_LABELS: Record<FinanceCounterpartyRelatedPartyType, string> = {
  group: "集团内",
  joint_venture_associate: "合营/联营",
  investor_influence: "重大影响",
  key_management_related: "管理人员",
  other_related: "其他关联方",
};

const EMPTY_RESPONSE: FinanceCounterpartyBalanceResponse = {
  data: [],
  total: 0,
  page: 1,
  pageSize: 50,
  totalPages: 1,
  totals: {
    openingDebit: 0,
    openingCredit: 0,
    currentDebit: 0,
    currentCredit: 0,
    closingDebit: 0,
    closingCredit: 0,
  },
};

export default function CounterpartyBalanceTab({
  canExport,
  category,
  defaultScope,
  navigation,
  lifecycleBlocks = [],
}: {
  canExport: boolean;
  category: FinanceCounterpartyBalanceCategory;
  defaultScope: FinanceLedgerDefaultScope | null;
  navigation?: PageSurfaceTabBarSpec;
  lifecycleBlocks?: BodySurfaceSectionSpec[];
}) {
  const [companyCode, setCompanyCode] = useState(defaultScope?.companyCode ?? "");
  const [year, setYear] = useState(String(defaultScope?.year ?? ""));
  const [month, setMonth] = useState(String(defaultScope?.month ?? ""));
  const [periodKind, setPeriodKind] = useState<StatementPeriodKind>("month");
  const [keyword, setKeyword] = useState("");
  const [relationScope, setRelationScope] = useState<FinanceCounterpartyRelationScope>("all");
  const deferredKeyword = useDeferredValue(keyword);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [result, setResult] = useState<FinanceCounterpartyBalanceResponse>(EMPTY_RESPONSE);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!companyCode || !year || !month) {
      setResult({ ...EMPTY_RESPONSE, page, pageSize });
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams({
        companyCode,
        year,
        month,
        periodKind,
        category,
        relationScope,
        page: String(page),
        pageSize: String(pageSize),
      });
      if (deferredKeyword.trim()) query.set("keyword", deferredKeyword.trim());
      const response = await fetch(workspacePath(
        `/api/modules/finance/ledger/counterparty-balances?${query.toString()}`,
      ));
      const data = await response.json().catch(() => null) as FinanceCounterpartyBalanceResponse | { error?: string } | null;
      if (!response.ok) throw new Error(data && "error" in data ? data.error : `加载失败 (${response.status})`);
      setResult(data as FinanceCounterpartyBalanceResponse);
    } catch (caught) {
      setResult({ ...EMPTY_RESPONSE, page, pageSize });
      setError(caught instanceof Error ? caught.message : "应收应付余额加载失败");
    } finally {
      setLoading(false);
    }
  }, [category, companyCode, deferredKeyword, month, page, pageSize, periodKind, relationScope, year]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setPage(1); }, [category]);

  const labels = CATEGORY_LABELS[category];
  const exportLabel = { ar: "应收", ap: "应付", otherAr: "其他应收", otherAp: "其他应付" }[category];
  const exportAction = useLedgerExportAction({
    canExport,
    view: "counterparty",
    companyCode,
    year,
    month,
    periodKind,
    keyword: deferredKeyword,
    category,
    relationScope,
    disabled: !companyCode || !year || !month,
    fallbackFilename: `${companyCode}-${periodFilenamePart(year, month, periodKind)}-${exportLabel}.xlsx`,
  });
  const columns = useMemo<DataSurfaceColumnSpec<FinanceCounterpartyBalanceRow>[]>(() => [
    {
      key: "counterpartyName",
      label: labels.name,
      required: true,
      cell: (row) => row.counterpartyName,
    },
    {
      key: "counterpartyObjectKind",
      label: "对象类型",
      required: true,
      cell: (row) => OBJECT_TYPE_LABELS[row.counterpartyObjectKind],
    },
    {
      key: "relatedPartyType",
      label: "关系性质",
      required: true,
      cell: (row) => row.relatedPartyType
        ? { kind: "badge", label: RELATED_PARTY_LABELS[row.relatedPartyType], tone: "amber" }
        : row.identityMatched
          ? { kind: "badge", label: "非关联方", tone: "gray" }
          : { kind: "badge", label: "未匹配", tone: "blue" },
    },
    {
      key: "account",
      label: "科目",
      required: true,
      cell: (row) => `${row.accountCode} ${row.accountName}`,
    },
    amountColumn("openingDebit", "期初借方"),
    amountColumn("openingCredit", "期初贷方"),
    amountColumn("currentDebit", "本期借方"),
    amountColumn("currentCredit", "本期贷方"),
    amountColumn("closingDebit", "期末借方"),
    amountColumn("closingCredit", "期末贷方"),
  ], [labels.name]);
  const toolbarItems = useFinanceFilterToolbarItems({
    companyFilter: companyCode,
    yearFilter: year,
    monthFilter: month,
    periodKind,
    keyword,
    pageSize,
    onCompanyChange: (value) => { setCompanyCode(value); setPage(1); },
    onYearChange: (value) => { setYear(value); setPage(1); },
    onMonthChange: (value) => { setMonth(value); setPage(1); },
    onPeriodKindChange: (value) => { setPeriodKind(value); setPage(1); },
    onKeywordChange: (value) => { setKeyword(value); setPage(1); },
    onPageSizeChange: (value) => { setPageSize(value); setPage(1); },
    extraItems: [
      {
        kind: "option-group",
        key: "relation-scope",
        ariaLabel: "关联范围",
        presentation: "segmented",
        value: relationScope,
        options: [...RELATION_SCOPE_OPTIONS],
        onChange: (value) => {
          setRelationScope(value as FinanceCounterpartyRelationScope);
          setPage(1);
        },
      },
      ...(exportAction ? [exportAction] : []),
      { kind: "text", key: "counterparty-total", content: `共 ${result.total} 项` },
    ],
  });
  const sections: BodySurfaceSectionSpec[] = [
    ...lifecycleBlocks,
    ...(error ? [createStatusSection("counterparty-error", { kind: "error", content: error })] : []),
    ...(!error ? [createPageTableSection("counterparty-balances", {
      rows: result.data,
      columns,
      visibleColumns: columns.map((column) => column.key),
      rowKey: (row) => row.id,
      loading,
      emptyText: companyCode && year && month ? labels.empty : "请选择公司和会计期间",
      presentation: { density: "compact" },
      scroll: { x: true },
    })] : []),
  ];

  return <PageSurface
    kind="standard"
    tabbar={navigation}
    toolbar={{ items: toolbarItems }}
    body={createPageBody(sections)}
    footer={result.total > 0 ? {
      pagination: {
        page: result.page,
        totalPages: result.totalPages,
        total: result.total,
        onPageChange: setPage,
      },
    } : undefined}
  />;
}

function amountColumn(
  key: "openingDebit" | "openingCredit" | "currentDebit" | "currentCredit" | "closingDebit" | "closingCredit",
  label: string,
): DataSurfaceColumnSpec<FinanceCounterpartyBalanceRow> {
  return { key, label, required: true, align: "right", cell: (row) => formatCounterpartyAmount(row[key]) };
}

function formatCounterpartyAmount(value: number) {
  return value === 0 ? "0" : formatFinanceAmount(value);
}

function periodFilenamePart(year: string, month: string, periodKind: StatementPeriodKind) {
  const numericYear = Number(year);
  const numericMonth = Number(month);
  if (!Number.isInteger(numericYear) || !Number.isInteger(numericMonth)) return `${year}.${month.padStart(2, "0")}`;
  return consolidationPeriodLabel(numericYear, numericMonth, periodKind);
}
