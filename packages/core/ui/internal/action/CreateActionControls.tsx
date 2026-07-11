"use client";

import { ActionButton } from "../action/ActionControls";
import { CONTROL_SIZES } from "../common/interactionTokens";
import type { ControlSize } from "../common/interactionTokens";

export interface CreateStartButtonProps {
  label: string;
  active?: boolean;
  disabled?: boolean;
  scrollOnCreate?: boolean;
  onCreateRevealIntent?: () => void;
  onClick: () => void;
  size?: ControlSize;
}

export interface CreateConfirmActionsProps {
  onSubmit: () => void;
  onCancel: () => void;
  submitDisabled?: boolean;
  submitting?: boolean;
  submitAction?: "create" | "save" | "submit";
  submitVisible?: boolean;
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

export function CreateStartButton({
  label,
  active,
  disabled,
  scrollOnCreate = true,
  onCreateRevealIntent,
  onClick,
  size = "md",
}: CreateStartButtonProps) {
  return (
    <ActionButton
      kind="add"
      label={label}
      variant={active ? "secondary" : "primary"}
      disabled={disabled || active}
      onClick={() => {
        if (scrollOnCreate) onCreateRevealIntent?.();
        onClick();
      }}
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
  submitAction = "create",
  submitVisible = true,
  submitLabel,
  cancelLabel = "取消",
  order = "submit-first",
  size = "md",
}: CreateConfirmActionsProps) {
  const sizeClasses = getIconSizeClasses(size);
  const resolvedSubmit = submitAction === "submit"
    ? { kind: "send" as const, label: "提交" }
    : submitAction === "save"
      ? { kind: "save" as const, label: "保存" }
      : { kind: "check" as const, label: "创建" };
  const submit = (
    <ActionButton
      key="submit"
      kind={resolvedSubmit.kind}
      label={submitLabel ?? resolvedSubmit.label}
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
      {submitVisible ? (order === "cancel-first" ? [cancel, submit] : [submit, cancel]) : cancel}
    </div>
  );
}
