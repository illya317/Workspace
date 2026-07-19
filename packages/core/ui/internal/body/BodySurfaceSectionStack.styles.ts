import { joinClassNames } from "../common/card-utils";

export type BodySectionStackPosition = "single" | "first" | "middle" | "last";

export function sectionCardClassName(position?: BodySectionStackPosition, nested = false) {
  if (nested) return nestedSectionClassName(position);
  if (!position || position === "single") return "space-y-4 overflow-hidden rounded-xl border border-slate-200 bg-white p-3 sm:rounded-md sm:p-4 sm:shadow-sm";
  const roundedClass =
    position === "first"
      ? "rounded-t-md rounded-b-none"
      : position === "last"
        ? "-mt-px rounded-b-md rounded-t-none"
        : "-mt-px rounded-none";
  return joinClassNames("space-y-4 overflow-hidden border border-slate-200 bg-white p-3 sm:p-4", roundedClass);
}

function nestedSectionClassName(position?: BodySectionStackPosition) {
  if (!position || position === "single") return "space-y-4";
  if (position === "first") return "space-y-4 pb-4";
  if (position === "last") return "space-y-4 border-t border-slate-200 pt-4";
  return "space-y-4 border-t border-slate-200 py-4";
}

export function sectionStackPosition(previousIsCard: boolean, nextIsCard: boolean): BodySectionStackPosition {
  if (!previousIsCard && !nextIsCard) return "single";
  if (!previousIsCard) return "first";
  if (!nextIsCard) return "last";
  return "middle";
}
