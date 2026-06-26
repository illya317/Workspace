"use client";

import type { ReactNode } from "react";
import { CommandButton } from "./CommandButton";
import { CreateStartButton } from "./CreateActionControls";

export interface DetailCreatePanelProps {
  title: string;
  createTitle?: string;
  children: ReactNode;
  createContent: ReactNode;
  creating: boolean;
  onStartCreate?: () => void;
  onSubmitCreate: () => void;
  onCancelCreate: () => void;
  canCreate?: boolean;
  addLabel?: string;
  dirty?: boolean;
  dirtyHint?: string;
  onSave?: () => void;
  canSave?: boolean;
  saveLabel?: string;
  onDelete?: () => void;
  canDelete?: boolean;
  deleteLabel?: string;
  viewActions?: ReactNode;
  submitDisabled?: boolean;
  submitting?: boolean;
  submitLabel?: string;
  cancelLabel?: string;
  className?: string;
  bodyClassName?: string;
}

export default function DetailCreatePanel({
  title,
  createTitle,
  children,
  createContent,
  creating,
  onStartCreate,
  onSubmitCreate,
  onCancelCreate,
  canCreate = true,
  addLabel = "新增",
  dirty,
  dirtyHint = "有未保存修改",
  onSave,
  canSave,
  saveLabel = "保存",
  onDelete,
  canDelete,
  deleteLabel = "删除",
  viewActions,
  submitDisabled,
  submitting,
  submitLabel = "创建",
  cancelLabel = "取消",
  className = "",
  bodyClassName = "",
}: DetailCreatePanelProps) {
  if (creating) {
    return (
      <div className={className}>
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <h3 className="truncate text-sm font-semibold text-slate-900">{createTitle ?? title}</h3>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <CommandButton variant="secondary" disabled={submitting} onClick={onCancelCreate}>
              {cancelLabel}
            </CommandButton>
            <CommandButton
              variant="primary"
              disabled={submitDisabled || submitting}
              onClick={onSubmitCreate}
            >
              {submitting ? "保存中..." : submitLabel}
            </CommandButton>
          </div>
        </div>
        <div className={bodyClassName}>{createContent}</div>
      </div>
    );
  }

  const showDefaultActions = !viewActions && (onSave || onDelete);
  return (
    <div className={className}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-slate-900">{title}</h3>
          {dirty && <p className="mt-1 text-xs text-amber-600">{dirtyHint}</p>}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {showDefaultActions && (
            <>
              {onDelete && canDelete && (
                <CommandButton variant="danger" disabled={submitting} onClick={onDelete}>
                  {deleteLabel}
                </CommandButton>
              )}
              {onSave && (
                <CommandButton variant="primary" disabled={!canSave || submitting} onClick={onSave}>
                  {submitting ? "保存中..." : saveLabel}
                </CommandButton>
              )}
            </>
          )}
          {viewActions}
          {canCreate && onStartCreate && (
            <CreateStartButton label={addLabel} disabled={submitting} onClick={onStartCreate} />
          )}
        </div>
      </div>
      <div className={bodyClassName}>{children}</div>
    </div>
  );
}
