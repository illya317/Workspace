"use client";

import { Toolbar, type ToolbarItem } from "./Toolbar";

export interface EditToolbarProps {
  editMode: boolean;
  onStartEdit: () => void;
  onSave: () => Promise<void>;
  onCancel: () => void;
  onDownload?: () => void;
  onShowHistory?: () => void;
  canEdit?: boolean;
  editLabel?: string;
  downloading?: boolean;
  saveLabel?: string;
  saving?: boolean;
}

export default function EditToolbar({
  editMode,
  onStartEdit,
  onSave,
  onCancel,
  onDownload,
  onShowHistory,
  canEdit = true,
  editLabel = "编辑",
  downloading = false,
  saveLabel = "保存",
  saving = false,
}: EditToolbarProps) {
  if (!canEdit && !onDownload) return null;

  const items: ToolbarItem[] = [];

  if (onDownload) {
    items.push({
      kind: "icon-button",
      key: "download",
      section: "edit",
      icon: "download",
      label: "下载",
      disabled: downloading,
      onClick: onDownload,
    });
  }

  if (!editMode) {
    if (canEdit) {
      items.push({
        kind: "button",
        key: "edit",
        section: "edit",
        label: editLabel,
        onClick: onStartEdit,
      });
    }
    if (canEdit && onShowHistory) {
      items.push({
        kind: "icon-button",
        key: "history",
        section: "edit",
        icon: "history",
        label: "最近改动",
        onClick: onShowHistory,
      });
    }
  } else {
    if (canEdit) {
      items.push({
        kind: "button",
        key: "save",
        section: "edit",
        label: saveLabel,
        variant: "primary",
        disabled: saving,
        onClick: onSave,
      });
      items.push({
        kind: "button",
        key: "cancel",
        section: "edit",
        label: "取消",
        onClick: onCancel,
      });
    }
    if (canEdit && onShowHistory) {
      items.push({
        kind: "icon-button",
        key: "history",
        section: "edit",
        icon: "history",
        label: "最近改动",
        onClick: onShowHistory,
      });
    }
  }

  return <Toolbar items={items} variant="inline" />;
}
