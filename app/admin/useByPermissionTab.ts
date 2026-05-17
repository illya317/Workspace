"use client";

import { useEffect, useState, useRef } from "react";
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
  // 显示所有一级资源（parentId === null），不只过滤 isTopLevelResource 的4个
  const topResources = resources.filter((r) => !r.key.includes("."));

  const [systemAdmins, setSystemAdmins] = useState<SystemAdmin[]>([]);
  const [sysLoading, setSysLoading] = useState(true);

  const [sysSearchQ, setSysSearchQ] = useState("");
  const [sysResults, setSysResults] = useState<EmployeeResult[]>([]);
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

  useEffect(() => {
    if (!sysSearchQ.trim()) {
      setSysResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/employees/search?q=${encodeURIComponent(sysSearchQ.trim())}`);
        if (res.ok) {
          const data = await res.json();
          setSysResults((data.items || []).filter((item: EmployeeResult) => item.userId != null));
        }
      } catch {
        /* ignore */
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [sysSearchQ]);

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
