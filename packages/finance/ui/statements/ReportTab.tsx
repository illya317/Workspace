"use client";

import { workspacePath } from "@workspace/core/routing";
import {
  BALANCE_SHEET_COMPARATIVE_AMOUNT_LABEL,
  BALANCE_SHEET_CURRENT_AMOUNT_LABEL,
  FLOW_STATEMENT_COMPARATIVE_AMOUNT_LABEL,
  FLOW_STATEMENT_CURRENT_AMOUNT_LABEL,
  FLOW_STATEMENT_CURRENT_MONTH_AMOUNT_LABEL,
  formatStatementPeriodEndLabel,
} from "@workspace/finance/types/statement-period";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createPageBody, createMessageSection, createPanelSection, createSectionsSection, PageSurface, useFeedback, usePageAssistant } from "@workspace/core/ui";
import type { BodySurfaceSectionSpec, PageSurfaceTabBarSpec, SurfaceToolbarItems } from "@workspace/core/ui";
import { useCompanyOptions } from "@workspace/platform/hooks";
import { createReportBannerSection } from "./ReportBanner";
import { createReportLinesSurface, type AccountDetail, type ReportLine } from "./ReportLines";
import { formatFinanceAmount } from "../formatters";
import { useStatementScope } from "./useStatementScope";
import { REPORT_TYPE_OPTIONS } from "./report-options";
import type { ConsolidationPeriodKind } from "./consolidation-period";
import { buildStatementPeriodToolbarItems } from "./consolidation-toolbar";
import { buildStandaloneStatementAssistantContext } from "./statement-assistant-context";
import { downloadFinanceWorkbook } from "../workbook-download";
const REPORT_TYPES = new Set(["balance", "income", "cashflow"]);

function balanceCheck(label: string, assets: number, liabilitiesAndEquity: number) {
  const gap = Math.round((assets - liabilitiesAndEquity) * 100) / 100;
  return `${label}：资产总计 ${formatFinanceAmount(assets)} | 负债和权益总计 ${formatFinanceAmount(liabilitiesAndEquity)} | ${gap === 0 ? "平衡" : `不平衡 ${formatFinanceAmount(Math.abs(gap))}`}`;
}
interface Period {
  id: number;
  year: number;
  month: number;
  companyCode?: string | null;
  endDate?: string | null;
}
interface ReportData {
  type: string;
  period: Period;
  assets?: ReportLine[];
  liabilities?: ReportLine[];
  equity?: ReportLine[];
  totalLiabilitiesAndEquity?: number;
  previousTotalLiabilitiesAndEquity?: number;
  lines?: ReportLine[];
  source?: "system" | "empty";
  diagnostics?: {
    type: string;
    message: string;
  }[];
}
export default function ReportTab({
  navigation,
  canExport,
}: {
  navigation?: PageSurfaceTabBarSpec;
  canExport: boolean;
}) {
  const searchParams = useSearchParams();
  const feedback = useFeedback();
  const pageAssistant = usePageAssistant();
  const allCompanyOptions = useCompanyOptions();
  const {
    company: companyFilter,
    setCompany: setCompanyFilter,
    year,
    month: monthFilter,
    setPeriod,
    availablePairs,
  } = useStatementScope();
  const companyOptions = useMemo(() => {
    const withPeriods = new Set(availablePairs.map((period) => period.companyCode));
    return allCompanyOptions.filter((option) => withPeriods.has(option.value));
  }, [allCompanyOptions, availablePairs]);
  const rtFromQuery = searchParams.get("reportType");
  const [reportType, setReportType] = useState<"balance" | "income" | "cashflow">(rtFromQuery && REPORT_TYPES.has(rtFromQuery) ? rtFromQuery as "balance" | "income" | "cashflow" : "balance");
  const [periodKind, setPeriodKind] = useState<ConsolidationPeriodKind>("month");
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [expandedCodes, setExpandedCodes] = useState<Set<string>>(new Set());
  const [details, setDetails] = useState<Record<string, AccountDetail[]>>({});
  const [loadingDetail, setLoadingDetail] = useState<string | null>(null);
  const loadReport = useCallback(async () => {
    if (!companyFilter || !year || !monthFilter) return;
    setLoading(true);
    setExpandedCodes(new Set());
    setDetails({});
    const res = await fetch(workspacePath(`/api/modules/finance/statements/reports?companyCode=${companyFilter}&year=${year}&month=${monthFilter}&periodKind=${periodKind}&type=${reportType}`));
    if (res.ok) setData(await res.json());
    setLoading(false);
  }, [companyFilter, monthFilter, periodKind, reportType, year]);
  useEffect(() => {
    void loadReport();
  }, [loadReport]);
  const toggleDetail = useCallback(async (key: string, code: string, direction: "debit" | "credit") => {
    if (!key || !code) return;
    const newSet = new Set(expandedCodes);
    if (newSet.has(key)) {
      newSet.delete(key);
      setExpandedCodes(newSet);
      return;
    }
    newSet.add(key);
    setExpandedCodes(newSet);
    if (!details[key]) {
      setLoadingDetail(key);
      try {
      const detailReportType = reportType === "income" ? "income" : "balance";
      const res = await fetch(workspacePath(`/api/modules/finance/statements/reports/detail?companyCode=${companyFilter}&year=${year}&month=${monthFilter}&periodKind=${periodKind}&reportType=${detailReportType}&direction=${direction}&codes=${encodeURIComponent(code)}`));
        if (res.ok) {
          const result = await res.json();
          setDetails(prev => ({
            ...prev,
            [key]: result.details || []
          }));
        }
      } finally {
        setLoadingDetail(null);
      }
    }
  }, [companyFilter, details, expandedCodes, monthFilter, periodKind, reportType, year]);
  const lineProps = {
    expandedCodes,
    details,
    loadingDetail,
    onToggle: toggleDetail
  };
  const liabilityEquityLines: ReportLine[] = data?.type === "balance" ? [
    ...(data.liabilities || []),
    ...(data.equity || []),
    {
      label: "负债和所有者权益总计",
      amount: data.totalLiabilitiesAndEquity || 0,
      previousAmount: data.previousTotalLiabilitiesAndEquity,
      isGrandTotal: true,
    },
  ] : [];
  const assetGrandTotal = data?.assets?.find((item) => item.isGrandTotal);
  const companyName = companyOptions.find((option) => option.value === companyFilter)?.label || companyFilter;
  const assistantContext = useMemo(() => (
    companyFilter && year && monthFilter
      ? buildStandaloneStatementAssistantContext({
          companyCode: companyFilter,
          companyName,
          year,
          month: monthFilter,
          reportType,
        })
      : null
  ), [companyFilter, companyName, monthFilter, reportType, year]);
  const downloadWorkbook = useCallback(async () => {
    if (!canExport || !companyFilter || !year || !monthFilter) return;
    setDownloading(true);
    try {
      const query = new URLSearchParams({
        companyCode: companyFilter,
        year: String(year),
        month: String(monthFilter),
        periodKind,
      });
      await downloadFinanceWorkbook(
        workspacePath(`/api/modules/finance/statements/reports/export?${query.toString()}`),
        `${companyName}-${year}.${String(monthFilter).padStart(2, "0")}-财务报表.xlsx`,
      );
    } catch (cause) {
      feedback.error(cause instanceof Error ? cause.message : "财务报表下载失败");
    } finally {
      setDownloading(false);
    }
  }, [canExport, companyFilter, companyName, feedback, monthFilter, periodKind, year]);
  const periodToolbarItems = useMemo(() => buildStatementPeriodToolbarItems({
    year,
    month: monthFilter,
    periodKind,
    loading: !companyFilter || availablePairs.length === 0,
    onPeriodKindChange: setPeriodKind,
    onPeriodChange: setPeriod,
  }), [availablePairs.length, companyFilter, monthFilter, periodKind, setPeriod, year]);
  const toolbarItems: SurfaceToolbarItems = [
    {
      kind: "select",
      key: "company",
      label: "公司",
      options: companyOptions,
      value: companyFilter,
      onChange: setCompanyFilter,
      placeholder: "全部",
    },
    ...periodToolbarItems,
    {
      kind: "select",
      key: "report",
      label: "报表",
      options: REPORT_TYPE_OPTIONS,
      value: reportType,
      onChange: (nextValue) => setReportType(nextValue as "balance" | "income" | "cashflow"),
    },
    {
      kind: "action-group",
      key: "report-actions",
      actions: [
        { key: "load", label: "查看报表", kind: "view", variant: "primary", onClick: loadReport },
        ...(canExport ? [{
          key: "export",
          label: downloading ? "下载中" : "下载三表",
          kind: "export" as const,
          disabled: downloading || !companyFilter || !year || !monthFilter,
          onClick: () => void downloadWorkbook(),
        }] : []),
        {
          key: "assistant",
          label: "页面助手",
          kind: "assistant",
          disabled: !assistantContext,
          onClick: () => {
            if (!assistantContext) return;
            pageAssistant.openAssistant({
              ...assistantContext,
              path: typeof window === "undefined" ? undefined : window.location.pathname,
              title: `${companyName}财务报表`,
            });
          },
        },
      ],
    },
  ];
  const reportBlocks = ([
    ...(reportType === "balance" ? [createMessageSection("statement-reclass-entry", {
      tone: "muted" as const,
      content: "资产负债表只消费持久化的重分类调整；规则建议不会直接改报表。余额已变化或期间已结账的事项会在重分类工作台保留并标记待复核。",
      link: { label: "处理重分类", href: workspacePath("/finance/ledger") },
    })] : []),
    ...(loading ? [createMessageSection("loading", {
      tone: "muted" as const,
      content: "加载中...",
    })] : []),
    ...(data?.type === "balance" ? [createPanelSection("balance-report", {
            title: "资产负债表",
            sections: [
              createMessageSection("balance-meta", {
                tone: "muted" as const,
                content: `编制单位：${companyOptions.find((option) => option.value === companyFilter)?.label || companyFilter}　${formatStatementPeriodEndLabel(data.period)}　单位：元`,
              }),
              createSectionsSection("balance-columns", {
                layout: "grid",
                gridColumns: 2,
                sections: [
                  {
                    key: "asset-lines",
                    body: { kind: "data", data: {
                      ...createReportLinesSurface({
                        items: data.assets || [],
                        labelHeader: "资产",
                        amountHeader: BALANCE_SHEET_CURRENT_AMOUNT_LABEL,
                        previousAmountHeader: BALANCE_SHEET_COMPARATIVE_AMOUNT_LABEL,
                        detailMode: "balance",
                        detailKeyPrefix: "assets",
                        ...lineProps,
                      }),
                    } },
                  },
                  {
                    key: "liability-equity-lines",
                    body: { kind: "data", data: {
                      ...createReportLinesSurface({
                        items: liabilityEquityLines,
                        labelHeader: "负债和所有者权益（或股东权益）",
                        amountHeader: BALANCE_SHEET_CURRENT_AMOUNT_LABEL,
                        previousAmountHeader: BALANCE_SHEET_COMPARATIVE_AMOUNT_LABEL,
                        detailMode: "balance",
                        detailKeyPrefix: "liability-equity",
                        ...lineProps,
                      }),
                    } },
                  },
                ],
              }),
              ...(data.totalLiabilitiesAndEquity !== undefined ? [createMessageSection("balance-check", {
                tone: "muted" as const,

                content: [
                  balanceCheck("期末", assetGrandTotal?.amount || 0, data.totalLiabilitiesAndEquity),
                  balanceCheck("上年年末", assetGrandTotal?.previousAmount || 0, data.previousTotalLiabilitiesAndEquity || 0),
                ].join("　"),
              })] : []),
            ],
          })] : []),
    ...(data?.type === "income" ? [createPanelSection("income-report", {
            title: "利润表",
            sections: [
              createMessageSection("income-meta", {
                tone: "muted" as const,
                content: `编制单位：${companyName}　${year}年${monthFilter}月　单位：元`,
              }),
              ...(() => {
                const block = createReportBannerSection("income-banner", { source: data.source, diagnostics: data.diagnostics });
                return block ? [block] : [];
              })(),
              {
                key: "income-lines",
                body: { kind: "data", data: createReportLinesSurface({ items: data.lines || [], labelHeader: "项目", amountHeader: FLOW_STATEMENT_CURRENT_AMOUNT_LABEL, previousAmountHeader: FLOW_STATEMENT_COMPARATIVE_AMOUNT_LABEL, currentMonthAmountHeader: FLOW_STATEMENT_CURRENT_MONTH_AMOUNT_LABEL, detailMode: "income", detailKeyPrefix: "income", ...lineProps }) },
              },
            ],
          })] : []),
    ...(data?.type === "cashflow" ? [createPanelSection("cashflow-report", {
            title: "现金流量表",
            sections: [
              createMessageSection("cashflow-meta", {
                tone: "muted" as const,
                content: `编制单位：${companyName}　${year}年${monthFilter}月　单位：元`,
              }),
              ...(() => {
                const block = createReportBannerSection("cashflow-banner", { source: data.source, diagnostics: data.diagnostics });
                return block ? [block] : [];
              })(),
              {
                key: "cashflow-lines",
                body: { kind: "data", data: createReportLinesSurface({ items: data.lines || [], labelHeader: "项目", amountHeader: FLOW_STATEMENT_CURRENT_AMOUNT_LABEL, previousAmountHeader: FLOW_STATEMENT_COMPARATIVE_AMOUNT_LABEL, currentMonthAmountHeader: FLOW_STATEMENT_CURRENT_MONTH_AMOUNT_LABEL, detailMode: "none", detailKeyPrefix: "cashflow", ...lineProps }) },
              },
            ],
          })] : []),
  ]) as BodySurfaceSectionSpec[];
  return (
    <PageSurface kind="standard"
      tabbar={navigation}
      toolbar={{ items: toolbarItems }}
      body={reportBlocks.length > 0 ? createPageBody(reportBlocks) : undefined}
    />
  );
}
