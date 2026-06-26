"use client";

import { ActionButton } from "./ActionControls";
import { CONTROL_SIZES } from "./interactionTokens";
import type { ControlSize } from "./interactionTokens";

export interface CreateStartButtonProps {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  size?: ControlSize;
}

export interface CreateConfirmActionsProps {
  onSubmit: () => void;
  onCancel: () => void;
  submitDisabled?: boolean;
  submitting?: boolean;
  submitLabel?: string;
  cancelLabel?: string;
  order?: "submit-first" | "cancel-first";
  size?: ControlSize;
}

function getIconSizeClasses(size: ControlSize) {
  const t = CONTROL_SIZES[size];
  const width = size === "sm" ? "w-8" : size === "lg" ? "w-10" : size === "xl" ? "w-11" : "w-9";
  return `${t.height} ${width} !px-0 ${t.text} ${t.leading}`;
}

export function CreateStartButton({ label, active, disabled, onClick, size = "md" }: CreateStartButtonProps) {
  return (
    <ActionButton
      kind="add"
      label={label}
      variant={active ? "secondary" : "primary"}
      disabled={disabled || active}
      onClick={onClick}
      size={size}
      className={getIconSizeClasses(size)}
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
  size = "md",
}: CreateConfirmActionsProps) {
  const sizeClasses = getIconSizeClasses(size);
  const submit = (
    <ActionButton
      key="submit"
      kind="check"
      label={submitLabel}
      disabled={submitDisabled || submitting}
      variant="primary"
      size={size}
      className={sizeClasses}
      onClick={(event) => {
        event.stopPropagation();
        if (!submitDisabled && !submitting) onSubmit();
      }}
    />
  );
  const cancel = (
    <ActionButton
      key="cancel"
      kind="cancel"
      label={cancelLabel}
      size={size}
      className={sizeClasses}
      onClick={(event) => {
        event.stopPropagation();
        onCancel();
      }}
    />
  );
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2">
      {order === "cancel-first" ? [cancel, submit] : [submit, cancel]}
    </div>
  );
}
