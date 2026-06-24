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
  onStartCreate: () => void;
  onSubmitCreate: () => void;
  onCancelCreate: () => void;
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
  onStartCreate,
  onSubmitCreate,
  onCancelCreate,
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
              disabled={disabled || submitting}
              onClick={onStartCreate}
            />
          )}
          {canCreate && creating && (
            <CreateConfirmActions
              onCancel={onCancelCreate}
              onSubmit={onSubmitCreate}
              submitDisabled={submitDisabled ?? disabled}
              submitting={submitting}
              submitLabel={submitLabel}
              cancelLabel={cancelLabel}
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
