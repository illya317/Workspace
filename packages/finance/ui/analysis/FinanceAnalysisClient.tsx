"use client";

import { workspacePath } from "@workspace/core/routing";
import { useMemo, useState, useEffect } from "react";
import { PageSurface, createPageBody, createRecordSection, createMetricsSection, createPageTabsNavigation } from "@workspace/core/ui";
import type { PageSurfaceSectionSpec } from "@workspace/core/ui";
import type { SessionUser } from "@workspace/platform/types";
import { getFinanceLifecycleBlocks, getFinancePageViewTabs } from "../components/finance-page-spec";

interface BudgetOverview {
  hasBudget: boolean;
  version?: { name: string; status: string };
  deptTotal?: number;
  rdTotal?: number;
}

interface Props {
  user: SessionUser;
}

export default function FinanceAnalysisClient({ user: _user }: Props) {
  const [budget, setBudget] = useState<BudgetOverview | null>(null);
  const activeChildTabs = useMemo(() => getFinancePageViewTabs("analysis", _user), [_user]);
  const navigation = activeChildTabs.length > 1 ? createPageTabsNavigation({
    items: activeChildTabs,
    active: activeChildTabs[0]?.key ?? "",
    onChange: () => {},
  }) : undefined;
  const lifecycleBlocks = getFinanceLifecycleBlocks("analysis");
  const analysisBlocks: PageSurfaceSectionSpec[] = [
    ...lifecycleBlocks,
    createMetricsSection("analysis-metrics", {
      metrics: [
        { key: "revenue", label: "营业收入", value: "-" },
        { key: "gross-margin", label: "毛利率", value: "-" },
        { key: "net-margin", label: "净利率", value: "-" },
      ],
    }),
    budget?.hasBudget
      ? createMetricsSection("budget-overview", {
          metrics: [
            { key: "version", label: "生效版本", value: budget.version?.name ?? "—" },
            { key: "dept-total", label: "部门预算总额", value: (budget.deptTotal ?? 0).toLocaleString("zh-CN", { maximumFractionDigits: 2 }) },
            { key: "rd-total", label: "研发预算总额", value: (budget.rdTotal ?? 0).toLocaleString("zh-CN", { maximumFractionDigits: 2 }) },
          ],
        })
      : createRecordSection("budget-overview", {
          records: [],
          empty: "暂无生效预算版本",
        }),
    createRecordSection("analysis-placeholder", {
      records: [],
      empty: "财务分析看板开发中",
    }),
  ];

  useEffect(() => {
    fetch(workspacePath("/api/modules/finance/analysis/budget?year=2026"))
      .then((response) => response.json())
      .then(setBudget)
      .catch(() => setBudget({ hasBudget: false }));
  }, []);

  return (
    <PageSurface kind="standard"
      navigation={navigation}
      body={createPageBody(analysisBlocks)}
    />
  );
}
