"use client";

import { DepartmentHomeViewSurface } from "@workspace/platform/ui";
import { useOperationalAnalysisPage } from "./operational-analysis/OperationalAnalysisWorkspace";

export default function FinanceDepartmentShipmentView({ departmentId }: { departmentId: number }) {
  const page = useOperationalAnalysisPage("department", departmentId);

  return (
    <DepartmentHomeViewSurface
      toolbarItems={page.toolbarItems}
      right={page.body}
      footer={page.footer}
      assistant={false}
    />
  );
}
