import { createMessageSection } from "@workspace/core/ui";
import type { BodySurfaceSectionSpec, PageSurfaceNavigationItemSpec } from "@workspace/core/ui";
import { MODULE_LIFECYCLE_BY_RESOURCE, MODULE_LIFECYCLE_LABELS } from "@workspace/platform/module-lifecycle";
import type { SessionUser } from "@workspace/platform/types";
import { getPageViewTabs } from "@workspace/platform/view-registry";
import { getFinanceNavItems } from "../navigation/nav-utils";

export function getFinancePageViewTabs(activeNav: string, user: SessionUser): PageSurfaceNavigationItemSpec[] {
  const activeNavItem = getFinanceNavItems(user).find((item) => item.key === activeNav);
  return getPageViewTabs(activeNavItem?.href ?? "");
}

export function getFinanceLifecycleBlocks(activeNav: string): BodySurfaceSectionSpec[] {
  const lifecycleStatus = MODULE_LIFECYCLE_BY_RESOURCE[`finance.${activeNav}`];
  if (!lifecycleStatus || lifecycleStatus === "workspace-owned") return [];
  return [createMessageSection("lifecycle", {
    tone: "warning",
    content: MODULE_LIFECYCLE_LABELS[lifecycleStatus]
  })];
}
