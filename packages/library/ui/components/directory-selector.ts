import type { SelectorSurfaceStructuredTreeItemSpec } from "@workspace/core/ui";
import type { DirectoryNode } from "@workspace/library/types";

export function declareDirectoryTreeItems(
  directories: DirectoryNode[],
  level = 1,
): SelectorSurfaceStructuredTreeItemSpec<DirectoryNode>[] {
  return directories.map((directory) => ({
    key: directory.path,
    value: directory,
    card: {
      title: directory.name,
      code: directory.path === "" ? undefined : directory.count,
      level,
    },
    children: directory.children.length > 0
      ? declareDirectoryTreeItems(directory.children, level + 1)
      : undefined,
  }));
}
