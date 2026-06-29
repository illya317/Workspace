"use client";

import type { ReactNode } from "react";
import { SectionCard } from "../common/BaseCards";
import { CreateConfirmActions, CreateStartButton } from "../action/CreateActionControls";
import { useCreatePanelAutoScroll } from "./useCreatePanelAutoScroll";

export type BlockCreatePanelPresentation = "block" | "modal";

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
  presentation?: BlockCreatePanelPresentation;
  modalMaxWidth?: string;
  onStartCreate: () => void;
  onSubmitCreate: () => void;
  onCancelCreate: () => void;
  scrollOnCreate?: boolean;
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
  presentation = "block",
  modalMaxWidth,
  onStartCreate,
  onSubmitCreate,
  onCancelCreate,
  scrollOnCreate = true,
  className,
  bodyClassName,
  createClassName = "rounded-lg border border-slate-200 bg-white p-3",
}: BlockCreatePanelProps) {
  const createRef = useCreatePanelAutoScroll<HTMLDivElement>(scrollOnCreate && creating);
  const renderCreateCard = (createMode: boolean) => (
    <SectionCard
      title={(
        <span className="inline-flex min-w-0 items-center gap-2 align-middle">
          <span className="truncate">{title}</span>
          {canCreate && !createMode && (
            <CreateStartButton
              label={addLabel}
              active={creating}
              disabled={disabled || submitting}
              onClick={onStartCreate}
            />
          )}
          {canCreate && createMode && (
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
        {createMode && <div ref={createRef} className={createClassName}>{createContent}</div>}
        {children}
      </div>
    </SectionCard>
  );

  if (presentation === "modal" && creating) {
    return (
      <>
        {renderCreateCard(false)}
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className={`max-h-[80vh] w-full ${modalMaxWidth ?? "max-w-2xl"} overflow-auto`}>
            {renderCreateCard(true)}
          </div>
        </div>
      </>
    );
  }

  return renderCreateCard(creating);
}
