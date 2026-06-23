"use client";

import type { ReactNode } from "react";
import { ActionButton, IconActionButton } from "./ActionControls";

export interface CreateStartButtonProps {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children?: ReactNode;
}

export interface CreateConfirmActionsProps {
  onSubmit: () => void;
  onCancel: () => void;
  submitDisabled?: boolean;
  submitting?: boolean;
  submitLabel?: string;
  cancelLabel?: string;
  order?: "submit-first" | "cancel-first";
}

export function CreateStartButton({ label, active, disabled, onClick, children = "+" }: CreateStartButtonProps) {
  return (
    <IconActionButton
      label={label}
      variant={active ? "secondary" : "primary"}
      disabled={disabled || active}
      onClick={onClick}
      className="!h-9 !w-10 !px-0 !text-[11px] !leading-none"
    >
      {children}
    </IconActionButton>
  );
}

export function CreateConfirmActions({
  onSubmit,
  onCancel,
  submitDisabled,
  submitting,
  submitLabel = "创建",
  cancelLabel = "取消",
  order = "submit-first",
}: CreateConfirmActionsProps) {
  const submit = (
    <ActionButton
      key="submit"
      type="button"
      aria-label={submitLabel}
      title={submitLabel}
      disabled={submitDisabled || submitting}
      variant="primary"
      className="!h-9 !w-10 !px-0 !text-[11px] !leading-none"
      onClick={(event) => {
        event.stopPropagation();
        if (!submitDisabled && !submitting) onSubmit();
      }}
    >
      <CheckIcon />
    </ActionButton>
  );
  const cancel = (
    <ActionButton
      key="cancel"
      aria-label={cancelLabel}
      title={cancelLabel}
      onClick={(event) => {
        event.stopPropagation();
        onCancel();
      }}
      className="!h-9 !w-10 !px-0 !text-[11px] !leading-none"
    >
      <XIcon />
    </ActionButton>
  );
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2">
      {order === "cancel-first" ? [cancel, submit] : [submit, cancel]}
    </div>
  );
}

function CheckIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} viewBox="0 0 24 24">
      <path d="m5 12.5 4.2 4.2L19 7" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} viewBox="0 0 24 24">
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}
