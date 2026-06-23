"use client";

import type { ReactNode } from "react";
import { SectionCard } from "./BaseCards";
import { CreateConfirmActions, CreateStartButton } from "./CreateActionControls";

export interface BlockCreatePanelProps {
  title: string;
  children: ReactNode;
  createContent: ReactNode;
  creating: boolean;
  canCreate?: boolean;
  disabled?: boolean;
  submitting?: boolean;
  submitDisabled?: boolean;
  addLabel?: string;
  submitLabel?: string;
  cancelLabel?: string;
  editing?: boolean;
  canEdit?: boolean;
  editDisabled?: boolean;
  editSubmitDisabled?: boolean;
  editLabel?: string;
  editSubmitLabel?: string;
  editCancelLabel?: string;
  onStartCreate: () => void;
  onSubmitCreate: () => void;
  onCancelCreate: () => void;
  onStartEdit?: () => void;
  onSubmitEdit?: () => void;
  onCancelEdit?: () => void;
  className?: string;
  bodyClassName?: string;
  createClassName?: string;
}

export default function BlockCreatePanel({
  title,
  children,
  createContent,
  creating,
  canCreate = true,
  disabled,
  submitting,
  submitDisabled,
  addLabel = "新增",
  submitLabel = "创建",
  cancelLabel = "取消",
  editing = false,
  canEdit = false,
  editDisabled,
  editSubmitDisabled,
  editLabel = "编辑",
  editSubmitLabel = "保存",
  editCancelLabel = "取消",
  onStartCreate,
  onSubmitCreate,
  onCancelCreate,
  onStartEdit,
  onSubmitEdit,
  onCancelEdit,
  className,
  bodyClassName,
  createClassName = "rounded-lg border border-slate-200 bg-white p-3",
}: BlockCreatePanelProps) {
  return (
    <SectionCard
      title={(
        <span className="inline-flex min-w-0 items-center gap-2 align-middle">
          <span className="truncate">{title}</span>
          {canCreate && (
            <CreateStartButton
              label={addLabel}
              active={creating}
              disabled={disabled || submitting || editing}
              onClick={onStartCreate}
            />
          )}
          {canEdit && onStartEdit && (
            <CreateStartButton
              label={editLabel}
              active={editing}
              disabled={disabled || submitting || creating || editing || editDisabled}
              onClick={onStartEdit}
            >
              <EditIcon />
            </CreateStartButton>
          )}
          {canCreate && creating && (
            <CreateConfirmActions
              onCancel={onCancelCreate}
              onSubmit={onSubmitCreate}
              submitDisabled={submitDisabled ?? disabled}
              submitting={submitting}
              submitLabel={submitLabel}
              cancelLabel={cancelLabel}
              order="cancel-first"
            />
          )}
          {canEdit && editing && onSubmitEdit && onCancelEdit && (
            <CreateConfirmActions
              onCancel={onCancelEdit}
              onSubmit={onSubmitEdit}
              submitDisabled={editSubmitDisabled ?? disabled}
              submitting={submitting}
              submitLabel={editSubmitLabel}
              cancelLabel={editCancelLabel}
              order="cancel-first"
            />
          )}
        </span>
      )}
      className={className}
      bodyClassName={bodyClassName}
    >
      <div className="space-y-4">
        {creating && <div className={createClassName}>{createContent}</div>}
        {children}
      </div>
    </SectionCard>
  );
}

function EditIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} viewBox="0 0 24 24">
      <path d="m16.9 4.6 2.5 2.5" />
      <path d="M4.5 19.5l4.9-1 9.2-9.2a1.8 1.8 0 0 0 0-2.5l-1.4-1.4a1.8 1.8 0 0 0-2.5 0l-9.2 9.2-1 4.9z" />
    </svg>
  );
}
