import type { BodySurfaceSectionSpec } from "../../BodySurface.types";

/** 章节在移动端 drilldown 目录中的导航标题(legacy 与 antd 渲染器共用)。 */
export function sectionNavigationTitle(section: BodySurfaceSectionSpec) {
  return section.label ?? section.header?.title ?? null;
}

/**
 * 是否启用移动端 drilldown(栏目目录 → 章节详情 → 返回)。
 * 与 legacy BodySurfaceSectionStack 的 canDrillDown 判定保持一致:
 * 仅当声明 drilldown、章节数大于 1 且每个章节都有导航标题时启用,
 * 否则回退为常规 stack,不得静默丢失章节。
 */
export function canDrilldownSections(
  sections: BodySurfaceSectionSpec[],
  mobilePresentation: "stack" | "drilldown" | undefined,
) {
  return mobilePresentation === "drilldown"
    && sections.length > 1
    && sections.every((section) => sectionNavigationTitle(section) !== null);
}
