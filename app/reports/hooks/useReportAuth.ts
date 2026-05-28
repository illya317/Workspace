import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { PeriodType } from "@/lib/period";

export interface ReportUser {
  id: number;
  name: string;
  departmentId: number;
}

export interface SavedTarget {
  targetType: string;
  targetId: number;
  targetName: string;
}

export function useReportAuth() {
  const router = useRouter();
  const [user, setUser] = useState<ReportUser | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);

  const fetchUser = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me");
      if (!res.ok) {
        router.push("/login");
        return null;
      }
      const data = await res.json();
      setUser(data.user);
      return data.user as ReportUser;
    } catch {
      router.push("/login");
      return null;
    }
  }, [router]);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  return { user, initialLoading, setInitialLoading, fetchUser };
}

export function loadSavedPeriodType(): PeriodType | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("selectedPeriodType") as PeriodType | null;
}

export function savePeriodType(pt: PeriodType) {
  if (typeof window !== "undefined") {
    localStorage.setItem("selectedPeriodType", pt);
  }
}

export function loadSavedTarget(): SavedTarget | null {
  if (typeof window === "undefined") return null;
  const tt = localStorage.getItem("selectedTargetType");
  const ti = localStorage.getItem("selectedTargetId");
  const tn = localStorage.getItem("selectedTargetName");
  if (tt && ti) {
    return { targetType: tt, targetId: parseInt(ti), targetName: tn || "" };
  }
  return null;
}

export function saveTarget(target: SavedTarget | null) {
  if (typeof window === "undefined") return;
  if (target) {
    localStorage.setItem("selectedTargetType", target.targetType);
    localStorage.setItem("selectedTargetId", String(target.targetId));
    localStorage.setItem("selectedTargetName", target.targetName);
  } else {
    localStorage.removeItem("selectedTargetType");
    localStorage.removeItem("selectedTargetId");
    localStorage.removeItem("selectedTargetName");
  }
}
