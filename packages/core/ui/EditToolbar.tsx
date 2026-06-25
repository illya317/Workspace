"use client";

import { ActionButton, IconActionButton } from "./ActionControls";

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

  return (
    <div className="flex items-center gap-2">
      {onDownload && (
        <IconActionButton kind="download" label="下载" onClick={onDownload} disabled={downloading} />
      )}
      {!editMode ? (
        <>
          {canEdit && (
            <ActionButton onClick={onStartEdit}>
              {editLabel}
            </ActionButton>
          )}
          {canEdit && onShowHistory && (
            <IconActionButton kind="history" label="最近改动" onClick={onShowHistory} />
          )}
        </>
      ) : (
        <>
          {canEdit && (
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
            </>
          )}
          {canEdit && onShowHistory && (
            <IconActionButton kind="history" label="最近改动" onClick={onShowHistory} />
          )}
        </>
      )}
    </div>
  );
}
