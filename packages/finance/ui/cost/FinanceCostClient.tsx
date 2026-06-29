"use client";

import { useEffect, useMemo, useState } from "react";
import { PageSurface, createBlockSurfaceBlock, createPageTabsNavigation } from "@workspace/core/ui";
import { SessionUser } from "@workspace/platform/types";
import { getFinanceLifecycleBlocks, getFinancePageViewTabs } from "../components/finance-page-spec";
import { useCostFilterToolbarItems } from "./components/CostFilters";
import CostSummary from "./components/CostSummary";
import ShipmentTable from "./components/ShipmentTable";
import CostAnalysisTable from "./components/CostAnalysisTable";
import CostStructureTable from "./components/CostStructureTable";
import WorkshopReportTable from "./components/WorkshopReportTable";
import SalesSalaryTable from "./components/SalesSalaryTable";
import ImportHistoryTable from "./components/ImportHistoryTable";
import type { CostFiltersState, CostTab } from "./types";

export default function FinanceCostClient({ user: _user }: { user: SessionUser }) {
  const activeChildTabs = useMemo(() => getFinancePageViewTabs("cost", _user), [_user]);
  const [activeChild, setActiveChild] = useState(activeChildTabs[0]?.key ?? "overview");
  useEffect(() => {
    setActiveChild(activeChildTabs[0]?.key ?? "overview");
  }, [activeChildTabs]);
  const navigation = activeChildTabs.length > 1 ? createPageTabsNavigation({
    level: 2,
    items: activeChildTabs,
    active: activeChild,
    onChange: setActiveChild,
  }) : undefined;
  const lifecycleBlocks = getFinanceLifecycleBlocks("cost");
  const tab = (activeChild ?? "overview") as CostTab;
  const [filters, setFilters] = useState<CostFiltersState>({
    year: undefined,
    month: undefined,
    productName: "",
    customerName: "",
  });
  const toolbarItems = useCostFilterToolbarItems({ filters, onChange: setFilters });

  return (
    <PageSurface
      kind="list"
      navigation={navigation}
      toolbar={{ items: toolbarItems }}
      body={{
        blocks: [
          ...lifecycleBlocks,
          createBlockSurfaceBlock("finance-cost-content", {
            kind: "content",
            content: (
              <div>
                {tab === "overview" && <CostSummary filters={filters} />}
                {tab === "shipments" && <ShipmentTable filters={filters} />}
                {tab === "cost-analysis" && <CostAnalysisTable filters={filters} />}
                {tab === "cost-structure" && <CostStructureTable filters={filters} />}
                {tab === "workshop" && <WorkshopReportTable filters={filters} />}
                {tab === "salary" && <SalesSalaryTable filters={filters} />}
                {tab === "imports" && <ImportHistoryTable filters={filters} />}
              </div>
            ),
          }),
        ],
      }}
    />
  );
}
