import type { ButtonHTMLAttributes, ReactNode } from "react";

function joinClassNames(...classNames: Array<string | false | null | undefined>) {
  return classNames.filter(Boolean).join(" ");
}

export interface PickerActionRowProps {
  children: ReactNode;
  align?: "start" | "between";
  className?: string;
}

export function PickerActionRow({ children, align = "between", className = "" }: PickerActionRowProps) {
  return (
    <div className={joinClassNames("mb-3 flex items-center gap-2", align === "between" && "justify-between", className)}>
      {children}
    </div>
  );
}

export interface PickerOptionButtonProps extends Pick<ButtonHTMLAttributes<HTMLButtonElement>, "onMouseDown" | "onMouseEnter"> {
  children: ReactNode;
  selected?: boolean;
  onClick: () => void;
  className?: string;
  align?: "left" | "center";
  size?: "compact" | "normal";
}

export function PickerOptionButton({
  children,
  selected = false,
  onClick,
  onMouseDown,
  onMouseEnter,
  className = "",
  align = "center",
  size = "normal",
}: PickerOptionButtonProps) {
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
        selected
          ? "border-emerald-500 bg-emerald-50 text-emerald-700"
          : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50",
        className
      )}
    >
      {children}
    </button>
  );
}

export interface PickerSegmentedOption {
  label: ReactNode;
  value: string;
}

export interface PickerSegmentedControlProps {
  options: PickerSegmentedOption[];
  value?: string;
  onChange: (value: string) => void;
  className?: string;
}

export function PickerSegmentedControl({
  options,
  value,
  onChange,
  className = "",
}: PickerSegmentedControlProps) {
  return (
    <div className={joinClassNames("flex rounded-md border border-slate-200 bg-slate-50 p-0.5", className)}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={joinClassNames(
              "min-w-10 rounded px-3 py-1.5 text-xs font-semibold transition",
              selected ? "bg-white text-emerald-700 shadow-sm" : "text-slate-500 hover:text-slate-900"
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
