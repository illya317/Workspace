"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { workspacePath } from "@workspace/core/routing";
import { listTaskSpaces } from "./api";
import { getWorkSpaceWorkbenchPath, getWorkTargetFromPath } from "./space-paths";
import { applyDefaultExpandedWorkSpaces, workSpaceKey } from "./WorkSpaceSidebar";
import { activeWorkSpaceNavigationKey, createWorkSpaceTopNavigationItems, filterWorkSpacesByNavigation } from "./WorkSpaceTopNavigation";
import { normalizeInitialTarget, prependActiveTargetId, sameTarget } from "./works-client-helpers";
import { resolveWorkSpaceTarget } from "./work-space-session";
import type { WorkTarget, WorkTaskSpace } from "./types";
export type WorkbenchChange = "plan.changed" | "work-item.changed";
export function useWorkSpaceSession({ initialTarget, onError }: {
  initialTarget?: WorkTarget; onError: (message: string) => void;
}) {
  const requestedTarget = useMemo(() => normalizeInitialTarget(initialTarget), [initialTarget]);
  const [spaces, setSpaces] = useState<WorkTaskSpace[]>([]);
  const [preferredDepartmentIds, setPreferredDepartmentIds] = useState<number[]>([]);
  const [preferredProjectIds, setPreferredProjectIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTarget, setActiveTarget] = useState<WorkTarget | null>(requestedTarget);
  const [expandedSpaceKeys, setExpandedSpaceKeys] = useState<Set<string>>(() => new Set());
  const applySpaceCatalog = useCallback((data: Awaited<ReturnType<typeof listTaskSpaces>>) => {
    setSpaces(data.spaces); setPreferredDepartmentIds(data.preferredDepartmentIds); setPreferredProjectIds(data.preferredProjectIds);
  }, []);
  const refreshSummary = useCallback(async (_change: WorkbenchChange) => {
    try {
      const data = await listTaskSpaces();
      applySpaceCatalog(data);
      setActiveTarget((current) => resolveWorkSpaceTarget(data.spaces, null, current).target);
    } catch (error) {
      onError(error instanceof Error ? error.message : "加载工作空间失败");
    }
  }, [applySpaceCatalog, onError]);
  useEffect(() => {
    let cancelled = false;
    async function loadInitialSpaces() {
      setLoading(true);
      try {
        const data = await listTaskSpaces();
        if (!cancelled) {
          applySpaceCatalog(data);
          const resolution = resolveWorkSpaceTarget(data.spaces, requestedTarget, requestedTarget);
          setActiveTarget(resolution.target);
          if (resolution.requestedTargetUnavailable && resolution.target) replaceHistory(resolution.target);
        }
      } catch (error) {
        if (!cancelled) onError(error instanceof Error ? error.message : "加载工作空间失败");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadInitialSpaces();
    return () => { cancelled = true; };
  }, [applySpaceCatalog, onError, requestedTarget]);
  const navigationPreferredDepartmentIds = useMemo(() => prependActiveTargetId(preferredDepartmentIds, activeTarget, "department"), [activeTarget, preferredDepartmentIds]);
  const navigationPreferredProjectIds = useMemo(() => prependActiveTargetId(preferredProjectIds, activeTarget, "project"), [activeTarget, preferredProjectIds]);
  const navigationItems = useMemo(() => createWorkSpaceTopNavigationItems(spaces, navigationPreferredDepartmentIds, navigationPreferredProjectIds), [navigationPreferredDepartmentIds, navigationPreferredProjectIds, spaces]);
  const activeNavigationKey = useMemo(() => activeWorkSpaceNavigationKey(activeTarget, navigationItems), [activeTarget, navigationItems]);
  const filteredSpaces = useMemo(() => filterWorkSpacesByNavigation(spaces, activeNavigationKey), [activeNavigationKey, spaces]);
  const planLoadSpaces = useMemo(
    () => filteredSpaces.length > 0
      ? filteredSpaces
      : activeTarget
        ? spaces.filter((space) => sameTarget(space, activeTarget))
        : spaces,
    [activeTarget, filteredSpaces, spaces],
  );
  const currentSpace = useMemo(() => spaces.find((space) => sameTarget(space, activeTarget)) ?? null, [activeTarget, spaces]);
  useEffect(() => {
    setExpandedSpaceKeys((current) => applyDefaultExpandedWorkSpaces(current, spaces, activeTarget));
  }, [activeTarget, spaces]);
  useEffect(() => {
    if (!spaces.length || !activeNavigationKey) return;
    if (activeTarget && filteredSpaces.some((space) => sameTarget(space, activeTarget))) return;
    const fallback = filteredSpaces[0] ?? null;
    setActiveTarget(fallback);
    if (fallback) replaceHistory(fallback);
  }, [activeNavigationKey, activeTarget, filteredSpaces, spaces.length]);
  useEffect(() => {
    if (spaces.length === 0) return;
    function handlePopState() {
      const target = getWorkTargetFromPath(window.location.pathname, spaces);
      if (target) setActiveTarget({ targetType: target.targetType, targetId: target.targetId });
    }
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [spaces]);
  const openTarget = useCallback((target: WorkTarget) => {
    const next = { targetType: target.targetType, targetId: target.targetId };
    setActiveTarget(next);
    setExpandedSpaceKeys((current) => new Set(current).add(workSpaceKey(next)));
    window.history.pushState(null, "", workbenchUrl(next));
  }, []);
  const synchronizeTarget = useCallback((target: WorkTarget) => {
    setActiveTarget((current) => sameTarget(current, target)
      ? current
      : { targetType: target.targetType, targetId: target.targetId });
  }, []);
  const toggleSpace = useCallback((space: WorkTaskSpace) => {
    setExpandedSpaceKeys((current) => {
      const next = new Set(current);
      const key = workSpaceKey(space);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);
  return {
    data: { spaces, filteredSpaces, planLoadSpaces,
      preferredDepartmentIds: navigationPreferredDepartmentIds,
      preferredProjectIds: navigationPreferredProjectIds,
    },
    selection: { activeTarget, currentSpace, expandedSpaceKeys },
    status: { loading },
    commands: { openTarget, synchronizeTarget, toggleSpace, refreshSummary },
  };
}
function replaceHistory(target: WorkTarget) {
  window.history.replaceState(null, "", workbenchUrl(target));
}
function workbenchUrl(target: WorkTarget) {
  return workspacePath(getWorkSpaceWorkbenchPath(target.targetType, target.targetId));
}
