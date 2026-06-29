"use client";

import { createPageBody, PageSurface, createActionsSection } from "@workspace/core/ui";
import type { BodySurfaceCommandSpec } from "@workspace/core/ui";

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
