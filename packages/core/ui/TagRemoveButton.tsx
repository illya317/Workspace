"use client";

import { joinClassNames } from "./card-utils";

export interface TagRemoveButtonProps {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}

export default function TagRemoveButton({
  label,
  onClick,
  disabled = false,
  className = "",
}: TagRemoveButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={joinClassNames(
        "grid size-4 place-items-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
    >
      ×
    </button>
  );
}
