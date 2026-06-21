"use client";

import { ActionButton, IconActionButton } from "./ActionControls";

export interface EditToolbarProps {
  editMode: boolean;
  onStartEdit: () => void;
  onSave: () => Promise<void>;
  onCancel: () => void;
  onShowHistory?: () => void;
  canEdit?: boolean;
  editLabel?: string;
  saveLabel?: string;
  saving?: boolean;
}

export default function EditToolbar({
  editMode,
  onStartEdit,
  onSave,
  onCancel,
  onShowHistory,
  canEdit = true,
  editLabel = "编辑",
  saveLabel = "保存",
  saving = false,
}: EditToolbarProps) {
  if (!canEdit) return null;

  return (
    <div className="flex items-center gap-2">
      {!editMode ? (
        <>
          <ActionButton onClick={onStartEdit}>
            {editLabel}
          </ActionButton>
          {onShowHistory && (
            <IconActionButton label="最近改动" onClick={onShowHistory}>
              <svg className="inline h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </IconActionButton>
          )}
        </>
      ) : (
        <>
          <ActionButton onClick={onSave} disabled={saving} variant="primary" className="gap-1.5">
            {saving && (
              <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            {saveLabel}
          </ActionButton>
          <ActionButton onClick={onCancel}>
            取消
          </ActionButton>
          {onShowHistory && (
            <IconActionButton label="最近改动" onClick={onShowHistory}>
              <svg className="inline h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </IconActionButton>
          )}
        </>
      )}
    </div>
  );
}
