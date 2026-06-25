"use client";

import { getToolbarActionClassName } from "@workspace/core/ui";
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
  return <button type="button" disabled={saving !== null} onClick={onDelete} className={[getToolbarActionClassName("danger"), "px-3 py-1.5 text-xs"].filter(Boolean).join(" ")}>
      删除
    </button>;
}
