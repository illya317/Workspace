"use client";

import { ActionButton } from "@workspace/core/ui";

export function RowActions({
  canEdit,
  saving,
  onDelete,
}: {
  canEdit: boolean;
  saving: string | null;
  onDelete: () => Promise<void>;
}) {
  if (!canEdit) return null;
  return (
    <ActionButton disabled={saving !== null} onClick={onDelete} variant="danger" className="px-3 py-1.5 text-xs">
      删除
    </ActionButton>
  );
}
