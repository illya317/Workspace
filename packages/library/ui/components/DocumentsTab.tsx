"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { workspacePath } from "@workspace/core/routing";
import { useLibraryDocuments } from "../hooks/useLibraryDocuments";
import { useLibraryFilters } from "../hooks/useLibraryFilters";
import {
  createLibraryDirectory,
  deleteLibraryDirectory,
  renameLibraryDirectory,
  useLibraryDirectories,
} from "../hooks/useLibraryDirectories";
import type { LibraryDirectoryMutationResult } from "../hooks/useLibraryDirectories";
import {
  createEmptySection,
  createMasterDetailBody,
  createPageBody,
  PageSurface,
  useFeedback,
} from "@workspace/core/ui";
import type { DataSurfaceProps, BodySurfaceSectionSpec, PageSurfaceCreateSpec, SurfaceToolbarItems } from "@workspace/core/ui";
import type { DirectoryNode, LibraryDocumentItem } from "@workspace/library/types";
import {
  LIBRARY_DOCUMENT_CONFIDENTIALITY_FILTER_OPTIONS,
  LIBRARY_DOCUMENT_STATUS_FILTER_OPTIONS,
} from "./library-document-options";
import { declareDirectoryTreeItems } from "./directory-selector";
import { createLibraryUploadSection } from "./library-upload-section";
import { createLibraryDocumentColumns } from "./library-document-columns";
import { deleteDocumentPermanently } from "../hooks/useLibraryDocuments";

interface Props {
  canUpdate?: boolean;
  canArchive?: boolean;
  canImport?: boolean;
  canExport?: boolean;
  canConfigure?: boolean;
}

const LIBRARY_PAGE_SIZE_OPTIONS = [20, 50, 100].map((size) => ({
  value: String(size),
  label: `${size}条/页`,
}));

export default function DocumentsTab({ canImport, canExport, canConfigure }: Props) {
  const router = useRouter();
  const feedback = useFeedback();
  const [folderEditor, setFolderEditor] = useState<{ mode: "create" | "rename"; path: string; parentPath: string } | null>(null);
  const [folderName, setFolderName] = useState("");
  const [folderSaving, setFolderSaving] = useState(false);
  const [deletingFolderPath, setDeletingFolderPath] = useState<string | null>(null);
  const [deletingDocumentId, setDeletingDocumentId] = useState<number | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadSummary, setUploadSummary] = useState("");
  const [uploadDirectoryPath, setUploadDirectoryPath] = useState("");
  const [uploadTags, setUploadTags] = useState<string[]>([]);
  const [uploadConfidentialityLevel, setUploadConfidentialityLevel] = useState("2");
  const [uploadSaving, setUploadSaving] = useState(false);
  const { filters, setFilter, clearFilters, page, setPage, pageSize, setPageSize } = useLibraryFilters();
  const { documents, total, loading, error, refresh: refreshDocuments } = useLibraryDocuments(filters, page, pageSize);
  const { directories, loading: dirLoading, error: dirError, refresh: refreshDirectories } = useLibraryDirectories();

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const rootDirectories = useMemo<DirectoryNode[]>(() => {
    const allRoot: DirectoryNode = {
      path: "",
      name: "全部",
      count: 0,
      children: [],
    };
    return [allRoot, ...directories];
  }, [directories]);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() => new Set());

  const handleSelectDirectory = (path: string | null) => {
    setFilter("directoryPath", path || undefined);
    if (path) setFilter("categoryCode", undefined);
  };

  const openCreateFolder = () => {
    const parentPath = filters.directoryPath || "";
    setFolderName("");
    setFolderEditor({ mode: "create", path: "", parentPath });
  };

  const openRenameFolder = (directory: DirectoryNode) => {
    setFolderName(directory.name);
    setFolderEditor({
      mode: "rename",
      path: directory.path,
      parentPath: directory.path.split("/").slice(0, -1).join("/"),
    });
  };

  const closeFolderEditor = () => {
    if (folderSaving) return;
    setFolderEditor(null);
    setFolderName("");
  };

  const resetUpload = () => {
    setUploadFile(null);
    setUploadTitle("");
    setUploadSummary("");
    setUploadDirectoryPath("");
    setUploadTags([]);
    setUploadConfidentialityLevel("2");
  };

  const openUpload = () => {
    setFolderEditor(null);
    setFolderName("");
    resetUpload();
    setUploadDirectoryPath(filters.directoryPath || "");
    setUploadOpen(true);
  };

  const closeUpload = () => {
    if (uploadSaving) return;
    setUploadOpen(false);
    resetUpload();
  };

  const selectUploadFile = (file: File | null) => {
    setUploadFile(file);
    if (file && !uploadTitle.trim()) setUploadTitle(file.name.replace(/\.[^.]+$/, ""));
  };

  const uploadDocument = async () => {
    if (!uploadFile || !uploadDirectoryPath) return;
    setUploadSaving(true);
    try {
      const body = new FormData();
      body.set("file", uploadFile);
      body.set("directoryPath", uploadDirectoryPath);
      body.set("title", uploadTitle);
      body.set("summary", uploadSummary);
      body.set("tags", JSON.stringify(uploadTags));
      body.set("confidentialityLevel", uploadConfidentialityLevel);
      const response = await fetch(workspacePath("/api/modules/library/basic-info/documents"), { method: "POST", body });
      const result = await response.json().catch(() => null) as {
        documentId?: number;
        error?: string;
        message?: string;
        pipeline?: { markdown?: { status?: string }; preview?: { status?: string } };
      } | null;
      if (!response.ok || !result?.documentId) {
        throw new Error(result?.error || result?.message || `上传失败（${response.status}）`);
      }
      const pipelineComplete = result.pipeline?.markdown?.status === "succeeded"
        && ["succeeded", "skipped"].includes(result.pipeline?.preview?.status || "");
      feedback.success(pipelineComplete ? "文件处理完成，请确认入库信息" : "文件已上传，处理结果需要复核");
      setUploadOpen(false);
      resetUpload();
      await refreshDocuments();
      router.push(`/library/basic-info/documents/${result.documentId}`);
    } catch (uploadError) {
      feedback.error(uploadError instanceof Error ? uploadError.message : "上传失败");
    } finally {
      setUploadSaving(false);
    }
  };

  const applyFolderResult = async (
    result: LibraryDirectoryMutationResult,
    parentPath: string,
    selectCreated: boolean,
  ) => {
      if (result.previousPath && filters.directoryPath && (
        filters.directoryPath === result.previousPath
        || filters.directoryPath.startsWith(`${result.previousPath}/`)
      )) {
        setFilter("directoryPath", `${result.path}${filters.directoryPath.slice(result.previousPath.length)}`);
      } else if (selectCreated) {
        setFilter("directoryPath", result.path);
      }
      setExpandedPaths((current) => {
        const next = new Set<string>();
        for (const path of current) {
          if (result.previousPath && (path === result.previousPath || path.startsWith(`${result.previousPath}/`))) {
            next.add(`${result.path}${path.slice(result.previousPath.length)}`);
          } else {
            next.add(path);
          }
        }
        if (parentPath) next.add(parentPath);
        return next;
      });
      await refreshDirectories();
  };

  const createFolder = async () => {
    if (!folderEditor || folderEditor.mode !== "create" || !folderName.trim()) return;
    const result = await createLibraryDirectory(folderEditor.parentPath, folderName);
    await applyFolderResult(result, folderEditor.parentPath, true);
    setFolderName("");
    return { outcome: "saved" as const, message: "文件夹已创建" };
  };

  const renameFolder = async () => {
    if (!folderEditor || folderEditor.mode !== "rename" || !folderName.trim()) return;
    setFolderSaving(true);
    try {
      const result = await renameLibraryDirectory(folderEditor.path, folderName);
      await applyFolderResult(result, folderEditor.parentPath, false);
      feedback.success("文件夹已重命名");
      setFolderEditor(null);
      setFolderName("");
    } catch (error) {
      feedback.error(error instanceof Error ? error.message : "文件夹操作失败");
    } finally {
      setFolderSaving(false);
    }
  };

  const deleteFolder = async (directory: DirectoryNode) => {
    const confirmed = await feedback.confirmDelete({
      message: `确定永久删除文件夹「${directory.name}」吗？只有不含资料和子文件夹的空文件夹可以删除。`,
      confirmLabel: deletingFolderPath === directory.path ? "删除中..." : "永久删除",
    });
    if (!confirmed) return;
    setDeletingFolderPath(directory.path);
    try {
      await deleteLibraryDirectory(directory.path);
      if (filters.directoryPath && (
        filters.directoryPath === directory.path
        || filters.directoryPath.startsWith(`${directory.path}/`)
      )) {
        setFilter("directoryPath", undefined);
      }
      setExpandedPaths((current) => new Set([...current].filter((path) => path !== directory.path && !path.startsWith(`${directory.path}/`))));
      await Promise.all([refreshDirectories(), refreshDocuments()]);
      feedback.success("文件夹已删除");
    } catch (error) {
      feedback.error(error instanceof Error ? error.message : "删除文件夹失败");
    } finally {
      setDeletingFolderPath(null);
    }
  };

  const deleteDocument = async (document: LibraryDocumentItem) => {
    const confirmed = await feedback.confirmDelete({
      message: `确定永久删除「${document.fileName || document.title || "此文件"}」吗？原文件版本、PDF 预览和 Markdown 产物都会一并删除，且无法恢复。`,
      confirmLabel: deletingDocumentId === document.id ? "删除中..." : "永久删除",
    });
    if (!confirmed) return;
    setDeletingDocumentId(document.id);
    try {
      const result = await deleteDocumentPermanently(document.id);
      await Promise.all([refreshDocuments(), refreshDirectories()]);
      feedback.success(result.cleanupPending ? "文件已删除，但运行态存储清理未完成" : "文件已永久删除");
    } catch (error) {
      feedback.error(error instanceof Error ? error.message : "删除文件失败");
    } finally {
      setDeletingDocumentId(null);
    }
  };

  const toolbarItems: SurfaceToolbarItems = [];
  if (canImport) {
    toolbarItems.push({
      kind: "action-group",
      key: "library-upload",
      actions: [{ key: "upload", kind: "upload", label: "上传文件", disabled: uploadOpen, onClick: openUpload }],
    });
  }
  toolbarItems.push(
    {
      kind: "search",
      key: "search",
      value: filters.keyword || "",
      onChange: (value: string) => setFilter("keyword", value || undefined),
      placeholder: "搜索",
      scope: ["标题", "文件名", "简介", "标签"],
    },
    {
      kind: "select",
      key: "status-filter",
      value: filters.status || "",
      onChange: (value: string) => setFilter("status", value || undefined),
      options: LIBRARY_DOCUMENT_STATUS_FILTER_OPTIONS.slice(1),
      placeholder: LIBRARY_DOCUMENT_STATUS_FILTER_OPTIONS[0]?.label,
    },
    {
      kind: "select",
      key: "confidentiality-filter",
      value: filters.confidentialityLevel !== undefined ? String(filters.confidentialityLevel) : "",
      onChange: (value: string) =>
        setFilter("confidentialityLevel", value ? parseInt(value, 10) : undefined),
      options: LIBRARY_DOCUMENT_CONFIDENTIALITY_FILTER_OPTIONS.slice(1),
      placeholder: LIBRARY_DOCUMENT_CONFIDENTIALITY_FILTER_OPTIONS[0]?.label,
    },
    {
      kind: "icon-button",
      key: "reset",
      icon: "reset",
      label: "清除筛选",
      onClick: clearFilters,
    },
    {
      kind: "page-size",
      key: "library-page-size",
      value: String(pageSize),
      options: LIBRARY_PAGE_SIZE_OPTIONS,
      onChange: (value: string) => setPageSize(Number(value)),
      label: "每页条数",
    },
  );
  const columns = createLibraryDocumentColumns({
    canExport,
    canConfigure,
    deletingDocumentId,
    onDelete: (document) => void deleteDocument(document),
  });
  const pageCreate: PageSurfaceCreateSpec | undefined = canConfigure ? {
          id: "library-folder-create",
          presentation: "block",
          title: "新建文件夹",
          open: folderEditor?.mode === "create",
          content: { kind: "form" as const, form: { layout: { columns: 1 as const }, items: [{
            key: "folderName",
            label: "文件夹名称",
            spec: { valueType: "string" as const, control: "text" as const, state: "required" as const },
            value: folderName,
            autoFocus: true,
            maxLength: 80,
            onChange: (value: unknown) => setFolderName(String(value ?? "")),
          }] } },
          submission: { action: "save" as const, disabled: !folderName.trim(), execute: createFolder },
          feedback: { saved: "文件夹已创建" },
          onOpenChange: (open: boolean) => { if (open) openCreateFolder(); else closeFolderEditor(); },
        } : undefined;
  const sections: BodySurfaceSectionSpec[] = [
    ...(error
      ? [createEmptySection("error", {
          compact: true,

          content: error,
        })]
      : []),
    {
      key: "documents",
      body: { kind: "data", data: ({
        kind: "table",

        rows: documents,
        columns,
        visibleColumns: columns.map((column) => column.key),
        rowKey: (document) => document.id,
        onRowClick: (document) => router.push(`/library/basic-info/documents/${document.id}`),
        loading,
        emptyText: loading ? "加载中..." : "暂无资料",
      } satisfies DataSurfaceProps<LibraryDocumentItem>) as DataSurfaceProps },
    },
  ];
  const uploadSection = createLibraryUploadSection({
    saving: uploadSaving,
    file: uploadFile,
    title: uploadTitle,
    summary: uploadSummary,
    directoryPath: uploadDirectoryPath,
    tags: uploadTags,
    confidentialityLevel: uploadConfidentialityLevel,
    directories,
    directoriesLoading: dirLoading,
    onClose: closeUpload,
    onFileChange: selectUploadFile,
    onTitleChange: setUploadTitle,
    onSummaryChange: setUploadSummary,
    onDirectoryPathChange: setUploadDirectoryPath,
    onTagsChange: setUploadTags,
    onConfidentialityLevelChange: setUploadConfidentialityLevel,
    onSubmit: () => void uploadDocument(),
  });

  return (
    <>
      <PageSurface kind="standard"
        create={uploadOpen ? undefined : pageCreate}
        toolbar={{ items: toolbarItems }}
        body={createPageBody([{
          key: "library-documents-workspace",
          body: createMasterDetailBody({
          master: { label: "目录", presentation: "compact", body: {
            kind: "selector",
            selector: {
              kind: "tree",
              items: dirError ? [] : declareDirectoryTreeItems(
                rootDirectories,
                {
                  onRename: canConfigure ? openRenameFolder : undefined,
                  onDelete: canConfigure ? (directory) => void deleteFolder(directory) : undefined,
                  inlineRename: folderEditor?.mode === "rename" ? {
                    path: folderEditor.path,
                    value: folderName,
                    saving: folderSaving,
                    onChange: setFolderName,
                    onSave: () => void renameFolder(),
                    onCancel: closeFolderEditor,
                  } : undefined,
                },
              ),
              selectedId: filters.directoryPath || "",
              onSelect: (node: DirectoryNode) => {
                handleSelectDirectory(node.path || null);
              },
              expandedIds: expandedPaths,
              onToggle: (path, expanded) => {
                const key = String(path);
                setExpandedPaths((prev) => {
                  const next = new Set(prev);
                  if (expanded) next.add(key);
                  else next.delete(key);
                  return next;
                });
              },
              loading: dirLoading,
              loadingText: "加载中...",
              emptyText: dirError ? `目录加载失败: ${dirError}` : "暂无目录",
            },
          } },
          detail: createPageBody(uploadOpen ? [uploadSection] : sections),
          mobile: { detailActive: uploadOpen, onNavigateToList: closeUpload },
          }),
        }])}
        footer={totalPages > 1 ? {
          pagination: {
            page,
            totalPages,
            total,
            onPageChange: setPage,

            compact: true,
          },
        } : undefined}
      />

    </>
  );
}
