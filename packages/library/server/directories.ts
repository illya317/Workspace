import { guardedDelete } from "@workspace/platform/server/delete-guard";
import { prisma } from "@workspace/platform/server/prisma";

import {
  buildCreateLibraryDirectoryCommand,
  buildDeleteLibraryDirectoryCommand,
  buildEnsureLibraryDirectoryCommand,
  buildRenameLibraryDirectoryCommand,
  type CreateLibraryDirectoryCommand,
  type DeleteLibraryDirectoryCommand,
  type RenameLibraryDirectoryCommand,
} from "./domain/classification-validation";
import { ensureLibraryCategory } from "./classification";

const DEFAULT_ROOT_KEY = "default";

export interface DirectoryNode {
  path: string;
  name: string;
  count: number;
  children: DirectoryNode[];
}

function isPathInside(path: string, root: string) {
  return path === root || path.startsWith(`${root}/`);
}

function parentPaths(path: string) {
  const segments = path.split("/").filter(Boolean);
  return segments.map((_, index) => segments.slice(0, index + 1).join("/"));
}

export function folderCategoryForPath(directoryPath: string) {
  const topLevel = directoryPath.split("/").filter(Boolean)[0] ?? "";
  const match = topLevel.match(/^(\d+)\s+(.+)$/);
  return match
    ? { code: match[1], name: match[2].trim() }
    : { code: null, name: topLevel || null };
}

export async function listDirectories(
  confidentialityFilter?: { lte: number },
  includeEmpty = false,
): Promise<DirectoryNode[]> {
  const documentWhere: Record<string, unknown> = {
    rootKey: DEFAULT_ROOT_KEY,
    currentDirectoryId: { not: null },
  };
  if (confidentialityFilter) documentWhere.confidentialityLevel = confidentialityFilter;

  const [directoryRows, documents] = await Promise.all([
    prisma.libraryDirectory.findMany({
      where: { rootKey: DEFAULT_ROOT_KEY, status: "active", relativePath: { not: "" } },
      select: { relativePath: true, name: true },
    }),
    prisma.libraryDocument.findMany({
      where: documentWhere,
      select: { currentDirectory: { select: { relativePath: true } } },
    }),
  ]);

  const directoryByPath = new Map(directoryRows.map((row) => [row.relativePath, row]));
  for (const row of directoryRows) {
    const parentPath = row.relativePath.split("/").slice(0, -1).join("/");
    if (parentPath && !directoryByPath.has(parentPath)) {
      throw new Error(`资料库逻辑目录缺少父节点：${parentPath}`);
    }
  }

  const visiblePaths = includeEmpty
    ? new Set(directoryRows.map((row) => row.relativePath))
    : new Set<string>();
  const countMap = new Map<string, number>();
  for (const document of documents) {
    const directoryPath = document.currentDirectory?.relativePath;
    if (!directoryPath) continue;
    for (const path of parentPaths(directoryPath)) {
      if (directoryByPath.has(path)) visiblePaths.add(path);
      countMap.set(path, (countMap.get(path) ?? 0) + 1);
    }
  }

  const roots: DirectoryNode[] = [];
  const nodeMap = new Map<string, DirectoryNode>();
  const visibleRows = directoryRows
    .filter((row) => visiblePaths.has(row.relativePath))
    .sort((left, right) => {
      const depthDelta = left.relativePath.split("/").length - right.relativePath.split("/").length;
      return depthDelta || left.relativePath.localeCompare(right.relativePath, "zh");
    });
  for (const row of visibleRows) {
    const path = row.relativePath;
    const segments = path.split("/");
    const node: DirectoryNode = {
      path,
      name: row.name,
      count: countMap.get(path) ?? 0,
      children: [],
    };
    nodeMap.set(path, node);
    const parentPath = segments.slice(0, -1).join("/");
    const parent = parentPath ? nodeMap.get(parentPath) : null;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }

  function sortNodes(nodes: DirectoryNode[]) {
    nodes.sort((left, right) => left.name.localeCompare(right.name, "zh"));
    for (const node of nodes) sortNodes(node.children);
  }
  sortNodes(roots);
  return roots;
}

async function directoryPathExists(path: string, rootKey = DEFAULT_ROOT_KEY) {
  return Boolean(await prisma.libraryDirectory.findFirst({
    where: { rootKey, relativePath: path, status: "active" },
    select: { id: true },
  }));
}

export async function ensureLibraryDirectory(
  rootKey: string,
  directoryPath: string | null | undefined,
  options: { scannedAt?: Date } = {},
) {
  const validated = buildEnsureLibraryDirectoryCommand(rootKey, directoryPath);
  if (!validated.ok) throw new Error(validated.issue.message);
  const command = validated.data;
  const paths = command.relativePath ? parentPaths(command.relativePath) : [""];
  return prisma.$transaction(async (tx) => {
    let leafId = 0;
    for (const path of paths) {
      const name = path.split("/").filter(Boolean).at(-1) ?? "/";
      const directory = await tx.libraryDirectory.upsert({
        where: { rootKey_relativePath: { rootKey: command.rootKey, relativePath: path } },
        create: {
          rootKey: command.rootKey,
          relativePath: path,
          name,
          status: "active",
          lastScannedAt: options.scannedAt,
        },
        update: {
          name,
          status: "active",
          ...(options.scannedAt ? { lastScannedAt: options.scannedAt } : {}),
        },
        select: { id: true },
      });
      leafId = directory.id;
    }
    return leafId;
  });
}

export async function resolveLibraryDirectoryId(rootKey: string, path: string) {
  const validated = buildEnsureLibraryDirectoryCommand(rootKey, path);
  if (!validated.ok || !validated.data.relativePath) throw new Error(validated.ok ? "请选择文件夹" : validated.issue.message);
  rootKey = validated.data.rootKey;
  path = validated.data.relativePath;
  const existing = await prisma.libraryDirectory.findUnique({
    where: { rootKey_relativePath: { rootKey, relativePath: path } },
    select: { id: true, status: true },
  });
  if (existing?.status === "active") return existing.id;
  throw new Error("文件夹不存在");
}

export async function createLibraryDirectory(command: CreateLibraryDirectoryCommand) {
  const validated = buildCreateLibraryDirectoryCommand(command);
  if (!validated.ok) throw new Error(validated.issue.message);
  command = validated.data;
  if (command.parentPath && !(await directoryPathExists(command.parentPath, command.rootKey))) {
    throw new Error("父文件夹不存在");
  }
  if (await directoryPathExists(command.path, command.rootKey)) throw new Error("同名文件夹已存在");

  await prisma.libraryDirectory.create({
    data: {
      rootKey: command.rootKey,
      relativePath: command.path,
      name: command.name,
      status: "active",
    },
  });
  return { path: command.path, name: command.name };
}

export async function renameLibraryDirectory(command: RenameLibraryDirectoryCommand) {
  const validated = buildRenameLibraryDirectoryCommand(command);
  if (!validated.ok) throw new Error(validated.issue.message);
  command = validated.data;
  if (!(await directoryPathExists(command.path, command.rootKey))) throw new Error("文件夹不存在");
  if (command.nextPath === command.path) return { previousPath: command.path, path: command.path, name: command.name };

  const allDirectoryRows = await prisma.libraryDirectory.findMany({
    where: { rootKey: command.rootKey, status: "active" },
    select: { id: true, relativePath: true },
  });
  const affectedDirectories = allDirectoryRows.filter((row) => isPathInside(row.relativePath, command.path));
  const affectedDirectoryPathById = new Map(affectedDirectories.map((row) => [row.id, row.relativePath]));
  const affectedDocuments = await prisma.libraryDocument.findMany({
    where: { rootKey: command.rootKey, currentDirectoryId: { in: [...affectedDirectoryPathById.keys()] } },
    select: { id: true, currentDirectoryId: true },
  });
  const unaffectedPaths = new Set(
    allDirectoryRows
      .filter((row) => !isPathInside(row.relativePath, command.path))
      .map((row) => row.relativePath),
  );
  const targetPaths = affectedDirectories.map((row) => `${command.nextPath}${row.relativePath.slice(command.path.length)}`);
  if (targetPaths.some((path) => unaffectedPaths.has(path)) || await directoryPathExists(command.nextPath, command.rootKey)) {
    throw new Error("同名文件夹已存在");
  }

  const category = folderCategoryForPath(command.nextPath);
  const categoryId = await ensureLibraryCategory(category.code, category.name);

  await prisma.$transaction(async (tx) => {
    for (const row of affectedDirectories) {
      const nextPath = `${command.nextPath}${row.relativePath.slice(command.path.length)}`;
      await tx.libraryDirectory.update({
        where: { id: row.id },
        data: {
          relativePath: nextPath,
          ...(row.relativePath === command.path ? { name: command.name } : {}),
        },
      });
    }
    for (const document of affectedDocuments) {
      const currentDirectoryPath = document.currentDirectoryId
        ? affectedDirectoryPathById.get(document.currentDirectoryId)
        : null;
      if (!currentDirectoryPath) throw new Error("资料逻辑目录关联无效");
      const nextDirectoryPath = `${command.nextPath}${currentDirectoryPath.slice(command.path.length)}`;
      await tx.libraryDocument.update({
        where: { id: document.id },
        data: {
          directoryPath: nextDirectoryPath,
          categoryCode: category.code,
          categoryName: category.name,
          categoryId,
          categorySource: "manual",
          editedBy: command.userId,
          editedAt: new Date(),
          version: { increment: 1 },
        },
      });
    }
  });
  return { previousPath: command.path, path: command.nextPath, name: command.name };
}

export async function deleteLibraryDirectory(command: DeleteLibraryDirectoryCommand) {
  const validated = buildDeleteLibraryDirectoryCommand(command);
  if (!validated.ok) throw new Error(validated.issue.message);
  command = validated.data;

  const directory = await prisma.libraryDirectory.findUnique({
    where: { rootKey_relativePath: { rootKey: command.rootKey, relativePath: command.path } },
    select: { id: true, name: true, status: true },
  });
  if (!directory || directory.status !== "active") throw new Error("文件夹不存在");
  const result = await guardedDelete({
    entityType: "LibraryDirectory",
    modelKey: "libraryDirectory",
    id: directory.id,
    userId: command.userId,
    actionLabel: "删除资料文件夹",
    deleteMode: "hard",
    scopeGuard: ({ record }) => (
      record.rootKey === command.rootKey && record.relativePath === command.path && record.status === "active"
        ? { ok: true }
        : { error: "文件夹不存在", status: 404 }
    ),
    references: [
      {
        label: "子文件夹",
        count: (tx) => tx.libraryDirectory.count({
          where: { rootKey: command.rootKey, status: "active", relativePath: { startsWith: `${command.path}/` } },
        }),
      },
      { label: "文件夹内资料", count: (tx) => tx.libraryDocument.count({ where: { currentDirectoryId: directory.id } }) },
    ],
    referencePolicy: "checked",
  });
  if (!result.ok) throw new Error(result.error);
  return { path: command.path, name: directory.name };
}
