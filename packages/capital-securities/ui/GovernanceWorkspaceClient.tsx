"use client";

import { useMemo, useState } from "react";
import { createPageTabBar } from "@workspace/core/ui";
import CompanyGovernanceClient from "./CompanyGovernanceClient";
import GovernanceArchitectureClient from "./GovernanceArchitectureClient";
import GovernanceOwnershipClient from "./GovernanceOwnershipClient";

type GovernanceView = "governance" | "ownership" | "companies";

const VIEWS = [
  { key: "governance", label: "治理组织" },
  { key: "ownership", label: "集团股权" },
  { key: "companies", label: "公司信息" },
] as const;

export default function GovernanceWorkspaceClient({
  canCreate,
  canUpdate,
}: {
  canCreate: boolean;
  canUpdate: boolean;
}) {
  const [view, setView] = useState<GovernanceView>("governance");
  const navigation = useMemo(() => createPageTabBar({
    items: [...VIEWS],
    active: view,
    onChange: (key) => setView(key as GovernanceView),
    ariaLabel: "治理架构视图",
  }), [view]);

  if (view === "governance") {
    return <GovernanceArchitectureClient canCreate={canCreate} canUpdate={canUpdate} navigation={navigation} />;
  }
  if (view === "ownership") {
    return <GovernanceOwnershipClient navigation={navigation} />;
  }
  return (
    <CompanyGovernanceClient
      navigation={navigation}
      canCreate={canCreate}
      canUpdate={canUpdate}
    />
  );
}
