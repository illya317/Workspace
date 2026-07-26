import { workspacePath } from "@workspace/core/routing";
import { compactFileNameForDisplay } from "@workspace/core/ui";
import type { DataSurfaceCellActionSpec, DataSurfaceColumnSpec } from "@workspace/core/ui";
import type { LibraryDocumentItem } from "@workspace/library/types";

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  const date = new Date(iso);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function createLibraryDocumentColumns(input: {
  canExport?: boolean;
  canConfigure?: boolean;
  deletingDocumentId: number | null;
  onDelete: (document: LibraryDocumentItem) => void;
}): DataSurfaceColumnSpec<LibraryDocumentItem>[] {
  return [
    {
      key: "fileName",
      label: "文件名",
      required: true,
      width: "lg",
      cell: (document) => ({
        kind: "text",
        value: compactFileNameForDisplay(document.fileName),
        title: document.fileName,
        emphasis: "medium",
        wrap: "nowrap",
      }),
    },
    {
      key: "updatedAt",
      label: "更新时间",
      defaultVisible: true,
      width: "sm",
      tone: "muted",
      cell: (document) => fmtDate(document.updatedAt),
    },
    {
      key: "tags",
      label: "标签",
      defaultVisible: true,
      cell: (document) => document.tags && document.tags.length > 0 ? ({
        kind: "group",
        items: document.tags.map((tag) => ({ kind: "badge", label: tag, tone: "sky" })),
      }) : { kind: "empty" },
    },
    {
      key: "actions",
      label: "操作",
      required: true,
      width: "xs",
      cell: (document) => {
        const actions: DataSurfaceCellActionSpec[] = [];
        if (input.canExport && document.status === "active") {
          actions.push({
            key: "download",
            label: "下载",
            icon: "download",
            onClick: () => window.open(workspacePath(`/api/modules/library/basic-info/documents/${document.id}/download`), "_blank", "noopener,noreferrer"),
            presentation: "glyph",
            size: "sm",
            stopPropagation: true,
          });
        }
        if (input.canConfigure) {
          actions.push({
            key: "delete",
            label: "永久删除",
            icon: "delete-bin",
            variant: "danger",
            disabled: input.deletingDocumentId === document.id,
            onClick: () => input.onDelete(document),
            presentation: "glyph",
            size: "sm",
            stopPropagation: true,
          });
        }
        return actions.length > 0 ? { kind: "actions", actions } : null;
      },
    },
  ];
}
