"use client";

import { useState, useEffect } from "react";

/** Fetch system admin user IDs once on mount */
export function useSystemAdminIds() {
  const [systemAdminIds, setSystemAdminIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    fetch("/api/admin/users")
      .then((r) => r.json())
      .then((data) => {
        const users = (data.users || []) as Array<{ id: number; isWorkListAdmin?: boolean }>;
        setSystemAdminIds(new Set(users.filter((u) => u.isWorkListAdmin).map((u) => u.id)));
      })
      .catch(() => {});
  }, []);

  return systemAdminIds;
}
