import type { BodySurfaceSectionSpec } from "../../BodySurface.types";

export type BodySurfaceSectionChrome = "card" | "divider" | "plain";

function sectionHasHeader(section: BodySurfaceSectionSpec) {
  return Boolean(
    section.label
    || section.header?.title
    || section.header?.badges?.length
    || section.header?.actions?.length
    || section.header?.create
    || section.disclosure,
  );
}

export function resolveBodySurfaceSectionChrome(
  section: BodySurfaceSectionSpec,
  frameDepth = 0,
): BodySurfaceSectionChrome {
  if (section.body.kind === "create") return "plain";
  if (section.body.kind === "section" && !sectionHasHeader(section)) return "plain";
  if (frameDepth > 0) return sectionHasHeader(section) ? "divider" : "plain";
  return "card";
}
