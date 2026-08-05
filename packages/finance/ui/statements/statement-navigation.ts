import type { PageSurfaceTabBarItemSpec } from "@workspace/core/ui";
export const WORKPAPER_TABS = [
  { key: "preparation", label: "合并准备" },
  { key: "fxWorkpaper", label: "外币底稿" },
  { key: "nciWorkpaper", label: "少数股东底稿" },
  { key: "workpaper", label: "合并底稿" },
  { key: "report", label: "合并报表" },
] satisfies PageSurfaceTabBarItemSpec[];
export const STATEMENT_TABS: PageSurfaceTabBarItemSpec[] = [{ key: "consolidation", label: "合并报表", children: WORKPAPER_TABS },
  { key: "statements", label: "单体报表" },
];
