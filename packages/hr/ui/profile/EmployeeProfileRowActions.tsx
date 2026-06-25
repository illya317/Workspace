"use client";

import { CommandButton } from "@workspace/core/ui";
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
  return <CommandButton variant="danger" disabled={saving !== null} onClick={onDelete} className="px-3 py-1.5 text-xs">
      删除
    </CommandButton>;
}
