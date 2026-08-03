import type { WorkTarget, WorkTaskSpace } from "./types";

export type WorkSpaceResolution = {
  target: WorkTarget | null;
  requestedTargetUnavailable: boolean;
};

export function resolveWorkSpaceTarget(
  spaces: WorkTaskSpace[],
  requestedTarget: WorkTarget | null,
  currentTarget: WorkTarget | null,
): WorkSpaceResolution {
  const requested = requestedTarget
    ? spaces.find((space) => sameTarget(space, requestedTarget)) ?? null
    : null;
  if (requested) return { target: toTarget(requested), requestedTargetUnavailable: false };

  const current = currentTarget
    ? spaces.find((space) => sameTarget(space, currentTarget)) ?? null
    : null;
  if (current) {
    return {
      target: toTarget(current),
      requestedTargetUnavailable: Boolean(requestedTarget),
    };
  }

  const fallback = spaces.find((space) => space.targetType === "personal") ?? spaces[0] ?? null;
  return {
    target: fallback ? toTarget(fallback) : null,
    requestedTargetUnavailable: Boolean(requestedTarget),
  };
}

function toTarget(target: WorkTarget): WorkTarget {
  return { targetType: target.targetType, targetId: target.targetId };
}

function sameTarget(left: WorkTarget, right: WorkTarget) {
  return left.targetType === right.targetType && left.targetId === right.targetId;
}
