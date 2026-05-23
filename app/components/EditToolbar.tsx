"use client";

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
          <button
            onClick={onStartEdit}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
          >
            {editLabel}
          </button>
          {onShowHistory && (
            <button
              onClick={onShowHistory}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-500 hover:bg-gray-50"
              title="编辑历史"
            >
              <svg className="h-4 w-4 inline" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </button>
          )}
        </>
      ) : (
        <>
          <button
            onClick={onSave}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-2 text-sm text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {saving && (
              <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            {saveLabel}
          </button>
          <button
            onClick={onCancel}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
          >
            取消
          </button>
          {onShowHistory && (
            <button
              onClick={onShowHistory}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-500 hover:bg-gray-50"
              title="编辑历史"
            >
              <svg className="h-4 w-4 inline" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </button>
          )}
        </>
      )}
    </div>
  );
}
