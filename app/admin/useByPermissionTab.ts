"use client";

import { useEffect, useState, useRef } from "react";
import { useSearch } from "@/lib/useSearch";
import type { ResourceItem } from "./types";

interface Props {
  user: { id: number; name: string; isWorkListAdmin: boolean; isAnyGroupAdmin: boolean };
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
  const topResources = resources.filter((r) => !r.key.includes("."));

  const [systemAdmins, setSystemAdmins] = useState<SystemAdmin[]>([]);
  const [sysLoading, setSysLoading] = useState(true);

  const { query: sysSearchQ, setQuery: setSysSearchQ, results: sysRawResults, loading: sysSearchLoading } = useSearch<EmployeeResult>({ target: "employee" });
  const sysResults = sysRawResults.filter((item) => item.userId != null);
  const [sysConfirm, setSysConfirm] = useState<number | null>(null);
  const sysTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function loadSystemAdmins() {
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
  }

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
  }, []);

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
    console.log("[addSystemAdmin] start userId=", userId, "name=", name);
    const res = await fetch("/api/admin/user-permissions", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, resourceKey: "system", roleKey: "admin", value: true }),
    });
    console.log("[addSystemAdmin] res.ok=", res.ok, "status=", res.status);
    if (res.ok) {
      showToast(`已添加：${name}`, "success");
      setSysSearchQ("");
      loadSystemAdmins();
    } else {
      const e = await res.json().catch(() => ({ error: "失败" }));
      console.log("[addSystemAdmin] error=", e.error);
      showToast(e.error, "error");
    }
  }

  async function removeSystemAdmin(userId: number) {
    console.log("[removeSystemAdmin] start userId=", userId);
    const res = await fetch("/api/admin/user-permissions", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, resourceKey: "system", roleKey: "admin", value: false }),
    });
    console.log("[removeSystemAdmin] res.ok=", res.ok, "status=", res.status);
    if (res.ok) {
      showToast("已移除", "success");
      loadSystemAdmins();
    } else {
      const e = await res.json().catch(() => ({ error: "失败" }));
      console.log("[removeSystemAdmin] error=", e.error);
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
