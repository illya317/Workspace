"use client";

import { useMemo, useState } from "react";
import { createPageTabBar } from "@workspace/core/ui";
import CompanyGovernanceClient from "./CompanyGovernanceClient";
import GovernanceArchitectureClient from "./GovernanceArchitectureClient";

type GovernanceView = "governance" | "companies" | "relations";

const VIEWS = [
  { key: "governance", label: "治理组织" },
  { key: "companies", label: "公司信息" },
  { key: "relations", label: "股权关系" },
] as const;

export default function GovernanceWorkspaceClient({
  canCreate,
  canUpdate,
  canDelete,
}: {
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
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
  return (
    <CompanyGovernanceClient
      view={view}
      navigation={navigation}
      canCreate={canCreate}
      canUpdate={canUpdate}
      canDelete={canDelete}
    />
  );
}
