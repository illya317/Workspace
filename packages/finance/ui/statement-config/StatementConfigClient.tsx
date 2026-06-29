"use client";

import { useEffect, useMemo, useState } from "react";
import { PageSurface, createPageBody, createPageTabsNavigation } from "@workspace/core/ui";
import type { BodySurfaceSectionSpec, PageSurfaceNavigationSpec } from "@workspace/core/ui";
import { useLineConfigSections } from "./LineConfigTab";
import { useUnmappedSections } from "./UnmappedTab";
import { useBalanceCheckSections } from "./BalanceCheckTab";
import { StatementConfigProvider, useStatementConfig } from "./StatementConfigContext";
import type { SurfaceToolbarItems } from "@workspace/core/ui";
import { useCompanyOptions } from "@workspace/platform/hooks";
import type { SessionUser } from "@workspace/platform/types";
import { getFinanceLifecycleBlocks, getFinancePageViewTabs } from "../components/finance-page-spec";

function useStatementConfigToolbarItems() {
  const { company, setCompany, year, setYear, availablePairs, loading } = useStatementConfig();
  const years = [...new Set(availablePairs.map((p) => p.year))].sort((a, b) => b - a).map(String);
  const companyOptions = useCompanyOptions();
  const toolbarItems: SurfaceToolbarItems = [
    {
      kind: "select",
      key: "company",
      section: "filter",
      label: "公司",
      options: companyOptions,
      value: company,
      onChange: setCompany,
      placeholder: "—",
    },
    {
      kind: "select",
      key: "year",
      section: "filter",
      label: "年度",
      options: years.map((y) => ({ value: y, label: y })),
      value: year,
      onChange: setYear,
      placeholder: "—",
    },
    {
      kind: "text",
      key: "loading-meta",
      section: "meta",
      content: (
        <span className="whitespace-nowrap text-sm text-slate-400">
          {loading ? "加载可用期间…" : `全部 tab 共享，已加载 ${availablePairs.length} 个（公司、年度）组合`}
        </span>
      ),
    },
  ];

  return toolbarItems;
}

function TabContent({ user }: { user: SessionUser }) {
  const activeChildTabs = useMemo(() => getFinancePageViewTabs("statementConfig", user), [user]);
  const [activeChild, setActiveChild] = useState(activeChildTabs[0]?.key ?? "lines");
  useEffect(() => {
    setActiveChild(activeChildTabs[0]?.key ?? "lines");
  }, [activeChildTabs]);
  const activeTab = activeChild;
  const navigation = activeChildTabs.length > 1 ? createPageTabsNavigation({
    items: activeChildTabs,
    active: activeChild,
    onChange: setActiveChild,
  }) : undefined;
  const lifecycleBlocks = getFinanceLifecycleBlocks("statementConfig");
  const toolbarItems = useStatementConfigToolbarItems();
  const pageProps = { navigation, toolbarItems, lifecycleBlocks };
  if (activeTab === "unmapped") return <StatementConfigUnmappedPage {...pageProps} />;
  if (activeTab === "balance") return <StatementConfigBalancePage {...pageProps} />;
  return <StatementConfigLinesPage {...pageProps} />;
}

type StatementConfigPageProps = {
  navigation?: PageSurfaceNavigationSpec;
  toolbarItems: SurfaceToolbarItems;
  lifecycleBlocks: BodySurfaceSectionSpec[];
};

function StatementConfigLinesPage(props: StatementConfigPageProps) {
  const sections = useLineConfigSections();
  return <StatementConfigPageSurface {...props} sections={sections} />;
}

function StatementConfigUnmappedPage(props: StatementConfigPageProps) {
  const sections = useUnmappedSections();
  return <StatementConfigPageSurface {...props} sections={sections} />;
}

function StatementConfigBalancePage({
  navigation,
  toolbarItems,
  lifecycleBlocks,
}: StatementConfigPageProps) {
  const balance = useBalanceCheckSections();
  return (
    <StatementConfigPageSurface
      navigation={navigation}
      toolbarItems={[...toolbarItems, ...balance.toolbarItems]}
      lifecycleBlocks={lifecycleBlocks}
      sections={balance.sections}
    />
  );
}

function StatementConfigPageSurface({
  navigation,
  toolbarItems,
  lifecycleBlocks,
  sections,
}: {
  navigation?: PageSurfaceNavigationSpec;
  toolbarItems: SurfaceToolbarItems;
  lifecycleBlocks: BodySurfaceSectionSpec[];
  sections: BodySurfaceSectionSpec[];
}) {
  return (
    <PageSurface
      kind="standard"
      navigation={navigation}
      toolbar={{ items: toolbarItems }}
      body={createPageBody([...lifecycleBlocks, ...sections])}
    />
  );
}

export default function StatementConfigClient({ user }: { user: SessionUser }) {
  return (
    <StatementConfigProvider>
      <TabContent user={user} />
    </StatementConfigProvider>
  );
}
