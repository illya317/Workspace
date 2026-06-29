"use client";

import { workspacePath } from "@workspace/core/routing";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createPageBody, createSectionsSection, createMessageSection, createPanelSection, PageSurface } from "@workspace/core/ui";
import type { PageSurfaceSectionSpec, SurfaceToolbarItems } from "@workspace/core/ui";
import { useCompanyOptions } from "@workspace/platform/hooks";
import { createReportBannerSection } from "./ReportBanner";
import { createReportLinesSurface, type AccountDetail, type ReportLine } from "./ReportLines";
import { formatFinanceAmount } from "../formatters";
import { REPORT_TYPE_OPTIONS } from "./report-options";
const REPORT_TYPES = new Set(["balance", "income", "cashflow"]);
const YEAR_OPTIONS = [2024, 2025, 2026].map((year) => ({
  value: String(year),
  label: String(year),
}));
const MONTH_OPTIONS = Array.from({ length: 12 }, (_, index) => ({
  value: String(index + 1),
  label: `${index + 1}月`,
}));
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
  lines?: ReportLine[];
  source?: "review" | "empty" | "stale";
  diagnostics?: {
    type: string;
    message: string;
  }[];
}
export default function ReportTab() {
  const searchParams = useSearchParams();
  const companyOptions = useCompanyOptions();
  const rtFromQuery = searchParams.get("reportType");
  const [companyFilter, setCompanyFilter] = useState(searchParams.get("companyCode") || "02");
  const [yearFilter, setYearFilter] = useState(searchParams.get("year") || "2025");
  const [monthFilter, setMonthFilter] = useState(searchParams.get("month") || "12");
  const [reportType, setReportType] = useState<"balance" | "income" | "cashflow">(rtFromQuery && REPORT_TYPES.has(rtFromQuery) ? rtFromQuery as "balance" | "income" | "cashflow" : "balance");
  const [_periods, setPeriods] = useState<Period[]>([]);
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [expandedCodes, setExpandedCodes] = useState<Set<string>>(new Set());
  const [details, setDetails] = useState<Record<string, AccountDetail[]>>({});
  const [loadingDetail, setLoadingDetail] = useState<string | null>(null);
  const loadReport = useCallback(async () => {
    if (!companyFilter || !yearFilter || !monthFilter) return;
    setLoading(true);
    setExpandedCodes(new Set());
    setDetails({});
    const res = await fetch(workspacePath(`/api/modules/finance/statements/reports?companyCode=${companyFilter}&year=${yearFilter}&month=${monthFilter}&type=${reportType}`));
    if (res.ok) setData(await res.json());
    setLoading(false);
  }, [companyFilter, monthFilter, reportType, yearFilter]);
  useEffect(() => {
    fetch(workspacePath("/api/modules/finance/ledger/periods")).then(response => response.json()).then(result => {
      setPeriods(result.periods || []);
    });
    void loadReport();
  }, [loadReport]);
  const toggleDetail = useCallback(async (code: string) => {
    if (!code) return;
    const newSet = new Set(expandedCodes);
    if (newSet.has(code)) {
      newSet.delete(code);
      setExpandedCodes(newSet);
      return;
    }
    newSet.add(code);
    setExpandedCodes(newSet);
    if (!details[code]) {
      setLoadingDetail(code);
      try {
        const res = await fetch(workspacePath(`/api/modules/finance/statements/reports/detail?companyCode=${companyFilter}&year=${yearFilter}&month=${monthFilter}&codes=${encodeURIComponent(code)}`));
        if (res.ok) {
          const result = await res.json();
          setDetails(prev => ({
            ...prev,
            [code]: result.details || []
          }));
        }
      } finally {
        setLoadingDetail(null);
      }
    }
  }, [companyFilter, details, expandedCodes, monthFilter, yearFilter]);
  const lineProps = {
    expandedCodes,
    details,
    loadingDetail,
    onToggle: toggleDetail
  };
  const toolbarItems: SurfaceToolbarItems = [
    {
      kind: "select",
      key: "company",
      section: "filter",
      label: "公司",
      options: companyOptions,
      value: companyFilter,
      onChange: setCompanyFilter,
      placeholder: "全部",
    },
    {
      kind: "select",
      key: "year",
      section: "filter",
      label: "年度",
      options: YEAR_OPTIONS,
      value: yearFilter,
      onChange: setYearFilter,
      placeholder: "全部",
    },
    {
      kind: "select",
      key: "month",
      section: "filter",
      label: "月份",
      options: MONTH_OPTIONS,
      value: monthFilter,
      onChange: setMonthFilter,
      placeholder: "全部",
    },
    {
      kind: "select",
      key: "report",
      section: "filter",
      label: "报表",
      options: REPORT_TYPE_OPTIONS,
      value: reportType,
      onChange: (nextValue) => setReportType(nextValue as "balance" | "income" | "cashflow"),
    },
    {
      kind: "action-group",
      key: "report-actions",
      section: "action",
      actions: [
        { key: "load", label: "生成报表", kind: "generate", variant: "primary", onClick: loadReport },
      ],
    },
  ];
  const reportBlocks = ([
    ...(loading ? [{
      kind: "message" as const,
      key: "loading",
      tone: "muted" as const,
      align: "center",
      content: "加载中...",
    }] : []),
    ...(data?.type === "balance" ? [createPanelSection("balance-report", {
            title: "资 产 负 债 表",
            subtitle: `${data.period.year}年${data.period.month}月`,
            sections: [
              createSectionsSection("balance-lines", {
                layout: "grid",

                sections: [
                  {
                    key: "assets",
                    body: { kind: "data", data: {
                      ...createReportLinesSurface({ items: data.assets || [], labelHeader: "资 产", amountHeader: "年末余额", ...lineProps }),
                      frame: "bordered",
                    } },
                  },
                  createSectionsSection("liability-equity", {
                    layout: "stack",

                    sections: [
                      {
                        key: "liabilities",
                        body: { kind: "data", data: createReportLinesSurface({ items: data.liabilities || [], labelHeader: "负债", amountHeader: "年末余额", ...lineProps }) },
                      },
                      {
                        key: "equity",
                        body: { kind: "data", data: createReportLinesSurface({ items: data.equity || [], labelHeader: "所有者权益", amountHeader: "年末余额", ...lineProps }) },
                      },
                    ],
                  }),
                ],
              }),
              ...(data.totalLiabilitiesAndEquity !== undefined ? [createMessageSection("balance-check", {
                tone: "muted" as const,

                content: <>
                  资产总计 = {formatFinanceAmount(data.assets?.find(item => item.isGrandTotal)?.amount || 0)} | 负债和权益总计 = {formatFinanceAmount(data.totalLiabilitiesAndEquity)}
                  {Math.abs((data.assets?.find(item => item.isGrandTotal)?.amount || 0) - data.totalLiabilitiesAndEquity) > 0.01 && <span className="ml-2 text-red-500">不平衡</span>}
                </>,
              })] : []),
            ],
          })] : []),
    ...(data?.type === "income" ? [createPanelSection("income-report", {
            title: "利 润 表",
            subtitle: `${data.period.year}年${data.period.month}月`,
            sections: [
              ...(() => {
                const block = createReportBannerSection("income-banner", { source: data.source, diagnostics: data.diagnostics, reviewHref: `/finance/statement-review?companyCode=${data.period.companyCode || ""}&year=${data.period.year}&month=${data.period.month}&reportType=incomeStatement` });
                return block ? [block] : [];
              })(),
              {
                key: "income-lines",
                body: { kind: "data", data: createReportLinesSurface({ items: data.lines || [], labelHeader: "项 目", amountHeader: "本年金额", ...lineProps }) },
              },
            ],
          })] : []),
    ...(data?.type === "cashflow" ? [createPanelSection("cashflow-report", {
            title: "现 金 流 量 表",
            subtitle: `${data.period.year}年${data.period.month}月`,
            sections: [
              ...(() => {
                const block = createReportBannerSection("cashflow-banner", { source: data.source, diagnostics: data.diagnostics, reviewHref: `/finance/statement-review?companyCode=${data.period.companyCode || ""}&year=${data.period.year}&month=${data.period.month}&reportType=cashFlow` });
                return block ? [block] : [];
              })(),
              {
                key: "cashflow-lines",
                body: { kind: "data", data: createReportLinesSurface({ items: data.lines || [], labelHeader: "项 目", amountHeader: "金额", ...lineProps }) },
              },
            ],
          })] : []),
  ]) as PageSurfaceSectionSpec[];
  return (
    <PageSurface kind="standard"
      toolbar={{ items: toolbarItems }}
      body={reportBlocks.length > 0 ? createPageBody(reportBlocks) : undefined}
    />
  );
}
