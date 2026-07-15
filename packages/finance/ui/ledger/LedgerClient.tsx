"use client";

import { useEffect, useMemo, useState } from "react";
import { createPageTabBar } from "@workspace/core/ui";
import type { SessionUser } from "@workspace/platform/types";
import { getFinanceLifecycleBlocks, getFinancePageViewTabs } from "../components/finance-page-spec";
import AccountTab from "./AccountTab";
import VoucherTab from "./VoucherTab";
import LedgerTab from "./LedgerTab";
import ReclassTab from "./ReclassTab";
import AssetScheduleTab from "./AssetScheduleTab";
import type { FinanceLedgerDefaultScope } from "./defaultScope";

export default function LedgerClient({
  canCreate,
  canRevise,
  canExport,
  defaultScope,
  user,
}: {
  canCreate: boolean;
  canRevise: boolean;
  canExport: boolean;
  defaultScope: FinanceLedgerDefaultScope | null;
  user: SessionUser;
}) {
  const activeChildTabs = useMemo(() => getFinancePageViewTabs("ledger", user), [user]);
  const [activeChild, setActiveChild] = useState(activeChildTabs[0]?.key ?? "accounts");
  const [activeNestedChild, setActiveNestedChild] = useState("rules");
  useEffect(() => {
    setActiveChild(activeChildTabs[0]?.key ?? "accounts");
  }, [activeChildTabs]);
  const activeTab = activeChild;
  const activeTabDefinition = activeChildTabs.find((tab) => tab.key === activeTab);
  const navigation = activeChildTabs.length > 1 ? createPageTabBar({
    items: activeChildTabs,
    active: activeChild,
    activeChild: activeTabDefinition?.children?.length ? activeNestedChild : undefined,
    onChange: (key) => {
      setActiveChild(key);
      const children = activeChildTabs.find((tab) => tab.key === key)?.children ?? [];
      if (children.length > 0 && !children.some((child) => child.key === activeNestedChild)) {
        setActiveNestedChild(children[0]?.key ?? "");
      }
    },
    onChildChange: setActiveNestedChild,
  }) : undefined;
  const lifecycleBlocks = getFinanceLifecycleBlocks("ledger");
  const pageChrome = { navigation, lifecycleBlocks };

  return (
    <>
      {activeTab === "accounts" && <AccountTab defaultScope={defaultScope} {...pageChrome} />}
      {activeTab === "vouchers" && <VoucherTab defaultScope={defaultScope} {...pageChrome} />}
      {activeTab === "ledger" && <LedgerTab defaultScope={defaultScope} {...pageChrome} />}
      {activeTab === "reclass" && <ReclassTab canRevise={canRevise} canExport={canExport} defaultScope={defaultScope} {...pageChrome} />}
      {activeTab === "depreciation" && <AssetScheduleTab canCreate={canCreate} canRevise={canRevise} defaultScope={defaultScope} {...pageChrome} />}
    </>
  );
}
