"use client";

import type { MouseEvent } from "react";
import { joinClassNames } from "./card-utils";
import { useConfirmDelete, type ConfirmOptions } from "./ConfirmProvider";

export interface TagRemoveButtonProps {
  label: string;
  onConfirm?: () => void | Promise<void>;
  onClick?: () => void | Promise<void>;
  disabled?: boolean;
  confirm?: boolean;
  confirmOptions?: Partial<ConfirmOptions>;
  confirmMessage?: ConfirmOptions["message"];
  className?: string;
}

export default function TagRemoveButton({
  label,
  onConfirm,
  onClick,
  disabled = false,
  confirm = true,
  confirmOptions,
  confirmMessage,
  className = "",
}: TagRemoveButtonProps) {
  const confirmDelete = useConfirmDelete();

  async function handleClick(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (disabled) return;
    if (confirm) {
      const confirmed = await confirmDelete({
        message: confirmMessage ?? `确定${label}吗？此操作不可撤销。`,
        ...confirmOptions,
      });
      if (!confirmed) return;
    }
    await (onConfirm ?? onClick)?.();
  }

  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => void handleClick(event)}
      className={joinClassNames(
        "grid size-4 place-items-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
    >
      ×
    </button>
  );
}
