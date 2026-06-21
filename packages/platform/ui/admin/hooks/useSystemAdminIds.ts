"use client";

import { workspacePath } from "@workspace/core/routing";
import { useState, useEffect } from "react";

/** Fetch system admin user IDs once on mount */
export function useSystemAdminIds() {
  const [systemAdminIds, setSystemAdminIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    fetch(workspacePath("/api/system/admin/users"))
      .then((r) => r.json())
      .then((data) => {
        const users = (data.users || []) as Array<{
          id: number;
          resourceRoles?: Array<{ resourceKey: string; roleKey: string }>;
        }>;
        const ids = users
          .filter((u) => u.resourceRoles?.some((r) => r.resourceKey === "system" && r.roleKey === "admin"))
          .map((u) => u.id);
        setSystemAdminIds(new Set(ids));
      })
      .catch(() => {});
  }, []);

  return systemAdminIds;
}
