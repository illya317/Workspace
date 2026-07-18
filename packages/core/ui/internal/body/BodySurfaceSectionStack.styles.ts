import { joinClassNames } from "../common/card-utils";

export type BodySectionStackPosition = "single" | "first" | "middle" | "last";

export function sectionCardClassName(position?: BodySectionStackPosition) {
  if (!position || position === "single") return "space-y-4 rounded-md border border-slate-200 bg-white p-3 shadow-sm sm:p-4";
  const roundedClass =
    position === "first"
      ? "rounded-t-md rounded-b-none"
      : position === "last"
        ? "-mt-px rounded-b-md rounded-t-none"
        : "-mt-px rounded-none";
  return joinClassNames("space-y-4 border border-slate-200 bg-white p-3 shadow-sm sm:p-4", roundedClass);
}

export function sectionStackPosition(previousIsCard: boolean, nextIsCard: boolean): BodySectionStackPosition {
  if (!previousIsCard && !nextIsCard) return "single";
  if (!previousIsCard) return "first";
  if (!nextIsCard) return "last";
  return "middle";
}
