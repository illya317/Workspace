"use client";

import { useEffect, useMemo, useState } from "react";
import { createPageBody, PageSurface, createPageDataBlock, createPageTabsNavigation } from "@workspace/core/ui";
import type { PageSurfaceBlockSpec, PageSurfaceNavigationSpec } from "@workspace/core/ui";
import type { SessionUser } from "@workspace/platform/types";
import { getFinanceLifecycleBlocks, getFinancePageViewTabs } from "../components/finance-page-spec";
import AccountTab from "./AccountTab";
import VoucherTab from "./VoucherTab";
import LedgerTab from "./LedgerTab";
import ReclassTab from "./ReclassTab";

export default function LedgerClient({ canWrite, user }: { canWrite: boolean; user: SessionUser }) {
  const activeChildTabs = useMemo(() => getFinancePageViewTabs("ledger", user), [user]);
  const [activeChild, setActiveChild] = useState(activeChildTabs[0]?.key ?? "accounts");
  useEffect(() => {
    setActiveChild(activeChildTabs[0]?.key ?? "accounts");
  }, [activeChildTabs]);
  const activeTab = activeChild;
  const navigation = activeChildTabs.length > 1 ? createPageTabsNavigation({
    level: 2,
    items: activeChildTabs,
    active: activeChild,
    onChange: setActiveChild,
  }) : undefined;
  const lifecycleBlocks = getFinanceLifecycleBlocks("ledger");
  const pageChrome = { navigation, lifecycleBlocks };

  return (
    <>
      {activeTab === "accounts" && <AccountTab canWrite={canWrite} {...pageChrome} />}
      {activeTab === "vouchers" && <VoucherTab canWrite={canWrite} {...pageChrome} />}
      {activeTab === "ledger" && <LedgerTab {...pageChrome} />}
      {activeTab === "reclass" && <ReclassTab {...pageChrome} />}
      {activeTab === "depreciation" && <DepreciationPlaceholder {...pageChrome} />}
    </>
  );
}

function DepreciationPlaceholder({
  navigation,
  lifecycleBlocks = [],
}: {
  navigation?: PageSurfaceNavigationSpec;
  lifecycleBlocks?: PageSurfaceBlockSpec[];
}) {
  return (
    <PageSurface
      kind="list"
      navigation={navigation}
      body={createPageBody([
        ...lifecycleBlocks,
        createPageDataBlock("depreciation-placeholder", { kind: "records", records: [], empty: "资产折旧表开发中" }),
      ])}
    />
  );
}
