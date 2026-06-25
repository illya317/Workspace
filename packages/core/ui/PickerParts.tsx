import type { ButtonHTMLAttributes, ReactNode } from "react";

function joinClassNames(...classNames: Array<string | false | null | undefined>) {
  return classNames.filter(Boolean).join(" ");
}

export interface PickerOptionButtonProps extends Pick<ButtonHTMLAttributes<HTMLButtonElement>, "onMouseDown" | "onMouseEnter"> {
  children: ReactNode;
  selected?: boolean;
  variant?: "default" | "placeholder";
  onClick: () => void;
  className?: string;
  align?: "left" | "center";
  size?: "compact" | "normal";
}

export function PickerOptionButton({
  children,
  selected = false,
  variant = "default",
  onClick,
  onMouseDown,
  onMouseEnter,
  className = "",
  align = "center",
  size = "normal",
}: PickerOptionButtonProps) {
  const selectedClass = variant === "placeholder"
    ? "border-slate-300 bg-slate-100 text-slate-900"
    : "border-emerald-500 bg-emerald-50 text-emerald-700";

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseDown={onMouseDown}
      onMouseEnter={onMouseEnter}
      className={joinClassNames(
        "rounded-md border font-medium transition",
        size === "compact" ? "px-3 py-1.5 text-xs" : "px-3 py-2 text-sm",
        align === "left" && "text-left",
        selected ? selectedClass : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50",
        className
      )}
    >
      {children}
    </button>
  );
}
