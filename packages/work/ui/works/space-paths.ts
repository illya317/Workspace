import { workspaceBasePath } from "@workspace/core/routing";
import type { WorkTaskSpace, WorkTargetType } from "./types";

export function getWorkSpaceHomePath(type: WorkTargetType, id: number) {
  if (type === "personal") return "/work/me";
  if (type === "department" || type === "committee") return `/work/department/${id}`;
  if (type === "project") return `/work/project/${id}`;
  return "/work/me";
}

export function getWorkSpaceWorkbenchPath(type: WorkTargetType, id: number) {
  if (type === "personal") return "/work/me/space";
  if (type === "department" || type === "committee") return `/work/department/${id}/space`;
  if (type === "project") return `/work/project/${id}/space`;
  return "/work/me/space";
}

export function getWorkTargetFromPath(pathname: string, spaces: WorkTaskSpace[]) {
  const path = workspaceBasePath && pathname.startsWith(`${workspaceBasePath}/`)
    ? pathname.slice(workspaceBasePath.length)
    : pathname;
  if (path === "/work/me" || path === "/work/me/space") return spaces.find((space) => space.targetType === "personal") || null;
  const match = path.match(/^\/work\/(department|departments|project|projects)\/(\d+)(?:\/space)?$/);
  if (!match) return null;
  const targetId = Number(match[2]);
  const targetType = ({
    department: "department",
    departments: "department",
    project: "project",
    projects: "project",
  } as const)[match[1] as "department" | "departments" | "project" | "projects"];
  return spaces.find((space) => space.targetType === targetType && space.targetId === targetId) || null;
}
