"use client";

import { useEffect, useMemo, useState } from "react";
import { PageSurface, createPageBody, createPageTabBar } from "@workspace/core/ui";
import type { BodySurfaceModalSpec, BodySurfaceSectionSpec, PageSurfaceFooterSpec, PageSurfaceTabBarSpec, SurfaceToolbarItems } from "@workspace/core/ui";
import { SessionUser } from "@workspace/platform/types";
import { getFinanceLifecycleBlocks, getFinancePageViewTabs } from "../components/finance-page-spec";
import { useCostFilterToolbarItems, useShipmentToolbarItems } from "./components/CostFilters";
import { useShipmentSurface } from "./components/ShipmentTable";
import { useCostAnalysisSurface } from "./components/CostAnalysisTable";
import { useCostStructureSurface } from "./components/CostStructureTable";
import { createDefaultShipmentWorkspaceState, type CostFiltersState, type CostTab, type ShipmentWorkspaceState } from "./types";

export default function FinanceCostClient({ user: _user }: { user: SessionUser; canDelete: boolean }) {
  const activeChildTabs = useMemo(() => getFinancePageViewTabs("cost", _user), [_user]);
  const [activeChild, setActiveChild] = useState(activeChildTabs[0]?.key ?? "shipments");
  const [activeNestedChild, setActiveNestedChild] = useState(activeChildTabs[0]?.children?.[0]?.key ?? "");
  useEffect(() => {
    setActiveChild(activeChildTabs[0]?.key ?? "shipments");
    setActiveNestedChild(activeChildTabs[0]?.children?.[0]?.key ?? "");
  }, [activeChildTabs]);
  const activeTabDefinition = activeChildTabs.find((item) => item.key === activeChild);
  const navigation = activeChildTabs.length > 1 ? createPageTabBar({
    items: activeChildTabs,
    active: activeChild,
    activeChild: activeTabDefinition?.children?.length ? activeNestedChild : undefined,
    onChange: (key) => {
      setActiveChild(key);
      const children = activeChildTabs.find((item) => item.key === key)?.children ?? [];
      if (children.length > 0 && !children.some((child) => child.key === activeNestedChild)) {
        setActiveNestedChild(children[0]?.key ?? "");
      }
    },
    onChildChange: setActiveNestedChild,
  }) : undefined;
  const lifecycleBlocks = getFinanceLifecycleBlocks("cost");
  const tab = (activeChild ?? "shipments") as CostTab;
  const [filters, setFilters] = useState<CostFiltersState>({
    year: undefined,
    month: undefined,
    productName: "",
    customerName: "",
  });
  const [shipmentView, setShipmentView] = useState<ShipmentWorkspaceState>(() => createDefaultShipmentWorkspaceState());
  const costToolbarItems = useCostFilterToolbarItems({ filters, onChange: setFilters });
  const shipmentToolbarItems = useShipmentToolbarItems({ value: shipmentView, onChange: setShipmentView });
  const toolbarItems = tab === "shipments" ? shipmentToolbarItems : costToolbarItems;
  const pageChrome = { navigation, toolbarItems, lifecycleBlocks };
  const pageProps = { ...pageChrome, filters };

  if (tab === "shipments") {
    return <ShipmentCostPage {...pageChrome} shipmentView={shipmentView} onShipmentViewChange={setShipmentView} />;
  }
  if (tab === "cost-analysis") return <CostAnalysisPage {...pageProps} />;
  if (tab === "cost-structure") return <CostStructurePage {...pageProps} />;
  return <ShipmentCostPage {...pageChrome} shipmentView={shipmentView} onShipmentViewChange={setShipmentView} />;
}

type CostPageChromeProps = {
  navigation?: PageSurfaceTabBarSpec;
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
      tabbar={navigation}
      toolbar={{ items: toolbarItems }}
      body={createPageBody([...lifecycleBlocks, ...sections, ...modals])}
      footer={footer}
    />
  );
}

function ShipmentCostPage(props: Omit<CostPageChromeProps, "filters"> & {
  shipmentView: ShipmentWorkspaceState;
  onShipmentViewChange: (view: ShipmentWorkspaceState) => void;
}) {
  const surface = useShipmentSurface(props.shipmentView, props.onShipmentViewChange);
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
