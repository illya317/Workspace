"use client";

import { createPageBody, PageSurface, createActionsSection } from "@workspace/core/ui";
import type { ActionGlyphKind, BodySurfaceCommandSpec } from "@workspace/core/ui";

function profileActionIcon(key: string, label: string): ActionGlyphKind {
  if (key === "delete" || label === "删除") return "delete-bin";
  if (key === "add" || label === "新增") return "add";
  if (key === "save" || label.includes("保存")) return "save";
  if (key === "cancel" || label === "取消") return "cancel";
  if (key === "refresh" || label === "刷新") return "refresh";
  return "edit";
}

export function profileActionSpec({
  key,
  label,
  variant,
  disabled,
  onClick,
}: {
  key: string;
  label: string;
  variant: "primary" | "secondary" | "danger";
  disabled?: boolean;
  onClick: () => void | Promise<void>;
}): BodySurfaceCommandSpec {
  return {
    key,
    label,
    icon: profileActionIcon(key, label),
    variant,
    disabled,
    type: "button",
    size: "sm",

    onClick: () => void onClick(),
  };
}

export function deleteActionSpec({
  canEdit,
  saving,
  onDelete,
}: {
  canEdit: boolean;
  saving: string | null;
  onDelete: () => Promise<void>;
}): BodySurfaceCommandSpec[] {
  if (!canEdit) return [];
  return [
    profileActionSpec({
      key: "delete",
      label: "删除",
      variant: "danger",
      disabled: saving !== null,
      onClick: onDelete,
    }),
  ];
}

export function ProfileAction({
  label,
  variant,
  disabled,
  onClick,
}: {
  label: string;
  variant: "primary" | "secondary" | "danger";
  disabled?: boolean;
  onClick: () => void | Promise<void>;
}) {
  return (
    <PageSurface kind="standard"
      embedded
      body={createPageBody([createActionsSection(label, [profileActionSpec({
        key: label,
        label,
        variant,
        disabled,
        onClick,
      })])])}
    />
  );
}

export function RowActions({
  canEdit,
  saving,
  onDelete
}: {
  canEdit: boolean;
  saving: string | null;
  onDelete: () => Promise<void>;
}) {
  if (!canEdit) return null;
  return <ProfileAction label="删除" variant="danger" disabled={saving !== null} onClick={onDelete} />;
}
