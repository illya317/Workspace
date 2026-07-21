import type { PageSurfaceTabBarItemSpec } from "@workspace/core/ui";
export const WORKPAPER_TABS = [
  { key: "adjustments", label: "调整与抵消" },
  { key: "report", label: "合并报表" },
] satisfies PageSurfaceTabBarItemSpec[];
export const STATEMENT_TABS: PageSurfaceTabBarItemSpec[] = [{ key: "consolidation", label: "合并报表", children: WORKPAPER_TABS },
  { key: "statements", label: "财务报表" },
];
