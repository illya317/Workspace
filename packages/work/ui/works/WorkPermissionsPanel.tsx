"use client";

import { createPageBody, PageSurface, type BodySurfaceSectionSpec } from "@workspace/core/ui";
import { useSpacePermissionsSections, type SpacePermissionRow } from "@workspace/platform/ui/SpacePermissionsPanel";
import { listSpacePermissions, saveSpacePermissions, WORK_REFERENCE_OPTIONS_ENDPOINT } from "./api";
import type { WorkTarget } from "./types";
export default function WorkPermissionsPanel({
  target,
  canManage,
  onToast
}: {
  target: WorkTarget | null;
  canManage: boolean;
  onToast: (toast: {
    type: "success" | "error";
    message: string;
  }) => void;
}) {
  const sections = useWorkPermissionsSections({ target, canManage, onToast, enabled: true });
  return <PageSurface kind="standard" embedded body={createPageBody(sections)} />;
}

export function useWorkPermissionsSections({
  target,
  canManage,
  onToast,
  enabled,
}: {
  target: WorkTarget | null;
  canManage: boolean;
  onToast: (toast: {
    type: "success" | "error";
    message: string;
  }) => void;
  enabled: boolean;
}): BodySurfaceSectionSpec[] {
  return useSpacePermissionsSections({
    target,
    canManage,
    onToast,
    enabled,
    listPermissions: async (nextTarget) => listSpacePermissions(nextTarget) as Promise<SpacePermissionRow[]>,
    savePermissions: saveSpacePermissions,
    referenceEndpoint: WORK_REFERENCE_OPTIONS_ENDPOINT,
    userFkKey: "work.tasks.permission.user",
    permissionKind: "task",
  });
}
