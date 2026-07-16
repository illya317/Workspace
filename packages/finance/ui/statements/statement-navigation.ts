import type { PageSurfaceTabBarItemSpec } from "@workspace/core/ui";
export const WORKPAPER_TABS = [
  { key: "overview", label: "编制总览" },
  { key: "ownership", label: "范围与股权" },
  { key: "sources", label: "个别三表" },
  { key: "fx", label: "外币折算" },
  { key: "eliminations", label: "抵销底稿" },
  { key: "tax", label: "税务影响" },
  { key: "review", label: "复核发布" },
] satisfies PageSurfaceTabBarItemSpec[];
export const STATEMENT_TABS: PageSurfaceTabBarItemSpec[] = [{ key: "workpaper", label: "合并报表底稿", children: WORKPAPER_TABS },
  { key: "statements", label: "财务报表" },
  { key: "consolidated", label: "合并报表" },
];
