"use client";

export interface CheckboxFieldProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  ariaLabel?: string;
  size?: "default" | "sm";
  className?: string;
}

export default function CheckboxField({
  checked,
  onChange,
  disabled = false,
  ariaLabel,
  size = "default",
  className = "",
}: CheckboxFieldProps) {
  const sizeClass = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";
  return (
    <input
      type="checkbox"
      checked={checked}
      disabled={disabled}
      aria-label={ariaLabel}
      onChange={(event) => onChange(event.target.checked)}
      className={`${sizeClass} rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 ${className}`}
    />
  );
}
