"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { workspacePath } from "@workspace/core/routing";
import {
  createDocumentSection,
  createBodySplitSection,
  createFieldsSection,
  createMessageSection,
  createPageBody,
  createStatusSection,
  PageSurface,
  useFeedback,
} from "@workspace/core/ui";
import type {
  FormSurfaceItemSpec,
  FormSurfaceReadOnlyFieldSpec,
  SurfaceToolbarActionGroupActionSpec,
  SurfaceToolbarItems,
} from "@workspace/core/ui";
import type { LibraryDocumentItem } from "@workspace/library/types";

import { archiveDocument, deleteDocumentPermanently, reviewDocument, updateDocument, useDocumentDetail, useLibraryDocumentVersions, useLibraryPdfPreview } from "../hooks/useLibraryDocuments";
import {
  LIBRARY_DOCUMENT_CONFIDENTIALITY_FIELD_OPTIONS,
  LIBRARY_DOCUMENT_CONFIDENTIALITY_OPTIONS,
  LIBRARY_DOCUMENT_STATUS_OPTIONS,
} from "./library-document-options";

interface Props {
  documentId: number;
  canUpdate?: boolean;
  canArchive?: boolean;
  canExport?: boolean;
  canConfigure?: boolean;
  canImport?: boolean;
  onDirtyChange?: (dirty: boolean) => void;
}

function fmtSize(bytes: number | null) {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  const date = new Date(iso);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function optionLabel<T extends string | number>(options: Array<{ value: T; label: string }>, value: T) {
  return options.find((option) => option.value === value)?.label || String(value);
}

function readonlyField(key: string, label: string, value: string): FormSurfaceReadOnlyFieldSpec {
  return { kind: "readonly", key, label, value, variant: "plain" };
}

function sameTags(left: string[], right: string[]) {
  return left.length === right.length && left.every((tag, index) => tag === right[index]);
}

function buildMetadataPatch(doc: LibraryDocumentItem, form: Partial<LibraryDocumentItem>) {
  const payload: Record<string, unknown> = {};
  if (form.summary !== undefined && (form.summary ?? "") !== (doc.summary ?? "")) payload.summary = form.summary ?? "";
  if (form.tags !== undefined && !sameTags(form.tags, doc.tags ?? [])) payload.tags = form.tags;
  if (form.confidentialityLevel !== undefined && form.confidentialityLevel !== doc.confidentialityLevel) payload.confidentialityLevel = form.confidentialityLevel;
  return payload;
}

export default function LibraryDocumentReader({
  documentId,
  canUpdate,
  canArchive,
  canExport,
  canConfigure,
  canImport,
  onDirtyChange,
}: Props) {
  const router = useRouter();
  const { doc, loading, setDoc } = useDocumentDetail(documentId);
  const { versions, currentVersionId, loading: versionsLoading } = useLibraryDocumentVersions(documentId);
  const [selectedVersionId, setSelectedVersionId] = useState<number | null>(null);
  const selectedVersion = versions.find((version) => version.id === selectedVersionId) ?? versions[0];
  const activeVersionId = selectedVersion?.id ?? null;
  const { previewUrl, loading: previewLoading, error: previewError } = useLibraryPdfPreview(documentId, activeVersionId);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [form, setForm] = useState<Partial<LibraryDocumentItem>>({});
  const [infoOpen, setInfoOpen] = useState(true);
  const [infoDrawerOpen, setInfoDrawerOpen] = useState(false);
  const metadataPatch = doc ? buildMetadataPatch(doc, form) : {};
  const dirty = Object.keys(metadataPatch).length > 0;
  const feedback = useFeedback({ unsavedChanges: dirty });
  const canEdit = canUpdate || canConfigure;

  useEffect(() => {
    setEditing(false);
    setForm({});
    setInfoDrawerOpen(false);
    setSelectedVersionId(null);
  }, [documentId]);

  useEffect(() => {
    if (versions.length === 0) return;
    setSelectedVersionId((current) => versions.some((version) => version.id === current)
      ? current
      : currentVersionId ?? versions[0]!.id);
  }, [currentVersionId, versions]);

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  const handleBack = async () => {
    if (!(await feedback.confirmLeave())) return;
    router.push("/library/basic-info");
  };

  const updateForm = (patch: Partial<LibraryDocumentItem>) => {
    setForm((current) => ({ ...current, ...patch }));
  };

  const handleSave = async () => {
    if (!doc || !dirty) return;
    setSaving(true);
    try {
      const updated = await updateDocument(doc.id, metadataPatch);
      setDoc(updated);
      setForm({});
      setEditing(false);
      feedback.success("保存成功");
    } catch (error) {
      feedback.error(error instanceof Error ? error.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setForm({});
    setEditing(false);
  };

  const handleArchive = async () => {
    if (!doc) return;
    const confirmed = await feedback.confirmDelete({
      message: `确定要归档「${doc.fileName || "此文件"}」吗？归档后不会永久丢失。`,
      confirmLabel: archiving ? "归档中..." : "确认归档",
    });
    if (!confirmed) return;
    setArchiving(true);
    try {
      await archiveDocument(doc.id);
      feedback.success("已归档");
      router.push("/library/basic-info");
    } catch (error) {
      feedback.error(error instanceof Error ? error.message : "归档失败");
    } finally {
      setArchiving(false);
    }
  };

  const handleReview = async () => {
    if (!doc || dirty || editing) return;
    setReviewing(true);
    try {
      const reviewed = await reviewDocument(doc.id);
      setDoc(reviewed);
      feedback.success("资料已确认入库");
    } catch (error) {
      feedback.error(error instanceof Error ? error.message : "确认入库失败");
    } finally {
      setReviewing(false);
    }
  };

  const handleDelete = async () => {
    if (!doc) return;
    const confirmed = await feedback.confirmDelete({
      message: `确定永久删除「${doc.fileName || "此文件"}」吗？原文件版本、PDF 预览和 Markdown 产物都会一并删除，且无法恢复。`,
      confirmLabel: deleting ? "删除中..." : "永久删除",
    });
    if (!confirmed) return;
    setDeleting(true);
    try {
      const result = await deleteDocumentPermanently(doc.id);
      feedback.success(result.cleanupPending ? "文件已删除，但运行态存储清理未完成" : "文件已永久删除");
      router.push("/library/basic-info");
    } catch (error) {
      feedback.error(error instanceof Error ? error.message : "删除文件失败");
    } finally {
      setDeleting(false);
    }
  };

  const currentTags = form.tags !== undefined ? form.tags : (doc?.tags ?? []);
  const setTags = (tags: string[]) => updateForm({ tags });
  const editableState = !canUpdate ? "disabled" as const : "normal" as const;
  const fields: FormSurfaceItemSpec<string>[] = !doc
    ? []
    : editing
      ? [
          {
            key: "summary",
            label: "简介",
            spec: { valueType: "string", control: "text", multiline: true, state: editableState },
            value: form.summary ?? doc.summary ?? "",
            onChange: (value) => updateForm({ summary: String(value ?? "") }),
            rows: 2,
            autoGrow: true,
          },
          {
            kind: "tagList",
            key: "tags",
            label: "标签",
            items: currentTags,
            getKey: (tag, index) => `${tag}-${index}`,
            getLabel: (tag) => tag,
            onRemove: (_, index) => setTags(currentTags.filter((__, tagIndex) => tagIndex !== index)),
            onUpdateLabel: (_, index, next) => setTags(currentTags.map((tag, tagIndex) => tagIndex === index ? next : tag)),
            disabled: !canUpdate,
            longTextMode: "wrap",
            append: !canUpdate ? undefined : {
              textInput: {
                key: "libraryTagAppend",
                placeholder: currentTags.length === 0 ? "添加标签" : "",
                splitPattern: /[,，、;；\n]+/,
                onAppend: (tags) => setTags([...currentTags, ...tags]),
                onRemoveLast: () => {
                  if (currentTags.length > 0) setTags(currentTags.slice(0, -1));
                },
              },
            },
          },
          {
            key: "confidentialityLevel",
            label: "保密等级",
            hint: !canConfigure ? "需要配置权限才能修改保密等级" : undefined,
            spec: {
              valueType: "number",
              control: "choice",
              state: !canConfigure ? "disabled" : "normal",
              options: { source: "static", items: LIBRARY_DOCUMENT_CONFIDENTIALITY_FIELD_OPTIONS },
            },
            value: String(form.confidentialityLevel ?? doc.confidentialityLevel),
            onChange: (value) => updateForm({ confidentialityLevel: Number(value) }),
          },
        ]
      : [
          readonlyField("summary", "简介", doc.summary || "—"),
          ...(doc.tags?.length
            ? [{
                kind: "tagList" as const,
                key: "tags",
                label: "标签",
                items: doc.tags,
                getKey: (tag: string, index: number) => `${tag}-${index}`,
                getLabel: (tag: string) => tag,
                longTextMode: "wrap" as const,
              }]
            : [readonlyField("tags", "标签", "未设置")]),
          readonlyField("size", "大小", fmtSize(doc.fileSizeBytes)),
          readonlyField("confidentiality", "保密等级", optionLabel(LIBRARY_DOCUMENT_CONFIDENTIALITY_OPTIONS, doc.confidentialityLevel)),
          readonlyField("status", "状态", optionLabel(LIBRARY_DOCUMENT_STATUS_OPTIONS, doc.status)),
          ...(versions.length > 1
            ? [{
                key: "version",
                label: "文件版本",
                spec: {
                  valueType: "string" as const,
                  control: "choice" as const,
                  state: versionsLoading ? "disabled" as const : "normal" as const,
                  options: {
                    source: "static" as const,
                    items: versions.map((version) => ({
                      value: String(version.id),
                      label: `${version.versionLabel || `v${version.versionNo}`}${version.id === currentVersionId ? "（当前）" : ""}`,
                    })),
                  },
                },
                value: activeVersionId ? String(activeVersionId) : "",
                onChange: (value: unknown) => setSelectedVersionId(Number(value)),
              }]
            : [readonlyField("version", "文件版本", versions[0]?.versionLabel || `v${versions[0]?.versionNo ?? doc.version}`)]),
          readonlyField("updatedAt", "更新时间", fmtDate(doc.updatedAt)),
        ];

  const navigationActions: SurfaceToolbarActionGroupActionSpec[] = [
    {
      key: "back",
      kind: "back",
      label: "返回列表",
      onClick: () => void handleBack(),
    },
  ];
  const reviewActions: SurfaceToolbarActionGroupActionSpec[] = [];
  const lifecycleActions: SurfaceToolbarActionGroupActionSpec[] = [];
  if (doc && !editing && canExport && doc.status === "active") {
    navigationActions.push({
      key: "download",
      kind: "download",
      label: activeVersionId ? "下载所选版本" : "下载原文件",
      onClick: () => window.open(workspacePath(activeVersionId
        ? `/api/modules/library/basic-info/documents/${doc.id}/versions/${activeVersionId}/download`
        : `/api/modules/library/basic-info/documents/${doc.id}/download`), "_blank", "noopener,noreferrer"),
    });
  }
  if (doc && !editing && canImport && doc.reviewStatus !== "approved") {
    reviewActions.push({
      key: "review",
      kind: "confirm",
      label: reviewing ? "确认中..." : "确认入库",
      variant: "primary",
      disabled: reviewing || dirty,
      onClick: () => void handleReview(),
    });
  }
  if (doc && !editing && canArchive) {
    lifecycleActions.push({ key: "archive", kind: "archive", label: archiving ? "归档中..." : "归档", variant: "danger", disabled: archiving, onClick: () => void handleArchive() });
  }
  if (doc && !editing && canConfigure) {
    lifecycleActions.push({ key: "delete", kind: "delete", label: deleting ? "删除中..." : "永久删除", variant: "danger", disabled: deleting, onClick: () => void handleDelete() });
  }
  const toolbarItems: SurfaceToolbarItems = [
    { kind: "action-group", key: "document-navigation", actions: navigationActions, joined: true },
    ...(doc && canEdit ? [{
      kind: "edit-group" as const,
      key: "document-edit",
      editMode: editing,
      dirty,
      editLabel: "编辑信息",
      saveLabel: saving ? "保存中..." : "保存",
      saving,
      onStartEdit: () => setEditing(true),
      onSave: handleSave,
      onCancel: handleCancel,
    }] : []),
    ...(reviewActions.length > 0 ? [{ kind: "action-group" as const, key: "document-review", actions: reviewActions }] : []),
    ...(lifecycleActions.length > 0 ? [{ kind: "action-group" as const, key: "document-lifecycle", actions: lifecycleActions, joined: true }] : []),
  ];

  const previewSection = previewLoading
    ? createStatusSection("library-preview-loading", { kind: "loading", content: "正在加载 PDF 预览…" })
    : previewUrl
      ? createDocumentSection("library-pdf-preview", {
          kind: "viewer",
          viewer: { src: previewUrl, title: `${doc?.title || doc?.fileName || "资料"} PDF 预览` },
        })
      : createStatusSection("library-preview-empty", {
          kind: "empty",
          content: previewError || "所选版本还没有生成 PDF 预览。",
        });
  const body = doc
    ? createBodySplitSection({
        left: createPageBody([
          ...(doc.reviewStatus !== "approved" ? [createMessageSection("library-review-pending", {
            tone: "warning",
            content: "请核对简介、标签与保密等级；如需调整请先编辑保存，再点击“确认入库”。",
          })] : []),
          createFieldsSection("library-document-info", fields, {
            kind: "detail",
            layout: { columns: 1 },
          }),
        ]),
        right: createPageBody([previewSection]),
        side: {
          label: "资料信息",
          open: infoOpen,
          drawerOpen: infoDrawerOpen,
          onOpenChange: setInfoOpen,
          onDrawerOpenChange: setInfoDrawerOpen,
        },
        layout: { ratio: [4, 10] },
      })
    : createPageBody([], {
        empty: { content: loading ? "正在加载资料..." : "资料不存在或无权查看", compact: true },
      });

  return <PageSurface kind="standard" toolbar={toolbarItems.length ? { items: toolbarItems } : undefined} body={body} />;
}
