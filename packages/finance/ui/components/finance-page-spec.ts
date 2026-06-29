import { createBlockSurfaceSection } from "@workspace/core/ui";
import type { PageSurfaceSectionSpec, PageSurfaceNavigationItemSpec } from "@workspace/core/ui";
import { MODULE_LIFECYCLE_BY_RESOURCE, MODULE_LIFECYCLE_LABELS } from "@workspace/platform/module-lifecycle";
import type { SessionUser } from "@workspace/platform/types";
import { getPageViewTabs } from "@workspace/platform/view-registry";
import { getFinanceNavItems } from "../navigation/nav-utils";

export function getFinancePageViewTabs(activeNav: string, user: SessionUser): PageSurfaceNavigationItemSpec[] {
  const activeNavItem = getFinanceNavItems(user).find((item) => item.key === activeNav);
  return getPageViewTabs(activeNavItem?.href ?? "");
}

export function getFinanceLifecycleBlocks(activeNav: string): PageSurfaceSectionSpec[] {
  const lifecycleStatus = MODULE_LIFECYCLE_BY_RESOURCE[`finance.${activeNav}`];
  if (!lifecycleStatus || lifecycleStatus === "workspace-owned") return [];
  return [createBlockSurfaceSection("lifecycle", {
    kind: "message",
    tone: "warning",
    content: MODULE_LIFECYCLE_LABELS[lifecycleStatus]
  })];
}
