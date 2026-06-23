"use client";

import { useState } from "react";
import AppShell from "@workspace/platform/ui/AppShell";
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

  return (
    <AppShell
      title="员工资料"
      backHref="/hr/roster"
      user={user}
      hasUnsavedChanges={dirty}
    >
      <EmployeeProfileClient employeeId={employeeId} user={hrUser} onDirtyChange={setDirty} />
    </AppShell>
  );
}
