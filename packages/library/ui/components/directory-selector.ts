import type { SelectorSurfaceStructuredTreeItemSpec } from "@workspace/core/ui";
import type { DirectoryNode } from "@workspace/library/types";

interface DirectoryTreeControls {
  onRename?: (directory: DirectoryNode) => void;
  onDelete?: (directory: DirectoryNode) => void;
  inlineRename?: {
    path: string;
    value: string;
    saving: boolean;
    onChange: (value: string) => void;
    onSave: () => void;
    onCancel: () => void;
  };
}

export function declareDirectoryTreeItems(
  directories: DirectoryNode[],
  controls: DirectoryTreeControls = {},
  level = 1,
): SelectorSurfaceStructuredTreeItemSpec<DirectoryNode>[] {
  return directories.map((directory) => {
    const inlineRename = controls.inlineRename?.path === directory.path
      ? controls.inlineRename
      : undefined;
    return {
      key: directory.path,
      value: directory,
      card: {
        title: directory.name,
        code: directory.path === "" ? undefined : directory.count,
        level,
        inlineEdit: inlineRename ? {
          value: inlineRename.value,
          dirty: inlineRename.value.trim() !== directory.name,
          saving: inlineRename.saving,
          maxLength: 80,
          ariaLabel: `重命名文件夹 ${directory.name}`,
          onChange: inlineRename.onChange,
          onSave: inlineRename.onSave,
          onCancel: inlineRename.onCancel,
        } : undefined,
        actions: !inlineRename && directory.path && (controls.onRename || controls.onDelete)
          ? [
              ...(controls.onRename ? [{ key: `rename-${directory.path}`, label: "重命名文件夹", icon: "edit" as const, size: "sm" as const, onClick: () => controls.onRename?.(directory) }] : []),
              ...(controls.onDelete ? [{ key: `delete-${directory.path}`, label: "删除文件夹", icon: "delete-bin" as const, variant: "danger" as const, size: "sm" as const, onClick: () => controls.onDelete?.(directory) }] : []),
            ]
          : undefined,
      },
      children: directory.children.length > 0
        ? declareDirectoryTreeItems(directory.children, controls, level + 1)
        : undefined,
    };
  });
}
