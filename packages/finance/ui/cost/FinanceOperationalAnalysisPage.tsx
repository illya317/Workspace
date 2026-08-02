"use client";

import { workspacePath } from "@workspace/core/routing";
import { createPageTabBar, PageSurface } from "@workspace/core/ui";
import type { OperationalAnalysisScopeType } from "@workspace/finance/types";

import { useOperationalAnalysisPage } from "./operational-analysis/OperationalAnalysisWorkspace";

export default function FinanceOperationalAnalysisPage({
  scopeType,
  scopeId,
  departmentHomeHref,
}: {
  scopeType: OperationalAnalysisScopeType;
  scopeId: number;
  departmentHomeHref?: string;
}) {
  const page = useOperationalAnalysisPage(scopeType, scopeId);
  const tabbar = departmentHomeHref
    ? createPageTabBar({
        items: [
          { key: "overview", label: "部门总览" },
          { key: "analysis", label: "经营分析" },
        ],
        active: "analysis",
        onChange: (key) => {
          if (key === "overview") window.location.assign(workspacePath(departmentHomeHref));
        },
        variant: "large",
        ariaLabel: "部门主页视图",
      })
    : undefined;
  return (
    <PageSurface
      kind="standard"
      create={page.create}
      tabbar={tabbar}
      toolbar={{ items: page.toolbarItems, assistant: false }}
      body={page.body}
      footer={page.footer}
    />
  );
}
