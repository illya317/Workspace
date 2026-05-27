"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useSearch } from "@/app/hooks/useSearch";
import { HIDDEN_RESOURCE_KEYS } from "../lib";
import type { ResourceItem } from "../types";

interface Props {
  user: { id: number; name: string; isWorkListAdmin?: boolean; isAnyGroupAdmin?: boolean };
  resources: ResourceItem[];
  showToast: (msg: string, type?: "success" | "error") => void;
}

interface EmployeeResult {
  rowId: number;
  employeeId: string;
  name: string;
  alias: string;
  dept1: string;
  position: string;
  userId: number | null;
}

interface SystemAdmin {
  id: number;
  name: string;
  username: string;
}

export function useByPermissionTab({ user, resources, showToast }: Props) {
  const topResources = resources.filter((r) => !r.key.includes(".") && !HIDDEN_RESOURCE_KEYS.has(r.key));

  const [systemAdmins, setSystemAdmins] = useState<SystemAdmin[]>([]);
  const [sysLoading, setSysLoading] = useState(true);

  const { query: sysSearchQ, setQuery: setSysSearchQ, results: sysRawResults } = useSearch<EmployeeResult>({ target: "employee" });
  const sysResults = sysRawResults.filter((item) => item.userId != null);
  const [sysConfirm, setSysConfirm] = useState<number | null>(null);
  const sysTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadSystemAdmins = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/users");
      if (res.ok) {
        const data = await res.json();
        setSystemAdmins(
          (data.users || [])
            .filter((u: any) =>
              u.resourceRoles?.some((rr: any) => rr.resource?.key === "system" && rr.role?.key === "admin")
            )
            .map((u: any) => ({ id: u.id, name: u.name, username: u.username }))
        );
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    (async () => {
      if (user.isWorkListAdmin) {
        setSysLoading(true);
        await loadSystemAdmins();
        setSysLoading(false);
      } else {
        setSysLoading(false);
      }
    })();
  }, [user.isWorkListAdmin, loadSystemAdmins]);

  function handleRemoveSystemAdmin(adminId: number) {
    if (sysConfirm === adminId) {
      removeSystemAdmin(adminId);
      setSysConfirm(null);
      if (sysTimer.current) {
        clearTimeout(sysTimer.current);
        sysTimer.current = null;
      }
    } else {
      setSysConfirm(adminId);
      if (sysTimer.current) clearTimeout(sysTimer.current);
      sysTimer.current = setTimeout(() => setSysConfirm(null), 3000);
    }
  }

  async function addSystemAdmin(userId: number, name: string) {
    const res = await fetch("/api/admin/user-permissions", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, resourceKey: "system", roleKey: "admin", value: true }),
    });
    if (res.ok) {
      showToast(`已添加：${name}`, "success");
      setSysSearchQ("");
      loadSystemAdmins();
    } else {
      const e = await res.json().catch(() => ({ error: "失败" }));
      showToast(e.error, "error");
    }
  }

  async function removeSystemAdmin(userId: number) {
    const res = await fetch("/api/admin/user-permissions", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, resourceKey: "system", roleKey: "admin", value: false }),
    });
    if (res.ok) {
      showToast("已移除", "success");
      loadSystemAdmins();
    } else {
      const e = await res.json().catch(() => ({ error: "失败" }));
      showToast(e.error, "error");
    }
  }

  return {
    topResources,
    systemAdmins,
    sysLoading,
    sysSearchQ,
    setSysSearchQ,
    sysResults,
    sysConfirm,
    handleRemoveSystemAdmin,
    addSystemAdmin,
  };
}
