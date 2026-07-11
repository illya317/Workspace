"use client";

import { useState } from "react";
import { renderAppShellPage } from "@workspace/platform/ui/app-shell-page";
import type { SessionUser } from "@workspace/platform/types";
import type { HRUser } from "@workspace/hr/types";
import EmployeeProfileClient from "./EmployeeProfileClient";

export default function EmployeeProfilePageClient({
  employeeId,
  user,
  hrUser,
}: {
  employeeId: string;
  user: SessionUser;
  hrUser: HRUser;
}) {
  const [dirty, setDirty] = useState(false);

  return renderAppShellPage({
      title: "员工资料",
      backHref: "/hr/roster",
      user,
      hasUnsavedChanges: dirty,
      children: <EmployeeProfileClient employeeId={employeeId} user={hrUser} onDirtyChange={setDirty} />,
  });
}
