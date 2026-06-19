"use client";

const rawBasePath = process.env.NEXT_PUBLIC_BASE_PATH || "/workspace";

export const agentBasePath = rawBasePath === "/"
  ? ""
  : rawBasePath.replace(/\/$/, "");

export function withAgentBasePath(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${agentBasePath}${normalizedPath}`;
}

export function stripAgentBasePath(pathname: string | null | undefined): string {
  const currentPath = pathname || "/";
  if (agentBasePath && currentPath.startsWith(agentBasePath)) {
    return currentPath.slice(agentBasePath.length) || "/";
  }
  return currentPath;
}
