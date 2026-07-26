"use client";

import { PageSurface, type PageSurfaceTabBarSpec } from "@workspace/core/ui";
import { useOperationalAnalysisPage } from "./operational-analysis/OperationalAnalysisWorkspace";

export default function FinanceProjectOperationalAnalysisView({
  projectId,
  tabbar,
}: {
  projectId: number;
  tabbar: PageSurfaceTabBarSpec;
}) {
  const page = useOperationalAnalysisPage("project", projectId);
  return (
    <PageSurface
      kind="standard"
      tabbar={tabbar}
      toolbar={{ items: page.toolbarItems, assistant: false }}
      body={page.body}
      footer={page.footer}
    />
  );
}
