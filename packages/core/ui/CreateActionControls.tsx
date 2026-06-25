"use client";

import { ActionButton, IconActionButton } from "./ActionControls";
import { ActionGlyph } from "./ActionGlyphs";

export interface CreateStartButtonProps {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
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

export function CreateStartButton({ label, active, disabled, onClick }: CreateStartButtonProps) {
  return (
    <IconActionButton
      kind="add"
      label={label}
      variant={active ? "secondary" : "primary"}
      disabled={disabled || active}
      onClick={onClick}
      className="!h-9 !w-10 !px-0 !text-[11px] !leading-none"
    />
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
      <ActionGlyph kind="check" className="h-4 w-4" />
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
      <ActionGlyph kind="cancel" className="h-4 w-4" />
    </ActionButton>
  );
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2">
      {order === "cancel-first" ? [cancel, submit] : [submit, cancel]}
    </div>
  );
}
