import type { WorkTarget } from "./types";

type WorkTargetPresentation = Pick<WorkTarget, "targetType">;

export function shouldShowWorkOwner(target: WorkTargetPresentation | null | undefined) {
  return target?.targetType !== "personal";
}
