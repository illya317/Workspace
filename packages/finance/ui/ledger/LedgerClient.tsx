"use client";

import { useEffect, useMemo, useState } from "react";
import { createPageTabBar } from "@workspace/core/ui";
import type { SessionUser } from "@workspace/platform/types";
import { getFinanceLifecycleBlocks, getFinancePageViewTabs } from "../components/finance-page-spec";
import AccountTab from "./AccountTab";
import GroupAccountTab from "./GroupAccountTab";
import VoucherTab from "./VoucherTab";
import LedgerTab from "./LedgerTab";
import CounterpartyBalanceTab from "./CounterpartyBalanceTab";
import ReclassTab from "./ReclassTab";
import AssetScheduleTab from "./AssetScheduleTab";
import type { FinanceLedgerDefaultScope } from "./defaultScope";

export default function LedgerClient({
  canCreate,
  canUpdate,
  canDelete,
  canRevise,
  canExport,
  canApproveLedger,
  defaultScope,
  user,
}: {
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  canRevise: boolean;
  canExport: boolean;
  canApproveLedger: boolean;
  defaultScope: FinanceLedgerDefaultScope | null;
  user: SessionUser;
}) {
  const activeChildTabs = useMemo(() => getFinancePageViewTabs("ledger", user), [user]);
  const [activeChild, setActiveChild] = useState(activeChildTabs[0]?.key ?? "accounts");
  const [activeNestedChild, setActiveNestedChild] = useState(activeChildTabs[0]?.children?.[0]?.key ?? "");
  useEffect(() => {
    setActiveChild(activeChildTabs[0]?.key ?? "accounts");
    setActiveNestedChild(activeChildTabs[0]?.children?.[0]?.key ?? "");
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
      {activeTab === "accounts" && activeNestedChild === "group-accounts"
        ? <GroupAccountTab canRevise={canRevise} canDelete={canDelete} canApprove={canApproveLedger} canExport={canExport} {...pageChrome} />
        : activeTab === "accounts"
          ? <AccountTab canRevise={canRevise} canExport={canExport} defaultScope={defaultScope} {...pageChrome} />
          : null}
      {activeTab === "vouchers" && activeNestedChild === "reclassification"
        ? <ReclassTab canExport={canExport} defaultScope={defaultScope} {...pageChrome} />
        : activeTab === "vouchers"
          ? <VoucherTab
              canExport={canExport}
              defaultScope={defaultScope}
              voucherKind={activeNestedChild === "consolidation" ? "group" : "standard"}
              {...pageChrome}
            />
          : null}
      {activeTab === "ledger" && <LedgerTab canExport={canExport} defaultScope={defaultScope} {...pageChrome} />}
      {activeTab === "counterparty" && <CounterpartyBalanceTab canExport={canExport} category={counterpartyCategory(activeNestedChild)} defaultScope={defaultScope} {...pageChrome} />}
      {activeTab === "depreciation" && <AssetScheduleTab canCreate={canCreate} canUpdate={canUpdate} canRevise={canRevise} canExport={canExport} defaultScope={defaultScope} {...pageChrome} />}
    </>
  );
}

function counterpartyCategory(value: string) {
  return value === "ap" || value === "otherAr" || value === "otherAp" ? value : "ar";
}
