"use client";

import { workspacePath } from "@workspace/core/routing";
import { useEffect, useState, useMemo } from "react";
import { createPageBody, PageSurface, useFeedback } from "@workspace/core/ui";
import type { BodySurfaceSectionSpec, DataSurfaceCellSpec, DataSurfaceColumnSpec, PageSurfaceTabBarSpec } from "@workspace/core/ui";
import { useFinanceFilterToolbarItems } from "../components/FinanceFilters";
import {
  getBaseItemColumns,
  getGroupItemColumns,
  getGroupSourceTraceColumns,
  type GroupVoucherSourceTraceRow,
  type VoucherItemRow,
} from "../components/VoucherItemTable";
import { getVoucherColumns } from "./VoucherColumns";
import type {
  FinanceGroupVoucherDocumentType,
  FinanceLedgerExportMode,
  FinanceVoucherPeriodScope,
  Voucher,
  VoucherResponse,
} from "@workspace/finance/types";
import type { StatementPeriodKind } from "@workspace/finance/types/statement-period";
import { useCompanyOptions } from "@workspace/platform/hooks";
import type { FinanceLedgerDefaultScope } from "./defaultScope";
import { cashFlowAllocationsForItem } from "./voucherCashFlow";
import { useLedgerExportAction } from "./useLedgerExportAction";
import { groupVoucherFilterPanelItem } from "./groupVoucherToolbarItems";
import { formatFinanceAmount } from "../formatters";
import { consolidationPeriodLabel } from "../statements/consolidation-period";

// ─── Component ───────────────────────────────────────────

export default function VoucherTab({
  canExport,
  defaultScope,
  voucherKind,
  navigation,
  lifecycleBlocks = [],
}: {
  canExport: boolean;
  defaultScope: FinanceLedgerDefaultScope | null;
  voucherKind: "standard" | "group";
  navigation?: PageSurfaceTabBarSpec;
  lifecycleBlocks?: BodySurfaceSectionSpec[];
}) {
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [loading, setLoading] = useState(true);
  const [companyFilter, setCompanyFilter] = useState(voucherKind === "standard" ? defaultScope?.companyCode ?? "" : "");
  const [yearFilter, setYearFilter] = useState(defaultScope ? String(defaultScope.year) : "");
  const [monthFilter, setMonthFilter] = useState(defaultScope ? String(defaultScope.month) : "");
  const [periodKind, setPeriodKind] = useState<StatementPeriodKind>("month");
  const [expandedVoucherId, setExpandedVoucherId] = useState<number | null>(null);
  const [expandedSourceLineId, setExpandedSourceLineId] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [total, setTotal] = useState(0);
  const { error } = useFeedback();
  const [keyword, setKeyword] = useState("");
  const [documentType, setDocumentType] = useState<"" | FinanceGroupVoucherDocumentType>("");
  const [origin, setOrigin] = useState<"" | "manual" | "system">("");
  const [exportMode, setExportMode] = useState<FinanceLedgerExportMode>("summary");
  const [voucherPeriodScope, setVoucherPeriodScope] = useState<FinanceVoucherPeriodScope>("current");
  const companyOptions = useCompanyOptions(false);
  const companyNameByCode = useMemo(() => new Map(companyOptions.map((option) => [option.value, option.label])), [companyOptions]);
  useEffect(() => {
    setCompanyFilter(voucherKind === "standard" ? defaultScope?.companyCode ?? "" : "");
    setDocumentType("");
    setOrigin("");
    setExportMode("summary");
    setVoucherPeriodScope("current");
    setPage(1);
    setExpandedVoucherId(null);
    setExpandedSourceLineId(null);
  }, [defaultScope?.companyCode, voucherKind]);
  const voucherColumns = useMemo(() => getVoucherColumns(expandedVoucherId, companyNameByCode, {
    group: voucherKind === "group",
  }), [companyNameByCode, expandedVoucherId, voucherKind]);
  const [visibleColumns, setVisibleColumns] = useState<string[]>(
    () => voucherColumns.filter((c) => c.required || c.defaultVisible).map((c) => c.key)
  );
  useEffect(() => {
    setVisibleColumns(voucherColumns.filter((column) => column.required || column.defaultVisible).map((column) => column.key));
  }, [voucherColumns]);

  const itemColumns = useMemo(() => voucherKind === "group"
    ? getGroupItemColumns(expandedSourceLineId)
    : getBaseItemColumns(), [expandedSourceLineId, voucherKind]);
  const exportAction = useLedgerExportAction({
    canExport,
    view: "vouchers",
    companyCode: companyFilter,
    year: yearFilter,
    month: monthFilter,
    periodKind,
    keyword,
    voucherKind,
    documentType: voucherKind === "group" && documentType ? documentType : undefined,
    origin: voucherKind === "group" && origin ? origin : undefined,
    exportMode: voucherKind === "group" ? exportMode : undefined,
    voucherPeriodScope: voucherKind === "group" ? voucherPeriodScope : undefined,
    fallbackFilename: voucherKind === "group"
      ? `${selectedPeriodLabel(yearFilter, monthFilter, periodKind)}-合并明细-${voucherPeriodScope === "history" ? "历史汇总" : "当期"}-${exportMode === "detail" ? "明细" : "汇总"}.xlsx`
      : `${companyNameByCode.get(companyFilter) || companyFilter || "全部公司"}-${selectedPeriodLabel(yearFilter, monthFilter, periodKind)}-凭证明细.xlsx`,
  });

  useEffect(() => {
    const ctrl = new AbortController();
    let cancelled = false;

    async function load() {
      setLoading(true);
      const params = new URLSearchParams();
      if (companyFilter) params.set("companyCode", companyFilter);
      if (yearFilter) params.set("year", yearFilter);
      if (monthFilter) params.set("month", monthFilter);
      params.set("periodKind", periodKind);
      if (keyword) params.set("keyword", keyword);
      params.set("voucherKind", voucherKind);
      if (voucherKind === "group") params.set("voucherPeriodScope", voucherPeriodScope);
      if (voucherKind === "group" && documentType) params.set("documentType", documentType);
      if (voucherKind === "group" && origin) params.set("origin", origin);
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));

      try {
        const res = await fetch(workspacePath(`/api/modules/finance/ledger/vouchers?${params.toString()}`), { signal: ctrl.signal });
        if (cancelled) return;
        if (res.ok) {
          const data: VoucherResponse = await res.json();
          if (!cancelled) {
            setVouchers(data.vouchers || []);
            setTotal(data.total || 0);
          }
        } else {
          const err = await res.json().catch(() => ({ error: "加载失败" }));
          if (!cancelled) {
            setVouchers([]);
            setTotal(0);
            error(err.error || "加载失败");
          }
        }
      } catch (e: unknown) {
        const err = e as Error;
        if (err.name === "AbortError") return;
        if (!cancelled) {
          setVouchers([]);
          setTotal(0);
          error("网络错误");
        }
      }
      if (!cancelled) setLoading(false);
    }

    load();

    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, [companyFilter, documentType, error, keyword, monthFilter, origin, page, pageSize, periodKind, voucherKind, voucherPeriodScope, yearFilter]);

  const totalPages = Math.ceil(total / pageSize);
  const toolbarItems = useFinanceFilterToolbarItems({
    companyFilter,
    yearFilter,
    monthFilter,
    periodKind,
    keyword,
    pageSize,
    onCompanyChange: voucherKind === "standard"
      ? (v) => { setCompanyFilter(v); setPage(1); }
      : undefined,
    onYearChange: (v) => { setYearFilter(v); setPage(1); },
    onMonthChange: (v) => { setMonthFilter(v); setPage(1); },
    onPeriodKindChange: (v) => { setPeriodKind(v); setPage(1); },
    onKeywordChange: (v) => { setKeyword(v); setPage(1); },
    onPageSizeChange: (v) => { setPageSize(v); setPage(1); },
    columns: voucherKind === "standard" ? voucherColumns : undefined,
    visibleColumns: voucherKind === "standard" ? visibleColumns : undefined,
    onColumnsChange: voucherKind === "standard" ? setVisibleColumns : undefined,
    allowPeriodWithoutCompany: voucherKind === "group",
    extraItems: [
      ...(voucherKind === "group" ? [
        groupVoucherFilterPanelItem({
          documentType,
          origin,
          exportMode,
          periodScope: voucherPeriodScope,
          onDocumentTypeChange: (value) => { setDocumentType(value); setPage(1); },
          onOriginChange: (value) => { setOrigin(value); setPage(1); },
          onExportModeChange: setExportMode,
          onPeriodScopeChange: (value) => { setVoucherPeriodScope(value); setPage(1); },
          onReset: () => {
            setDocumentType("");
            setOrigin("");
            setExportMode("summary");
            setVoucherPeriodScope("current");
            setPage(1);
          },
        }),
      ] : []),
      ...(exportAction ? [exportAction] : []),
    ],
  });

  async function toggleVoucher(voucher: Voucher) {
    if (expandedVoucherId === voucher.id) {
      setExpandedVoucherId(null);
      setExpandedSourceLineId(null);
      return;
    }
    setExpandedVoucherId(voucher.id);
    setExpandedSourceLineId(null);
  }

  async function toggleSourceLine(voucher: Voucher, line: VoucherItemRow) {
    if (expandedSourceLineId === line.id) {
      setExpandedSourceLineId(null);
      return;
    }
    setExpandedSourceLineId(line.id);
    if (line.sourceTrace !== undefined) return;
    const params = new URLSearchParams({
      voucherKind: "group",
      sourceTraceLineId: String(line.id),
      page: "1",
      pageSize: "1",
    });
    try {
      const response = await fetch(workspacePath(`/api/modules/finance/ledger/vouchers?${params.toString()}`));
      if (!response.ok) {
        const issue = await response.json().catch(() => ({ error: "原始凭证来源加载失败" }));
        error(issue.error || "原始凭证来源加载失败");
        return;
      }
      const detail: VoucherResponse = await response.json();
      const tracedVoucher = detail.vouchers?.find((item) => item.id === voucher.id);
      if (tracedVoucher) {
        const tracedLine = tracedVoucher.items.find((item) => item.id === line.id);
        if (tracedLine) {
          setVouchers((current) => current.map((item) => item.id !== voucher.id ? item : {
            ...item,
            items: item.items.map((currentLine) => currentLine.id === line.id
              ? { ...currentLine, ...tracedLine }
              : currentLine),
          }));
        }
      }
    } catch {
      error("原始凭证来源加载失败");
    }
  }

  return (
    <PageSurface kind="standard"
      tabbar={navigation}
      toolbar={{ items: toolbarItems }}
      body={createPageBody([
        ...lifecycleBlocks,
        {
          key: "vouchers",
          body: { kind: "data", data: {
            kind: "table",
            rows: vouchers,
            columns: voucherColumns,
            visibleColumns,
            loading,
            emptyText: "暂无凭证",
            rowKey: (v: Voucher) => v.id,
            onRowClick: (v: Voucher) => { void toggleVoucher(v); },
            expandedRowKey: expandedVoucherId,
            expandedRow: (v: Voucher) => voucherItemsPreview(
              v,
              itemColumns,
              expandedSourceLineId,
              (line) => { void toggleSourceLine(v, line); },
            ),
          } },
        },
      ])}
      footer={{ pagination: { page, totalPages, total, onPageChange: setPage } }}
    />
  );
}

function voucherItemsPreview(
  voucher: Voucher,
  columns: DataSurfaceColumnSpec<VoucherItemRow>[],
  expandedSourceLineId: number | null,
  onSourceLineClick: (line: VoucherItemRow) => void,
): DataSurfaceCellSpec {
  const rows = voucher.items.map((item: VoucherItemRow, index: number) => ({
    ...item,
    _idx: index,
    sourceDate: voucher.voucherKind === "group" ? item.sourceDate : voucher.date,
    cashFlowAllocations: cashFlowAllocationsForItem(item.id, voucher.cashFlowAllocations ?? []),
  }));
  return {
    kind: "data",
    data: {
      kind: "table",
      rows,
      columns,
      visibleColumns: columns.map((column) => column.key),
      rowKey: (row: VoucherItemRow) => row.id,
      presentation: { density: "compact" },
      ...(voucher.voucherKind === "group" ? {
        onRowClick: onSourceLineClick,
        expandedRowKey: expandedSourceLineId,
        expandedRow: groupSourceAuditPreview,
      } : {}),
    },
  };
}

function groupSourceAuditPreview(line: VoucherItemRow): DataSurfaceCellSpec {
  if (line.sourceTrace === undefined) {
    return { kind: "text", value: "正在加载审计穿透…", tone: "muted" };
  }
  const sourceRows: GroupVoucherSourceTraceRow[] = line.sourceTrace ?? [];
  const sourceColumns = getGroupSourceTraceColumns();
  const balance = line.sourceBalanceCheck;
  const reclassification = line.sourceReclassification;
  const sourceEvidence: DataSurfaceCellSpec[] = sourceRows.length > 0
    ? [
        {
          kind: "text",
          value: "审计链按原始凭证日期展示；期初、期末余额仅作为勾稽小计，不作为业务发生日期。未能关联原始凭证的部分单独标记为未穿透。",
          tone: "muted",
          wrap: "wrap",
        },
        {
          kind: "data",
          data: {
            kind: "table",
            rows: sourceRows,
            columns: sourceColumns,
            visibleColumns: sourceColumns.map((column) => column.key),
            rowKey: (row: GroupVoucherSourceTraceRow) => row.key,
            presentation: { density: "compact", cellWrap: "nowrap", header: "plain" },
          },
        },
      ]
    : [{
        kind: "text",
        value: "该分录没有可穿透的原始凭证来源",
        tone: "muted",
      }];
  return {
    kind: "group",
    direction: "column",
    items: [
      ...(reclassification ? [{
        kind: "text" as const,
        value: `重分类：${reclassification.sourceAccountName} · ${reclassification.sourceAccountCode} → ${reclassification.targetAccountName} · ${reclassification.targetAccountCode}（${reclassificationBasisLabel(reclassification.basis)}，${reclassificationStatusLabel(reclassification.status)}）`,
        wrap: "wrap" as const,
      }] : []),
      ...(balance ? [{
        kind: "text" as const,
        value: `余额勾稽：期初${balanceAmountLabel(balance.openingNet)}；本期净变动${balanceAmountLabel(balance.currentMovementNet)}；期末${balanceAmountLabel(balance.closingNet)}。`,
        tone: "muted" as const,
        wrap: "wrap" as const,
      }] : []),
      ...sourceEvidence,
    ],
  };
}

function balanceAmountLabel(value: number) {
  if (Math.abs(value) < 0.005) return " 0.00";
  return `${value > 0 ? "借" : "贷"} ${formatFinanceAmount(Math.abs(value))}`;
}

function reclassificationBasisLabel(value: string) {
  return value === "counterparty_gross" ? "按往来户毛额" : "按科目净额";
}

function reclassificationStatusLabel(value: string) {
  if (value === "approved") return "已批准";
  if (value === "adjusted") return "已调整";
  return value;
}

function selectedPeriodLabel(year: string, month: string, periodKind: StatementPeriodKind) {
  const numericYear = Number(year);
  const numericMonth = Number(month);
  if (!Number.isInteger(numericYear) || numericYear <= 0
    || !Number.isInteger(numericMonth) || numericMonth < 1 || numericMonth > 12) {
    return year || "全部期间";
  }
  return consolidationPeriodLabel(numericYear, numericMonth, periodKind);
}
