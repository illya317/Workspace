"use client";

import { useEffect, useMemo, useState } from "react";
import { PageSurface, createPageBody, createPageTabsNavigation } from "@workspace/core/ui";
import type { BodySurfaceModalSpec, BodySurfaceSectionSpec, PageSurfaceFooterSpec, PageSurfaceNavigationSpec, SurfaceToolbarItems } from "@workspace/core/ui";
import { SessionUser } from "@workspace/platform/types";
import { getFinanceLifecycleBlocks, getFinancePageViewTabs } from "../components/finance-page-spec";
import { useCostFilterToolbarItems } from "./components/CostFilters";
import { useCostSummarySections } from "./components/CostSummary";
import { useShipmentSurface } from "./components/ShipmentTable";
import { useCostAnalysisSurface } from "./components/CostAnalysisTable";
import { useCostStructureSurface } from "./components/CostStructureTable";
import { useWorkshopReportSurface } from "./components/WorkshopReportTable";
import { useSalesSalarySurface } from "./components/SalesSalaryTable";
import { useImportHistorySurface } from "./components/ImportHistoryTable";
import type { CostFiltersState, CostTab } from "./types";

export default function FinanceCostClient({ user: _user }: { user: SessionUser }) {
  const activeChildTabs = useMemo(() => getFinancePageViewTabs("cost", _user), [_user]);
  const [activeChild, setActiveChild] = useState(activeChildTabs[0]?.key ?? "overview");
  useEffect(() => {
    setActiveChild(activeChildTabs[0]?.key ?? "overview");
  }, [activeChildTabs]);
  const navigation = activeChildTabs.length > 1 ? createPageTabsNavigation({
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
  const pageChrome = { navigation, toolbarItems, lifecycleBlocks };
  const pageProps = { ...pageChrome, filters };

  if (tab === "shipments") return <ShipmentCostPage {...pageProps} />;
  if (tab === "cost-analysis") return <CostAnalysisPage {...pageProps} />;
  if (tab === "cost-structure") return <CostStructurePage {...pageProps} />;
  if (tab === "workshop") return <WorkshopCostPage {...pageProps} />;
  if (tab === "salary") return <SalesSalaryCostPage {...pageProps} />;
  if (tab === "imports") return <ImportHistoryCostPage {...pageProps} />;
  return <OverviewCostPage {...pageChrome} filters={filters} />;
}

type CostPageChromeProps = {
  navigation?: PageSurfaceNavigationSpec;
  toolbarItems: SurfaceToolbarItems;
  lifecycleBlocks: BodySurfaceSectionSpec[];
  filters: CostFiltersState;
};

function CostPageSurface({
  navigation,
  toolbarItems,
  lifecycleBlocks,
  sections,
  footer,
  modals = [],
}: Omit<CostPageChromeProps, "filters"> & {
  sections: BodySurfaceSectionSpec[];
  footer?: PageSurfaceFooterSpec;
  modals?: BodySurfaceModalSpec[];
}) {
  return (
    <PageSurface
      kind="standard"
      navigation={navigation}
      toolbar={{ items: toolbarItems }}
      body={createPageBody([...lifecycleBlocks, ...sections, ...modals])}
      footer={footer}
    />
  );
}

function OverviewCostPage(props: CostPageChromeProps) {
  const sections = useCostSummarySections(props.filters);
  return <CostPageSurface {...props} sections={sections} />;
}

function ShipmentCostPage(props: CostPageChromeProps) {
  const surface = useShipmentSurface(props.filters);
  return <CostPageSurface {...props} {...surface} />;
}

function CostAnalysisPage(props: CostPageChromeProps) {
  const surface = useCostAnalysisSurface(props.filters);
  return <CostPageSurface {...props} {...surface} />;
}

function CostStructurePage(props: CostPageChromeProps) {
  const surface = useCostStructureSurface(props.filters);
  return <CostPageSurface {...props} {...surface} />;
}

function WorkshopCostPage(props: CostPageChromeProps) {
  const surface = useWorkshopReportSurface(props.filters);
  return <CostPageSurface {...props} {...surface} />;
}

function SalesSalaryCostPage(props: CostPageChromeProps) {
  const surface = useSalesSalarySurface(props.filters);
  return <CostPageSurface {...props} {...surface} />;
}

function ImportHistoryCostPage(props: CostPageChromeProps) {
  const surface = useImportHistorySurface(props.filters);
  return <CostPageSurface {...props} {...surface} />;
}
