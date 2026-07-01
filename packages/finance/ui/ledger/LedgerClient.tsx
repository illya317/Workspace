"use client";

import { useEffect, useMemo, useState } from "react";
import { createPageBody, PageSurface, createStatusSection, createPageTabsNavigation } from "@workspace/core/ui";
import type { BodySurfaceSectionSpec, PageSurfaceNavigationSpec } from "@workspace/core/ui";
import type { SessionUser } from "@workspace/platform/types";
import { getFinanceLifecycleBlocks, getFinancePageViewTabs } from "../components/finance-page-spec";
import AccountTab from "./AccountTab";
import VoucherTab from "./VoucherTab";
import LedgerTab from "./LedgerTab";
import ReclassTab from "./ReclassTab";

export default function LedgerClient({
  canWrite,
  canDelete,
  canRevise,
  canImport,
  canExport,
  user,
}: {
  canWrite: boolean;
  canDelete: boolean;
  canRevise: boolean;
  canImport: boolean;
  canExport: boolean;
  user: SessionUser;
}) {
  const activeChildTabs = useMemo(() => getFinancePageViewTabs("ledger", user), [user]);
  const [activeChild, setActiveChild] = useState(activeChildTabs[0]?.key ?? "accounts");
  useEffect(() => {
    setActiveChild(activeChildTabs[0]?.key ?? "accounts");
  }, [activeChildTabs]);
  const activeTab = activeChild;
  const navigation = activeChildTabs.length > 1 ? createPageTabsNavigation({
    items: activeChildTabs,
    active: activeChild,
    onChange: setActiveChild,
  }) : undefined;
  const lifecycleBlocks = getFinanceLifecycleBlocks("ledger");
  const pageChrome = { navigation, lifecycleBlocks };

  return (
    <>
      {activeTab === "accounts" && <AccountTab canWrite={canWrite} canDelete={canDelete} canRevise={canRevise} {...pageChrome} />}
      {activeTab === "vouchers" && <VoucherTab canRevise={canRevise} {...pageChrome} />}
      {activeTab === "ledger" && <LedgerTab canImport={canImport} {...pageChrome} />}
      {activeTab === "reclass" && <ReclassTab canExport={canExport} {...pageChrome} />}
      {activeTab === "depreciation" && <DepreciationPlaceholder {...pageChrome} />}
    </>
  );
}

function DepreciationPlaceholder({
  navigation,
  lifecycleBlocks = [],
}: {
  navigation?: PageSurfaceNavigationSpec;
  lifecycleBlocks?: BodySurfaceSectionSpec[];
}) {
  return (
    <PageSurface kind="standard"
      navigation={navigation}
      body={createPageBody([
        ...lifecycleBlocks,
        createStatusSection("depreciation-placeholder", { kind: "empty", content: "资产折旧表开发中" }),
      ])}
    />
  );
}
