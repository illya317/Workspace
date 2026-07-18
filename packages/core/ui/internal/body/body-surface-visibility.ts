import type { BodySurfaceSectionVisibility } from "../../BodySurface.types";

export function sectionVisibilityClassName(visibility: BodySurfaceSectionVisibility | undefined) {
  if (visibility === "mobile") return "body-surface-mobile-only sm:hidden";
  if (visibility === "desktop") return "body-surface-desktop-only max-sm:hidden";
  return "";
}
