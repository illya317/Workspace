"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { resolveWorkspaceNavigationTarget } from "@workspace/core/routing";

export function useDeployUnitNavigation() {
  const router = useRouter();
  return useCallback((href: string) => {
    const target = resolveWorkspaceNavigationTarget(href);
    if (target.mode === "soft") {
      router.push(href);
      return;
    }
    window.location.assign(target.href);
  }, [router]);
}
