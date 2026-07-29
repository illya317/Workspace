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
import CloseTab from "./CloseTab";
import type { FinanceLedgerDefaultScope } from "./defaultScope";

export default function LedgerClient({
  canCreate,
  canUpdate,
  canDelete,
  canRevise,
  canExport,
  canApproveLedger,
  defaultScope,
  initialTab,
  user,
}: {
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  canRevise: boolean;
  canExport: boolean;
  canApproveLedger: boolean;
  defaultScope: FinanceLedgerDefaultScope | null;
  initialTab?: string;
  user: SessionUser;
}) {
  const activeChildTabs = useMemo(() => getFinancePageViewTabs("ledger", user), [user]);
  const initialChild = ledgerTab(activeChildTabs, initialTab);
  const [activeChild, setActiveChild] = useState(initialChild.key);
  const [activeNestedChild, setActiveNestedChild] = useState(initialChild.children?.[0]?.key ?? "");
  useEffect(() => {
    setActiveChild((current) => activeChildTabs.some((tab) => tab.key === current) ? current : ledgerTab(activeChildTabs, initialTab).key);
  }, [activeChildTabs, initialTab]);
  useEffect(() => {
    const applyLocation = () => {
      const next = ledgerTab(activeChildTabs, new URLSearchParams(window.location.search).get("tab") ?? undefined);
      setActiveChild(next.key);
      setActiveNestedChild((current) => next.children?.some((child) => child.key === current) ? current : next.children?.[0]?.key ?? "");
    };
    window.addEventListener("popstate", applyLocation);
    return () => window.removeEventListener("popstate", applyLocation);
  }, [activeChildTabs]);
  const activeTab = activeChild;
  const activeTabDefinition = activeChildTabs.find((tab) => tab.key === activeTab);
  const navigation = activeChildTabs.length > 1 ? createPageTabBar({
    items: activeChildTabs,
    active: activeChild,
    activeChild: activeTabDefinition?.children?.length ? activeNestedChild : undefined,
    onChange: (key) => {
      setActiveChild(key);
      writeLedgerTabLocation(key);
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
      {activeTab === "vouchers"
        ? <VoucherTab
            canExport={canExport}
            defaultScope={defaultScope}
            voucherKind={activeNestedChild === "consolidation" ? "group" : "standard"}
            {...pageChrome}
          />
        : null}
      {activeTab === "ledger" && activeNestedChild === "reclassification"
        ? <ReclassTab canExport={canExport} defaultScope={defaultScope} {...pageChrome} />
        : activeTab === "ledger"
          ? <LedgerTab canExport={canExport} defaultScope={defaultScope} {...pageChrome} />
          : null}
      {activeTab === "counterparty" && <CounterpartyBalanceTab canExport={canExport} category={counterpartyCategory(activeNestedChild)} defaultScope={defaultScope} {...pageChrome} />}
      {activeTab === "closing" && <CloseTab canCreate={canCreate} canUpdate={canUpdate} canApprove={canApproveLedger} defaultScope={defaultScope} userId={user.id} {...pageChrome} />}
    </>
  );
}

function ledgerTab<T extends { key: string }>(tabs: T[], requested?: string) {
  return tabs.find((tab) => tab.key === requested) ?? tabs[0] ?? ({ key: "accounts" } as T);
}

function writeLedgerTabLocation(tab: string) {
  const params = new URLSearchParams(window.location.search);
  params.set("tab", tab);
  const query = params.toString();
  const next = `${window.location.pathname}${query ? `?${query}` : ""}`;
  if (`${window.location.pathname}${window.location.search}` !== next) window.history.pushState(null, "", next);
}

function counterpartyCategory(value: string) {
  return value === "ap" || value === "otherAr" || value === "otherAp" ? value : "ar";
}
