"use client";

import { workspacePath } from "@workspace/core/routing";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createPageBody, createMessageSection, createPanelSection, createSectionsSection, PageSurface } from "@workspace/core/ui";
import type { BodySurfaceSectionSpec, PageSurfaceTabBarSpec, SurfaceToolbarItems } from "@workspace/core/ui";
import { useCompanyOptions } from "@workspace/platform/hooks";
import { createReportBannerSection } from "./ReportBanner";
import { createReportLinesSurface, type AccountDetail, type ReportLine } from "./ReportLines";
import { formatFinanceAmount } from "../formatters";
import { useStatementScope } from "./useStatementScope";
import { REPORT_TYPE_OPTIONS } from "./report-options";
const REPORT_TYPES = new Set(["balance", "income", "cashflow"]);
const MONTH_OPTIONS = Array.from({ length: 12 }, (_, index) => ({
  value: String(index + 1),
  label: `${index + 1}月`,
}));

function balanceCheck(label: string, assets: number, liabilitiesAndEquity: number) {
  const gap = Math.round((assets - liabilitiesAndEquity) * 100) / 100;
  return `${label}：资产总计 ${formatFinanceAmount(assets)} | 负债和权益总计 ${formatFinanceAmount(liabilitiesAndEquity)} | ${gap === 0 ? "平衡" : `不平衡 ${formatFinanceAmount(Math.abs(gap))}`}`;
}
interface Period {
  id: number;
  year: number;
  month: number;
  companyCode?: string | null;
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
  source?: "system" | "workpaper" | "empty";
  diagnostics?: {
    type: string;
    message: string;
  }[];
}
export default function ReportTab({ navigation, companyCodes }: { navigation?: PageSurfaceTabBarSpec; companyCodes?: string[] }) {
  const searchParams = useSearchParams();
  const allCompanyOptions = useCompanyOptions();
  const companyOptions = useMemo(() => {
    if (!companyCodes) return allCompanyOptions;
    const allowed = new Set(companyCodes);
    return allCompanyOptions.filter((option) => allowed.has(option.value));
  }, [allCompanyOptions, companyCodes]);
  const { company: companyFilter, setCompany: setCompanyFilter, year, setYear, availablePairs } = useStatementScope(companyCodes);
  const yearOptions = useMemo(
    () => [...new Set(availablePairs.map((pair) => pair.year))].sort((a, b) => b - a).map((optionYear) => ({ value: String(optionYear), label: String(optionYear) })),
    [availablePairs],
  );
  const rtFromQuery = searchParams.get("reportType");
  const [monthFilter, setMonthFilter] = useState(searchParams.get("month") || "12");
  const [reportType, setReportType] = useState<"balance" | "income" | "cashflow">(rtFromQuery && REPORT_TYPES.has(rtFromQuery) ? rtFromQuery as "balance" | "income" | "cashflow" : "balance");
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [expandedCodes, setExpandedCodes] = useState<Set<string>>(new Set());
  const [details, setDetails] = useState<Record<string, AccountDetail[]>>({});
  const [loadingDetail, setLoadingDetail] = useState<string | null>(null);
  const loadReport = useCallback(async () => {
    if (!companyFilter || !year || !monthFilter) return;
    setLoading(true);
    setExpandedCodes(new Set());
    setDetails({});
    const res = await fetch(workspacePath(`/api/modules/finance/statements/reports?companyCode=${companyFilter}&year=${year}&month=${monthFilter}&type=${reportType}`));
    if (res.ok) setData(await res.json());
    setLoading(false);
  }, [companyFilter, monthFilter, reportType, year]);
  useEffect(() => {
    void loadReport();
  }, [loadReport]);
  const toggleDetail = useCallback(async (key: string, code: string) => {
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
      const res = await fetch(workspacePath(`/api/modules/finance/statements/reports/detail?companyCode=${companyFilter}&year=${year}&month=${monthFilter}&codes=${encodeURIComponent(code)}`));
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
  }, [companyFilter, details, expandedCodes, monthFilter, year]);
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
      label: "负债和所有者权益（或股东权益）总计",
      amount: data.totalLiabilitiesAndEquity || 0,
      previousAmount: data.previousTotalLiabilitiesAndEquity,
      isGrandTotal: true,
    },
  ] : [];
  const assetGrandTotal = data?.assets?.find((item) => item.isGrandTotal);
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
    {
      kind: "select",
      key: "year",
      label: "年度",
      options: yearOptions,
      value: String(year),
      onChange: (value) => setYear(Number(value)),
      placeholder: "全部",
    },
    {
      kind: "select",
      key: "month",
      label: "月份",
      options: MONTH_OPTIONS,
      value: monthFilter,
      onChange: setMonthFilter,
      placeholder: "全部",
    },
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
            title: "资 产 负 债 表",
            sections: [
              createMessageSection("balance-meta", {
                tone: "muted" as const,
                content: `编制单位：${companyOptions.find((option) => option.value === companyFilter)?.label || companyFilter}　${year}年${monthFilter}月31日　单位：元`,
              }),
              createSectionsSection("balance-columns", {
                layout: "grid",
                gridColumns: 2,
                sections: [
                  {
                    key: "asset-lines",
                    framed: false,
                    body: { kind: "data", data: {
                      ...createReportLinesSurface({
                        items: data.assets || [],
                        labelHeader: "资产",
                        previousAmountHeader: "期初余额",
                        amountHeader: "期末余额",
                        detailKeyPrefix: "assets",
                        ...lineProps,
                      }),
                    } },
                  },
                  {
                    key: "liability-equity-lines",
                    framed: false,
                    body: { kind: "data", data: {
                      ...createReportLinesSurface({
                        items: liabilityEquityLines,
                        labelHeader: "负债和所有者权益（或股东权益）",
                        previousAmountHeader: "期初余额",
                        amountHeader: "期末余额",
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
                  balanceCheck("期初", assetGrandTotal?.previousAmount || 0, data.previousTotalLiabilitiesAndEquity || 0),
                  balanceCheck("期末", assetGrandTotal?.amount || 0, data.totalLiabilitiesAndEquity),
                ].join("　"),
              })] : []),
            ],
          })] : []),
    ...(data?.type === "income" ? [createPanelSection("income-report", {
            title: "利 润 表",
            sections: [
              ...(() => {
                const block = createReportBannerSection("income-banner", { source: data.source, diagnostics: data.diagnostics });
                return block ? [block] : [];
              })(),
              {
                key: "income-lines",
                body: { kind: "data", data: createReportLinesSurface({ items: data.lines || [], labelHeader: "项 目", previousAmountHeader: `${year - 1}年金额`, amountHeader: `${year}年金额`, detailKeyPrefix: "income", ...lineProps }) },
              },
            ],
          })] : []),
    ...(data?.type === "cashflow" ? [createPanelSection("cashflow-report", {
            title: "现 金 流 量 表",
            sections: [
              ...(() => {
                const block = createReportBannerSection("cashflow-banner", { source: data.source, diagnostics: data.diagnostics });
                return block ? [block] : [];
              })(),
              {
                key: "cashflow-lines",
                body: { kind: "data", data: createReportLinesSurface({ items: data.lines || [], labelHeader: "项 目", previousAmountHeader: `${year - 1}年金额`, amountHeader: `${year}年金额`, detailKeyPrefix: "cashflow", ...lineProps }) },
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
