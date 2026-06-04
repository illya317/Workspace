import { prisma } from "@/lib/prisma";

export interface DirectoryNode {
  path: string;
  name: string;
  count: number;
  children: DirectoryNode[];
}

export async function listDirectories(
  confidentialityFilter?: { lte: number },
): Promise<DirectoryNode[]> {
  const where: Record<string, unknown> = {};
  if (confidentialityFilter) {
    where.confidentialityLevel = confidentialityFilter;
  }
  where.directoryPath = { not: null };

  const docs = await prisma.libraryDocument.findMany({
    where,
    select: { directoryPath: true },
  });

  const countMap = new Map<string, number>();
  for (const d of docs) {
    if (!d.directoryPath) continue;
    const segments = d.directoryPath.split("/");
    let path = "";
    for (let i = 0; i < segments.length; i++) {
      path = path ? `${path}/${segments[i]}` : segments[i];
      countMap.set(path, (countMap.get(path) ?? 0) + 1);
    }
  }

  const roots: DirectoryNode[] = [];
  const nodeMap = new Map<string, DirectoryNode>();

  for (const [path, count] of countMap.entries()) {
    const segments = path.split("/");
    const name = segments[segments.length - 1];
    const node: DirectoryNode = { path, name, count, children: [] };
    nodeMap.set(path, node);

    if (segments.length === 1) {
      roots.push(node);
    } else {
      const parentPath = segments.slice(0, -1).join("/");
      const parent = nodeMap.get(parentPath);
      if (parent) {
        parent.children.push(node);
      }
    }
  }

  function sortNodes(nodes: DirectoryNode[]) {
    nodes.sort((a, b) => a.name.localeCompare(b.name, "zh"));
    for (const n of nodes) sortNodes(n.children);
  }
  sortNodes(roots);

  return roots;
}
