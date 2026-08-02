import type { BodySurfaceSectionProps, BodySurfaceSectionSpec } from "../../BodySurface.types";
import { sectionStackPosition, type BodySectionStackPosition } from "./BodySurfaceSectionStack.styles";

export type BodySurfaceSectionChrome = "card" | "divider" | "plain";

export function bodySurfaceRootOwnsFrame(
  section: BodySurfaceSectionProps,
  frameDepth = 0,
) {
  if (frameDepth > 0 || section.layout === "split") return false;
  return Boolean(section.title || section.commands?.length);
}

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

export function resolveBodySurfaceSectionStackPosition(
  sections: BodySurfaceSectionSpec[],
  index: number,
  frameDepth: number,
  leadingCardSegment = false,
): BodySectionStackPosition | undefined {
  if (frameDepth > 0) {
    return sectionStackPosition(
      (index === 0 && leadingCardSegment) || index > 0,
      index < sections.length - 1,
    );
  }
  if (resolveBodySurfaceSectionChrome(sections[index], frameDepth) !== "card") return undefined;
  const previousIsCard = (index === 0 && leadingCardSegment)
    || (index > 0 && resolveBodySurfaceSectionChrome(sections[index - 1], frameDepth) === "card");
  const nextIsCard = index < sections.length - 1
    && resolveBodySurfaceSectionChrome(sections[index + 1], frameDepth) === "card";
  return sectionStackPosition(previousIsCard, nextIsCard);
}
