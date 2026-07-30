"use client";

import { PageSurface, type PageSurfaceTabBarSpec } from "@workspace/core/ui";
import { useOperationalAnalysisPage } from "./operational-analysis/OperationalAnalysisWorkspace";

export default function FinancePersonalShipmentView({
  userId,
  tabbar,
}: {
  userId: number;
  tabbar: PageSurfaceTabBarSpec;
}) {
  const page = useOperationalAnalysisPage("personal", userId);

  return (
    <PageSurface
      kind="standard"
      create={page.create}
      tabbar={tabbar}
      toolbar={{ items: page.toolbarItems, assistant: false }}
      body={page.body}
      footer={page.footer}
    />
  );
}
