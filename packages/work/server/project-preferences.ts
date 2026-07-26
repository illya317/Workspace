import { prisma } from "@workspace/platform/server/prisma";
import { buildVisibleProjectWhere } from "./access";
import {
  buildPreferredProjectPreferenceCommand,
  MAX_PREFERRED_PROJECTS,
} from "./domain/project-preference-validation";

export interface PreferredProjectOption {
  id: number;
  name: string;
  code: string | null;
  projectLevel: string | null;
}

function parsePreferredProjectIds(value: string | null): number[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<number>();
    const ids: number[] = [];
    for (const item of parsed) {
      const id = typeof item === "number" ? item : Number(item);
      if (!Number.isInteger(id) || id <= 0 || seen.has(id)) continue;
      seen.add(id);
      ids.push(id);
      if (ids.length >= MAX_PREFERRED_PROJECTS) break;
    }
    return ids;
  } catch {
    return [];
  }
}

export async function listPreferredProjectOptions(userId: number): Promise<PreferredProjectOption[]> {
  const visibleWhere = await buildVisibleProjectWhere(userId);
  return prisma.project.findMany({
    where: {
      AND: [
        visibleWhere,
        { isArchived: false, workspaceEnabled: true },
      ],
    },
    select: { id: true, name: true, code: true, projectLevel: true },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: 500,
  });
}

export async function getUserPreferredProjectIds(userId: number): Promise<number[]> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { preferredProjectIds: true },
  });
  return parsePreferredProjectIds(user?.preferredProjectIds ?? null);
}

export async function getUserPreferredProjectSettings(userId: number) {
  const [projects, preferredProjectIds] = await Promise.all([
    listPreferredProjectOptions(userId),
    getUserPreferredProjectIds(userId),
  ]);
  const availableIds = new Set(projects.map((project) => project.id));
  return {
    projects,
    preferredProjectIds: preferredProjectIds.filter((id) => availableIds.has(id)),
    maxPreferredProjects: MAX_PREFERRED_PROJECTS,
  };
}

export async function updateUserPreferredProjectIds(userId: number, projectIds: number[]) {
  const projects = await listPreferredProjectOptions(userId);
  const command = buildPreferredProjectPreferenceCommand(
    projectIds,
    new Set(projects.map((project) => project.id)),
  );
  if (!command.ok) throw new Error(command.issue.message);
  await prisma.user.update({
    where: { id: userId },
    data: { preferredProjectIds: JSON.stringify(command.data.projectIds) },
  });
  return command.data.projectIds;
}
