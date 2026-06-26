"use client";

import { workspacePath } from "@workspace/core/routing";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { FormSurface, PageSurface } from "@workspace/core/ui";
import FinanceFilters from "../components/FinanceFilters";
import ReportBanner from "./ReportBanner";
import ReportLines, { type AccountDetail, type ReportLine } from "./ReportLines";
import { formatFinanceAmount } from "../formatters";
const REPORT_TYPES = new Set(["balance", "income", "cashflow"]);
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
  return <div className="space-y-4">
      <FinanceFilters companyFilter={companyFilter} yearFilter={yearFilter} monthFilter={monthFilter} onCompanyChange={setCompanyFilter} onYearChange={setYearFilter} onMonthChange={setMonthFilter} showPageSize={false} />
      <FormSurface
        kind="filters"
        fields={[{
          key: "report",
          label: "报表",
          spec: {
              valueType: "string",
              editor: "select",
              options: {
                source: "static",
                mode: "dropdown",
                items: [
                  { value: "balance", label: "资产负债表" },
                  { value: "income", label: "利润表" },
                  { value: "cashflow", label: "现金流量表" },
                ],
              },
          },
          value: reportType,
          onChange: (nextValue) => setReportType(nextValue as "balance" | "income" | "cashflow"),
        }]}
        actions={[{ key: "load", label: "生成报表", variant: "primary", onClick: loadReport }]}
      />

      {loading && <p className="p-8 text-center text-gray-500">加载中...</p>}

      {data?.type === "balance" && <PageSurface
          kind="analysis"
          embedded
          blocks={[{
            kind: "panel",
            key: "balance-report",
            title: "资 产 负 债 表",
            subtitle: `${data.period.year}年${data.period.month}月`,
            blocks: [{
              kind: "moduleView",
              key: "balance-lines",
              view: <>
                <div className="grid grid-cols-2 gap-0">
                  <div className="border-r border-gray-200 pr-4">
                    <ReportLines items={data.assets || []} labelHeader="资 产" amountHeader="年末余额" {...lineProps} />
                  </div>
                  <div className="pl-4">
                    <div className="space-y-4">
                      <ReportLines items={data.liabilities || []} labelHeader="负债" amountHeader="年末余额" {...lineProps} />
                      <ReportLines items={data.equity || []} labelHeader="所有者权益" amountHeader="年末余额" {...lineProps} />
                    </div>
                  </div>
                </div>
                {data.totalLiabilitiesAndEquity !== undefined && <p className="mt-2 text-center text-xs text-gray-400">
                    资产总计 = {formatFinanceAmount(data.assets?.find(item => item.isGrandTotal)?.amount || 0)} | 负债和权益总计 = {formatFinanceAmount(data.totalLiabilitiesAndEquity)}
                    {Math.abs((data.assets?.find(item => item.isGrandTotal)?.amount || 0) - data.totalLiabilitiesAndEquity) > 0.01 && <span className="ml-2 text-red-500">不平衡</span>}
                  </p>}
              </>,
            }],
          }]}
        />}

      {data?.type === "income" && <PageSurface
          kind="analysis"
          embedded
          blocks={[{
            kind: "panel",
            key: "income-report",
            title: "利 润 表",
            subtitle: `${data.period.year}年${data.period.month}月`,
            blocks: [{
              kind: "moduleView",
              key: "income-lines",
              view: <>
                <ReportBanner source={data.source} diagnostics={data.diagnostics} reviewHref={`/finance/statement-review?companyCode=${data.period.companyCode || ""}&year=${data.period.year}&month=${data.period.month}&reportType=incomeStatement`} />
                <ReportLines items={data.lines || []} labelHeader="项 目" amountHeader="本年金额" {...lineProps} />
              </>,
            }],
          }]}
        />}

      {data?.type === "cashflow" && <PageSurface
          kind="analysis"
          embedded
          blocks={[{
            kind: "panel",
            key: "cashflow-report",
            title: "现 金 流 量 表",
            subtitle: `${data.period.year}年${data.period.month}月`,
            blocks: [{
              kind: "moduleView",
              key: "cashflow-lines",
              view: <>
                <ReportBanner source={data.source} diagnostics={data.diagnostics} reviewHref={`/finance/statement-review?companyCode=${data.period.companyCode || ""}&year=${data.period.year}&month=${data.period.month}&reportType=cashFlow`} />
                <ReportLines items={data.lines || []} labelHeader="项 目" amountHeader="金额" {...lineProps} />
              </>,
            }],
          }]}
        />}
    </div>;
}
