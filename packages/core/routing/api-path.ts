const rawBasePath = process.env.NEXT_PUBLIC_BASE_PATH || "/workspace";

export const workspaceBasePath =
  rawBasePath === "/" ? "" : rawBasePath.replace(/\/$/, "");

export function workspacePath(path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  if (
    workspaceBasePath &&
    (normalizedPath === workspaceBasePath ||
      normalizedPath.startsWith(`${workspaceBasePath}/`))
  ) {
    return normalizedPath;
  }
  return `${workspaceBasePath}${normalizedPath}`;
}
